/** What a schema change will run, to show the user before it is applied. */
export interface SchemaChangePlan {
  /** The statements in order, as the DBMS will run them, in one transaction. */
  readonly statements: readonly string[];
  /** Whether the table is built anew and its rows copied: slower, and the table is briefly another object. */
  readonly isRebuild: boolean;
  /** What the user should know: a column dropped with its values, a NOT NULL the rows may fail. */
  readonly warnings: readonly string[];
}
