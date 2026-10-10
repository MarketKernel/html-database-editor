// The worker's entry point: SQLite from the bundled bytes; the stored databases in the OPFS pool, or in IndexedDB where the page
// has no OPFS (opened from the disk); the user's linked files beside them. Bundled apart by build.mjs and started from a blob: URL.

import engineBinary from "@sqlite.org/sqlite-wasm/sqlite3.wasm";
import type { Sqlite3Static } from "@sqlite.org/sqlite-wasm";

import { openBrowserStore } from "./browserStore.js";
import type { BrowserStore } from "./browserStore.js";
import { buildCompositeDatabaseFiles } from "./compositeDatabaseFiles.js";
import type { DatabaseFiles } from "./databaseFiles.js";
import { buildEngineHost } from "./engineHost.js";
import type { EngineHost } from "./engineHost.js";
import { engineFailure } from "./engineFailure.js";
import type { EngineEnvelope } from "./engineMessages.js";
import type { EngineFailure } from "./engineMessages.js";
import type { EngineReply } from "./engineMessages.js";
import { buildIndexedDbDatabaseFiles } from "./indexedDbDatabaseFiles.js";
import { buildLinkedDatabaseFiles } from "./linkedDatabaseFiles.js";
import type { FileSliceReader } from "./pagedFile.js";
import { buildPoolDatabaseFiles } from "./poolDatabaseFiles.js";
import { instantiateSqlite } from "./sqliteEngine.js";

/** The OPFS directory the pool keeps its files in; another name would hide the databases kept so far. */
const POOL_NAME = "db-manager-sqlite";
const POOL_INITIAL_CAPACITY = 12;
/** The lock one page holds while it keeps databases in memory: a second page would write over the first one's changes. */
const MEMORY_LOCK_NAME = "db-manager-sqlite-memory";
/** What Chrome says when another page holds a file of the pool. */
const BUSY_MESSAGE_PATTERN = /Access Handles cannot be created|NoModificationAllowedError|InvalidStateError/i;
const BUSY_MESSAGE = "db-manager is open in another tab or window of this browser; close it there and try again";
/** How long a page waits for the lock: a reloaded page's old worker lets it go a moment after the new one asks. */
const LOCK_WAIT_MS = 3000;

/** The worker's synchronous file reader, which TypeScript's DOM types leave out. */
interface FileReaderSync {
  readAsArrayBuffer(blob: Blob): ArrayBuffer;
}

/** The part of the worker's global scope this file uses. */
interface WorkerScope {
  readonly FileReaderSync: new () => FileReaderSync;
  readonly indexedDB: IDBFactory;
  readonly navigator: { readonly locks?: LockManager };
  addEventListener(type: "message", listener: (event: MessageEvent<EngineEnvelope>) => void): void;
  postMessage(message: EngineReply, transfer: Transferable[]): void;
}

const scope = globalThis as unknown as WorkerScope;
let hostStart: Promise<EngineHost> | null = null;

const startHost = async (): Promise<EngineHost> => {
  const sqlite3 = await instantiateSqlite(engineBinary);
  let store: BrowserStore;
  try {
    store = await openBrowserStore(scope.indexedDB);
  } catch (error) {
    throw engineFailure("unavailable", `This browser keeps nothing for the page: ${messageOf(error)}`);
  }
  const stored = await openStoredFiles(sqlite3, store);
  return buildEngineHost(sqlite3, buildCompositeDatabaseFiles(stored, buildLinkedDatabaseFiles(sqlite3, store, readFileSlice)));
};

/** OPFS where the page has it; IndexedDB where it has not, held by one page at a time. */
const openStoredFiles = async (sqlite3: Sqlite3Static, store: BrowserStore): Promise<DatabaseFiles> => {
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: POOL_NAME, initialCapacity: POOL_INITIAL_CAPACITY });
    return buildPoolDatabaseFiles(pool);
  } catch (error) {
    if (BUSY_MESSAGE_PATTERN.test(messageOf(error))) throw engineFailure("storage-busy", BUSY_MESSAGE);
  }
  if (!(await holdMemoryLock())) throw engineFailure("storage-busy", BUSY_MESSAGE);
  return buildIndexedDbDatabaseFiles(sqlite3, store);
};

/** Takes the lock for the worker's whole life; false: another page still holds it after a wait. Without Web Locks the page goes unguarded. */
const holdMemoryLock = (): Promise<boolean> => {
  const locks = scope.navigator.locks;
  if (locks === undefined) return Promise.resolve(true);
  return new Promise((resolve) => {
    locks
      .request(MEMORY_LOCK_NAME, { signal: AbortSignal.timeout(LOCK_WAIT_MS) }, () => {
        resolve(true);
        // Held until the worker ends: the promise never settles.
        return new Promise<never>(() => undefined);
      })
      .catch(() => resolve(false));
  });
};

/** A failed start is tried again on the next request: the other page may have closed. */
const obtainHost = (): Promise<EngineHost> => {
  if (hostStart === null) {
    hostStart = startHost();
    hostStart.catch(() => (hostStart = null));
  }
  return hostStart;
};

scope.addEventListener("message", (event) => {
  const { id, request } = event.data;
  obtainHost()
    .then((host) => host.answer(request))
    .then(
      (result) => scope.postMessage({ id, result }, result instanceof Uint8Array ? [result.buffer] : []),
      (failure: unknown) => scope.postMessage({ id, failure: asEngineFailure(failure) }, []),
    );
});

/** A slice of the user's file, read at once as SQLite's VFS must: only a worker reads synchronously. */
const readFileSlice: FileSliceReader = (file, start, end) => new Uint8Array(new scope.FileReaderSync().readAsArrayBuffer(file.slice(start, end)));

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const asEngineFailure = (failure: unknown): EngineFailure =>
  typeof failure === "object" && failure !== null && "kind" in failure && "statementIndex" in failure ? (failure as EngineFailure) : engineFailure("storage", messageOf(failure));
