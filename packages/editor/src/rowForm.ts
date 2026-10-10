import type { Row } from "@db-manager/connector";
import type { RowService } from "@db-manager/connector";

import type { DialogService } from "./dialogService.js";
import type { FileService } from "./fileService.js";
import type { Notifier } from "./notifier.js";
import type { ReferencePicker } from "./referencePicker.js";
import type { RowFormRequest } from "./models/rowFormRequest.js";
import type { RowTitleService } from "./rowTitleService.js";
import type { TableCatalog } from "./tableCatalog.js";

/**
 * A row in a dialog: a field per column as its value kind asks, a foreign key's columns grouped under one drop-down
 * that sets them all; every input problem shown at once; the plugin's refusal shown in the dialog, which stays open.
 */
export interface RowForm {
  /** The row as written; null: cancelled. */
  open(request: RowFormRequest): Promise<Row | null>;
}

export interface RowFormDeps {
  readonly rowService: RowService;
  readonly tableCatalog: TableCatalog;
  readonly rowTitleService: RowTitleService;
  readonly referencePicker: ReferencePicker;
  readonly fileService: FileService;
  readonly dialogService: DialogService;
  readonly notifier: Notifier;
}

export type RowFormFactory = (document: Document, deps: RowFormDeps) => RowForm;
