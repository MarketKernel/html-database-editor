// What the plugin reads back from a CREATE TABLE statement that SQLite's pragmas do not tell.

import type { CheckConstraint } from "@db-manager/connector";
import type { ForeignKeyAction } from "@db-manager/connector";
import type { GeneratedColumn } from "@db-manager/connector";
import type { UniqueConstraint } from "@db-manager/connector";

export interface ParsedColumn {
  readonly name: string;
  readonly collation: string | null;
  readonly generated: GeneratedColumn | null;
  readonly isAutoincrement: boolean;
}

/** A foreign key as written: its target columns may be left out, meaning the target's primary key. */
export interface ParsedForeignKey {
  readonly name: string | null;
  readonly columnNames: readonly string[];
  readonly targetTableName: string;
  readonly targetColumnNames: readonly string[];
  readonly onUpdate: ForeignKeyAction;
  readonly onDelete: ForeignKeyAction;
}

export interface ParsedTable {
  readonly columns: readonly ParsedColumn[];
  /** Column CHECKs lifted to the table, as SQLite treats them alike. */
  readonly checks: readonly CheckConstraint[];
  /** Column UNIQUE and table UNIQUE alike. */
  readonly uniqueConstraints: readonly UniqueConstraint[];
  readonly foreignKeys: readonly ParsedForeignKey[];
  /** What the statement holds that the plugin cannot write back: a table with any is never rebuilt. */
  readonly unsupportedFeatures: readonly string[];
}
