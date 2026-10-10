import type { CellValue } from "../simpleTypes/row/cellValue.js";
import type { ColumnName } from "../simpleTypes/columnName.js";

/** The columns to change in one row; a column left out keeps its value. Key columns may change too. */
export interface RowChange {
  readonly values: Readonly<Record<ColumnName, CellValue>>;
}
