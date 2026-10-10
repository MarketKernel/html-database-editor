/**
 * Why connect() refused:
 * @param not-supported — the plugin cannot work here: the browser, the page's origin; message says what to do
 * @param invalid-parameters — a connection field is missing or malformed
 * @param database-not-found — no such database
 * @param database-busy — another page or program holds the database
 * @param not-a-database — the file or the answer is not a database of this DBMS
 * @param access-required — the user has not allowed the page to read and write the file; a click on it asks again
 * @param storage-refused — the browser refused the storage; cause holds why
 */
export type ConnectionErrorKind =
  | "not-supported"
  | "invalid-parameters"
  | "database-not-found"
  | "database-busy"
  | "not-a-database"
  | "access-required"
  | "storage-refused";

export interface ConnectionError {
  readonly kind: ConnectionErrorKind;
  /** For the user, in English. */
  readonly message: string;
  readonly cause?: unknown;
}
