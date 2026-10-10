// Rows as tab-separated lines, as spreadsheets copy and paste them: a cell with a tab, a line end or a quote is quoted.

/** The cells of each line; a quoted cell may hold tabs and line ends, "" in it is one quote. */
export const parseTsv = (text: string): readonly (readonly string[])[] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let isQuoted = false;
  let position = 0;
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  while (position < normalized.length) {
    const character = normalized.charAt(position);
    if (isQuoted) {
      if (character === '"' && normalized.charAt(position + 1) === '"') {
        cell += '"';
        position += 1;
      } else if (character === '"') {
        isQuoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell === "") {
      isQuoted = true;
    } else if (character === "\t") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
    position += 1;
  }
  if (normalized.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};
