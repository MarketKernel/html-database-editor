// Small builders of DOM nodes: every text goes in as textContent, never as HTML.

export const createElement = <K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className = "", text: string | null = null): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className !== "") element.className = className;
  if (text !== null) element.textContent = text;
  return element;
};

export const createButton = (document: Document, caption: string, className: string, onClick: (event: MouseEvent) => void): HTMLButtonElement => {
  const button = createElement(document, "button", className, caption);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
};

/** An icon-only button: the caption is its tooltip and its accessible name. */
export const createIconButton = (document: Document, icon: string, caption: string, onClick: (event: MouseEvent) => void): HTMLButtonElement => {
  const button = createButton(document, icon, "dm-icon-button", onClick);
  button.title = caption;
  button.setAttribute("aria-label", caption);
  return button;
};

export const createTextInput = (document: Document, value: string, placeholder = ""): HTMLInputElement => {
  const input = createElement(document, "input", "dm-input");
  input.type = "text";
  input.value = value;
  input.placeholder = placeholder;
  input.spellcheck = false;
  input.autocomplete = "off";
  return input;
};

export const createCheckbox = (document: Document, isChecked: boolean, caption: string): { label: HTMLLabelElement; input: HTMLInputElement } => {
  const label = createElement(document, "label", "dm-check");
  const input = createElement(document, "input");
  input.type = "checkbox";
  input.checked = isChecked;
  label.append(input, document.createTextNode(caption));
  return { label, input };
};

export const createSelect = (document: Document, options: readonly (readonly [value: string, caption: string])[], value: string): HTMLSelectElement => {
  const select = createElement(document, "select", "dm-select");
  for (const [optionValue, caption] of options) {
    const option = createElement(document, "option", "", caption);
    option.value = optionValue;
    select.append(option);
  }
  select.value = value;
  return select;
};

/** A label above its control, and a line for the control's problem. */
export const createField = (document: Document, caption: string, control: HTMLElement): { field: HTMLElement; problem: HTMLElement } => {
  const field = createElement(document, "label", "dm-field");
  const problem = createElement(document, "div", "dm-field-problem");
  field.append(createElement(document, "span", "dm-field-caption", caption), control, problem);
  return { field, problem };
};

/** Whether the platform's shortcuts use ⌘ rather than Ctrl. */
export const isMacPlatform = (navigator: Navigator): boolean => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The shortcut key pressed: ⌘ on a Mac, Ctrl elsewhere. */
export const isCommandKey = (event: KeyboardEvent, navigator: Navigator): boolean => (isMacPlatform(navigator) ? event.metaKey : event.ctrlKey);

export const formatShortcut = (navigator: Navigator, key: string): string => (isMacPlatform(navigator) ? `⌘${key}` : `Ctrl+${key}`);
