import type { TableName } from "@db-manager/connector";

/** What the user asks of the table list; the database screen does it. */
export interface TableListObserver {
  chooseTable(tableName: TableName): void;
  createTable(): void;
  editTable(tableName: TableName): void;
  renameTable(tableName: TableName): void;
  dropTable(tableName: TableName): void;
  /** Shows the statement the table or view was created by. */
  showTableStatement(tableName: TableName): void;
}
