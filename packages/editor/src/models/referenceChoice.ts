import type { CellValue } from "@db-manager/connector";
import type { ForeignKey } from "@db-manager/connector";

/** The reference the picker chooses a target row for: a foreign key and the values its columns hold now. */
export interface ReferenceChoice {
  readonly foreignKey: ForeignKey;
  /** In the order of ForeignKey#columnNames; nulls where it refers to nothing. */
  readonly currentValues: readonly CellValue[];
}
