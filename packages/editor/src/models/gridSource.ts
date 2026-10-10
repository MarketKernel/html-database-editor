import type { CellValue } from "@db-manager/connector";
import type { ColumnCondition } from "@db-manager/connector";
import type { ColumnName } from "@db-manager/connector";
import type { TableName } from "@db-manager/connector";

/** What a grid shows: a table's rows, narrowed by fixed conditions the user does not see as filters. */
export interface GridSource {
  readonly tableName: TableName;
  /** The rows of a referencing tab: its foreign key's columns equal to the chosen row's; empty for the main grid. */
  readonly fixedConditions: readonly ColumnCondition[];
  /** What a row created in this grid starts with: the referencing tab's foreign key values. */
  readonly presetValues: Readonly<Record<ColumnName, CellValue>>;
  /** The text the grid shows when it has no rows to show and no table: "Choose a row above". null: an ordinary grid. */
  readonly placeholder: string | null;
}
