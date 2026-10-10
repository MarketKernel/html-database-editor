// What the plugin's main side asks of the SQLite engine and what it answers, across a worker's postMessage or a direct call.
// why: the plugin's own inner protocol, kept in this -impl without a contract: a deviation recorded in ARCHITECTURE.md.

import type { CellValue } from "@db-manager/connector";
import type { DatabaseEntry } from "@db-manager/connector";

/** What a statement's rows must be, else the run fails "expectation-failed" and its changes are rolled back. */
export type StatementExpectation = "any" | "one-row" | "no-rows";

/** One SQL statement and its parameters, bound by position. */
export interface EngineStatement {
  readonly sql: string;
  readonly params: readonly CellValue[];
  readonly expectation: StatementExpectation;
}

/** The rows of one statement, every value as CellValue: integers as bigint, always. */
export interface StatementResult {
  readonly columnNames: readonly string[];
  readonly rows: readonly (readonly CellValue[])[];
}

/**
 * How the statements of one run are applied:
 * @param read — no transaction; for reading
 * @param commit — in one transaction, committed
 * @param rollback — in one transaction, rolled back: a dry run
 */
export type RunMode = "read" | "commit" | "rollback";

export type EngineRequest =
  | { readonly op: "select-databases" }
  | { readonly op: "create-database"; readonly name: string; readonly script: string | null }
  | { readonly op: "import-database"; readonly name: string; readonly bytes: Uint8Array }
  | { readonly op: "export-database"; readonly name: string }
  | { readonly op: "rename-database"; readonly name: string; readonly newName: string }
  | { readonly op: "delete-database"; readonly name: string }
  | { readonly op: "link-file"; readonly handle: FileSystemFileHandle }
  | { readonly op: "create-file"; readonly handle: FileSystemFileHandle; readonly script: string | null }
  | { readonly op: "open-database"; readonly name: string }
  | { readonly op: "close-database"; readonly connectionId: number }
  | {
      readonly op: "run";
      readonly connectionId: number;
      readonly statements: readonly EngineStatement[];
      readonly mode: RunMode;
      /** Foreign keys off around the transaction: a table rebuilt; SQLite cannot switch them inside one. */
      readonly isForeignKeysOff: boolean;
    };

export type EngineOp = EngineRequest["op"];

/** The answer to each request. */
export interface EngineResults {
  readonly "select-databases": readonly DatabaseEntry[];
  readonly "create-database": DatabaseEntry;
  readonly "import-database": DatabaseEntry;
  readonly "export-database": Uint8Array;
  readonly "rename-database": null;
  readonly "delete-database": null;
  readonly "link-file": DatabaseEntry;
  readonly "create-file": DatabaseEntry;
  readonly "open-database": number;
  readonly "close-database": null;
  readonly run: readonly StatementResult[];
}

/**
 * Why the engine refused:
 * @param unavailable — the engine or its storage cannot start here
 * @param storage-busy — another page holds the storage
 * @param invalid-name / database-not-found / name-taken / database-open — by the database's name
 * @param not-a-database — the bytes are not a SQLite file
 * @param sqlite — SQLite refused a statement: code is its extended result code
 * @param expectation-failed — a statement's rows were not what it expected
 * @param connection-closed — no open connection of that id
 * @param access-required — the user has not allowed the page to read and write the file
 * @param storage — the browser's file system refused
 */
export type EngineFailureKind =
  | "unavailable"
  | "storage-busy"
  | "invalid-name"
  | "database-not-found"
  | "name-taken"
  | "database-open"
  | "not-a-database"
  | "sqlite"
  | "expectation-failed"
  | "connection-closed"
  | "access-required"
  | "storage";

/** A refusal of the engine, a plain object so it crosses postMessage. */
export interface EngineFailure {
  readonly kind: EngineFailureKind;
  readonly message: string;
  /** SQLite's extended result code for "sqlite"; null otherwise. */
  readonly code: number | null;
  /** The statement of the run that failed; null outside a run. */
  readonly statementIndex: number | null;
}

/** A request on its way to a worker, numbered to match its answer. */
export interface EngineEnvelope {
  readonly id: number;
  readonly request: EngineRequest;
}

/** A worker's answer to the request of the same id. */
export type EngineReply =
  | { readonly id: number; readonly result: EngineResults[EngineOp] }
  | { readonly id: number; readonly failure: EngineFailure };
