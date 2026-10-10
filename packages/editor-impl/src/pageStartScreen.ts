// StartScreen: the plugins as tabs, then the chosen plugin's form: a list of its stored databases with their actions,
// a file dropped on it imported; or its text fields and "Open". The plugin's refusals are shown as it words them.

import type { ConnectionField } from "@db-manager/connector";
import type { ConnectorPlugin } from "@db-manager/connector";
import type { DatabaseEntry } from "@db-manager/connector";
import type { ConnectionObserver } from "@db-manager/editor";
import type { MenuItem } from "@db-manager/editor";
import type { PickedFile } from "@db-manager/editor";
import type { StartScreen } from "@db-manager/editor";
import type { StartScreenDeps } from "@db-manager/editor";
import type { StartScreenFactory } from "@db-manager/editor";

import { formatByteCount } from "./utils/cellText.js";
import { createButton, createElement, createField, createIconButton, createTextInput } from "./utils/dom.js";
import { describeFailure } from "./utils/refusal.js";

const DATABASE_FILE_TYPES = ".sqlite,.sqlite3,.db,.db3";
const FILE_EXTENSION = /\.(sqlite3?|db3?)$/i;

export const buildPageStartScreen: StartScreenFactory = (document, deps, observer) => new PageStartScreen(document, deps, observer);

class PageStartScreen implements StartScreen {
  readonly element: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly form: HTMLElement;
  private readonly refusal: HTMLElement;
  private plugin: ConnectorPlugin;

  constructor(
    private readonly document: Document,
    private readonly deps: StartScreenDeps,
    private readonly observer: ConnectionObserver,
  ) {
    const lastPluginId = deps.settingsStore.load().lastConnection?.pluginId;
    const firstPlugin = deps.plugins[0];
    if (firstPlugin === undefined) throw new Error("db-manager needs one plugin at least");
    this.plugin = deps.plugins.find((plugin) => plugin.descriptor.id === lastPluginId) ?? firstPlugin;
    this.element = createElement(document, "main", "dm-start");
    const card = createElement(document, "div", "dm-start-card");
    const head = createElement(document, "div", "dm-start-head");
    head.append(createElement(document, "div", "dm-logo", "db"), createElement(document, "h1", "", "db-manager"));
    this.tabs = createElement(document, "div", "dm-plugin-tabs");
    this.refusal = createElement(document, "div", "dm-refusal");
    this.refusal.hidden = true;
    this.form = createElement(document, "div");
    card.append(head, this.tabs, this.refusal, this.form, createElement(document, "div", "dm-version", `db-manager ${deps.version}`));
    this.element.append(card);
    this.renderTabs();
  }

  async refresh(): Promise<void> {
    this.renderTabs();
    const storedField = this.plugin.descriptor.connectionFields.find((field) => field.kind === "stored-database");
    if (storedField !== undefined) await this.renderStoredDatabases(storedField);
    else this.renderFields();
  }

  showConnectionRefusal(message: string): void {
    this.refusal.textContent = message;
    this.refusal.hidden = false;
  }

  private renderTabs(): void {
    if (this.deps.plugins.length < 2) {
      this.tabs.replaceChildren();
      return;
    }
    this.tabs.replaceChildren(
      ...this.deps.plugins.map((plugin) => {
        const isChosen = plugin === this.plugin;
        return createButton(this.document, plugin.descriptor.caption, `dm-button${isChosen ? " dm-primary" : ""}`, () => {
          this.plugin = plugin;
          this.refusal.hidden = true;
          void this.refresh();
        });
      }),
    );
  }

  private async renderStoredDatabases(field: ConnectionField): Promise<void> {
    const descriptor = this.plugin.descriptor;
    const panel = createElement(this.document, "section", "dm-panel");
    const head = createElement(this.document, "div", "dm-panel-head");
    const title = createElement(this.document, "div");
    title.append(createElement(this.document, "h2", "", `${descriptor.caption} databases`), createElement(this.document, "div", "dm-muted", descriptor.description));
    title.style.flex = "1 1 100%";
    const actions = createElement(this.document, "div", "dm-design-line");
    actions.append(
      createButton(this.document, "New database…", "dm-button dm-primary", () => void this.createDatabase(null)),
      createButton(this.document, "Open file…", "dm-button", () => void this.openFile(field)),
      createButton(this.document, "New file…", "dm-button", () => void this.createFile(field, null)),
      ...(descriptor.databaseTemplates.length > 0
        ? [
            createButton(this.document, "From a template ▾", "dm-button", (event) => {
              const items: MenuItem[] = descriptor.databaseTemplates.flatMap((template) => [
                { caption: `${template.caption} — in the browser`, shortcut: null, isEnabled: true, isDangerous: false, choose: () => void this.createDatabase(template.id) },
                { caption: `${template.caption} — as a file…`, shortcut: null, isEnabled: true, isDangerous: false, choose: () => void this.createFile(field, template.id) },
              ]);
              this.deps.contextMenu.open({ x: event.clientX, y: event.clientY }, items);
            }),
          ]
        : []),
      createButton(this.document, "Import a copy…", "dm-button", () => void this.pickAndImport()),
    );
    head.append(title, actions);
    const list = createElement(this.document, "ul", "dm-db-list");
    list.append(createElement(this.document, "li", "dm-empty", "Reading the databases…"));
    panel.append(head, list);
    this.acceptDroppedFiles(panel);
    this.form.replaceChildren(panel);
    try {
      const databases = await this.plugin.storage.selectDatabases();
      list.replaceChildren(
        ...(databases.length === 0
          ? [createElement(this.document, "li", "dm-empty", "No databases yet: create one, open a file of yours, start from a template, or import a copy (or drop a file here)")]
          : databases.map((entry) => this.createDatabaseItem(entry, field))),
      );
      list.querySelector<HTMLElement>(".dm-db-item")?.focus({ preventScroll: true });
    } catch (error) {
      list.replaceChildren(createElement(this.document, "li", "dm-refusal", describeFailure(error, console)));
      actions.querySelectorAll("button").forEach((button) => (button.disabled = true));
    }
  }

  private createDatabaseItem(entry: DatabaseEntry, field: ConnectionField): HTMLElement {
    const item = createElement(this.document, "li", "dm-db-item");
    item.tabIndex = 0;
    item.dataset["database"] = entry.name;
    const names = createElement(this.document, "span", "dm-db-name");
    names.append(createElement(this.document, "span", "", entry.name), createElement(this.document, "span", "dm-db-location", entry.locationCaption));
    item.append(createElement(this.document, "span", "dm-db-icon", entry.kind === "linked-file" ? "📄" : "🗄"), names);
    if (entry.sizeBytes !== null) item.append(createElement(this.document, "span", "dm-muted", formatByteCount(entry.sizeBytes)));
    const open = (): void => void this.open({ [field.name]: entry.name });
    const menu = (point: { x: number; y: number }): void => this.deps.contextMenu.open(point, this.databaseMenu(entry, open));
    item.append(
      createIconButton(this.document, "⋯", "More", (event) => {
        event.stopPropagation();
        menu({ x: event.clientX, y: event.clientY });
      }),
    );
    item.addEventListener("click", open);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter") open();
      if (event.key === "ArrowDown") (item.nextElementSibling as HTMLElement | null)?.focus();
      if (event.key === "ArrowUp") (item.previousElementSibling as HTMLElement | null)?.focus();
    });
    item.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      menu({ x: event.clientX, y: event.clientY });
    });
    return item;
  }

  private databaseMenu(entry: DatabaseEntry, open: () => void): readonly MenuItem[] {
    const item = (caption: string, choose: () => void, isDangerous = false): MenuItem => ({ caption, shortcut: null, isEnabled: true, isDangerous, choose });
    if (entry.kind === "linked-file") {
      return [item("Open", open), item("Save a copy…", () => void this.exportDatabase(entry.name)), item("Remove from the list…", () => void this.deleteDatabase(entry), true)];
    }
    return [
      item("Open", open),
      item("Export to a file…", () => void this.exportDatabase(entry.name)),
      item("Rename…", () => void this.renameDatabase(entry.name)),
      item("Delete…", () => void this.deleteDatabase(entry), true),
    ];
  }

  private renderFields(): void {
    const panel = createElement(this.document, "section", "dm-panel");
    const head = createElement(this.document, "div", "dm-panel-head");
    head.append(createElement(this.document, "h2", "", this.plugin.descriptor.caption));
    const fields = createElement(this.document, "div", "dm-form-fields");
    const inputs = this.plugin.descriptor.connectionFields.map((field) => {
      const input = createTextInput(this.document, field.kind === "password" ? "" : (this.deps.settingsStore.load().lastConnection?.parameters[field.name] ?? ""));
      if (field.kind === "password") input.type = "password";
      fields.append(createField(this.document, field.caption, input).field);
      return [field.name, input] as const;
    });
    const open = createButton(this.document, "Open", "dm-button dm-primary", () => void this.open(Object.fromEntries(inputs.map(([name, input]) => [name, input.value]))));
    open.style.alignSelf = "flex-start";
    fields.append(open);
    panel.append(head, fields);
    this.form.replaceChildren(panel);
  }

  private async open(parameters: Readonly<Record<string, string>>): Promise<void> {
    this.refusal.hidden = true;
    try {
      await this.observer.openConnection(this.plugin, parameters);
    } catch (error) {
      this.showConnectionRefusal(describeFailure(error, console));
    }
  }

  private async createDatabase(templateId: string | null): Promise<void> {
    const template = this.plugin.descriptor.databaseTemplates.find((candidate) => candidate.id === templateId);
    const name = await this.deps.dialogService.prompt(template === undefined ? "New database" : `New database: ${template.caption}`, "Name", template === undefined ? "my-database" : templateId ?? "");
    if (name === null) return;
    await this.attempt(async () => {
      await this.plugin.storage.createDatabase(name, templateId);
      this.deps.notifier.showInfo(`"${name}" created`);
    });
  }

  private async pickAndImport(): Promise<void> {
    const file = await this.deps.fileService.pickFile(DATABASE_FILE_TYPES);
    if (file !== null) await this.importFile(file);
  }

  private async importFile(file: PickedFile): Promise<void> {
    const name = await this.deps.dialogService.prompt("Import a database", "Name", file.name.replace(FILE_EXTENSION, ""));
    if (name === null) return;
    await this.attempt(async () => {
      await this.plugin.storage.importDatabase(name, file.bytes);
      this.deps.notifier.showInfo(`"${name}" imported`);
    });
  }

  private async exportDatabase(name: string): Promise<void> {
    try {
      const bytes = await this.plugin.storage.exportDatabase(name);
      if (await this.deps.fileService.saveFile(`${name}.sqlite`, bytes)) this.deps.notifier.showInfo(`"${name}" exported`);
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
    }
  }

  private async renameDatabase(name: string): Promise<void> {
    const newName = await this.deps.dialogService.prompt(`Rename "${name}"`, "New name", name);
    if (newName === null || newName === name) return;
    await this.attempt(() => this.plugin.storage.renameDatabase(name, newName));
  }

  private async deleteDatabase(entry: DatabaseEntry): Promise<void> {
    const isLink = entry.kind === "linked-file";
    const isConfirmed = isLink
      ? await this.deps.dialogService.confirm(`Remove "${entry.name}" from the list?`, `The file stays where it is (${entry.locationCaption}); open it again with "Open file…".`, "Remove", false)
      : await this.deps.dialogService.confirm(`Delete "${entry.name}"?`, "The database is deleted from this browser for good. Export it first to keep a copy.", "Delete", true);
    if (!isConfirmed) return;
    await this.attempt(async () => {
      await this.plugin.storage.deleteDatabase(entry.name);
      this.deps.notifier.showInfo(isLink ? `"${entry.name}" removed from the list` : `"${entry.name}" deleted`);
    });
  }

  // The plugin shows the browser's picker: the call must come straight from the click, before any await.
  private async openFile(field: ConnectionField): Promise<void> {
    await this.attemptAndOpen(this.plugin.storage.openFile(), field);
  }

  private async createFile(field: ConnectionField, templateId: string | null): Promise<void> {
    await this.attemptAndOpen(this.plugin.storage.createFile(templateId), field);
  }

  /** Opens the database the picker gave, if any; a refusal is shown and the list read again. */
  private async attemptAndOpen(picking: Promise<DatabaseEntry | null>, field: ConnectionField): Promise<void> {
    let entry: DatabaseEntry | null = null;
    try {
      entry = await picking;
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
    }
    if (entry === null) {
      await this.refresh();
      return;
    }
    await this.open({ [field.name]: entry.name });
  }

  private async attempt(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.deps.notifier.showError(describeFailure(error, console));
    }
    await this.refresh();
  }

  /** A file dropped on the panel is imported; its handles are read before any await, as the drop's data is gone after. */
  private acceptDroppedFiles(panel: HTMLElement): void {
    panel.addEventListener("dragover", (event) => {
      if (event.dataTransfer?.types.includes("Files") !== true) return;
      event.preventDefault();
      panel.classList.add("dm-drop-hint");
    });
    panel.addEventListener("dragleave", () => panel.classList.remove("dm-drop-hint"));
    panel.addEventListener("drop", (event) => {
      event.preventDefault();
      panel.classList.remove("dm-drop-hint");
      const file = event.dataTransfer?.files[0];
      if (file === undefined) return;
      void file.arrayBuffer().then((buffer) => this.importFile({ name: file.name, bytes: new Uint8Array(buffer) }));
    });
  }
}
