// The page's colours: data-theme on <html>, "system" resolved by the operating system's preference.

import type { ColorScheme } from "@db-manager/editor";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export const applyColorScheme = (document: Document, scheme: ColorScheme): void => {
  const isDark = scheme === "dark" || (scheme === "system" && (document.defaultView?.matchMedia(DARK_QUERY).matches ?? false));
  document.documentElement.dataset["theme"] = isDark ? "dark" : "light";
};

/** Calls back whenever the operating system switches between light and dark. */
export const watchSystemScheme = (document: Document, onChange: () => void): void => {
  document.defaultView?.matchMedia(DARK_QUERY).addEventListener("change", onChange);
};
