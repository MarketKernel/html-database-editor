import type { TableName } from "@db-manager/connector";

import type { ContextMenu } from "./contextMenu.js";
import type { Notifier } from "./notifier.js";
import type { TableCatalog } from "./tableCatalog.js";
import type { TableListObserver } from "./tableListObserver.js";

/** The left pane: the tables, then the views, filtered by a typed text; "New table", and a menu per table. */
export interface TableListPanel {
  readonly element: HTMLElement;
  /** Reads the tables afresh from the catalog; a refusal is shown by the notifier. */
  load(): Promise<void>;
  /** Marks the table shown on the right; null: none. */
  markChosen(tableName: TableName | null): void;
}

export interface TableListPanelDeps {
  readonly tableCatalog: TableCatalog;
  readonly contextMenu: ContextMenu;
  readonly notifier: Notifier;
}

export type TableListPanelFactory = (document: Document, deps: TableListPanelDeps, observer: TableListObserver) => TableListPanel;
