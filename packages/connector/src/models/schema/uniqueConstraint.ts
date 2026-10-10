import type { ColumnName } from "../simpleTypes/columnName.js";

/** Columns whose values are unique together, as a rule of the table; a null in one of them never collides. Not an index, though a DBMS may keep one for it. */
export interface UniqueConstraint {
  /** null: the DBMS names it. */
  readonly name: string | null;
  readonly columnNames: readonly ColumnName[];
}
