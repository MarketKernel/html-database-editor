import type { CellValue } from "@db-manager/connector";
import type { ColumnName } from "@db-manager/connector";
import type { ForeignKey } from "@db-manager/connector";
import type { Row } from "@db-manager/connector";
import type { RowService } from "@db-manager/connector";
import type { TableDefinition } from "@db-manager/connector";
import type { TableName } from "@db-manager/connector";

import type { SettingsStore } from "./settingsStore.js";
import type { TableCatalog } from "./tableCatalog.js";

/** How a row is named where something refers to it: the value of its table's title column, else its key. */
export interface RowTitleService {
  /** The column the user chose for the table, else a guess: a text column named like "name" or "title", else none. */
  obtainTitleColumn(definition: TableDefinition): ColumnName | null;
  /** Remembers the user's choice for the table; null forgets it, the guess holds again. */
  setTitleColumn(tableName: TableName, columnName: ColumnName | null): void;
  /** The row's title; for null, the referring values themselves. */
  formatTitle(definition: TableDefinition, row: Row | null, fallbackValues: readonly CellValue[]): string;
  /** The titles of the target rows of a foreign key, one per tuple of its columns' values, in one call to the RowService. */
  selectTitles(foreignKey: ForeignKey, valueTuples: readonly (readonly CellValue[])[]): Promise<readonly string[]>;
}

export interface RowTitleServiceDeps {
  readonly rowService: RowService;
  readonly tableCatalog: TableCatalog;
  readonly settingsStore: SettingsStore;
  /** "<plugin>/<database>": the key under which the title columns of this database are kept. */
  readonly databaseKey: string;
}

export type RowTitleServiceFactory = (deps: RowTitleServiceDeps) => RowTitleService;
