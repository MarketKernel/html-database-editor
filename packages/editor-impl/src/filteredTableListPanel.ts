// TableListPanel as a filtered list: the tables, then the views, a menu per item by right click or its ⋯.

import type { TableName } from "@db-manager/connector";
import type { TableSummary } from "@db-manager/connector";
import type { MenuItem } from "@db-manager/editor";
import type { TableListObserver } from "@db-manager/editor";
import type { TableListPanel } from "@db-manager/editor";
import type { TableListPanelDeps } from "@db-manager/editor";
import type { TableListPanelFactory } from "@db-manager/editor";

import { createElement, createIconButton, createTextInput } from "./utils/dom.js";
import { describeFailure } from "./utils/refusal.js";

export const buildFilteredTableListPanel: TableListPanelFactory = (document, deps, observer) => new FilteredTableListPanel(document, deps, observer);

class FilteredTableListPanel implements TableListPanel {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private readonly filter: HTMLInputElement;
  private tables: readonly TableSummary[] = [];
  private chosenName: TableName | null = null;

  constructor(
    private readonly document: Document,
    private readonly deps: TableListPanelDeps,
    private readonly observer: TableListObserver,
  ) {
    this.element = createElement(document, "aside", "dm-sidebar");
    const head = createElement(document, "div", "dm-sidebar-head");
    this.filter = createTextInput(document, "", "Filter tables");
    this.filter.type = "search";
    this.filter.addEventListener("input", () => this.render());
    this.filter.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.chooseFirstShown();
    });
    head.append(this.filter, createIconButton(document, "＋", "New table", () => observer.createTable()));
    this.list = createElement(document, "nav", "dm-table-list");
    this.element.append(head, this.list);
  }

  async load(): Promise<void> {
    try {
      this.tables = await this.deps.tableCatalog.selectTables();
    } catch (error) {
      this.tables = [];
      this.deps.notifier.showError(describeFailure(error, console));
    }
    this.render();
  }

  markChosen(tableName: TableName | null): void {
    this.chosenName = tableName;
    this.list.querySelectorAll<HTMLElement>(".dm-table-item").forEach((item) => {
      const isChosen = item.dataset["table"] === tableName;
      item.classList.toggle("dm-chosen", isChosen);
      if (isChosen) item.scrollIntoView({ block: "nearest" });
    });
  }

  private render(): void {
    const text = this.filter.value.trim().toLowerCase();
    const shown = this.tables.filter((table) => table.name.toLowerCase().includes(text));
    const tables = shown.filter((table) => table.kind === "table");
    const views = shown.filter((table) => table.kind === "view");
    const items: HTMLElement[] = [];
    if (tables.length > 0) items.push(createElement(this.document, "div", "dm-list-group", `Tables · ${tables.length}`), ...tables.map((table) => this.createItem(table)));
    if (views.length > 0) items.push(createElement(this.document, "div", "dm-list-group", `Views · ${views.length}`), ...views.map((table) => this.createItem(table)));
    if (items.length === 0) items.push(createElement(this.document, "div", "dm-empty", this.tables.length === 0 ? "No tables yet: create one with ＋" : "No table matches"));
    this.list.replaceChildren(...items);
    this.markChosen(this.chosenName);
  }

  private createItem(table: TableSummary): HTMLElement {
    const item = createElement(this.document, "div", "dm-table-item");
    item.dataset["table"] = table.name;
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.append(createElement(this.document, "span", "dm-table-icon", table.kind === "view" ? "◇" : "▦"), createElement(this.document, "span", "", table.name));
    item.title = table.kind === "view" ? `${table.name} — a view` : table.name;
    item.addEventListener("click", () => this.observer.chooseTable(table.name));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.observer.chooseTable(table.name);
      if (event.key === "ArrowDown") (item.nextElementSibling as HTMLElement | null)?.focus();
      if (event.key === "ArrowUp") (item.previousElementSibling as HTMLElement | null)?.focus();
    });
    item.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.deps.contextMenu.open({ x: event.clientX, y: event.clientY }, this.tableMenu(table));
    });
    return item;
  }

  private tableMenu(table: TableSummary): readonly MenuItem[] {
    const isTable = table.kind === "table";
    const item = (caption: string, choose: () => void, isEnabled = true, isDangerous = false): MenuItem => ({ caption, shortcut: null, isEnabled, isDangerous, choose });
    return [
      item("Open", () => this.observer.chooseTable(table.name)),
      item("Edit schema…", () => this.observer.editTable(table.name), isTable),
      item("Show SQL", () => this.observer.showTableStatement(table.name)),
      item("Rename…", () => this.observer.renameTable(table.name), isTable),
      item(isTable ? "Drop table…" : "Drop view…", () => this.observer.dropTable(table.name), true, true),
    ];
  }

  private chooseFirstShown(): void {
    const first = this.list.querySelector<HTMLElement>(".dm-table-item");
    const name = first?.dataset["table"];
    if (name !== undefined) this.observer.chooseTable(name);
  }
}
