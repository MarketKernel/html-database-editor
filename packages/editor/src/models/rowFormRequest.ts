import type { CellValue } from "@db-manager/connector";
import type { ColumnName } from "@db-manager/connector";
import type { Row } from "@db-manager/connector";
import type { TableName } from "@db-manager/connector";

/**
 * What the row form opens for:
 * @param create — a new row, its fields starting from values (a duplicate's, a referencing tab's foreign key)
 * @param update — the row given, changed in place
 */
export type RowFormRequest =
  | { readonly kind: "create"; readonly tableName: TableName; readonly values: Readonly<Record<ColumnName, CellValue>> }
  | { readonly kind: "update"; readonly tableName: TableName; readonly row: Row };
