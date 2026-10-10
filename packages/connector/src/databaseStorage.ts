import type { DatabaseEntry } from "./models/databaseEntry.js";
import type { DatabaseName } from "./models/simpleTypes/databaseName.js";

/**
 * The databases a plugin keeps itself, and the files of the user's it was given to open in place, by name.
 * Every call refuses StorageError; "not-supported" where the plugin cannot do it.
 */
export interface DatabaseStorage {
  /** Every database, sorted by name. Refuses "not-supported", "database-busy" (the storage is held by another page), "storage-refused". */
  selectDatabases(): Promise<readonly DatabaseEntry[]>;

  /**
   * Creates a database, empty or from one of the descriptor's templates.
   * Refuses "invalid-name", "name-taken", "not-supported" (an unknown template), "storage-refused".
   */
  createDatabase(name: DatabaseName, templateId: string | null): Promise<DatabaseEntry>;

  /** Creates a database from a file's bytes, checked to be a database of this DBMS. Refuses "invalid-name", "name-taken", "not-a-database", "storage-refused". */
  importDatabase(name: DatabaseName, bytes: Uint8Array): Promise<DatabaseEntry>;

  /** The database as a file of the DBMS, to save. Refuses "database-not-found", "database-busy", "storage-refused". */
  exportDatabase(name: DatabaseName): Promise<Uint8Array>;

  /**
   * Asks the user for a database file of theirs and lists it, to be opened and written in place.
   * Called from a click: the browser shows its picker only then. null: the user cancelled.
   * Refuses "not-supported", "access-required" (the user did not allow writing), "not-a-database", "storage-refused".
   */
  openFile(): Promise<DatabaseEntry | null>;

  /**
   * Asks the user where to save a new database file, empty or from a template, and lists it as openFile does.
   * Called from a click. null: the user cancelled. Refuses "not-supported", "access-required", "storage-refused".
   */
  createFile(templateId: string | null): Promise<DatabaseEntry | null>;

  /** A stored database alone. Refuses "database-not-found", "invalid-name", "name-taken", "database-busy" (it is open), "not-supported" (a linked file), "storage-refused". */
  renameDatabase(name: DatabaseName, newName: DatabaseName): Promise<void>;

  /** A stored database is deleted for good; a linked file is forgotten, the file left as it is. Refuses "database-not-found", "database-busy" (it is open), "storage-refused". */
  deleteDatabase(name: DatabaseName): Promise<void>;
}
