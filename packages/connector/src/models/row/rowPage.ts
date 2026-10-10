import type { Row } from "./row.js";

export interface RowPage {
  /** Empty when offset is past the end. */
  readonly rows: readonly Row[];
  /** How many rows meet the conditions in all, for the pager. */
  readonly totalCount: number;
}
