import type { ValueKind } from "../simpleTypes/valueKind.js";

/** A column type the table designer offers, as the DBMS spells it, and what its values are. */
export interface ColumnTypeSuggestion {
  readonly type: string;
  readonly valueKind: ValueKind;
}
