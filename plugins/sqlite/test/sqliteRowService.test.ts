import assert from "node:assert/strict";
import { test } from "node:test";

import type { RowPageRequest } from "@db-manager/connector";

import { openDemoDatabase, refusalKind } from "./testPlugin.js";

const FIRST_PAGE: RowPageRequest = { offset: 0, rowCount: 100, sortings: [], conditions: [] };

test("a page is filtered, sorted, counted and keyed by the composite primary key", async () => {
  const connection = await openDemoDatabase();
  const page = await connection.rowService.getRowPage("order_lines", {
    offset: 0,
    rowCount: 2,
    sortings: [{ columnName: "unit_price", order: "descending" }],
    conditions: [{ columnName: "quantity", comparison: "greater-or-equal", value: 2n }],
  });
  assert.equal(page.totalCount, 5);
  assert.deepEqual(page.rows.map((row) => row.key), [[5n, 1n], [4n, 1n]]);
  assert.equal(Number(page.rows[0]?.values["amount"]), 478);
});

test("a table without a primary key is keyed by its row id", async () => {
  const connection = await openDemoDatabase();
  const page = await connection.rowService.getRowPage("audit_log", FIRST_PAGE);
  assert.equal(page.totalCount, 6);
  assert.equal(typeof page.rows[0]?.key?.[0], "bigint");
  assert.equal(Object.keys(page.rows[0]?.values ?? {}).length, 2);
});

test("the rows referring to a row by a composite foreign key are found by its columns", async () => {
  const connection = await openDemoDatabase();
  const page = await connection.rowService.getRowPage("shipment_items", {
    ...FIRST_PAGE,
    conditions: [
      { columnName: "order_id", comparison: "equals", value: 3n },
      { columnName: "line_no", comparison: "equals", value: 2n },
    ],
  });
  assert.deepEqual(page.rows.map((row) => row.key), [[2n, 3n, 2n]]);
});

test("matching rows come back in the order of the tuples asked, null where none matches", async () => {
  const connection = await openDemoDatabase();
  const rows = await connection.rowService.selectMatchingRows("order_lines", ["order_id", "line_no"], [[3n, 3n], [9n, 9n], [1n, 1n], [null, 1n]]);
  assert.deepEqual(rows.map((row) => row?.values["sku"] ?? null), ["MS-02", null, "KB-01", null]);
});

test("a text condition contains ignoring case", async () => {
  const connection = await openDemoDatabase();
  const page = await connection.rowService.getRowPage("customers", { ...FIRST_PAGE, conditions: [{ columnName: "name", comparison: "contains", value: "KOV" }] });
  assert.deepEqual(page.rows.map((row) => row.values["name"]), ["Olena Koval"]);
});

test("rows are created, updated by their key, the key itself changed, and deleted", async () => {
  const connection = await openDemoDatabase();
  const [created] = await connection.rowService.createRows("order_lines", [{ values: { order_id: 6n, line_no: 2n, sku: "CB-USB", quantity: 4n, unit_price: "9.99" } }]);
  assert.deepEqual(created?.key, [6n, 2n]);
  const updated = await connection.rowService.updateRow("order_lines", [6n, 2n], { values: { line_no: 3n, quantity: 5n } });
  assert.deepEqual(updated.key, [6n, 3n]);
  assert.equal(updated.values["quantity"], 5n);
  await connection.rowService.deleteRows("order_lines", [[6n, 3n]]);
  assert.equal(await refusalKind(connection.rowService.deleteRows("order_lines", [[6n, 3n]])), "row-not-found");
});

test("a row is created with its defaults and its id assigned", async () => {
  const connection = await openDemoDatabase();
  const [row] = await connection.rowService.createRows("audit_log", [{ values: { message: "hello" } }]);
  assert.equal(typeof row?.values["happened_at"], "string");
  assert.equal(typeof row?.key?.[0], "bigint");
});

test("a broken rule refuses the write by its constraint and columns, nothing written", async () => {
  const connection = await openDemoDatabase();
  const missingLine = { values: { shipment_id: 1n, order_id: 2n, line_no: 9n, quantity: 1n } };
  const error = await connection.rowService.createRows("shipment_items", [missingLine]).catch((caught: unknown) => caught);
  assert.deepEqual([(error as { kind: string }).kind, (error as { constraint: string }).constraint], ["constraint-violated", "foreign-key"]);
  const nullName = await connection.rowService.createRows("customers", [{ values: { name: null } }]).catch((caught: unknown) => caught);
  assert.deepEqual([(nullName as { constraint: string }).constraint, (nullName as { columnNames: string[] }).columnNames], ["not-null", ["name"]]);
  const negative = await connection.rowService.updateRow("products", ["KB-01"], { values: { price: -1n } }).catch((caught: unknown) => caught);
  assert.equal((negative as { constraint: string }).constraint, "check");
  const before = await connection.rowService.getRowPage("customers", FIRST_PAGE);
  const twoRows = [{ values: { name: "Ok" } }, { values: { name: null } }];
  assert.equal(await refusalKind(connection.rowService.createRows("customers", twoRows)), "constraint-violated");
  assert.equal((await connection.rowService.getRowPage("customers", FIRST_PAGE)).totalCount, before.totalCount);
});

test("a row others refer to is not deleted", async () => {
  const connection = await openDemoDatabase();
  assert.equal(await refusalKind(connection.rowService.deleteRows("order_lines", [[3n, 2n]])), "constraint-violated");
});

test("an integer past 2^53 and bytes come back as written", async () => {
  const connection = await openDemoDatabase();
  const big = 9007199254740993n;
  const photo = new Uint8Array([0, 1, 254, 255]);
  await connection.rowService.createRows("customers", [{ values: { id: big, name: "Big" } }]);
  const [row] = await connection.rowService.selectMatchingRows("customers", ["id"], [[big]]);
  assert.equal(row?.values["id"], big);
  const product = await connection.rowService.updateRow("products", ["KB-01"], { values: { photo } });
  assert.deepEqual(product.values["photo"], photo);
});

test("a view's rows are read and never written", async () => {
  const connection = await openDemoDatabase();
  const page = await connection.rowService.getRowPage("order_totals", FIRST_PAGE);
  assert.equal(page.totalCount, 6);
  assert.equal(page.rows[0]?.key, null);
  assert.equal(await refusalKind(connection.rowService.createRows("order_totals", [{ values: {} }])), "read-only");
});

test("an unknown table or column is refused", async () => {
  const connection = await openDemoDatabase();
  assert.equal(await refusalKind(connection.rowService.getRowPage("nothing", FIRST_PAGE)), "table-not-found");
  assert.equal(await refusalKind(connection.rowService.getRowPage("orders", { ...FIRST_PAGE, sortings: [{ columnName: "nope", order: "ascending" }] })), "column-not-found");
  assert.equal(await refusalKind(connection.rowService.updateRow("order_lines", [1n, 1n], { values: { amount: 1n } })), "invalid-value");
});
