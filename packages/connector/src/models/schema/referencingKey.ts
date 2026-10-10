import type { ForeignKey } from "./foreignKey.js";
import type { TableName } from "../simpleTypes/schema/tableName.js";

/** A foreign key of another table, or of the table itself, that refers to the table in question. */
export interface ReferencingKey {
  /** The table the foreign key belongs to. */
  readonly tableName: TableName;
  readonly foreignKey: ForeignKey;
}
