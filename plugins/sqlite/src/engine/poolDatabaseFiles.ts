// DatabaseFiles over SQLite's "opfs-sahpool" VFS: files in the origin's private file system, held by this worker alone.
// It needs no SharedArrayBuffer, so no cross-origin isolation, but it runs only in a worker and only in one page at a time.

import type { DatabaseEntry } from "@db-manager/connector";
import type { Database } from "@sqlite.org/sqlite-wasm";
import type { SAHPoolUtil } from "@sqlite.org/sqlite-wasm";

import type { DatabaseFiles } from "./databaseFiles.js";
import { engineFailure } from "./engineFailure.js";

/** The pool's files are paths; a database's journal sits beside it under a suffix. */
const PATH_PREFIX = "/";
const COMPANION_SUFFIXES: readonly string[] = ["-journal", "-wal", "-shm"];
/** Each database needs a slot for itself and one for its journal, plus room for a temporary file. */
const SLOTS_PER_DATABASE = 2;
const SPARE_SLOTS = 4;
const LOCATION_CAPTION = "This browser (OPFS)";

export const buildPoolDatabaseFiles = (pool: SAHPoolUtil): DatabaseFiles => new PoolDatabaseFiles(pool);

class PoolDatabaseFiles {
  constructor(private readonly pool: SAHPoolUtil) {}

  async selectEntries(): Promise<readonly DatabaseEntry[]> {
    return this.selectNames().map((name) => ({ name, kind: "stored", locationCaption: LOCATION_CAPTION, sizeBytes: null }));
  }

  async hasDatabase(name: string): Promise<boolean> {
    return this.selectNames().includes(name);
  }

  async reserveRoomForDatabase(): Promise<void> {
    const databaseCount = this.selectNames().length + 1;
    await this.pool.reserveMinimumCapacity(databaseCount * SLOTS_PER_DATABASE + SPARE_SLOTS);
  }

  async openDatabase(name: string): Promise<Database> {
    return new this.pool.OpfsSAHPoolDb(toPath(name));
  }

  async saveDatabase(): Promise<void> {
    // SQLite has written the file itself.
  }

  async closeDatabase(_name: string, database: Database): Promise<void> {
    database.close();
  }

  async importDatabase(name: string, bytes: Uint8Array): Promise<void> {
    await this.reserveRoomForDatabase();
    await this.pool.importDb(toPath(name), bytes);
  }

  async exportDatabase(name: string): Promise<Uint8Array> {
    return this.pool.exportFile(toPath(name));
  }

  async deleteDatabase(name: string): Promise<void> {
    this.pool.unlink(toPath(name));
  }

  async linkFile(): Promise<void> {
    throw engineFailure("unavailable", "The OPFS pool keeps no links");
  }

  private selectNames(): readonly string[] {
    return this.pool
      .getFileNames()
      .filter((path) => path.startsWith(PATH_PREFIX) && !COMPANION_SUFFIXES.some((suffix) => path.endsWith(suffix)))
      .map((path) => path.slice(PATH_PREFIX.length));
  }
}

const toPath = (name: string): string => `${PATH_PREFIX}${name}`;
