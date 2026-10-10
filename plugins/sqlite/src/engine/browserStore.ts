// What the plugin keeps in the browser's IndexedDB: the bytes of the databases stored there where OPFS is not given,
// and the handles of the user's files it opens in place. Read by the worker and, for the handles, by the page.
// why: a unit the worker's files and the page's plugin hold, kept in this -impl without a contract: a deviation recorded in ARCHITECTURE.md.

/** The IndexedDB database of the plugin and its stores; another name would hide what is kept so far. */
const DATABASE_NAME = "db-manager-sqlite";
const DATABASE_VERSION = 1;
const DATABASES_STORE = "databases";
const LINKS_STORE = "links";

export interface BrowserStore {
  selectDatabaseNames(): Promise<readonly string[]>;
  /** null: no database of that name. */
  findDatabaseBytes(name: string): Promise<Uint8Array | null>;
  saveDatabaseBytes(name: string, bytes: Uint8Array): Promise<void>;
  deleteDatabaseBytes(name: string): Promise<void>;
  selectLinkNames(): Promise<readonly string[]>;
  /** null: no link of that name. */
  findLink(name: string): Promise<FileSystemFileHandle | null>;
  saveLink(name: string, handle: FileSystemFileHandle): Promise<void>;
  deleteLink(name: string): Promise<void>;
}

export const openBrowserStore = async (indexedDb: IDBFactory): Promise<BrowserStore> => {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DATABASES_STORE);
      request.result.createObjectStore(LINKS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const read = <T>(store: string, call: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const request = call(database.transaction(store, "readonly").objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const write = (store: string, call: (objectStore: IDBObjectStore) => void): Promise<void> =>
    new Promise((resolve, reject) => {
      const transaction = database.transaction(store, "readwrite");
      call(transaction.objectStore(store));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  return {
    selectDatabaseNames: async () => (await read(DATABASES_STORE, (store) => store.getAllKeys())).map(String),
    findDatabaseBytes: async (name) => ((await read(DATABASES_STORE, (store) => store.get(name))) as Uint8Array | undefined) ?? null,
    saveDatabaseBytes: (name, bytes) => write(DATABASES_STORE, (store) => store.put(bytes, name)),
    deleteDatabaseBytes: (name) => write(DATABASES_STORE, (store) => store.delete(name)),
    selectLinkNames: async () => (await read(LINKS_STORE, (store) => store.getAllKeys())).map(String),
    findLink: async (name) => ((await read(LINKS_STORE, (store) => store.get(name))) as FileSystemFileHandle | undefined) ?? null,
    saveLink: (name, handle) => write(LINKS_STORE, (store) => store.put(handle, name)),
    deleteLink: (name) => write(LINKS_STORE, (store) => store.delete(name)),
  };
};
