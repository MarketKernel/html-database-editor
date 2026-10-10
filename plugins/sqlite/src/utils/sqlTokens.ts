// A tokenizer of SQLite's SQL, enough to read back the statements SQLite keeps in sqlite_schema.

/**
 * @param word — a keyword or a bare identifier; value as written
 * @param identifier — a quoted identifier: "x", `x`, [x]; value unquoted
 * @param string — 'text'; value unquoted
 * @param number — a numeric literal
 * @param blob — x'00ff'
 * @param symbol — punctuation and operators
 */
export type SqlTokenKind = "word" | "identifier" | "string" | "number" | "blob" | "symbol";

export interface SqlToken {
  readonly kind: SqlTokenKind;
  readonly value: string;
  /** Offsets in the statement: text.slice(start, end) is the token as written. */
  readonly start: number;
  readonly end: number;
}

const TWO_CHARACTER_SYMBOLS: ReadonlySet<string> = new Set(["||", "<=", ">=", "==", "!=", "<>", "<<", ">>", "->"]);

/** Every token of the text, comments and white space left out. Throws on an unterminated string or comment: not SQL SQLite kept. */
export const tokenizeSql = (text: string): readonly SqlToken[] => {
  const tokens: SqlToken[] = [];
  let position = 0;
  while (position < text.length) {
    const character = text.charAt(position);
    const next = text.charAt(position + 1);
    if (/\s/.test(character)) {
      position += 1;
    } else if (character === "-" && next === "-") {
      const lineEnd = text.indexOf("\n", position);
      position = lineEnd === -1 ? text.length : lineEnd + 1;
    } else if (character === "/" && next === "*") {
      const commentEnd = text.indexOf("*/", position + 2);
      position = commentEnd === -1 ? text.length : commentEnd + 2;
    } else if (character === "'") {
      const end = closingQuote(text, position, "'");
      tokens.push({ kind: "string", value: text.slice(position + 1, end - 1).replaceAll("''", "'"), start: position, end });
      position = end;
    } else if (character === '"' || character === "`") {
      const end = closingQuote(text, position, character);
      tokens.push({ kind: "identifier", value: text.slice(position + 1, end - 1).replaceAll(character + character, character), start: position, end });
      position = end;
    } else if (character === "[") {
      const end = text.indexOf("]", position);
      if (end === -1) throw new Error("An unterminated [identifier]");
      tokens.push({ kind: "identifier", value: text.slice(position + 1, end), start: position, end: end + 1 });
      position = end + 1;
    } else if ((character === "x" || character === "X") && next === "'") {
      const end = closingQuote(text, position + 1, "'");
      tokens.push({ kind: "blob", value: text.slice(position, end), start: position, end });
      position = end;
    } else if (/[0-9]/.test(character) || (character === "." && /[0-9]/.test(next))) {
      const match = /^(0x[0-9a-f]+|[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?|[0-9]+\.)/i.exec(text.slice(position));
      const length = match?.[0].length ?? 1;
      tokens.push({ kind: "number", value: text.slice(position, position + length), start: position, end: position + length });
      position += length;
    } else if (/[\p{L}_$]/u.test(character)) {
      const match = /^[\p{L}\p{N}_$]+/u.exec(text.slice(position));
      const length = match?.[0].length ?? 1;
      tokens.push({ kind: "word", value: text.slice(position, position + length), start: position, end: position + length });
      position += length;
    } else {
      const length = TWO_CHARACTER_SYMBOLS.has(character + next) ? 2 : 1;
      tokens.push({ kind: "symbol", value: text.slice(position, position + length), start: position, end: position + length });
      position += length;
    }
  }
  return tokens;
};

/** Whether the token is the keyword, any case. */
export const isKeyword = (token: SqlToken | undefined, keyword: string): boolean =>
  token !== undefined && token.kind === "word" && token.value.toUpperCase() === keyword;

export const isSymbol = (token: SqlToken | undefined, symbol: string): boolean => token !== undefined && token.kind === "symbol" && token.value === symbol;

/** A name: a bare word, a quoted identifier, or a string where SQLite accepts one. */
export const isName = (token: SqlToken | undefined): token is SqlToken =>
  token !== undefined && (token.kind === "word" || token.kind === "identifier" || token.kind === "string");

/** The index of the ")" closing the "(" at openIndex. Throws when there is none. */
export const findClosingParenthesis = (tokens: readonly SqlToken[], openIndex: number): number => {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (isSymbol(tokens[index], "(")) depth += 1;
    if (isSymbol(tokens[index], ")")) depth -= 1;
    if (depth === 0) return index;
  }
  throw new Error("An unbalanced parenthesis");
};

/** The tokens from start to end split at the commas outside parentheses. */
export const splitAtCommas = (tokens: readonly SqlToken[], start: number, end: number): readonly (readonly SqlToken[])[] => {
  const parts: SqlToken[][] = [[]];
  let depth = 0;
  for (let index = start; index < end; index += 1) {
    const token = tokens[index];
    if (token === undefined) break;
    if (isSymbol(token, "(")) depth += 1;
    if (isSymbol(token, ")")) depth -= 1;
    if (depth === 0 && isSymbol(token, ",")) parts.push([]);
    else parts[parts.length - 1]?.push(token);
  }
  return parts.filter((part) => part.length > 0);
};

const closingQuote = (text: string, openPosition: number, quote: string): number => {
  let position = openPosition + 1;
  while (position < text.length) {
    if (text.charAt(position) === quote) {
      if (text.charAt(position + 1) !== quote) return position + 1;
      position += 2;
    } else {
      position += 1;
    }
  }
  throw new Error(`An unterminated ${quote} quote`);
};
