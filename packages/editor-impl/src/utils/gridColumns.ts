// The columns a grid shows: the table's, and after a foreign key of several columns a column of its own for its reference.

import type { ColumnDefinition } from "@db-manager/connector";
import type { ForeignKey } from "@db-manager/connector";
import type { TableDefinition } from "@db-manager/connector";

/**
 * @param value — a column of the table; reference: its foreign key of one column, shown in it, else null
 * @param reference — a foreign key of several columns, shown after the last of them
 */
export type GridColumn =
  | { readonly kind: "value"; readonly column: ColumnDefinition; readonly reference: ForeignKey | null }
  | { readonly kind: "reference"; readonly foreignKey: ForeignKey };

export const selectGridColumns = (definition: TableDefinition): readonly GridColumn[] => {
  const isSame = (first: string, second: string): boolean => first.toLowerCase() === second.toLowerCase();
  const gridColumns: GridColumn[] = [];
  for (const column of definition.columns) {
    const reference = definition.foreignKeys.find((foreignKey) => foreignKey.columnNames.length === 1 && isSame(foreignKey.columnNames[0] ?? "", column.name)) ?? null;
    gridColumns.push({ kind: "value", column, reference });
    for (const foreignKey of definition.foreignKeys) {
      const lastColumn = foreignKey.columnNames[foreignKey.columnNames.length - 1] ?? "";
      if (foreignKey.columnNames.length > 1 && isSame(lastColumn, column.name)) gridColumns.push({ kind: "reference", foreignKey });
    }
  }
  return gridColumns;
};

/** "order_lines (order_id, line_no)": a foreign key as its header and its tab read. */
export const describeForeignKey = (foreignKey: ForeignKey): string => `${foreignKey.targetTableName} (${foreignKey.targetColumnNames.join(", ")})`;
