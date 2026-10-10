import type { Row } from "@db-manager/connector";
import type { RowService } from "@db-manager/connector";

import type { Notifier } from "./notifier.js";
import type { ReferenceChoice } from "./models/referenceChoice.js";
import type { RowTitleService } from "./rowTitleService.js";
import type { TableCatalog } from "./tableCatalog.js";

/** The drop-down of a reference: the target table's rows by title, a page at a time, searched by a typed text, the current one marked. */
export interface ReferencePicker {
  /**
   * Opens under the anchor, closing one that was open. Resolves with the chosen target row, "none" for "no reference",
   * null when closed without a choice.
   */
  open(anchor: HTMLElement, choice: ReferenceChoice): Promise<Row | "none" | null>;
}

export interface ReferencePickerDeps {
  readonly rowService: RowService;
  readonly tableCatalog: TableCatalog;
  readonly rowTitleService: RowTitleService;
  readonly notifier: Notifier;
}

export type ReferencePickerFactory = (document: Document, deps: ReferencePickerDeps) => ReferencePicker;
