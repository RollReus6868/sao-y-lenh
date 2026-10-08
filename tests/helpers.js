// Shared test plumbing: start the mock OneMES and a Chromium page logged into it.
'use strict';
const fs = require('fs');
const { chromium } = require('playwright-core');
const mock = require('../mock/server');

async function startMock() {
  mock.reset();
  await new Promise((r) => mock.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${mock.server.address().port}`;
  return { base, mock, close: () => new Promise((r) => mock.server.close(r)) };
}

async function launch() {
  const opts = { headless: true };
  const local = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
  if (fs.existsSync(local)) opts.executablePath = local;
  else opts.channel = 'chrome';
  return chromium.launch(opts);
}

async function loggedInPage(browser, base) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('crash', () => console.log('[crash] page crashed'));
  await page.goto(base + '/login.aspx');
  await page.fill('#txtUser', 'bs');
  await page.fill('#txtPass', 'x');
  await Promise.all([page.waitForNavigation(), page.click('#btnLogin')]);
  return page;
}

function hostFor(page, logs = []) {
  return {
    exec: (code) => { if (process.env.DBG2) console.error('EXEC', code.slice(-50).replace(/\s+/g,' ')); if (process.env.DBG) process.stderr.write('exec ' + code.slice(-60) + '\n'); return page.evaluate(code); },
    loadURL: (url) => page.goto(url).then(() => {}),
    log: (lv, msg) => logs.push(`${lv}: ${msg}`),
  };
}

let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  ok  ' + msg);
  else {
    failures++;
    console.log('  FAIL ' + msg);
  }
}
const done = () => {
  if (failures || process.exitCode) {
    console.log(`${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('all checks passed');
};

module.exports = { startMock, launch, loggedInPage, hostFor, check, done };
