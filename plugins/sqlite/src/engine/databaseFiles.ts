// Where the engine keeps its databases: OPFS or IndexedDB for the stored ones, the user's own files for the linked ones.
// why: a unit EngineHost holds, kept in this -impl without a contract: a deviation recorded in ARCHITECTURE.md.

import type { DatabaseEntry } from "@db-manager/connector";
import type { Database } from "@sqlite.org/sqlite-wasm";

export interface DatabaseFiles {
  /** Every database kept, unsorted. */
  selectEntries(): Promise<readonly DatabaseEntry[]>;
  hasDatabase(name: string): Promise<boolean>;
  /** Makes room for one more stored database before openDatabase creates it. */
  reserveRoomForDatabase(): Promise<void>;
  /** Opens the database; a stored one is created empty where there is none. */
  openDatabase(name: string): Promise<Database>;
  /** Writes the changes where the database is kept; nothing to do where SQLite writes in place. */
  saveDatabase(name: string, database: Database): Promise<void>;
  /** Closes what openDatabase opened. */
  closeDatabase(name: string, database: Database): Promise<void>;
  /** Keeps the bytes, a checked SQLite file, as a stored database. */
  importDatabase(name: string, bytes: Uint8Array): Promise<void>;
  exportDatabase(name: string): Promise<Uint8Array>;
  /** A stored database is deleted, a linked file forgotten. */
  deleteDatabase(name: string): Promise<void>;
  /** Lists the user's file under the name, its bytes a SQLite file or none. Rejects with an EngineFailure. */
  linkFile(name: string, handle: FileSystemFileHandle): Promise<void>;
}
