// A table as the plugin knows it: the contract's TableDefinition and what only SQLite's side needs.

import type { TableDefinition } from "@db-manager/connector";

export interface TableSchema {
  readonly definition: TableDefinition;
  /** How a statement names the row id: rowid, _rowid_ or oid, whichever no column shadows; null: none is left, or a WITHOUT ROWID table. */
  readonly rowIdAlias: string | null;
  /** What the table's statement holds that a rebuild cannot write back; empty: it can be rebuilt. */
  readonly unsupportedFeatures: readonly string[];
  /** The CREATE TRIGGER statements of the table's triggers. */
  readonly triggerStatements: readonly string[];
}
