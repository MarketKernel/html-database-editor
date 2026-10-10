// One open database as the plugin's services reach it: statements run by the engine over one connection.
// why: a unit the plugin's services hold, kept in this -impl without a contract: a deviation recorded in ARCHITECTURE.md.

import type { CellValue } from "@db-manager/connector";

import type { EngineClient } from "./engineClient.js";
import type { EngineStatement } from "./engineMessages.js";
import type { RunMode } from "./engineMessages.js";
import type { StatementExpectation } from "./engineMessages.js";
import type { StatementResult } from "./engineMessages.js";

export interface StatementRunner {
  /** Rejects with an EngineFailure. */
  run(statements: readonly EngineStatement[], mode: RunMode, isForeignKeysOff?: boolean): Promise<readonly StatementResult[]>;
  /** The connection's end; further runs reject "connection-closed". */
  close(): Promise<void>;
}

export const buildStatementRunner = (client: EngineClient, connectionId: number): StatementRunner => ({
  run: (statements, mode, isForeignKeysOff = false) => client.send({ op: "run", connectionId, statements, mode, isForeignKeysOff }),
  close: async () => {
    await client.send({ op: "close-database", connectionId });
  },
});

export const statement = (sql: string, params: readonly CellValue[] = [], expectation: StatementExpectation = "any"): EngineStatement => ({
  sql,
  params,
  expectation,
});
