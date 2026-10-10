# @db-manager/editor

The contract of db-manager's screen: the start screen, the database screen, and every part they are made of, over any connector plugin.

## API

```ts
import type { DbManagerAppFactory } from "@db-manager/editor";

buildDbManagerApp(document, { plugins, storage: localStorage, version: "0.1.0" }).mount(document.getElementById("app"));
```

## Boundaries

- Types only. The parts and the flows between them are listed in `src/index.ts`.
- Knows no DBMS: it calls `@db-manager/connector` and shows the plugin's own refusals.
- Keeps nothing in a database: settings live in the page's storage, the way each table was left in memory.

## Dependencies

`@db-manager/connector` — the models the screen shows.

## Visibility

Private: never published.
