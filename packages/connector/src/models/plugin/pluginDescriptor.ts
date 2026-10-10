import type { ColumnTypeSuggestion } from "./columnTypeSuggestion.js";
import type { ConnectionField } from "./connectionField.js";
import type { DatabaseTemplate } from "./databaseTemplate.js";
import type { PluginId } from "../simpleTypes/plugin/pluginId.js";
import type { TableOptionDescriptor } from "./tableOptionDescriptor.js";

/** What the editor needs to draw a plugin's screens, as data: the plugin's own problems stay inside it. */
export interface PluginDescriptor {
  readonly id: PluginId;
  /** "SQLite": the DBMS as the user knows it. */
  readonly caption: string;
  /** One line on where the databases are kept: "SQLite files in this browser's private storage". */
  readonly description: string;
  /** What connect() asks for, in the order shown. */
  readonly connectionFields: readonly ConnectionField[];
  /** The databases createDatabase can start from; empty: an empty database only. */
  readonly databaseTemplates: readonly DatabaseTemplate[];
  /** The column types to offer in the table designer, in the order shown. */
  readonly columnTypes: readonly ColumnTypeSuggestion[];
  /** Whether a column type outside columnTypes is accepted as typed. */
  readonly acceptsCustomColumnTypes: boolean;
  /** The options a table may have beyond its columns and constraints. */
  readonly tableOptions: readonly TableOptionDescriptor[];
}
