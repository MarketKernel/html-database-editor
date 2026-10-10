import type { ColumnCondition } from "@db-manager/connector";
import type { ColumnSorting } from "@db-manager/connector";

/** Which page of rows a grid shows: its filter, its sorting, its first row. */
export interface GridView {
  readonly offset: number;
  readonly sortings: readonly ColumnSorting[];
  readonly conditions: readonly ColumnCondition[];
}
