// ConnectorPlugin of SQLite: the engine in a worker started from the bundled script, the databases in OPFS.
// It runs in Chrome, over http(s): Chrome gives a page opened from the disk no private file system.

import type { ConnectionParameters } from "@db-manager/connector";
import type { ConnectorPlugin } from "@db-manager/connector";
import type { ConnectorPluginFactory } from "@db-manager/connector";
import type { DatabaseConnection } from "@db-manager/connector";
import type { DatabaseStorage } from "@db-manager/connector";
import type { PluginDescriptor } from "@db-manager/connector";

import type { EngineClient } from "./engine/engineClient.js";
import { buildStatementRunner } from "./engine/statementRunner.js";
import { buildWorkerEngineClient } from "./engine/workerEngineClient.js";
import { WORKER_SOURCE } from "./engine/workerSource.js";
import { buildBrowserFileAccess } from "./fileAccess.js";
import type { FileAccess } from "./fileAccess.js";
import { connectionError, connectionRefusal } from "./errors.js";
import { DATABASE_PARAMETER } from "./protocol.js";
import { buildSchemaCache } from "./schema/schemaCache.js";
import { SQLITE_DESCRIPTOR } from "./sqliteDescriptor.js";
import { buildSqliteRowService } from "./sqliteRowService.js";
import { buildSqliteSchemaService } from "./sqliteSchemaService.js";
import { buildSqliteStorage } from "./sqliteStorage.js";

const NO_ENGINE_REASON = "This build of db-manager carries no SQLite engine.";
const NO_WORKER_REASON = "This browser runs no workers here; SQLite needs one. Use Chrome.";

export const buildSqlitePlugin: ConnectorPluginFactory = () => {
  const unavailableReason = findUnavailableReason();
  const engine = unavailableReason === null && WORKER_SOURCE !== null ? buildWorkerEngineClient(WORKER_SOURCE) : null;
  return createSqlitePlugin(engine, buildBrowserFileAccess(window, window.indexedDB), unavailableReason ?? NO_ENGINE_REASON);
};

/** engine: null where the plugin cannot run, every call refused "not-supported" with unavailableReason. The tests hand an engine in-process. */
export const createSqlitePlugin = (engine: EngineClient | null, fileAccess: FileAccess, unavailableReason: string): ConnectorPlugin =>
  new SqlitePlugin(engine, fileAccess, unavailableReason);

class SqlitePlugin implements ConnectorPlugin {

  readonly descriptor: PluginDescriptor = SQLITE_DESCRIPTOR;
  readonly storage: DatabaseStorage;

  constructor(
    private readonly engine: EngineClient | null,
    private readonly fileAccess: FileAccess,
    private readonly unavailableReason: string,
  ) {
    this.storage = buildSqliteStorage(engine, fileAccess, unavailableReason);
  }

  async connect(parameters: ConnectionParameters): Promise<DatabaseConnection> {
    if (this.engine === null) throw connectionError("not-supported", this.unavailableReason);
    const name = parameters[DATABASE_PARAMETER]?.trim() ?? "";
    if (name === "") throw connectionError("invalid-parameters", "Choose a database");
    await this.obtainFileAccess(name);
    let connectionId: number;
    try {
      connectionId = await this.engine.send({ op: "open-database", name });
    } catch (error) {
      throw connectionRefusal(error);
    }
    const runner = buildStatementRunner(this.engine, connectionId);
    const cache = buildSchemaCache(runner);
    let isClosed = false;
    return {
      caption: name,
      schemaService: buildSqliteSchemaService(runner, cache),
      rowService: buildSqliteRowService(runner, cache),
      close: async () => {
        if (isClosed) return;
        isClosed = true;
        await runner.close();
      },
    };
  }

  /** A linked file needs the user's leave to be written; asked here, from the click that opens it. */
  private async obtainFileAccess(name: string): Promise<void> {
    const handle = await this.fileAccess.findLinkedFile(name);
    if (handle === null || (await this.fileAccess.obtainWriteAccess(handle, true))) return;
    throw connectionError("access-required", `Chrome needs your leave to open "${handle.name}": click it in the list and allow editing`);
  }
}

/** null: the page can run the plugin. A page opened from the disk can: its databases go to IndexedDB, OPFS being refused there. */
const findUnavailableReason = (): string | null => {
  if (typeof globalThis.Worker === "undefined") return NO_WORKER_REASON;
  return null;
};
