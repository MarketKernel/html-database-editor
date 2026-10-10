/**
 * build/db-manager.html opened straight from the disk (file://), where Chrome gives the page no OPFS:
 * the plugin keeps its databases in IndexedDB, a reload finds them again, a second tab is told the first holds them.
 */
import { fileURLToPath } from 'node:url';
import { CHROME, startChrome } from '../tools/chrome.mjs';

if (!CHROME) {
  console.log('SKIP: no Chrome (set CHROME=/path/to/chrome)');
  process.exit(0);
}

const url = `file://${fileURLToPath(new URL('../build/db-manager.html', import.meta.url))}`;
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
  const session = await chrome.attach(targetId, 'file');
  await chrome.send('Page.enable', {}, session);
  const evaluate = (expression) => chrome.evaluate(session, expression);
  const until = (expression, timeout = 15000) => chrome.until(session, expression, timeout);
  const clickText = (selector, text) =>
    evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find((n) => n.textContent.includes(${JSON.stringify(text)})); if (!node) return false; node.click(); return true; })()`);

  check('the start screen opens from the disk with no database yet', await until(`document.querySelector('.dm-db-list .dm-empty')?.textContent.includes('No databases yet')`));
  await clickText('.dm-panel-head button', 'From a template');
  await until(`document.querySelector('.dm-menu') !== null`);
  await clickText('.dm-menu-item', 'in the browser');
  await until(`document.querySelector('dialog .dm-input') !== null`);
  await clickText('dialog button', 'OK');
  const kept = await until(`document.querySelector('.dm-db-location')?.textContent === 'This browser (IndexedDB)'`);
  if (!kept) console.log(await evaluate(`document.querySelector('.dm-db-list')?.textContent`));
  check('the demo database is kept in IndexedDB', kept);

  await chrome.click(session, '.dm-db-item');
  check('it opens with its tables', await until(`document.querySelectorAll('.dm-table-item').length === 10`));
  await chrome.click(session, '.dm-table-item[data-table="customers"]');
  await until(`document.querySelectorAll('.dm-main-top tbody tr').length === 8`);
  await evaluate(`document.querySelector('.dm-main-top tbody tr td:nth-child(3)').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await until(`document.querySelector('.dm-cell-input') !== null`);
  await evaluate(`(() => { const input = document.querySelector('.dm-cell-input'); input.value = 'Anna Renamed'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  check('a cell is written', await until(`document.querySelector('.dm-main-top tbody tr td:nth-child(3)')?.textContent === 'Anna Renamed'`));

  const second = await chrome.send('Target.createTarget', { url });
  const secondSession = await chrome.attach(second.targetId, 'second');
  check('a second tab is told the first holds the databases', await chrome.until(secondSession, `document.querySelector('.dm-refusal')?.textContent.includes('another tab')`));
  await chrome.send('Target.closeTarget', { targetId: second.targetId });

  await chrome.send('Page.reload', {}, session);
  check('a reload opens the database again', await until(`document.querySelectorAll('.dm-table-item').length === 10`));
  await chrome.click(session, '.dm-table-item[data-table="customers"]');
  check('the change was kept', await until(`document.querySelector('.dm-main-top tbody tr td:nth-child(3)')?.textContent === 'Anna Renamed'`));
  check('the page reported no error', chrome.errors.length === 0);
  if (chrome.errors.length > 0) console.log(chrome.errors.join('\n'));
} finally {
  await chrome.close();
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
