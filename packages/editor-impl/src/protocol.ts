// The names and choices the editor spells alike everywhere.

import type { PageRowCount } from "@db-manager/editor";

/** The localStorage key of the editor's settings. */
export const SETTINGS_KEY = "db-manager.settings";

export const PAGE_ROW_COUNTS: readonly PageRowCount[] = [25, 50, 100, 200, 500];

/** How many rows of a target table the reference picker lists at once. */
export const PICKER_PAGE_ROW_COUNT = 30;
