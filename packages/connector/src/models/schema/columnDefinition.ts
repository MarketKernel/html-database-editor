import type { ColumnName } from "../simpleTypes/columnName.js";
import type { GeneratedColumn } from "./generatedColumn.js";
import type { ValueKind } from "../simpleTypes/valueKind.js";

/** A column as the DBMS has it. */
export interface ColumnDefinition {
  readonly name: ColumnName;
  /** The type as declared, as the DBMS spells it; "" where none was declared. */
  readonly type: string;
  /** What its values are, derived by the plugin from the type. */
  readonly valueKind: ValueKind;
  readonly isNotNull: boolean;
  /** The DEFAULT expression as SQL text; null: none. */
  readonly defaultExpression: string | null;
  /** null: an ordinary column, written by the user. */
  readonly generated: GeneratedColumn | null;
  /** The collation's name; null: the DBMS's default. */
  readonly collation: string | null;
}
