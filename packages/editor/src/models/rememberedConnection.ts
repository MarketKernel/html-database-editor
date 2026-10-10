import type { ConnectionParameters } from "@db-manager/connector";
import type { PluginId } from "@db-manager/connector";

/** A connection the editor opens again on its next start: the plugin and the parameters but the passwords. */
export interface RememberedConnection {
  readonly pluginId: PluginId;
  readonly parameters: ConnectionParameters;
}
