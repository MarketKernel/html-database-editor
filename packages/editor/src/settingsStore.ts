import type { EditorSettings } from "./models/editorSettings.js";

/** The editor's settings in the page's storage as one JSON object; every field checked as read, a bad one replaced by its default. */
export interface SettingsStore {
  load(): EditorSettings;
  /** Merges the change and saves; a storage that refuses keeps the settings for this visit only. */
  save(change: Partial<EditorSettings>): EditorSettings;
}

/** storage: null keeps the settings in memory only. */
export type SettingsStoreFactory = (storage: Storage | null) => SettingsStore;
