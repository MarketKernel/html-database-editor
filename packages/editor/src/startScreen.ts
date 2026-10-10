import type { ConnectorPlugin } from "@db-manager/connector";

import type { ConnectionObserver } from "./connectionObserver.js";
import type { ContextMenu } from "./contextMenu.js";
import type { DialogService } from "./dialogService.js";
import type { FileService } from "./fileService.js";
import type { Notifier } from "./notifier.js";
import type { SettingsStore } from "./settingsStore.js";

/**
 * The first screen: a plugin, then a database of its storage, created, imported, exported, renamed or deleted here,
 * or the plugin's connection fields; "Open" tells the ConnectionObserver.
 */
export interface StartScreen {
  readonly element: HTMLElement;
  /** Reads the chosen plugin's databases afresh; a refusal, the plugin's message, is shown in their place. */
  refresh(): Promise<void>;
  /** Shows why an open failed, under the plugin's form. */
  showConnectionRefusal(message: string): void;
}

export interface StartScreenDeps {
  readonly plugins: readonly ConnectorPlugin[];
  readonly settingsStore: SettingsStore;
  readonly fileService: FileService;
  readonly dialogService: DialogService;
  readonly contextMenu: ContextMenu;
  readonly notifier: Notifier;
  readonly version: string;
}

export type StartScreenFactory = (document: Document, deps: StartScreenDeps, observer: ConnectionObserver) => StartScreen;
