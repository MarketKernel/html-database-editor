import type { GridView } from "./gridView.js";

/** How the user left one referencing tab, kept whichever row of the target table is chosen. */
export interface ReferencingTabView {
  /** "<referencing table>(<its columns>)": one tab per foreign key referring to the table. */
  readonly tabId: string;
  readonly grid: GridView;
}
