// Screenshots of the UI (browser demo backend) in light and dark, plus basic layout checks.
// Usage: node tools/ui-shots.js <url> <outDir>
'use strict';
const fs = require('fs');
const { chromium } = require('playwright-core');

(async () => {
  const [url, out] = [process.argv[2] || 'http://127.0.0.1:4173', process.argv[3] || 'screenshots'];
  fs.mkdirSync(out, { recursive: true });
  const exe = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : { channel: 'chrome' });
  const problems = [];
  for (const mode of ['dark', 'light']) {
    for (const width of [1440, 1100]) {
      const page = await browser.newPage({ viewport: { width, height: 860 } });
      page.on('console', (m) => m.type() === 'error' && problems.push(`${mode} ${width} console: ${m.text()}`));
      page.on('pageerror', (e) => problems.push(`${mode} ${width} pageerror: ${e.message}`));
      await page.goto(url);
      await page.evaluate((m) => { localStorage.clear(); localStorage.setItem('sao-y-lenh-mode', m); }, mode);
      await page.goto(url + '?update=1');
      const shot = async (name) => {
        await page.waitForTimeout(350);
        const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        if (over) problems.push(`${mode} ${width} ${name}: horizontal overflow`);
        // nothing from the control column may reach into the OneMES pane
        const bad = await page.evaluate(() => {
          const pane = document.querySelector('[data-pane=onemes]').getBoundingClientRect();
          const col = document.querySelector('[data-column]');
          return [...col.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > pane.left + 1; }).length;
        });
        if (bad) problems.push(`${mode} ${width} ${name}: ${bad} elements overlap the OneMES pane`);
        if (width === 1440 || name === 'detail') await page.screenshot({ path: `${out}/${mode}-${width}-${name}.png` });
      };
      await shot('empty');
      await page.click('[data-action=scan]');
      await page.waitForSelector('[data-patient]');
      await shot('list');
      await page.click('[data-patient] >> nth=0 >> button >> nth=1');
      await page.waitForSelector('[data-grid]');
      await page.click('[data-item="Lirystad 150"] button >> nth=0');
      await page.click('[aria-label="Xóa Điều trị bằng siêu âm ngày 3"]');
      await page.click('[aria-label="Xóa Renaxib 200 ngày 2"]');
      await shot('detail');
      await page.click('[data-col="3"]');
      await shot('colmenu');
      await page.click('[data-sheet]', { position: { x: 30, y: 30 } });
      await page.click('[data-action=run]');
      await shot('confirm');
      await page.click('text=Hủy');
      await page.click('[data-nav=templates]'); await shot('templates');
      await page.click('[data-nav=log]'); await shot('log');
      await page.click('[data-nav=settings]'); await shot('settings');
      await page.click('[data-nav=patients]');
      await page.close();
    }
  }
  // running state with step mode
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  await page.goto(url + '?step=1');
  await page.click('[data-action=scan]');
  await page.waitForSelector('[data-patient]');
  await page.click('[data-patient] >> nth=0 >> button >> nth=1');
  await page.waitForSelector('[data-grid]');
  await page.click('[data-action=run]');
  await page.click('[data-action=confirm-run]');
  await page.waitForSelector('[data-action=continue]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/light-1440-running.png` });
  await browser.close();
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('ALL CHECKS PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
