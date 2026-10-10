import assert from "node:assert/strict";
import { test } from "node:test";

import { openTestPlugin, refusalKind } from "./testPlugin.js";

test("a database created from the demo template is listed and opens", async () => {
  const plugin = await openTestPlugin();
  await plugin.storage.createDatabase("shop", "demo");
  await plugin.storage.createDatabase("empty", null);
  assert.deepEqual((await plugin.storage.selectDatabases()).map((entry) => entry.name), ["empty", "shop"]);
  const connection = await plugin.connect({ database: "shop" });
  assert.ok((await connection.schemaService.selectTables()).some((table) => table.name === "order_lines"));
  await connection.close();
});

test("a taken or malformed name is refused", async () => {
  const plugin = await openTestPlugin();
  await plugin.storage.createDatabase("shop", null);
  assert.equal(await refusalKind(plugin.storage.createDatabase("shop", null)), "name-taken");
  assert.equal(await refusalKind(plugin.storage.createDatabase("a/b", null)), "invalid-name");
  assert.equal(await refusalKind(plugin.storage.createDatabase("x", "no-such-template")), "not-supported");
});

test("bytes that are not SQLite are refused on import, a database exported imports again", async () => {
  const plugin = await openTestPlugin();
  assert.equal(await refusalKind(plugin.storage.importDatabase("junk", new TextEncoder().encode("hello"))), "not-a-database");
  await plugin.storage.createDatabase("shop", "demo");
  const bytes = await plugin.storage.exportDatabase("shop");
  await plugin.storage.importDatabase("copy", bytes);
  const connection = await plugin.connect({ database: "copy" });
  const page = await connection.rowService.getRowPage("regions", { offset: 0, rowCount: 100, sortings: [], conditions: [] });
  assert.equal(page.totalCount, 8);
});

test("an open database is neither renamed nor deleted, a closed one is", async () => {
  const plugin = await openTestPlugin();
  await plugin.storage.createDatabase("shop", null);
  const connection = await plugin.connect({ database: "shop" });
  assert.equal(await refusalKind(plugin.storage.deleteDatabase("shop")), "database-busy");
  await connection.close();
  await plugin.storage.renameDatabase("shop", "store");
  assert.deepEqual((await plugin.storage.selectDatabases()).map((entry) => entry.name), ["store"]);
  await plugin.storage.deleteDatabase("store");
  assert.deepEqual(await plugin.storage.selectDatabases(), []);
});

test("connecting to a database that is not there is refused", async () => {
  const plugin = await openTestPlugin();
  assert.equal(await refusalKind(plugin.connect({ database: "nowhere" })), "database-not-found");
  assert.equal(await refusalKind(plugin.connect({})), "invalid-parameters");
});
