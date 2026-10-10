// The page's entry point: the plugins and the app built through serviceFactory.ts, mounted on #app.

import { startPwaUpdates } from "./pwaUpdates.js";
import { buildConnectorPlugins, buildDbManagerApp } from "./serviceFactory.js";

/** localStorage, or null where the browser refuses it: a private window, blocked site data. */
const findStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    // Without storage the settings live for this visit only.
    return null;
  }
};

const main = (): void => {
  const container = document.getElementById("app");
  if (container === null) throw new Error("The page has no #app");
  buildDbManagerApp(document, { plugins: buildConnectorPlugins(), storage: findStorage(), version: __APP_VERSION__ }).mount(container);
  startPwaUpdates(window);
};

main();
