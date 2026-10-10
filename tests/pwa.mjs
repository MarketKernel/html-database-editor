/**
 * build/pages/ in a real Chrome: the service worker takes the page, the page opens with the server gone, and a new
 * version waits until the user presses "Update", which reloads the page under it.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, startChrome } from '../tools/chrome.mjs';

if (!CHROME) {
  console.log('SKIP: no Chrome (set CHROME=/path/to/chrome)');
  process.exit(0);
}

const pagesDir = fileURLToPath(new URL('../build/pages/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
let isOffline = false;
let workerPatch = null;
const server = createServer(async (request, response) => {
  if (isOffline) {
    request.socket.destroy();
    return;
  }
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = join(pagesDir, path === '/' ? 'index.html' : path);
  try {
    let body = await readFile(file, 'utf8');
    if (path === '/sw.js' && workerPatch !== null) body = workerPatch(body);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }).end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const chrome = await startChrome();
let passed = 0;
let failed = 0;
const check = (name, condition) => {
  if (condition) passed += 1;
  else failed += 1;
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}`);
};

try {
  const { targetId } = await chrome.send('Target.createTarget', { url });
  const session = await chrome.attach(targetId, 'pwa');
  await chrome.send('Page.enable', {}, session);
  const until = (expression, timeout = 15000) => chrome.until(session, expression, timeout);
  check('the start screen shows', await until(`document.querySelector('.dm-panel') !== null`));
  check('the service worker takes the page', await until(`navigator.serviceWorker.controller !== null`, 20000) || (await chrome.send('Page.reload', {}, session), await until(`navigator.serviceWorker.controller !== null`, 20000)));
  const manifest = await chrome.send('Page.getAppManifest', {}, session);
  check('the manifest is read without errors', manifest.errors.length === 0 && manifest.url.endsWith('manifest.webmanifest'));

  isOffline = true;
  await chrome.send('Page.reload', {}, session);
  check('the page opens with the server gone', await until(`document.querySelector('.dm-panel') !== null && navigator.serviceWorker.controller !== null`));
  isOffline = false;

  workerPatch = (text) => text.replace(/const VERSION = '[^']*'/, "const VERSION = '9.9.9'").replace(/const CACHE = '([^']*)'/, "const CACHE = '$1-next'");
  await chrome.evaluate(session, `navigator.serviceWorker.getRegistration().then((registration) => registration.update())`);
  check('a new version is announced, not taken', await until(`document.querySelector('.dm-update')?.textContent.includes('9.9.9')`, 20000));
  await chrome.evaluate(session, `window.beforeUpdate = true; document.querySelector('.dm-update').click()`);
  check('"Update" reloads the page under the new version', await until(`window.beforeUpdate === undefined && document.querySelector('.dm-panel') !== null`, 20000));
  check('the old cache is gone', await until(`caches.keys().then((names) => names.length === 1 && names[0].endsWith('-next'))`));
  check('the page reported no error', chrome.errors.length === 0);
  if (chrome.errors.length > 0) console.log(chrome.errors.join('\n'));
} finally {
  await chrome.close();
  server.close();
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
