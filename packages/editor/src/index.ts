// @db-manager/editor — db-manager's screen over any connector plugin of @db-manager/connector.
// Bound in host/src/serviceFactory.ts: the host binds DbManagerApp alone; editor-impl assembles the other parts.
// ABSENCE IS null ON EVERY OUTPUT.
//
// Parts, and what each holds:
//   StartScreen         a plugin, its databases (create, import, export, rename, delete), its connection fields: SettingsStore, FileService, DialogService, ContextMenu, Notifier
//   DatabaseScreen      one open database: TableCatalog, TableListPanel, RowGrid ×2, ReferencingPanel, RowForm, ReferencePicker, TableDesigner, RowTitleService, TableViewStore
//   TableCatalog        the schema read once until it changes: SchemaService
//   RowTitleService     how a referred row is named: RowService, TableCatalog, SettingsStore
//   TableListPanel      the left pane, tables then views, a menu per table: TableCatalog, ContextMenu, Notifier
//   RowGrid             a page of rows, selected, edited, copied, pasted: RowService, TableCatalog, RowTitleService, RowForm, ReferencePicker, ContextMenu, DialogService, ClipboardService, Notifier, SettingsStore
//   ReferencingPanel    a tab per foreign key referring to the shown table, the rows referring to the chosen row: TableCatalog, RowGrid, Notifier
//   RowForm             a row in a dialog, a foreign key's columns set at once: RowService, TableCatalog, RowTitleService, ReferencePicker, FileService, DialogService, Notifier
//   ReferencePicker     the drop-down of a reference: RowService, TableCatalog, RowTitleService, Notifier
//   TableDesigner       creates or changes a table, its plan previewed: SchemaService, TableCatalog, DialogService, Notifier
//   ContextMenu, Notifier, DialogService, ClipboardService, FileService   the page's own menu, toasts, dialogs, clipboard and files
//   SettingsStore       the editor's settings in localStorage; TableViewStore  how each table was left, in memory
//
// Flows:
//   StartScreen      -> ConnectionObserver        a database opened: the app shows DatabaseScreen; a refusal goes back to StartScreen
//   DatabaseScreen   -> DatabaseCloseObserver     the database closed: the app shows StartScreen
//   TableListPanel   -> TableListObserver         a table chosen, created, edited, renamed, dropped, its statement shown
//   RowGrid          -> RowGridObserver           a row chosen opens its referencing tabs; a view changed is kept in TableViewStore; a reference followed opens its table
//   ReferencingPanel -> ReferencingPanelObserver  a tab chosen is kept in the table's view
//   TableDesigner    -> the resolved table name   the catalog forgets, the list reloads, the table opens

// Contracts
export type { DbManagerApp } from "./dbManagerApp.js";
export type { DbManagerAppDeps } from "./dbManagerApp.js";
export type { DbManagerAppFactory } from "./dbManagerApp.js";

// Parts
export type { StartScreen } from "./startScreen.js";
export type { StartScreenDeps } from "./startScreen.js";
export type { StartScreenFactory } from "./startScreen.js";
export type { ConnectionObserver } from "./connectionObserver.js";
export type { DatabaseScreen } from "./databaseScreen.js";
export type { DatabaseScreenDeps } from "./databaseScreen.js";
export type { DatabaseScreenFactory } from "./databaseScreen.js";
export type { DatabaseCloseObserver } from "./databaseCloseObserver.js";
export type { TableCatalog } from "./tableCatalog.js";
export type { TableCatalogFactory } from "./tableCatalog.js";
export type { RowTitleService } from "./rowTitleService.js";
export type { RowTitleServiceDeps } from "./rowTitleService.js";
export type { RowTitleServiceFactory } from "./rowTitleService.js";
export type { TableListPanel } from "./tableListPanel.js";
export type { TableListPanelDeps } from "./tableListPanel.js";
export type { TableListPanelFactory } from "./tableListPanel.js";
export type { TableListObserver } from "./tableListObserver.js";
export type { RowGrid } from "./rowGrid.js";
export type { RowGridDeps } from "./rowGrid.js";
export type { RowGridFactory } from "./rowGrid.js";
export type { RowGridObserver } from "./rowGridObserver.js";
export type { ReferencingPanel } from "./referencingPanel.js";
export type { ReferencingPanelDeps } from "./referencingPanel.js";
export type { ReferencingPanelFactory } from "./referencingPanel.js";
export type { ReferencingPanelObserver } from "./referencingPanelObserver.js";
export type { RowForm } from "./rowForm.js";
export type { RowFormDeps } from "./rowForm.js";
export type { RowFormFactory } from "./rowForm.js";
export type { ReferencePicker } from "./referencePicker.js";
export type { ReferencePickerDeps } from "./referencePicker.js";
export type { ReferencePickerFactory } from "./referencePicker.js";
export type { TableDesigner } from "./tableDesigner.js";
export type { TableDesignerDeps } from "./tableDesigner.js";
export type { TableDesignerFactory } from "./tableDesigner.js";
export type { ContextMenu } from "./contextMenu.js";
export type { ContextMenuFactory } from "./contextMenu.js";
export type { Notifier } from "./notifier.js";
export type { NotifierFactory } from "./notifier.js";
export type { DialogService } from "./dialogService.js";
export type { DialogServiceFactory } from "./dialogService.js";
export type { ClipboardService } from "./clipboardService.js";
export type { ClipboardServiceFactory } from "./clipboardService.js";
export type { FileService } from "./fileService.js";
export type { FileServiceFactory } from "./fileService.js";
export type { SettingsStore } from "./settingsStore.js";
export type { SettingsStoreFactory } from "./settingsStore.js";
export type { TableViewStore } from "./tableViewStore.js";
export type { TableViewStoreFactory } from "./tableViewStore.js";

// Errors
export type { ClipboardError } from "./clipboardError.js";
export type { ClipboardErrorKind } from "./clipboardError.js";

// Models
export type { EditorSettings } from "./models/editorSettings.js";
export type { RememberedConnection } from "./models/rememberedConnection.js";
export type { TableView } from "./models/tableView.js";
export type { GridView } from "./models/gridView.js";
export type { ReferencingTabView } from "./models/referencingTabView.js";
export type { GridSource } from "./models/gridSource.js";
export type { MenuItem } from "./models/menuItem.js";
export type { ViewportPoint } from "./models/viewportPoint.js";
export type { PickedFile } from "./models/pickedFile.js";
export type { RowFormRequest } from "./models/rowFormRequest.js";
export type { ReferenceChoice } from "./models/referenceChoice.js";

// Simple types
export type { ColorScheme } from "./models/simpleTypes/colorScheme.js";
export type { PageRowCount } from "./models/simpleTypes/pageRowCount.js";
