// The TableSchemas of one connection read once, until a schema change through the plugin forgets them.
// why: a unit the plugin's schema and row services hold, kept in this -impl without a contract: a deviation recorded in ARCHITECTURE.md.

import type { StatementRunner } from "../engine/statementRunner.js";
import { findTableSchema } from "./schemaReader.js";
import type { TableSchema } from "./tableSchema.js";

export interface SchemaCache {
  /** null: no table or view of that name. Rejects with an EngineFailure. */
  findTable(tableName: string): Promise<TableSchema | null>;
  /** Every table is read afresh on its next findTable. */
  forget(): void;
}

export const buildSchemaCache = (runner: StatementRunner): SchemaCache => {
  const tables = new Map<string, Promise<TableSchema | null>>();
  return {
    findTable: (tableName) => {
      const key = tableName.toLowerCase();
      const known = tables.get(key);
      if (known !== undefined) return known;
      const reading = findTableSchema(runner, tableName);
      tables.set(key, reading);
      // A failed read is not kept: the next call reads again.
      reading.catch(() => tables.delete(key));
      return reading;
    },
    forget: () => tables.clear(),
  };
};
