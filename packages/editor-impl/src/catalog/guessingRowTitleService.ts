// RowTitleService: the user's title column for a table, kept in the settings, else a guess from the column names and types.

import type { CellValue } from "@db-manager/connector";
import type { ColumnName } from "@db-manager/connector";
import type { ForeignKey } from "@db-manager/connector";
import type { Row } from "@db-manager/connector";
import type { TableDefinition } from "@db-manager/connector";
import type { TableName } from "@db-manager/connector";
import type { RowTitleService } from "@db-manager/editor";
import type { RowTitleServiceDeps } from "@db-manager/editor";
import type { RowTitleServiceFactory } from "@db-manager/editor";

import { formatCellText } from "../utils/cellText.js";

/** The column names that most often name a row, best first. */
const TITLE_NAMES: readonly string[] = ["name", "title", "caption", "label", "full_name", "fullname", "display_name", "description", "code"];

export const buildGuessingRowTitleService: RowTitleServiceFactory = (deps) => new GuessingRowTitleService(deps);

class GuessingRowTitleService implements RowTitleService {
  constructor(private readonly deps: RowTitleServiceDeps) {}

  obtainTitleColumn(definition: TableDefinition): ColumnName | null {
    const chosen = this.deps.settingsStore.load().titleColumns[this.settingsKey(definition.name)];
    if (chosen !== undefined && definition.columns.some((column) => column.name === chosen)) return chosen;
    return guessTitleColumn(definition);
  }

  setTitleColumn(tableName: TableName, columnName: ColumnName | null): void {
    const titleColumns = { ...this.deps.settingsStore.load().titleColumns };
    if (columnName === null) delete titleColumns[this.settingsKey(tableName)];
    else titleColumns[this.settingsKey(tableName)] = columnName;
    this.deps.settingsStore.save({ titleColumns });
  }

  formatTitle(definition: TableDefinition, row: Row | null, fallbackValues: readonly CellValue[]): string {
    const titleColumn = this.obtainTitleColumn(definition);
    const titleValue = row === null || titleColumn === null ? null : (row.values[titleColumn] ?? null);
    if (titleValue !== null) return formatCellText(titleValue, "text");
    return fallbackValues.map((value) => formatCellText(value, "any")).join(", ");
  }

  async selectTitles(foreignKey: ForeignKey, valueTuples: readonly (readonly CellValue[])[]): Promise<readonly string[]> {
    const definition = await this.deps.tableCatalog.getDefinition(foreignKey.targetTableName);
    const rows = await this.deps.rowService.selectMatchingRows(foreignKey.targetTableName, foreignKey.targetColumnNames, valueTuples);
    return valueTuples.map((tuple, index) => this.formatTitle(definition, rows[index] ?? null, tuple));
  }

  private settingsKey(tableName: TableName): string {
    return `${this.deps.databaseKey}/${tableName.toLowerCase()}`;
  }
}

/** A column named like a name, else the first NOT NULL text column outside the primary key; null: the key names a row. */
const guessTitleColumn = (definition: TableDefinition): ColumnName | null => {
  const isKey = (name: string): boolean => definition.primaryKeyColumnNames.some((key) => key.toLowerCase() === name.toLowerCase());
  for (const titleName of TITLE_NAMES) {
    const named = definition.columns.find((column) => column.name.toLowerCase() === titleName);
    if (named !== undefined) return named.name;
  }
  const namedLike = definition.columns.find((column) => /(^|_)(name|title)$/i.test(column.name));
  if (namedLike !== undefined) return namedLike.name;
  // A nullable text column is more often a note than a name.
  return definition.columns.find((column) => column.valueKind === "text" && column.isNotNull && !isKey(column.name))?.name ?? null;
};
