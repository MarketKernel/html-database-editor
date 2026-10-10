// What the editor draws the SQLite plugin's screens from.

import type { PluginDescriptor } from "@db-manager/connector";

import { DATABASE_PARAMETER, DEMO_TEMPLATE_ID, OPTION_AUTOINCREMENT, OPTION_STRICT, OPTION_WITHOUT_ROWID } from "./protocol.js";

export const SQLITE_DESCRIPTOR: PluginDescriptor = {
  id: "sqlite",
  caption: "SQLite",
  description: "SQLite databases kept in this browser, or SQLite files of yours opened in place. Chrome.",
  connectionFields: [{ name: DATABASE_PARAMETER, caption: "Database", kind: "stored-database" }],
  databaseTemplates: [{ id: DEMO_TEMPLATE_ID, caption: "Demo shop: composite keys, a self-reference, a view" }],
  columnTypes: [
    { type: "INTEGER", valueKind: "integer" },
    { type: "TEXT", valueKind: "text" },
    { type: "REAL", valueKind: "real" },
    { type: "NUMERIC", valueKind: "numeric" },
    { type: "BLOB", valueKind: "blob" },
    { type: "BOOLEAN", valueKind: "boolean" },
    { type: "DATE", valueKind: "date" },
    { type: "DATETIME", valueKind: "datetime" },
    { type: "VARCHAR(255)", valueKind: "text" },
    { type: "DECIMAL(10, 2)", valueKind: "numeric" },
    { type: "ANY", valueKind: "any" },
  ],
  acceptsCustomColumnTypes: true,
  tableOptions: [
    { key: OPTION_WITHOUT_ROWID, caption: "WITHOUT ROWID", description: "Rows are kept in the order of the primary key, with no row id apart" },
    { key: OPTION_STRICT, caption: "STRICT", description: "Every value must be of its column's type: INT, INTEGER, REAL, TEXT, BLOB or ANY" },
    { key: OPTION_AUTOINCREMENT, caption: "AUTOINCREMENT", description: "The ids of deleted rows are never given again; a one-column INTEGER primary key only" },
  ],
};
