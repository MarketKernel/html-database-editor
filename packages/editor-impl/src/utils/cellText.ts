// How a value reads in a grid cell, a form field and the clipboard.

import type { CellValue } from "@db-manager/connector";
import type { ValueKind } from "@db-manager/connector";

const NULL_TEXT = "NULL";
const BYTES_PER_KILOBYTE = 1024;
const PREVIEW_LENGTH = 200;

/** The text of a value in a grid cell: short, one line. */
export const formatCellText = (value: CellValue, valueKind: ValueKind): string => {
  if (value === null) return NULL_TEXT;
  if (value instanceof Uint8Array) return `BLOB · ${formatByteCount(value.byteLength)}`;
  if (valueKind === "boolean" && (value === 1n || value === 0n)) return value === 1n ? "✓ true" : "✗ false";
  const text = String(value);
  const line = text.replace(/\s+/g, " ");
  return line.length > PREVIEW_LENGTH ? `${line.slice(0, PREVIEW_LENGTH)}…` : line;
};

/** The text of a value to edit: in full; "" for null. */
export const formatEditText = (value: CellValue): string => {
  if (value === null) return "";
  if (value instanceof Uint8Array) return toHex(value);
  return String(value);
};

/** The text of a value on the clipboard: tabs and line ends escaped as in a spreadsheet's cell; \N for null. */
export const formatClipboardText = (value: CellValue): string => {
  if (value === null) return "\\N";
  const text = value instanceof Uint8Array ? `x'${toHex(value)}'` : String(value);
  return /[\t\n\r"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const formatByteCount = (byteCount: number): string =>
  byteCount < BYTES_PER_KILOBYTE ? `${byteCount} B` : byteCount < BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE ? `${(byteCount / BYTES_PER_KILOBYTE).toFixed(1)} KB` : `${(byteCount / BYTES_PER_KILOBYTE / BYTES_PER_KILOBYTE).toFixed(1)} MB`;

export const toHex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/** Whether two values are the same value of the same kind: 1n and 1 differ, as SQLite tells them apart. */
export const isSameValue = (first: CellValue, second: CellValue): boolean => {
  if (first instanceof Uint8Array && second instanceof Uint8Array) return first.byteLength === second.byteLength && first.every((byte, index) => byte === second[index]);
  return first === second;
};
