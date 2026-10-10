import type { MenuItem } from "./models/menuItem.js";
import type { ViewportPoint } from "./models/viewportPoint.js";

/** The one menu open at a time, at a point of the viewport; closed by a choice, a click elsewhere or Escape. */
export interface ContextMenu {
  open(point: ViewportPoint, items: readonly MenuItem[]): void;
  close(): void;
}

export type ContextMenuFactory = (document: Document) => ContextMenu;
