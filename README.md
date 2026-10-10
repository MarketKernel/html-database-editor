# db-manager

An editor of a database's schema and data in one self-contained HTML file. Each DBMS is a plugin; the first one is SQLite — the official SQLite WebAssembly build: databases kept in the browser (OPFS, or IndexedDB on a page opened from the disk), or `.sqlite` files of yours opened and written in place.

- Tables on the left, the chosen table's rows on the right. When other tables refer to it, the right pane splits, and below it a tab per foreign key shows the rows referring to the chosen row — foreign keys of one column or several.
- A reference is a drop-down in its cell and in the row form: the target row's title, and a list to pick another. A foreign key of several columns gets a column of its own and sets all of them at once.
- Tables are created **and changed**: columns, a composite primary key, unique column sets, foreign keys, checks, indexes, the plugin's table options; the plan is shown as SQL before it runs.
- Nothing leaves the page: no network request, no server, no account.

## Run it

Open `build/db-manager.html` in Chrome — double-click it, nothing else is needed. Or serve it: `npm start` (`http://localhost:…/`), or put `build/pages/` on a static https host, where it installs as an app and works offline.

Where the databases go depends on how the page is opened; the plugin picks by itself:

| Opened | Databases "in the browser" | Your files on the disk |
|---|---|---|
| `file://` (the file double-clicked) | IndexedDB: Chrome gives such a page no OPFS | yes |
| `http://localhost`, `https://…` | OPFS, SQLite's own file system in the browser | yes |

Chrome (desktop or Android), current version. Other browsers: the SQLite plugin says it cannot run there.

## Use

- **Start screen**: create a database in the browser, or **open a `.sqlite`/`.db` file of yours** ("Open file…") or **create a new one on the disk** ("New file…"): such a file is edited in place, every change written back to it, and stays in the list ("Remove from the list" forgets it, the file stays). Start from the demo shop (composite keys, a self-reference, a view) in the browser or as a file; import a copy of a file into the browser (button, or drop it on the list); export, rename, delete. The database opened last opens again on the next visit; a file asks Chrome's leave to be edited again after a restart — click it.
- **Rows**: click to choose, Shift/⌘ (Ctrl) to select more; double-click a cell to edit it in place, Enter for the row form; Delete, ⌘C / ⌘V copy and paste rows as tab-separated lines (spreadsheets read them); a right click for the row's menu: filter by a value, open a referenced row, set NULL.
- **Filter and sort**: the header sorts; "Filter" adds conditions (=, ≠, contains, <, >, is NULL…), shown as chips.
- **Schema**: "Edit schema" on a table, ＋ in the list for a new one; "Show SQL" previews the plan. Changes SQLite's `ALTER TABLE` cannot make rebuild the table as SQLite's documentation lays out, keeping its rows, indexes, triggers and views; what the plugin cannot carry over it refuses rather than loses.
- **Names of rows**: a reference shows its target row by a column that names it — a guess (`name`, `title`…), or the one chosen with "⋯ → Name rows by…", kept in this browser.
- On a phone: one pane at a time, "‹" back to the tables.

## Security

- Content-Security-Policy in the page: `default-src 'none'`, `connect-src 'none'`; scripts and styles inline, WebAssembly compiled from bytes in the page (`'wasm-unsafe-eval'`), SQLite's worker started from a `blob:` URL. The build fails on any external reference.
- Values and names are always set as text, never as HTML.
- Settings (theme, page size, pane sizes, the last database, the title columns) are in `localStorage`; nothing of the editor is written into a database.

## Plugins

A plugin is a package in `plugins/` implementing `ConnectorPlugin` of `@db-manager/connector`, bound in one line of `host/src/serviceFactory.ts`. Everything particular to its DBMS — dialect, engine, storage, browser support — is the plugin's: what it cannot do it refuses `"not-supported"` with a message for the user, and the editor shows it. The plugin describes what the editor draws as data: its connection fields, column types, table options, database templates.

## Build

Node 22+.

```sh
./build.sh            # npm ci when needed, tests, build
npm run check         # tsc → unit and arch tests → build → tests in Chrome (the page, the PWA)
npm start             # build and serve on localhost (build/db-manager.html also opens straight from the disk)
npm run shots         # screenshots of the screens into shots/
```

`build/db-manager.html` is the single file; `build/pages/` the same page with a manifest and a service worker.

## Layout

| Path | What |
|---|---|
| `packages/connector` | the contract of a plugin: storage, connection, `SchemaService`, `RowService`, models, errors |
| `plugins/sqlite` | the SQLite plugin: engine in a worker, OPFS pool, schema reading, ALTER/rebuild planning, rows |
| `packages/editor` | the contract of the screen: its parts and the flows between them |
| `packages/editor-impl` | the screen on the DOM: start screen, table list, grid, referencing panel, row form, picker, table designer |
| `host` | the entry point, `serviceFactory.ts` (the plugin list), the page template, the PWA's worker, the arch test |
| `tests/` | the page and the PWA in Chrome over the DevTools protocol |
| `tools/` | `chrome.mjs` (headless Chrome over a pipe), `serve.mjs` |

## Limitations

- SQLite runs in Chrome only.
- One tab at a time: OPFS's access handles are exclusive, and on `file://` a lock keeps a second tab from writing over the first; it is told the databases are open elsewhere.
- A file on the disk opens whatever its size: it is read page by page. Every change writes only the chunks it touched, but Chrome copies the whole file aside before it lets a page write it (about 2 s per GB): fine for the databases people edit by hand, slow to edit a file of gigabytes.
- A database in IndexedDB is held in memory while open and written back whole after every change: SQLite's memory ends at 2 GB.
- The databases kept "in the browser" under `file://` and under `http(s)://` are two different stores: Chrome keeps them per origin.
- A table holding what the plugin cannot write back (`ON CONFLICT` clauses, `INITIALLY DEFERRED` foreign keys, a descending `INTEGER PRIMARY KEY`, …) is changed by `ALTER TABLE` only; a change needing a rebuild is refused.
- English only.
