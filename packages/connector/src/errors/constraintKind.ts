/** Which rule of the table a written row broke; "other" where the DBMS does not say. */
export type ConstraintKind = "not-null" | "unique" | "primary-key" | "foreign-key" | "check" | "other";
