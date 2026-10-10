import assert from "node:assert/strict";
import { test } from "node:test";

import { formatCellText, formatClipboardText, formatEditText } from "../src/utils/cellText.js";
import { parseTsv } from "../src/utils/tsv.js";
import { readValue } from "../src/utils/valueInput.js";

test("a typed integer is read as a bigint, every digit kept", () => {
  assert.deepEqual(readValue("9007199254740993", "integer", false), { isValid: true, value: 9007199254740993n });
  assert.equal(readValue("1.5", "integer", false).isValid, false);
});

test("an empty field is null, but text in a NOT NULL text column", () => {
  assert.deepEqual(readValue("", "integer", true), { isValid: true, value: null });
  assert.deepEqual(readValue("", "text", true), { isValid: true, value: "" });
  assert.deepEqual(readValue("", "text", false), { isValid: true, value: null });
});

test("numbers, booleans, dates and bytes are read by their kind", () => {
  assert.deepEqual(readValue("12.50", "numeric", false), { isValid: true, value: "12.50" });
  assert.deepEqual(readValue("2.5", "real", false), { isValid: true, value: 2.5 });
  assert.deepEqual(readValue("true", "boolean", false), { isValid: true, value: 1n });
  assert.deepEqual(readValue("2026-10-09T12:30", "datetime", false), { isValid: true, value: "2026-10-09 12:30" });
  assert.equal(readValue("09.10.2026", "date", false).isValid, false);
  assert.deepEqual(readValue("00ff", "blob", false), { isValid: true, value: new Uint8Array([0, 255]) });
});

test("a value reads in a cell, in a field and on the clipboard", () => {
  assert.equal(formatCellText(null, "text"), "NULL");
  assert.equal(formatCellText(1n, "boolean"), "✓ true");
  assert.equal(formatCellText(new Uint8Array(2048), "blob"), "BLOB · 2.0 KB");
  assert.equal(formatEditText(new Uint8Array([1, 171])), "01ab");
  assert.equal(formatClipboardText(null), "\\N");
  assert.equal(formatClipboardText('a\tb"c'), '"a\tb""c"');
});

test("tab-separated lines are split into cells, quoted cells kept whole", () => {
  assert.deepEqual(parseTsv('a\tb\n"x\ty"\t"say ""hi"""\r\n'), [["a", "b"], ["x\ty", 'say "hi"']]);
  assert.deepEqual(parseTsv('"two\nlines"\tz'), [["two\nlines", "z"]]);
});
