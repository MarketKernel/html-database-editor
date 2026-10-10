/** A table option the table designer offers as a checkbox: SQLite's WITHOUT ROWID, STRICT. */
export interface TableOptionDescriptor {
  /** The key in TableOptions. */
  readonly key: string;
  readonly caption: string;
  readonly description: string;
}
