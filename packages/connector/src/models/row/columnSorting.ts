import type { ColumnName } from "../simpleTypes/columnName.js";
import type { SortOrder } from "../simpleTypes/sortOrder.js";

export interface ColumnSorting {
  readonly columnName: ColumnName;
  readonly order: SortOrder;
}
