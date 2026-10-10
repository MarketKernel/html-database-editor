/** One line of a context menu. */
export interface MenuItem {
  readonly caption: string;
  /** A shortcut shown beside it, "⌘C"; null: none. */
  readonly shortcut: string | null;
  readonly isEnabled: boolean;
  /** Drawn in the colour of what cannot be undone. */
  readonly isDangerous: boolean;
  /** Called once the menu has closed. */
  readonly choose: () => void;
}
