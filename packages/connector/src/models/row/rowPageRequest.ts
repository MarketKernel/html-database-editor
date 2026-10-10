import type { ColumnCondition } from "./columnCondition.js";
import type { ColumnSorting } from "./columnSorting.js";

/** Rows n..m of a filtered, sorted table, as offset n and rowCount m - n + 1. */
export interface RowPageRequest {
  /** Zero-based position of the first row. */
  readonly offset: number;
  /** At most this many rows; a positive integer. */
  readonly rowCount: number;
  /** By the first, ties by the next; the rows' keys break the last ties. Empty: by the key. */
  readonly sortings: readonly ColumnSorting[];
  /** Only the rows meeting every one (AND); empty: every row. */
  readonly conditions: readonly ColumnCondition[];
}
