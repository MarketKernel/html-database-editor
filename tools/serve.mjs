/**
 * Serves the build on localhost: SQLite's databases live in the browser's private file system, which Chrome gives
 * no page opened from the disk. "/" is the PWA (build/pages/), "/db-manager.html" the single file.
 * PORT=8080 node tools/serve.mjs; port 0 (the default) picks a free one.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const buildDir = join(fileURLToPath(new URL('..', import.meta.url)), 'build');
const pagesDir = join(buildDir, 'pages');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

const resolveFile = (path) => {
  if (path === '/db-manager.html') return join(buildDir, 'db-manager.html');
  const file = normalize(join(pagesDir, path === '/' ? 'index.html' : path));
  return file.startsWith(pagesDir + sep) ? file : null;
};

const server = createServer(async (request, response) => {
  const file = resolveFile(decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname));
  if (file === null) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }).end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
  const address = server.address();
  console.log(`db-manager: http://localhost:${typeof address === 'object' && address !== null ? address.port : ''}/`);
});
