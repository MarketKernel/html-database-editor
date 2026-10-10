// DatabaseStorage over the engine's database files: the stored ones in OPFS (IndexedDB on a page opened from the disk),
// and the user's own files, picked here and opened in place by the worker.

import type { DatabaseEntry } from "@db-manager/connector";
import type { DatabaseName } from "@db-manager/connector";
import type { DatabaseStorage } from "@db-manager/connector";

import { DEMO_DATABASE_SCRIPT } from "./demoDatabase.js";
import type { EngineClient } from "./engine/engineClient.js";
import { storageError, storageRefusal } from "./errors.js";
import type { FileAccess } from "./fileAccess.js";
import { DEMO_TEMPLATE_ID } from "./protocol.js";

const NEW_FILE_NAME = "database.sqlite";
const NO_PICKERS_REASON = "This browser offers no file pickers to a page; use Chrome";

/** engine: null where the plugin cannot run here, unavailableReason saying why. */
export const buildSqliteStorage = (engine: EngineClient | null, fileAccess: FileAccess, unavailableReason: string): DatabaseStorage =>
  new SqliteStorage(engine, fileAccess, unavailableReason);

class SqliteStorage implements DatabaseStorage {
  constructor(
    private readonly engine: EngineClient | null,
    private readonly fileAccess: FileAccess,
    private readonly unavailableReason: string,
  ) {}

  selectDatabases(): Promise<readonly DatabaseEntry[]> {
    return this.guard((engine) => engine.send({ op: "select-databases" }));
  }

  createDatabase(name: DatabaseName, templateId: string | null): Promise<DatabaseEntry> {
    const script = this.findScript(templateId);
    if (script === undefined) return Promise.reject(storageError("not-supported", `There is no template "${templateId}"`));
    return this.guard((engine) => engine.send({ op: "create-database", name, script }));
  }

  importDatabase(name: DatabaseName, bytes: Uint8Array): Promise<DatabaseEntry> {
    return this.guard((engine) => engine.send({ op: "import-database", name, bytes }));
  }

  exportDatabase(name: DatabaseName): Promise<Uint8Array> {
    return this.guard((engine) => engine.send({ op: "export-database", name }));
  }

  // The picker is shown before any await: the browser shows it only within the click.
  openFile(): Promise<DatabaseEntry | null> {
    if (!this.fileAccess.hasPickers) return Promise.reject(storageError("not-supported", NO_PICKERS_REASON));
    const picking = this.fileAccess.pickFileToOpen();
    return this.guard(async (engine) => {
      const handle = await picking;
      if (handle === null) return null;
      // Asked right after the picker, while the click still counts; refused, the first write asks again.
      await this.fileAccess.obtainWriteAccess(handle, true);
      return engine.send({ op: "link-file", handle });
    });
  }

  createFile(templateId: string | null): Promise<DatabaseEntry | null> {
    const script = this.findScript(templateId);
    if (script === undefined) return Promise.reject(storageError("not-supported", `There is no template "${templateId}"`));
    if (!this.fileAccess.hasPickers) return Promise.reject(storageError("not-supported", NO_PICKERS_REASON));
    const picking = this.fileAccess.pickFileToSave(templateId === null ? NEW_FILE_NAME : `${templateId}.sqlite`);
    return this.guard(async (engine) => {
      const handle = await picking;
      if (handle === null) return null;
      return engine.send({ op: "create-file", handle, script });
    });
  }

  async renameDatabase(name: DatabaseName, newName: DatabaseName): Promise<void> {
    await this.guard((engine) => engine.send({ op: "rename-database", name, newName }));
  }

  async deleteDatabase(name: DatabaseName): Promise<void> {
    await this.guard((engine) => engine.send({ op: "delete-database", name }));
  }

  /** null: an empty database; undefined: no such template. */
  private findScript(templateId: string | null): string | null | undefined {
    if (templateId === null) return null;
    return templateId === DEMO_TEMPLATE_ID ? DEMO_DATABASE_SCRIPT : undefined;
  }

  private async guard<T>(call: (engine: EngineClient) => Promise<T>): Promise<T> {
    if (this.engine === null) throw storageError("not-supported", this.unavailableReason);
    try {
      return await call(this.engine);
    } catch (error) {
      throw storageRefusal(error);
    }
  }
}
