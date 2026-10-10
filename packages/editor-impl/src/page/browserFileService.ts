// FileService over the browser: the File System Access pickers where Chrome offers them, else <input type=file> and a download.

import type { FileService } from "@db-manager/editor";
import type { FileServiceFactory } from "@db-manager/editor";
import type { PickedFile } from "@db-manager/editor";

/** The part of Chrome's File System Access the service uses; other browsers lack it. */
interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: { suggestedName: string }) => Promise<{ createWritable(): Promise<{ write(data: BufferSource): Promise<void>; close(): Promise<void> }> }>;
}

const ABORT_ERROR = "AbortError";
const DOWNLOAD_URL_LIFETIME_MS = 60_000;

export const buildBrowserFileService: FileServiceFactory = (document) => new BrowserFileService(document);

class BrowserFileService implements FileService {
  constructor(private readonly document: Document) {}

  pickFile(accept: string): Promise<PickedFile | null> {
    return new Promise((resolve) => {
      const input = this.document.createElement("input");
      input.type = "file";
      if (accept !== "*") input.accept = accept;
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (file === undefined) {
          resolve(null);
          return;
        }
        file.arrayBuffer().then((buffer) => resolve({ name: file.name, bytes: new Uint8Array(buffer) }), () => resolve(null));
      });
      input.addEventListener("cancel", () => resolve(null));
      input.click();
    });
  }

  async saveFile(suggestedName: string, bytes: Uint8Array): Promise<boolean> {
    const view = this.document.defaultView as (Window & SaveFilePickerWindow) | null;
    if (view?.showSaveFilePicker !== undefined) {
      try {
        const handle = await view.showSaveFilePicker({ suggestedName });
        const writable = await handle.createWritable();
        await writable.write(new Uint8Array(bytes));
        await writable.close();
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === ABORT_ERROR) return false;
        throw error;
      }
    }
    this.download(suggestedName, bytes);
    return true;
  }

  private download(suggestedName: string, bytes: Uint8Array): void {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }));
    const link = this.document.createElement("a");
    link.href = url;
    link.download = suggestedName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
  }
}
