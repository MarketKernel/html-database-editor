// The table designer's draft while it is edited: columns by identity, so a renamed column stays in its key, constraints and indexes.

import type { ForeignKeyAction } from "@db-manager/connector";
import type { GeneratedColumnStorage } from "@db-manager/connector";
import type { SortOrder } from "@db-manager/connector";
import type { TableDefinition } from "@db-manager/connector";
import type { TableDraft } from "@db-manager/connector";

export interface ColumnState {
  readonly id: number;
  readonly sourceName: string | null;
  name: string;
  type: string;
  isNotNull: boolean;
  defaultExpression: string;
  collation: string;
  generatedExpression: string;
  generatedStorage: GeneratedColumnStorage;
}

export interface UniqueState {
  name: string;
  columnIds: number[];
}

export interface ForeignKeyState {
  name: string;
  /** The n-th refers to targetColumnNames[n]. */
  columnIds: number[];
  targetTableName: string;
  targetColumnNames: string[];
  onUpdate: ForeignKeyAction;
  onDelete: ForeignKeyAction;
}

export interface CheckState {
  name: string;
  expression: string;
}

export type IndexPartState = { kind: "column"; columnId: number; order: SortOrder } | { kind: "expression"; expression: string; order: SortOrder };

export interface IndexState {
  name: string;
  isUnique: boolean;
  whereExpression: string;
  parts: IndexPartState[];
}

export interface DesignerState {
  name: string;
  columns: ColumnState[];
  primaryKeyColumnIds: number[];
  uniqueConstraints: UniqueState[];
  foreignKeys: ForeignKeyState[];
  checks: CheckState[];
  indexes: IndexState[];
  options: Record<string, boolean>;
  lastColumnId: number;
}

export const createNewTableState = (): DesignerState => ({
  name: "new_table",
  columns: [{ id: 1, sourceName: null, name: "id", type: "INTEGER", isNotNull: false, defaultExpression: "", collation: "", generatedExpression: "", generatedStorage: "virtual" }],
  primaryKeyColumnIds: [1],
  uniqueConstraints: [],
  foreignKeys: [],
  checks: [],
  indexes: [],
  options: {},
  lastColumnId: 1,
});

export const createStateFromDefinition = (definition: TableDefinition): DesignerState => {
  const columns: ColumnState[] = definition.columns.map((column, index) => ({
    id: index + 1,
    sourceName: column.name,
    name: column.name,
    type: column.type,
    isNotNull: column.isNotNull,
    defaultExpression: column.defaultExpression ?? "",
    collation: column.collation ?? "",
    generatedExpression: column.generated?.expression ?? "",
    generatedStorage: column.generated?.storage ?? "virtual",
  }));
  const idOf = (name: string): number => columns.find((column) => column.name.toLowerCase() === name.toLowerCase())?.id ?? 0;
  return {
    name: definition.name,
    columns,
    primaryKeyColumnIds: definition.primaryKeyColumnNames.map(idOf),
    uniqueConstraints: definition.uniqueConstraints.map((constraint) => ({ name: constraint.name ?? "", columnIds: constraint.columnNames.map(idOf) })),
    foreignKeys: definition.foreignKeys.map((foreignKey) => ({
      name: foreignKey.name ?? "",
      columnIds: foreignKey.columnNames.map(idOf),
      targetTableName: foreignKey.targetTableName,
      targetColumnNames: [...foreignKey.targetColumnNames],
      onUpdate: foreignKey.onUpdate,
      onDelete: foreignKey.onDelete,
    })),
    checks: definition.checks.map((check) => ({ name: check.name ?? "", expression: check.expression })),
    indexes: definition.indexes.map((index) => ({
      name: index.name,
      isUnique: index.isUnique,
      whereExpression: index.whereExpression ?? "",
      parts: index.parts.map((part) => (part.kind === "column" ? { kind: "column", columnId: idOf(part.columnName), order: part.order } : { ...part })),
    })),
    options: { ...definition.options },
    lastColumnId: columns.length,
  };
};

/** The draft the plugin is asked for: names in place of identities, blanks as nulls. */
export const toTableDraft = (state: DesignerState): TableDraft => {
  const nameOf = (id: number): string => state.columns.find((column) => column.id === id)?.name ?? "";
  const textOrNull = (text: string): string | null => (text.trim() === "" ? null : text.trim());
  return {
    name: state.name.trim(),
    columns: state.columns.map((column) => ({
      sourceName: column.sourceName,
      name: column.name.trim(),
      type: column.type.trim(),
      isNotNull: column.isNotNull,
      defaultExpression: textOrNull(column.defaultExpression),
      generated: column.generatedExpression.trim() === "" ? null : { expression: column.generatedExpression.trim(), storage: column.generatedStorage },
      collation: textOrNull(column.collation),
    })),
    primaryKeyColumnNames: state.primaryKeyColumnIds.map(nameOf),
    uniqueConstraints: state.uniqueConstraints.map((constraint) => ({ name: textOrNull(constraint.name), columnNames: constraint.columnIds.map(nameOf) })),
    foreignKeys: state.foreignKeys.map((foreignKey) => ({
      name: textOrNull(foreignKey.name),
      columnNames: foreignKey.columnIds.map(nameOf),
      targetTableName: foreignKey.targetTableName,
      targetColumnNames: foreignKey.targetColumnNames,
      onUpdate: foreignKey.onUpdate,
      onDelete: foreignKey.onDelete,
    })),
    checks: state.checks.map((check) => ({ name: textOrNull(check.name), expression: check.expression.trim() })),
    indexes: state.indexes.map((index) => ({
      name: index.name.trim(),
      isUnique: index.isUnique,
      whereExpression: textOrNull(index.whereExpression),
      parts: index.parts.map((part) => (part.kind === "column" ? { kind: "column", columnName: nameOf(part.columnId), order: part.order } : { kind: "expression", expression: part.expression.trim(), order: part.order })),
    })),
    options: state.options,
  };
};

export const addColumn = (state: DesignerState): ColumnState => {
  state.lastColumnId += 1;
  const column: ColumnState = {
    id: state.lastColumnId,
    sourceName: null,
    name: `column_${state.lastColumnId}`,
    type: "TEXT",
    isNotNull: false,
    defaultExpression: "",
    collation: "",
    generatedExpression: "",
    generatedStorage: "virtual",
  };
  state.columns.push(column);
  return column;
};

/** Drops the column and every mention of it: from the key, a unique set, a foreign key's pairs, an index. */
export const removeColumn = (state: DesignerState, columnId: number): void => {
  state.columns = state.columns.filter((column) => column.id !== columnId);
  state.primaryKeyColumnIds = state.primaryKeyColumnIds.filter((id) => id !== columnId);
  for (const constraint of state.uniqueConstraints) constraint.columnIds = constraint.columnIds.filter((id) => id !== columnId);
  for (const foreignKey of state.foreignKeys) {
    const kept = foreignKey.columnIds.map((id, index) => [id, foreignKey.targetColumnNames[index] ?? ""] as const).filter(([id]) => id !== columnId);
    foreignKey.columnIds = kept.map(([id]) => id);
    foreignKey.targetColumnNames = kept.map(([, target]) => target);
  }
  for (const index of state.indexes) index.parts = index.parts.filter((part) => part.kind !== "column" || part.columnId !== columnId);
};

export const moveItem = <T>(items: T[], index: number, step: number): void => {
  const target = index + step;
  if (target < 0 || target >= items.length) return;
  const [item] = items.splice(index, 1);
  if (item !== undefined) items.splice(target, 0, item);
};
