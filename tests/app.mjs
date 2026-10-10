/**
 * The page in a real Chrome, over a local HTTP server (OPFS needs an origin): the start screen, the demo database,
 * a composite foreign key followed both ways, rows written in place and in the form, the schema changed, the page reloaded.
 * `node tests/app.mjs --shots DIR` also saves screenshots of the screens; without Chrome the test says so and passes.
 */
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CHROME, sleep, startChrome } from '../tools/chrome.mjs';

const shotsIndex = process.argv.indexOf('--shots');
const shotsDir = shotsIndex === -1 ? null : process.argv[shotsIndex + 1];
const DESKTOP = { width: 1360, height: 860 };
const PHONE = { width: 390, height: 800 };

if (!CHROME) {
  console.log('SKIP: no Chrome (set CHROME=/path/to/chrome)');
  process.exit(0);
}

const page = await readFile(new URL('../build/db-manager.html', import.meta.url));
const server = createServer((request, response) => {
  response.writeHead(request.url === '/' ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
  response.end(request.url === '/' ? page : '');
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
  const { targetId } = await chrome.send('Target.createTarget', { url: 'about:blank' });
  const session = await chrome.attach(targetId, 'page');
  await chrome.send('Page.enable', {}, session);
  const viewport = (size) => chrome.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: size === PHONE }, session);
  await viewport(DESKTOP);
  // Headless Chrome shows no picker: the pickers answer files of the page's OPFS, as a user's file would be answered.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.showSaveFilePicker = async (options) => (await navigator.storage.getDirectory()).getFileHandle(options.suggestedName, { create: true });
      window.showOpenFilePicker = async () => [await (await navigator.storage.getDirectory()).getFileHandle('demo.sqlite')];`,
  }, session);
  await chrome.send('Page.navigate', { url }, session);

  const evaluate = (expression) => chrome.evaluate(session, expression);
  const until = (expression, timeout = 15000) => chrome.until(session, expression, timeout);
  const click = (selector) => chrome.click(session, selector);
  /** Clicks the first element of the selector whose text contains the text, as the DOM does. */
  const clickText = (selector, text) =>
    evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find((n) => n.textContent.includes(${JSON.stringify(text)})); if (!node) return false; node.click(); return true; })()`);
  const typeInto = (selector, text) =>
    evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.focus(); input.value = ${JSON.stringify(text)}; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  const shoot = async (name) => {
    if (shotsDir === null) return;
    await mkdir(shotsDir, { recursive: true });
    await sleep(250);
    const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' }, session);
    await writeFile(join(shotsDir, `${name}.png`), Buffer.from(data, 'base64'));
  };
  const gridRowCount = (scope) => evaluate(`document.querySelectorAll(${JSON.stringify(`${scope} tbody tr`)}).length`);

  check('the start screen lists no database yet', await until(`document.querySelector('.dm-db-list .dm-empty')?.textContent.includes('No databases yet')`));
  await shoot('01-start-empty');

  await clickText('.dm-panel-head button', 'From a template');
  await until(`document.querySelector('.dm-menu') !== null`);
  await clickText('.dm-menu-item', 'Demo shop');
  await until(`document.querySelector('dialog .dm-input') !== null`);
  await typeInto('dialog .dm-input', 'shop');
  await clickText('dialog button', 'OK');
  check('the demo database is created and listed', await until(`document.querySelector('.dm-db-item')?.dataset.database === 'shop'`));
  await shoot('02-start-listed');

  await click('.dm-db-item');
  check('the database opens with its tables listed', await until(`document.querySelectorAll('.dm-table-item').length === 10`));
  check('the first table is shown', await until(`document.querySelector('.dm-table-title')?.textContent === 'audit_log'`));

  await click('.dm-table-item[data-table="order_lines"]');
  check('order_lines shows its ten rows', await until(`document.querySelectorAll('.dm-main-top tbody tr').length === 10`));
  check('the right pane splits: shipment_items refers to order_lines', await until(`!document.querySelector('.dm-main').classList.contains('dm-unsplit')`));
  check('the tab names the composite foreign key', await until(`document.querySelector('.dm-tab')?.textContent === 'shipment_items(order_id, line_no)'`));
  check('a one-column reference shows its target title', await until(`[...document.querySelectorAll('.dm-main-top .dm-reference-title')].some((t) => t.textContent === 'USB-C cable')`));

  const rowIndex = await evaluate(`[...document.querySelectorAll('.dm-main-top tbody tr')].findIndex((tr) => tr.children[1].querySelector('.dm-reference-values')?.textContent === '3' && tr.children[2].textContent === '2')`);
  await click(`.dm-main-top tbody tr:nth-child(${rowIndex + 1}) td:nth-child(5)`);
  check('choosing order line (3, 2) shows the shipment item referring to it', await until(`document.querySelectorAll('.dm-main-bottom tbody tr').length === 1 && document.querySelector('.dm-main-bottom tbody tr').children[1].querySelector('.dm-reference-values')?.textContent === '2'`));
  check('the composite reference column shows the order line title', await until(`[...document.querySelectorAll('.dm-main-bottom .dm-reference-title')].some((t) => t.textContent === 'CB-USB')`));
  await shoot('03-composite-reference');

  await evaluate(`document.querySelector('.dm-main-bottom .dm-grid-tools button[title="New row"]').click()`);
  check('the row form opens with the foreign key preset', await until(`[...document.querySelectorAll('dialog .dm-input')].some((input) => input.value === '3')`));
  await shoot('04-row-form');
  await evaluate(`(() => { const inputs = [...document.querySelectorAll('dialog .dm-form-control > .dm-input')]; inputs[0].value = '3'; inputs[3].value = '1'; inputs.forEach((input) => input.dispatchEvent(new Event('input', { bubbles: true }))); return true; })()`);
  await clickText('dialog .dm-dialog-foot button', 'Create');
  check('a row created in the tab refers to the chosen row', await until(`document.querySelectorAll('.dm-main-bottom tbody tr').length === 2`));

  const quantityCell = `.dm-main-top tbody tr:nth-child(${rowIndex + 1}) td:nth-child(5)`;
  await evaluate(`document.querySelector(${JSON.stringify(quantityCell)}).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await until(`document.querySelector('.dm-cell-input') !== null`);
  await evaluate(`(() => { const input = document.querySelector('.dm-cell-input'); input.value = '7'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  check('a cell edited in place is written', await until(`document.querySelector(${JSON.stringify(quantityCell)})?.textContent === '7'`));

  await evaluate(`document.querySelector('.dm-main-top .dm-grid-tools button[title="Add a filter"]').click()`);
  await until(`document.querySelector('.dm-conditions .dm-input') !== null`);
  await evaluate(`(() => { const [column, comparison] = document.querySelectorAll('.dm-conditions select'); column.value = 'sku'; comparison.value = 'equals'; return true; })()`);
  await typeInto('.dm-conditions .dm-input', 'MS-02');
  await clickText('.dm-conditions button', 'Add');
  check('a filter narrows the rows', await until(`document.querySelectorAll('.dm-main-top tbody tr').length === 2 && document.querySelector('.dm-chip') !== null`));
  await evaluate(`document.querySelector('.dm-chip button').click()`);
  check('removing the filter shows every row again', await until(`document.querySelectorAll('.dm-main-top tbody tr').length === 10`));

  await click('.dm-table-item[data-table="customers"]');
  await until(`document.querySelector('.dm-table-title')?.textContent === 'customers'`);
  await clickText('.dm-table-head button', 'Edit schema');
  check('the table designer opens with the columns', await until(`document.querySelectorAll('dialog .dm-column-name').length === 6`));
  await shoot('05-designer');
  await clickText('dialog .dm-section-head button', 'Add');
  await until(`document.querySelectorAll('dialog .dm-column-name').length === 7`);
  await evaluate(`(() => { const names = document.querySelectorAll('dialog .dm-column-name'); const input = names[names.length - 1]; input.value = 'phone'; input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await clickText('dialog .dm-dialog-foot button', 'Show SQL');
  check('Show SQL previews the ALTER TABLE', await until(`[...document.querySelectorAll('dialog pre')].some((pre) => pre.textContent.includes('ADD COLUMN "phone"'))`));
  await shoot('06-preview');
  await evaluate(`[...document.querySelectorAll('dialog')].pop().querySelector('.dm-dialog-foot .dm-primary').click()`);
  await clickText('dialog .dm-dialog-foot button', 'Apply');
  check('the column is added', await until(`[...document.querySelectorAll('.dm-main-top th')].some((th) => th.textContent.startsWith('phone'))`));

  await clickText('.dm-sidebar-head button', '＋');
  await until(`document.querySelector('dialog .dm-column-name') !== null`);
  await typeInto('dialog .dm-input', 'returns');
  await clickText('dialog .dm-section-head button', 'Add');
  await clickText('dialog .dm-section-head button', 'Add');
  await evaluate(`(() => { const names = document.querySelectorAll('dialog .dm-column-name'); [['order_id', 1], ['line_no', 2]].forEach(([name, index]) => { names[index].value = name; names[index].dispatchEvent(new Event('input', { bubbles: true })); names[index].dispatchEvent(new Event('change', { bubbles: true })); }); return true; })()`);
  await until(`[...document.querySelectorAll('dialog .dm-column-name')].some((input) => input.value === 'line_no')`);
  const foreignKeySection = `[...document.querySelectorAll('dialog .dm-section')].find((section) => section.querySelector('h3')?.textContent === 'Foreign keys')`;
  await evaluate(`${foreignKeySection}.querySelector('.dm-section-head button').click()`);
  await until(`${foreignKeySection}.querySelector('.dm-design-item select') !== null`);
  await evaluate(`(() => { const select = ${foreignKeySection}.querySelector('.dm-design-item select'); select.value = 'order_lines'; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  check('choosing the target pairs its composite key by name', await until(`${foreignKeySection}.querySelectorAll('.dm-pair').length === 2`));
  await shoot('07-designer-composite-fk');
  await clickText('dialog .dm-dialog-foot button', 'Create table');
  check('the new table is created and listed', await until(`document.querySelector('.dm-table-item[data-table="returns"]') !== null && document.querySelector('.dm-table-title')?.textContent === 'returns'`));

  await click('.dm-table-item[data-table="order_lines"]');
  await until(`document.querySelectorAll('.dm-tab').length === 2`);
  check('order_lines is now referred to by two tables', (await evaluate(`[...document.querySelectorAll('.dm-tab')].map((tab) => tab.textContent).join('|')`)) === 'returns(order_id, line_no)|shipment_items(order_id, line_no)');

  await chrome.send('Page.reload', {}, session);
  check('a reload opens the database left open', await until(`document.querySelectorAll('.dm-table-item').length === 11`));

  await evaluate(`document.documentElement.dataset.theme = 'dark'`);
  await click('.dm-table-item[data-table="shipment_items"]');
  await until(`document.querySelectorAll('.dm-main-top tbody tr').length > 0`);
  await shoot('08-dark');
  await evaluate(`document.documentElement.dataset.theme = 'light'`);

  await viewport(PHONE);
  await shoot('09-phone-table');
  await evaluate(`document.querySelector('.dm-back').click()`);
  await shoot('10-phone-list');
  await viewport(DESKTOP);

  await clickText('.dm-bar button', 'Close');
  check('closing the database shows the start screen', await until(`document.querySelector('.dm-db-item') !== null`));

  await clickText('.dm-panel-head button', 'From a template');
  await until(`document.querySelector('.dm-menu') !== null`);
  await clickText('.dm-menu-item', 'as a file');
  check('a template saved as a file opens at once', await until(`document.querySelector('.dm-bar-title')?.textContent === 'demo' && document.querySelectorAll('.dm-table-item').length === 10`));
  await click('.dm-table-item[data-table="regions"]');
  await until(`document.querySelectorAll('.dm-main-top tbody tr').length === 8`);
  await evaluate(`document.querySelector('.dm-main-top .dm-grid-tools button[title="New row"]').click()`);
  await until(`document.querySelectorAll('dialog .dm-form-control > .dm-input').length === 3`);
  await evaluate(`(() => { const inputs = [...document.querySelectorAll('dialog .dm-form-control > .dm-input')]; ['PL', 'MZ', 'Masovia'].forEach((value, index) => { inputs[index].value = value; inputs[index].dispatchEvent(new Event('input', { bubbles: true })); }); return true; })()`);
  await clickText('dialog .dm-dialog-foot button', 'Create');
  await until(`document.querySelectorAll('.dm-main-top tbody tr').length === 9`);
  check('a change is written into the file itself', await until(`navigator.storage.getDirectory().then((root) => root.getFileHandle('demo.sqlite')).then((handle) => handle.getFile()).then((file) => file.size > 0)`));
  await clickText('.dm-bar button', 'Close');
  check('the file is listed where it lies', await until(`[...document.querySelectorAll('.dm-db-location')].some((location) => location.textContent === 'demo.sqlite on the disk')`));
  await shoot('11-start-with-file');
  await evaluate(`(() => { const item = [...document.querySelectorAll('.dm-db-item')].find((li) => li.dataset.database === 'demo'); item.querySelector('button').click(); return true; })()`);
  await until(`document.querySelector('.dm-menu') !== null`);
  await clickText('.dm-menu-item', 'Remove from the list');
  await clickText('dialog button', 'Remove');
  check('removing it from the list forgets the link alone', await until(`![...document.querySelectorAll('.dm-db-item')].some((li) => li.dataset.database === 'demo')`));
  await clickText('.dm-panel-head button', 'Open file');
  check('the same file opens again, the change in it', await until(`document.querySelector('.dm-bar-title')?.textContent === 'demo'`));
  await click('.dm-table-item[data-table="regions"]');
  check('the row written before is there', await until(`document.querySelectorAll('.dm-main-top tbody tr').length === 9`));
  check('the page reported no error', chrome.errors.length === 0);
  if (chrome.errors.length > 0) console.log(chrome.errors.join('\n'));
} finally {
  await chrome.close();
  server.close();
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
