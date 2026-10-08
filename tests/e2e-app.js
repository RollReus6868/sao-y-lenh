// Drives the real app (dev or packaged) through its UI against the mock OneMES:
// log in inside the embedded view, scan, open a patient, tick deletions, run 3 days.
// Usage: node tests/e2e-app.js [path-to-packaged-exe]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { startMock, check, done } = require('./helpers');

const PORT = 9333 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(what, fn, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      const r = await fn();
      if (r) return r;
    } catch {}
    if (Date.now() > end) throw new Error('timeout: ' + what);
    await sleep(250);
  }
}

(async () => {
  const m = await startMock();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syl e2e ')); // a space, like many Windows user names;
  const exe = process.argv[2];
  const electronBin = require('electron');
  const args = exe ? [] : ['.'];
  if (process.platform === 'linux') args.push('--no-sandbox');
  args.push(`--remote-debugging-port=${PORT}`);
  const app = spawn(exe || electronBin, args, {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, SYL_DATA_DIR: dataDir, SYL_ONEMES_URL: m.base + '/login.aspx', SYL_NO_UPDATE_CHECK: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let appOut = '';
  app.stdout.on('data', (d) => (appOut += d));
  app.stderr.on('data', (d) => (appOut += d));
  let browser;
  let ui;
  try {
    browser = await waitFor('CDP', () => chromium.connectOverCDP(`http://127.0.0.1:${PORT}`), 60000);
    const pages = () => browser.contexts().flatMap((c) => c.pages());
    ui = await waitFor('UI page', () => pages().find((p) => p.url().includes('ui_dist')));
    ui.on('console', (msg) => msg.type() === 'error' && console.log('[ui console]', msg.text()));
    const view = await waitFor('OneMES view', () => pages().find((p) => p.url().startsWith(m.base)));

    // The browser lives on its own page; log in there like a user would.
    await ui.click('[data-nav=browser]');
    await view.waitForSelector('#txtUser');
    await view.fill('#txtUser', 'bs');
    await view.fill('#txtPass', 'x');
    await Promise.all([view.waitForNavigation(), view.click('#btnLogin')]);

    // The view sits exactly over the placeholder.
    const geo = await ui.evaluate(() => {
      const r = document.querySelector('[data-pane=onemes] > div:last-child').getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    const vsize = await view.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    check(geo.w > 300 && Math.abs(vsize.w - geo.w) <= 2 && Math.abs(vsize.h - geo.h) <= 2, `view fills the browser page (${vsize.w}x${vsize.h} vs ${Math.round(geo.w)}x${Math.round(geo.h)})`);

    // One button takes the view straight to Ds Điều trị nội trú, even from a page
    // without the OneMES menu (the address is rebuilt from the session id).
    await view.goto(m.base + '/nomenu.aspx?scope=sys&lang=vi&usid=10.0.0.1_e2e');
    await ui.click('[data-action=goto-list]');
    await waitFor('list page', async () => /danhsachdieutrinoitrudraw/.test(view.url()) && !(await ui.$('[data-action=goto-list][disabled]')), 30000);
    check(/danhsachdieutrinoitrudraw/.test(view.url()), 'Ds Điều trị nội trú button opens the list');

    const vs = () => ui.evaluate(() => window.app.call('view:state'));
    let st0 = await vs();
    check(st0.shown && st0.visible && st0.bounds.x >= 0, 'view shown on the browser page');

    // Leaving the page must take the view out of the way of the rest of the UI.
    for (const nav of ['patients', 'templates', 'log', 'settings']) {
      await ui.click(`[data-nav=${nav}]`);
      st0 = await waitFor('view hidden', async () => { const x = await vs(); return !x.shown ? x : null; }, 5000);
      const win = await ui.evaluate(() => ({ w: innerWidth, h: innerHeight }));
      const b = st0.bounds;
      const outside = b.x + b.width <= 0 || b.y + b.height <= 0 || b.x >= win.w || b.y >= win.h;
      check(!st0.visible && outside, `view hidden on ${nav}`);
    }
    await ui.click('[data-nav=browser]');
    st0 = await waitFor('view shown', async () => { const x = await vs(); return x.shown ? x : null; }, 5000);
    check(st0.visible && st0.bounds.x >= 0 && st0.bounds.width > 300, 'view back when returning to the browser page');

    await ui.click('[data-nav=patients]');
    await ui.waitForSelector('[data-action=scan]');
    await ui.click('[data-action=scan]');
    await ui.waitForSelector('[data-patient]', { timeout: 30000 });
    check((await ui.$$('[data-patient]')).length === 3, 'three patients listed');

    await ui.click('[data-patient="2600000002"] >> button >> nth=1');
    await ui.waitForSelector('[data-grid]', { timeout: 30000 });
    await ui.click('[data-item="Lirystad 150"] button >> nth=0'); // whole row: every day
    await ui.click('[aria-label="Xóa Điều trị bằng siêu âm ngày 3"]');
    await ui.click('[data-action=run]');
    await ui.click('[data-action=confirm-run]');
    await ui.waitForSelector('[data-runbar]', { timeout: 10000 });
    await waitFor('run finished', async () => !(await ui.$('[data-runbar]')), 180000);

    const st = m.mock.getState();
    const p = st.patients[1];
    const fresh = p.orders.filter((o) => o.date > new Date(2026, 9, 12, 8)).sort((a, b) => a.date - b.date);
    const names = (o) => [...o.thuoc, ...o.dvkt].map((x) => x.name);
    check(fresh.length === 3, 'three new orders: ' + fresh.length);
    check(fresh.every((o) => o.status === 'Hoàn tất'), 'all completed');
    check(fresh.every((o) => !names(o).includes('Lirystad 150')), 'Lirystad removed every day');
    check(fresh[2] && !names(fresh[2]).includes('Điều trị bằng siêu âm') && names(fresh[1]).includes('Điều trị bằng siêu âm'), 'siêu âm removed on day 3 only');

    // The result tab shows what was read back from OneMES.
    await ui.waitForSelector('[data-result] [data-day="3"]', { timeout: 30000 });
    check(/Đúng như đã chọn/.test(await ui.textContent('[data-summary]')), 'result: all days as chosen');
    check((await ui.textContent('[data-day="3"]')).includes('Lirystad 150') === true, 'result: day 3 lists removed Lirystad');

    // Delete day 3 from the tool: Thu hồi, then Xóa on OneMES.
    m.mock.getState().log.length = 0;
    await ui.click('[data-day="3"] [data-action=delete-day]');
    await ui.click('[data-action=confirm-delete]');
    await ui.waitForSelector('[data-day="3"] [data-action=delete-day]', { state: 'detached', timeout: 60000 });
    const lg = m.mock.getState().log;
    check(lg.some((x) => x[0] === 'thuHoi' && x[1] === fresh[2].id) && lg.some((x) => x[0] === 'xoaYLenh' && x[1] === fresh[2].id), 'delete: Thu hồi then Xóa on day 3');
    check(!st.patients[1].orders.includes(fresh[2]) && m.mock.getState().patients[1].orders.some((o) => o.id === fresh[1].id), 'delete: only day 3 removed');

    // Choice is remembered and shown in the list.
    await ui.click('[data-action=back]');
    await ui.waitForSelector('[data-patient="2600000002"]');
    const pill = await ui.textContent('[data-patient="2600000002"]');
    check(/Đã làm hôm nay/.test(pill), 'patient marked done today');
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'data.json'), 'utf8'));
    check(saved.choices[p.noitruid] && saved.choices[p.noitruid].days === 3, 'choice saved to data.json');
    const logs = fs.readdirSync(path.join(dataDir, 'logs'));
    check(logs.length === 1 && /đã xóa "Lirystad 150"/.test(fs.readFileSync(path.join(dataDir, 'logs', logs[0]), 'utf8')), 'log file written');

    if (process.env.SHOTS) {
      await ui.click('[data-patient="2400000001"] >> button >> nth=1');
      await ui.waitForSelector('[data-grid]', { timeout: 30000 });
      await sleep(1500);
      try {
        require('child_process').execFileSync('import', ['-window', 'root', path.join(process.env.SHOTS, 'app-window.png')]);
      } catch (e) {
        console.log('no window capture:', e.message);
      }
    }
  } catch (e) {
    process.exitCode = 1;
    console.log('ERROR', e);
    if (ui) console.log('UI text:', (await ui.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 3000));
    console.log('App output:', appOut.slice(-3000));
  } finally {
    if (browser) await browser.close().catch(() => {});
    app.kill();
    await m.close();
  }
  done();
  process.exit(process.exitCode || 0);
})();
