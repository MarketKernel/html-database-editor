import type { ColumnName } from "../simpleTypes/columnName.js";
import type { ForeignKeyAction } from "../simpleTypes/schema/foreignKeyAction.js";
import type { TableName } from "../simpleTypes/schema/tableName.js";

/**
 * Columns of this table that refer to as many columns of the target table, pair by pair: a reference, one column or several.
 * A row whose columns are null, any one of them, refers to nothing.
 */
export interface ForeignKey {
  /** null: the DBMS names it. */
  readonly name: string | null;
  readonly columnNames: readonly ColumnName[];
  /** The table referred to; this table itself is allowed. */
  readonly targetTableName: TableName;
  /** As many as columnNames, the n-th referred to by the n-th; always spelled out, never "the target's primary key" implied. */
  readonly targetColumnNames: readonly ColumnName[];
  readonly onUpdate: ForeignKeyAction;
  readonly onDelete: ForeignKeyAction;
}
