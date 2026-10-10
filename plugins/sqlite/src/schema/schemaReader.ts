// Reads one table's TableSchema from SQLite's pragmas and the statement sqlite_schema keeps: one batch, one more for implied foreign key targets.

import type { CellValue } from "@db-manager/connector";
import type { ColumnDefinition } from "@db-manager/connector";
import type { ForeignKey } from "@db-manager/connector";
import type { ForeignKeyAction } from "@db-manager/connector";
import type { IndexDefinition } from "@db-manager/connector";
import type { IndexPart } from "@db-manager/connector";
import type { RowIdentity } from "@db-manager/connector";
import type { TableKind } from "@db-manager/connector";
import type { TableSummary } from "@db-manager/connector";
import type { UniqueConstraint } from "@db-manager/connector";

import type { StatementResult } from "../engine/engineMessages.js";
import { statement } from "../engine/statementRunner.js";
import type { StatementRunner } from "../engine/statementRunner.js";
import { OPTION_AUTOINCREMENT, OPTION_STRICT, OPTION_WITHOUT_ROWID } from "../protocol.js";
import { isSameName } from "../utils/identifier.js";
import { deriveValueKind } from "../utils/valueKind.js";
import { parseCreateIndex, parseCreateTable } from "./createTableParser.js";
import type { ParsedTable } from "./parsedTable.js";
import type { TableSchema } from "./tableSchema.js";

/** pragma_table_xinfo's hidden: 1 a virtual table's hidden column, 2 a virtual generated column, 3 a stored one. */
const HIDDEN_COLUMN = 1;
const ROW_ID_ALIASES: readonly string[] = ["rowid", "_rowid_", "oid"];
/** pragma_index_xinfo's cid for a key part that is an expression. */
const EXPRESSION_COLUMN_ID = -2;
const UNREADABLE_STATEMENT = "a statement the plugin could not read";

const SELECT_TABLES = `SELECT name, type FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name COLLATE NOCASE`;

export const selectTableSummaries = async (runner: StatementRunner): Promise<readonly TableSummary[]> => {
  const [result] = await runner.run([statement(SELECT_TABLES)], "read");
  return (result?.rows ?? []).map((row) => ({ name: String(row[0]), kind: row[1] === "view" ? "view" : "table" }));
};

/** null: no table or view of that name. */
export const findTableSchema = async (runner: StatementRunner, tableName: string): Promise<TableSchema | null> => {
  const results = await runner.run(
    [
      statement(`SELECT name, type, sql FROM sqlite_schema WHERE type IN ('table', 'view') AND name = ? COLLATE NOCASE`, [tableName]),
      statement(`SELECT name, type, "notnull", dflt_value, pk, hidden FROM pragma_table_xinfo(?) ORDER BY cid`, [tableName]),
      statement(`SELECT id, seq, "table", "from", "to", on_update, on_delete FROM pragma_foreign_key_list(?) ORDER BY id, seq`, [tableName]),
      statement(
        `SELECT il.name, il."unique", il.origin, ii.name, ii."desc", ii.cid FROM pragma_index_list(?) il JOIN pragma_index_xinfo(il.name) ii ON ii.key = 1 ORDER BY il.name, ii.seqno`,
        [tableName],
      ),
      statement(`SELECT name, sql FROM sqlite_schema WHERE type = 'index' AND tbl_name = ? COLLATE NOCASE AND sql IS NOT NULL`, [tableName]),
      statement(`SELECT wr, strict FROM pragma_table_list(?)`, [tableName]),
      statement(`SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = ? COLLATE NOCASE AND sql IS NOT NULL ORDER BY name`, [tableName]),
    ],
    "read",
  );
  const [master, columnRows, foreignKeyRows, indexRows, indexStatements, tableList, triggers] = results.map(rowsOf);
  const masterRow = master?.[0];
  if (masterRow === undefined) return null;
  const name = String(masterRow[0]);
  const kind: TableKind = masterRow[1] === "view" ? "view" : "table";
  const sourceText = masterRow[2] === null ? null : String(masterRow[2]);
  const parsed = kind === "table" && sourceText !== null ? parseCreateTable(sourceText) : null;
  const columns = readColumns(columnRows ?? [], parsed);
  const primaryKeyColumnNames = readPrimaryKey(columnRows ?? []);
  const isWithoutRowId = tableList?.[0]?.[0] === 1n;
  const foreignKeys = await readForeignKeys(runner, foreignKeyRows ?? [], parsed);
  return {
    definition: {
      name,
      kind,
      columns,
      primaryKeyColumnNames,
      uniqueConstraints: readUniqueConstraints(indexRows ?? [], parsed),
      foreignKeys,
      checks: parsed?.checks ?? [],
      indexes: readIndexes(indexRows ?? [], indexStatements ?? []),
      options: {
        [OPTION_WITHOUT_ROWID]: isWithoutRowId,
        [OPTION_STRICT]: tableList?.[0]?.[1] === 1n,
        [OPTION_AUTOINCREMENT]: parsed?.columns.some((column) => column.isAutoincrement) ?? false,
      },
      rowIdentity: readRowIdentity(kind, primaryKeyColumnNames, isWithoutRowId, columns),
      sourceText,
    },
    rowIdAlias: kind === "view" || isWithoutRowId ? null : findRowIdAlias(columns),
    unsupportedFeatures: kind === "view" ? [] : parsed === null ? [UNREADABLE_STATEMENT] : parsed.unsupportedFeatures,
    triggerStatements: (triggers ?? []).map((row) => String(row[0])),
  };
};

const rowsOf = (result: StatementResult): readonly (readonly CellValue[])[] => result.rows;

const readColumns = (rows: readonly (readonly CellValue[])[], parsed: ParsedTable | null): readonly ColumnDefinition[] =>
  rows
    .filter((row) => Number(row[5]) !== HIDDEN_COLUMN)
    .map((row) => {
      const name = String(row[0]);
      const type = String(row[1] ?? "");
      const parsedColumn = parsed?.columns.find((column) => isSameName(column.name, name)) ?? null;
      return {
        name,
        type,
        valueKind: deriveValueKind(type),
        isNotNull: row[2] === 1n,
        defaultExpression: row[3] === null ? null : String(row[3]),
        generated: parsedColumn?.generated ?? null,
        collation: parsedColumn?.collation ?? null,
      };
    });

const readPrimaryKey = (rows: readonly (readonly CellValue[])[]): readonly string[] =>
  rows
    .filter((row) => Number(row[4]) > 0)
    .sort((first, second) => Number(first[4]) - Number(second[4]))
    .map((row) => String(row[0]));

const readForeignKeys = async (runner: StatementRunner, rows: readonly (readonly CellValue[])[], parsed: ParsedTable | null): Promise<readonly ForeignKey[]> => {
  const byId = new Map<string, (readonly CellValue[])[]>();
  for (const row of rows) byId.set(String(row[0]), [...(byId.get(String(row[0])) ?? []), row]);
  const foreignKeys: ForeignKey[] = [];
  for (const keyRows of byId.values()) {
    const first = keyRows[0];
    if (first === undefined) continue;
    const targetTableName = String(first[2]);
    const columnNames = keyRows.map((row) => String(row[3]));
    const writtenTargets = keyRows.map((row) => (row[4] === null ? null : String(row[4])));
    const targetColumnNames = writtenTargets.every((target) => target !== null)
      ? (writtenTargets as string[])
      : await selectPrimaryKeyColumnNames(runner, targetTableName);
    foreignKeys.push({
      name: findForeignKeyName(parsed, columnNames, targetTableName),
      columnNames,
      targetTableName,
      targetColumnNames,
      onUpdate: toAction(first[5]),
      onDelete: toAction(first[6]),
    });
  }
  // SQLite lists foreign keys last written first.
  return foreignKeys.reverse();
};

const selectPrimaryKeyColumnNames = async (runner: StatementRunner, tableName: string): Promise<readonly string[]> => {
  const [result] = await runner.run([statement(`SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk`, [tableName])], "read");
  return (result?.rows ?? []).map((row) => String(row[0]));
};

const findForeignKeyName = (parsed: ParsedTable | null, columnNames: readonly string[], targetTableName: string): string | null =>
  parsed?.foreignKeys.find(
    (foreignKey) => isSameName(foreignKey.targetTableName, targetTableName) && isSameNameList(foreignKey.columnNames, columnNames),
  )?.name ?? null;

const readUniqueConstraints = (rows: readonly (readonly CellValue[])[], parsed: ParsedTable | null): readonly UniqueConstraint[] =>
  groupIndexRows(rows)
    .filter((index) => index.origin === "u")
    .map((index) => {
      const columnNames = index.rows.map((row) => String(row[3]));
      const name = parsed?.uniqueConstraints.find((constraint) => isSameNameList(constraint.columnNames, columnNames))?.name ?? null;
      return { name, columnNames };
    });

const readIndexes = (rows: readonly (readonly CellValue[])[], statements: readonly (readonly CellValue[])[]): readonly IndexDefinition[] =>
  groupIndexRows(rows)
    .filter((index) => index.origin === "c")
    .map((index) => {
      const statementText = statements.find((row) => row[0] === index.name)?.[1];
      const parsedIndex = typeof statementText === "string" ? parseCreateIndex(statementText) : null;
      const parts: IndexPart[] = index.rows.map((row, position) => {
        const order = row[4] === 1n ? "descending" : "ascending";
        if (Number(row[5]) === EXPRESSION_COLUMN_ID) return { kind: "expression", expression: parsedIndex?.partTexts[position] ?? "", order };
        return { kind: "column", columnName: String(row[3]), order };
      });
      return { name: index.name, parts, isUnique: index.isUnique, whereExpression: parsedIndex?.whereExpression ?? null };
    });

interface IndexRows {
  readonly name: string;
  readonly isUnique: boolean;
  readonly origin: string;
  readonly rows: readonly (readonly CellValue[])[];
}

const groupIndexRows = (rows: readonly (readonly CellValue[])[]): readonly IndexRows[] => {
  const byName = new Map<string, (readonly CellValue[])[]>();
  for (const row of rows) byName.set(String(row[0]), [...(byName.get(String(row[0])) ?? []), row]);
  return [...byName.entries()].map(([name, indexRows]) => ({
    name,
    isUnique: indexRows[0]?.[1] === 1n,
    origin: String(indexRows[0]?.[2] ?? ""),
    rows: indexRows,
  }));
};

const readRowIdentity = (kind: TableKind, primaryKeyColumnNames: readonly string[], isWithoutRowId: boolean, columns: readonly ColumnDefinition[]): RowIdentity => {
  if (kind === "view") return { kind: "none" };
  if (primaryKeyColumnNames.length > 0) return { kind: "primary-key", columnNames: primaryKeyColumnNames };
  if (!isWithoutRowId && findRowIdAlias(columns) !== null) return { kind: "row-id" };
  return { kind: "none" };
};

const findRowIdAlias = (columns: readonly ColumnDefinition[]): string | null =>
  ROW_ID_ALIASES.find((alias) => !columns.some((column) => isSameName(column.name, alias))) ?? null;

const isSameNameList = (first: readonly string[], second: readonly string[]): boolean =>
  first.length === second.length && first.every((name, index) => isSameName(name, second[index] ?? ""));

const toAction = (value: CellValue): ForeignKeyAction => {
  switch (String(value).toUpperCase()) {
    case "CASCADE":
      return "cascade";
    case "SET NULL":
      return "set-null";
    case "SET DEFAULT":
      return "set-default";
    case "RESTRICT":
      return "restrict";
    default:
      return "no-action";
  }
};
