/** Why the clipboard refused: the browser denied it, or it holds no text. */
export type ClipboardErrorKind = "denied" | "unavailable";

export interface ClipboardError {
  readonly kind: ClipboardErrorKind;
  readonly message: string;
  readonly cause?: unknown;
}
