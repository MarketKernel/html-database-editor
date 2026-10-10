// What a column's values are, from its declared type: SQLite's type affinity, and the types people mean as boolean or dates.

import type { ValueKind } from "@db-manager/connector";

export const deriveValueKind = (declaredType: string): ValueKind => {
  const type = declaredType.trim().toUpperCase();
  if (type === "") return "any";
  if (type === "ANY") return "any";
  if (type === "BOOLEAN" || type === "BOOL") return "boolean";
  if (type === "DATE") return "date";
  if (type === "DATETIME" || type.startsWith("TIMESTAMP")) return "datetime";
  if (type.includes("INT")) return "integer";
  if (type.includes("CHAR") || type.includes("CLOB") || type.includes("TEXT")) return "text";
  if (type.includes("BLOB")) return "blob";
  if (type.includes("REAL") || type.includes("FLOA") || type.includes("DOUB")) return "real";
  return "numeric";
};
