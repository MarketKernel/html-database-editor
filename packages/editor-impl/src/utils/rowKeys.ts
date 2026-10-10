// Row keys compared and spelled for maps.

import type { CellValue } from "@db-manager/connector";
import type { ForeignKey } from "@db-manager/connector";
import type { Row } from "@db-manager/connector";
import type { RowKey } from "@db-manager/connector";

import { isSameValue } from "./cellText.js";

export const isSameKey = (first: RowKey | null, second: RowKey | null): boolean =>
  first !== null && second !== null && first.length === second.length && first.every((value, index) => isSameValue(value, second[index] ?? null));

/** A value tuple as a map key: bigints, numbers and bytes spelled apart. */
export const toTupleKey = (values: readonly CellValue[]): string =>
  JSON.stringify(values.map((value) => (typeof value === "bigint" ? `i:${value}` : value instanceof Uint8Array ? `b:${[...value].join(",")}` : value)));

/** The values a foreign key's columns hold in a row, in the order of its columns. */
export const selectReferenceValues = (row: Row, foreignKey: ForeignKey): readonly CellValue[] => foreignKey.columnNames.map((name) => row.values[name] ?? null);

/** The values a target row gives a foreign key's columns, in the order of its columns. */
export const selectTargetValues = (row: Row, foreignKey: ForeignKey): readonly CellValue[] => foreignKey.targetColumnNames.map((name) => row.values[name] ?? null);
