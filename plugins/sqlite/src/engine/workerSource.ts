// The worker's script as text, so the page can start it from a blob: URL and fetch nothing.
// build.mjs replaces this module with the bundle of ./workerMain.js; compiled alone (the tests), there is none.

export const WORKER_SOURCE: string | null = null;
