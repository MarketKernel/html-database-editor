import type { TableName } from "@db-manager/connector";

import type { TableView } from "./models/tableView.js";

/** How the user left each table while the database is open, in memory; forgotten when it closes. */
export interface TableViewStore {
  /** The table's view; the first page by the key, nothing chosen, where the user left none. */
  obtainView(tableName: TableName): TableView;
  saveView(view: TableView): void;
  /** A table renamed or dropped. */
  forgetView(tableName: TableName): void;
}

export type TableViewStoreFactory = () => TableViewStore;
