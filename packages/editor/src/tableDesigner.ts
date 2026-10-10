import type { PluginDescriptor } from "@db-manager/connector";
import type { SchemaService } from "@db-manager/connector";
import type { TableName } from "@db-manager/connector";

import type { DialogService } from "./dialogService.js";
import type { Notifier } from "./notifier.js";
import type { TableCatalog } from "./tableCatalog.js";

/**
 * A table's schema in a dialog, to create a table or change one: its columns, primary key, unique constraints,
 * foreign keys over one column or several, checks, indexes and the plugin's options. "Show SQL" previews the plan,
 * "Apply" runs it; every violation the plugin finds is shown at its field.
 */
export interface TableDesigner {
  /** null: a new table. Resolves with the table's name as applied, null when cancelled. */
  open(tableName: TableName | null): Promise<TableName | null>;
}

export interface TableDesignerDeps {
  readonly schemaService: SchemaService;
  readonly tableCatalog: TableCatalog;
  /** The column types and table options to offer. */
  readonly descriptor: PluginDescriptor;
  readonly dialogService: DialogService;
  readonly notifier: Notifier;
}

export type TableDesignerFactory = (document: Document, deps: TableDesignerDeps) => TableDesigner;
