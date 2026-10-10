// A modal <dialog> with a title, a content area and a foot for buttons; removed from the page once closed.

import { createElement, createIconButton } from "./dom.js";

export interface ModalDialog {
  readonly dialog: HTMLDialogElement;
  readonly content: HTMLElement;
  readonly foot: HTMLElement;
  /** Closes without telling onCancel: the caller has its answer. */
  close(): void;
  /** Closes and tells onCancel, as Escape and the ✕ do. */
  cancel(): void;
}

export const openModalDialog = (document: Document, title: string, onCancel: () => void, isWide = false): ModalDialog => {
  const dialog = createElement(document, "dialog", `dm-dialog${isWide ? " dm-wide" : ""}`);
  const body = createElement(document, "div", "dm-dialog-body");
  const head = createElement(document, "div", "dm-dialog-head");
  const content = createElement(document, "div", "dm-dialog-content");
  const foot = createElement(document, "div", "dm-dialog-foot");
  let isOpen = true;
  const close = (): void => {
    if (!isOpen) return;
    isOpen = false;
    dialog.close();
    dialog.remove();
  };
  const cancel = (): void => {
    if (!isOpen) return;
    close();
    onCancel();
  };
  head.append(createElement(document, "h2", "", title), createIconButton(document, "✕", "Close", cancel));
  body.append(head, content, foot);
  dialog.append(body);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    cancel();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, content, foot, close, cancel };
};
