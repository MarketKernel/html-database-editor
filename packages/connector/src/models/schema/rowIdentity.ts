import type { ColumnName } from "../simpleTypes/columnName.js";

/**
 * How one row of a table is told from the others, so it can be changed or deleted:
 * @param primary-key — by its primary key's columns, one or several; RowKey holds their values in this order
 * @param row-id — by an identifier the DBMS keeps apart from the columns (SQLite's rowid); RowKey holds it alone
 * @param none — it cannot be: a view, or a table without either; its rows are read only
 */
export type RowIdentity =
  | { readonly kind: "primary-key"; readonly columnNames: readonly ColumnName[] }
  | { readonly kind: "row-id" }
  | { readonly kind: "none" };
