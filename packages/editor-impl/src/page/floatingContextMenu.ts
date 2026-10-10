// ContextMenu as a fixed box at the point, kept inside the viewport; arrows move between its items.

import type { ContextMenu } from "@db-manager/editor";
import type { ContextMenuFactory } from "@db-manager/editor";
import type { MenuItem } from "@db-manager/editor";
import type { ViewportPoint } from "@db-manager/editor";

import { createElement } from "../utils/dom.js";

const VIEWPORT_MARGIN_PX = 8;

export const buildFloatingContextMenu: ContextMenuFactory = (document) => new FloatingContextMenu(document);

class FloatingContextMenu implements ContextMenu {
  private menu: HTMLElement | null = null;
  private readonly closeOnOutsideClick = (event: Event): void => {
    if (this.menu !== null && !this.menu.contains(event.target as Node)) this.close();
  };
  private readonly closeOnKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.close();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") this.moveFocus(event.key === "ArrowDown" ? 1 : -1, event);
  };

  constructor(private readonly document: Document) {}

  open(point: ViewportPoint, items: readonly MenuItem[]): void {
    this.close();
    const menu = createElement(this.document, "div", "dm-menu");
    menu.setAttribute("role", "menu");
    for (const item of items) menu.append(this.createItem(item));
    this.document.body.append(menu);
    const view = this.document.defaultView;
    const width = view?.innerWidth ?? Number.MAX_SAFE_INTEGER;
    const height = view?.innerHeight ?? Number.MAX_SAFE_INTEGER;
    const box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(VIEWPORT_MARGIN_PX, Math.min(point.x, width - box.width - VIEWPORT_MARGIN_PX))}px`;
    menu.style.top = `${Math.max(VIEWPORT_MARGIN_PX, Math.min(point.y, height - box.height - VIEWPORT_MARGIN_PX))}px`;
    this.menu = menu;
    // The click that opened the menu is still on its way; listen from the next turn.
    setTimeout(() => {
      this.document.addEventListener("mousedown", this.closeOnOutsideClick, true);
      this.document.addEventListener("keydown", this.closeOnKey, true);
    });
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }

  close(): void {
    this.menu?.remove();
    this.menu = null;
    this.document.removeEventListener("mousedown", this.closeOnOutsideClick, true);
    this.document.removeEventListener("keydown", this.closeOnKey, true);
  }

  private createItem(item: MenuItem): HTMLButtonElement {
    const button = createElement(this.document, "button", `dm-menu-item${item.isDangerous ? " dm-danger" : ""}`);
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.disabled = !item.isEnabled;
    button.append(createElement(this.document, "span", "", item.caption));
    if (item.shortcut !== null) button.append(createElement(this.document, "span", "dm-menu-shortcut", item.shortcut));
    button.addEventListener("click", () => {
      this.close();
      item.choose();
    });
    return button;
  }

  private moveFocus(step: number, event: KeyboardEvent): void {
    if (this.menu === null) return;
    event.preventDefault();
    const buttons = [...this.menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const current = buttons.indexOf(this.document.activeElement as HTMLButtonElement);
    buttons[(current + step + buttons.length) % buttons.length]?.focus();
  }
}
