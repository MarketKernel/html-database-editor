// TableCatalog over the plugin's SchemaService, each answer kept until forget(); a refused read is not kept.

import type { ReferencingKey } from "@db-manager/connector";
import type { TableDefinition } from "@db-manager/connector";
import type { TableName } from "@db-manager/connector";
import type { TableSummary } from "@db-manager/connector";
import type { SchemaService } from "@db-manager/connector";
import type { TableCatalog } from "@db-manager/editor";
import type { TableCatalogFactory } from "@db-manager/editor";

export const buildCachedTableCatalog: TableCatalogFactory = (schemaService) => new CachedTableCatalog(schemaService);

class CachedTableCatalog implements TableCatalog {
  private tables: Promise<readonly TableSummary[]> | null = null;
  private readonly definitions = new Map<string, Promise<TableDefinition>>();
  private readonly referencingKeys = new Map<string, Promise<readonly ReferencingKey[]>>();

  constructor(private readonly schemaService: SchemaService) {}

  selectTables(): Promise<readonly TableSummary[]> {
    if (this.tables === null) {
      const reading = this.schemaService.selectTables();
      this.tables = reading;
      reading.catch(() => (this.tables = null));
    }
    return this.tables;
  }

  getDefinition(tableName: TableName): Promise<TableDefinition> {
    return remember(this.definitions, tableName, () => this.schemaService.getTableDefinition(tableName));
  }

  selectReferencingKeys(tableName: TableName): Promise<readonly ReferencingKey[]> {
    return remember(this.referencingKeys, tableName, () => this.schemaService.selectReferencingKeys(tableName));
  }

  forget(): void {
    this.tables = null;
    this.definitions.clear();
    this.referencingKeys.clear();
  }
}

const remember = <T>(answers: Map<string, Promise<T>>, tableName: TableName, read: () => Promise<T>): Promise<T> => {
  const key = tableName.toLowerCase();
  const known = answers.get(key);
  if (known !== undefined) return known;
  const reading = read();
  answers.set(key, reading);
  reading.catch(() => answers.delete(key));
  return reading;
};
