import type { CellValue } from "../simpleTypes/row/cellValue.js";
import type { ColumnName } from "../simpleTypes/columnName.js";
import type { ComparisonKind } from "../simpleTypes/row/comparisonKind.js";

/** One column compared with a value. "equals" and "not-equals" a null mean "is-null" and "is-not-null"; their value is not read. A null cell meets no other comparison. */
export interface ColumnCondition {
  readonly columnName: ColumnName;
  readonly comparison: ComparisonKind;
  readonly value: CellValue;
}
