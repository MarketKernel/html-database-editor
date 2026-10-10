import type { RowKey } from "@db-manager/connector";
import type { TableName } from "@db-manager/connector";

import type { GridView } from "./gridView.js";
import type { ReferencingTabView } from "./referencingTabView.js";

/** How the user left one table while the database is open: its grid, the chosen row, the referencing tabs. Kept in memory only. */
export interface TableView {
  readonly tableName: TableName;
  readonly grid: GridView;
  /** null: no row chosen. */
  readonly chosenRowKey: RowKey | null;
  /** The referencing tab shown, by ReferencingTabView#tabId; null: the first. */
  readonly activeTabId: string | null;
  readonly tabs: readonly ReferencingTabView[];
}
