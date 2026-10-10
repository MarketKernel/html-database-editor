# @db-manager/connector

The contract of a connector plugin: what the editor knows of any DBMS — the plugin's descriptor, its own storage of databases, an open database's schema and rows.

## API

```ts
import type { ConnectorPlugin } from "@db-manager/connector";

const connection = await plugin.connect({ database: "shop" });
const tables = await connection.schemaService.selectTables();
const page = await connection.rowService.getRowPage(tables[0].name, { offset: 0, rowCount: 50, sortings: [], conditions: [] });
```

Every refusal is a plain object `{ kind, message, … }`: `ConnectionError`, `StorageError`, `SchemaError`, `RowError`.

## Boundaries

- Types only: no runtime, no tests.
- Knows no DBMS. Everything particular to one — dialect, engine, storage, browser support — is its plugin's; what a plugin cannot do it refuses `"not-supported"` with a message for the user.
- The model is the common ground of relational DBMSs: tables and views, columns, a primary key, unique constraints apart from indexes, foreign keys over one column or several, checks.

## Dependencies

None.

## Visibility

Private: never published.
