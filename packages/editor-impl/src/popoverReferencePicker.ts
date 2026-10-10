// ReferencePicker as a fixed popover under its anchor: a search box, "No reference", a page of the target rows by title, "More".
// Inside a modal dialog it lives in the dialog, the top layer, or the dialog would cover it.

import type { Row } from "@db-manager/connector";
import type { RowPageRequest } from "@db-manager/connector";
import type { TableDefinition } from "@db-manager/connector";
import type { ReferenceChoice } from "@db-manager/editor";
import type { ReferencePicker } from "@db-manager/editor";
import type { ReferencePickerDeps } from "@db-manager/editor";
import type { ReferencePickerFactory } from "@db-manager/editor";

import { PICKER_PAGE_ROW_COUNT } from "./protocol.js";
import { formatCellText } from "./utils/cellText.js";
import { createButton, createElement, createTextInput } from "./utils/dom.js";
import { describeFailure } from "./utils/refusal.js";
import { isSameKey } from "./utils/rowKeys.js";

const ANCHOR_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;
const SEARCH_DELAY_MS = 250;

type PickerAnswer = Row | "none" | null;

export const buildPopoverReferencePicker: ReferencePickerFactory = (document, deps) => new PopoverReferencePicker(document, deps);

class PopoverReferencePicker implements ReferencePicker {
  private popover: HTMLElement | null = null;
  private settle: ((answer: PickerAnswer) => void) | null = null;
  private loadNumber = 0;
  private readonly closeOnOutsideClick = (event: Event): void => {
    if (this.popover !== null && !this.popover.contains(event.target as Node)) this.finish(null);
  };

  constructor(
    private readonly document: Document,
    private readonly deps: ReferencePickerDeps,
  ) {}

  open(anchor: HTMLElement, choice: ReferenceChoice): Promise<PickerAnswer> {
    this.finish(null);
    return new Promise((resolve) => {
      this.settle = resolve;
      void this.build(anchor, choice);
    });
  }

  private async build(anchor: HTMLElement, choice: ReferenceChoice): Promise<void> {
    let definition: TableDefinition;
    try {
      definition = await this.deps.tableCatalog.getDefinition(choice.foreignKey.targetTableName);
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
      this.finish(null);
      return;
    }
    const popover = createElement(this.document, "div", "dm-popover");
    popover.setAttribute("role", "dialog");
    const titleColumn = this.deps.rowTitleService.obtainTitleColumn(definition);
    const searchColumn = titleColumn ?? choice.foreignKey.targetColumnNames[0] ?? null;
    const search = createTextInput(this.document, "", searchColumn === null ? "" : `Search by ${searchColumn}`);
    const searchLine = createElement(this.document, "div", "dm-popover-search");
    searchLine.append(search);
    const list = createElement(this.document, "div", "dm-popover-list");
    list.setAttribute("role", "listbox");
    popover.append(searchLine, list);
    (anchor.closest("dialog") ?? this.document.body).append(popover);
    this.popover = popover;
    this.place(anchor);
    let searchTimer: ReturnType<typeof setTimeout> | null = null;
    search.addEventListener("input", () => {
      if (searchTimer !== null) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => void this.loadRows(list, definition, choice, searchColumn, search.value, 0), SEARCH_DELAY_MS);
    });
    popover.addEventListener("keydown", (event) => this.moveFocus(event, list, search));
    setTimeout(() => this.document.addEventListener("mousedown", this.closeOnOutsideClick, true));
    search.focus();
    await this.loadRows(list, definition, choice, searchColumn, "", 0);
  }

  private async loadRows(list: HTMLElement, definition: TableDefinition, choice: ReferenceChoice, searchColumn: string | null, searchText: string, offset: number): Promise<void> {
    this.loadNumber += 1;
    const loadNumber = this.loadNumber;
    const titleColumn = this.deps.rowTitleService.obtainTitleColumn(definition);
    const request: RowPageRequest = {
      offset,
      rowCount: PICKER_PAGE_ROW_COUNT,
      sortings: titleColumn === null ? [] : [{ columnName: titleColumn, order: "ascending" }],
      conditions: searchText.trim() === "" || searchColumn === null ? [] : [{ columnName: searchColumn, comparison: "contains", value: searchText.trim() }],
    };
    try {
      const page = await this.deps.rowService.getRowPage(definition.name, request);
      if (loadNumber !== this.loadNumber || this.popover === null) return;
      if (offset === 0) {
        list.replaceChildren(this.createItem("— No reference", "", false, () => this.finish("none")));
      }
      list.querySelector(".dm-popover-more")?.remove();
      const currentKey = choice.currentValues;
      for (const row of page.rows) {
        const targetValues = choice.foreignKey.targetColumnNames.map((name) => row.values[name] ?? null);
        const title = this.deps.rowTitleService.formatTitle(definition, row, targetValues);
        const keyText = targetValues.map((value) => formatCellText(value, "any")).join(", ");
        list.append(this.createItem(title, keyText === title ? "" : keyText, isSameKey(targetValues, currentKey), () => this.finish(row)));
      }
      if (page.rows.length === 0 && offset === 0) list.append(createElement(this.document, "div", "dm-empty", "No rows"));
      if (offset + page.rows.length < page.totalCount) {
        const more = createButton(this.document, `More (${page.totalCount - offset - page.rows.length} left)`, "dm-popover-item dm-popover-more dm-muted", () => {
          void this.loadRows(list, definition, choice, searchColumn, searchText, offset + page.rows.length);
        });
        list.append(more);
      }
    } catch (error) {
      if (loadNumber === this.loadNumber) this.deps.notifier.showError(describeFailure(error, console));
    }
  }

  private createItem(title: string, keyText: string, isCurrent: boolean, choose: () => void): HTMLButtonElement {
    const item = createButton(this.document, "", `dm-popover-item${isCurrent ? " dm-current" : ""}`, choose);
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(isCurrent));
    item.append(createElement(this.document, "span", "", `${isCurrent ? "✓ " : ""}${title}`));
    if (keyText !== "") item.append(createElement(this.document, "span", "dm-popover-key", keyText));
    return item;
  }

  private place(anchor: HTMLElement): void {
    const popover = this.popover;
    if (popover === null) return;
    const view = this.document.defaultView;
    const box = anchor.getBoundingClientRect();
    const width = popover.getBoundingClientRect().width;
    const viewportWidth = view?.innerWidth ?? width;
    const viewportHeight = view?.innerHeight ?? 0;
    popover.style.left = `${Math.max(VIEWPORT_MARGIN_PX, Math.min(box.left, viewportWidth - width - VIEWPORT_MARGIN_PX))}px`;
    const below = box.bottom + ANCHOR_GAP_PX;
    if (viewportHeight - below > viewportHeight / 3) popover.style.top = `${below}px`;
    else popover.style.bottom = `${viewportHeight - box.top + ANCHOR_GAP_PX}px`;
  }

  private moveFocus(event: KeyboardEvent, list: HTMLElement, search: HTMLInputElement): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.finish(null);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...list.querySelectorAll<HTMLButtonElement>("button")];
    const current = items.indexOf(this.document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowUp" && current <= 0) {
      search.focus();
      return;
    }
    items[Math.min(items.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))]?.focus();
  }

  private finish(answer: PickerAnswer): void {
    this.loadNumber += 1;
    this.popover?.remove();
    this.popover = null;
    this.document.removeEventListener("mousedown", this.closeOnOutsideClick, true);
    const settle = this.settle;
    this.settle = null;
    settle?.(answer);
  }
}

