// DatabaseFiles in the browser's IndexedDB, where the page has no OPFS (a page opened from the disk):
// each database is the bytes of its file, held in memory while open and written back whole after every change.

import type { DatabaseEntry } from "@db-manager/connector";
import type { Database } from "@sqlite.org/sqlite-wasm";
import type { Sqlite3Static } from "@sqlite.org/sqlite-wasm";

import type { BrowserStore } from "./browserStore.js";
import type { DatabaseFiles } from "./databaseFiles.js";
import { engineFailure } from "./engineFailure.js";
import { exportMemoryDatabase, openMemoryDatabase } from "./memoryDatabase.js";

const LOCATION_CAPTION = "This browser (IndexedDB)";

export const buildIndexedDbDatabaseFiles = (sqlite3: Sqlite3Static, store: BrowserStore): DatabaseFiles => new IndexedDbDatabaseFiles(sqlite3, store);

class IndexedDbDatabaseFiles {
  constructor(
    private readonly sqlite3: Sqlite3Static,
    private readonly store: BrowserStore,
  ) {}

  async selectEntries(): Promise<readonly DatabaseEntry[]> {
    const names = await this.store.selectDatabaseNames();
    return Promise.all(
      names.map(async (name) => ({ name, kind: "stored" as const, locationCaption: LOCATION_CAPTION, sizeBytes: (await this.store.findDatabaseBytes(name))?.byteLength ?? null })),
    );
  }

  async hasDatabase(name: string): Promise<boolean> {
    return (await this.store.selectDatabaseNames()).includes(name);
  }

  async reserveRoomForDatabase(): Promise<void> {
    // IndexedDB grows as it is written.
  }

  async openDatabase(name: string): Promise<Database> {
    const bytes = await this.store.findDatabaseBytes(name);
    if (bytes === null) await this.store.saveDatabaseBytes(name, new Uint8Array(0));
    return openMemoryDatabase(this.sqlite3, bytes ?? new Uint8Array(0));
  }

  async saveDatabase(name: string, database: Database): Promise<void> {
    await this.store.saveDatabaseBytes(name, exportMemoryDatabase(this.sqlite3, database));
  }

  async closeDatabase(_name: string, database: Database): Promise<void> {
    database.close();
  }

  async importDatabase(name: string, bytes: Uint8Array): Promise<void> {
    await this.store.saveDatabaseBytes(name, new Uint8Array(bytes));
  }

  async exportDatabase(name: string): Promise<Uint8Array> {
    return (await this.store.findDatabaseBytes(name)) ?? new Uint8Array(0);
  }

  async deleteDatabase(name: string): Promise<void> {
    await this.store.deleteDatabaseBytes(name);
  }

  async linkFile(): Promise<void> {
    throw engineFailure("unavailable", "IndexedDB keeps no links");
  }
}
