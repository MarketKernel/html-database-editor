// SQLite's VFS over the user's linked files: each database a PagedFile read from its file as SQLite asks, never whole,
// so a file of any size opens; its journal and temporary files in memory alone. SQLite calls every method synchronously.

import type { Database } from "@sqlite.org/sqlite-wasm";
import type { Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import type { WasmPointer } from "@sqlite.org/sqlite-wasm";

import { createPagedFile } from "./pagedFile.js";
import type { FileChanges } from "./pagedFile.js";
import type { FileSliceReader } from "./pagedFile.js";
import type { PagedFile } from "./pagedFile.js";

/** The VFS's name, numbered where an engine has one already: each plugin of the tests installs its own. */
const VFS_NAME = "db-manager-linked";
const MAX_PATHNAME = 1024;
const SECTOR_BYTES = 4096;
/** sqlite3_vfs version 2 has xCurrentTimeInt64; io methods version 1 need no shared memory, as there is no WAL. */
const VFS_VERSION = 2;
const IO_METHODS_VERSION = 1;
/** oo1.DB's mode: read and write, never create; a database's file is in the VFS before it is opened. */
const OPEN_MODE = "w";
const PATH_PREFIX = "/";
/** SQLite's flags of sqlite3_vfs_register: not the default VFS. */
const NOT_DEFAULT = 0;

/** A file SQLite has open, by its sqlite3_file pointer. */
interface OpenFile {
  readonly path: string | null;
  readonly file: PagedFile;
  readonly isDeletedOnClose: boolean;
}

/** The default VFS's members the package's types leave out: its clock, randomness and sleep are borrowed. */
interface BorrowedVfsMembers {
  $xRandomness: WasmPointer;
  $xSleep: WasmPointer;
  $xCurrentTimeInt64: WasmPointer;
}

// why: a unit LinkedDatabaseFiles holds, kept in this -impl without a contract: a deviation recorded in ARCHITECTURE.md.
export interface LinkedFileVfs {
  /** Opens the file as the database of the name, read page by page; a file of no bytes is an empty database. Throws SQLite's error. */
  openDatabase(name: string, file: Blob): Database;
  /** The database's changes not yet in its file; null: none. */
  obtainChanges(name: string): FileChanges | null;
  /** The database's file with its changes written: read from it from now on. */
  setSavedFile(name: string, file: Blob): void;
  closeDatabase(name: string, database: Database): void;
}

export const installLinkedFileVfs = (sqlite3: Sqlite3Static, readSlice: FileSliceReader): LinkedFileVfs => {
  const files = new Map<string, PagedFile>();
  const vfsName = registerVfs(sqlite3, files, readSlice);
  return new SqliteLinkedFileVfs(sqlite3, readSlice, files, vfsName);
};

class SqliteLinkedFileVfs {
  constructor(
    private readonly sqlite3: Sqlite3Static,
    private readonly readSlice: FileSliceReader,
    private readonly files: Map<string, PagedFile>,
    private readonly vfsName: string,
  ) {}

  openDatabase(name: string, file: Blob): Database {
    const path = toPath(name);
    this.files.set(path, createPagedFile(file, this.readSlice));
    try {
      return new this.sqlite3.oo1.DB(path, OPEN_MODE, this.vfsName);
    } catch (error) {
      this.files.delete(path);
      throw error;
    }
  }

  obtainChanges(name: string): FileChanges | null {
    return this.getFile(name).obtainChanges();
  }

  setSavedFile(name: string, file: Blob): void {
    this.getFile(name).setSource(file);
  }

  closeDatabase(name: string, database: Database): void {
    database.close();
    this.files.delete(toPath(name));
  }

  private getFile(name: string): PagedFile {
    const file = this.files.get(toPath(name));
    if (file === undefined) throw new Error(`The database "${name}" is not open in the VFS`);
    return file;
  }
}

/** Registers the VFS over the files, journals created in memory beside them; answers the name it took. */
const registerVfs = (sqlite3: Sqlite3Static, files: Map<string, PagedFile>, readSlice: FileSliceReader): string => {
  const { capi, wasm } = sqlite3;
  const openFiles = new Map<WasmPointer, OpenFile>();
  const heapRange = (pointer: WasmPointer, byteCount: number): Uint8Array => wasm.heap8u().subarray(Number(pointer), Number(pointer) + byteCount);
  const openFileAt = (pointer: WasmPointer): OpenFile => {
    const openFile = openFiles.get(pointer);
    if (openFile === undefined) throw new Error("SQLite named a file the VFS has not opened");
    return openFile;
  };

  const ioMethods = new capi.sqlite3_io_methods();
  ioMethods.iVersion = IO_METHODS_VERSION;
  ioMethods.installMethods({
    xCheckReservedLock: (_file: WasmPointer, resultPointer: WasmPointer) => {
      wasm.poke32(resultPointer, 0);
      return capi.SQLITE_OK;
    },
    xClose: (file: WasmPointer) => {
      const openFile = openFiles.get(file);
      openFiles.delete(file);
      if (openFile?.isDeletedOnClose === true && openFile.path !== null) files.delete(openFile.path);
      return capi.SQLITE_OK;
    },
    xDeviceCharacteristics: () => 0,
    xFileControl: () => capi.SQLITE_NOTFOUND,
    xFileSize: (file: WasmPointer, sizePointer: WasmPointer) =>
      guarded(capi.SQLITE_IOERR_FSTAT, () => {
        wasm.poke64(sizePointer, BigInt(openFileAt(file).file.sizeBytes));
        return capi.SQLITE_OK;
      }),
    // One page holds the worker's databases; nothing else reaches them through this VFS.
    xLock: () => capi.SQLITE_OK,
    xUnlock: () => capi.SQLITE_OK,
    xRead: (file: WasmPointer, target: WasmPointer, byteCount: number, offset: number | bigint) =>
      guarded(capi.SQLITE_IOERR_READ, () => {
        const bytes = heapRange(target, byteCount);
        const readCount = openFileAt(file).file.readInto(bytes, Number(offset));
        if (readCount === byteCount) return capi.SQLITE_OK;
        bytes.fill(0, readCount);
        return capi.SQLITE_IOERR_SHORT_READ;
      }),
    xSectorSize: () => SECTOR_BYTES,
    // The file is written when LinkedDatabaseFiles saves the database: a sync has nothing to flush.
    xSync: () => capi.SQLITE_OK,
    xTruncate: (file: WasmPointer, sizeBytes: number | bigint) =>
      guarded(capi.SQLITE_IOERR_TRUNCATE, () => {
        openFileAt(file).file.truncate(Number(sizeBytes));
        return capi.SQLITE_OK;
      }),
    xWrite: (file: WasmPointer, source: WasmPointer, byteCount: number, offset: number | bigint) =>
      guarded(capi.SQLITE_IOERR_WRITE, () => {
        openFileAt(file).file.write(heapRange(source, byteCount), Number(offset));
        return capi.SQLITE_OK;
      }),
  });

  const vfs = new capi.sqlite3_vfs();
  vfs.$iVersion = VFS_VERSION;
  vfs.$szOsFile = capi.sqlite3_file.prototype.structInfo.sizeof;
  vfs.$mxPathname = MAX_PATHNAME;
  vfs.$zName = wasm.allocCString(freeVfsName(sqlite3), false);
  borrowDefaultVfsMembers(sqlite3, vfs as unknown as BorrowedVfsMembers);
  vfs.installMethods({
    xAccess: (_vfs: WasmPointer, name: WasmPointer, _flags: number, resultPointer: WasmPointer) => {
      wasm.poke32(resultPointer, files.has(wasm.cstrToJs(name) ?? "") ? 1 : 0);
      return capi.SQLITE_OK;
    },
    xDelete: (_vfs: WasmPointer, name: WasmPointer) => {
      files.delete(wasm.cstrToJs(name) ?? "");
      return capi.SQLITE_OK;
    },
    xFullPathname: (_vfs: WasmPointer, name: WasmPointer, outputSize: number, output: WasmPointer) =>
      wasm.cstrncpy(output, name, outputSize) < outputSize ? capi.SQLITE_OK : capi.SQLITE_CANTOPEN,
    xOpen: (_vfs: WasmPointer, name: WasmPointer, file: WasmPointer, flags: number, flagsPointer: WasmPointer) => {
      // No name: a temporary file, gone when closed.
      const path = Number(name) === 0 ? null : wasm.cstrToJs(name);
      let pagedFile = path === null ? undefined : files.get(path);
      if (pagedFile === undefined) {
        if ((flags & capi.SQLITE_OPEN_CREATE) === 0) return capi.SQLITE_CANTOPEN;
        pagedFile = createPagedFile(null, readSlice);
        if (path !== null) files.set(path, pagedFile);
      }
      openFiles.set(file, { path, file: pagedFile, isDeletedOnClose: (flags & capi.SQLITE_OPEN_DELETEONCLOSE) !== 0 });
      const sqliteFile = new capi.sqlite3_file(file);
      sqliteFile.$pMethods = ioMethods.pointer;
      sqliteFile.dispose();
      if (Number(flagsPointer) !== 0) wasm.poke32(flagsPointer, flags);
      return capi.SQLITE_OK;
    },
  });
  sqlite3.capi.sqlite3_vfs_register(vfs, NOT_DEFAULT);
  return wasm.cstrToJs(vfs.$zName) ?? VFS_NAME;
};

/** The browser's refusal, a file changed or no longer reachable, becomes SQLite's I/O error, which fails the statement. */
const guarded = (failureCode: number, action: () => number): number => {
  try {
    return action();
  } catch {
    // why: a throw through SQLite's C frames leaves the engine in an undefined state; the result code is the only way out.
    return failureCode;
  }
};

const freeVfsName = (sqlite3: Sqlite3Static): string => {
  let name = VFS_NAME;
  for (let number = 2; sqlite3.capi.sqlite3_vfs_find(name) !== 0; number += 1) name = `${VFS_NAME}-${number}`;
  return name;
};

const borrowDefaultVfsMembers = (sqlite3: Sqlite3Static, target: BorrowedVfsMembers): void => {
  const defaultVfs = new sqlite3.capi.sqlite3_vfs(sqlite3.capi.sqlite3_vfs_find(null));
  const borrowed = defaultVfs as unknown as BorrowedVfsMembers;
  target.$xRandomness = borrowed.$xRandomness;
  target.$xSleep = borrowed.$xSleep;
  target.$xCurrentTimeInt64 = borrowed.$xCurrentTimeInt64;
  defaultVfs.dispose();
};

const toPath = (name: string): string => `${PATH_PREFIX}${name}`;
