// TableDesigner as a wide modal dialog of sections: the table, its columns, primary key, unique sets, foreign keys, checks, indexes.
// A structural change redraws the sections, a typed value only updates the state; the plugin's violations mark their fields.

import type { ForeignKeyAction } from "@db-manager/connector";
import type { SchemaChangePlan } from "@db-manager/connector";
import type { TableDefinition } from "@db-manager/connector";
import type { TableName } from "@db-manager/connector";
import type { TableSummary } from "@db-manager/connector";
import type { TableDesigner } from "@db-manager/editor";
import type { TableDesignerDeps } from "@db-manager/editor";
import type { TableDesignerFactory } from "@db-manager/editor";

import { createButton, createCheckbox, createElement, createIconButton, createSelect, createTextInput } from "../utils/dom.js";
import { openModalDialog } from "../utils/modalDialog.js";
import type { ModalDialog } from "../utils/modalDialog.js";
import { describeFailure, isRefusal } from "../utils/refusal.js";
import { addColumn, createNewTableState, createStateFromDefinition, moveItem, removeColumn, toTableDraft } from "./designerState.js";
import type { ColumnState } from "./designerState.js";
import type { DesignerState } from "./designerState.js";
import type { ForeignKeyState } from "./designerState.js";
import type { IndexPartState } from "./designerState.js";

const ACTION_OPTIONS: readonly (readonly [ForeignKeyAction, string])[] = [
  ["no-action", "No action"],
  ["restrict", "Restrict"],
  ["cascade", "Cascade"],
  ["set-null", "Set NULL"],
  ["set-default", "Set default"],
];
const SELF_TARGET = "\u0000self";
const EXPRESSION_PART = "\u0000expression";

export const buildDialogTableDesigner: TableDesignerFactory = (document, deps) => new DialogTableDesigner(document, deps);

class DialogTableDesigner implements TableDesigner {
  constructor(
    private readonly document: Document,
    private readonly deps: TableDesignerDeps,
  ) {}

  async open(tableName: TableName | null): Promise<TableName | null> {
    let state: DesignerState;
    let tables: readonly TableSummary[];
    try {
      tables = await this.deps.tableCatalog.selectTables();
      state = tableName === null ? createNewTableState() : createStateFromDefinition(await this.deps.tableCatalog.getDefinition(tableName));
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
      return null;
    }
    return new Promise((resolve) => {
      const modal = openModalDialog(this.document, tableName === null ? "New table" : `Table ${tableName}`, () => resolve(null), true);
      const session = new DesignerSession(this.document, this.deps, modal, state, tableName, tables.filter((table) => table.kind === "table").map((table) => table.name), resolve);
      session.render();
    });
  }
}

/** One opening of the designer: its state, its fields by the draft path the plugin's violations name. */
class DesignerSession {
  private readonly problems: HTMLElement;
  private readonly body: HTMLElement;
  private readonly fieldsByPath = new Map<string, HTMLElement>();
  private readonly targetDefinitions = new Map<string, TableDefinition>();
  private readonly typeList: HTMLDataListElement;

  constructor(
    private readonly document: Document,
    private readonly deps: TableDesignerDeps,
    private readonly modal: ModalDialog,
    private readonly state: DesignerState,
    private readonly tableName: TableName | null,
    private readonly tableNames: readonly string[],
    private readonly resolve: (name: TableName | null) => void,
  ) {
    this.problems = createElement(document, "div", "dm-dialog-problems");
    this.body = createElement(document, "div", "dm-section");
    this.typeList = createElement(document, "datalist");
    this.typeList.id = `dm-types-${Math.random().toString(36).slice(2)}`;
    for (const suggestion of deps.descriptor.columnTypes) {
      const option = createElement(document, "option");
      option.value = suggestion.type;
      this.typeList.append(option);
    }
    modal.content.append(this.problems, this.body, this.typeList);
    const preview = createButton(document, "Show SQL", "dm-button", () => void this.preview());
    const apply = createButton(document, tableName === null ? "Create table" : "Apply changes", "dm-button dm-primary", () => void this.apply(apply));
    modal.foot.append(preview, createElement(document, "span", "dm-spacer"), createButton(document, "Cancel", "dm-button", () => modal.cancel()), apply);
    void this.loadTargets();
  }

  render(): void {
    this.fieldsByPath.clear();
    this.body.replaceChildren(
      this.renderTable(),
      this.renderColumns(),
      this.renderPrimaryKey(),
      this.renderForeignKeys(),
      this.renderUniqueConstraints(),
      this.renderChecks(),
      this.renderIndexes(),
    );
  }

  private renderTable(): HTMLElement {
    const section = this.section("Table", null);
    const line = createElement(this.document, "div", "dm-design-line");
    const name = this.textInput(this.state.name, "Table name", "name", (value) => (this.state.name = value));
    name.style.maxWidth = "360px";
    line.append(name);
    const options = createElement(this.document, "div", "dm-options");
    for (const option of this.deps.descriptor.tableOptions) {
      const checkbox = createCheckbox(this.document, this.state.options[option.key] === true, option.caption);
      checkbox.label.title = option.description;
      checkbox.input.addEventListener("change", () => (this.state.options[option.key] = checkbox.input.checked));
      this.fieldsByPath.set(`options.${option.key}`, checkbox.label);
      options.append(checkbox.label);
    }
    section.append(line, options);
    return section;
  }

  private renderColumns(): HTMLElement {
    const section = this.section("Columns", () => {
      addColumn(this.state);
      this.render();
      this.focusLast(".dm-column-name");
    });
    const table = createElement(this.document, "table", "dm-design-table");
    const head = createElement(this.document, "tr");
    for (const caption of ["Name", "Type", "Not null", "Default", "Key", "Collation", "Computed as", ""]) head.append(createElement(this.document, "th", "", caption));
    table.append(head);
    this.state.columns.forEach((column, index) => table.append(this.renderColumn(column, index)));
    const scroll = createElement(this.document, "div");
    scroll.style.overflowX = "auto";
    scroll.append(table);
    section.append(scroll);
    return section;
  }

  private renderColumn(column: ColumnState, index: number): HTMLElement {
    const row = createElement(this.document, "tr");
    const path = `columns.${index}`;
    const name = this.textInput(column.name, "name", `${path}.name`, (value) => (column.name = value));
    name.classList.add("dm-column-name");
    name.addEventListener("change", () => this.render());
    if (column.sourceName !== null && column.sourceName !== column.name) name.title = `Was ${column.sourceName}`;
    const type = this.textInput(column.type, "type", `${path}.type`, (value) => (column.type = value));
    type.setAttribute("list", this.typeList.id);
    const notNull = createCheckbox(this.document, column.isNotNull, "");
    notNull.input.addEventListener("change", () => (column.isNotNull = notNull.input.checked));
    const keyPosition = this.state.primaryKeyColumnIds.indexOf(column.id);
    const key = createCheckbox(this.document, keyPosition !== -1, keyPosition === -1 || this.state.primaryKeyColumnIds.length < 2 ? "" : String(keyPosition + 1));
    key.input.addEventListener("change", () => {
      this.state.primaryKeyColumnIds = key.input.checked ? [...this.state.primaryKeyColumnIds, column.id] : this.state.primaryKeyColumnIds.filter((id) => id !== column.id);
      this.render();
    });
    const generated = createElement(this.document, "div", "dm-generated");
    const storage = createSelect(this.document, [["virtual", "virtual"], ["stored", "stored"]], column.generatedStorage);
    storage.addEventListener("change", () => (column.generatedStorage = storage.value === "stored" ? "stored" : "virtual"));
    generated.append(this.textInput(column.generatedExpression, "expression", `${path}.generated`, (value) => (column.generatedExpression = value)), storage);
    const tools = createElement(this.document, "div", "dm-form-row");
    tools.append(
      createIconButton(this.document, "↑", "Move up", () => {
        moveItem(this.state.columns, index, -1);
        this.render();
      }),
      createIconButton(this.document, "↓", "Move down", () => {
        moveItem(this.state.columns, index, 1);
        this.render();
      }),
      createIconButton(this.document, "✕", column.sourceName === null ? "Remove the column" : "Drop the column with its values", () => {
        removeColumn(this.state, column.id);
        this.render();
      }),
    );
    const cells = [
      name,
      type,
      notNull.label,
      this.textInput(column.defaultExpression, "none", `${path}.defaultExpression`, (value) => (column.defaultExpression = value)),
      key.label,
      this.textInput(column.collation, "", `${path}.collation`, (value) => (column.collation = value)),
      generated,
      tools,
    ];
    for (const cell of cells) {
      const td = createElement(this.document, "td");
      td.append(cell);
      row.append(td);
    }
    this.fieldsByPath.set(path, row);
    return row;
  }

  private renderPrimaryKey(): HTMLElement {
    const section = this.section("Primary key", null);
    const line = createElement(this.document, "div", "dm-design-line");
    line.append(this.columnListEditor(this.state.primaryKeyColumnIds, "primaryKeyColumnNames", "No primary key: rows are told apart by the row id, where the database keeps one"));
    section.append(line);
    return section;
  }

  private renderForeignKeys(): HTMLElement {
    const section = this.section("Foreign keys", () => {
      const firstTarget = this.tableNames.find((name) => name !== this.tableName) ?? this.state.name;
      const foreignKey: ForeignKeyState = { name: "", columnIds: [], targetTableName: firstTarget, targetColumnNames: [], onUpdate: "no-action", onDelete: "no-action" };
      this.state.foreignKeys.push(foreignKey);
      void this.fillPairs(foreignKey).then(() => this.render());
    });
    if (this.state.foreignKeys.length === 0) section.append(createElement(this.document, "div", "dm-muted", "No references to other tables"));
    this.state.foreignKeys.forEach((foreignKey, index) => section.append(this.renderForeignKey(foreignKey, index)));
    return section;
  }

  private renderForeignKey(foreignKey: ForeignKeyState, index: number): HTMLElement {
    const path = `foreignKeys.${index}`;
    const item = createElement(this.document, "div", "dm-design-item");
    const line = createElement(this.document, "div", "dm-design-line");
    const isSelf = foreignKey.targetTableName.toLowerCase() === this.state.name.toLowerCase();
    const targetOptions: (readonly [string, string])[] = [[SELF_TARGET, `${this.state.name || "this table"} (itself)`], ...this.tableNames.filter((name) => name.toLowerCase() !== (this.tableName ?? "").toLowerCase()).map((name) => [name, name] as const)];
    const target = createSelect(this.document, targetOptions, isSelf ? SELF_TARGET : foreignKey.targetTableName);
    target.addEventListener("change", () => {
      foreignKey.targetTableName = target.value === SELF_TARGET ? this.state.name : target.value;
      foreignKey.columnIds = [];
      foreignKey.targetColumnNames = [];
      void this.fillPairs(foreignKey).then(() => this.render());
    });
    this.fieldsByPath.set(`${path}.targetTableName`, target);
    const onUpdate = createSelect(this.document, ACTION_OPTIONS, foreignKey.onUpdate);
    onUpdate.addEventListener("change", () => (foreignKey.onUpdate = onUpdate.value as ForeignKeyAction));
    const onDelete = createSelect(this.document, ACTION_OPTIONS, foreignKey.onDelete);
    onDelete.addEventListener("change", () => (foreignKey.onDelete = onDelete.value as ForeignKeyAction));
    line.append(
      createElement(this.document, "span", "dm-muted", "Refers to"),
      target,
      createElement(this.document, "span", "dm-muted", "on update"),
      onUpdate,
      createElement(this.document, "span", "dm-muted", "on delete"),
      onDelete,
      this.textInput(foreignKey.name, "constraint name (optional)", `${path}.name`, (value) => (foreignKey.name = value)),
      createIconButton(this.document, "✕", "Remove the foreign key", () => {
        this.state.foreignKeys.splice(index, 1);
        this.render();
      }),
    );
    const pairs = createElement(this.document, "div", "dm-pairs");
    const targetColumns = this.selectTargetColumnNames(foreignKey);
    foreignKey.columnIds.forEach((columnId, pairIndex) => {
      const pair = createElement(this.document, "div", "dm-pair");
      const own = createSelect(this.document, this.state.columns.map((column) => [String(column.id), column.name] as const), String(columnId));
      own.addEventListener("change", () => (foreignKey.columnIds[pairIndex] = Number(own.value)));
      const targetColumnName = foreignKey.targetColumnNames[pairIndex] ?? "";
      const options = targetColumns.includes(targetColumnName) ? targetColumns : [...targetColumns, targetColumnName];
      const theirs = createSelect(this.document, options.map((name) => [name, name] as const), targetColumnName);
      theirs.addEventListener("change", () => (foreignKey.targetColumnNames[pairIndex] = theirs.value));
      this.fieldsByPath.set(`${path}.columnNames.${pairIndex}`, own);
      this.fieldsByPath.set(`${path}.targetColumnNames.${pairIndex}`, theirs);
      pair.append(
        own,
        createElement(this.document, "span", "dm-muted", "→"),
        theirs,
        createIconButton(this.document, "✕", "Remove the pair", () => {
          foreignKey.columnIds.splice(pairIndex, 1);
          foreignKey.targetColumnNames.splice(pairIndex, 1);
          this.render();
        }),
      );
      pairs.append(pair);
    });
    const addPair = createButton(this.document, "＋ Column pair", "dm-button", () => {
      foreignKey.columnIds.push(this.state.columns[0]?.id ?? 0);
      foreignKey.targetColumnNames.push(targetColumns[0] ?? "");
      this.render();
    });
    addPair.style.alignSelf = "flex-start";
    this.fieldsByPath.set(`${path}.columnNames`, pairs);
    this.fieldsByPath.set(`${path}.targetColumnNames`, pairs);
    this.fieldsByPath.set(path, item);
    item.append(line, pairs, addPair);
    return item;
  }

  private renderUniqueConstraints(): HTMLElement {
    const section = this.section("Unique column sets", () => {
      this.state.uniqueConstraints.push({ name: "", columnIds: [this.state.columns[0]?.id ?? 0] });
      this.render();
    });
    if (this.state.uniqueConstraints.length === 0) section.append(createElement(this.document, "div", "dm-muted", "None"));
    this.state.uniqueConstraints.forEach((constraint, index) => {
      const path = `uniqueConstraints.${index}`;
      const item = createElement(this.document, "div", "dm-design-line");
      item.append(
        this.columnListEditor(constraint.columnIds, `${path}.columnNames`, ""),
        this.textInput(constraint.name, "constraint name (optional)", `${path}.name`, (value) => (constraint.name = value)),
        createIconButton(this.document, "✕", "Remove the unique set", () => {
          this.state.uniqueConstraints.splice(index, 1);
          this.render();
        }),
      );
      this.fieldsByPath.set(path, item);
      section.append(item);
    });
    return section;
  }

  private renderChecks(): HTMLElement {
    const section = this.section("Checks", () => {
      this.state.checks.push({ name: "", expression: "" });
      this.render();
      this.focusLast(".dm-check-expression");
    });
    if (this.state.checks.length === 0) section.append(createElement(this.document, "div", "dm-muted", "None"));
    this.state.checks.forEach((check, index) => {
      const path = `checks.${index}`;
      const item = createElement(this.document, "div", "dm-design-line");
      const expression = this.textInput(check.expression, "condition, as SQL: price >= 0", `${path}.expression`, (value) => (check.expression = value));
      expression.classList.add("dm-check-expression", "dm-mono");
      expression.style.flex = "3";
      item.append(
        expression,
        this.textInput(check.name, "constraint name (optional)", `${path}.name`, (value) => (check.name = value)),
        createIconButton(this.document, "✕", "Remove the check", () => {
          this.state.checks.splice(index, 1);
          this.render();
        }),
      );
      section.append(item);
    });
    return section;
  }

  private renderIndexes(): HTMLElement {
    const section = this.section("Indexes", () => {
      const firstColumn = this.state.columns[0];
      this.state.indexes.push({ name: `${this.state.name}_index_${this.state.indexes.length + 1}`, isUnique: false, whereExpression: "", parts: firstColumn === undefined ? [] : [{ kind: "column", columnId: firstColumn.id, order: "ascending" }] });
      this.render();
    });
    if (this.state.indexes.length === 0) section.append(createElement(this.document, "div", "dm-muted", "None"));
    this.state.indexes.forEach((index, position) => {
      const path = `indexes.${position}`;
      const item = createElement(this.document, "div", "dm-design-item");
      const line = createElement(this.document, "div", "dm-design-line");
      const unique = createCheckbox(this.document, index.isUnique, "unique");
      unique.input.addEventListener("change", () => (index.isUnique = unique.input.checked));
      line.append(
        this.textInput(index.name, "index name", `${path}.name`, (value) => (index.name = value)),
        unique.label,
        this.textInput(index.whereExpression, "only rows where… (optional)", `${path}.whereExpression`, (value) => (index.whereExpression = value)),
        createIconButton(this.document, "✕", "Remove the index", () => {
          this.state.indexes.splice(position, 1);
          this.render();
        }),
      );
      const parts = createElement(this.document, "div", "dm-pairs");
      index.parts.forEach((part, partIndex) => parts.append(this.renderIndexPart(index.parts, part, partIndex, `${path}.parts.${partIndex}`)));
      const addPart = createButton(this.document, "＋ Key part", "dm-button", () => {
        index.parts.push({ kind: "column", columnId: this.state.columns[0]?.id ?? 0, order: "ascending" });
        this.render();
      });
      addPart.style.alignSelf = "flex-start";
      this.fieldsByPath.set(`${path}.parts`, parts);
      this.fieldsByPath.set(path, item);
      item.append(line, parts, addPart);
      section.append(item);
    });
    return section;
  }

  private renderIndexPart(parts: IndexPartState[], part: IndexPartState, partIndex: number, path: string): HTMLElement {
    const line = createElement(this.document, "div", "dm-pair");
    const options: (readonly [string, string])[] = [...this.state.columns.map((column) => [String(column.id), column.name] as const), [EXPRESSION_PART, "an expression…"]];
    const source = createSelect(this.document, options, part.kind === "column" ? String(part.columnId) : EXPRESSION_PART);
    const order = createSelect(this.document, [["ascending", "ascending"], ["descending", "descending"]], part.order);
    source.addEventListener("change", () => {
      parts[partIndex] = source.value === EXPRESSION_PART ? { kind: "expression", expression: "", order: part.order } : { kind: "column", columnId: Number(source.value), order: part.order };
      this.render();
    });
    order.addEventListener("change", () => (part.order = order.value === "descending" ? "descending" : "ascending"));
    line.append(source);
    if (part.kind === "expression") {
      const expression = this.textInput(part.expression, "lower(name)", path, (value) => (part.expression = value));
      expression.classList.add("dm-mono");
      line.append(expression);
    } else {
      this.fieldsByPath.set(path, source);
    }
    line.append(
      order,
      createIconButton(this.document, "✕", "Remove the key part", () => {
        parts.splice(partIndex, 1);
        this.render();
      }),
    );
    return line;
  }

  /** An ordered list of columns as selects: the primary key's, a unique set's. */
  private columnListEditor(columnIds: number[], path: string, emptyText: string): HTMLElement {
    const editor = createElement(this.document, "div", "dm-design-line");
    if (columnIds.length === 0 && emptyText !== "") editor.append(createElement(this.document, "span", "dm-muted", emptyText));
    columnIds.forEach((columnId, index) => {
      const select = createSelect(this.document, this.state.columns.map((column) => [String(column.id), column.name] as const), String(columnId));
      select.style.flex = "0 1 160px";
      select.addEventListener("change", () => {
        columnIds[index] = Number(select.value);
        this.render();
      });
      this.fieldsByPath.set(`${path}.${index}`, select);
      editor.append(
        select,
        createIconButton(this.document, "✕", "Remove", () => {
          columnIds.splice(index, 1);
          this.render();
        }),
      );
    });
    editor.append(
      createIconButton(this.document, "＋", "Add a column", () => {
        const next = this.state.columns.find((column) => !columnIds.includes(column.id)) ?? this.state.columns[0];
        if (next !== undefined) columnIds.push(next.id);
        this.render();
      }),
    );
    this.fieldsByPath.set(path, editor);
    return editor;
  }

  private section(title: string, onAdd: (() => void) | null): HTMLElement {
    const section = createElement(this.document, "section", "dm-section");
    const head = createElement(this.document, "div", "dm-section-head");
    head.append(createElement(this.document, "h3", "", title));
    if (onAdd !== null) head.append(createButton(this.document, "＋ Add", "dm-button", onAdd));
    section.append(head);
    return section;
  }

  private textInput(value: string, placeholder: string, path: string, update: (value: string) => void): HTMLInputElement {
    const input = createTextInput(this.document, value, placeholder);
    input.addEventListener("input", () => {
      update(input.value);
      input.classList.remove("dm-invalid");
    });
    this.fieldsByPath.set(path, input);
    return input;
  }

  private focusLast(selector: string): void {
    const inputs = this.body.querySelectorAll<HTMLInputElement>(selector);
    const last = inputs[inputs.length - 1];
    last?.focus();
    last?.select();
  }

  private selectTargetColumnNames(foreignKey: ForeignKeyState): readonly string[] {
    if (foreignKey.targetTableName.toLowerCase() === this.state.name.toLowerCase()) return this.state.columns.map((column) => column.name);
    return this.targetDefinitions.get(foreignKey.targetTableName.toLowerCase())?.columns.map((column) => column.name) ?? [];
  }

  private async loadTargets(): Promise<void> {
    const names = new Set(this.state.foreignKeys.map((foreignKey) => foreignKey.targetTableName));
    for (const name of names) await this.loadTarget(name);
    this.render();
  }

  private async loadTarget(tableName: string): Promise<TableDefinition | null> {
    const known = this.targetDefinitions.get(tableName.toLowerCase());
    if (known !== undefined) return known;
    if (!this.tableNames.some((name) => name.toLowerCase() === tableName.toLowerCase())) return null;
    try {
      const definition = await this.deps.tableCatalog.getDefinition(tableName);
      this.targetDefinitions.set(tableName.toLowerCase(), definition);
      return definition;
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
      return null;
    }
  }

  /** Pairs the target's primary key columns with this table's columns of the same names, else with the first ones. */
  private async fillPairs(foreignKey: ForeignKeyState): Promise<void> {
    const isSelf = foreignKey.targetTableName.toLowerCase() === this.state.name.toLowerCase();
    const definition = isSelf ? null : await this.loadTarget(foreignKey.targetTableName);
    const keyNames = isSelf
      ? this.state.primaryKeyColumnIds.map((id) => this.state.columns.find((column) => column.id === id)?.name ?? "")
      : (definition?.primaryKeyColumnNames ?? definition?.columns.slice(0, 1).map((column) => column.name) ?? []);
    foreignKey.targetColumnNames = [...keyNames];
    foreignKey.columnIds = keyNames.map((name, index) => {
      const sameName = this.state.columns.find((column) => column.name.toLowerCase() === name.toLowerCase() && !isSelf);
      const prefixed = this.state.columns.find((column) => column.name.toLowerCase() === `${foreignKey.targetTableName}_${name}`.toLowerCase());
      const column = sameName ?? prefixed ?? this.state.columns[Math.min(index, this.state.columns.length - 1)];
      // A column added in this designer takes the type of the column it refers to.
      const targetType = definition?.columns.find((target) => target.name === name)?.type;
      if (column !== undefined && column.sourceName === null && targetType !== undefined && !this.state.primaryKeyColumnIds.includes(column.id)) column.type = targetType;
      return column?.id ?? 0;
    });
  }

  private async preview(): Promise<void> {
    const plan = await this.requestPlan();
    if (plan === null) return;
    const notes = [...(plan.isRebuild ? ["-- The table is rebuilt: a new one is created, its rows copied, the old one dropped."] : []), ...plan.warnings.map((warning) => `-- ${warning}`)];
    await this.deps.dialogService.showText("The change as SQL", [...notes, ...plan.statements.map((statement) => `${statement};`)].join("\n\n"));
  }

  private async requestPlan(): Promise<SchemaChangePlan | null> {
    this.clearProblems();
    const draft = toTableDraft(this.state);
    try {
      return this.tableName === null ? await this.deps.schemaService.previewTableCreation(draft) : await this.deps.schemaService.previewTableAlteration(this.tableName, draft);
    } catch (error) {
      this.showRefusal(error);
      return null;
    }
  }

  private async apply(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      const draft = toTableDraft(this.state);
      if (this.tableName !== null) {
        const plan = await this.requestPlan();
        if (plan === null) return;
        if (plan.warnings.length > 0) {
          const isConfirmed = await this.deps.dialogService.confirm("Apply the change?", plan.warnings.join("\n"), "Apply", true);
          if (!isConfirmed) return;
        }
      }
      try {
        const definition = this.tableName === null ? await this.deps.schemaService.createTable(draft) : await this.deps.schemaService.alterTable(this.tableName, draft);
        this.modal.close();
        this.resolve(definition.name);
      } catch (error) {
        this.showRefusal(error);
      }
    } finally {
      button.disabled = false;
    }
  }

  private clearProblems(): void {
    this.problems.textContent = "";
    this.body.querySelectorAll(".dm-invalid").forEach((element) => element.classList.remove("dm-invalid"));
  }

  /** The refusal's message on top; each violation marks the field of the longest path it names. */
  private showRefusal(error: unknown): void {
    this.problems.textContent = describeFailure(error, console);
    if (isRefusal(error) && "violations" in error && Array.isArray(error.violations)) {
      for (const violation of error.violations as { path: string }[]) {
        const path = [...this.fieldsByPath.keys()].filter((candidate) => violation.path === candidate || violation.path.startsWith(`${candidate}.`)).sort((first, second) => second.length - first.length)[0];
        if (path !== undefined) this.fieldsByPath.get(path)?.classList.add("dm-invalid");
      }
    }
    this.modal.content.scrollTop = 0;
  }
}
