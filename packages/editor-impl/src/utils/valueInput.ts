// What a typed text means as a value of a column: the value, or why it cannot be one.

import type { CellValue } from "@db-manager/connector";
import type { ValueKind } from "@db-manager/connector";

export type ValueReading = { readonly isValid: true; readonly value: CellValue } | { readonly isValid: false; readonly problem: string };

const INTEGER_PATTERN = /^[+-]?\d+$/;
const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const HEX_PATTERN = /^([0-9a-f]{2})*$/i;
const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;

/**
 * The value a text stands for in a column of the kind; "" is null, but for a text column that is NOT NULL, where it is "".
 * @param isNotNull — the column refuses null
 */
export const readValue = (text: string, valueKind: ValueKind, isNotNull: boolean): ValueReading => {
  if (text === "") return valueKind === "text" && isNotNull ? valid("") : valid(null);
  const trimmed = text.trim();
  switch (valueKind) {
    case "integer":
      return INTEGER_PATTERN.test(trimmed) ? valid(BigInt(trimmed)) : invalid("Enter a whole number");
    case "real":
      return NUMBER_PATTERN.test(trimmed) ? valid(Number(trimmed)) : invalid("Enter a number");
    case "numeric":
      if (INTEGER_PATTERN.test(trimmed)) return valid(BigInt(trimmed));
      return NUMBER_PATTERN.test(trimmed) ? valid(trimmed) : invalid("Enter a number");
    case "boolean":
      return readBoolean(trimmed);
    case "date":
      return DATE_PATTERN.test(trimmed) ? valid(trimmed) : invalid("Enter a date as YYYY-MM-DD");
    case "datetime":
      return DATETIME_PATTERN.test(trimmed) ? valid(trimmed.replace("T", " ")) : invalid("Enter a date and time as YYYY-MM-DD HH:MM:SS");
    case "blob":
      return HEX_PATTERN.test(trimmed) ? valid(fromHex(trimmed)) : invalid("Enter bytes as hexadecimal digits, two a byte");
    case "any":
      if (INTEGER_PATTERN.test(trimmed)) return valid(BigInt(trimmed));
      if (NUMBER_PATTERN.test(trimmed)) return valid(Number(trimmed));
      return valid(text);
    case "text":
      return valid(text);
  }
};

/** A condition's value: as the column would read it, text where it would not, so a filter never refuses to be typed. */
export const readConditionValue = (text: string, valueKind: ValueKind): CellValue => {
  const reading = readValue(text, valueKind, true);
  return reading.isValid ? reading.value : text;
};

const readBoolean = (text: string): ValueReading => {
  const lower = text.toLowerCase();
  if (["1", "true", "yes", "✓", "✓ true"].includes(lower)) return valid(1n);
  if (["0", "false", "no", "✗", "✗ false"].includes(lower)) return valid(0n);
  return invalid("Enter true or false");
};

const fromHex = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length / HEX_DIGITS_PER_BYTE);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(text.slice(index * HEX_DIGITS_PER_BYTE, (index + 1) * HEX_DIGITS_PER_BYTE), HEX_RADIX);
  }
  return bytes;
};

const valid = (value: CellValue): ValueReading => ({ isValid: true, value });
const invalid = (problem: string): ValueReading => ({ isValid: false, problem });
