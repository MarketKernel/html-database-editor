/**
 * One value as the DBMS keeps it, whatever the column's declared type says:
 * null; bigint for an integer, always, so no digit is lost past 2^53; number for a floating point value;
 * string for text; Uint8Array for bytes.
 */
export type CellValue = null | bigint | number | string | Uint8Array;
