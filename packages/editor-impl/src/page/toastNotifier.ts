// Notifier as toasts at the bottom of the page, each gone after a while; an error stays longer.

import type { Notifier } from "@db-manager/editor";
import type { NotifierFactory } from "@db-manager/editor";

import { createElement } from "../utils/dom.js";

const INFO_DURATION_MS = 3500;
const ERROR_DURATION_MS = 8000;
const MAX_TOASTS = 4;

export const buildToastNotifier: NotifierFactory = (document) => new ToastNotifier(document);

class ToastNotifier implements Notifier {
  private container: HTMLElement | null = null;

  constructor(private readonly document: Document) {}

  showInfo(message: string): void {
    this.show(message, "dm-toast", INFO_DURATION_MS);
  }

  showError(message: string): void {
    this.show(message, "dm-toast dm-error", ERROR_DURATION_MS);
  }

  private show(message: string, className: string, durationMs: number): void {
    const container = this.obtainContainer();
    const toast = createElement(this.document, "div", className, message);
    toast.setAttribute("role", className.includes("dm-error") ? "alert" : "status");
    toast.addEventListener("click", () => toast.remove());
    container.append(toast);
    while (container.childElementCount > MAX_TOASTS) container.firstElementChild?.remove();
    setTimeout(() => toast.remove(), durationMs);
  }

  private obtainContainer(): HTMLElement {
    if (this.container === null || !this.container.isConnected) {
      this.container = createElement(this.document, "div", "dm-toasts");
      this.document.body.append(this.container);
    }
    return this.container;
  }
}
