/**
 * Why a DatabaseStorage call refused:
 * @param not-supported — the plugin keeps no databases of its own, or not this way
 * @param invalid-name — a name the storage cannot keep
 * @param name-taken — a database of that name is there already
 * @param database-not-found — no database of that name
 * @param database-busy — the database is open, here or in another page
 * @param not-a-database — the bytes imported are not a database of this DBMS
 * @param access-required — the user has not allowed the page to read and write the file
 * @param storage-refused — the browser refused; cause holds why
 */
export type StorageErrorKind =
  | "not-supported"
  | "invalid-name"
  | "name-taken"
  | "database-not-found"
  | "database-busy"
  | "not-a-database"
  | "access-required"
  | "storage-refused";

export interface StorageError {
  readonly kind: StorageErrorKind;
  /** For the user, in English. */
  readonly message: string;
  readonly cause?: unknown;
}
