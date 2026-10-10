// ClipboardService over navigator.clipboard; its refusals become ClipboardErrors.

import type { ClipboardError } from "@db-manager/editor";
import type { ClipboardService } from "@db-manager/editor";
import type { ClipboardServiceFactory } from "@db-manager/editor";

export const buildNavigatorClipboardService: ClipboardServiceFactory = (navigator) => new NavigatorClipboardService(navigator);

class NavigatorClipboardService implements ClipboardService {
  constructor(private readonly navigator: Navigator) {}

  async writeText(text: string): Promise<void> {
    try {
      await this.navigator.clipboard.writeText(text);
    } catch (error) {
      throw clipboardRefusal(error);
    }
  }

  async readText(): Promise<string> {
    try {
      return await this.navigator.clipboard.readText();
    } catch (error) {
      throw clipboardRefusal(error);
    }
  }
}

const clipboardRefusal = (error: unknown): ClipboardError => {
  const isDenied = error instanceof DOMException && error.name === "NotAllowedError";
  return {
    kind: isDenied ? "denied" : "unavailable",
    message: isDenied ? "The browser did not let the page reach the clipboard" : "The clipboard holds no text the page can read",
    cause: error,
  };
};
