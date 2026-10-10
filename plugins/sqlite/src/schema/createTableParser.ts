// Reads a CREATE TABLE statement as SQLite keeps it in sqlite_schema: constraint names, checks, collations, generated columns.
// Whatever it does not understand it lists as unsupported, so a rebuild refuses rather than loses it.

import type { CheckConstraint } from "@db-manager/connector";
import type { ForeignKeyAction } from "@db-manager/connector";
import type { GeneratedColumn } from "@db-manager/connector";
import type { UniqueConstraint } from "@db-manager/connector";

import type { ParsedColumn } from "./parsedTable.js";
import type { ParsedForeignKey } from "./parsedTable.js";
import type { ParsedTable } from "./parsedTable.js";
import { findClosingParenthesis, isKeyword, isName, isSymbol, splitAtCommas, tokenizeSql } from "../utils/sqlTokens.js";
import type { SqlToken } from "../utils/sqlTokens.js";

/** The words that end a column's type and start its constraints. */
const COLUMN_CONSTRAINT_STARTS: ReadonlySet<string> = new Set([
  "CONSTRAINT", "PRIMARY", "NOT", "NULL", "UNIQUE", "CHECK", "DEFAULT", "COLLATE", "REFERENCES", "GENERATED", "AS",
]);
const TABLE_CONSTRAINT_STARTS: ReadonlySet<string> = new Set(["CONSTRAINT", "PRIMARY", "UNIQUE", "CHECK", "FOREIGN"]);

/** null: the statement is not a CREATE TABLE with a column list (CREATE TABLE … AS SELECT), or it could not be read. */
export const parseCreateTable = (statement: string): ParsedTable | null => {
  try {
    return new CreateTableReader(statement).read();
  } catch {
    // An unreadable statement is reported by the caller as a table that cannot be rebuilt, not as a failure.
    return null;
  }
};

class CreateTableReader {
  private readonly tokens: readonly SqlToken[];
  private readonly columns: ParsedColumn[] = [];
  private readonly checks: CheckConstraint[] = [];
  private readonly uniqueConstraints: UniqueConstraint[] = [];
  private readonly foreignKeys: ParsedForeignKey[] = [];
  private readonly unsupportedFeatures: string[] = [];

  constructor(private readonly statement: string) {
    this.tokens = tokenizeSql(statement);
  }

  read(): ParsedTable | null {
    const openIndex = this.tokens.findIndex((token) => isSymbol(token, "("));
    if (openIndex === -1) return null;
    const closeIndex = findClosingParenthesis(this.tokens, openIndex);
    for (const item of splitAtCommas(this.tokens, openIndex + 1, closeIndex)) {
      const first = item[0];
      if (first !== undefined && first.kind === "word" && TABLE_CONSTRAINT_STARTS.has(first.value.toUpperCase())) this.readTableConstraint(item);
      else this.readColumn(item);
    }
    return {
      columns: this.columns,
      checks: this.checks,
      uniqueConstraints: this.uniqueConstraints,
      foreignKeys: this.foreignKeys,
      unsupportedFeatures: this.unsupportedFeatures,
    };
  }

  private readColumn(item: readonly SqlToken[]): void {
    const nameToken = item[0];
    if (!isName(nameToken)) throw new Error("A column without a name");
    let index = 1;
    while (index < item.length && !isConstraintStart(item[index])) index = skipGroup(item, index);
    const column = { name: nameToken.value, collation: null as string | null, generated: null as GeneratedColumn | null, isAutoincrement: false };
    let constraintName: string | null = null;
    while (index < item.length) {
      const token = item[index];
      const keyword = token?.kind === "word" ? token.value.toUpperCase() : "";
      if (keyword === "CONSTRAINT") {
        constraintName = item[index + 1]?.value ?? null;
        index += 2;
        continue;
      }
      if (keyword === "PRIMARY") {
        index = this.readColumnPrimaryKey(item, index + 2, column);
      } else if (keyword === "NOT" || keyword === "NULL") {
        index = this.skipConflictClause(item, index + (keyword === "NOT" ? 2 : 1));
      } else if (keyword === "UNIQUE") {
        this.uniqueConstraints.push({ name: constraintName, columnNames: [column.name] });
        index = this.skipConflictClause(item, index + 1);
      } else if (keyword === "CHECK") {
        const close = findClosingParenthesis(item, index + 1);
        this.checks.push({ name: constraintName, expression: this.textBetween(item, index + 1, close) });
        index = close + 1;
      } else if (keyword === "DEFAULT") {
        index = skipDefault(item, index + 1);
      } else if (keyword === "COLLATE") {
        column.collation = item[index + 1]?.value ?? null;
        index += 2;
      } else if (keyword === "REFERENCES") {
        const reference = this.readReferences(item, index + 1);
        this.foreignKeys.push({ ...reference.foreignKey, name: constraintName, columnNames: [column.name] });
        index = reference.nextIndex;
      } else if (keyword === "GENERATED" || keyword === "AS") {
        index = this.readGenerated(item, keyword === "GENERATED" ? index + 3 : index + 1, column);
      } else {
        this.unsupportedFeatures.push(`"${token?.value ?? ""}" in column "${column.name}"`);
        index += 1;
      }
      constraintName = null;
    }
    this.columns.push(column);
  }

  private readColumnPrimaryKey(item: readonly SqlToken[], start: number, column: { isAutoincrement: boolean; name: string }): number {
    let index = start;
    if (isKeyword(item[index], "ASC")) index += 1;
    if (isKeyword(item[index], "DESC")) {
      this.unsupportedFeatures.push(`PRIMARY KEY DESC of column "${column.name}"`);
      index += 1;
    }
    index = this.skipConflictClause(item, index);
    if (isKeyword(item[index], "AUTOINCREMENT")) {
      column.isAutoincrement = true;
      index += 1;
    }
    return index;
  }

  /** openIndex: the "(" of the expression, past GENERATED ALWAYS AS or AS. */
  private readGenerated(item: readonly SqlToken[], openIndex: number, column: { generated: GeneratedColumn | null }): number {
    const close = findClosingParenthesis(item, openIndex);
    let index = close + 1;
    let storage: GeneratedColumn["storage"] = "virtual";
    if (isKeyword(item[index], "STORED")) {
      storage = "stored";
      index += 1;
    } else if (isKeyword(item[index], "VIRTUAL")) {
      index += 1;
    }
    column.generated = { expression: this.textBetween(item, openIndex, close), storage };
    return index;
  }

  private readTableConstraint(item: readonly SqlToken[]): void {
    let index = 0;
    let constraintName: string | null = null;
    if (isKeyword(item[index], "CONSTRAINT")) {
      constraintName = item[index + 1]?.value ?? null;
      index += 2;
    }
    const keyword = item[index]?.value.toUpperCase() ?? "";
    if (keyword === "PRIMARY" || keyword === "UNIQUE") {
      const openIndex = keyword === "PRIMARY" ? index + 2 : index + 1;
      const close = findClosingParenthesis(item, openIndex);
      const columnNames = this.readIndexedColumns(item, openIndex, close);
      if (keyword === "UNIQUE") this.uniqueConstraints.push({ name: constraintName, columnNames });
      this.skipConflictClause(item, close + 1);
    } else if (keyword === "CHECK") {
      const close = findClosingParenthesis(item, index + 1);
      this.checks.push({ name: constraintName, expression: this.textBetween(item, index + 1, close) });
    } else if (keyword === "FOREIGN") {
      const openIndex = index + 2;
      const close = findClosingParenthesis(item, openIndex);
      const columnNames = splitAtCommas(item, openIndex + 1, close).map((part) => part[0]?.value ?? "");
      if (!isKeyword(item[close + 1], "REFERENCES")) throw new Error("FOREIGN KEY without REFERENCES");
      const reference = this.readReferences(item, close + 2);
      this.foreignKeys.push({ ...reference.foreignKey, name: constraintName, columnNames });
    } else {
      this.unsupportedFeatures.push(`the table constraint "${keyword}"`);
    }
  }

  private readIndexedColumns(item: readonly SqlToken[], openIndex: number, close: number): string[] {
    return splitAtCommas(item, openIndex + 1, close).map((part) => {
      const isPlain = part.length === 1 || (part.length === 2 && (isKeyword(part[1], "ASC") || isKeyword(part[1], "DESC")));
      if (!isPlain) this.unsupportedFeatures.push(`the key part "${part.map((token) => token.value).join(" ")}"`);
      return part[0]?.value ?? "";
    });
  }

  private readReferences(item: readonly SqlToken[], start: number): { foreignKey: Omit<ParsedForeignKey, "name" | "columnNames">; nextIndex: number } {
    const targetToken = item[start];
    if (!isName(targetToken)) throw new Error("REFERENCES without a table");
    let index = start + 1;
    let targetColumnNames: string[] = [];
    if (isSymbol(item[index], "(")) {
      const close = findClosingParenthesis(item, index);
      targetColumnNames = splitAtCommas(item, index + 1, close).map((part) => part[0]?.value ?? "");
      index = close + 1;
    }
    let onUpdate: ForeignKeyAction = "no-action";
    let onDelete: ForeignKeyAction = "no-action";
    while (index < item.length) {
      if (isKeyword(item[index], "ON")) {
        const event = item[index + 1]?.value.toUpperCase();
        const action = readAction(item, index + 2);
        if (event === "UPDATE") onUpdate = action.action;
        else onDelete = action.action;
        index = action.nextIndex;
      } else if (isKeyword(item[index], "MATCH")) {
        index += 2;
      } else if (isKeyword(item[index], "NOT") && isKeyword(item[index + 1], "DEFERRABLE")) {
        index += 2;
      } else if (isKeyword(item[index], "DEFERRABLE")) {
        index += 1;
      } else if (isKeyword(item[index], "INITIALLY")) {
        if (isKeyword(item[index + 1], "DEFERRED")) this.unsupportedFeatures.push(`a foreign key to "${targetToken.value}" checked at commit (INITIALLY DEFERRED)`);
        index += 2;
      } else {
        break;
      }
    }
    return { foreignKey: { targetTableName: targetToken.value, targetColumnNames, onUpdate, onDelete }, nextIndex: index };
  }

  private skipConflictClause(item: readonly SqlToken[], start: number): number {
    if (!isKeyword(item[start], "ON") || !isKeyword(item[start + 1], "CONFLICT")) return start;
    this.unsupportedFeatures.push(`ON CONFLICT ${item[start + 2]?.value ?? ""}`);
    return start + 3;
  }

  private textBetween(item: readonly SqlToken[], openIndex: number, closeIndex: number): string {
    const open = item[openIndex];
    const close = item[closeIndex];
    if (open === undefined || close === undefined) throw new Error("A parenthesis is missing");
    return this.statement.slice(open.end, close.start).trim();
  }
}

/** The CREATE INDEX statement's key parts as written, and its WHERE condition. */
export interface ParsedIndex {
  readonly partTexts: readonly string[];
  readonly whereExpression: string | null;
}

export const parseCreateIndex = (statement: string): ParsedIndex | null => {
  try {
    const tokens = tokenizeSql(statement);
    const openIndex = tokens.findIndex((token) => isSymbol(token, "("));
    if (openIndex === -1) return null;
    const close = findClosingParenthesis(tokens, openIndex);
    const partTexts = splitAtCommas(tokens, openIndex + 1, close).map((part) => {
      const first = part[0];
      const last = isKeyword(part[part.length - 1], "ASC") || isKeyword(part[part.length - 1], "DESC") ? part[part.length - 2] : part[part.length - 1];
      return first === undefined || last === undefined ? "" : statement.slice(first.start, last.end);
    });
    const whereToken = tokens[close + 1];
    const whereExpression = isKeyword(whereToken, "WHERE") && whereToken !== undefined ? statement.slice(whereToken.end).trim().replace(/;$/, "") : null;
    return { partTexts, whereExpression };
  } catch {
    // An unreadable index is reported by the caller as an expression it keeps as written.
    return null;
  }
};

const isConstraintStart = (token: SqlToken | undefined): boolean => token?.kind === "word" && COLUMN_CONSTRAINT_STARTS.has(token.value.toUpperCase());

/** The index past a token, or past a whole parenthesized group starting there. */
const skipGroup = (item: readonly SqlToken[], index: number): number => (isSymbol(item[index], "(") ? findClosingParenthesis(item, index) + 1 : index + 1);

const skipDefault = (item: readonly SqlToken[], start: number): number => {
  if (isSymbol(item[start], "+") || isSymbol(item[start], "-")) return start + 2;
  return skipGroup(item, start);
};

const readAction = (item: readonly SqlToken[], start: number): { action: ForeignKeyAction; nextIndex: number } => {
  const first = item[start]?.value.toUpperCase();
  const second = item[start + 1]?.value.toUpperCase();
  if (first === "SET" && second === "NULL") return { action: "set-null", nextIndex: start + 2 };
  if (first === "SET" && second === "DEFAULT") return { action: "set-default", nextIndex: start + 2 };
  if (first === "NO" && second === "ACTION") return { action: "no-action", nextIndex: start + 2 };
  if (first === "CASCADE") return { action: "cascade", nextIndex: start + 1 };
  if (first === "RESTRICT") return { action: "restrict", nextIndex: start + 1 };
  throw new Error(`An unknown foreign key action ${first ?? ""}`);
};
