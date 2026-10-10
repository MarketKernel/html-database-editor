#!/usr/bin/env bash
# One command from a fresh clone to the build: dependencies, tests (the arch test among them), the bundle.
#
#   ./build.sh           dependencies, unit and arch tests, build/db-manager.html and build/pages/
#   ./build.sh --fast    the bundle alone, no tests
#   ./build.sh --check   everything, then the tests in Chrome (the page, the PWA)
#   ./build.sh --serve   the default, then serves the build on localhost (OPFS there; file:// keeps the databases in IndexedDB)
set -euo pipefail

cd "$(dirname "$0")"

REQUIRED_NODE_MAJOR=22

mode="${1:-default}"
case "$mode" in
  default | --fast | --check | --serve) ;;
  -h | --help)
    sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    echo "build.sh: unknown option $mode (see ./build.sh --help)" >&2
    exit 1
    ;;
esac

node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$node_major" -lt "$REQUIRED_NODE_MAJOR" ]; then
  echo "build.sh: Node.js $REQUIRED_NODE_MAJOR or newer is required (found: $(node -v 2>/dev/null || echo none))" >&2
  exit 1
fi

# A lock file newer than the installed tree means the dependencies changed since the last install.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  npm ci
fi

if [ "$mode" != "--fast" ]; then
  npm test
fi
npm run build

if [ "$mode" = "--check" ]; then
  npm run test:browser
fi

echo
echo "Built:"
echo "  build/db-manager.html   the single file: open it in Chrome straight from the disk, or serve it"
echo "  build/pages/            the same page as a PWA: put it on any static host"

if [ "$mode" = "--serve" ]; then
  node tools/serve.mjs
fi
