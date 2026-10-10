/**
 * How a database of the list is kept:
 * @param stored — by the plugin itself; deleting it deletes the database
 * @param linked-file — a file of the user's, opened in place; deleting the entry forgets the link, the file stays
 */
export type DatabaseEntryKind = "stored" | "linked-file";
