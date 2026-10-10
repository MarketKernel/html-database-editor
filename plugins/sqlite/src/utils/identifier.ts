// SQLite's spelling of names in a statement.

/** A name as a double-quoted identifier: any text is safe inside. */
export const quoteIdentifier = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/** A text as a SQL string literal. */
export const quoteText = (text: string): string => `'${text.replaceAll("'", "''")}'`;

/** SQLite compares names ignoring ASCII case. */
export const isSameName = (first: string, second: string): boolean => first.toLowerCase() === second.toLowerCase();
