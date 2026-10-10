import type { ConstraintKind } from "./constraintKind.js";

/**
 * Why a RowService call refused; nothing changed:
 * @param not-supported — the plugin cannot do it for this table
 * @param table-not-found — no table or view of that name
 * @param column-not-found — a request names a column the table lacks
 * @param row-not-found — no row of the key given
 * @param read-only — the table's rows cannot be written: a view, a table with RowIdentity "none"
 * @param constraint-violated — a written row broke a rule of the table: constraint and columnNames say which
 * @param invalid-value — a value the DBMS refused as it stands
 * @param connection-closed — the connection was closed
 * @param database-failure — the DBMS failed otherwise; cause holds its error
 */
export type RowErrorKind =
  | "not-supported"
  | "table-not-found"
  | "column-not-found"
  | "row-not-found"
  | "read-only"
  | "constraint-violated"
  | "invalid-value"
  | "connection-closed"
  | "database-failure";

export interface RowError {
  readonly kind: RowErrorKind;
  /** For the user, in English. */
  readonly message: string;
  /** For "constraint-violated"; "other" otherwise. */
  readonly constraint: ConstraintKind;
  /** The columns the DBMS named for the refusal; empty where it named none. */
  readonly columnNames: readonly string[];
  readonly cause?: unknown;
}
