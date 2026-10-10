// The one place the plugin's refusals are built: the engine's failures translated into the contract's errors.

import type { ConnectionError } from "@db-manager/connector";
import type { ConnectionErrorKind } from "@db-manager/connector";
import type { ConstraintKind } from "@db-manager/connector";
import type { DefinitionViolation } from "@db-manager/connector";
import type { RowError } from "@db-manager/connector";
import type { RowErrorKind } from "@db-manager/connector";
import type { SchemaError } from "@db-manager/connector";
import type { SchemaErrorKind } from "@db-manager/connector";
import type { StorageError } from "@db-manager/connector";
import type { StorageErrorKind } from "@db-manager/connector";

import type { EngineFailure } from "./engine/engineMessages.js";

/** SQLite's primary result codes the plugin tells apart: the low byte of an extended code. */
const PRIMARY_CODE_MASK = 0xff;
const SQLITE_ERROR = 1;
const SQLITE_TOOBIG = 18;
const SQLITE_CONSTRAINT = 19;
const SQLITE_MISMATCH = 20;
/** SQLite's extended constraint codes. */
const CONSTRAINT_KINDS: ReadonlyMap<number, ConstraintKind> = new Map([
  [275, "check"],
  [787, "foreign-key"],
  [1299, "not-null"],
  [1555, "primary-key"],
  [2067, "unique"],
  [2579, "primary-key"],
]);
const SQLITE_CONSTRAINT_DATATYPE = 3091;

export const storageError = (kind: StorageErrorKind, message: string, cause?: unknown): StorageError => ({ kind, message, ...(cause !== undefined && { cause }) });

export const connectionError = (kind: ConnectionErrorKind, message: string, cause?: unknown): ConnectionError => ({ kind, message, ...(cause !== undefined && { cause }) });

export const schemaError = (kind: SchemaErrorKind, message: string, violations: readonly DefinitionViolation[] = [], cause?: unknown): SchemaError => ({
  kind,
  message,
  violations,
  ...(cause !== undefined && { cause }),
});

export const rowError = (kind: RowErrorKind, message: string, constraint: ConstraintKind = "other", columnNames: readonly string[] = [], cause?: unknown): RowError => ({
  kind,
  message,
  constraint,
  columnNames,
  ...(cause !== undefined && { cause }),
});

export const isEngineFailure = (error: unknown): error is EngineFailure =>
  typeof error === "object" && error !== null && "kind" in error && "statementIndex" in error;

/** Non-EngineFailure errors are bugs: thrown on as they are. */
export const storageRefusal = (error: unknown): unknown => {
  if (!isEngineFailure(error)) return error;
  switch (error.kind) {
    case "unavailable":
      return storageError("not-supported", error.message, error);
    case "connection-closed":
      return storageError("storage-refused", error.message, error);
    case "storage-busy":
    case "database-open":
      return storageError("database-busy", error.message, error);
    case "invalid-name":
    case "name-taken":
    case "database-not-found":
    case "not-a-database":
    case "access-required":
      return storageError(error.kind, error.message, error);
    default:
      return storageError("storage-refused", error.message, error);
  }
};

export const connectionRefusal = (error: unknown): unknown => {
  if (!isEngineFailure(error)) return error;
  switch (error.kind) {
    case "unavailable":
      return connectionError("not-supported", error.message, error);
    case "storage-busy":
    case "database-open":
      return connectionError("database-busy", error.message, error);
    case "database-not-found":
    case "access-required":
      return connectionError(error.kind, error.message, error);
    case "sqlite":
      return connectionError("not-a-database", `The file is not a SQLite database: ${error.message}`, error);
    default:
      return connectionError("storage-refused", error.message, error);
  }
};

/** A failure of a schema change's run: the rows break the new table, or SQLite refused the statement as written. */
export const schemaRefusal = (error: unknown): unknown => {
  if (!isEngineFailure(error)) return error;
  if (error.kind === "connection-closed") return schemaError("connection-closed", error.message, [], error);
  if (error.kind === "expectation-failed") return schemaError("data-conflict", "Rows would refer to rows that do not exist; nothing was changed", [], error);
  if (error.kind !== "sqlite" || error.code === null) return schemaError("database-failure", error.message, [], error);
  const primaryCode = error.code & PRIMARY_CODE_MASK;
  if (primaryCode === SQLITE_CONSTRAINT) return schemaError("data-conflict", `The rows do not fit the changed table: ${error.message}`, [], error);
  if (primaryCode === SQLITE_ERROR) {
    if (/no such table/i.test(error.message)) return schemaError("table-not-found", error.message, [], error);
    return schemaError("invalid-definition", error.message, [{ kind: "invalid-expression", path: "", message: error.message }], error);
  }
  return schemaError("database-failure", error.message, [], error);
};

export const rowRefusal = (error: unknown): unknown => {
  if (!isEngineFailure(error)) return error;
  if (error.kind === "connection-closed") return rowError("connection-closed", error.message, "other", [], error);
  if (error.kind === "expectation-failed") return rowError("row-not-found", "The row is no longer there", "other", [], error);
  if (error.kind !== "sqlite" || error.code === null) return rowError("database-failure", error.message, "other", [], error);
  const primaryCode = error.code & PRIMARY_CODE_MASK;
  if (error.code === SQLITE_CONSTRAINT_DATATYPE) return rowError("invalid-value", error.message, "other", readColumnNames(error.message), error);
  if (primaryCode === SQLITE_CONSTRAINT) {
    return rowError("constraint-violated", error.message, CONSTRAINT_KINDS.get(error.code) ?? "other", readColumnNames(error.message), error);
  }
  if (primaryCode === SQLITE_MISMATCH || primaryCode === SQLITE_TOOBIG) return rowError("invalid-value", error.message, "other", [], error);
  if (/no such table/i.test(error.message)) return rowError("table-not-found", error.message, "other", [], error);
  if (/no such column/i.test(error.message)) return rowError("column-not-found", error.message, "other", [], error);
  return rowError("database-failure", error.message, "other", [], error);
};

/** "UNIQUE constraint failed: orders.a, orders.b" names the columns as table.column. */
const readColumnNames = (message: string): readonly string[] => {
  const match = /failed: (.+)$/.exec(message) ?? /column (\S+)$/.exec(message);
  if (match === null) return [];
  return (match[1] ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.includes("."))
    .map((part) => part.slice(part.lastIndexOf(".") + 1));
};
