import type { CellValue } from "./models/simpleTypes/row/cellValue.js";
import type { ColumnName } from "./models/simpleTypes/columnName.js";
import type { NewRow } from "./models/row/newRow.js";
import type { Row } from "./models/row/row.js";
import type { RowChange } from "./models/row/rowChange.js";
import type { RowKey } from "./models/simpleTypes/row/rowKey.js";
import type { RowPage } from "./models/row/rowPage.js";
import type { RowPageRequest } from "./models/row/rowPageRequest.js";
import type { TableName } from "./models/simpleTypes/schema/tableName.js";

/** The rows of one open database's tables. Every call refuses RowError; every write is all or nothing. */
export interface RowService {
  /** One page of the rows meeting every condition, sorted. Refuses "table-not-found", "column-not-found". */
  getRowPage(tableName: TableName, request: RowPageRequest): Promise<RowPage>;

  /**
   * For each tuple of values, the first row whose columns hold them, in the order given; null where none does.
   * A tuple with a null in it matches no row. What a reference shows of its target, and what a picker marks.
   * Refuses "table-not-found", "column-not-found".
   */
  selectMatchingRows(tableName: TableName, columnNames: readonly ColumnName[], valueTuples: readonly (readonly CellValue[])[]): Promise<readonly (Row | null)[]>;

  /** Creates the rows in order, all or none, and hands them back as read. Refuses "table-not-found", "read-only", "column-not-found", "constraint-violated", "invalid-value". */
  createRows(tableName: TableName, rows: readonly NewRow[]): Promise<readonly Row[]>;

  /** Changes one row and hands it back as read. Refuses "table-not-found", "read-only", "row-not-found", "column-not-found", "constraint-violated", "invalid-value". */
  updateRow(tableName: TableName, key: RowKey, change: RowChange): Promise<Row>;

  /** Deletes the rows, all or none. Refuses "table-not-found", "read-only", "row-not-found" (the first key missing), "constraint-violated" (a reference to one remains). */
  deleteRows(tableName: TableName, keys: readonly RowKey[]): Promise<void>;
}
