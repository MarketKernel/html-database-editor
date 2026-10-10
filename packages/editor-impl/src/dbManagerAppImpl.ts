// DbManagerApp: the page's parts built once, the start screen, then a database screen per open connection.
// The connection opened last is opened again at the start; a refusal is shown on the start screen and forgotten.

import type { ConnectionParameters } from "@db-manager/connector";
import type { ConnectorPlugin } from "@db-manager/connector";
import type { DatabaseConnection } from "@db-manager/connector";
import type { ClipboardService } from "@db-manager/editor";
import type { ContextMenu } from "@db-manager/editor";
import type { DbManagerApp } from "@db-manager/editor";
import type { DbManagerAppDeps } from "@db-manager/editor";
import type { DbManagerAppFactory } from "@db-manager/editor";
import type { DialogService } from "@db-manager/editor";
import type { FileService } from "@db-manager/editor";
import type { Notifier } from "@db-manager/editor";
import type { SettingsStore } from "@db-manager/editor";
import type { StartScreen } from "@db-manager/editor";

import { installEditorStyles } from "./editorStyles.js";
import { buildBrowserFileService } from "./page/browserFileService.js";
import { buildFloatingContextMenu } from "./page/floatingContextMenu.js";
import { buildModalDialogService } from "./page/modalDialogService.js";
import { buildNavigatorClipboardService } from "./page/navigatorClipboardService.js";
import { buildToastNotifier } from "./page/toastNotifier.js";
import { buildPageDatabaseScreen } from "./pageDatabaseScreen.js";
import { buildPageStartScreen } from "./pageStartScreen.js";
import { buildLocalSettingsStore } from "./settings/localSettingsStore.js";
import { applyColorScheme, watchSystemScheme } from "./utils/colorScheme.js";
import { describeFailure, isRefusal } from "./utils/refusal.js";

/** The refusals of the last connection that mean it cannot be opened again. */
const FORGETTING_KINDS: ReadonlySet<string> = new Set(["database-not-found", "not-a-database", "invalid-parameters"]);

export const buildDbManagerApp: DbManagerAppFactory = (document, deps) => new DbManagerAppImpl(document, deps);

class DbManagerAppImpl implements DbManagerApp {
  private readonly settingsStore: SettingsStore;
  private readonly notifier: Notifier;
  private readonly dialogService: DialogService;
  private readonly contextMenu: ContextMenu;
  private readonly clipboardService: ClipboardService;
  private readonly fileService: FileService;
  private container: HTMLElement | null = null;
  private connection: DatabaseConnection | null = null;
  private startScreen: StartScreen | null = null;

  constructor(
    private readonly document: Document,
    private readonly deps: DbManagerAppDeps,
  ) {
    this.settingsStore = buildLocalSettingsStore(deps.storage);
    this.notifier = buildToastNotifier(document);
    this.dialogService = buildModalDialogService(document);
    this.contextMenu = buildFloatingContextMenu(document);
    this.clipboardService = buildNavigatorClipboardService(document.defaultView?.navigator ?? navigator);
    this.fileService = buildBrowserFileService(document);
  }

  mount(container: HTMLElement): void {
    if (this.container !== null) throw new Error("DbManagerApp is mounted once");
    this.container = container;
    installEditorStyles(this.document);
    applyColorScheme(this.document, this.settingsStore.load().colorScheme);
    watchSystemScheme(this.document, () => applyColorScheme(this.document, this.settingsStore.load().colorScheme));
    void this.start();
  }

  private async start(): Promise<void> {
    const remembered = this.settingsStore.load().lastConnection;
    const plugin = this.deps.plugins.find((candidate) => candidate.descriptor.id === remembered?.pluginId);
    if (remembered !== null && plugin !== undefined) {
      try {
        await this.openConnection(plugin, remembered.parameters);
        return;
      } catch (error) {
        // Forgotten only when the database is gone: one held by another tab, or waiting for the user's leave, is opened next time.
        if (isRefusal(error) && FORGETTING_KINDS.has(error.kind)) this.settingsStore.save({ lastConnection: null });
        await this.showStartScreen();
        this.startScreen?.showConnectionRefusal(describeFailure(error, console));
        return;
      }
    }
    await this.showStartScreen();
  }

  private async showStartScreen(): Promise<void> {
    const startScreen = buildPageStartScreen(
      this.document,
      {
        plugins: this.deps.plugins,
        settingsStore: this.settingsStore,
        fileService: this.fileService,
        dialogService: this.dialogService,
        contextMenu: this.contextMenu,
        notifier: this.notifier,
        version: this.deps.version,
      },
      { openConnection: (plugin, parameters) => this.openConnection(plugin, parameters) },
    );
    this.startScreen = startScreen;
    const app = this.document.createElement("div");
    app.className = "dm-app";
    app.append(startScreen.element);
    this.container?.replaceChildren(app);
    this.document.title = "db-manager";
    await startScreen.refresh();
  }

  /** Rejects with the plugin's ConnectionError, the start screen left as it is. */
  private async openConnection(plugin: ConnectorPlugin, parameters: ConnectionParameters): Promise<void> {
    const connection = await plugin.connect(parameters);
    this.connection = connection;
    const passwordFields = plugin.descriptor.connectionFields.filter((field) => field.kind === "password").map((field) => field.name);
    const remembered = Object.fromEntries(Object.entries(parameters).filter(([name]) => !passwordFields.includes(name)));
    this.settingsStore.save({ lastConnection: { pluginId: plugin.descriptor.id, parameters: remembered } });
    const screen = buildPageDatabaseScreen(
      this.document,
      {
        connection,
        descriptor: plugin.descriptor,
        settingsStore: this.settingsStore,
        dialogService: this.dialogService,
        contextMenu: this.contextMenu,
        notifier: this.notifier,
        clipboardService: this.clipboardService,
        fileService: this.fileService,
        version: this.deps.version,
      },
      { closeDatabase: () => void this.closeDatabase() },
    );
    this.startScreen = null;
    this.container?.replaceChildren(screen.element);
    this.document.title = `${connection.caption} — db-manager`;
    await screen.load();
  }

  private async closeDatabase(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    this.settingsStore.save({ lastConnection: null });
    try {
      await connection?.close();
    } catch (error) {
      this.notifier.showError(describeFailure(error, console));
    }
    await this.showStartScreen();
  }
}
