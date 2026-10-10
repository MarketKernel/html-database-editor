# @db-manager/editor-impl

db-manager's screen built by hand on the page's DOM: the start screen, the database screen, and every part of `@db-manager/editor`.

## API

```ts
import { buildDbManagerApp } from "@db-manager/editor-impl";

buildDbManagerApp(document, { plugins, storage: localStorage, version }).mount(document.getElementById("app")!);
```

## Boundaries

- No framework: DOM by hand, every text set as `textContent`, never HTML.
- Knows no DBMS: everything goes through `@db-manager/connector`; a plugin's refusal is shown as the plugin words it.
- Keeps the settings in `localStorage`, the way each table was left in memory; nothing in the database.

## Dependencies

`@db-manager/connector`, `@db-manager/editor` — the contracts it implements and calls.

## Visibility

Private: never published.
