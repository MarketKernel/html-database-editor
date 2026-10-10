/** What the DBMS does to referencing rows when the referenced row is deleted or its key changes. */
export type ForeignKeyAction = "no-action" | "restrict" | "set-null" | "set-default" | "cascade";
