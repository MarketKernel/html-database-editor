// RowForm as a modal dialog: a field per column, a foreign key's line under its last column with the title of its target
// and a drop-down that sets all its columns. Creating, an empty field takes the column's default; every problem shown at once.

import type { CellValue } from "@db-manager/connector";
import type { ColumnDefinition } from "@db-manager/connector";
import type { ForeignKey } from "@db-manager/connector";
import type { Row } from "@db-manager/connector";
import type { TableDefinition } from "@db-manager/connector";
import type { RowForm } from "@db-manager/editor";
import type { RowFormDeps } from "@db-manager/editor";
import type { RowFormFactory } from "@db-manager/editor";
import type { RowFormRequest } from "@db-manager/editor";

import { formatByteCount, formatEditText, isSameValue } from "./utils/cellText.js";
import { createButton, createElement, createSelect, createTextInput } from "./utils/dom.js";
import { openModalDialog } from "./utils/modalDialog.js";
import type { ModalDialog } from "./utils/modalDialog.js";
import { describeFailure, isRefusal } from "./utils/refusal.js";
import { selectTargetValues } from "./utils/rowKeys.js";
import { readValue } from "./utils/valueInput.js";

const LONG_TEXT_LENGTH = 60;
const TEXTAREA_ROWS = 3;

/** One column's control: what it holds as typed, and where its problem shows. */
interface ColumnField {
  readonly column: ColumnDefinition;
  readonly input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  readonly problem: HTMLElement;
  /** A BLOB's bytes, set by its buttons; undefined: untouched. */
  bytes: Uint8Array | null | undefined;
  /** Whether the user touched the field: creating, an untouched empty field is left to the column's default. */
  isTouched: boolean;
}

export const buildDialogRowForm: RowFormFactory = (document, deps) => new DialogRowForm(document, deps);

class DialogRowForm implements RowForm {
  constructor(
    private readonly document: Document,
    private readonly deps: RowFormDeps,
  ) {}

  async open(request: RowFormRequest): Promise<Row | null> {
    let definition: TableDefinition;
    try {
      definition = await this.deps.tableCatalog.getDefinition(request.tableName);
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
      return null;
    }
    return new Promise((resolve) => {
      const title = request.kind === "create" ? `New row of ${definition.name}` : `Row of ${definition.name}`;
      const modal = openModalDialog(this.document, title, () => resolve(null), true);
      const problems = createElement(this.document, "div", "dm-dialog-problems");
      const grid = createElement(this.document, "div", "dm-form-grid");
      modal.content.append(problems, grid);
      const initialValues = request.kind === "create" ? request.values : request.row.values;
      const fields = definition.columns.map((column) => this.createField(grid, column, initialValues[column.name], request.kind === "create" && column.name in initialValues));
      for (const foreignKey of definition.foreignKeys) this.appendReference(grid, foreignKey, fields);
      const save = createButton(this.document, request.kind === "create" ? "Create" : "Save", "dm-button dm-primary", () => {
        void this.save(request, definition, fields, problems, modal, save).then((row) => {
          if (row === null) return;
          modal.close();
          resolve(row);
        });
      });
      modal.foot.append(createButton(this.document, "Cancel", "dm-button", () => modal.cancel()), save);
      modal.dialog.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) save.click();
      });
      fields.find((field) => field.input !== null && !field.input.disabled)?.input?.focus();
    });
  }

  private createField(grid: HTMLElement, column: ColumnDefinition, initialValue: CellValue | undefined, isPreset: boolean): ColumnField {
    const label = createElement(this.document, "div", "dm-form-label", column.name);
    const marks = [column.type || "no type", column.isNotNull ? "NOT NULL" : "", column.generated !== null ? "computed" : "", column.defaultExpression !== null ? `default ${column.defaultExpression}` : ""];
    label.append(createElement(this.document, "small", "", marks.filter((mark) => mark !== "").join(" · ")));
    const control = createElement(this.document, "div", "dm-form-control");
    const problem = createElement(this.document, "div", "dm-field-problem");
    const value = initialValue ?? null;
    const field: ColumnField = { column, input: null, problem, bytes: undefined, isTouched: isPreset };
    if (column.generated !== null) {
      control.append(createElement(this.document, "div", "dm-muted", `${initialValue === undefined ? "computed" : formatEditText(value)} — ${column.generated.expression}`));
    } else if (column.valueKind === "blob" || value instanceof Uint8Array) {
      control.append(this.createBlobControl(field, value));
    } else {
      const input = this.createInput(column, value);
      input.addEventListener("input", () => {
        field.isTouched = true;
        input.classList.remove("dm-invalid");
        problem.textContent = "";
      });
      control.append(input);
      Object.assign(field, { input });
    }
    control.append(problem);
    grid.append(label, control);
    return field;
  }

  private createInput(column: ColumnDefinition, value: CellValue): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
    const text = formatEditText(value);
    if (column.valueKind === "boolean") {
      const options: (readonly [string, string])[] = [["1", "true"], ["0", "false"]];
      if (!column.isNotNull) options.unshift(["", "NULL"]);
      const isKnown = text === "" || text === "1" || text === "0";
      if (!isKnown) options.push([text, text]);
      return createSelect(this.document, options, text);
    }
    if (column.valueKind === "text" && (text.length > LONG_TEXT_LENGTH || text.includes("\n"))) {
      const area = createElement(this.document, "textarea", "dm-textarea");
      area.rows = TEXTAREA_ROWS;
      area.value = text;
      return area;
    }
    const input = createTextInput(this.document, text, placeholderOf(column));
    if (column.valueKind === "integer" || column.valueKind === "real" || column.valueKind === "numeric") input.inputMode = "decimal";
    return input;
  }

  private createBlobControl(field: ColumnField, value: CellValue): HTMLElement {
    const line = createElement(this.document, "div", "dm-form-row");
    const info = createElement(this.document, "span", "dm-muted");
    const describe = (): void => {
      const bytes = field.bytes === undefined ? value : field.bytes;
      info.textContent = bytes === null ? "NULL" : bytes instanceof Uint8Array ? formatByteCount(bytes.byteLength) : String(bytes);
    };
    describe();
    line.append(
      info,
      createButton(this.document, "Load file…", "dm-button", () => {
        void this.deps.fileService.pickFile("*").then((file) => {
          if (file === null) return;
          field.bytes = file.bytes;
          field.isTouched = true;
          describe();
        });
      }),
      createButton(this.document, "Save to file…", "dm-button", () => {
        const bytes = field.bytes === undefined ? value : field.bytes;
        if (bytes instanceof Uint8Array) void this.deps.fileService.saveFile(`${field.column.name}.bin`, bytes);
      }),
      createButton(this.document, "Clear", "dm-button", () => {
        field.bytes = null;
        field.isTouched = true;
        describe();
      }),
    );
    return line;
  }

  /** A line under the foreign key's last column: its target's title and the drop-down that sets every column of it. */
  private appendReference(grid: HTMLElement, foreignKey: ForeignKey, fields: readonly ColumnField[]): void {
    const keyFields = foreignKey.columnNames.map((name) => fields.find((field) => field.column.name === name));
    const lastField = keyFields[keyFields.length - 1];
    if (lastField === undefined || keyFields.some((field) => field?.input === null || field === undefined)) return;
    const group = createElement(this.document, "div", "dm-reference-group");
    const head = createElement(this.document, "div", "dm-reference-group-head");
    const caption = createElement(this.document, "span", "dm-reference-group-title", `→ ${foreignKey.targetTableName} (${foreignKey.targetColumnNames.join(", ")})`);
    const title = createElement(this.document, "span", "", "…");
    const pick = createButton(this.document, "Choose ▾", "dm-button", () => {
      void this.deps.referencePicker.open(pick, { foreignKey, currentValues: this.readKeyValues(keyFields) }).then((answer) => {
        if (answer === null) return;
        keyFields.forEach((field, index) => {
          if (field?.input === null || field === undefined) return;
          const targetValue = answer === "none" ? null : (selectTargetValues(answer, foreignKey)[index] ?? null);
          field.input.value = formatEditText(targetValue);
          field.isTouched = true;
        });
        void this.showTitle(title, foreignKey, keyFields);
      });
    });
    head.append(caption, pick);
    group.append(head, title);
    const lastIndex = [...grid.children].indexOf(lastField.problem.parentElement as Element);
    const spacer = createElement(this.document, "div");
    grid.insertBefore(spacer, grid.children[lastIndex + 1] ?? null);
    grid.insertBefore(group, grid.children[lastIndex + 2] ?? null);
    for (const field of keyFields) field?.input?.addEventListener("change", () => void this.showTitle(title, foreignKey, keyFields));
    void this.showTitle(title, foreignKey, keyFields);
  }

  private async showTitle(title: HTMLElement, foreignKey: ForeignKey, keyFields: readonly (ColumnField | undefined)[]): Promise<void> {
    const values = this.readKeyValues(keyFields);
    if (values.some((value) => value === null)) {
      title.textContent = "No reference";
      return;
    }
    try {
      const [text] = await this.deps.rowTitleService.selectTitles(foreignKey, [values]);
      const [row] = await this.deps.rowService.selectMatchingRows(foreignKey.targetTableName, foreignKey.targetColumnNames, [values]);
      title.textContent = row === null ? `${text ?? ""} — no such row` : (text ?? "");
    } catch {
      // A title is a hint: values the target cannot match leave it blank.
      title.textContent = "";
    }
  }

  private readKeyValues(keyFields: readonly (ColumnField | undefined)[]): readonly CellValue[] {
    return keyFields.map((field) => {
      if (field?.input === null || field === undefined) return null;
      const reading = readValue(field.input.value, field.column.valueKind, false);
      return reading.isValid ? reading.value : field.input.value;
    });
  }

  /** The row as written, or null when a problem or a refusal keeps the dialog open. */
  private async save(request: RowFormRequest, definition: TableDefinition, fields: readonly ColumnField[], problems: HTMLElement, modal: ModalDialog, button: HTMLButtonElement): Promise<Row | null> {
    problems.textContent = "";
    const values: Record<string, CellValue> = {};
    let hasProblem = false;
    for (const field of fields) {
      if (field.column.generated !== null) continue;
      const reading = this.readField(field);
      if (reading === "skip") continue;
      if (!reading.isValid) {
        hasProblem = true;
        field.problem.textContent = reading.problem;
        field.input?.classList.add("dm-invalid");
        continue;
      }
      const original = request.kind === "update" ? (request.row.values[field.column.name] ?? null) : undefined;
      if (request.kind === "update" && original !== undefined && isSameValue(original, reading.value)) continue;
      if (request.kind === "create" && !field.isTouched && reading.value === null) continue;
      values[field.column.name] = reading.value;
    }
    if (hasProblem) {
      problems.textContent = "Some fields need a look";
      return null;
    }
    button.disabled = true;
    try {
      return request.kind === "create"
        ? ((await this.deps.rowService.createRows(definition.name, [{ values }]))[0] ?? null)
        : await this.deps.rowService.updateRow(definition.name, request.row.key ?? [], { values });
    } catch (error) {
      problems.textContent = describeFailure(error, console);
      const columnNames = isRefusal(error) && "columnNames" in error && Array.isArray(error.columnNames) ? (error.columnNames as string[]) : [];
      for (const field of fields) if (columnNames.includes(field.column.name)) field.input?.classList.add("dm-invalid");
      modal.content.scrollTop = 0;
      return null;
    } finally {
      button.disabled = false;
    }
  }

  private readField(field: ColumnField): ReturnType<typeof readValue> | "skip" {
    if (field.input === null) return field.bytes === undefined ? "skip" : { isValid: true, value: field.bytes };
    return readValue(field.input.value, field.column.valueKind, field.column.isNotNull);
  }
}

const placeholderOf = (column: ColumnDefinition): string => {
  if (column.defaultExpression !== null) return `default: ${column.defaultExpression}`;
  switch (column.valueKind) {
    case "date":
      return "YYYY-MM-DD";
    case "datetime":
      return "YYYY-MM-DD HH:MM:SS";
    default:
      return column.isNotNull ? "" : "NULL";
  }
};
