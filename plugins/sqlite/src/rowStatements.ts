// The SELECT, INSERT, UPDATE and DELETE statements of the row service, every value bound as a parameter.

import type { CellValue } from "@db-manager/connector";
import type { ColumnCondition } from "@db-manager/connector";
import type { ColumnSorting } from "@db-manager/connector";
import type { Row } from "@db-manager/connector";
import type { RowKey } from "@db-manager/connector";

import type { TableSchema } from "./schema/tableSchema.js";
import { quoteIdentifier } from "./utils/identifier.js";

/** A WHERE clause and its parameters; "" with none. */
export interface SqlCondition {
  readonly sql: string;
  readonly params: readonly CellValue[];
}

/** What a statement reads of each row: the row id first where the table is told by it, then every column. */
export const buildSelectList = (table: TableSchema): string => {
  const columns = table.definition.columns.map((column) => quoteIdentifier(column.name));
  return [...(table.definition.rowIdentity.kind === "row-id" && table.rowIdAlias !== null ? [table.rowIdAlias] : []), ...columns].join(", ");
};

/** A row read through buildSelectList. */
export const toRow = (table: TableSchema, values: readonly CellValue[]): Row => {
  const identity = table.definition.rowIdentity;
  const offset = identity.kind === "row-id" ? 1 : 0;
  const columnValues: Record<string, CellValue> = {};
  table.definition.columns.forEach((column, index) => {
    columnValues[column.name] = values[index + offset] ?? null;
  });
  const key: RowKey | null =
    identity.kind === "row-id" ? [values[0] ?? null] : identity.kind === "primary-key" ? identity.columnNames.map((name) => columnValues[findColumnName(table, name)] ?? null) : null;
  return { key, values: columnValues };
};

export const buildWhere = (conditions: readonly ColumnCondition[]): SqlCondition => {
  const parts = conditions.map(buildCondition);
  return { sql: parts.length === 0 ? "" : ` WHERE ${parts.map((part) => part.sql).join(" AND ")}`, params: parts.flatMap((part) => part.params) };
};

/** ORDER BY the sortings, then the row's key, so a page is the same each time it is read. */
export const buildOrderBy = (table: TableSchema, sortings: readonly ColumnSorting[]): string => {
  const terms = [
    ...sortings.map((sorting) => `${quoteIdentifier(sorting.columnName)}${sorting.order === "descending" ? " DESC" : ""}`),
    ...selectKeyExpressions(table),
  ];
  return terms.length === 0 ? "" : ` ORDER BY ${terms.join(", ")}`;
};

/** The condition that finds one row by its key; IS, so a null in a key column still matches. */
export const buildKeyCondition = (table: TableSchema, key: RowKey): SqlCondition => {
  const expressions = selectKeyExpressions(table);
  return { sql: ` WHERE ${expressions.map((expression) => `${expression} IS ?`).join(" AND ")}`, params: [...key] };
};

export const selectKeyExpressions = (table: TableSchema): readonly string[] => {
  const identity = table.definition.rowIdentity;
  if (identity.kind === "primary-key") return identity.columnNames.map(quoteIdentifier);
  if (identity.kind === "row-id" && table.rowIdAlias !== null) return [table.rowIdAlias];
  return [];
};

const buildCondition = (condition: ColumnCondition): SqlCondition => {
  const column = quoteIdentifier(condition.columnName);
  const value = condition.value;
  switch (condition.comparison) {
    case "equals":
      return value === null ? { sql: `${column} IS NULL`, params: [] } : { sql: `${column} = ?`, params: [value] };
    case "not-equals":
      return value === null ? { sql: `${column} IS NOT NULL`, params: [] } : { sql: `${column} IS NOT ?`, params: [value] };
    case "contains":
      return { sql: `instr(lower(CAST(${column} AS TEXT)), lower(?)) > 0`, params: [value === null ? "" : asText(value)] };
    case "less":
      return { sql: `${column} < ?`, params: [value] };
    case "less-or-equal":
      return { sql: `${column} <= ?`, params: [value] };
    case "greater":
      return { sql: `${column} > ?`, params: [value] };
    case "greater-or-equal":
      return { sql: `${column} >= ?`, params: [value] };
    case "is-null":
      return { sql: `${column} IS NULL`, params: [] };
    case "is-not-null":
      return { sql: `${column} IS NOT NULL`, params: [] };
  }
};

const asText = (value: Exclude<CellValue, null>): string => (value instanceof Uint8Array ? "" : String(value));

/** The column's name as the table spells it: a key names its columns as the pragma does, alike but for case. */
const findColumnName = (table: TableSchema, name: string): string =>
  table.definition.columns.find((column) => column.name.toLowerCase() === name.toLowerCase())?.name ?? name;
