import type { DatabaseConnection } from "@db-manager/connector";
import type { PluginDescriptor } from "@db-manager/connector";

import type { ClipboardService } from "./clipboardService.js";
import type { ContextMenu } from "./contextMenu.js";
import type { DatabaseCloseObserver } from "./databaseCloseObserver.js";
import type { DialogService } from "./dialogService.js";
import type { FileService } from "./fileService.js";
import type { Notifier } from "./notifier.js";
import type { SettingsStore } from "./settingsStore.js";

/**
 * One open database: the table list on the left, the chosen table's rows on the right, and below them, split off,
 * a tab per foreign key that refers to the table, each the rows referring to the chosen row.
 * The bar holds the database's caption, the settings and "Close".
 */
export interface DatabaseScreen {
  readonly element: HTMLElement;
  /** Loads the tables and opens the first, or the one the user left last. */
  load(): Promise<void>;
}

export interface DatabaseScreenDeps {
  readonly connection: DatabaseConnection;
  readonly descriptor: PluginDescriptor;
  readonly settingsStore: SettingsStore;
  readonly dialogService: DialogService;
  readonly contextMenu: ContextMenu;
  readonly notifier: Notifier;
  readonly clipboardService: ClipboardService;
  readonly fileService: FileService;
  readonly version: string;
}

/** The screen assembles its parts (TableCatalog, TableListPanel, RowGrid, ReferencingPanel, RowForm, ReferencePicker, TableDesigner, RowTitleService, TableViewStore) itself. */
export type DatabaseScreenFactory = (document: Document, deps: DatabaseScreenDeps, observer: DatabaseCloseObserver) => DatabaseScreen;
