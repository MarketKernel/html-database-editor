import assert from "node:assert/strict";
import { test } from "node:test";

import { buildLocalSettingsStore } from "../src/settings/localSettingsStore.js";

/** A Storage keeping its items in a map; refusing writes when asked to. */
class MapStorage implements Storage {
  private readonly items = new Map<string, string>();

  constructor(private readonly isFull = false) {}

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.isFull) throw new DOMException("full", "QuotaExceededError");
    this.items.set(key, value);
  }
}

test("settings saved are read back by the next visit", () => {
  const storage = new MapStorage();
  buildLocalSettingsStore(storage).save({ colorScheme: "dark", pageRowCount: 100, lastConnection: { pluginId: "sqlite", parameters: { database: "shop" } } });
  const settings = buildLocalSettingsStore(storage).load();
  assert.equal(settings.colorScheme, "dark");
  assert.equal(settings.pageRowCount, 100);
  assert.deepEqual(settings.lastConnection, { pluginId: "sqlite", parameters: { database: "shop" } });
});

test("a broken or unknown field is replaced by its default, the rest kept", () => {
  const storage = new MapStorage();
  storage.setItem("db-manager.settings", JSON.stringify({ colorScheme: "purple", pageRowCount: 7, gridShare: 0.5, titleColumns: { "sqlite/shop/orders": "note", bad: 1 } }));
  const settings = buildLocalSettingsStore(storage).load();
  assert.equal(settings.colorScheme, "system");
  assert.equal(settings.pageRowCount, 50);
  assert.equal(settings.gridShare, 0.5);
  assert.deepEqual(settings.titleColumns, { "sqlite/shop/orders": "note" });
});

test("unreadable settings and a refusing storage leave the defaults working", () => {
  const storage = new MapStorage();
  storage.setItem("db-manager.settings", "{not json");
  assert.equal(buildLocalSettingsStore(storage).load().colorScheme, "system");
  const store = buildLocalSettingsStore(new MapStorage(true));
  assert.equal(store.save({ colorScheme: "light" }).colorScheme, "light");
  assert.equal(buildLocalSettingsStore(null).load().pageRowCount, 50);
});
