/**
 * What is wrong with one place of a TableDraft:
 * @param invalid-name — a name the DBMS cannot take
 * @param name-taken — a table, column, constraint or index of that name exists already
 * @param column-not-found — a constraint or an index names a column the draft lacks
 * @param target-not-found — a foreign key's target table or column does not exist
 * @param column-count-mismatch — a foreign key's columns and target columns differ in number
 * @param empty — a list that needs one entry at least has none
 * @param invalid-expression — an SQL expression the DBMS does not accept
 * @param not-supported — the DBMS cannot have it so
 */
export type DefinitionViolationKind =
  | "invalid-name"
  | "name-taken"
  | "column-not-found"
  | "target-not-found"
  | "column-count-mismatch"
  | "empty"
  | "invalid-expression"
  | "not-supported";

/** One place of a draft and what is wrong with it; a refusal lists every one at once. */
export interface DefinitionViolation {
  readonly kind: DefinitionViolationKind;
  /** Where in the draft: "name", "columns.2.name", "foreignKeys.0.targetTableName", "options.strict". */
  readonly path: string;
  /** For the user, in English. */
  readonly message: string;
}
