// ReferencingPanel as a tab bar over one grid: a tab per foreign key referring to the shown table, its rows those whose
// foreign key columns equal the chosen row's target columns, pair by pair; a row created there starts with those values.

import type { CellValue } from "@db-manager/connector";
import type { ColumnCondition } from "@db-manager/connector";
import type { ReferencingKey } from "@db-manager/connector";
import type { Row } from "@db-manager/connector";
import type { TableDefinition } from "@db-manager/connector";
import type { ReferencingPanel } from "@db-manager/editor";
import type { ReferencingPanelDeps } from "@db-manager/editor";
import type { ReferencingPanelFactory } from "@db-manager/editor";
import type { ReferencingPanelObserver } from "@db-manager/editor";
import type { TableView } from "@db-manager/editor";

import { createElement } from "./utils/dom.js";
import { describeFailure } from "./utils/refusal.js";

const EMPTY_GRID_VIEW = { offset: 0, sortings: [], conditions: [] } as const;

export const buildTabbedReferencingPanel: ReferencingPanelFactory = (document, deps, observer) => new TabbedReferencingPanel(document, deps, observer);

/** One tab's identity, kept in the table's view: the referencing table and its columns. */
export const toTabId = (key: ReferencingKey): string => `${key.tableName}(${key.foreignKey.columnNames.join(",")})`;

class TabbedReferencingPanel implements ReferencingPanel {
  readonly element: HTMLElement;
  activeTabId: string | null = null;
  private readonly tabBar: HTMLElement;
  private showNumber = 0;

  constructor(
    private readonly document: Document,
    private readonly deps: ReferencingPanelDeps,
    private readonly observer: ReferencingPanelObserver,
  ) {
    this.element = createElement(document, "div", "dm-grid");
    this.tabBar = createElement(document, "div", "dm-tabs");
    this.tabBar.setAttribute("role", "tablist");
    this.element.append(this.tabBar, deps.rowGrid.element);
  }

  async hasTabs(definition: TableDefinition): Promise<boolean> {
    return definition.kind === "table" && (await this.deps.tableCatalog.selectReferencingKeys(definition.name)).length > 0;
  }

  show(definition: TableDefinition, chosenRow: Row | null, view: TableView): void {
    void this.showTabs(definition, chosenRow, view);
  }

  reload(): void {
    this.deps.rowGrid.reload();
  }

  private async showTabs(definition: TableDefinition, chosenRow: Row | null, view: TableView): Promise<void> {
    this.showNumber += 1;
    const showNumber = this.showNumber;
    let keys: readonly ReferencingKey[];
    try {
      keys = await this.deps.tableCatalog.selectReferencingKeys(definition.name);
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
      return;
    }
    if (showNumber !== this.showNumber) return;
    const active = keys.find((key) => toTabId(key) === view.activeTabId) ?? keys[0];
    this.activeTabId = active === undefined ? null : toTabId(active);
    this.renderTabs(keys, active ?? null);
    if (active === undefined) {
      this.deps.rowGrid.clear("No table refers to this one");
      return;
    }
    if (chosenRow === null) {
      this.deps.rowGrid.clear(`Choose a row above to see the rows of ${active.tableName} that refer to it`);
      return;
    }
    const values = active.foreignKey.targetColumnNames.map((name) => chosenRow.values[name] ?? null);
    if (values.some((value) => value === null)) {
      this.deps.rowGrid.clear(`The row's ${active.foreignKey.targetColumnNames.join(", ")} are empty: no row refers to it`);
      return;
    }
    const fixedConditions: ColumnCondition[] = active.foreignKey.columnNames.map((name, index) => ({ columnName: name, comparison: "equals", value: values[index] ?? null }));
    const presetValues: Record<string, CellValue> = {};
    active.foreignKey.columnNames.forEach((name, index) => (presetValues[name] = values[index] ?? null));
    const tabView = view.tabs.find((tab) => tab.tabId === toTabId(active));
    this.deps.rowGrid.show({ tableName: active.tableName, fixedConditions, presetValues, placeholder: `No row of ${active.tableName} refers to this one` }, tabView?.grid ?? EMPTY_GRID_VIEW, null);
  }

  private renderTabs(keys: readonly ReferencingKey[], active: ReferencingKey | null): void {
    const counts = new Map<string, number>();
    for (const key of keys) counts.set(key.tableName, (counts.get(key.tableName) ?? 0) + 1);
    const tabs = keys.map((key) => {
      const tab = createElement(this.document, "button", "dm-tab", key.tableName);
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(key === active));
      if ((counts.get(key.tableName) ?? 0) > 1 || key.foreignKey.columnNames.length > 1) {
        tab.append(createElement(this.document, "span", "dm-tab-columns", `(${key.foreignKey.columnNames.join(", ")})`));
      }
      tab.title = `${key.tableName}.${key.foreignKey.columnNames.join(", ")} → ${key.foreignKey.targetColumnNames.join(", ")}`;
      tab.addEventListener("click", () => this.observer.chooseTab(toTabId(key)));
      return tab;
    });
    this.tabBar.replaceChildren(createElement(this.document, "span", "dm-tabs-caption", "Referred to by"), ...tabs);
  }
}
