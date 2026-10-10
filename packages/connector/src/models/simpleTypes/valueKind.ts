/**
 * What a column's values are, as the editor needs to know to show and enter them; the plugin derives it from the column's type:
 * @param integer — whole numbers, CellValue bigint
 * @param real — floating point, CellValue number
 * @param numeric — exact or mixed numbers, entered as text and stored as the DBMS decides
 * @param text — CellValue string
 * @param blob — bytes, CellValue Uint8Array
 * @param boolean — true or false, stored as the DBMS stores them (SQLite: 1 and 0)
 * @param date — "YYYY-MM-DD"
 * @param datetime — ISO 8601 text
 * @param any — no declared type: whatever the row holds
 */
export type ValueKind = "integer" | "real" | "numeric" | "text" | "blob" | "boolean" | "date" | "datetime" | "any";
