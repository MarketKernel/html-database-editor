import type { DefinitionViolation } from "./definitionViolation.js";

/**
 * Why a SchemaService call refused; nothing changed:
 * @param not-supported — the plugin cannot make this change; message says why
 * @param table-not-found — no table or view of that name
 * @param name-taken — the new name is taken
 * @param invalid-definition — the draft breaks the DBMS's rules: every violation in violations
 * @param data-conflict — the rows break the changed table: a NOT NULL, a foreign key, a unique set; cause holds the DBMS's word
 * @param connection-closed — the connection was closed
 * @param database-failure — the DBMS failed otherwise; cause holds its error
 */
export type SchemaErrorKind =
  | "not-supported"
  | "table-not-found"
  | "name-taken"
  | "invalid-definition"
  | "data-conflict"
  | "connection-closed"
  | "database-failure";

export interface SchemaError {
  readonly kind: SchemaErrorKind;
  /** For the user, in English. */
  readonly message: string;
  /** Empty but for "invalid-definition". */
  readonly violations: readonly DefinitionViolation[];
  readonly cause?: unknown;
}
