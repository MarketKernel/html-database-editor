// DatabaseFiles of both kinds as one list: the linked files by their names, every other name the stored files'.

import type { DatabaseEntry } from "@db-manager/connector";
import type { Database } from "@sqlite.org/sqlite-wasm";

import type { DatabaseFiles } from "./databaseFiles.js";

export const buildCompositeDatabaseFiles = (stored: DatabaseFiles, linked: DatabaseFiles): DatabaseFiles => new CompositeDatabaseFiles(stored, linked);

class CompositeDatabaseFiles {
  constructor(
    private readonly stored: DatabaseFiles,
    private readonly linked: DatabaseFiles,
  ) {}

  async selectEntries(): Promise<readonly DatabaseEntry[]> {
    return [...(await this.stored.selectEntries()), ...(await this.linked.selectEntries())];
  }

  async hasDatabase(name: string): Promise<boolean> {
    return (await this.linked.hasDatabase(name)) || (await this.stored.hasDatabase(name));
  }

  reserveRoomForDatabase(): Promise<void> {
    return this.stored.reserveRoomForDatabase();
  }

  async openDatabase(name: string): Promise<Database> {
    return (await this.route(name)).openDatabase(name);
  }

  async saveDatabase(name: string, database: Database): Promise<void> {
    await (await this.route(name)).saveDatabase(name, database);
  }

  async closeDatabase(name: string, database: Database): Promise<void> {
    await (await this.route(name)).closeDatabase(name, database);
  }

  importDatabase(name: string, bytes: Uint8Array): Promise<void> {
    return this.stored.importDatabase(name, bytes);
  }

  async exportDatabase(name: string): Promise<Uint8Array> {
    return (await this.route(name)).exportDatabase(name);
  }

  async deleteDatabase(name: string): Promise<void> {
    await (await this.route(name)).deleteDatabase(name);
  }

  linkFile(name: string, handle: FileSystemFileHandle): Promise<void> {
    return this.linked.linkFile(name, handle);
  }

  private async route(name: string): Promise<DatabaseFiles> {
    return (await this.linked.hasDatabase(name)) ? this.linked : this.stored;
  }
}
