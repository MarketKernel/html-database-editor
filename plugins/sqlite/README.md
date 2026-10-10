# @db-manager/sqlite-connector-impl

The SQLite connector plugin: SQLite compiled to WebAssembly in a worker; its databases kept in the browser — OPFS, or IndexedDB where the page has no OPFS (opened from the disk) — or the user's own files opened in place; Chrome only.

## API

```ts
import { buildSqlitePlugin } from "@db-manager/sqlite-connector-impl";

const plugin = buildSqlitePlugin();
await plugin.storage.createDatabase("shop", "demo");
const connection = await plugin.connect({ database: "shop" });
```

## How it works

- `engine/workerMain.ts` runs in a worker: SQLite from the bytes of `sqlite3.wasm` bundled into it, `EngineHost` answering requests over `DatabaseFiles`: the `opfs-sahpool` VFS (no `SharedArrayBuffer`, so no cross-origin isolation) where OPFS is given, else IndexedDB under a Web Lock; beside them the linked files, their handles kept in IndexedDB. A database in IndexedDB is read into memory when opened and written back whole after every committed run. A linked file is read through `engine/linkedFileVfs.ts`, a VFS of the plugin's: page by page with `FileReaderSync`, as SQLite asks, so a file of any size opens; SQLite's writes are held in memory in chunks of 64 KB (`engine/pagedFile.ts`) and written into the file after every committed run, only the chunks touched, through one `createWritable` Chrome puts in place whole on close; the journal lives in memory. Requests are answered one at a time, so no read meets a file half written.
- `fileAccess.ts` on the page shows Chrome's pickers (straight from the click, before any await) and asks the leave to write a linked file when it is opened. `build.mjs` bundles it apart and puts its text where `engine/workerSource.ts` stands; the page starts it from a `blob:` URL.
- The plugin's main side holds the engine through `EngineClient` and runs statements in batches: `read`, `commit` or `rollback` (a dry run for previews). Every integer comes back as `bigint`.
- The schema is read from pragmas (`table_xinfo`, `foreign_key_list`, `index_list`/`index_xinfo`, `table_list`) and from the `CREATE TABLE` SQLite keeps (`schema/createTableParser.ts`): constraint names, checks, collations, generated columns. What the parser does not understand is listed as unsupported, and a rebuild refuses instead of losing it.
- A change is validated first, every violation at once (`schema/draftValidation.ts`), then planned (`schema/alterationPlanner.ts`): `ALTER TABLE` where it suffices, else a rebuild with foreign keys off, rows copied, indexes, triggers and views recreated, `foreign_key_check` at the end, all in one transaction.

## Boundaries

- Runs in Chrome only: elsewhere every call refuses `"not-supported"` with the reason.
- One page at a time: OPFS access handles are exclusive, the IndexedDB store is held under a Web Lock; another tab is refused `"database-busy"`.
- Writes nothing of its own into a database.

## Dependencies

- `@db-manager/connector` — the contract it implements.
- `@sqlite.org/sqlite-wasm` — the official SQLite WebAssembly build: the engine and the OPFS VFS; nothing else runs SQLite in a browser.

## Visibility

Private: never published.
