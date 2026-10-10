import type { ColumnName } from "../simpleTypes/columnName.js";
import type { SortOrder } from "../simpleTypes/sortOrder.js";

/** One key of an index: a column, or an expression over the row as SQL text. */
export type IndexPart =
  | { readonly kind: "column"; readonly columnName: ColumnName; readonly order: SortOrder }
  | { readonly kind: "expression"; readonly expression: string; readonly order: SortOrder };
