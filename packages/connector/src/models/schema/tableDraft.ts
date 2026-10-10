import type { CheckConstraint } from "./checkConstraint.js";
import type { ColumnDraft } from "./columnDraft.js";
import type { ColumnName } from "../simpleTypes/columnName.js";
import type { ForeignKey } from "./foreignKey.js";
import type { IndexDefinition } from "./indexDefinition.js";
import type { TableName } from "../simpleTypes/schema/tableName.js";
import type { TableOptions } from "../simpleTypes/schema/tableOptions.js";
import type { UniqueConstraint } from "./uniqueConstraint.js";

/** A table as it should be: to create, or to change an existing one into. Names refer to the draft's own columns. */
export interface TableDraft {
  readonly name: TableName;
  readonly columns: readonly ColumnDraft[];
  readonly primaryKeyColumnNames: readonly ColumnName[];
  readonly uniqueConstraints: readonly UniqueConstraint[];
  readonly foreignKeys: readonly ForeignKey[];
  readonly checks: readonly CheckConstraint[];
  readonly indexes: readonly IndexDefinition[];
  readonly options: TableOptions;
}
