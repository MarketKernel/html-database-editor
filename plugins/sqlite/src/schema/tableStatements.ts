// The statements that create a table and its indexes as a TableDraft says, in SQLite's dialect.

import type { ColumnDraft } from "@db-manager/connector";
import type { ForeignKey } from "@db-manager/connector";
import type { ForeignKeyAction } from "@db-manager/connector";
import type { IndexDefinition } from "@db-manager/connector";
import type { IndexPart } from "@db-manager/connector";
import type { TableDraft } from "@db-manager/connector";

import { OPTION_AUTOINCREMENT, OPTION_STRICT, OPTION_WITHOUT_ROWID } from "../protocol.js";
import { isSameName, quoteIdentifier } from "../utils/identifier.js";

/** A DEFAULT SQLite takes without parentheses: a number, a string, a blob, NULL, TRUE, FALSE, the current time. */
const LITERAL_DEFAULT = /^([+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?|0x[0-9a-f]+|'([^']|'')*'|x'[0-9a-f]*'|null|true|false|current_time|current_date|current_timestamp)$/i;

/**
 * @param tableName — the name the table is created under: the draft's, or a rebuild's temporary one
 * @param selfName — what a foreign key of the draft to the draft itself names as its target
 */
export const buildCreateTableStatement = (draft: TableDraft, tableName: string, selfName: string): string => {
  const isSingleKey = draft.primaryKeyColumnNames.length === 1;
  const definitions = [
    ...draft.columns.map((column) => buildColumnDefinition(column, draft, isSingleKey && isSameName(draft.primaryKeyColumnNames[0] ?? "", column.name))),
    ...(draft.primaryKeyColumnNames.length > 1 ? [`PRIMARY KEY (${draft.primaryKeyColumnNames.map(quoteIdentifier).join(", ")})`] : []),
    ...draft.uniqueConstraints.map((constraint) => `${constraintPrefix(constraint.name)}UNIQUE (${constraint.columnNames.map(quoteIdentifier).join(", ")})`),
    ...draft.checks.map((check) => `${constraintPrefix(check.name)}CHECK (${check.expression})`),
    ...draft.foreignKeys.map((foreignKey) => buildForeignKeyClause(foreignKey, draft.name, selfName)),
  ];
  const options = [...(draft.options[OPTION_WITHOUT_ROWID] === true ? ["WITHOUT ROWID"] : []), ...(draft.options[OPTION_STRICT] === true ? ["STRICT"] : [])];
  return `CREATE TABLE ${quoteIdentifier(tableName)} (\n  ${definitions.join(",\n  ")}\n)${options.length > 0 ? ` ${options.join(", ")}` : ""}`;
};

export const buildCreateIndexStatement = (index: IndexDefinition, tableName: string): string =>
  `CREATE ${index.isUnique ? "UNIQUE " : ""}INDEX ${quoteIdentifier(index.name)} ON ${quoteIdentifier(tableName)} (${index.parts.map(buildIndexPart).join(", ")})` +
  (index.whereExpression === null ? "" : ` WHERE ${index.whereExpression}`);

/** The column as ALTER TABLE ADD COLUMN takes it: no key, its one-column foreign key inline. */
export const buildAddedColumnDefinition = (column: ColumnDraft, draft: TableDraft, foreignKey: ForeignKey | null, selfName: string): string => {
  const reference = foreignKey === null ? "" : ` REFERENCES ${quoteIdentifier(targetName(foreignKey, draft.name, selfName))} (${foreignKey.targetColumnNames.map(quoteIdentifier).join(", ")})${actionClauses(foreignKey)}`;
  return buildColumnDefinition(column, draft, false) + reference;
};

export const formatDefaultExpression = (expression: string): string => {
  const trimmed = expression.trim();
  return LITERAL_DEFAULT.test(trimmed) || isWrappedInParentheses(trimmed) ? trimmed : `(${trimmed})`;
};

const buildColumnDefinition = (column: ColumnDraft, draft: TableDraft, isSoleKey: boolean): string => {
  const parts = [quoteIdentifier(column.name)];
  if (column.type.trim() !== "") parts.push(column.type.trim());
  if (isSoleKey) parts.push(draft.options[OPTION_AUTOINCREMENT] === true ? "PRIMARY KEY AUTOINCREMENT" : "PRIMARY KEY");
  if (column.isNotNull) parts.push("NOT NULL");
  if (column.defaultExpression !== null && column.defaultExpression.trim() !== "") parts.push(`DEFAULT ${formatDefaultExpression(column.defaultExpression)}`);
  if (column.collation !== null && column.collation.trim() !== "") parts.push(`COLLATE ${quoteIdentifier(column.collation.trim())}`);
  if (column.generated !== null) parts.push(`GENERATED ALWAYS AS (${column.generated.expression}) ${column.generated.storage === "stored" ? "STORED" : "VIRTUAL"}`);
  return parts.join(" ");
};

const buildForeignKeyClause = (foreignKey: ForeignKey, draftName: string, selfName: string): string =>
  `${constraintPrefix(foreignKey.name)}FOREIGN KEY (${foreignKey.columnNames.map(quoteIdentifier).join(", ")}) REFERENCES ${quoteIdentifier(targetName(foreignKey, draftName, selfName))} (${foreignKey.targetColumnNames.map(quoteIdentifier).join(", ")})${actionClauses(foreignKey)}`;

const targetName = (foreignKey: ForeignKey, draftName: string, selfName: string): string =>
  isSameName(foreignKey.targetTableName, draftName) ? selfName : foreignKey.targetTableName;

const actionClauses = (foreignKey: ForeignKey): string =>
  (foreignKey.onUpdate === "no-action" ? "" : ` ON UPDATE ${actionSql(foreignKey.onUpdate)}`) +
  (foreignKey.onDelete === "no-action" ? "" : ` ON DELETE ${actionSql(foreignKey.onDelete)}`);

const actionSql = (action: ForeignKeyAction): string => {
  switch (action) {
    case "cascade":
      return "CASCADE";
    case "restrict":
      return "RESTRICT";
    case "set-null":
      return "SET NULL";
    case "set-default":
      return "SET DEFAULT";
    case "no-action":
      return "NO ACTION";
  }
};

const buildIndexPart = (part: IndexPart): string => {
  const order = part.order === "descending" ? " DESC" : "";
  return part.kind === "column" ? `${quoteIdentifier(part.columnName)}${order}` : `${part.expression}${order}`;
};

const constraintPrefix = (name: string | null): string => (name === null || name.trim() === "" ? "" : `CONSTRAINT ${quoteIdentifier(name)} `);

const isWrappedInParentheses = (text: string): boolean => {
  if (!text.startsWith("(") || !text.endsWith(")")) return false;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charAt(index) === "(") depth += 1;
    if (text.charAt(index) === ")") depth -= 1;
    if (depth === 0 && index < text.length - 1) return false;
  }
  return true;
};
