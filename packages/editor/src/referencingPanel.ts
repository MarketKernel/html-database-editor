import type { Row } from "@db-manager/connector";
import type { TableDefinition } from "@db-manager/connector";

import type { Notifier } from "./notifier.js";
import type { ReferencingPanelObserver } from "./referencingPanelObserver.js";
import type { RowGrid } from "./rowGrid.js";
import type { TableCatalog } from "./tableCatalog.js";
import type { TableView } from "./models/tableView.js";

/**
 * The lower part of the right pane: a tab per foreign key, of any table, that refers to the shown table; under the tabs
 * the rows whose foreign key columns hold the chosen row's target columns, every pair. Created there, a row starts with them.
 */
export interface ReferencingPanel {
  readonly element: HTMLElement;
  /** The tab shown now, by ReferencingTabView#tabId; null: none. Where the grid's view under it is kept. */
  readonly activeTabId: string | null;
  /** Whether the table has tabs: the screen splits the right pane only then. Rejects with the plugin's SchemaError. */
  hasTabs(definition: TableDefinition): Promise<boolean>;
  /** Shows the tabs for the chosen row, null: none chosen; the active tab and the tabs' views from the table's view. */
  show(definition: TableDefinition, chosenRow: Row | null, view: TableView): void;
  /** Reads the active tab's rows again. */
  reload(): void;
}

export interface ReferencingPanelDeps {
  readonly tableCatalog: TableCatalog;
  /** The grid under the tabs; it tells its view to the panel's observer through the screen. */
  readonly rowGrid: RowGrid;
  readonly notifier: Notifier;
}

export type ReferencingPanelFactory = (document: Document, deps: ReferencingPanelDeps, observer: ReferencingPanelObserver) => ReferencingPanel;
