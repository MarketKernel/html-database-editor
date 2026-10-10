// The page's side of the user's files: the browser's pickers, the leave to write a file, the handles the worker linked.
// why: a unit the plugin's storage and connector hold, kept in this -impl without a contract: a deviation recorded in ARCHITECTURE.md.

import { openBrowserStore } from "./engine/browserStore.js";

/** The types the pickers offer: SQLite's files under their usual extensions. */
const DATABASE_FILE_TYPES = [{ description: "SQLite database", accept: { "application/vnd.sqlite3": [".sqlite", ".sqlite3", ".db", ".db3"] } }];
const ABORT_ERROR = "AbortError";

/** Chrome's File System Access, which TypeScript's DOM types leave out. */
interface PickerWindow {
  showOpenFilePicker?: (options: { types: typeof DATABASE_FILE_TYPES; multiple: false }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options: { types: typeof DATABASE_FILE_TYPES; suggestedName: string }) => Promise<FileSystemFileHandle>;
}

interface PermissionDescriptor {
  readonly mode: "readwrite";
}

interface PermissionedHandle {
  queryPermission(descriptor: PermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor: PermissionDescriptor): Promise<PermissionState>;
}

export interface FileAccess {
  /** Shows the open picker; call it before any await of a click's handler. null: cancelled. Rejects "not-supported" as an Error where there is no picker. */
  pickFileToOpen(): Promise<FileSystemFileHandle | null>;
  /** Shows the save picker, as pickFileToOpen does. */
  pickFileToSave(suggestedName: string): Promise<FileSystemFileHandle | null>;
  /** Whether the page may write the file; mayAsk: ask the user, which only a click allows. */
  obtainWriteAccess(handle: FileSystemFileHandle, mayAsk: boolean): Promise<boolean>;
  /** The file linked under the name; null: the name is a stored database's, or none. */
  findLinkedFile(name: string): Promise<FileSystemFileHandle | null>;
  /** Whether the browser offers the pickers at all. */
  readonly hasPickers: boolean;
}

export const buildBrowserFileAccess = (window: Window, indexedDb: IDBFactory): FileAccess => {
  const pickers = window as unknown as PickerWindow;
  return {
    hasPickers: pickers.showOpenFilePicker !== undefined && pickers.showSaveFilePicker !== undefined,
    pickFileToOpen: () => {
      const show = pickers.showOpenFilePicker;
      if (show === undefined) return Promise.resolve(null);
      return cancelledAsNull(show({ types: DATABASE_FILE_TYPES, multiple: false }).then((handles) => handles[0] ?? null));
    },
    pickFileToSave: (suggestedName) => {
      const show = pickers.showSaveFilePicker;
      if (show === undefined) return Promise.resolve(null);
      return cancelledAsNull(show({ types: DATABASE_FILE_TYPES, suggestedName }));
    },
    obtainWriteAccess: async (handle, mayAsk) => {
      const permissioned = handle as unknown as PermissionedHandle;
      if ((await permissioned.queryPermission({ mode: "readwrite" })) === "granted") return true;
      if (!mayAsk) return false;
      try {
        return (await permissioned.requestPermission({ mode: "readwrite" })) === "granted";
      } catch {
        // Asked outside a click: the browser refuses to ask; the user clicks the file to be asked.
        return false;
      }
    },
    findLinkedFile: async (name) => (await openBrowserStore(indexedDb)).findLink(name),
  };
};

const cancelledAsNull = <T>(picking: Promise<T>): Promise<T | null> =>
  picking.catch((error: unknown) => {
    if (error instanceof DOMException && error.name === ABORT_ERROR) return null;
    throw error;
  });
