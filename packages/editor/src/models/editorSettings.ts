import type { ColorScheme } from "./simpleTypes/colorScheme.js";
import type { PageRowCount } from "./simpleTypes/pageRowCount.js";
import type { RememberedConnection } from "./rememberedConnection.js";

/** What one browser remembers of the editor between visits; nothing of it is kept in a database. */
export interface EditorSettings {
  readonly colorScheme: ColorScheme;
  readonly pageRowCount: PageRowCount;
  /** The table list's width in CSS pixels. */
  readonly tableListWidthPx: number;
  /** The share of the right pane the grid of the chosen table takes when the referencing panel shows, 0.2..0.8. */
  readonly gridShare: number;
  /** The connection opened last, opened again on the next start; null: none, or the user closed it. */
  readonly lastConnection: RememberedConnection | null;
  /** The column that names a table's rows in references, by "<plugin>/<database>/<table>"; a table left out is named by a guess. */
  readonly titleColumns: Readonly<Record<string, string>>;
}
