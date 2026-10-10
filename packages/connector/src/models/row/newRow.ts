import type { CellValue } from "../simpleTypes/row/cellValue.js";
import type { ColumnName } from "../simpleTypes/columnName.js";

/** A row to create: a column left out takes its default. */
export interface NewRow {
  readonly values: Readonly<Record<ColumnName, CellValue>>;
}
