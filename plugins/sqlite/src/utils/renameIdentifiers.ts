// Carries column renames into SQL text written before them: a check, an index expression, a trigger, a view.

import { quoteIdentifier } from "./identifier.js";
import { tokenizeSql } from "./sqlTokens.js";

/** renames: lowercase old name -> new name. Text that cannot be tokenized is returned as it is. */
export const renameIdentifiers = (text: string, renames: ReadonlyMap<string, string>): string => {
  if (renames.size === 0) return text;
  let tokens;
  try {
    tokens = tokenizeSql(text);
  } catch {
    // Text SQLite would not have kept; nothing to rename in it.
    return text;
  }
  let renamed = "";
  let position = 0;
  for (const token of tokens) {
    const newName = token.kind === "word" || token.kind === "identifier" ? renames.get(token.value.toLowerCase()) : undefined;
    if (newName === undefined) continue;
    renamed += text.slice(position, token.start) + quoteIdentifier(newName);
    position = token.end;
  }
  return renamed + text.slice(position);
};
