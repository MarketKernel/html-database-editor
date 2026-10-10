// What turns a table into a TableDraft: ALTER TABLE where SQLite's few forms of it suffice, else the table rebuilt
// as SQLite's documentation lays out ("Making Other Kinds Of Table Schema Changes"), its rows, indexes, triggers and views carried over.

import type { CheckConstraint } from "@db-manager/connector";
import type { ColumnDefinition } from "@db-manager/connector";
import type { ColumnDraft } from "@db-manager/connector";
import type { ForeignKey } from "@db-manager/connector";
import type { IndexDefinition } from "@db-manager/connector";
import type { TableDraft } from "@db-manager/connector";
import type { UniqueConstraint } from "@db-manager/connector";

import { REBUILD_TABLE_PREFIX } from "../protocol.js";
import { isSameName, quoteIdentifier } from "../utils/identifier.js";
import { renameIdentifiers } from "../utils/renameIdentifiers.js";
import { buildAddedColumnDefinition, buildCreateIndexStatement, buildCreateTableStatement } from "./tableStatements.js";
import type { TableSchema } from "./tableSchema.js";

/** A change as statements, in order, run in one transaction. */
export interface TablePlan {
  readonly statements: readonly string[];
  readonly isRebuild: boolean;
  readonly warnings: readonly string[];
  /** A rebuild runs with foreign keys off, checked by foreign_key_check at its end. */
  readonly isForeignKeysOff: boolean;
}

/** A view of the database, dropped and created again around a rebuild of a table it reads. */
export interface ViewStatement {
  readonly name: string;
  readonly sql: string;
}

/** What else of the database an alteration touches. */
export interface AlterationContext {
  /** The views that name the table. */
  readonly views: readonly ViewStatement[];
  /** The tables whose foreign keys refer to the table, checked after a rebuild. */
  readonly referencingTableNames: readonly string[];
}

/** Thrown when a rebuild would lose what the table's statement holds. */
export interface RebuildRefusal {
  readonly unsupportedFeatures: readonly string[];
}

const TEMPORARY_COLUMN_PREFIX = "__db_manager_column_";

export const planTableCreation = (draft: TableDraft): TablePlan => ({
  statements: [buildCreateTableStatement(draft, draft.name, draft.name), ...draft.indexes.map((index) => buildCreateIndexStatement(index, draft.name))],
  isRebuild: false,
  warnings: [],
  isForeignKeysOff: false,
});

/** The ALTER TABLE plan; null where ALTER TABLE cannot make the change. */
export const planTableAlterationInPlace = (current: TableSchema, draft: TableDraft): TablePlan | null => {
  const change = new TableChange(current, draft);
  return change.isAlterableInPlace() ? change.planInPlace() : null;
};

/** The rebuild plan. Throws a RebuildRefusal where the table holds what the plugin cannot write back. */
export const planTableRebuild = (current: TableSchema, draft: TableDraft, context: AlterationContext): TablePlan => {
  if (current.unsupportedFeatures.length > 0) throw { unsupportedFeatures: current.unsupportedFeatures } satisfies RebuildRefusal;
  return new TableChange(current, draft).planRebuild(context);
};

export const isRebuildRefusal = (error: unknown): error is RebuildRefusal => typeof error === "object" && error !== null && "unsupportedFeatures" in error;

interface KeptColumn {
  readonly source: ColumnDefinition;
  readonly target: ColumnDraft;
}

class TableChange {
  private readonly oldName: string;
  private readonly kept: readonly KeptColumn[];
  private readonly dropped: readonly ColumnDefinition[];
  private readonly added: readonly ColumnDraft[];
  /** Lowercase old column name -> its new name, for the columns renamed. */
  private readonly renames: ReadonlyMap<string, string>;
  /** The draft with its SQL texts written in the new column names. */
  private readonly draft: TableDraft;

  constructor(
    private readonly current: TableSchema,
    rawDraft: TableDraft,
  ) {
    const columns = current.definition.columns;
    this.oldName = current.definition.name;
    this.kept = rawDraft.columns.flatMap((target) => {
      const source = target.sourceName === null ? undefined : columns.find((column) => isSameName(column.name, target.sourceName ?? ""));
      return source === undefined ? [] : [{ source, target }];
    });
    this.dropped = columns.filter((column) => !this.kept.some((kept) => kept.source === column));
    this.added = rawDraft.columns.filter((column) => !this.kept.some((kept) => kept.target === column));
    this.renames = new Map(
      this.kept
        .filter((kept) => kept.source.name !== kept.target.name)
        .filter((kept) => !rawDraft.columns.some((column) => isSameName(column.name, kept.source.name) && column !== kept.target))
        .map((kept) => [kept.source.name.toLowerCase(), kept.target.name]),
    );
    this.draft = this.renamedDraft(rawDraft);
  }

  isAlterableInPlace(): boolean {
    const definition = this.current.definition;
    return (
      this.areOptionsKept() &&
      this.kept.every((kept) => isColumnKept(kept.source, kept.target)) &&
      this.isOrderKept() &&
      isSameList(this.mapNames(definition.primaryKeyColumnNames), this.draft.primaryKeyColumnNames) &&
      isSameSet(definition.uniqueConstraints.map((constraint) => this.mapUnique(constraint)), this.draft.uniqueConstraints, isSameUnique) &&
      isSameSet(definition.checks.map((check) => this.mapCheck(check)), this.draft.checks, isSameCheck) &&
      isSameSet(definition.foreignKeys.map((foreignKey) => this.mapForeignKey(foreignKey)), this.keptForeignKeys(), isSameForeignKey) &&
      this.added.every((column) => !this.draft.primaryKeyColumnNames.some((name) => isSameName(name, column.name)) && column.generated?.storage !== "stored")
    );
  }

  planInPlace(): TablePlan {
    const { droppedIndexes, createdIndexes } = this.diffIndexes();
    const statements = [
      ...droppedIndexes.map((index) => `DROP INDEX ${quoteIdentifier(index.name)}`),
      ...this.renameStatements(),
      ...this.dropped.map((column) => `ALTER TABLE ${quoteIdentifier(this.oldName)} DROP COLUMN ${quoteIdentifier(column.name)}`),
      ...this.added.map(
        (column) => `ALTER TABLE ${quoteIdentifier(this.oldName)} ADD COLUMN ${buildAddedColumnDefinition(column, this.draft, this.findAddedForeignKey(column), this.oldName)}`,
      ),
      ...createdIndexes.map((index) => buildCreateIndexStatement(index, this.oldName)),
      ...this.tableRenameStatements(),
      `PRAGMA foreign_key_check(${quoteIdentifier(this.draft.name)})`,
    ];
    return { statements, isRebuild: false, warnings: this.warnings(), isForeignKeysOff: false };
  }

  planRebuild(context: AlterationContext): TablePlan {
    const temporaryName = `${REBUILD_TABLE_PREFIX}${this.oldName}`;
    const copied = this.kept.filter((kept) => kept.target.generated === null && kept.source.generated === null);
    const copiedNames = copied.map((kept) => quoteIdentifier(kept.target.name)).join(", ");
    const views = context.views.map((view) => ({ name: view.name, sql: renameIdentifiers(view.sql, this.renames) }));
    const statements = [
      ...this.renameStatements(),
      buildCreateTableStatement(this.draft, temporaryName, this.oldName),
      ...(copied.length > 0 ? [`INSERT INTO ${quoteIdentifier(temporaryName)} (${copiedNames}) SELECT ${copiedNames} FROM ${quoteIdentifier(this.oldName)}`] : []),
      ...views.map((view) => `DROP VIEW ${quoteIdentifier(view.name)}`),
      `DROP TABLE ${quoteIdentifier(this.oldName)}`,
      // The rename must not rewrite or check the rest of the schema: the old table is gone, the views are recreated below.
      "PRAGMA legacy_alter_table = ON",
      `ALTER TABLE ${quoteIdentifier(temporaryName)} RENAME TO ${quoteIdentifier(this.oldName)}`,
      "PRAGMA legacy_alter_table = OFF",
      ...this.draft.indexes.map((index) => buildCreateIndexStatement(index, this.oldName)),
      ...this.current.triggerStatements.map((trigger) => renameIdentifiers(trigger, this.renames)),
      ...views.map((view) => view.sql),
      ...this.tableRenameStatements(),
      ...[this.draft.name, ...context.referencingTableNames.filter((name) => !isSameName(name, this.oldName))].map(
        (name) => `PRAGMA foreign_key_check(${quoteIdentifier(name)})`,
      ),
    ];
    return { statements, isRebuild: true, warnings: this.warnings(), isForeignKeysOff: true };
  }

  private renamedDraft(draft: TableDraft): TableDraft {
    const rename = (text: string): string => renameIdentifiers(text, this.renames);
    return {
      ...draft,
      columns: draft.columns.map((column) => (column.generated === null ? column : { ...column, generated: { ...column.generated, expression: rename(column.generated.expression) } })),
      checks: draft.checks.map((check) => ({ ...check, expression: rename(check.expression) })),
      indexes: draft.indexes.map((index) => ({
        ...index,
        parts: index.parts.map((part) => (part.kind === "expression" ? { ...part, expression: rename(part.expression) } : part)),
        whereExpression: index.whereExpression === null ? null : rename(index.whereExpression),
      })),
    };
  }

  /** Renames in two steps through temporary names where a new name is an old one: "a" to "b" and "b" to "a". */
  private renameStatements(): readonly string[] {
    const renamed = this.kept.filter((kept) => kept.source.name !== kept.target.name);
    const oldNames = this.current.definition.columns.map((column) => column.name);
    const isClashing = renamed.some((kept) => oldNames.some((name) => isSameName(name, kept.target.name)));
    const alter = (from: string, to: string): string => `ALTER TABLE ${quoteIdentifier(this.oldName)} RENAME COLUMN ${quoteIdentifier(from)} TO ${quoteIdentifier(to)}`;
    if (!isClashing) return renamed.map((kept) => alter(kept.source.name, kept.target.name));
    return [
      ...renamed.map((kept, index) => alter(kept.source.name, `${TEMPORARY_COLUMN_PREFIX}${index}`)),
      ...renamed.map((kept, index) => alter(`${TEMPORARY_COLUMN_PREFIX}${index}`, kept.target.name)),
    ];
  }

  private tableRenameStatements(): readonly string[] {
    if (this.oldName === this.draft.name) return [];
    if (isSameName(this.oldName, this.draft.name)) {
      const temporaryName = `${REBUILD_TABLE_PREFIX}${this.oldName}`;
      return [`ALTER TABLE ${quoteIdentifier(this.oldName)} RENAME TO ${quoteIdentifier(temporaryName)}`, `ALTER TABLE ${quoteIdentifier(temporaryName)} RENAME TO ${quoteIdentifier(this.draft.name)}`];
    }
    return [`ALTER TABLE ${quoteIdentifier(this.oldName)} RENAME TO ${quoteIdentifier(this.draft.name)}`];
  }

  private diffIndexes(): { droppedIndexes: readonly IndexDefinition[]; createdIndexes: readonly IndexDefinition[] } {
    const mapped = this.current.definition.indexes.map((index) => ({ index, mapped: this.mapIndex(index) }));
    const droppedIndexes = mapped.filter(({ mapped: old }) => !this.draft.indexes.some((index) => isSameIndex(old, index))).map(({ index }) => index);
    const createdIndexes = this.draft.indexes.filter((index) => !mapped.some(({ mapped: old }) => isSameIndex(old, index)));
    return { droppedIndexes, createdIndexes };
  }

  private areOptionsKept(): boolean {
    const keys = new Set([...Object.keys(this.current.definition.options), ...Object.keys(this.draft.options)]);
    return [...keys].every((key) => (this.current.definition.options[key] === true) === (this.draft.options[key] === true));
  }

  /** The kept columns stay in their order, the added ones come after them all. */
  private isOrderKept(): boolean {
    const positions = this.kept.map((kept) => this.current.definition.columns.indexOf(kept.source));
    const isAscending = positions.every((position, index) => index === 0 || position > (positions[index - 1] ?? -1));
    const lastKeptIndex = Math.max(-1, ...this.kept.map((kept) => this.draft.columns.findIndex((column) => isSameName(column.name, kept.target.name))));
    const firstAddedIndex = Math.min(Number.MAX_SAFE_INTEGER, ...this.added.map((added) => this.draft.columns.findIndex((column) => isSameName(column.name, added.name))));
    return isAscending && firstAddedIndex > lastKeptIndex;
  }

  /** The draft's foreign keys but those ADD COLUMN writes inline: one column, an added one, with no default to check. */
  private keptForeignKeys(): readonly ForeignKey[] {
    return this.draft.foreignKeys.filter((foreignKey) => !this.added.some((column) => this.findAddedForeignKey(column) === foreignKey));
  }

  private findAddedForeignKey(column: ColumnDraft): ForeignKey | null {
    if (column.defaultExpression !== null && column.defaultExpression.trim().toUpperCase() !== "NULL") return null;
    return this.draft.foreignKeys.find((foreignKey) => foreignKey.columnNames.length === 1 && isSameName(foreignKey.columnNames[0] ?? "", column.name)) ?? null;
  }

  private mapNames(names: readonly string[]): readonly string[] {
    return names.map((name) => this.renames.get(name.toLowerCase()) ?? name);
  }

  private mapUnique(constraint: UniqueConstraint): UniqueConstraint {
    return { ...constraint, columnNames: this.mapNames(constraint.columnNames) };
  }

  private mapCheck(check: CheckConstraint): CheckConstraint {
    return { ...check, expression: renameIdentifiers(check.expression, this.renames) };
  }

  private mapForeignKey(foreignKey: ForeignKey): ForeignKey {
    const isSelf = isSameName(foreignKey.targetTableName, this.oldName);
    return {
      ...foreignKey,
      columnNames: this.mapNames(foreignKey.columnNames),
      targetTableName: isSelf ? this.draft.name : foreignKey.targetTableName,
      targetColumnNames: isSelf ? this.mapNames(foreignKey.targetColumnNames) : foreignKey.targetColumnNames,
    };
  }

  private mapIndex(index: IndexDefinition): IndexDefinition {
    return {
      ...index,
      parts: index.parts.map((part) =>
        part.kind === "column"
          ? { ...part, columnName: this.renames.get(part.columnName.toLowerCase()) ?? part.columnName }
          : { ...part, expression: renameIdentifiers(part.expression, this.renames) },
      ),
      whereExpression: index.whereExpression === null ? null : renameIdentifiers(index.whereExpression, this.renames),
    };
  }

  private warnings(): readonly string[] {
    return [
      ...this.dropped.map((column) => `The column "${column.name}" is dropped with its values`),
      ...this.kept
        .filter((kept) => normalizeType(kept.source.type) !== normalizeType(kept.target.type))
        .map((kept) => `The values of "${kept.target.name}" are converted from ${kept.source.type || "no type"} to ${kept.target.type || "no type"} as SQLite does`),
      ...this.kept.filter((kept) => !kept.source.isNotNull && kept.target.isNotNull).map((kept) => `A row with an empty "${kept.target.name}" stops the change`),
    ];
  }
}

const isColumnKept = (source: ColumnDefinition, target: ColumnDraft): boolean =>
  normalizeType(source.type) === normalizeType(target.type) &&
  source.isNotNull === target.isNotNull &&
  normalizeText(source.defaultExpression) === normalizeText(target.defaultExpression) &&
  normalizeText(source.collation)?.toUpperCase() === normalizeText(target.collation)?.toUpperCase() &&
  normalizeText(source.generated?.expression ?? null) === normalizeText(target.generated?.expression ?? null) &&
  (source.generated?.storage ?? null) === (target.generated?.storage ?? null);

const isSameUnique = (first: UniqueConstraint, second: UniqueConstraint): boolean =>
  normalizeText(first.name) === normalizeText(second.name) && isSameList(first.columnNames, second.columnNames);

const isSameCheck = (first: CheckConstraint, second: CheckConstraint): boolean =>
  normalizeText(first.name) === normalizeText(second.name) && normalizeText(first.expression) === normalizeText(second.expression);

const isSameForeignKey = (first: ForeignKey, second: ForeignKey): boolean =>
  normalizeText(first.name) === normalizeText(second.name) &&
  isSameList(first.columnNames, second.columnNames) &&
  isSameName(first.targetTableName, second.targetTableName) &&
  isSameList(first.targetColumnNames, second.targetColumnNames) &&
  first.onUpdate === second.onUpdate &&
  first.onDelete === second.onDelete;

const isSameIndex = (first: IndexDefinition, second: IndexDefinition): boolean =>
  isSameName(first.name, second.name) &&
  first.isUnique === second.isUnique &&
  normalizeText(first.whereExpression) === normalizeText(second.whereExpression) &&
  first.parts.length === second.parts.length &&
  first.parts.every((part, index) => {
    const other = second.parts[index];
    if (other === undefined || part.order !== other.order || part.kind !== other.kind) return false;
    return part.kind === "column" ? isSameName(part.columnName, other.kind === "column" ? other.columnName : "") : normalizeText(part.expression) === normalizeText(other.kind === "expression" ? other.expression : "");
  });

const isSameList = (first: readonly string[], second: readonly string[]): boolean =>
  first.length === second.length && first.every((name, index) => isSameName(name, second[index] ?? ""));

const isSameSet = <T>(first: readonly T[], second: readonly T[], isSame: (one: T, other: T) => boolean): boolean =>
  first.length === second.length && first.every((item) => second.some((other) => isSame(item, other)));

const normalizeType = (type: string): string => type.trim().replace(/\s+/g, " ").toUpperCase();

const normalizeText = (text: string | null): string | null => {
  const trimmed = text?.trim().replace(/\s+/g, " ") ?? "";
  return trimmed === "" ? null : trimmed;
};
