/** The system clipboard as text: rows go there as tab-separated lines. */
export interface ClipboardService {
  /** Rejects with a ClipboardError. */
  writeText(text: string): Promise<void>;
  /** Rejects with a ClipboardError. */
  readText(): Promise<string>;
}

export type ClipboardServiceFactory = (navigator: Navigator) => ClipboardService;
