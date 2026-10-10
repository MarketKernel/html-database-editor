// The engine's side of the protocol: runs each EngineRequest on SQLite and the database files, in the worker or in a test.
// Every value leaves as CellValue: an integer as bigint, whatever its size, read by the column's storage class.
// A committed run is saved where the database is kept: nothing to do for OPFS, the whole file for IndexedDB, the changed chunks for linked files.

import type { CellValue } from "@db-manager/connector";
import type { DatabaseEntry } from "@db-manager/connector";
import type { Database } from "@sqlite.org/sqlite-wasm";
import type { PreparedStatement } from "@sqlite.org/sqlite-wasm";
import type { Sqlite3Static } from "@sqlite.org/sqlite-wasm";

import type { DatabaseFiles } from "./databaseFiles.js";
import { engineFailure } from "./engineFailure.js";
import type { EngineFailure } from "./engineMessages.js";
import type { EngineOp } from "./engineMessages.js";
import type { EngineRequest } from "./engineMessages.js";
import type { EngineResults } from "./engineMessages.js";
import type { EngineStatement } from "./engineMessages.js";
import type { RunMode } from "./engineMessages.js";
import type { StatementResult } from "./engineMessages.js";
import { asRollbackJournalFile, isSqliteFile } from "./memoryDatabase.js";

/** The storage classes sqlite3_column_type answers. */
const SQLITE_INTEGER = 1;
const SQLITE_FLOAT = 2;
const SQLITE_TEXT = 3;
const SQLITE_BLOB = 4;
/** sqlite3_extended_result_codes: on. */
const EXTENDED_CODES_ON = 1;
const MAX_DATABASE_NAME_LENGTH = 120;
const FILE_EXTENSION = /\.(sqlite3?|db3?)$/i;

interface OpenConnection {
  readonly name: string;
  readonly database: Database;
}

// why: a unit the worker and the tests hold, kept in this -impl without a contract: a deviation recorded in ARCHITECTURE.md.
export interface EngineHost {
  /** Rejects with an EngineFailure. */
  answer<Op extends EngineOp>(request: Extract<EngineRequest, { readonly op: Op }>): Promise<EngineResults[Op]>;
}

export const buildEngineHost = (sqlite3: Sqlite3Static, files: DatabaseFiles): EngineHost => new SqliteEngineHost(sqlite3, files);

class SqliteEngineHost {
  private readonly connections = new Map<number, OpenConnection>();
  private lastConnectionId = 0;
  /** The request being answered: the next waits for it, whatever its outcome; the refusal goes to its own caller. */
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly sqlite3: Sqlite3Static,
    private readonly files: DatabaseFiles,
  ) {}

  answer<Op extends EngineOp>(request: Extract<EngineRequest, { readonly op: Op }>): Promise<EngineResults[Op]>;
  answer(request: EngineRequest): Promise<EngineResults[EngineOp]> {
    // One request at a time: a read must not meet a linked file half saved, its old snapshot stale and the new one not yet taken.
    const answered = this.pending.then(() => this.answerNow(request));
    this.pending = answered.catch(() => null);
    return answered;
  }

  private async answerNow(request: EngineRequest): Promise<EngineResults[EngineOp]> {
    switch (request.op) {
      case "select-databases":
        return this.selectDatabases();
      case "create-database":
        return this.createDatabase(request.name, request.script);
      case "import-database":
        return this.importDatabase(request.name, request.bytes);
      case "export-database":
        return this.exportDatabase(request.name);
      case "rename-database":
        return this.renameDatabase(request.name, request.newName);
      case "delete-database":
        return this.deleteDatabase(request.name);
      case "link-file":
        return this.linkFile(request.handle);
      case "create-file":
        return this.createFile(request.handle, request.script);
      case "open-database":
        return this.openDatabase(request.name);
      case "close-database":
        return this.closeDatabase(request.connectionId);
      case "run":
        return this.run(request.connectionId, request.statements, request.mode, request.isForeignKeysOff);
    }
  }

  private async selectDatabases(): Promise<readonly DatabaseEntry[]> {
    return [...(await this.files.selectEntries())].sort((first, second) => first.name.localeCompare(second.name));
  }

  private async createDatabase(name: string, script: string | null): Promise<DatabaseEntry> {
    await this.checkNewName(name);
    await this.files.reserveRoomForDatabase();
    await this.fillDatabase(name, script, true);
    return this.getEntry(name);
  }

  private async importDatabase(name: string, bytes: Uint8Array): Promise<DatabaseEntry> {
    await this.checkNewName(name);
    if (!isSqliteFile(bytes)) throw engineFailure("not-a-database", "The file is not a SQLite database");
    await this.files.importDatabase(name, asRollbackJournalFile(bytes));
    await this.checkReadable(name);
    return this.getEntry(name);
  }

  private async exportDatabase(name: string): Promise<Uint8Array> {
    await this.checkExisting(name);
    return this.files.exportDatabase(name);
  }

  private async renameDatabase(name: string, newName: string): Promise<null> {
    const entry = await this.getEntry(name);
    if (entry.kind === "linked-file") throw engineFailure("unavailable", "A file on the disk keeps its own name; rename it on the disk");
    this.checkClosed(name);
    await this.checkNewName(newName);
    await this.files.importDatabase(newName, await this.files.exportDatabase(name));
    await this.files.deleteDatabase(name);
    return null;
  }

  private async deleteDatabase(name: string): Promise<null> {
    await this.checkExisting(name);
    this.checkClosed(name);
    await this.files.deleteDatabase(name);
    return null;
  }

  private async linkFile(handle: FileSystemFileHandle): Promise<DatabaseEntry> {
    const name = await this.allocateName(handle.name);
    await this.files.linkFile(name, handle);
    await this.checkReadable(name);
    return this.getEntry(name);
  }

  private async createFile(handle: FileSystemFileHandle, script: string | null): Promise<DatabaseEntry> {
    const name = await this.allocateName(handle.name);
    await this.files.linkFile(name, handle);
    try {
      await this.fillDatabase(name, script, true);
    } catch (error) {
      await this.files.deleteDatabase(name);
      throw error;
    }
    return this.getEntry(name);
  }

  private async openDatabase(name: string): Promise<number> {
    await this.checkExisting(name);
    this.checkClosed(name);
    const database = await this.files.openDatabase(name);
    this.sqlite3.capi.sqlite3_extended_result_codes(database, EXTENDED_CODES_ON);
    try {
      database.exec("PRAGMA foreign_keys = ON");
      // Reading the schema tells a SQLite file from bytes that only start like one.
      database.exec("SELECT count(*) FROM sqlite_schema");
    } catch (error) {
      await this.files.closeDatabase(name, database);
      throw sqliteFailure(error, null);
    }
    this.lastConnectionId += 1;
    this.connections.set(this.lastConnectionId, { name, database });
    return this.lastConnectionId;
  }

  private async closeDatabase(connectionId: number): Promise<null> {
    const connection = this.connections.get(connectionId);
    if (connection === undefined) return null;
    this.connections.delete(connectionId);
    await this.files.closeDatabase(connection.name, connection.database);
    return null;
  }

  private async run(connectionId: number, statements: readonly EngineStatement[], mode: RunMode, isForeignKeysOff: boolean): Promise<readonly StatementResult[]> {
    const connection = this.connections.get(connectionId);
    if (connection === undefined) throw engineFailure("connection-closed", "The database is closed");
    const database = connection.database;
    if (isForeignKeysOff) database.exec("PRAGMA foreign_keys = OFF");
    let results: readonly StatementResult[];
    try {
      results = mode === "read" ? statements.map((statement, index) => this.runStatement(database, statement, index)) : this.runTransaction(database, statements, mode);
    } finally {
      if (isForeignKeysOff) database.exec("PRAGMA foreign_keys = ON");
    }
    if (mode === "commit") await this.files.saveDatabase(connection.name, database);
    return results;
  }

  private runTransaction(database: Database, statements: readonly EngineStatement[], mode: RunMode): readonly StatementResult[] {
    database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement, index) => this.runStatement(database, statement, index));
      database.exec(mode === "commit" ? "COMMIT" : "ROLLBACK");
      return results;
    } catch (error) {
      // SQLite may have rolled the transaction back itself already.
      if (!this.sqlite3.capi.sqlite3_get_autocommit(database)) database.exec("ROLLBACK");
      throw error;
    }
  }

  private runStatement(database: Database, statement: EngineStatement, statementIndex: number): StatementResult {
    let prepared: PreparedStatement | null = null;
    try {
      prepared = database.prepare(statement.sql);
      if (statement.params.length > 0) prepared.bind([...statement.params]);
      const rows: CellValue[][] = [];
      while (prepared.step()) rows.push(this.readRow(prepared));
      // getColumnNames throws for a statement without columns: CREATE, ALTER, DROP.
      const result: StatementResult = { columnNames: prepared.columnCount > 0 ? prepared.getColumnNames() : [], rows };
      checkExpectation(result, statement, statementIndex);
      return result;
    } catch (error) {
      throw isEngineFailure(error) ? error : sqliteFailure(error, statementIndex);
    } finally {
      prepared?.finalize();
    }
  }

  private readRow(prepared: PreparedStatement): CellValue[] {
    const values: CellValue[] = [];
    for (let index = 0; index < prepared.columnCount; index += 1) {
      values.push(this.readValue(prepared, index));
    }
    return values;
  }

  private readValue(prepared: PreparedStatement, index: number): CellValue {
    const value = prepared.get(index);
    switch (this.sqlite3.capi.sqlite3_column_type(prepared, index)) {
      case SQLITE_INTEGER:
        return typeof value === "bigint" ? value : BigInt(value as number);
      case SQLITE_FLOAT:
        return Number(value);
      case SQLITE_TEXT:
        return String(value);
      case SQLITE_BLOB:
        return value instanceof Uint8Array ? value : new Uint8Array(0);
      default:
        return null;
    }
  }

  /** Opens the database, fills it by the script, saves and closes it; a failed script leaves nothing. */
  private async fillDatabase(name: string, script: string | null, isNew: boolean): Promise<void> {
    const database = await this.files.openDatabase(name);
    try {
      if (script !== null) runScript(database, script);
      await this.files.saveDatabase(name, database);
    } catch (error) {
      await this.files.closeDatabase(name, database);
      if (isNew) await this.files.deleteDatabase(name);
      throw isEngineFailure(error) ? error : sqliteFailure(error, null);
    }
    await this.files.closeDatabase(name, database);
  }

  /** A name of the list for a file: its name without the extension, numbered when taken. */
  private async allocateName(fileName: string): Promise<string> {
    const base = fileName.replace(FILE_EXTENSION, "").slice(0, MAX_DATABASE_NAME_LENGTH) || "database";
    let name = base;
    for (let number = 2; await this.files.hasDatabase(name); number += 1) name = `${base} (${number})`;
    return name;
  }

  private async getEntry(name: string): Promise<DatabaseEntry> {
    const entry = (await this.files.selectEntries()).find((candidate) => candidate.name === name);
    if (entry === undefined) throw engineFailure("database-not-found", `There is no database named "${name}"`);
    return entry;
  }

  private async checkNewName(name: string): Promise<void> {
    if (name.trim() === "" || name !== name.trim() || name.length > MAX_DATABASE_NAME_LENGTH || /[/\\\u0000-\u001f]/.test(name)) {
      throw engineFailure("invalid-name", `"${name}" cannot be a database name: use up to ${MAX_DATABASE_NAME_LENGTH} characters, no slashes`);
    }
    if (await this.files.hasDatabase(name)) throw engineFailure("name-taken", `A database named "${name}" exists already`);
  }

  private async checkExisting(name: string): Promise<void> {
    if (!(await this.files.hasDatabase(name))) throw engineFailure("database-not-found", `There is no database named "${name}"`);
  }

  private checkClosed(name: string): void {
    if ([...this.connections.values()].some((connection) => connection.name === name)) {
      throw engineFailure("database-open", `The database "${name}" is open; close it first`);
    }
  }

  private async checkReadable(name: string): Promise<void> {
    const database = await this.files.openDatabase(name);
    try {
      database.exec("SELECT count(*) FROM sqlite_schema");
    } catch (error) {
      await this.files.closeDatabase(name, database);
      await this.files.deleteDatabase(name);
      throw engineFailure("not-a-database", `The file is not a SQLite database: ${sqliteMessage(error)}`);
    }
    await this.files.closeDatabase(name, database);
  }
}

const runScript = (database: Database, script: string): void => {
  database.exec("BEGIN");
  try {
    database.exec(script);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
};

const checkExpectation = (result: StatementResult, statement: EngineStatement, statementIndex: number): void => {
  const rowCount = result.rows.length;
  if (statement.expectation === "one-row" && rowCount !== 1) {
    throw { ...engineFailure("expectation-failed", `Expected one row, found ${rowCount}`), statementIndex };
  }
  if (statement.expectation === "no-rows" && rowCount !== 0) {
    throw { ...engineFailure("expectation-failed", `Expected no rows, found ${rowCount}`), statementIndex };
  }
};

const isEngineFailure = (error: unknown): error is EngineFailure =>
  typeof error === "object" && error !== null && "kind" in error && "statementIndex" in error;

/** SQLite3Error carries the result code; its message starts "SQLITE_X: sqlite3 result code N: ". */
const sqliteFailure = (error: unknown, statementIndex: number | null): EngineFailure => {
  const code = typeof error === "object" && error !== null && "resultCode" in error && typeof error.resultCode === "number" ? error.resultCode : null;
  return { kind: "sqlite", message: sqliteMessage(error), code, statementIndex };
};

const sqliteMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(/^SQLITE_\w+: sqlite3 result code \d+: /, "");
