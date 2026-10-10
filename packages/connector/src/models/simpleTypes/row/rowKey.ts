import type { CellValue } from "./cellValue.js";

/** What identifies one row of a table: the values of its RowIdentity's columns in order, or its row id alone. */
export type RowKey = readonly CellValue[];
