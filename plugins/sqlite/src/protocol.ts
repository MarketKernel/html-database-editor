// The names the plugin and the editor's screens spell alike: the connection field, the table options, the templates.

/** The one connection field: a database of the plugin's storage. */
export const DATABASE_PARAMETER = "database";

/** The keys of TableOptions this plugin offers. */
export const OPTION_WITHOUT_ROWID = "withoutRowId";
export const OPTION_STRICT = "strict";
export const OPTION_AUTOINCREMENT = "autoincrement";

export const DEMO_TEMPLATE_ID = "demo";

/** The prefix of the names SQLite keeps for itself: never listed, never taken. */
export const INTERNAL_NAME_PREFIX = "sqlite_";
/** The names the plugin gives the table it builds during a rebuild. */
export const REBUILD_TABLE_PREFIX = "__db_manager_rebuild_";
