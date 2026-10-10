import type { ReferencingKey } from "./models/schema/referencingKey.js";
import type { SchemaChangePlan } from "./models/schema/schemaChangePlan.js";
import type { TableDefinition } from "./models/schema/tableDefinition.js";
import type { TableDraft } from "./models/schema/tableDraft.js";
import type { TableName } from "./models/simpleTypes/schema/tableName.js";
import type { TableSummary } from "./models/schema/tableSummary.js";

/** The schema of one open database: its tables and views. Every call refuses SchemaError; every change is all or nothing. */
export interface SchemaService {
  /** Every table and view the user may edit, the DBMS's own internals left out, sorted by name. */
  selectTables(): Promise<readonly TableSummary[]>;

  /** Refuses "table-not-found". */
  getTableDefinition(tableName: TableName): Promise<TableDefinition>;

  /** Every foreign key, of any table, this table's own among them, that refers to this table; sorted by table, then by columns. Refuses "table-not-found". */
  selectReferencingKeys(tableName: TableName): Promise<readonly ReferencingKey[]>;

  /** What createTable would run, nothing run. Refuses "invalid-definition", "name-taken", "not-supported". */
  previewTableCreation(draft: TableDraft): Promise<SchemaChangePlan>;

  /** Creates the table with its constraints and indexes. Refuses "invalid-definition", "name-taken", "not-supported". */
  createTable(draft: TableDraft): Promise<TableDefinition>;

  /**
   * What alterTable would run, nothing run: the plan is computed afresh on alterTable, so a stale preview is never applied.
   * Refuses "table-not-found", "invalid-definition", "name-taken", "not-supported".
   */
  previewTableAlteration(tableName: TableName, draft: TableDraft): Promise<SchemaChangePlan>;

  /**
   * Changes the table into the draft, its rows kept: a column is the draft's ColumnDraft#sourceName, a new one takes its default.
   * Whatever of the table the plugin cannot carry over it refuses "not-supported" instead of losing.
   * Refuses "table-not-found", "invalid-definition", "name-taken", "data-conflict", "not-supported".
   */
  alterTable(tableName: TableName, draft: TableDraft): Promise<TableDefinition>;

  /** Refuses "table-not-found", "name-taken", "invalid-definition", "not-supported". */
  renameTable(tableName: TableName, newName: TableName): Promise<void>;

  /** Drops the table or view with its rows. Refuses "table-not-found", "data-conflict" (rows of other tables refer to it). */
  dropTable(tableName: TableName): Promise<void>;
}
