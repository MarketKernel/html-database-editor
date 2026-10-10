// The comparisons a filter offers, and how a condition reads on its chip.

import type { ColumnCondition } from "@db-manager/connector";
import type { ComparisonKind } from "@db-manager/connector";
import type { ValueKind } from "@db-manager/connector";

import { formatCellText } from "./cellText.js";

export const COMPARISON_CAPTIONS: readonly (readonly [ComparisonKind, string])[] = [
  ["equals", "="],
  ["not-equals", "≠"],
  ["contains", "contains"],
  ["less", "<"],
  ["less-or-equal", "≤"],
  ["greater", ">"],
  ["greater-or-equal", "≥"],
  ["is-null", "is NULL"],
  ["is-not-null", "is not NULL"],
];

export const isValueless = (comparison: ComparisonKind): boolean => comparison === "is-null" || comparison === "is-not-null";

export const describeCondition = (condition: ColumnCondition, valueKind: ValueKind): string => {
  const caption = COMPARISON_CAPTIONS.find(([kind]) => kind === condition.comparison)?.[1] ?? condition.comparison;
  return isValueless(condition.comparison) ? `${condition.columnName} ${caption}` : `${condition.columnName} ${caption} ${formatCellText(condition.value, valueKind)}`;
};
