import type { ConnectionParameters } from "./models/simpleTypes/plugin/connectionParameters.js";
import type { DatabaseConnection } from "./databaseConnection.js";
import type { DatabaseStorage } from "./databaseStorage.js";
import type { PluginDescriptor } from "./models/plugin/pluginDescriptor.js";

/**
 * One DBMS for the editor. Everything particular to the DBMS — its dialect, its engine, its storage, the browsers it runs in —
 * is the plugin's: what it cannot do it refuses with "not-supported" and a message for the user; the editor never works around it.
 */
export interface ConnectorPlugin {
  /** What the editor draws the plugin's screens from. */
  readonly descriptor: PluginDescriptor;
  /** The databases the plugin keeps itself; a plugin that keeps none refuses every call "not-supported". */
  readonly storage: DatabaseStorage;

  /**
   * Opens a connection to one database, by the values of the descriptor's connection fields.
   * Called from a click, it may ask the user's leave for a linked file; called otherwise, such a file is refused "access-required".
   * Refuses ConnectionError: "not-supported", "invalid-parameters", "database-not-found", "database-busy", "not-a-database", "access-required", "storage-refused".
   */
  connect(parameters: ConnectionParameters): Promise<DatabaseConnection>;
}

/** A plugin brings everything it needs; the host hands it nothing. */
export type ConnectorPluginFactory = () => ConnectorPlugin;
