// RowService over SQLite: a page and its count in one read, every write in one transaction with RETURNING the rows as stored.

import type { CellValue } from "@db-manager/connector";
import type { ColumnName } from "@db-manager/connector";
import type { NewRow } from "@db-manager/connector";
import type { Row } from "@db-manager/connector";
import type { RowChange } from "@db-manager/connector";
import type { RowKey } from "@db-manager/connector";
import type { RowPage } from "@db-manager/connector";
import type { RowPageRequest } from "@db-manager/connector";
import type { RowService } from "@db-manager/connector";
import type { TableName } from "@db-manager/connector";

import type { EngineStatement } from "./engine/engineMessages.js";
import { statement } from "./engine/statementRunner.js";
import type { StatementRunner } from "./engine/statementRunner.js";
import { rowError, rowRefusal } from "./errors.js";
import { buildKeyCondition, buildOrderBy, buildSelectList, buildWhere, toRow } from "./rowStatements.js";
import type { SchemaCache } from "./schema/schemaCache.js";
import type { TableSchema } from "./schema/tableSchema.js";
import { isSameName, quoteIdentifier } from "./utils/identifier.js";

export const buildSqliteRowService = (runner: StatementRunner, cache: SchemaCache): RowService => new SqliteRowService(runner, cache);

class SqliteRowService implements RowService {
  constructor(
    private readonly runner: StatementRunner,
    private readonly cache: SchemaCache,
  ) {}

  async getRowPage(tableName: TableName, request: RowPageRequest): Promise<RowPage> {
    const table = await this.getTable(tableName);
    checkColumns(table, [...request.sortings.map((sorting) => sorting.columnName), ...request.conditions.map((condition) => condition.columnName)]);
    const from = ` FROM ${quoteIdentifier(table.definition.name)}`;
    const where = buildWhere(request.conditions);
    const [page, count] = await guard(() =>
      this.runner.run(
        [
          statement(`SELECT ${buildSelectList(table)}${from}${where.sql}${buildOrderBy(table, request.sortings)} LIMIT ? OFFSET ?`, [
            ...where.params,
            BigInt(request.rowCount),
            BigInt(request.offset),
          ]),
          statement(`SELECT count(*)${from}${where.sql}`, where.params),
        ],
        "read",
      ),
    );
    return { rows: (page?.rows ?? []).map((values) => toRow(table, values)), totalCount: Number(count?.rows[0]?.[0] ?? 0) };
  }

  async selectMatchingRows(tableName: TableName, columnNames: readonly ColumnName[], valueTuples: readonly (readonly CellValue[])[]): Promise<readonly (Row | null)[]> {
    const table = await this.getTable(tableName);
    checkColumns(table, columnNames);
    const searched = new Map<string, readonly CellValue[]>();
    for (const tuple of valueTuples) if (!tuple.includes(null)) searched.set(tupleKey(tuple), tuple);
    const tuples = [...searched.values()];
    if (tuples.length === 0) return valueTuples.map(() => null);
    const condition = columnNames.map((name) => `${quoteIdentifier(name)} = ?`).join(" AND ");
    const select = `SELECT ${buildSelectList(table)} FROM ${quoteIdentifier(table.definition.name)} WHERE ${condition} LIMIT 1`;
    const results = await guard(() => this.runner.run(tuples.map((tuple) => statement(select, tuple)), "read"));
    const found = new Map(tuples.map((tuple, index) => [tupleKey(tuple), results[index]?.rows[0] ?? null]));
    return valueTuples.map((tuple) => {
      const values = found.get(tupleKey(tuple)) ?? null;
      return values === null ? null : toRow(table, values);
    });
  }

  async createRows(tableName: TableName, rows: readonly NewRow[]): Promise<readonly Row[]> {
    const table = await this.getWritableTable(tableName);
    if (rows.length === 0) return [];
    const statements = rows.map((row) => {
      const columnNames = Object.keys(row.values);
      checkWritableColumns(table, columnNames);
      const into = quoteIdentifier(table.definition.name);
      const returning = ` RETURNING ${buildSelectList(table)}`;
      if (columnNames.length === 0) return statement(`INSERT INTO ${into} DEFAULT VALUES${returning}`, [], "one-row");
      const placeholders = columnNames.map(() => "?").join(", ");
      return statement(`INSERT INTO ${into} (${columnNames.map(quoteIdentifier).join(", ")}) VALUES (${placeholders})${returning}`, Object.values(row.values), "one-row");
    });
    const results = await guard(() => this.runner.run(statements, "commit"));
    return results.map((result) => toRow(table, result.rows[0] ?? []));
  }

  async updateRow(tableName: TableName, key: RowKey, change: RowChange): Promise<Row> {
    const table = await this.getWritableTable(tableName);
    const columnNames = Object.keys(change.values);
    checkWritableColumns(table, columnNames);
    const keyCondition = buildKeyCondition(table, key);
    const name = quoteIdentifier(table.definition.name);
    const update =
      columnNames.length === 0
        ? statement(`SELECT ${buildSelectList(table)} FROM ${name}${keyCondition.sql}`, keyCondition.params, "one-row")
        : statement(
            `UPDATE ${name} SET ${columnNames.map((column) => `${quoteIdentifier(column)} = ?`).join(", ")}${keyCondition.sql} RETURNING ${buildSelectList(table)}`,
            [...Object.values(change.values), ...keyCondition.params],
            "one-row",
          );
    const [result] = await guard(() => this.runner.run([update], columnNames.length === 0 ? "read" : "commit"));
    return toRow(table, result?.rows[0] ?? []);
  }

  async deleteRows(tableName: TableName, keys: readonly RowKey[]): Promise<void> {
    const table = await this.getWritableTable(tableName);
    if (keys.length === 0) return;
    const statements: EngineStatement[] = keys.map((key) => {
      const keyCondition = buildKeyCondition(table, key);
      return statement(`DELETE FROM ${quoteIdentifier(table.definition.name)}${keyCondition.sql} RETURNING 1`, keyCondition.params, "one-row");
    });
    await guard(() => this.runner.run(statements, "commit"));
  }

  private async getTable(tableName: TableName): Promise<TableSchema> {
    const table = await guard(() => this.cache.findTable(tableName));
    if (table === null) throw rowError("table-not-found", `There is no table "${tableName}"`);
    return table;
  }

  private async getWritableTable(tableName: TableName): Promise<TableSchema> {
    const table = await this.getTable(tableName);
    if (table.definition.kind === "view") throw rowError("read-only", `"${table.definition.name}" is a view: its rows are read only`);
    if (table.definition.rowIdentity.kind === "none") throw rowError("read-only", `The rows of "${table.definition.name}" cannot be told apart, so they are read only`);
    return table;
  }
}

const guard = async <T>(call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (error) {
    throw rowRefusal(error);
  }
};

const checkColumns = (table: TableSchema, columnNames: readonly string[]): void => {
  const missing = columnNames.filter((name) => !table.definition.columns.some((column) => isSameName(column.name, name)));
  if (missing.length > 0) throw rowError("column-not-found", `"${table.definition.name}" has no column ${missing.map((name) => `"${name}"`).join(", ")}`, "other", missing);
};

const checkWritableColumns = (table: TableSchema, columnNames: readonly string[]): void => {
  checkColumns(table, columnNames);
  const generated = columnNames.filter((name) => table.definition.columns.some((column) => isSameName(column.name, name) && column.generated !== null));
  if (generated.length > 0) throw rowError("invalid-value", `${generated.map((name) => `"${name}"`).join(", ")} computed by the database cannot be written`, "other", generated);
};

/** A tuple as a map key: bigints and bytes spelled apart from numbers and text. */
const tupleKey = (tuple: readonly CellValue[]): string =>
  JSON.stringify(tuple.map((value) => (typeof value === "bigint" ? `i:${value}` : value instanceof Uint8Array ? `b:${[...value].join(",")}` : value)));
