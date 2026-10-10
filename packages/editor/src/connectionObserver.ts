import type { ConnectionParameters } from "@db-manager/connector";
import type { ConnectorPlugin } from "@db-manager/connector";

/** Told by the start screen when the user opens a database. */
export interface ConnectionObserver {
  /** The app connects and shows the database screen; a refused connection rejects with the plugin's ConnectionError. */
  openConnection(plugin: ConnectorPlugin, parameters: ConnectionParameters): Promise<void>;
}
