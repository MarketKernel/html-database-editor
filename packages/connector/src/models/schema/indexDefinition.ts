import type { IndexPart } from "./indexPart.js";

/** An index of the table: an object of the DBMS that speeds up reading, unique or not. */
export interface IndexDefinition {
  readonly name: string;
  /** In key order; at least one. */
  readonly parts: readonly IndexPart[];
  readonly isUnique: boolean;
  /** A partial index: only the rows meeting this SQL condition; null: every row. */
  readonly whereExpression: string | null;
}
