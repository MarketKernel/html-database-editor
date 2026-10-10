// SettingsStore over localStorage, one JSON object; each field checked as read, a bad one replaced by its default.

import type { ConnectionParameters } from "@db-manager/connector";
import type { ColorScheme } from "@db-manager/editor";
import type { EditorSettings } from "@db-manager/editor";
import type { PageRowCount } from "@db-manager/editor";
import type { RememberedConnection } from "@db-manager/editor";
import type { SettingsStore } from "@db-manager/editor";
import type { SettingsStoreFactory } from "@db-manager/editor";

import { PAGE_ROW_COUNTS, SETTINGS_KEY } from "../protocol.js";

const COLOR_SCHEMES: readonly ColorScheme[] = ["system", "light", "dark"];
const MIN_TABLE_LIST_WIDTH_PX = 160;
const MAX_TABLE_LIST_WIDTH_PX = 640;
const MIN_GRID_SHARE = 0.2;
const MAX_GRID_SHARE = 0.8;

export const DEFAULT_SETTINGS: EditorSettings = {
  colorScheme: "system",
  pageRowCount: 50,
  tableListWidthPx: 260,
  gridShare: 0.55,
  lastConnection: null,
  titleColumns: {},
};

export const buildLocalSettingsStore: SettingsStoreFactory = (storage) => new LocalSettingsStore(storage);

class LocalSettingsStore implements SettingsStore {
  private settings: EditorSettings;

  constructor(private readonly storage: Storage | null) {
    this.settings = readSettings(storage);
  }

  load(): EditorSettings {
    return this.settings;
  }

  save(change: Partial<EditorSettings>): EditorSettings {
    this.settings = { ...this.settings, ...change };
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // A full or refused storage keeps the settings for this visit: they are conveniences, not data.
    }
    return this.settings;
  }
}

const readSettings = (storage: Storage | null): EditorSettings => {
  let stored: unknown = null;
  try {
    stored = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? "null");
  } catch {
    // Unreadable settings are replaced by the defaults.
    stored = null;
  }
  const record = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  return {
    colorScheme: COLOR_SCHEMES.find((scheme) => scheme === record["colorScheme"]) ?? DEFAULT_SETTINGS.colorScheme,
    pageRowCount: PAGE_ROW_COUNTS.find((count) => count === record["pageRowCount"]) ?? DEFAULT_SETTINGS.pageRowCount,
    tableListWidthPx: readNumber(record["tableListWidthPx"], MIN_TABLE_LIST_WIDTH_PX, MAX_TABLE_LIST_WIDTH_PX, DEFAULT_SETTINGS.tableListWidthPx),
    gridShare: readNumber(record["gridShare"], MIN_GRID_SHARE, MAX_GRID_SHARE, DEFAULT_SETTINGS.gridShare),
    lastConnection: readConnection(record["lastConnection"]),
    titleColumns: readStringRecord(record["titleColumns"]),
  };
};

const readNumber = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;

const readConnection = (value: unknown): RememberedConnection | null => {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record["pluginId"] !== "string") return null;
  return { pluginId: record["pluginId"], parameters: readStringRecord(record["parameters"]) as ConnectionParameters };
};

const readStringRecord = (value: unknown): Readonly<Record<string, string>> => {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
};

export const isPageRowCount = (value: number): value is PageRowCount => PAGE_ROW_COUNTS.some((count) => count === value);
