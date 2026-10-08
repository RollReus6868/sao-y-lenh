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

    // One button takes the view straight to Ds Điều trị nội trú.
    await ui.click('[data-action=goto-list]');
    await waitFor('list page', async () => /danhsachdieutrinoitrudraw/.test(view.url()) && !(await ui.$('[data-action=goto-list][disabled]')), 30000);
    check(/danhsachdieutrinoitrudraw/.test(view.url()), 'Ds Điều trị nội trú button opens the list');

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
