// SQLite compiled to WebAssembly, instantiated from the bytes of sqlite3.wasm: nothing is fetched,
// so the module's own fetch of sqlite3.wasm beside the script is replaced by instantiateWasm.

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { Sqlite3Static } from "@sqlite.org/sqlite-wasm";

/** The Emscripten module's options this package passes: the bytes given instead of a fetch, and no console chatter. */
interface EngineModuleOptions {
  readonly instantiateWasm: (imports: WebAssembly.Imports, receiveInstance: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) => object;
  readonly print: (text: string) => void;
  readonly printErr: (text: string) => void;
}

// why: the package declares init() without the module's options on purpose (sqlite/sqlite-wasm#129); Emscripten still reads them.
const initEngine = sqlite3InitModule as unknown as (options: EngineModuleOptions) => Promise<Sqlite3Static>;

/** Rejects only as the platform fails: bytes that are not sqlite3.wasm, a page that forbids WebAssembly. */
export const instantiateSqlite = (engineBinary: Uint8Array<ArrayBuffer>): Promise<Sqlite3Static> =>
  new Promise((resolve, reject) => {
    const instantiateWasm: EngineModuleOptions["instantiateWasm"] = (imports, receiveInstance) => {
      WebAssembly.instantiate(engineBinary, imports).then((source) => receiveInstance(source.instance, source.module), reject);
      // Emscripten waits for receiveInstance; the object returned says the instantiation is underway.
      return {};
    };
    initEngine({ instantiateWasm, print: ignoreOutput, printErr: ignoreOutput }).then(resolve, reject);
  });

const ignoreOutput = (): void => undefined;
