// Where every contract meets its implementation: the only file of the host that imports an `-impl` package.
// A plugin joins db-manager here, one line in buildConnectorPlugins; the arch test fails if an `-impl` is imported anywhere else.

import type { ConnectorPlugin } from "@db-manager/connector";
import type { DbManagerApp } from "@db-manager/editor";
import type { DbManagerAppDeps } from "@db-manager/editor";
import { buildDbManagerApp as buildPageDbManagerApp } from "@db-manager/editor-impl";
import { buildSqlitePlugin } from "@db-manager/sqlite-connector-impl";

/** Every connector plugin of this build, in the order the start screen offers them. */
export const buildConnectorPlugins = (): readonly ConnectorPlugin[] => [buildSqlitePlugin()];

export const buildDbManagerApp = (document: Document, deps: DbManagerAppDeps): DbManagerApp => buildPageDbManagerApp(document, deps);
