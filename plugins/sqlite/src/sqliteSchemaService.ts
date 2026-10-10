// SchemaService over SQLite: reads through the schema cache, changes as planned by schema/alterationPlanner.ts.
// A change is validated first, every violation at once; an ALTER TABLE plan that SQLite refuses falls back to a rebuild.

import type { ReferencingKey } from "@db-manager/connector";
import type { SchemaChangePlan } from "@db-manager/connector";
import type { SchemaService } from "@db-manager/connector";
import type { TableDefinition } from "@db-manager/connector";
import type { TableDraft } from "@db-manager/connector";
import type { TableName } from "@db-manager/connector";
import type { TableSummary } from "@db-manager/connector";

import type { RunMode } from "./engine/engineMessages.js";
import { statement } from "./engine/statementRunner.js";
import type { StatementRunner } from "./engine/statementRunner.js";
import { schemaError, schemaRefusal } from "./errors.js";
import { INTERNAL_NAME_PREFIX, REBUILD_TABLE_PREFIX } from "./protocol.js";
import { isRebuildRefusal, planTableAlterationInPlace, planTableCreation, planTableRebuild } from "./schema/alterationPlanner.js";
import type { TablePlan } from "./schema/alterationPlanner.js";
import type { ViewStatement } from "./schema/alterationPlanner.js";
import { validateDraft } from "./schema/draftValidation.js";
import type { SchemaCache } from "./schema/schemaCache.js";
import { selectTableSummaries } from "./schema/schemaReader.js";
import type { TableSchema } from "./schema/tableSchema.js";
import { isSameName, quoteIdentifier } from "./utils/identifier.js";
import { isKeyword, tokenizeSql } from "./utils/sqlTokens.js";

const FOREIGN_KEY_CHECK = "PRAGMA foreign_key_check";

export const buildSqliteSchemaService = (runner: StatementRunner, cache: SchemaCache): SchemaService => new SqliteSchemaService(runner, cache);

class SqliteSchemaService implements SchemaService {
  constructor(
    private readonly runner: StatementRunner,
    private readonly cache: SchemaCache,
  ) {}

  async selectTables(): Promise<readonly TableSummary[]> {
    return guard(() => selectTableSummaries(this.runner));
  }

  async getTableDefinition(tableName: TableName): Promise<TableDefinition> {
    return (await this.getTable(tableName)).definition;
  }

  async selectReferencingKeys(tableName: TableName): Promise<readonly ReferencingKey[]> {
    const target = await this.getTable(tableName);
    const tables = await this.selectTables();
    const keys: ReferencingKey[] = [];
    for (const summary of tables.filter((table) => table.kind === "table")) {
      const table = await guard(() => this.cache.findTable(summary.name));
      for (const foreignKey of table?.definition.foreignKeys ?? []) {
        if (isSameName(foreignKey.targetTableName, target.definition.name)) keys.push({ tableName: summary.name, foreignKey });
      }
    }
    return keys;
  }

  async previewTableCreation(draft: TableDraft): Promise<SchemaChangePlan> {
    const plan = await this.planCreation(draft);
    await this.runPlan(plan, "rollback");
    return toSchemaChangePlan(plan);
  }

  async createTable(draft: TableDraft): Promise<TableDefinition> {
    const plan = await this.planCreation(draft);
    await this.runPlan(plan, "commit");
    this.cache.forget();
    return this.getTableDefinition(draft.name);
  }

  async previewTableAlteration(tableName: TableName, draft: TableDraft): Promise<SchemaChangePlan> {
    return toSchemaChangePlan(await this.applyAlteration(tableName, draft, "rollback"));
  }

  async alterTable(tableName: TableName, draft: TableDraft): Promise<TableDefinition> {
    await this.applyAlteration(tableName, draft, "commit");
    this.cache.forget();
    return this.getTableDefinition(draft.name);
  }

  async renameTable(tableName: TableName, newName: TableName): Promise<void> {
    const table = await this.getTable(tableName);
    const name = newName.trim();
    if (name === "" || name.toLowerCase().startsWith(INTERNAL_NAME_PREFIX) || name.startsWith(REBUILD_TABLE_PREFIX)) {
      throw schemaError("invalid-definition", `"${newName}" cannot be a table name`, [{ kind: "invalid-name", path: "name", message: `"${newName}" cannot be a table name` }]);
    }
    const isOwnName = isSameName(table.definition.name, name);
    if (!isOwnName && (await this.selectTables()).some((summary) => isSameName(summary.name, name))) {
      throw schemaError("name-taken", `A table or view named "${name}" exists already`);
    }
    if (table.definition.kind === "view") throw schemaError("not-supported", "SQLite cannot rename a view; edit its statement instead");
    const temporaryName = `${REBUILD_TABLE_PREFIX}${table.definition.name}`;
    const statements = isOwnName
      ? [`ALTER TABLE ${quoteIdentifier(table.definition.name)} RENAME TO ${quoteIdentifier(temporaryName)}`, `ALTER TABLE ${quoteIdentifier(temporaryName)} RENAME TO ${quoteIdentifier(name)}`]
      : [`ALTER TABLE ${quoteIdentifier(table.definition.name)} RENAME TO ${quoteIdentifier(name)}`];
    await guard(() => this.runner.run(statements.map((sql) => statement(sql)), "commit"));
    this.cache.forget();
  }

  async dropTable(tableName: TableName): Promise<void> {
    const table = await this.getTable(tableName);
    const kind = table.definition.kind === "view" ? "VIEW" : "TABLE";
    await guard(() => this.runner.run([statement(`DROP ${kind} ${quoteIdentifier(table.definition.name)}`)], "commit"));
    this.cache.forget();
  }

  private async getTable(tableName: TableName): Promise<TableSchema> {
    const table = await guard(() => this.cache.findTable(tableName));
    if (table === null) throw schemaError("table-not-found", `There is no table "${tableName}"`);
    return table;
  }

  private async planCreation(draft: TableDraft): Promise<TablePlan> {
    await this.validate(draft, null);
    return planTableCreation(draft);
  }

  /** The in-place plan where SQLite takes it, else the rebuild; the one that ran is returned. */
  private async applyAlteration(tableName: TableName, draft: TableDraft, mode: RunMode): Promise<TablePlan> {
    const current = await this.getTable(tableName);
    if (current.definition.kind === "view") throw schemaError("not-supported", "A view is changed by its statement, not by the table designer");
    await this.validate(draft, current);
    const inPlace = planTableAlterationInPlace(current, draft);
    if (inPlace !== null) {
      try {
        await this.runPlan(inPlace, mode);
        return inPlace;
      } catch (error) {
        // ALTER TABLE refuses what a rebuild may still do: a column dropped that an index used, a column added NOT NULL.
        if (!isInvalidDefinition(error)) throw error;
      }
    }
    const rebuild = await this.planRebuild(current, draft);
    await this.runPlan(rebuild, mode);
    return rebuild;
  }

  private async planRebuild(current: TableSchema, draft: TableDraft): Promise<TablePlan> {
    const referencingTableNames = (await this.selectReferencingKeys(current.definition.name)).map((key) => key.tableName);
    const views = await this.selectViewsNaming(current.definition.name);
    try {
      return planTableRebuild(current, draft, { views, referencingTableNames });
    } catch (error) {
      if (!isRebuildRefusal(error)) throw error;
      throw schemaError("not-supported", `This change rebuilds the table, which would lose ${error.unsupportedFeatures.join(", ")}`);
    }
  }

  private async validate(draft: TableDraft, current: TableSchema | null): Promise<void> {
    const tables = await this.selectTables();
    const [indexResult] = await guard(() =>
      this.runner.run([statement(`SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name <> ? COLLATE NOCASE`, [current?.definition.name ?? ""])], "read"),
    );
    const targetNames = draft.foreignKeys.map((foreignKey) => foreignKey.targetTableName).filter((name) => !isSameName(name, draft.name));
    const targetTables: TableSchema[] = [];
    for (const name of new Set(targetNames.map((target) => target.toLowerCase()))) {
      const table = await guard(() => this.cache.findTable(name));
      if (table !== null) targetTables.push(table);
    }
    const violations = validateDraft(draft, {
      currentTable: current,
      tableNames: tables.map((table) => table.name),
      foreignIndexNames: (indexResult?.rows ?? []).map((row) => String(row[0])),
      targetTables,
    });
    if (violations.length > 0) throw schemaError("invalid-definition", violations.map((violation) => violation.message).join("; "), violations);
  }

  private async selectViewsNaming(tableName: string): Promise<readonly ViewStatement[]> {
    const [result] = await guard(() => this.runner.run([statement(`SELECT name, sql FROM sqlite_schema WHERE type = 'view' AND sql IS NOT NULL`)], "read"));
    return (result?.rows ?? [])
      .map((row) => ({ name: String(row[0]), sql: String(row[1]) }))
      .filter((view) => namesTable(view.sql, tableName));
  }

  private async runPlan(plan: TablePlan, mode: RunMode): Promise<void> {
    const statements = plan.statements.map((sql) => statement(sql, [], sql.startsWith(FOREIGN_KEY_CHECK) ? "no-rows" : "any"));
    await guard(() => this.runner.run(statements, mode, plan.isForeignKeysOff));
  }
}

/** Runs an engine call, its failure as a SchemaError. */
const guard = async <T>(call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (error) {
    throw schemaRefusal(error);
  }
};

const isInvalidDefinition = (error: unknown): boolean => typeof error === "object" && error !== null && "kind" in error && error.kind === "invalid-definition";

const toSchemaChangePlan = (plan: TablePlan): SchemaChangePlan => ({ statements: plan.statements, isRebuild: plan.isRebuild, warnings: plan.warnings });

/** Whether the statement names the table anywhere, as a word or a quoted name, past its own CREATE VIEW name. */
const namesTable = (sql: string, tableName: string): boolean => {
  try {
    const tokens = tokenizeSql(sql);
    const asIndex = tokens.findIndex((token) => isKeyword(token, "AS"));
    return tokens.slice(asIndex + 1).some((token) => (token.kind === "word" || token.kind === "identifier") && isSameName(token.value, tableName));
  } catch {
    // A view SQLite keeps is always readable; were it not, recreating it is safer than leaving it out.
    return true;
  }
};
