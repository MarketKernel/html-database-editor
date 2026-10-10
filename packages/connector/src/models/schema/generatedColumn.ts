import type { GeneratedColumnStorage } from "../simpleTypes/schema/generatedColumnStorage.js";

/** A column whose value the DBMS computes from the row: never written by the user. */
export interface GeneratedColumn {
  /** The expression as SQL text. */
  readonly expression: string;
  readonly storage: GeneratedColumnStorage;
}
