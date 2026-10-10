import type { RowKey } from "@db-manager/connector";
import type { RowService } from "@db-manager/connector";

import type { ClipboardService } from "./clipboardService.js";
import type { ContextMenu } from "./contextMenu.js";
import type { DialogService } from "./dialogService.js";
import type { GridSource } from "./models/gridSource.js";
import type { GridView } from "./models/gridView.js";
import type { Notifier } from "./notifier.js";
import type { ReferencePicker } from "./referencePicker.js";
import type { RowForm } from "./rowForm.js";
import type { RowGridObserver } from "./rowGridObserver.js";
import type { RowTitleService } from "./rowTitleService.js";
import type { SettingsStore } from "./settingsStore.js";
import type { TableCatalog } from "./tableCatalog.js";

/**
 * A page of a table's rows: a header to sort by, a filter of conditions, a pager; rows selected as in a spreadsheet,
 * edited in place or in the row form, copied, pasted, duplicated, deleted. A reference shows its target's title and a drop-down
 * to choose another: in its column for one column, in a column of its own after its columns for several.
 */
export interface RowGrid {
  readonly element: HTMLElement;
  /** Shows the source's rows as the view says, the row of chosenRowKey marked. A load in flight is dropped. */
  show(source: GridSource, view: GridView, chosenRowKey: RowKey | null): void;
  /** Reads the page again, the view and the chosen row kept. */
  reload(): void;
  /** Empties the grid, the placeholder shown. */
  clear(placeholder: string): void;
  /** Gives the keyboard to the grid. */
  focus(): void;
}

export interface RowGridDeps {
  readonly rowService: RowService;
  readonly tableCatalog: TableCatalog;
  readonly rowTitleService: RowTitleService;
  readonly rowForm: RowForm;
  readonly referencePicker: ReferencePicker;
  readonly contextMenu: ContextMenu;
  readonly dialogService: DialogService;
  readonly clipboardService: ClipboardService;
  readonly notifier: Notifier;
  /** The rows per page. */
  readonly settingsStore: SettingsStore;
}

export type RowGridFactory = (document: Document, deps: RowGridDeps, observer: RowGridObserver) => RowGrid;
