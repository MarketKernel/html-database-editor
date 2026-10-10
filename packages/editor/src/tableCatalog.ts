import type { ReferencingKey } from "@db-manager/connector";
import type { SchemaService } from "@db-manager/connector";
import type { TableDefinition } from "@db-manager/connector";
import type { TableName } from "@db-manager/connector";
import type { TableSummary } from "@db-manager/connector";

/** The open database's schema as the screen reads it, each answer read once until the schema changes. Rejects with the plugin's SchemaError. */
export interface TableCatalog {
  selectTables(): Promise<readonly TableSummary[]>;
  getDefinition(tableName: TableName): Promise<TableDefinition>;
  selectReferencingKeys(tableName: TableName): Promise<readonly ReferencingKey[]>;
  /** The schema changed: every answer is read afresh. */
  forget(): void;
}

export type TableCatalogFactory = (schemaService: SchemaService) => TableCatalog;
