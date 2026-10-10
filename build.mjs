/**
 * Bundles the host into ONE self-contained build/db-manager.html.
 *
 * `tsc -b` runs first (npm run build): esbuild bundles host/dist/src/main.js, the compiled entry point, with every
 * workspace package it imports, into one IIFE inlined into host/src/template.html. A plugin's worker is a second bundle:
 * any module named workerSource.js is replaced by the text of its sibling workerMain.js, bundled with sqlite3.wasm inside
 * as bytes, so the page starts the worker from a blob: URL and fetches nothing.
 * build/pages/ is the same page as an installable PWA: a manifest, an icon, a service worker that serves it offline.
 */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const at = (...parts) => join(root, ...parts);
const outFile = at('build', 'db-manager.html');
const SCRIPT_SLOT = '/*__SCRIPT__*/';
const ICON_SLOT = '__ICON__';
const { version } = JSON.parse(await readFile(at('package.json'), 'utf8'));

const COMMON = {
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  platform: 'browser',
  minify: true,
  legalComments: 'none',
  charset: 'utf8',
  write: false,
  // sqlite-wasm names its sqlite3.wasm by import.meta.url, empty in an IIFE; the engine is handed the bytes instead.
  logOverride: { 'empty-import-meta': 'silent' },
};

/** `</script` inside a string literal would close the inline tag early. */
const guard = (code) => code.replace(/<\/(script|style)/gi, '<\\/$1');

const bundleWorker = async (entryPoint) => {
  const result = await build({ ...COMMON, entryPoints: [entryPoint], loader: { '.wasm': 'binary' } });
  const output = result.outputFiles[0];
  if (!output) throw new Error(`esbuild returned no worker for ${entryPoint}`);
  return output.text;
};

/** Every workerSource.js becomes the text of the workerMain.js beside it. */
const embedWorkers = {
  name: 'embed-workers',
  setup(builder) {
    builder.onLoad({ filter: /[\\/]workerSource\.js$/ }, async (args) => {
      const workerText = await bundleWorker(join(dirname(args.path), 'workerMain.js'));
      return { contents: `export const WORKER_SOURCE = ${JSON.stringify(workerText)};`, loader: 'js' };
    });
  },
};

const bundleApp = async () => {
  const result = await build({
    ...COMMON,
    entryPoints: [at('host/dist/src/main.js')],
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [embedWorkers],
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error('esbuild returned an empty result');
  return output.text;
};

/** The point of the build: nothing may be fetched at runtime. */
const assertSelfContained = (html) => {
  const offenders = [
    [/<script[^>]+\ssrc=/i, '<script src=…>'],
    [/<link[^>]+href=["'](?!data:)/i, '<link href=…>'],
    [/@import\s+(url\()?["']?(?!data:)/i, '@import'],
    [/url\(\s*["']?https?:/i, 'url(http…)'],
  ];
  for (const [pattern, name] of offenders) {
    if (pattern.test(html)) throw new Error(`An external reference is left in the file: ${name}`);
  }
  if (!html.includes('http-equiv="Content-Security-Policy"')) throw new Error('The Content-Security-Policy meta tag is missing');
};

/** `<!--` followed by `<script` puts the HTML parser in the "double escaped" state: `</script>` stops closing the tag. */
const assertScriptCloses = (script) => {
  const commentStart = script.indexOf('<!--');
  if (commentStart !== -1 && /<script/i.test(script.slice(commentStart))) throw new Error('The script holds "<!--" then "<script": the page would run nothing');
};

const [template, icon, appJs] = await Promise.all([
  readFile(at('host/src/template.html'), 'utf8'),
  readFile(at('host/src/icon.svg'), 'utf8'),
  bundleApp(),
]);
if (!template.includes(SCRIPT_SLOT)) throw new Error(`host/src/template.html has no ${SCRIPT_SLOT}`);
const script = guard(appJs);
assertScriptCloses(script);
const iconUri = `data:image/svg+xml,${encodeURIComponent(icon)}`;
const html = template.replace(ICON_SLOT, () => iconUri).replace(SCRIPT_SLOT, () => script);
assertSelfContained(html);
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, html, 'utf8');
console.log(`build/db-manager.html — v${version}, ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);

/** The PWA's page: its manifest, icon and worker beside it, its CSP widened to its own origin for them alone. */
const buildPages = async () => {
  const pagesDir = at('build', 'pages');
  await rm(pagesDir, { recursive: true, force: true });
  await mkdir(pagesDir, { recursive: true });
  const head = [
    '<link rel="manifest" href="manifest.webmanifest">',
    '<link rel="apple-touch-icon" href="icon.svg">',
    '<meta name="theme-color" content="#2f5bd3" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#1c2028" media="(prefers-color-scheme: dark)">',
    '<meta name="service-worker" content="sw.js">',
  ].join('\n');
  const pageHtml = html
    .replace("img-src data:;", "img-src 'self' data:; manifest-src 'self';")
    .replace('worker-src blob:;', "worker-src blob: 'self';")
    .replace('</title>', () => `</title>\n${head}`);
  if (pageHtml === html) throw new Error('The PWA page did not change: the template moved');
  const hash = createHash('sha256').update(pageHtml).digest('hex').slice(0, 12);
  const worker = (await readFile(at('host/src/pwa/sw.js'), 'utf8')).replace('__VERSION__', version).replace('__CACHE__', `db-manager-${version}-${hash}`);
  await Promise.all([
    writeFile(join(pagesDir, 'index.html'), pageHtml, 'utf8'),
    writeFile(join(pagesDir, 'sw.js'), worker, 'utf8'),
    writeFile(join(pagesDir, 'manifest.webmanifest'), await readFile(at('host/src/pwa/manifest.webmanifest'), 'utf8'), 'utf8'),
    writeFile(join(pagesDir, 'icon.svg'), icon, 'utf8'),
  ]);
  console.log(`build/pages/ — the PWA, cache db-manager-${version}-${hash}`);
};
await buildPages();
