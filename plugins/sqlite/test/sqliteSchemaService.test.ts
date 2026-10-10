import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseConnection } from "@db-manager/connector";
import type { SchemaError } from "@db-manager/connector";
import type { TableDefinition } from "@db-manager/connector";
import type { TableDraft } from "@db-manager/connector";

import { openDemoDatabase, openScriptedDatabase, refusalKind } from "./testPlugin.js";

const FIRST_PAGE = { offset: 0, rowCount: 100, sortings: [], conditions: [] };

/** The draft that leaves the table as it is: what the table designer starts from. */
const draftOf = (definition: TableDefinition): TableDraft => ({
  name: definition.name,
  columns: definition.columns.map((column) => ({
    sourceName: column.name,
    name: column.name,
    type: column.type,
    isNotNull: column.isNotNull,
    defaultExpression: column.defaultExpression,
    generated: column.generated,
    collation: column.collation,
  })),
  primaryKeyColumnNames: definition.primaryKeyColumnNames,
  uniqueConstraints: definition.uniqueConstraints,
  foreignKeys: definition.foreignKeys,
  checks: definition.checks,
  indexes: definition.indexes,
  options: definition.options,
});

const definitionOf = (connection: DatabaseConnection, name: string): Promise<TableDefinition> => connection.schemaService.getTableDefinition(name);

test("the tables and views are listed by name, SQLite's own left out", async () => {
  const connection = await openDemoDatabase();
  const tables = await connection.schemaService.selectTables();
  assert.ok(tables.some((table) => table.name === "order_totals" && table.kind === "view"));
  assert.ok(!tables.some((table) => table.name.startsWith("sqlite_")));
});

test("a table is read with its composite key, generated column, checks, options and identity", async () => {
  const connection = await openDemoDatabase();
  const lines = await definitionOf(connection, "order_lines");
  assert.deepEqual(lines.primaryKeyColumnNames, ["order_id", "line_no"]);
  assert.deepEqual(lines.columns.find((column) => column.name === "amount")?.generated, { expression: "quantity * unit_price", storage: "virtual" });
  assert.deepEqual(lines.checks, [{ name: null, expression: "quantity > 0" }]);
  assert.deepEqual(lines.rowIdentity, { kind: "primary-key", columnNames: ["order_id", "line_no"] });
  const regions = await definitionOf(connection, "regions");
  assert.equal(regions.options["withoutRowId"], true);
  assert.equal((await definitionOf(connection, "orders")).options["autoincrement"], true);
  assert.deepEqual((await definitionOf(connection, "audit_log")).rowIdentity, { kind: "row-id" });
  const customers = await definitionOf(connection, "customers");
  assert.deepEqual(customers.uniqueConstraints, [{ name: null, columnNames: ["email"] }]);
  assert.deepEqual(customers.indexes[0]?.parts, [{ kind: "expression", expression: "lower(name)", order: "ascending" }]);
  assert.equal(customers.columns.find((column) => column.name === "created_at")?.valueKind, "datetime");
});

test("a composite foreign key is read with its name and target columns, an implied target spelled out", async () => {
  const connection = await openDemoDatabase();
  const items = await definitionOf(connection, "shipment_items");
  const shipped = items.foreignKeys.find((foreignKey) => foreignKey.name === "shipped_line");
  assert.deepEqual([shipped?.columnNames, shipped?.targetTableName, shipped?.targetColumnNames], [["order_id", "line_no"], "order_lines", ["order_id", "line_no"]]);
  const keys = await connection.schemaService.selectReferencingKeys("order_lines");
  assert.deepEqual(keys.map((key) => [key.tableName, key.foreignKey.columnNames]), [["shipment_items", ["order_id", "line_no"]]]);
  const selfKeys = await connection.schemaService.selectReferencingKeys("employees");
  assert.ok(selfKeys.some((key) => key.tableName === "employees" && key.foreignKey.columnNames[0] === "manager_id"));
});

test("a table with a composite foreign key is created, its plan previewed first", async () => {
  const connection = await openDemoDatabase();
  const draft: TableDraft = {
    name: "returns",
    columns: [
      { sourceName: null, name: "id", type: "INTEGER", isNotNull: false, defaultExpression: null, generated: null, collation: null },
      { sourceName: null, name: "order_id", type: "INTEGER", isNotNull: true, defaultExpression: null, generated: null, collation: null },
      { sourceName: null, name: "line_no", type: "INTEGER", isNotNull: true, defaultExpression: null, generated: null, collation: null },
      { sourceName: null, name: "reason", type: "TEXT", isNotNull: false, defaultExpression: "'unknown'", generated: null, collation: "NOCASE" },
    ],
    primaryKeyColumnNames: ["id"],
    uniqueConstraints: [],
    foreignKeys: [{ name: "returned_line", columnNames: ["order_id", "line_no"], targetTableName: "order_lines", targetColumnNames: ["order_id", "line_no"], onUpdate: "no-action", onDelete: "cascade" }],
    checks: [],
    indexes: [{ name: "returns_by_line", parts: [{ kind: "column", columnName: "order_id", order: "ascending" }, { kind: "column", columnName: "line_no", order: "ascending" }], isUnique: false, whereExpression: null }],
    options: {},
  };
  const plan = await connection.schemaService.previewTableCreation(draft);
  assert.equal(plan.statements.length, 2);
  assert.ok(!(await connection.schemaService.selectTables()).some((table) => table.name === "returns"));
  const created = await connection.schemaService.createTable(draft);
  assert.deepEqual(created.foreignKeys[0]?.targetColumnNames, ["order_id", "line_no"]);
  assert.equal(created.columns.find((column) => column.name === "reason")?.collation, "NOCASE");
  assert.equal(created.indexes[0]?.name, "returns_by_line");
});

test("a draft is refused with every violation at once", async () => {
  const connection = await openDemoDatabase();
  const draft: TableDraft = {
    name: "orders",
    columns: [
      { sourceName: null, name: "a", type: "TEXT", isNotNull: false, defaultExpression: null, generated: null, collation: null },
      { sourceName: null, name: "a", type: "TEXT", isNotNull: false, defaultExpression: null, generated: null, collation: null },
    ],
    primaryKeyColumnNames: ["b"],
    uniqueConstraints: [],
    foreignKeys: [{ name: null, columnNames: ["a"], targetTableName: "nowhere", targetColumnNames: ["x"], onUpdate: "no-action", onDelete: "no-action" }],
    checks: [],
    indexes: [],
    options: {},
  };
  const error = (await connection.schemaService.createTable(draft).catch((caught: unknown) => caught)) as SchemaError;
  assert.equal(error.kind, "invalid-definition");
  assert.deepEqual(error.violations.map((violation) => violation.path).sort(), ["columns.1.name", "foreignKeys.0.targetTableName", "name", "primaryKeyColumnNames.0"]);
});

test("a column renamed and a column added change the table in place, its rows kept", async () => {
  const connection = await openDemoDatabase();
  const draft = draftOf(await definitionOf(connection, "customers"));
  const renamed: TableDraft = {
    ...draft,
    columns: [
      ...draft.columns.map((column) => (column.name === "name" ? { ...column, name: "full_name" } : column)),
      { sourceName: null, name: "phone", type: "TEXT", isNotNull: false, defaultExpression: null, generated: null, collation: null },
    ],
  };
  const plan = await connection.schemaService.previewTableAlteration("customers", renamed);
  assert.equal(plan.isRebuild, false);
  const altered = await connection.schemaService.alterTable("customers", renamed);
  assert.deepEqual(altered.columns.map((column) => column.name), ["id", "full_name", "email", "country_code", "region_code", "created_at", "phone"]);
  // SQLite writes the renamed column into the index quoted.
  assert.deepEqual(altered.indexes[0]?.parts, [{ kind: "expression", expression: 'lower("full_name")', order: "ascending" }]);
  const [row] = await connection.rowService.selectMatchingRows("customers", ["id"], [[5n]]);
  assert.equal(row?.values["full_name"], "Olena Koval");
});

test("a changed type rebuilds the table, its rows, checks, generated column, indexes, triggers and views kept", async () => {
  const connection = await openDemoDatabase();
  const draft = draftOf(await definitionOf(connection, "order_lines"));
  const retyped: TableDraft = { ...draft, columns: draft.columns.map((column) => (column.name === "quantity" ? { ...column, type: "REAL" } : column)) };
  const plan = await connection.schemaService.previewTableAlteration("order_lines", retyped);
  assert.equal(plan.isRebuild, true);
  const altered = await connection.schemaService.alterTable("order_lines", retyped);
  assert.equal(altered.columns.find((column) => column.name === "quantity")?.type, "REAL");
  assert.deepEqual(altered.checks, [{ name: null, expression: "quantity > 0" }]);
  assert.equal(altered.columns.find((column) => column.name === "amount")?.generated?.expression, "quantity * unit_price");
  assert.equal((await connection.rowService.getRowPage("order_lines", FIRST_PAGE)).totalCount, 10);
  assert.equal((await connection.rowService.getRowPage("order_totals", FIRST_PAGE)).totalCount, 6);
  const keys = await connection.schemaService.selectReferencingKeys("order_lines");
  assert.equal(keys[0]?.tableName, "shipment_items");
});

test("orders rebuilt keep the trigger that logs them", async () => {
  const connection = await openDemoDatabase();
  const draft = draftOf(await definitionOf(connection, "orders"));
  await connection.schemaService.alterTable("orders", { ...draft, columns: draft.columns.filter((column) => column.name !== "note") });
  await connection.rowService.createRows("orders", [{ values: { customer_id: 1n, ordered_on: "2026-09-01" } }]);
  assert.equal((await connection.rowService.getRowPage("audit_log", FIRST_PAGE)).totalCount, 7);
  assert.deepEqual((await definitionOf(connection, "orders")).indexes.map((index) => index.name), ["orders_by_customer"]);
});

test("NOT NULL over empty values is refused as a data conflict, nothing changed", async () => {
  const connection = await openDemoDatabase();
  const draft = draftOf(await definitionOf(connection, "customers"));
  const strict: TableDraft = { ...draft, columns: draft.columns.map((column) => (column.name === "email" ? { ...column, isNotNull: true } : column)) };
  assert.equal(await refusalKind(connection.schemaService.alterTable("customers", strict)), "data-conflict");
  assert.equal((await definitionOf(connection, "customers")).columns.find((column) => column.name === "email")?.isNotNull, false);
});

test("a table renamed is still referred to by the foreign keys of others", async () => {
  const connection = await openDemoDatabase();
  await connection.schemaService.renameTable("products", "items");
  const lines = await definitionOf(connection, "order_lines");
  assert.ok(lines.foreignKeys.some((foreignKey) => foreignKey.targetTableName === "items"));
  assert.equal(await refusalKind(connection.schemaService.renameTable("items", "orders")), "name-taken");
});

test("a table others refer to by their rows is not dropped", async () => {
  const connection = await openDemoDatabase();
  assert.equal(await refusalKind(connection.schemaService.dropTable("order_lines")), "data-conflict");
  await connection.schemaService.dropTable("shipment_items");
  assert.equal(await refusalKind(connection.schemaService.getTableDefinition("shipment_items")), "table-not-found");
});

test("a rebuild that would lose what the plugin cannot write back is refused; a change in place is not", async () => {
  const connection = await openScriptedDatabase("CREATE TABLE legacy (code TEXT UNIQUE ON CONFLICT REPLACE, note TEXT); INSERT INTO legacy VALUES ('a', 'x');");
  const draft = draftOf(await definitionOf(connection, "legacy"));
  const retyped: TableDraft = { ...draft, columns: draft.columns.map((column) => (column.name === "note" ? { ...column, type: "INTEGER" } : column)) };
  const error = (await connection.schemaService.alterTable("legacy", retyped).catch((caught: unknown) => caught)) as SchemaError;
  assert.equal(error.kind, "not-supported");
  assert.match(error.message, /ON CONFLICT REPLACE/);
  const renamed: TableDraft = { ...draft, columns: draft.columns.map((column) => (column.name === "note" ? { ...column, name: "remark" } : column)) };
  await connection.schemaService.alterTable("legacy", renamed);
  assert.deepEqual((await definitionOf(connection, "legacy")).columns.map((column) => column.name), ["code", "remark"]);
});

test("a table made by another program without a primary key, dropped columns and swapped names are handled", async () => {
  const connection = await openScriptedDatabase("CREATE TABLE t (a INTEGER, b TEXT, c BLOB); CREATE INDEX t_c ON t (c); INSERT INTO t VALUES (1, 'one', x'01');");
  const draft = draftOf(await definitionOf(connection, "t"));
  const changed: TableDraft = {
    ...draft,
    columns: draft.columns
      .filter((column) => column.name !== "c")
      .map((column) => (column.name === "a" ? { ...column, name: "b" } : column.name === "b" ? { ...column, name: "a" } : column)),
    indexes: [],
  };
  await connection.schemaService.alterTable("t", changed);
  const page = await connection.rowService.getRowPage("t", FIRST_PAGE);
  assert.deepEqual(page.rows[0]?.values, { b: 1n, a: "one" });
});
