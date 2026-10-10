// Every reason a TableDraft cannot be a SQLite table, found at once, before any statement runs.

import type { DefinitionViolation } from "@db-manager/connector";
import type { DefinitionViolationKind } from "@db-manager/connector";
import type { ForeignKey } from "@db-manager/connector";
import type { TableDraft } from "@db-manager/connector";

import { INTERNAL_NAME_PREFIX, OPTION_AUTOINCREMENT, OPTION_STRICT, OPTION_WITHOUT_ROWID, REBUILD_TABLE_PREFIX } from "../protocol.js";
import { isSameName } from "../utils/identifier.js";
import type { TableSchema } from "./tableSchema.js";

/** The types a STRICT table accepts. */
const STRICT_TYPES: ReadonlySet<string> = new Set(["INT", "INTEGER", "REAL", "TEXT", "BLOB", "ANY"]);
/** A declared type: words, numbers in parentheses — "VARCHAR(20)", "DECIMAL(10, 2)", "UNSIGNED BIG INT". */
const TYPE_PATTERN = /^[\p{L}_][\p{L}\p{N}_ ]*(\(\s*[+-]?\d+\s*(,\s*[+-]?\d+\s*)?\))?$/u;

/** What the draft is checked against. */
export interface ValidationContext {
  /** The table being changed as it is now; null: a new table. */
  readonly currentTable: TableSchema | null;
  /** Every table and view of the database, the current one too. */
  readonly tableNames: readonly string[];
  /** Every index of the database outside the current table, by name. */
  readonly foreignIndexNames: readonly string[];
  /** The tables the draft's foreign keys refer to, the draft itself excepted, those that exist. */
  readonly targetTables: readonly TableSchema[];
}

export const validateDraft = (draft: TableDraft, context: ValidationContext): readonly DefinitionViolation[] => {
  const violations: DefinitionViolation[] = [];
  const report = (kind: DefinitionViolationKind, path: string, message: string): void => {
    violations.push({ kind, path, message });
  };
  const hasColumn = (name: string): boolean => draft.columns.some((column) => isSameName(column.name, name));
  validateTableName(draft, context, report);
  validateColumns(draft, context, report);
  validateColumnList(draft.primaryKeyColumnNames, "primaryKeyColumnNames", hasColumn, report, false);
  validateOptions(draft, report);
  draft.uniqueConstraints.forEach((constraint, index) => validateColumnList(constraint.columnNames, `uniqueConstraints.${index}.columnNames`, hasColumn, report, true));
  draft.checks.forEach((check, index) => {
    if (check.expression.trim() === "") report("empty", `checks.${index}.expression`, "A check needs a condition");
  });
  draft.foreignKeys.forEach((foreignKey, index) => validateForeignKey(foreignKey, `foreignKeys.${index}`, draft, context, hasColumn, report));
  validateIndexes(draft, context, hasColumn, report);
  return violations;
};

type Report = (kind: DefinitionViolationKind, path: string, message: string) => void;

const validateTableName = (draft: TableDraft, context: ValidationContext, report: Report): void => {
  const name = draft.name.trim();
  if (name === "") report("invalid-name", "name", "A table needs a name");
  else if (name.toLowerCase().startsWith(INTERNAL_NAME_PREFIX) || name.startsWith(REBUILD_TABLE_PREFIX)) report("invalid-name", "name", `"${name}" is a name SQLite keeps for itself`);
  const isOwnName = context.currentTable !== null && isSameName(context.currentTable.definition.name, name);
  if (!isOwnName && context.tableNames.some((tableName) => isSameName(tableName, name))) report("name-taken", "name", `A table or view named "${name}" exists already`);
};

const validateColumns = (draft: TableDraft, context: ValidationContext, report: Report): void => {
  if (draft.columns.length === 0) report("empty", "columns", "A table needs a column");
  const isStrict = draft.options[OPTION_STRICT] === true;
  draft.columns.forEach((column, index) => {
    const path = `columns.${index}`;
    if (column.name.trim() === "") report("invalid-name", `${path}.name`, "A column needs a name");
    if (draft.columns.findIndex((other) => isSameName(other.name, column.name)) !== index) report("name-taken", `${path}.name`, `Two columns are named "${column.name}"`);
    const type = column.type.trim();
    if (type !== "" && !TYPE_PATTERN.test(type)) report("invalid-name", `${path}.type`, `"${type}" is not a type: words, then numbers in parentheses`);
    if (isStrict && !STRICT_TYPES.has(type.toUpperCase())) report("not-supported", `${path}.type`, "A STRICT table takes INT, INTEGER, REAL, TEXT, BLOB or ANY");
    if (column.generated !== null && column.generated.expression.trim() === "") report("empty", `${path}.generated.expression`, "A generated column needs an expression");
    if (column.generated !== null && column.defaultExpression !== null) report("not-supported", `${path}.defaultExpression`, "A generated column has no default");
    if (column.generated !== null && draft.primaryKeyColumnNames.some((name) => isSameName(name, column.name))) {
      report("not-supported", `${path}.generated`, "A generated column cannot be in the primary key");
    }
    if (column.sourceName !== null) validateSourceName(column.sourceName, `${path}.sourceName`, draft, context, report);
  });
};

const validateSourceName = (sourceName: string, path: string, draft: TableDraft, context: ValidationContext, report: Report): void => {
  const isExisting = context.currentTable?.definition.columns.some((column) => isSameName(column.name, sourceName)) ?? false;
  if (!isExisting) report("column-not-found", path, `The table has no column "${sourceName}" to keep`);
  if (draft.columns.filter((column) => column.sourceName !== null && isSameName(column.sourceName, sourceName)).length > 1) {
    report("name-taken", path, `The column "${sourceName}" is kept twice`);
  }
};

const validateOptions = (draft: TableDraft, report: Report): void => {
  if (draft.options[OPTION_WITHOUT_ROWID] === true && draft.primaryKeyColumnNames.length === 0) report("not-supported", `options.${OPTION_WITHOUT_ROWID}`, "A WITHOUT ROWID table needs a primary key");
  if (draft.options[OPTION_AUTOINCREMENT] !== true) return;
  const keyColumn = draft.columns.find((column) => isSameName(column.name, draft.primaryKeyColumnNames[0] ?? ""));
  if (draft.primaryKeyColumnNames.length !== 1 || keyColumn?.type.trim().toUpperCase() !== "INTEGER" || draft.options[OPTION_WITHOUT_ROWID] === true) {
    report("not-supported", `options.${OPTION_AUTOINCREMENT}`, "AUTOINCREMENT needs a primary key of one INTEGER column, and a table with row ids");
  }
};

const validateColumnList = (columnNames: readonly string[], path: string, hasColumn: (name: string) => boolean, report: Report, isRequired: boolean): void => {
  if (isRequired && columnNames.length === 0) report("empty", path, "Choose a column at least");
  columnNames.forEach((name, index) => {
    if (!hasColumn(name)) report("column-not-found", `${path}.${index}`, `There is no column "${name}"`);
    if (columnNames.findIndex((other) => isSameName(other, name)) !== index) report("name-taken", `${path}.${index}`, `The column "${name}" is listed twice`);
  });
};

const validateForeignKey = (foreignKey: ForeignKey, path: string, draft: TableDraft, context: ValidationContext, hasColumn: (name: string) => boolean, report: Report): void => {
  validateColumnList(foreignKey.columnNames, `${path}.columnNames`, hasColumn, report, true);
  if (foreignKey.columnNames.length !== foreignKey.targetColumnNames.length) {
    report("column-count-mismatch", `${path}.targetColumnNames`, "A reference pairs as many columns as it refers to");
  }
  const isSelf = isSameName(foreignKey.targetTableName, draft.name);
  const target = isSelf ? null : context.targetTables.find((table) => isSameName(table.definition.name, foreignKey.targetTableName));
  if (!isSelf && (target === undefined || target === null || target.definition.kind !== "table")) {
    report("target-not-found", `${path}.targetTableName`, `There is no table "${foreignKey.targetTableName}"`);
    return;
  }
  const targetColumns = isSelf ? draft.columns.map((column) => column.name) : (target?.definition.columns.map((column) => column.name) ?? []);
  foreignKey.targetColumnNames.forEach((name, index) => {
    if (!targetColumns.some((column) => isSameName(column, name))) report("target-not-found", `${path}.targetColumnNames.${index}`, `"${foreignKey.targetTableName}" has no column "${name}"`);
  });
  const uniqueSets = isSelf ? selectDraftUniqueSets(draft) : selectUniqueSets(target ?? null);
  if (!uniqueSets.some((set) => isSameNameSet(set, foreignKey.targetColumnNames))) {
    report("not-supported", `${path}.targetColumnNames`, `A reference must point at the primary key or a unique set of "${foreignKey.targetTableName}"`);
  }
};

const validateIndexes = (draft: TableDraft, context: ValidationContext, hasColumn: (name: string) => boolean, report: Report): void => {
  draft.indexes.forEach((index, position) => {
    const path = `indexes.${position}`;
    if (index.name.trim() === "") report("invalid-name", `${path}.name`, "An index needs a name");
    else if (index.name.toLowerCase().startsWith(INTERNAL_NAME_PREFIX)) report("invalid-name", `${path}.name`, `"${index.name}" is a name SQLite keeps for itself`);
    if (draft.indexes.findIndex((other) => isSameName(other.name, index.name)) !== position) report("name-taken", `${path}.name`, `Two indexes are named "${index.name}"`);
    if ([...context.foreignIndexNames, ...context.tableNames, draft.name].some((name) => isSameName(name, index.name))) {
      report("name-taken", `${path}.name`, `The name "${index.name}" is taken by another table or index`);
    }
    if (index.parts.length === 0) report("empty", `${path}.parts`, "An index needs a column at least");
    index.parts.forEach((part, partIndex) => {
      if (part.kind === "column" && !hasColumn(part.columnName)) report("column-not-found", `${path}.parts.${partIndex}`, `There is no column "${part.columnName}"`);
      if (part.kind === "expression" && part.expression.trim() === "") report("empty", `${path}.parts.${partIndex}`, "An expression is empty");
    });
  });
};

/** The column sets a reference may point at: the primary key, the unique constraints, the unique indexes of plain columns over every row. */
const selectUniqueSets = (table: TableSchema | null): readonly (readonly string[])[] => {
  if (table === null) return [];
  const definition = table.definition;
  return [
    ...(definition.primaryKeyColumnNames.length > 0 ? [definition.primaryKeyColumnNames] : []),
    ...definition.uniqueConstraints.map((constraint) => constraint.columnNames),
    ...definition.indexes
      .filter((index) => index.isUnique && index.whereExpression === null && index.parts.every((part) => part.kind === "column"))
      .map((index) => index.parts.map((part) => (part.kind === "column" ? part.columnName : ""))),
  ];
};

const selectDraftUniqueSets = (draft: TableDraft): readonly (readonly string[])[] => [
  ...(draft.primaryKeyColumnNames.length > 0 ? [draft.primaryKeyColumnNames] : []),
  ...draft.uniqueConstraints.map((constraint) => constraint.columnNames),
  ...draft.indexes
    .filter((index) => index.isUnique && index.whereExpression === null && index.parts.every((part) => part.kind === "column"))
    .map((index) => index.parts.map((part) => (part.kind === "column" ? part.columnName : ""))),
];

const isSameNameSet = (first: readonly string[], second: readonly string[]): boolean =>
  first.length === second.length && first.every((name) => second.some((other) => isSameName(other, name)));
