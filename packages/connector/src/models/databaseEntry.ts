import type { DatabaseEntryKind } from "./simpleTypes/databaseEntryKind.js";
import type { DatabaseName } from "./simpleTypes/databaseName.js";

/** A database in a plugin's storage list. */
export interface DatabaseEntry {
  /** Unique in the list: what connect() and every storage call take. */
  readonly name: DatabaseName;
  readonly kind: DatabaseEntryKind;
  /** Where it is kept, for the user: "This browser (OPFS)", "shop.sqlite on the disk". */
  readonly locationCaption: string;
  /** null: the storage does not tell without opening it. */
  readonly sizeBytes: number | null;
}
