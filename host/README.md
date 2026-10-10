# @db-manager/host

The page's entry point, and the one package that binds the contracts to their implementations.

## API

None: it is built into the page (`npm run build`), not imported.

## Boundaries

- Knows which implementation stands behind which contract in `src/serviceFactory.ts` alone: the plugin list and the app.
- Starts the PWA's worker and its update button where the page carries `<meta name="service-worker">` (`src/pwaUpdates.ts`).
- Holds the page template with its CSP, the icon, the PWA's `sw.js` and manifest, and the arch test.

## Dependencies

The contract packages it uses and the `-impl` packages it binds; nothing else at runtime.

## Visibility

Private: never published.
