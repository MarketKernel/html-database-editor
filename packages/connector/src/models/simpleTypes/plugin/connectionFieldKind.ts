/**
 * How the editor asks for one connection parameter:
 * @param stored-database — a database of the plugin's own DatabaseStorage, picked from its list
 * @param text — a line of text
 * @param password — a line of text never shown or remembered
 */
export type ConnectionFieldKind = "stored-database" | "text" | "password";
