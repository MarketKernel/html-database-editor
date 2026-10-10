import type { ConnectorPlugin } from "@db-manager/connector";

/**
 * db-manager's page: the start screen, where a plugin's database is chosen, then the database screen until it is closed.
 * The connection opened last is opened again at the start; a refusal is shown on the start screen.
 */
export interface DbManagerApp {
  /** Renders into the container, replacing what is there. Once per app: a second call throws. */
  mount(container: HTMLElement): void;
}

export interface DbManagerAppDeps {
  /** In the order the start screen offers them; one at least. */
  readonly plugins: readonly ConnectorPlugin[];
  /** Where the settings are kept between visits: the page's localStorage; null where the browser refuses it. */
  readonly storage: Storage | null;
  /** The version the editor shows, "0.1.0". */
  readonly version: string;
}

/** The app assembles its parts itself; the host hands it the page and the plugins. */
export type DbManagerAppFactory = (document: Document, deps: DbManagerAppDeps) => DbManagerApp;
