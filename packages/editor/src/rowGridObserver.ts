import type { Row } from "@db-manager/connector";
import type { TableName } from "@db-manager/connector";

import type { GridView } from "./models/gridView.js";

/** What a grid tells the screen. */
export interface RowGridObserver {
  /** The row the user chose, or null when the choice was cleared or the row left the page. */
  chooseRow(row: Row | null): void;
  /** The filter, the sorting or the page changed. */
  changeView(view: GridView): void;
  /** The user asked to open the row a reference points at. */
  openReferencedRow(tableName: TableName, row: Row): void;
  /** Rows were written: grids of other tables may show them. */
  changeRows(tableName: TableName): void;
}
