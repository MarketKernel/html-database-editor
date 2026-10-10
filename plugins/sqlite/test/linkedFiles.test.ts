import assert from "node:assert/strict";
import { test } from "node:test";

import { createDatabaseBytes, MemoryFileHandle, openTestPluginWithFiles, refusalKind } from "./testPlugin.js";

const FIRST_PAGE = { offset: 0, rowCount: 100, sortings: [], conditions: [] };
/** The header's file format bytes: 2 is WAL. */
const WRITE_VERSION_OFFSET = 18;
const READ_VERSION_OFFSET = 19;
const WAL_FORMAT = 2;

test("a file of the user's is opened in place, and every change is written back to it", async () => {
  const { plugin, fileAccess } = await openTestPluginWithFiles();
  const file = new MemoryFileHandle("notes.sqlite", await createDatabaseBytes("CREATE TABLE note (id INTEGER PRIMARY KEY, text TEXT); INSERT INTO note VALUES (1, 'first');"));
  fileAccess.openQueue.push(file);
  const entry = await plugin.storage.openFile();
  assert.deepEqual([entry?.name, entry?.kind, entry?.locationCaption], ["notes", "linked-file", "notes.sqlite on the disk"]);
  const connection = await plugin.connect({ database: "notes" });
  await connection.rowService.createRows("note", [{ values: { text: "second" } }]);
  await connection.close();
  fileAccess.openQueue.push(new MemoryFileHandle("copy.sqlite", file.bytes));
  await plugin.storage.openFile();
  const copy = await plugin.connect({ database: "copy" });
  assert.equal((await copy.rowService.getRowPage("note", FIRST_PAGE)).totalCount, 2);
});

test("a new file is created from a template where the user saves it", async () => {
  const { plugin, fileAccess } = await openTestPluginWithFiles();
  const file = new MemoryFileHandle("shop.sqlite", new Uint8Array(0));
  fileAccess.saveQueue.push(file);
  const entry = await plugin.storage.createFile("demo");
  assert.equal(entry?.kind, "linked-file");
  assert.ok(file.bytes.byteLength > 0);
  const connection = await plugin.connect({ database: "shop" });
  assert.equal((await connection.rowService.getRowPage("regions", FIRST_PAGE)).totalCount, 8);
});

test("a cancelled picker opens nothing, a file that is not SQLite is refused", async () => {
  const { plugin, fileAccess } = await openTestPluginWithFiles();
  assert.equal(await plugin.storage.openFile(), null);
  fileAccess.openQueue.push(new MemoryFileHandle("photo.jpg", new TextEncoder().encode("not a database")));
  assert.equal(await refusalKind(plugin.storage.openFile()), "not-a-database");
  assert.deepEqual(await plugin.storage.selectDatabases(), []);
});

test("a file the user has not let the page write is refused until they do", async () => {
  const { plugin, fileAccess } = await openTestPluginWithFiles();
  const file = new MemoryFileHandle("locked.sqlite", await createDatabaseBytes("CREATE TABLE t (a);"));
  fileAccess.openQueue.push(file);
  await plugin.storage.openFile();
  file.permission = "prompt";
  assert.equal(await refusalKind(plugin.connect({ database: "locked" })), "access-required");
  file.permission = "granted";
  await (await plugin.connect({ database: "locked" })).close();
});

test("two files of one name are listed apart; forgetting one leaves the file, renaming it is refused", async () => {
  const { plugin, fileAccess } = await openTestPluginWithFiles();
  const bytes = await createDatabaseBytes("CREATE TABLE t (a);");
  const file = new MemoryFileHandle("data.db", bytes);
  fileAccess.openQueue.push(file, new MemoryFileHandle("data.db", bytes));
  await plugin.storage.openFile();
  await plugin.storage.openFile();
  await plugin.storage.createDatabase("kept", null);
  assert.deepEqual((await plugin.storage.selectDatabases()).map((entry) => `${entry.name}:${entry.kind}`), ["data:linked-file", "data (2):linked-file", "kept:stored"]);
  assert.equal(await refusalKind(plugin.storage.renameDatabase("data", "other")), "not-supported");
  await plugin.storage.deleteDatabase("data");
  assert.equal(file.bytes, bytes);
  assert.deepEqual((await plugin.storage.selectDatabases()).map((entry) => entry.name), ["data (2)", "kept"]);
});

test("a stored database is changed in memory and kept after it is closed", async () => {
  const { plugin } = await openTestPluginWithFiles();
  await plugin.storage.createDatabase("shop", "demo");
  const connection = await plugin.connect({ database: "shop" });
  assert.equal(await refusalKind(plugin.connect({ database: "shop" })), "database-busy");
  await connection.rowService.createRows("regions", [{ values: { country_code: "PL", region_code: "MZ", name: "Masovia" } }]);
  await connection.close();
  const again = await plugin.connect({ database: "shop" });
  assert.equal((await again.rowService.getRowPage("regions", FIRST_PAGE)).totalCount, 9);
});

/** A table of rows large enough that the file spans many chunks of the VFS. */
const BULKY_SCRIPT =
  "PRAGMA page_size = 4096; CREATE TABLE item (id INTEGER PRIMARY KEY, body TEXT);" +
  "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 4000) INSERT INTO item SELECT i, printf('%.500c', 'x') FROM n;";

test("a linked file is read slice by slice and never whole", async () => {
  const { plugin, fileAccess } = await openTestPluginWithFiles();
  const file = new MemoryFileHandle("bulky.sqlite", await createDatabaseBytes(BULKY_SCRIPT));
  fileAccess.openQueue.push(file);
  await plugin.storage.openFile();
  const connection = await plugin.connect({ database: "bulky" });
  assert.equal((await connection.rowService.getRowPage("item", FIRST_PAGE)).totalCount, 4000);
  assert.ok(file.largestReadBytes < file.bytes.byteLength / 4, `read ${file.largestReadBytes} of ${file.bytes.byteLength} bytes at once`);
});

test("a change writes only the chunks it touched, and changes in a row each reach the file", async () => {
  const { plugin, fileAccess } = await openTestPluginWithFiles();
  const file = new MemoryFileHandle("bulky.sqlite", await createDatabaseBytes(BULKY_SCRIPT));
  fileAccess.openQueue.push(file);
  await plugin.storage.openFile();
  const connection = await plugin.connect({ database: "bulky" });
  await connection.rowService.createRows("item", [{ values: { body: "first" } }]);
  await connection.rowService.createRows("item", [{ values: { body: "second" } }]);
  assert.equal(file.writeCount, 2);
  assert.ok(file.writtenBytes < file.bytes.byteLength / 4, `wrote ${file.writtenBytes} of ${file.bytes.byteLength} bytes`);
  assert.equal((await connection.rowService.getRowPage("item", FIRST_PAGE)).totalCount, 4002);
  await connection.close();
  fileAccess.openQueue.push(new MemoryFileHandle("copy.sqlite", file.bytes));
  await plugin.storage.openFile();
  const copy = await plugin.connect({ database: "copy" });
  assert.equal((await copy.rowService.getRowPage("item", FIRST_PAGE)).totalCount, 4002);
});

test("a file shrunk by a change is cut to its new size", async () => {
  const { plugin, fileAccess } = await openTestPluginWithFiles();
  // auto_vacuum gives the freed pages back: the file shrinks.
  const file = new MemoryFileHandle("bulky.sqlite", await createDatabaseBytes(`PRAGMA auto_vacuum = FULL; ${BULKY_SCRIPT}`));
  const originalBytes = file.bytes.byteLength;
  fileAccess.openQueue.push(file);
  await plugin.storage.openFile();
  const connection = await plugin.connect({ database: "bulky" });
  await connection.schemaService.dropTable("item");
  await connection.close();
  assert.ok(file.bytes.byteLength < originalBytes, `${file.bytes.byteLength} of ${originalBytes} bytes`);
});

test("a file left in WAL mode by another program opens and is written as a rollback journal's", async () => {
  const { plugin, fileAccess } = await openTestPluginWithFiles();
  const bytes = await createDatabaseBytes("CREATE TABLE t (a); INSERT INTO t VALUES (1);");
  bytes[WRITE_VERSION_OFFSET] = WAL_FORMAT;
  bytes[READ_VERSION_OFFSET] = WAL_FORMAT;
  const file = new MemoryFileHandle("wal.sqlite", bytes);
  fileAccess.openQueue.push(file);
  await plugin.storage.openFile();
  const connection = await plugin.connect({ database: "wal" });
  await connection.rowService.createRows("t", [{ values: { a: 2n } }]);
  assert.equal((await connection.rowService.getRowPage("t", FIRST_PAGE)).totalCount, 2);
  assert.deepEqual([file.bytes[WRITE_VERSION_OFFSET], file.bytes[READ_VERSION_OFFSET]], [1, 1]);
});
