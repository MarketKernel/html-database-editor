// The plugin as the tests open it: the engine in-process, its database files in memory, the engine from the package's own sqlite3.wasm.

import { readFileSync } from "node:fs";

import type { ConnectorPlugin } from "@db-manager/connector";
import type { DatabaseConnection } from "@db-manager/connector";
import type { Sqlite3Static } from "@sqlite.org/sqlite-wasm";

import type { BrowserStore } from "../src/engine/browserStore.js";
import { buildCompositeDatabaseFiles } from "../src/engine/compositeDatabaseFiles.js";
import type { EngineClient } from "../src/engine/engineClient.js";
import { buildEngineHost } from "../src/engine/engineHost.js";
import { buildIndexedDbDatabaseFiles } from "../src/engine/indexedDbDatabaseFiles.js";
import { buildLinkedDatabaseFiles } from "../src/engine/linkedDatabaseFiles.js";
import type { FileSliceReader } from "../src/engine/pagedFile.js";
import type { FileAccess } from "../src/fileAccess.js";
import { instantiateSqlite } from "../src/engine/sqliteEngine.js";
import { createSqlitePlugin } from "../src/sqlitePlugin.js";

const ENGINE_BINARY = new Uint8Array(readFileSync(new URL(import.meta.resolve("@sqlite.org/sqlite-wasm/sqlite3.wasm"))));
const engine: Promise<Sqlite3Static> = instantiateSqlite(ENGINE_BINARY);
/** BrowserStore in maps: what IndexedDB keeps, without IndexedDB. */
class MemoryBrowserStore implements BrowserStore {
  private readonly databases = new Map<string, Uint8Array>();
  private readonly links = new Map<string, FileSystemFileHandle>();

  async selectDatabaseNames(): Promise<readonly string[]> {
    return [...this.databases.keys()];
  }

  async findDatabaseBytes(name: string): Promise<Uint8Array | null> {
    return this.databases.get(name) ?? null;
  }

  async saveDatabaseBytes(name: string, bytes: Uint8Array): Promise<void> {
    this.databases.set(name, bytes);
  }

  async deleteDatabaseBytes(name: string): Promise<void> {
    this.databases.delete(name);
  }

  async selectLinkNames(): Promise<readonly string[]> {
    return [...this.links.keys()];
  }

  async findLink(name: string): Promise<FileSystemFileHandle | null> {
    return this.links.get(name) ?? null;
  }

  async saveLink(name: string, handle: FileSystemFileHandle): Promise<void> {
    this.links.set(name, handle);
  }

  async deleteLink(name: string): Promise<void> {
    this.links.delete(name);
  }
}

/** A file of the user's on a disk that is a byte array; writable once its permission is granted. */
export class MemoryFileHandle {
  readonly kind = "file";
  permission: PermissionState = "granted";
  /** How many writes were put in place: a file taken before the last one is stale, as Chrome's is. */
  version = 0;
  writeCount = 0;
  /** The most bytes read at once, and written into the file by the writes put in place. */
  largestReadBytes = 0;
  writtenBytes = 0;

  constructor(
    readonly name: string,
    public bytes: Uint8Array,
  ) {}

  async getFile(): Promise<MemoryFile> {
    return new MemoryFile(this, this.bytes, this.version);
  }

  async createWritable(options?: { keepExistingData?: boolean }): Promise<MemoryWritable> {
    if (this.permission !== "granted") throw new DOMException("not allowed", "NotAllowedError");
    return new MemoryWritable(this, options?.keepExistingData === true ? new Uint8Array(this.bytes) : new Uint8Array(0));
  }
}

/** A snapshot of a MemoryFileHandle, as File is of a file on the disk. */
export class MemoryFile {
  constructor(
    private readonly handle: MemoryFileHandle,
    private readonly bytes: Uint8Array,
    private readonly version: number,
  ) {}

  get size(): number {
    return this.bytes.byteLength;
  }

  /** Chrome refuses to read a file changed since it was taken. */
  readSlice(start: number, end: number): Uint8Array {
    if (this.handle.version !== this.version) throw new DOMException("changed", "NotReadableError");
    this.handle.largestReadBytes = Math.max(this.handle.largestReadBytes, end - start);
    return this.bytes.slice(start, end);
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.readSlice(0, this.size).buffer as ArrayBuffer;
  }
}

/** A stream into a MemoryFileHandle, put in place whole on close, as Chrome's swap file is. */
class MemoryWritable {
  private writtenBytes = 0;

  constructor(
    private readonly handle: MemoryFileHandle,
    private written: Uint8Array,
  ) {}

  async write(data: Uint8Array | { type: "write"; position: number; data: Uint8Array }): Promise<void> {
    const position = data instanceof Uint8Array ? 0 : data.position;
    const bytes = data instanceof Uint8Array ? data : data.data;
    if (position + bytes.byteLength > this.written.byteLength) this.resize(position + bytes.byteLength);
    this.written.set(bytes, position);
    this.writtenBytes += bytes.byteLength;
  }

  async truncate(sizeBytes: number): Promise<void> {
    this.resize(sizeBytes);
  }

  async close(): Promise<void> {
    this.handle.bytes = this.written;
    this.handle.version += 1;
    this.handle.writeCount += 1;
    this.handle.writtenBytes += this.writtenBytes;
  }

  private resize(sizeBytes: number): void {
    const resized = new Uint8Array(sizeBytes);
    resized.set(this.written.subarray(0, Math.min(sizeBytes, this.written.byteLength)));
    this.written = resized;
  }
}

/** Reads a MemoryFile's slice, as FileReaderSync reads a File's in the worker. */
const readMemoryFileSlice: FileSliceReader = (file, start, end) => (file as unknown as MemoryFile).readSlice(start, end);

/** FileAccess whose pickers answer the handles queued for them. */
export class QueuedFileAccess implements FileAccess {
  readonly hasPickers = true;
  readonly openQueue: MemoryFileHandle[] = [];
  readonly saveQueue: MemoryFileHandle[] = [];

  constructor(private readonly store: BrowserStore) {}

  async pickFileToOpen(): Promise<FileSystemFileHandle | null> {
    return (this.openQueue.shift() as unknown as FileSystemFileHandle | undefined) ?? null;
  }

  async pickFileToSave(): Promise<FileSystemFileHandle | null> {
    return (this.saveQueue.shift() as unknown as FileSystemFileHandle | undefined) ?? null;
  }

  async obtainWriteAccess(handle: FileSystemFileHandle): Promise<boolean> {
    return (handle as unknown as MemoryFileHandle).permission === "granted";
  }

  findLinkedFile(name: string): Promise<FileSystemFileHandle | null> {
    return this.store.findLink(name);
  }
}

export interface TestPlugin {
  readonly plugin: ConnectorPlugin;
  readonly fileAccess: QueuedFileAccess;
}

/** The plugin as on a page opened from the disk: stored databases in IndexedDB (here maps), linked files beside them. */
export const openTestPluginWithFiles = async (): Promise<TestPlugin> => {
  const sqlite3 = await engine;
  const store = new MemoryBrowserStore();
  const files = buildCompositeDatabaseFiles(buildIndexedDbDatabaseFiles(sqlite3, store), buildLinkedDatabaseFiles(sqlite3, store, readMemoryFileSlice));
  const host = buildEngineHost(sqlite3, files);
  const client: EngineClient = { send: (request) => host.answer(request) };
  const fileAccess = new QueuedFileAccess(store);
  return { plugin: createSqlitePlugin(client, fileAccess, ""), fileAccess };
};

export const openTestPlugin = async (): Promise<ConnectorPlugin> => (await openTestPluginWithFiles()).plugin;

/** The bytes of a database made by the script, as another program would have made it. */
export const createDatabaseBytes = async (script: string): Promise<Uint8Array> => {
  const sqlite3 = await engine;
  const database = new sqlite3.oo1.DB(":memory:");
  database.exec(script);
  const bytes = sqlite3.capi.sqlite3_js_db_export(database);
  database.close();
  return bytes;
};

/** A fresh plugin with the demo database created and opened. */
export const openDemoDatabase = async (): Promise<DatabaseConnection> => {
  const plugin = await openTestPlugin();
  await plugin.storage.createDatabase("shop", "demo");
  return plugin.connect({ database: "shop" });
};

/** A fresh plugin with a database made by the script, as another program would have made it. */
export const openScriptedDatabase = async (script: string): Promise<DatabaseConnection> => {
  const bytes = await createDatabaseBytes(script);
  const plugin = await openTestPlugin();
  await plugin.storage.importDatabase("scripted", bytes);
  return plugin.connect({ database: "scripted" });
};

/** The kind of a refusal, to assert on; the call must refuse. */
export const refusalKind = async (call: Promise<unknown>): Promise<string> => {
  try {
    await call;
  } catch (error) {
    if (typeof error === "object" && error !== null && "kind" in error) return String(error.kind);
    throw error;
  }
  throw new Error("The call did not refuse");
};
