import type { CheckConstraint } from "./checkConstraint.js";
import type { ColumnDefinition } from "./columnDefinition.js";
import type { ColumnName } from "../simpleTypes/columnName.js";
import type { ForeignKey } from "./foreignKey.js";
import type { IndexDefinition } from "./indexDefinition.js";
import type { RowIdentity } from "./rowIdentity.js";
import type { TableKind } from "../simpleTypes/schema/tableKind.js";
import type { TableName } from "../simpleTypes/schema/tableName.js";
import type { TableOptions } from "../simpleTypes/schema/tableOptions.js";
import type { UniqueConstraint } from "./uniqueConstraint.js";

/** A table or a view as the DBMS has it: everything the table designer shows and a change must keep. A view has columns alone. */
export interface TableDefinition {
  readonly name: TableName;
  readonly kind: TableKind;
  /** In column order. */
  readonly columns: readonly ColumnDefinition[];
  /** The primary key's columns in key order; empty: no primary key. */
  readonly primaryKeyColumnNames: readonly ColumnName[];
  readonly uniqueConstraints: readonly UniqueConstraint[];
  readonly foreignKeys: readonly ForeignKey[];
  readonly checks: readonly CheckConstraint[];
  /** The indexes created apart from the table, not those the DBMS keeps for its constraints. */
  readonly indexes: readonly IndexDefinition[];
  readonly options: TableOptions;
  readonly rowIdentity: RowIdentity;
  /** The statement that created it, as the DBMS keeps it; null: the DBMS keeps none. */
  readonly sourceText: string | null;
}
