// The plugin's main side holds the engine through this: a worker in the browser, a direct call in the tests.
// why: a unit the plugin's services hold, kept in this -impl without a contract: a deviation recorded in ARCHITECTURE.md.

import type { EngineOp } from "./engineMessages.js";
import type { EngineRequest } from "./engineMessages.js";
import type { EngineResults } from "./engineMessages.js";

export interface EngineClient {
  /** The engine's answer; rejects with an EngineFailure. */
  send<Op extends EngineOp>(request: Extract<EngineRequest, { readonly op: Op }>): Promise<EngineResults[Op]>;
}
