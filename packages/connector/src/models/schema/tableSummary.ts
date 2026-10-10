import type { TableKind } from "../simpleTypes/schema/tableKind.js";
import type { TableName } from "../simpleTypes/schema/tableName.js";

/** A table or a view as the list of tables shows it. */
export interface TableSummary {
  readonly name: TableName;
  readonly kind: TableKind;
}
