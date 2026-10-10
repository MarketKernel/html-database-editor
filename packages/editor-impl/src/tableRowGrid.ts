// RowGrid as an HTML table: a toolbar, the filter's chips, the rows, a pager. A click chooses a row, Shift and ⌘/Ctrl select more;
// a double click edits a cell in place; a reference cell's drop-down picks another target. Every write reloads the page.

import type { CellValue } from "@db-manager/connector";
import type { ColumnCondition } from "@db-manager/connector";
import type { ColumnDefinition } from "@db-manager/connector";
import type { ForeignKey } from "@db-manager/connector";
import type { NewRow } from "@db-manager/connector";
import type { Row } from "@db-manager/connector";
import type { RowKey } from "@db-manager/connector";
import type { TableDefinition } from "@db-manager/connector";
import type { GridSource } from "@db-manager/editor";
import type { GridView } from "@db-manager/editor";
import type { MenuItem } from "@db-manager/editor";
import type { RowGrid } from "@db-manager/editor";
import type { RowGridDeps } from "@db-manager/editor";
import type { RowGridFactory } from "@db-manager/editor";
import type { RowGridObserver } from "@db-manager/editor";

import { PAGE_ROW_COUNTS } from "./protocol.js";
import { isPageRowCount } from "./settings/localSettingsStore.js";
import { formatCellText, formatClipboardText, formatEditText } from "./utils/cellText.js";
import { COMPARISON_CAPTIONS, describeCondition, isValueless } from "./utils/conditionText.js";
import { createButton, createElement, createIconButton, createSelect, createTextInput, formatShortcut, isCommandKey } from "./utils/dom.js";
import { describeForeignKey, selectGridColumns } from "./utils/gridColumns.js";
import type { GridColumn } from "./utils/gridColumns.js";
import { describeFailure } from "./utils/refusal.js";
import { isSameKey, selectReferenceValues, selectTargetValues } from "./utils/rowKeys.js";
import { parseTsv } from "./utils/tsv.js";
import { readConditionValue, readValue } from "./utils/valueInput.js";

const NUMERIC_KINDS: ReadonlySet<string> = new Set(["integer", "real", "numeric"]);
const CLIPBOARD_NULL = "\\N";

interface ShownTable {
  readonly source: GridSource;
  readonly definition: TableDefinition;
  readonly columns: readonly GridColumn[];
  view: GridView;
  rows: readonly Row[];
  totalCount: number;
  chosenKey: RowKey | null;
  /** Indexes of the selected rows in rows. */
  selected: Set<number>;
  anchorIndex: number | null;
}

export const buildTableRowGrid: RowGridFactory = (document, deps, observer) => new TableRowGrid(document, deps, observer);

class TableRowGrid implements RowGrid {
  readonly element: HTMLElement;
  private readonly tools: HTMLElement;
  private readonly conditionBar: HTMLElement;
  private readonly scroll: HTMLElement;
  private readonly pager: HTMLElement;
  private shown: ShownTable | null = null;
  private loadNumber = 0;
  private filterEditor: HTMLElement | null = null;

  constructor(
    private readonly document: Document,
    private readonly deps: RowGridDeps,
    private readonly observer: RowGridObserver,
  ) {
    this.element = createElement(document, "div", "dm-grid");
    this.element.tabIndex = 0;
    this.tools = createElement(document, "div", "dm-grid-tools");
    this.conditionBar = createElement(document, "div", "dm-conditions");
    this.scroll = createElement(document, "div", "dm-grid-scroll");
    this.pager = createElement(document, "div", "dm-pager");
    this.element.append(this.tools, this.conditionBar, this.scroll, this.pager);
    this.element.addEventListener("keydown", (event) => this.handleKey(event));
  }

  show(source: GridSource, view: GridView, chosenRowKey: RowKey | null): void {
    void this.open(source, view, chosenRowKey);
  }

  reload(): void {
    if (this.shown !== null) void this.loadPage(this.shown);
  }

  clear(placeholder: string): void {
    this.loadNumber += 1;
    this.shown = null;
    this.tools.replaceChildren();
    this.conditionBar.replaceChildren();
    this.pager.replaceChildren();
    this.scroll.replaceChildren(createElement(this.document, "div", "dm-grid-message", placeholder));
  }

  focus(): void {
    this.element.focus({ preventScroll: true });
  }

  private async open(source: GridSource, view: GridView, chosenRowKey: RowKey | null): Promise<void> {
    this.loadNumber += 1;
    const loadNumber = this.loadNumber;
    let definition: TableDefinition;
    try {
      definition = await this.deps.tableCatalog.getDefinition(source.tableName);
    } catch (error) {
      if (loadNumber === this.loadNumber) this.clear(describeFailure(error, console));
      return;
    }
    if (loadNumber !== this.loadNumber) return;
    const shown: ShownTable = { source, definition, columns: selectGridColumns(definition), view, rows: [], totalCount: 0, chosenKey: chosenRowKey, selected: new Set(), anchorIndex: null };
    this.shown = shown;
    this.renderTools(shown);
    this.renderConditions(shown);
    await this.loadPage(shown);
  }

  private async loadPage(shown: ShownTable): Promise<void> {
    this.loadNumber += 1;
    const loadNumber = this.loadNumber;
    const rowCount = this.deps.settingsStore.load().pageRowCount;
    try {
      const page = await this.deps.rowService.getRowPage(shown.definition.name, {
        offset: shown.view.offset,
        rowCount,
        sortings: shown.view.sortings,
        conditions: [...shown.source.fixedConditions, ...shown.view.conditions],
      });
      if (loadNumber !== this.loadNumber) return;
      if (page.rows.length === 0 && shown.view.offset > 0 && page.totalCount > 0) {
        this.changeView(shown, { ...shown.view, offset: Math.max(0, Math.floor((page.totalCount - 1) / rowCount) * rowCount) });
        return;
      }
      shown.rows = page.rows;
      shown.totalCount = page.totalCount;
      const chosenIndex = page.rows.findIndex((row) => isSameKey(row.key, shown.chosenKey));
      shown.selected = new Set(chosenIndex === -1 ? [] : [chosenIndex]);
      shown.anchorIndex = chosenIndex === -1 ? null : chosenIndex;
      this.renderRows(shown);
      if (chosenIndex === -1 && shown.chosenKey !== null) {
        shown.chosenKey = null;
        this.observer.chooseRow(null);
      } else if (chosenIndex !== -1) {
        // The chosen row read afresh: whatever shows its referencing rows reads them again.
        this.observer.chooseRow(page.rows[chosenIndex] ?? null);
      }
      this.renderPager(shown, rowCount);
      void this.loadTitles(shown, loadNumber);
    } catch (error) {
      if (loadNumber === this.loadNumber) this.scroll.replaceChildren(createElement(this.document, "div", "dm-refusal", describeFailure(error, console)));
    }
  }

  private isWritable(shown: ShownTable): boolean {
    return shown.definition.kind === "table" && shown.definition.rowIdentity.kind !== "none";
  }

  private renderTools(shown: ShownTable): void {
    const isWritable = this.isWritable(shown);
    const navigator = this.document.defaultView?.navigator;
    const shortcut = (key: string): string => (navigator === undefined ? "" : ` (${formatShortcut(navigator, key)})`);
    const tool = (caption: string, title: string, onClick: () => void): HTMLButtonElement => {
      const button = createButton(this.document, caption, "dm-button dm-tool", onClick);
      button.title = title;
      return button;
    };
    const buttons = [
      ...(isWritable
        ? [
            tool("＋ New", "New row", () => void this.createRow(shown, shown.source.presetValues)),
            tool("Edit", "Edit the chosen row (Enter)", () => void this.editChosenRow(shown)),
            tool("Duplicate", "Duplicate the chosen row", () => void this.duplicateChosenRow(shown)),
            tool("Delete", "Delete the selected rows (Delete)", () => void this.deleteSelectedRows(shown)),
          ]
        : []),
      tool("Filter", "Add a filter", () => this.openFilterEditor(shown)),
      tool("Copy", `Copy the selected rows${shortcut("C")}`, () => void this.copySelectedRows(shown)),
      ...(isWritable ? [tool("Paste", `Paste rows${shortcut("V")}`, () => void this.pasteRows(shown))] : []),
      createIconButton(this.document, "↻", "Reload", () => void this.loadPage(shown)),
    ];
    const status = createElement(this.document, "span", "dm-muted dm-hide-narrow", isWritable ? "" : shown.definition.kind === "view" ? "A view: read only" : "Rows cannot be told apart: read only");
    status.style.marginLeft = "8px";
    this.tools.replaceChildren(...buttons, status);
  }

  private renderConditions(shown: ShownTable): void {
    const chips = shown.view.conditions.map((condition, index) => {
      const valueKind = shown.definition.columns.find((column) => column.name === condition.columnName)?.valueKind ?? "any";
      const chip = createElement(this.document, "span", "dm-chip", describeCondition(condition, valueKind));
      const remove = createButton(this.document, "✕", "", () => this.changeView(shown, { ...shown.view, offset: 0, conditions: shown.view.conditions.filter((_, other) => other !== index) }));
      remove.title = "Remove the condition";
      chip.append(remove);
      return chip;
    });
    if (chips.length > 1) chips.push(createButton(this.document, "Clear all", "dm-button", () => this.changeView(shown, { ...shown.view, offset: 0, conditions: [] })));
    this.conditionBar.replaceChildren(...chips);
    if (this.filterEditor !== null) this.conditionBar.append(this.filterEditor);
  }

  private openFilterEditor(shown: ShownTable, columnName: string | null = null, value: CellValue = null): void {
    const columns = shown.definition.columns;
    const editor = createElement(this.document, "span", "dm-design-line");
    const columnSelect = createSelect(this.document, columns.map((column) => [column.name, column.name] as const), columnName ?? columns[0]?.name ?? "");
    const comparison = createSelect(this.document, COMPARISON_CAPTIONS, "equals");
    const input = createTextInput(this.document, formatEditText(value), "value");
    const syncValue = (): void => {
      input.disabled = isValueless(comparison.value as ColumnCondition["comparison"]);
    };
    comparison.addEventListener("change", syncValue);
    const apply = (): void => {
      const column = columns.find((candidate) => candidate.name === columnSelect.value);
      if (column === undefined) return;
      const condition: ColumnCondition = { columnName: column.name, comparison: comparison.value as ColumnCondition["comparison"], value: input.disabled ? null : readConditionValue(input.value, column.valueKind) };
      this.filterEditor = null;
      this.changeView(shown, { ...shown.view, offset: 0, conditions: [...shown.view.conditions, condition] });
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") apply();
      if (event.key === "Escape") {
        this.filterEditor = null;
        editor.remove();
      }
      event.stopPropagation();
    });
    editor.append(
      columnSelect,
      comparison,
      input,
      createButton(this.document, "Add", "dm-button dm-primary", apply),
      createButton(this.document, "Cancel", "dm-button", () => {
        this.filterEditor = null;
        editor.remove();
      }),
    );
    this.filterEditor?.remove();
    this.filterEditor = editor;
    this.conditionBar.append(editor);
    input.focus();
  }

  private renderRows(shown: ShownTable): void {
    const table = createElement(this.document, "table", "dm-table");
    const head = createElement(this.document, "thead");
    const headRow = createElement(this.document, "tr");
    headRow.append(createElement(this.document, "th", "dm-row-head", "#"));
    for (const gridColumn of shown.columns) headRow.append(this.createHeader(shown, gridColumn));
    head.append(headRow);
    const body = createElement(this.document, "tbody");
    shown.rows.forEach((row, index) => body.append(this.createRowElement(shown, row, index)));
    table.append(head, body);
    if (shown.rows.length === 0) {
      const message = shown.view.conditions.length > 0 ? "No rows match the filter" : shown.source.placeholder ?? "No rows yet";
      this.scroll.replaceChildren(table, createElement(this.document, "div", "dm-grid-message", message));
    } else {
      this.scroll.replaceChildren(table);
    }
  }

  private createHeader(shown: ShownTable, gridColumn: GridColumn): HTMLElement {
    const header = createElement(this.document, "th");
    if (gridColumn.kind === "reference") {
      header.append(createElement(this.document, "span", "dm-th-mark dm-th-link", "→"), this.document.createTextNode(describeForeignKey(gridColumn.foreignKey)));
      header.title = `${gridColumn.foreignKey.columnNames.join(", ")} refer to ${describeForeignKey(gridColumn.foreignKey)}`;
      header.style.cursor = "default";
      return header;
    }
    const column = gridColumn.column;
    const isKey = shown.definition.primaryKeyColumnNames.includes(column.name);
    if (isKey) header.append(createElement(this.document, "span", "dm-th-mark dm-th-key", "⚷"));
    if (gridColumn.reference !== null) header.append(createElement(this.document, "span", "dm-th-mark dm-th-link", "→"));
    header.append(this.document.createTextNode(column.name));
    const sorting = shown.view.sortings.find((candidate) => candidate.columnName === column.name);
    if (sorting !== undefined) header.append(createElement(this.document, "span", "dm-th-type", sorting.order === "ascending" ? "▲" : "▼"));
    header.append(createElement(this.document, "span", "dm-th-type", column.type));
    header.title = [column.type, isKey ? "primary key" : "", column.isNotNull ? "NOT NULL" : "", gridColumn.reference === null ? "" : `refers to ${describeForeignKey(gridColumn.reference)}`, "click to sort"]
      .filter((part) => part !== "")
      .join(" · ");
    header.addEventListener("click", () => {
      const order = sorting === undefined ? "ascending" : sorting.order === "ascending" ? "descending" : null;
      this.changeView(shown, { ...shown.view, offset: 0, sortings: order === null ? [] : [{ columnName: column.name, order }] });
    });
    return header;
  }

  private createRowElement(shown: ShownTable, row: Row, index: number): HTMLTableRowElement {
    const element = createElement(this.document, "tr");
    element.dataset["index"] = String(index);
    if (shown.selected.has(index)) element.classList.add("dm-selected");
    if (isSameKey(row.key, shown.chosenKey)) element.classList.add("dm-chosen");
    element.append(createElement(this.document, "td", "dm-row-head", String(shown.view.offset + index + 1)));
    for (const gridColumn of shown.columns) element.append(this.createCell(shown, row, gridColumn));
    element.addEventListener("mousedown", (event) => {
      if (event.button === 0) this.chooseRow(shown, index, event);
    });
    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (!shown.selected.has(index)) this.chooseRow(shown, index, null);
      const cell = (event.target as HTMLElement).closest("td");
      const cellIndex = cell === null ? -1 : [...element.children].indexOf(cell) - 1;
      this.deps.contextMenu.open({ x: event.clientX, y: event.clientY }, this.rowMenu(shown, row, shown.columns[cellIndex] ?? null));
    });
    return element;
  }

  private createCell(shown: ShownTable, row: Row, gridColumn: GridColumn): HTMLTableCellElement {
    const cell = createElement(this.document, "td");
    if (gridColumn.kind === "reference") {
      cell.append(this.createReferenceButton(shown, row, gridColumn.foreignKey, false));
      return cell;
    }
    const column = gridColumn.column;
    const value = row.values[column.name] ?? null;
    if (value === null) cell.classList.add("dm-null");
    if (NUMERIC_KINDS.has(column.valueKind) || typeof value === "bigint" || typeof value === "number") cell.classList.add("dm-number");
    if (column.generated !== null) cell.classList.add("dm-computed");
    if (gridColumn.reference !== null && value !== null) {
      cell.classList.remove("dm-number");
      cell.append(this.createReferenceButton(shown, row, gridColumn.reference, true));
    } else {
      cell.textContent = formatCellText(value, column.valueKind);
      if (gridColumn.reference !== null) cell.append(this.createReferenceButton(shown, row, gridColumn.reference, false));
    }
    cell.title = typeof value === "string" && value.length > 40 ? value.slice(0, 2000) : "";
    cell.addEventListener("dblclick", (event) => {
      if ((event.target as HTMLElement).closest(".dm-reference") === null) this.editCell(shown, row, column, cell);
    });
    return cell;
  }

  /** The reference's drop-down: its values (showValues), its target's title, ▾. The title fills in once loaded. */
  private createReferenceButton(shown: ShownTable, row: Row, foreignKey: ForeignKey, showValues: boolean): HTMLElement {
    const values = selectReferenceValues(row, foreignKey);
    const button = createElement(this.document, "button", "dm-reference");
    button.type = "button";
    button.dataset["reference"] = foreignKey.columnNames.join("\u0000");
    const isEmpty = values.some((value) => value === null);
    if (showValues) button.append(createElement(this.document, "span", "dm-reference-values", values.map((value) => formatCellText(value, "any")).join(", ")));
    button.append(createElement(this.document, "span", "dm-reference-title", isEmpty ? (showValues ? "" : "—") : "…"));
    if (this.isWritable(shown)) button.append(createElement(this.document, "span", "dm-reference-caret", "▾"));
    button.title = isEmpty ? "No reference" : `${values.map((value) => formatCellText(value, "any")).join(", ")} in ${describeForeignKey(foreignKey)}`;
    button.addEventListener("mousedown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!this.isWritable(shown)) {
        void this.openReferencedRow(foreignKey, values);
        return;
      }
      void this.deps.referencePicker.open(button, { foreignKey, currentValues: values }).then((answer) => {
        if (answer === null) return;
        const targetValues = answer === "none" ? foreignKey.columnNames.map(() => null) : selectTargetValues(answer, foreignKey);
        const change: Record<string, CellValue> = {};
        foreignKey.columnNames.forEach((name, index) => (change[name] = targetValues[index] ?? null));
        void this.updateRow(shown, row, change);
      });
    });
    return button;
  }

  private async loadTitles(shown: ShownTable, loadNumber: number): Promise<void> {
    for (const foreignKey of shown.definition.foreignKeys) {
      const tuples = shown.rows.map((row) => selectReferenceValues(row, foreignKey));
      try {
        const titles = await this.deps.rowTitleService.selectTitles(foreignKey, tuples);
        if (loadNumber !== this.loadNumber) return;
        const marker = foreignKey.columnNames.join("\u0000");
        this.scroll.querySelectorAll<HTMLElement>("tbody tr").forEach((element, index) => {
          if (tuples[index]?.some((value) => value === null) ?? true) return;
          element.querySelectorAll<HTMLElement>(".dm-reference").forEach((button) => {
            if (button.dataset["reference"] !== marker) return;
            const title = button.querySelector(".dm-reference-title");
            const valuesText = button.querySelector(".dm-reference-values")?.textContent ?? null;
            // A row named by its key has no title beyond the values already shown.
            if (title !== null) title.textContent = titles[index] === valuesText ? "" : (titles[index] ?? "");
          });
        });
      } catch {
        // Titles are a hint; a target the plugin cannot read leaves the values alone.
      }
    }
  }

  private renderPager(shown: ShownTable, rowCount: number): void {
    const first = shown.totalCount === 0 ? 0 : shown.view.offset + 1;
    const last = shown.view.offset + shown.rows.length;
    const lastOffset = Math.max(0, Math.floor((shown.totalCount - 1) / rowCount) * rowCount);
    const go = (offset: number): void => this.changeView(shown, { ...shown.view, offset });
    const firstButton = createIconButton(this.document, "⏮", "First page", () => go(0));
    const previous = createIconButton(this.document, "‹", "Previous page", () => go(Math.max(0, shown.view.offset - rowCount)));
    const next = createIconButton(this.document, "›", "Next page", () => go(shown.view.offset + rowCount));
    const lastButton = createIconButton(this.document, "⏭", "Last page", () => go(lastOffset));
    firstButton.disabled = previous.disabled = shown.view.offset === 0;
    next.disabled = lastButton.disabled = last >= shown.totalCount;
    const size = createSelect(this.document, PAGE_ROW_COUNTS.map((count) => [String(count), `${count} per page`] as const), String(rowCount));
    size.addEventListener("change", () => {
      const count = Number(size.value);
      if (isPageRowCount(count)) this.deps.settingsStore.save({ pageRowCount: count });
      go(0);
    });
    const selection = shown.selected.size > 1 ? ` · ${shown.selected.size} selected` : "";
    this.pager.replaceChildren(firstButton, previous, createElement(this.document, "span", "", `${first}–${last} of ${shown.totalCount}${selection}`), next, lastButton, createElement(this.document, "span", "dm-spacer"), size);
  }

  private changeView(shown: ShownTable, view: GridView): void {
    shown.view = view;
    this.observer.changeView(view);
    this.renderConditions(shown);
    void this.loadPage(shown);
  }

  private chooseRow(shown: ShownTable, index: number, event: MouseEvent | KeyboardEvent | null): void {
    const row = shown.rows[index];
    if (row === undefined) return;
    const navigator = this.document.defaultView?.navigator;
    const isToggle = event !== null && navigator !== undefined && "metaKey" in event && isCommandKey(event as KeyboardEvent, navigator);
    if (event?.shiftKey === true && shown.anchorIndex !== null) {
      const [from, to] = [Math.min(shown.anchorIndex, index), Math.max(shown.anchorIndex, index)];
      shown.selected = new Set(Array.from({ length: to - from + 1 }, (_, offset) => from + offset));
    } else if (isToggle) {
      if (shown.selected.has(index)) shown.selected.delete(index);
      else shown.selected.add(index);
      shown.anchorIndex = index;
    } else {
      shown.selected = new Set([index]);
      shown.anchorIndex = index;
    }
    const isNewChoice = !isSameKey(row.key, shown.chosenKey);
    shown.chosenKey = row.key;
    this.scroll.querySelectorAll<HTMLElement>("tbody tr").forEach((element, other) => {
      element.classList.toggle("dm-selected", shown.selected.has(other));
      element.classList.toggle("dm-chosen", other === index);
    });
    this.renderPager(shown, this.deps.settingsStore.load().pageRowCount);
    if (isNewChoice) this.observer.chooseRow(row);
  }

  private editCell(shown: ShownTable, row: Row, column: ColumnDefinition, cell: HTMLTableCellElement): void {
    const value = row.values[column.name] ?? null;
    if (!this.isWritable(shown) || column.generated !== null || value instanceof Uint8Array || column.valueKind === "blob") {
      if (this.isWritable(shown)) void this.editRow(shown, row);
      return;
    }
    const input = createElement(this.document, "input", "dm-cell-input");
    input.value = formatEditText(value);
    input.placeholder = column.isNotNull ? "" : "NULL";
    cell.classList.add("dm-editing");
    cell.replaceChildren(input);
    input.focus();
    input.select();
    let isDone = false;
    const finish = (isSaved: boolean): void => {
      if (isDone) return;
      isDone = true;
      if (!isSaved || input.value === formatEditText(value)) {
        this.renderRows(shown);
        void this.loadTitles(shown, this.loadNumber);
        this.focus();
        return;
      }
      const reading = readValue(input.value, column.valueKind, column.isNotNull);
      if (!reading.isValid) {
        this.deps.notifier.showError(`${column.name}: ${reading.problem}`);
        isDone = false;
        input.focus();
        return;
      }
      void this.updateRow(shown, row, { [column.name]: reading.value }).then(() => this.focus());
    };
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") finish(true);
      if (event.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("mousedown", (event) => event.stopPropagation());
  }

  private async updateRow(shown: ShownTable, row: Row, values: Readonly<Record<string, CellValue>>): Promise<void> {
    if (row.key === null) return;
    try {
      const updated = await this.deps.rowService.updateRow(shown.definition.name, row.key, { values });
      if (isSameKey(row.key, shown.chosenKey)) {
        shown.chosenKey = updated.key;
        this.observer.chooseRow(updated);
      }
      this.observer.changeRows(shown.definition.name);
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
    }
    await this.loadPage(shown);
  }

  private async createRow(shown: ShownTable, values: Readonly<Record<string, CellValue>>): Promise<void> {
    const created = await this.deps.rowForm.open({ kind: "create", tableName: shown.definition.name, values });
    if (created === null) return;
    shown.chosenKey = created.key;
    this.observer.changeRows(shown.definition.name);
    await this.loadPage(shown);
    const index = shown.rows.findIndex((row) => isSameKey(row.key, created.key));
    if (index !== -1) this.chooseRow(shown, index, null);
    this.deps.notifier.showInfo(index === -1 ? "Row created; it is on another page or outside the filter" : "Row created");
  }

  private async editRow(shown: ShownTable, row: Row): Promise<void> {
    const updated = await this.deps.rowForm.open({ kind: "update", tableName: shown.definition.name, row });
    if (updated === null) return;
    shown.chosenKey = updated.key;
    this.observer.chooseRow(updated);
    this.observer.changeRows(shown.definition.name);
    await this.loadPage(shown);
  }

  private async editChosenRow(shown: ShownTable): Promise<void> {
    const row = this.findChosenRow(shown);
    if (row === null) this.deps.notifier.showInfo("Choose a row first");
    else await this.editRow(shown, row);
  }

  private async duplicateChosenRow(shown: ShownTable): Promise<void> {
    const row = this.findChosenRow(shown);
    if (row === null) {
      this.deps.notifier.showInfo("Choose a row first");
      return;
    }
    const values: Record<string, CellValue> = {};
    const soleIntegerKey = shown.definition.primaryKeyColumnNames.length === 1 ? shown.definition.columns.find((column) => column.name === shown.definition.primaryKeyColumnNames[0] && column.valueKind === "integer") : undefined;
    for (const column of shown.definition.columns) {
      if (column.generated === null && column !== soleIntegerKey) values[column.name] = row.values[column.name] ?? null;
    }
    await this.createRow(shown, values);
  }

  private async deleteSelectedRows(shown: ShownTable): Promise<void> {
    const rows = this.selectSelectedRows(shown);
    if (rows.length === 0) {
      this.deps.notifier.showInfo("Select the rows to delete");
      return;
    }
    const isConfirmed = await this.deps.dialogService.confirm(
      rows.length === 1 ? "Delete the row?" : `Delete ${rows.length} rows?`,
      `${rows.length === 1 ? "The row is" : "The rows are"} deleted from ${shown.definition.name} for good.`,
      "Delete",
      true,
    );
    if (!isConfirmed) return;
    try {
      await this.deps.rowService.deleteRows(shown.definition.name, rows.flatMap((row) => (row.key === null ? [] : [row.key])));
      this.deps.notifier.showInfo(rows.length === 1 ? "Row deleted" : `${rows.length} rows deleted`);
      this.observer.changeRows(shown.definition.name);
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
    }
    await this.loadPage(shown);
    this.focus();
  }

  private async copySelectedRows(shown: ShownTable): Promise<void> {
    const rows = this.selectSelectedRows(shown);
    if (rows.length === 0) {
      this.deps.notifier.showInfo("Select the rows to copy");
      return;
    }
    const columns = shown.definition.columns;
    const lines = [columns.map((column) => column.name).join("\t"), ...rows.map((row) => columns.map((column) => formatClipboardText(row.values[column.name] ?? null)).join("\t"))];
    try {
      await this.deps.clipboardService.writeText(`${lines.join("\n")}\n`);
      this.deps.notifier.showInfo(rows.length === 1 ? "Row copied" : `${rows.length} rows copied`);
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
    }
  }

  /** Pastes tab-separated lines as new rows: by the header's column names when the first line is one, else by position. */
  private async pasteRows(shown: ShownTable): Promise<void> {
    let text: string;
    try {
      text = await this.deps.clipboardService.readText();
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
      return;
    }
    const lines = parseTsv(text);
    const writable = shown.definition.columns.filter((column) => column.generated === null);
    const header = lines[0] ?? [];
    const isHeader = header.length > 0 && header.every((cell) => shown.definition.columns.some((column) => column.name === cell));
    const targetColumns = (isHeader ? header.map((cell) => shown.definition.columns.find((column) => column.name === cell)) : writable).map((column) => (column?.generated === null ? column : undefined));
    const rows: NewRow[] = [];
    const problems: string[] = [];
    (isHeader ? lines.slice(1) : lines).forEach((cells, lineIndex) => {
      const values: Record<string, CellValue> = { ...shown.source.presetValues };
      cells.forEach((cell, cellIndex) => {
        const column = targetColumns[cellIndex];
        if (column === undefined) return;
        const reading = cell === CLIPBOARD_NULL ? ({ isValid: true, value: null } as const) : readValue(cell, column.valueKind, column.isNotNull);
        if (reading.isValid) values[column.name] = reading.value;
        else problems.push(`line ${lineIndex + 1}, ${column.name}: ${reading.problem}`);
      });
      rows.push({ values });
    });
    if (rows.length === 0) {
      this.deps.notifier.showInfo("The clipboard holds no rows");
      return;
    }
    if (problems.length > 0) {
      this.deps.notifier.showError(`Nothing pasted: ${problems.slice(0, 3).join("; ")}`);
      return;
    }
    try {
      await this.deps.rowService.createRows(shown.definition.name, rows);
      this.deps.notifier.showInfo(rows.length === 1 ? "Row pasted" : `${rows.length} rows pasted`);
      this.observer.changeRows(shown.definition.name);
    } catch (error) {
      this.deps.notifier.showError(`Nothing pasted: ${describeFailure(error, console)}`);
    }
    await this.loadPage(shown);
  }

  private rowMenu(shown: ShownTable, row: Row, gridColumn: GridColumn | null): readonly MenuItem[] {
    const isWritable = this.isWritable(shown);
    const navigator = this.document.defaultView?.navigator;
    const shortcut = (key: string): string | null => (navigator === undefined ? null : formatShortcut(navigator, key));
    const selectedCount = shown.selected.size;
    const item = (caption: string, choose: () => void, isEnabled = true, isDangerous = false, keys: string | null = null): MenuItem => ({ caption, shortcut: keys, isEnabled, isDangerous, choose });
    const items: MenuItem[] = [
      item("Edit row…", () => void this.editRow(shown, row), isWritable, false, "Enter"),
      item("Duplicate row…", () => void this.duplicateChosenRow(shown), isWritable),
      item(selectedCount > 1 ? `Copy ${selectedCount} rows` : "Copy row", () => void this.copySelectedRows(shown), true, false, shortcut("C")),
      item("Paste rows", () => void this.pasteRows(shown), isWritable, false, shortcut("V")),
    ];
    if (gridColumn?.kind === "value") {
      const column = gridColumn.column;
      const value = row.values[column.name] ?? null;
      items.push(item(`Filter: ${column.name} = ${formatCellText(value, column.valueKind)}`, () => this.addCondition(shown, { columnName: column.name, comparison: value === null ? "is-null" : "equals", value })));
      items.push(item(`Filter by ${column.name}…`, () => this.openFilterEditor(shown, column.name, value)));
      items.push(item(`Set ${column.name} to NULL`, () => void this.updateRow(shown, row, { [column.name]: null }), isWritable && value !== null && !column.isNotNull && column.generated === null));
    }
    for (const foreignKey of shown.definition.foreignKeys) {
      const values = selectReferenceValues(row, foreignKey);
      items.push(item(`Open ${describeForeignKey(foreignKey)}`, () => void this.openReferencedRow(foreignKey, values), !values.some((value) => value === null)));
    }
    items.push(item(selectedCount > 1 ? `Delete ${selectedCount} rows` : "Delete row", () => void this.deleteSelectedRows(shown), isWritable, true, "Delete"));
    return items;
  }

  private addCondition(shown: ShownTable, condition: ColumnCondition): void {
    this.changeView(shown, { ...shown.view, offset: 0, conditions: [...shown.view.conditions, condition] });
  }

  private async openReferencedRow(foreignKey: ForeignKey, values: readonly CellValue[]): Promise<void> {
    try {
      const [target] = await this.deps.rowService.selectMatchingRows(foreignKey.targetTableName, foreignKey.targetColumnNames, [values]);
      if (target === null || target === undefined) this.deps.notifier.showError(`${describeForeignKey(foreignKey)} has no row ${values.map((value) => formatCellText(value, "any")).join(", ")}`);
      else this.observer.openReferencedRow(foreignKey.targetTableName, target);
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
    }
  }

  private handleKey(event: KeyboardEvent): void {
    const shown = this.shown;
    const navigator = this.document.defaultView?.navigator;
    if (shown === null || navigator === undefined || (event.target as HTMLElement).closest("input, select, textarea") !== null) return;
    const chosenIndex = shown.rows.findIndex((row) => isSameKey(row.key, shown.chosenKey));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const index = Math.max(0, Math.min(shown.rows.length - 1, chosenIndex + (event.key === "ArrowDown" ? 1 : -1)));
      this.chooseRow(shown, index, event);
      this.scroll.querySelectorAll("tbody tr")[index]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && chosenIndex !== -1 && this.isWritable(shown)) {
      event.preventDefault();
      const row = shown.rows[chosenIndex];
      if (row !== undefined) void this.editRow(shown, row);
    } else if ((event.key === "Delete" || event.key === "Backspace") && this.isWritable(shown)) {
      event.preventDefault();
      void this.deleteSelectedRows(shown);
    } else if (isCommandKey(event, navigator) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void this.copySelectedRows(shown);
    } else if (isCommandKey(event, navigator) && event.key.toLowerCase() === "v" && this.isWritable(shown)) {
      event.preventDefault();
      void this.pasteRows(shown);
    } else if (isCommandKey(event, navigator) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      shown.selected = new Set(shown.rows.map((_, index) => index));
      this.scroll.querySelectorAll<HTMLElement>("tbody tr").forEach((element) => element.classList.add("dm-selected"));
      this.renderPager(shown, this.deps.settingsStore.load().pageRowCount);
    }
  }

  private findChosenRow(shown: ShownTable): Row | null {
    return shown.rows.find((row) => isSameKey(row.key, shown.chosenKey)) ?? null;
  }

  private selectSelectedRows(shown: ShownTable): readonly Row[] {
    return [...shown.selected].sort((first, second) => first - second).flatMap((index) => (shown.rows[index] === undefined ? [] : [shown.rows[index]]));
  }
}
