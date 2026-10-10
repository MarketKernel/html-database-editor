/** A condition every row must meet, as SQL text. */
export interface CheckConstraint {
  /** null: the DBMS names it. */
  readonly name: string | null;
  readonly expression: string;
}
