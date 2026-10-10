import assert from "node:assert/strict";
import { test } from "node:test";

import type { TableDefinition } from "@db-manager/connector";

import { addColumn, createStateFromDefinition, removeColumn, toTableDraft } from "../src/designer/designerState.js";
import { selectGridColumns } from "../src/utils/gridColumns.js";

const LINES: TableDefinition = {
  name: "shipment_items",
  kind: "table",
  columns: ["shipment_id", "order_id", "line_no", "quantity"].map((name) => ({ name, type: "INTEGER", valueKind: "integer", isNotNull: true, defaultExpression: null, generated: null, collation: null })),
  primaryKeyColumnNames: ["shipment_id", "order_id", "line_no"],
  uniqueConstraints: [],
  foreignKeys: [
    { name: null, columnNames: ["shipment_id"], targetTableName: "shipments", targetColumnNames: ["id"], onUpdate: "no-action", onDelete: "cascade" },
    { name: "shipped_line", columnNames: ["order_id", "line_no"], targetTableName: "order_lines", targetColumnNames: ["order_id", "line_no"], onUpdate: "no-action", onDelete: "no-action" },
  ],
  checks: [],
  indexes: [{ name: "by_line", parts: [{ kind: "column", columnName: "line_no", order: "ascending" }], isUnique: false, whereExpression: null }],
  options: {},
  rowIdentity: { kind: "primary-key", columnNames: ["shipment_id", "order_id", "line_no"] },
  sourceText: null,
};

test("a table left as it is drafts back to itself, every column kept by its source name", () => {
  const draft = toTableDraft(createStateFromDefinition(LINES));
  assert.deepEqual(draft.columns.map((column) => column.sourceName), ["shipment_id", "order_id", "line_no", "quantity"]);
  assert.deepEqual(draft.primaryKeyColumnNames, LINES.primaryKeyColumnNames);
  assert.deepEqual(draft.foreignKeys, LINES.foreignKeys);
  assert.deepEqual(draft.indexes, LINES.indexes);
});

test("a renamed column is renamed in its key, foreign key and index too", () => {
  const state = createStateFromDefinition(LINES);
  const lineColumn = state.columns.find((column) => column.name === "line_no");
  if (lineColumn === undefined) throw new Error("no line_no");
  lineColumn.name = "line_number";
  const draft = toTableDraft(state);
  assert.deepEqual(draft.primaryKeyColumnNames, ["shipment_id", "order_id", "line_number"]);
  assert.deepEqual(draft.foreignKeys[1]?.columnNames, ["order_id", "line_number"]);
  assert.deepEqual(draft.indexes[0]?.parts, [{ kind: "column", columnName: "line_number", order: "ascending" }]);
  assert.equal(draft.columns[2]?.sourceName, "line_no");
});

test("a removed column leaves its key, its foreign key pairs and its index parts", () => {
  const state = createStateFromDefinition(LINES);
  removeColumn(state, state.columns[2]?.id ?? 0);
  const draft = toTableDraft(state);
  assert.deepEqual(draft.primaryKeyColumnNames, ["shipment_id", "order_id"]);
  assert.deepEqual([draft.foreignKeys[1]?.columnNames, draft.foreignKeys[1]?.targetColumnNames], [["order_id"], ["order_id"]]);
  assert.deepEqual(draft.indexes[0]?.parts, []);
});

test("an added column is new to the table", () => {
  const state = createStateFromDefinition(LINES);
  const column = addColumn(state);
  assert.equal(toTableDraft(state).columns.find((candidate) => candidate.name === column.name)?.sourceName, null);
});

test("a one-column reference shows in its column, a composite one in a column of its own after its last", () => {
  const columns = selectGridColumns(LINES).map((column) => (column.kind === "value" ? `${column.column.name}${column.reference === null ? "" : "→"}` : `[${column.foreignKey.targetTableName}]`));
  assert.deepEqual(columns, ["shipment_id→", "order_id", "line_no", "[order_lines]", "quantity"]);
});
