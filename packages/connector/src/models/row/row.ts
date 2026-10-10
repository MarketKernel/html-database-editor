import type { CellValue } from "../simpleTypes/row/cellValue.js";
import type { ColumnName } from "../simpleTypes/columnName.js";
import type { RowKey } from "../simpleTypes/row/rowKey.js";

/** One row as read. */
export interface Row {
  /** By the table's RowIdentity; null when it is "none". */
  readonly key: RowKey | null;
  /** One entry per column of the table, in column order. */
  readonly values: Readonly<Record<ColumnName, CellValue>>;
}
