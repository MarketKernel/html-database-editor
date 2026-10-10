import type { ColumnName } from "../simpleTypes/columnName.js";
import type { GeneratedColumn } from "./generatedColumn.js";

/** A column as the table designer asks for it. */
export interface ColumnDraft {
  /** The existing column it is, under its name before the change: renamed, retyped, its values kept; null: a new column. */
  readonly sourceName: ColumnName | null;
  readonly name: ColumnName;
  /** As the DBMS spells it; "" for none, where the DBMS allows it. */
  readonly type: string;
  readonly isNotNull: boolean;
  readonly defaultExpression: string | null;
  readonly generated: GeneratedColumn | null;
  readonly collation: string | null;
}
