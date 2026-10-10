// DatabaseFiles over the user's own files, picked in the browser's file picker: the handles kept in IndexedDB,
// each file read page by page through LinkedFileVfs, never whole, and its changed chunks written into it after every change:
// Chrome lets a page write such a file only asynchronously, through a stream it puts in place whole when closed.

import type { DatabaseEntry } from "@db-manager/connector";
import type { Database } from "@sqlite.org/sqlite-wasm";
import type { Sqlite3Static } from "@sqlite.org/sqlite-wasm";

import type { BrowserStore } from "./browserStore.js";
import type { DatabaseFiles } from "./databaseFiles.js";
import { engineFailure } from "./engineFailure.js";
import type { EngineFailure } from "./engineMessages.js";
import { installLinkedFileVfs } from "./linkedFileVfs.js";
import type { LinkedFileVfs } from "./linkedFileVfs.js";
import { isSqliteFile } from "./memoryDatabase.js";
import type { FileSliceReader } from "./pagedFile.js";

/** The names of the DOMException the browser throws for a file it no longer has, and for one it does not let the page reach. */
const NOT_FOUND_ERROR = "NotFoundError";
const ACCESS_ERRORS: ReadonlySet<string> = new Set(["NotAllowedError", "SecurityError"]);
/** What Chrome throws for a file it cannot read whole: too large for one buffer, or changed since it was picked. */
const NOT_READABLE_ERROR = "NotReadableError";
/** The bytes isSqliteFile looks at. */
const HEADER_BYTES = 16;

export const buildLinkedDatabaseFiles = (sqlite3: Sqlite3Static, store: BrowserStore, readSlice: FileSliceReader): DatabaseFiles =>
  new LinkedDatabaseFiles(store, installLinkedFileVfs(sqlite3, readSlice), readSlice);

class LinkedDatabaseFiles {
  constructor(
    private readonly store: BrowserStore,
    private readonly vfs: LinkedFileVfs,
    private readonly readSlice: FileSliceReader,
  ) {}

  async selectEntries(): Promise<readonly DatabaseEntry[]> {
    const names = await this.store.selectLinkNames();
    const entries: DatabaseEntry[] = [];
    for (const name of names) {
      const handle = await this.store.findLink(name);
      // A file's size needs the user's leave, which a list asks no one for.
      entries.push({ name, kind: "linked-file", locationCaption: `${handle?.name ?? name} on the disk`, sizeBytes: null });
    }
    return entries;
  }

  async hasDatabase(name: string): Promise<boolean> {
    return (await this.store.findLink(name)) !== null;
  }

  async reserveRoomForDatabase(): Promise<void> {
    // The file is the user's: its room is the disk's.
  }

  async openDatabase(name: string): Promise<Database> {
    const handle = await this.getHandle(name);
    return this.vfs.openDatabase(name, await openFile(handle));
  }

  async saveDatabase(name: string, _database: Database): Promise<void> {
    const changes = this.vfs.obtainChanges(name);
    if (changes === null) return;
    const handle = await this.getHandle(name);
    try {
      // Kept data: only the changed chunks are written; Chrome swaps the file in whole on close, so a failure leaves it as it was.
      const writable = await handle.createWritable({ keepExistingData: true });
      for (const chunk of changes.chunks) await writable.write({ type: "write", position: chunk.position, data: chunk.bytes });
      await writable.truncate(changes.sizeBytes);
      await writable.close();
    } catch (error) {
      throw fileFailure(handle.name, error);
    }
    // The file read so far is stale once written: Chrome refuses to read it again.
    this.vfs.setSavedFile(name, await openFile(handle));
  }

  async closeDatabase(name: string, database: Database): Promise<void> {
    this.vfs.closeDatabase(name, database);
  }

  async importDatabase(): Promise<void> {
    throw engineFailure("unavailable", "A linked file is opened, not imported");
  }

  async exportDatabase(name: string): Promise<Uint8Array> {
    return readFile(await this.getHandle(name));
  }

  async deleteDatabase(name: string): Promise<void> {
    await this.store.deleteLink(name);
  }

  async linkFile(name: string, handle: FileSystemFileHandle): Promise<void> {
    const file = await openFile(handle);
    if (file.size > 0 && !isSqliteFile(this.readHeader(handle.name, file))) throw engineFailure("not-a-database", `"${handle.name}" is not a SQLite database`);
    await this.store.saveLink(name, handle);
  }

  private async getHandle(name: string): Promise<FileSystemFileHandle> {
    const handle = await this.store.findLink(name);
    if (handle === null) throw engineFailure("database-not-found", `There is no database named "${name}"`);
    return handle;
  }

  private readHeader(fileName: string, file: Blob): Uint8Array {
    try {
      return this.readSlice(file, 0, Math.min(file.size, HEADER_BYTES));
    } catch (error) {
      throw fileFailure(fileName, error);
    }
  }
}

const openFile = async (handle: FileSystemFileHandle): Promise<File> => {
  try {
    return await handle.getFile();
  } catch (error) {
    throw fileFailure(handle.name, error);
  }
};

const readFile = async (handle: FileSystemFileHandle): Promise<Uint8Array> => {
  const file = await openFile(handle);
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    if (error instanceof DOMException && error.name === NOT_READABLE_ERROR) {
      throw engineFailure("storage", `Chrome cannot read "${handle.name}" whole (${file.size} bytes) to export it; copy the file on the disk instead`);
    }
    throw fileFailure(handle.name, error);
  }
};

/** The browser's refusal as the engine's; anything but a DOMException is a bug and goes on. */
const fileFailure = (fileName: string, error: unknown): unknown => {
  if (!(error instanceof DOMException)) return error;
  const failure = (kind: EngineFailure["kind"], message: string): EngineFailure => engineFailure(kind, message);
  if (error.name === NOT_FOUND_ERROR) return failure("database-not-found", `The file "${fileName}" is no longer there`);
  if (ACCESS_ERRORS.has(error.name)) return failure("access-required", `Chrome needs your leave to open "${fileName}": click it in the list`);
  return failure("storage", `The browser refused the file "${fileName}": ${error.message}`);
};
