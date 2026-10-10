/**
 * How a column's value is compared with a condition's value:
 * @param equals / not-equals — as the DBMS compares them, with the column's own rules (SQLite: affinity, collation)
 * @param contains — the value as text is a part of the column's text, ignoring case
 * @param less / less-or-equal / greater / greater-or-equal — as the DBMS orders them
 * @param is-null / is-not-null — the condition's value is not read
 */
export type ComparisonKind =
  | "equals"
  | "not-equals"
  | "contains"
  | "less"
  | "less-or-equal"
  | "greater"
  | "greater-or-equal"
  | "is-null"
  | "is-not-null";
