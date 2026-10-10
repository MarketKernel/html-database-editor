// DialogService on <dialog> elements shown modal: Enter accepts, Escape cancels.

import type { DialogService } from "@db-manager/editor";
import type { DialogServiceFactory } from "@db-manager/editor";

import { createButton, createElement, createTextInput } from "../utils/dom.js";
import { openModalDialog } from "../utils/modalDialog.js";

export const buildModalDialogService: DialogServiceFactory = (document) => new ModalDialogService(document);

class ModalDialogService implements DialogService {
  constructor(private readonly document: Document) {}

  confirm(title: string, message: string, actionCaption: string, isDangerous: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = openModalDialog(this.document, title, () => resolve(false));
      modal.content.append(createElement(this.document, "div", "", message));
      const action = createButton(this.document, actionCaption, `dm-button dm-primary${isDangerous ? " dm-danger" : ""}`, () => {
        modal.close();
        resolve(true);
      });
      modal.foot.append(createButton(this.document, "Cancel", "dm-button", () => modal.cancel()), action);
      action.focus();
    });
  }

  prompt(title: string, label: string, initialValue: string): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = openModalDialog(this.document, title, () => resolve(null));
      const input = createTextInput(this.document, initialValue);
      const accept = (): void => {
        modal.close();
        resolve(input.value);
      };
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") accept();
      });
      const field = createElement(this.document, "label", "dm-field");
      field.append(createElement(this.document, "span", "dm-field-caption", label), input);
      modal.content.append(field);
      modal.foot.append(createButton(this.document, "Cancel", "dm-button", () => modal.cancel()), createButton(this.document, "OK", "dm-button dm-primary", accept));
      input.focus();
      input.select();
    });
  }

  showText(title: string, text: string): Promise<void> {
    return new Promise((resolve) => {
      const modal = openModalDialog(this.document, title, () => resolve(), true);
      modal.content.append(createElement(this.document, "pre", "dm-code", text));
      const close = createButton(this.document, "Close", "dm-button dm-primary", () => modal.cancel());
      const copy = createButton(this.document, "Copy", "dm-button", () => {
        void this.document.defaultView?.navigator.clipboard?.writeText(text);
      });
      modal.foot.append(copy, close);
      close.focus();
    });
  }
}
