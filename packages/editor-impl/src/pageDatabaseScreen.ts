// DatabaseScreen: the bar, the table list, the chosen table's grid and, split below it, the referencing panel.
// It assembles the screen's parts and carries the flows between them: a table chosen, a row chosen, a view kept, a schema changed.

import type { ColumnCondition } from "@db-manager/connector";
import type { Row } from "@db-manager/connector";
import type { TableDefinition } from "@db-manager/connector";
import type { TableName } from "@db-manager/connector";
import type { DatabaseCloseObserver } from "@db-manager/editor";
import type { DatabaseScreen } from "@db-manager/editor";
import type { DatabaseScreenDeps } from "@db-manager/editor";
import type { DatabaseScreenFactory } from "@db-manager/editor";
import type { GridView } from "@db-manager/editor";
import type { MenuItem } from "@db-manager/editor";
import type { ReferencingPanel } from "@db-manager/editor";
import type { RowGrid } from "@db-manager/editor";
import type { RowGridDeps } from "@db-manager/editor";
import type { RowGridObserver } from "@db-manager/editor";
import type { RowTitleService } from "@db-manager/editor";
import type { TableCatalog } from "@db-manager/editor";
import type { TableDesigner } from "@db-manager/editor";
import type { TableListObserver } from "@db-manager/editor";
import type { TableListPanel } from "@db-manager/editor";
import type { TableView } from "@db-manager/editor";
import type { TableViewStore } from "@db-manager/editor";

import { buildCachedTableCatalog } from "./catalog/cachedTableCatalog.js";
import { buildGuessingRowTitleService } from "./catalog/guessingRowTitleService.js";
import { buildDialogTableDesigner } from "./designer/dialogTableDesigner.js";
import { buildDialogRowForm } from "./dialogRowForm.js";
import { buildFilteredTableListPanel } from "./filteredTableListPanel.js";
import { buildPopoverReferencePicker } from "./popoverReferencePicker.js";
import { PAGE_ROW_COUNTS } from "./protocol.js";
import { buildMemoryTableViewStore } from "./settings/memoryTableViewStore.js";
import { buildTabbedReferencingPanel } from "./tabbedReferencingPanel.js";
import { buildTableRowGrid } from "./tableRowGrid.js";
import { applyColorScheme } from "./utils/colorScheme.js";
import { createButton, createElement, createIconButton } from "./utils/dom.js";
import { describeFailure } from "./utils/refusal.js";
import { attachSplitter } from "./utils/splitter.js";

const MIN_SIDEBAR_WIDTH_PX = 160;
const MAX_SIDEBAR_WIDTH_PX = 640;
const MIN_GRID_SHARE = 0.2;
const MAX_GRID_SHARE = 0.8;

export const buildPageDatabaseScreen: DatabaseScreenFactory = (document, deps, observer) => new PageDatabaseScreen(document, deps, observer);

class PageDatabaseScreen implements DatabaseScreen {
  readonly element: HTMLElement;
  private readonly workspace: HTMLElement;
  private readonly main: HTMLElement;
  private readonly tableHead: HTMLElement;
  private readonly catalog: TableCatalog;
  private readonly titleService: RowTitleService;
  private readonly viewStore: TableViewStore;
  private readonly tableList: TableListPanel;
  private readonly mainGrid: RowGrid;
  private readonly referencingPanel: ReferencingPanel;
  private readonly designer: TableDesigner;
  private shownTable: TableDefinition | null = null;
  private chosenRow: Row | null = null;
  private isSplit = false;
  private openNumber = 0;

  constructor(
    private readonly document: Document,
    private readonly deps: DatabaseScreenDeps,
    private readonly observer: DatabaseCloseObserver,
  ) {
    const connection = deps.connection;
    this.catalog = buildCachedTableCatalog(connection.schemaService);
    this.viewStore = buildMemoryTableViewStore();
    this.titleService = buildGuessingRowTitleService({
      rowService: connection.rowService,
      tableCatalog: this.catalog,
      settingsStore: deps.settingsStore,
      databaseKey: `${deps.descriptor.id}/${connection.caption}`,
    });
    const referencePicker = buildPopoverReferencePicker(document, { rowService: connection.rowService, tableCatalog: this.catalog, rowTitleService: this.titleService, notifier: deps.notifier });
    const rowForm = buildDialogRowForm(document, {
      rowService: connection.rowService,
      tableCatalog: this.catalog,
      rowTitleService: this.titleService,
      referencePicker,
      fileService: deps.fileService,
      dialogService: deps.dialogService,
      notifier: deps.notifier,
    });
    const gridDeps: RowGridDeps = {
      rowService: connection.rowService,
      tableCatalog: this.catalog,
      rowTitleService: this.titleService,
      rowForm,
      referencePicker,
      contextMenu: deps.contextMenu,
      dialogService: deps.dialogService,
      clipboardService: deps.clipboardService,
      notifier: deps.notifier,
      settingsStore: deps.settingsStore,
    };
    this.mainGrid = buildTableRowGrid(document, gridDeps, this.mainGridObserver());
    const referencingGrid = buildTableRowGrid(document, gridDeps, this.referencingGridObserver());
    this.referencingPanel = buildTabbedReferencingPanel(document, { tableCatalog: this.catalog, rowGrid: referencingGrid, notifier: deps.notifier }, { chooseTab: (tabId) => this.chooseTab(tabId) });
    this.designer = buildDialogTableDesigner(document, { schemaService: connection.schemaService, tableCatalog: this.catalog, descriptor: deps.descriptor, dialogService: deps.dialogService, notifier: deps.notifier });
    this.tableList = buildFilteredTableListPanel(document, { tableCatalog: this.catalog, contextMenu: deps.contextMenu, notifier: deps.notifier }, this.tableListObserver());

    this.element = createElement(document, "div", "dm-app");
    this.workspace = createElement(document, "div", "dm-workspace");
    this.main = createElement(document, "section", "dm-main dm-unsplit");
    this.tableHead = createElement(document, "div", "dm-table-head");
    this.layOut();
  }

  async load(): Promise<void> {
    await this.tableList.load();
    const tables = await this.catalog.selectTables().catch(() => []);
    const first = tables.find((table) => table.kind === "table") ?? tables[0];
    if (first === undefined) this.showNoTable("No tables yet. Create one with ＋ in the list.");
    else await this.openTable(first.name, false);
  }

  private layOut(): void {
    const settings = this.deps.settingsStore.load();
    const bar = createElement(this.document, "header", "dm-bar");
    const titles = createElement(this.document, "div");
    titles.style.minWidth = "0";
    titles.append(createElement(this.document, "div", "dm-bar-title", this.deps.connection.caption), createElement(this.document, "div", "dm-bar-sub", this.deps.descriptor.caption));
    bar.append(
      createElement(this.document, "div", "dm-logo", "db"),
      titles,
      createElement(this.document, "span", "dm-spacer"),
      createIconButton(this.document, "⚙", "Settings", (event) => this.deps.contextMenu.open({ x: event.clientX, y: event.clientY }, this.settingsMenu())),
      createButton(this.document, "Close", "dm-button", () => this.observer.closeDatabase()),
    );
    const top = createElement(this.document, "div", "dm-main-top");
    top.append(this.tableHead, this.mainGrid.element);
    const bottom = createElement(this.document, "div", "dm-main-bottom");
    bottom.append(this.referencingPanel.element);
    const horizontal = createElement(this.document, "div", "dm-hsplitter");
    this.main.append(top, horizontal, bottom);
    this.main.style.setProperty("--dm-grid-share", String(settings.gridShare));
    attachSplitter(
      horizontal,
      (event) => {
        const box = this.main.getBoundingClientRect();
        const share = Math.min(MAX_GRID_SHARE, Math.max(MIN_GRID_SHARE, (event.clientY - box.top) / box.height));
        this.main.style.setProperty("--dm-grid-share", share.toFixed(3));
      },
      () => this.deps.settingsStore.save({ gridShare: Number(this.main.style.getPropertyValue("--dm-grid-share")) }),
    );
    const vertical = createElement(this.document, "div", "dm-vsplitter");
    this.workspace.style.setProperty("--dm-sidebar-width", `${settings.tableListWidthPx}px`);
    attachSplitter(
      vertical,
      (event) => {
        const left = this.workspace.getBoundingClientRect().left;
        const width = Math.min(MAX_SIDEBAR_WIDTH_PX, Math.max(MIN_SIDEBAR_WIDTH_PX, event.clientX - left));
        this.workspace.style.setProperty("--dm-sidebar-width", `${Math.round(width)}px`);
      },
      () => this.deps.settingsStore.save({ tableListWidthPx: Number.parseInt(this.workspace.style.getPropertyValue("--dm-sidebar-width"), 10) }),
    );
    this.workspace.append(this.tableList.element, vertical, this.main);
    this.element.append(bar, this.workspace);
  }

  private async openTable(tableName: TableName, isShownOnPhone = true, viewChange: Partial<TableView> = {}): Promise<void> {
    this.openNumber += 1;
    const openNumber = this.openNumber;
    let definition: TableDefinition;
    let hasTabs: boolean;
    try {
      definition = await this.catalog.getDefinition(tableName);
      hasTabs = await this.referencingPanel.hasTabs(definition);
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
      return;
    }
    if (openNumber !== this.openNumber) return;
    const view = { ...this.viewStore.obtainView(definition.name), ...viewChange };
    this.viewStore.saveView(view);
    this.shownTable = definition;
    this.chosenRow = null;
    this.isSplit = hasTabs;
    this.main.classList.toggle("dm-unsplit", !hasTabs);
    this.workspace.classList.toggle("dm-showing-table", isShownOnPhone);
    this.tableList.markChosen(definition.name);
    this.renderTableHead(definition);
    this.mainGrid.show({ tableName: definition.name, fixedConditions: [], presetValues: {}, placeholder: null }, view.grid, view.chosenRowKey);
    if (hasTabs) this.referencingPanel.show(definition, null, view);
  }

  private showNoTable(message: string): void {
    this.shownTable = null;
    this.chosenRow = null;
    this.main.classList.add("dm-unsplit");
    this.tableList.markChosen(null);
    this.tableHead.replaceChildren(createElement(this.document, "span", "dm-table-title", "No table"));
    this.mainGrid.clear(message);
  }

  private renderTableHead(definition: TableDefinition): void {
    const identity = definition.rowIdentity;
    const identityText =
      definition.kind === "view" ? "view · read only" : identity.kind === "primary-key" ? `key (${identity.columnNames.join(", ")})` : identity.kind === "row-id" ? "rows told apart by row id" : "read only";
    const back = createIconButton(this.document, "‹", "Back to the tables", () => this.workspace.classList.remove("dm-showing-table"));
    back.classList.add("dm-back");
    this.tableHead.replaceChildren(
      back,
      createElement(this.document, "span", "dm-table-title", definition.name),
      createElement(this.document, "span", "dm-muted dm-hide-narrow", identityText),
      createElement(this.document, "span", "dm-spacer"),
      ...(definition.kind === "table" ? [createButton(this.document, "Edit schema", "dm-button", () => void this.editTable(definition.name))] : []),
      createIconButton(this.document, "⋯", "More", (event) => this.deps.contextMenu.open({ x: event.clientX, y: event.clientY }, this.tableMenu(definition))),
    );
  }

  private tableMenu(definition: TableDefinition): readonly MenuItem[] {
    const item = (caption: string, choose: () => void, isEnabled = true, isDangerous = false): MenuItem => ({ caption, shortcut: null, isEnabled, isDangerous, choose });
    const isTable = definition.kind === "table";
    return [
      item("Show SQL", () => void this.showTableStatement(definition.name)),
      item("Name rows by…", () => this.chooseTitleColumn(definition)),
      item("Edit schema…", () => void this.editTable(definition.name), isTable),
      item("Rename…", () => void this.renameTable(definition.name), isTable),
      item(isTable ? "Drop table…" : "Drop view…", () => void this.dropTable(definition.name), true, true),
    ];
  }

  private chooseTitleColumn(definition: TableDefinition): void {
    const current = this.titleService.obtainTitleColumn(definition);
    const items: MenuItem[] = [
      { caption: "A guess from the column names", shortcut: null, isEnabled: true, isDangerous: false, choose: () => this.setTitleColumn(definition, null) },
      ...definition.columns.map((column) => ({
        caption: `${column.name === current ? "✓ " : ""}${column.name}`,
        shortcut: column.type,
        isEnabled: true,
        isDangerous: false,
        choose: () => this.setTitleColumn(definition, column.name),
      })),
    ];
    const box = this.tableHead.getBoundingClientRect();
    this.deps.contextMenu.open({ x: box.right - 220, y: box.bottom }, items);
  }

  private setTitleColumn(definition: TableDefinition, columnName: string | null): void {
    this.titleService.setTitleColumn(definition.name, columnName);
    this.deps.notifier.showInfo(columnName === null ? `Rows of ${definition.name} are named by a guess` : `Rows of ${definition.name} are named by ${columnName}`);
    this.mainGrid.reload();
  }

  private settingsMenu(): readonly MenuItem[] {
    const settings = this.deps.settingsStore.load();
    const check = (isOn: boolean): string => (isOn ? "✓ " : "   ");
    const schemes = [["system", "Theme: as the system"], ["light", "Theme: light"], ["dark", "Theme: dark"]] as const;
    return [
      ...schemes.map(([scheme, caption]) => ({
        caption: `${check(settings.colorScheme === scheme)}${caption}`,
        shortcut: null,
        isEnabled: true,
        isDangerous: false,
        choose: () => applyColorScheme(this.document, this.deps.settingsStore.save({ colorScheme: scheme }).colorScheme),
      })),
      ...PAGE_ROW_COUNTS.map((count) => ({
        caption: `${check(settings.pageRowCount === count)}${count} rows per page`,
        shortcut: null,
        isEnabled: true,
        isDangerous: false,
        choose: () => {
          this.deps.settingsStore.save({ pageRowCount: count });
          this.mainGrid.reload();
        },
      })),
      { caption: `db-manager ${this.deps.version}`, shortcut: null, isEnabled: false, isDangerous: false, choose: () => undefined },
    ];
  }

  private mainGridObserver(): RowGridObserver {
    return {
      chooseRow: (row) => {
        const table = this.shownTable;
        if (table === null) return;
        this.chosenRow = row;
        const view = { ...this.viewStore.obtainView(table.name), chosenRowKey: row?.key ?? null };
        this.viewStore.saveView(view);
        if (this.isSplit) this.referencingPanel.show(table, row, view);
      },
      changeView: (grid) => this.saveGridView(grid),
      openReferencedRow: (tableName, row) => void this.openRow(tableName, row),
      changeRows: () => {
        if (this.isSplit) this.referencingPanel.reload();
      },
    };
  }

  private referencingGridObserver(): RowGridObserver {
    return {
      chooseRow: () => undefined,
      changeView: (grid) => {
        const table = this.shownTable;
        if (table === null) return;
        const view = this.viewStore.obtainView(table.name);
        const tabId = this.referencingPanel.activeTabId;
        if (tabId === null) return;
        this.viewStore.saveView({ ...view, tabs: [...view.tabs.filter((tab) => tab.tabId !== tabId), { tabId, grid }] });
      },
      openReferencedRow: (tableName, row) => void this.openRow(tableName, row),
      changeRows: (tableName) => {
        if (this.shownTable !== null && tableName.toLowerCase() === this.shownTable.name.toLowerCase()) this.mainGrid.reload();
      },
    };
  }

  private saveGridView(grid: GridView): void {
    const table = this.shownTable;
    if (table !== null) this.viewStore.saveView({ ...this.viewStore.obtainView(table.name), grid });
  }

  private chooseTab(tabId: string): void {
    const table = this.shownTable;
    if (table === null) return;
    const view = { ...this.viewStore.obtainView(table.name), activeTabId: tabId };
    this.viewStore.saveView(view);
    this.referencingPanel.show(table, this.chosenRow, view);
  }

  /** Opens the row's table filtered to the row by its primary key, the row chosen; the filter's chip undoes it. */
  private async openRow(tableName: TableName, row: Row): Promise<void> {
    let definition: TableDefinition;
    try {
      definition = await this.catalog.getDefinition(tableName);
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
      return;
    }
    const identity = definition.rowIdentity;
    const conditions: ColumnCondition[] = identity.kind === "primary-key" ? identity.columnNames.map((name) => ({ columnName: name, comparison: "equals", value: row.values[name] ?? null })) : [];
    await this.openTable(definition.name, true, { grid: { offset: 0, sortings: [], conditions }, chosenRowKey: row.key });
  }

  private tableListObserver(): TableListObserver {
    return {
      chooseTable: (tableName) => void this.openTable(tableName),
      createTable: () => void this.createTable(),
      editTable: (tableName) => void this.editTable(tableName),
      renameTable: (tableName) => void this.renameTable(tableName),
      dropTable: (tableName) => void this.dropTable(tableName),
      showTableStatement: (tableName) => void this.showTableStatement(tableName),
    };
  }

  private async createTable(): Promise<void> {
    const name = await this.designer.open(null);
    if (name === null) return;
    await this.afterSchemaChange(name);
    this.deps.notifier.showInfo(`Table ${name} created`);
  }

  private async editTable(tableName: TableName): Promise<void> {
    const name = await this.designer.open(tableName);
    if (name === null) return;
    if (name.toLowerCase() !== tableName.toLowerCase()) this.viewStore.forgetView(tableName);
    await this.afterSchemaChange(name);
    this.deps.notifier.showInfo(`Table ${name} changed`);
  }

  private async renameTable(tableName: TableName): Promise<void> {
    const newName = await this.deps.dialogService.prompt(`Rename ${tableName}`, "New name", tableName);
    if (newName === null || newName === tableName) return;
    try {
      await this.deps.connection.schemaService.renameTable(tableName, newName);
      this.viewStore.forgetView(tableName);
      await this.afterSchemaChange(newName.trim());
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
    }
  }

  private async dropTable(tableName: TableName): Promise<void> {
    let message = `${tableName} is dropped with all its rows, for good.`;
    try {
      const definition = await this.catalog.getDefinition(tableName);
      const referencing = definition.kind === "table" ? await this.catalog.selectReferencingKeys(tableName) : [];
      const others = [...new Set(referencing.map((key) => key.tableName).filter((name) => name.toLowerCase() !== tableName.toLowerCase()))];
      if (others.length > 0) message += ` ${others.join(", ")} refer to it; their references will point nowhere.`;
    } catch {
      // The warning is a courtesy: the drop itself still asks the plugin.
    }
    if (!(await this.deps.dialogService.confirm(`Drop ${tableName}?`, message, "Drop", true))) return;
    try {
      await this.deps.connection.schemaService.dropTable(tableName);
      this.viewStore.forgetView(tableName);
      this.catalog.forget();
      await this.tableList.load();
      if (this.shownTable?.name.toLowerCase() === tableName.toLowerCase()) await this.load();
      this.deps.notifier.showInfo(`${tableName} dropped`);
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
    }
  }

  private async showTableStatement(tableName: TableName): Promise<void> {
    try {
      const definition = await this.catalog.getDefinition(tableName);
      await this.deps.dialogService.showText(`${tableName} as SQL`, definition.sourceText ?? "The database keeps no statement for it");
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
    }
  }

  private async afterSchemaChange(tableName: TableName): Promise<void> {
    this.catalog.forget();
    await this.tableList.load();
    await this.openTable(tableName);
  }
}
