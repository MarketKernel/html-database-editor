// A SQLite database held in memory, read from and written to the bytes of its file.

import type { Database } from "@sqlite.org/sqlite-wasm";
import type { Sqlite3Static } from "@sqlite.org/sqlite-wasm";

/** sqlite3_deserialize's flags: SQLite frees the buffer on close and may grow it. */
const DESERIALIZE_FREE_ON_CLOSE = 1;
const DESERIALIZE_RESIZEABLE = 2;
/** The header's file format bytes: 2 is WAL, which a database in memory cannot open; set back to 1, legacy. */
const WRITE_VERSION_OFFSET = 18;
const READ_VERSION_OFFSET = 19;
const WAL_FORMAT = 2;
const LEGACY_FORMAT = 1;
/** "SQLite format 3\0", the first bytes of every SQLite file. */
const SQLITE_HEADER = "SQLite format 3\u0000";

/** An empty database for no bytes. Throws SQLite's error for bytes it cannot read. */
export const openMemoryDatabase = (sqlite3: Sqlite3Static, bytes: Uint8Array): Database => {
  const database = new sqlite3.oo1.DB(":memory:");
  if (bytes.byteLength === 0) return database;
  const fileBytes = asRollbackJournalFile(bytes);
  const pointer = sqlite3.wasm.allocFromTypedArray(fileBytes);
  const code = sqlite3.capi.sqlite3_deserialize(database, "main", pointer, fileBytes.byteLength, fileBytes.byteLength, DESERIALIZE_FREE_ON_CLOSE | DESERIALIZE_RESIZEABLE);
  database.checkRc(code);
  return database;
};

export const exportMemoryDatabase = (sqlite3: Sqlite3Static, database: Database): Uint8Array => sqlite3.capi.sqlite3_js_db_export(database);

export const isSqliteFile = (bytes: Uint8Array): boolean =>
  bytes.byteLength >= SQLITE_HEADER.length && [...SQLITE_HEADER].every((character, index) => bytes[index] === character.charCodeAt(0));

export const asRollbackJournalFile = (bytes: Uint8Array): Uint8Array => {
  if (bytes[WRITE_VERSION_OFFSET] !== WAL_FORMAT && bytes[READ_VERSION_OFFSET] !== WAL_FORMAT) return bytes;
  const copy = new Uint8Array(bytes);
  copy[WRITE_VERSION_OFFSET] = LEGACY_FORMAT;
  copy[READ_VERSION_OFFSET] = LEGACY_FORMAT;
  return copy;
};
