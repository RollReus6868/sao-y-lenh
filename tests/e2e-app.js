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
    env: { ...process.env, SYL_DATA_DIR: dataDir, SYL_ONEMES_URL: m.base + '/login.aspx', SYL_NO_UPDATE_CHECK: '1', SYL_TODAY: '00:00 12/10/2026' },
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
    // The page is zoomed out to 70% by default: CSS pixels times the zoom fill the box.
    const vsize = await view.evaluate(() => ({ w: innerWidth * devicePixelRatio, h: innerHeight * devicePixelRatio, z: devicePixelRatio }));
    check(Math.abs(vsize.z - 0.7) < 0.01, 'OneMES page zoomed to 70% by default (' + vsize.z + ')');
    check(geo.w > 300 && Math.abs(vsize.w - geo.w) <= 2 && Math.abs(vsize.h - geo.h) <= 2, `view fills the browser page (${vsize.w}x${vsize.h} vs ${Math.round(geo.w)}x${Math.round(geo.h)})`);

    // One button takes the view straight to Ds Điều trị nội trú, even from a page
    // without the OneMES menu (the address is rebuilt from the session id).
    await view.goto(m.base + '/nomenu.aspx?scope=sys&lang=vi&usid=10.0.0.1_e2e');
    await ui.click('[data-action=goto-list]');
    await waitFor('list page', async () => /danhsachdieutrinoitrudraw/.test(view.url()) && !(await ui.$('[data-action=goto-list][disabled]')), 30000);
    check(/danhsachdieutrinoitrudraw/.test(view.url()), 'Ds Điều trị nội trú button opens the list');

    // Zoom buttons change the page and are remembered.
    await ui.click('[data-action=zoom-in]');
    await waitFor('zoom 80%', async () => Math.abs((await view.evaluate(() => devicePixelRatio)) - 0.8) < 0.01, 5000);
    const zl = await waitFor('zoom label', async () => ((await ui.textContent('[data-zoom-value]')) === '80%' ? '80%' : null), 5000).catch(() => ui.textContent('[data-zoom-value]'));
    check(zl === '80%', 'zoom in shows 80% (' + zl + ')');
    await view.reload();
    await waitFor('zoom kept after reload', async () => Math.abs((await view.evaluate(() => devicePixelRatio).catch(() => 0)) - 0.8) < 0.01, 10000);
    check(true, 'zoom kept on the next page');
    await ui.click('[data-zoom-value]');
    await waitFor('zoom back to 70%', async () => Math.abs((await view.evaluate(() => devicePixelRatio)) - 0.7) < 0.01, 5000);

    const vs = () => ui.evaluate(() => window.app.call('view:state'));
    let st0 = await vs();
    check(st0.shown && st0.visible && st0.bounds.x >= 0, 'view shown on the browser page');

    // Leaving the page must take the view out of the way of the rest of the UI.
    for (const nav of ['patients', 'templates', 'log', 'settings']) {
      await ui.click(`[data-nav=${nav}]`);
      st0 = await waitFor('view hidden', async () => { const x = await vs(); return !x.shown ? x : null; }, 5000);
      check(!st0.visible && !st0.attached, `view taken out of the window on ${nav}`);
    }
    await ui.click('[data-nav=browser]');
    st0 = await waitFor('view shown', async () => { const x = await vs(); return x.shown ? x : null; }, 5000);
    check(st0.visible && st0.attached && st0.bounds.x >= 0 && st0.bounds.width > 300, 'view back when returning to the browser page');

    await ui.click('[data-nav=patients]');
    await ui.waitForSelector('[data-action=scan]');
    await ui.click('[data-action=scan]');
    await ui.waitForSelector('[data-patient]', { timeout: 30000 });
    check((await ui.$$('[data-patient]')).length === 3, 'three patients listed');

    await ui.click('[data-patient="2600000002"] >> button >> nth=1');
    await ui.waitForSelector('[data-grid]', { timeout: 30000 });
    // The open patient is still open after a look at the browser.
    await ui.click('[data-tab=dv]');
    await ui.click('[data-nav=browser]');
    await ui.waitForSelector('[data-action=goto-list]');
    await ui.click('[data-nav=patients]');
    check(!!(await ui.$('[data-tab=dv][aria-selected=true]')), 'patient and tab kept after visiting the browser');
    await ui.click('[data-tab=pick]');
    await ui.waitForSelector('[data-grid]');
    await ui.click('[data-item="Lirystad 150"] button >> nth=0'); // whole row: every day
    await ui.click('[aria-label="Xóa Điều trị bằng siêu âm ngày 3"]');
    check(/\(Hao phí\)/.test(await ui.textContent('[data-item="Kim châm cứu tiệt trùng dùng một lần"]')), 'VTYT shows (Hao phí)');
    // Day 1: other time and doctor (the doctor list was read from OneMES on opening).
    await ui.click('[data-eday="1"]');
    await ui.fill('[data-order-fields] [data-field=gio]', '7h40');
    await ui.press('[data-order-fields] [data-field=gio]', 'Enter');
    await waitFor('doctor list', async () => (await ui.$$('[data-order-fields] [data-field=bacSi] option')).length >= 4, 20000);
    await ui.selectOption('[data-order-fields] [data-field=bacSi]', 'd2');
    // A change on day 1 carries to the days after it; day 3 then gets its own doctor back.
    check((await ui.$$('[data-eday] .bg-amber-500')).length === 3, 'edit on day 1 marks days 2 and 3 too');
    await ui.click('[data-eday="3"]');
    await ui.selectOption('[data-order-fields] [data-field=bacSi]', 'd1');
    // Add Cồn xoa bóp on day 2 only.
    await ui.click('[aria-label="Thêm Cồn xoa bóp ngày 2"]');
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
    const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    check(fresh[0] && hm(fresh[0].dateTH) === '07:40' && hm(fresh[0].date) === '07:39' && fresh[0].bacSi.id === 'd2', 'day 1: time 07:40 (chỉ định 07:39) and doctor changed');
    check(fresh[1] && fresh[1].bacSi.id === 'd2' && hm(fresh[1].dateTH) === '07:40', 'day 2 follows day 1 (time and doctor)');
    check(fresh[2] && fresh[2].bacSi.id === 'd1' && hm(fresh[2].dateTH) === '07:40', 'day 3: time from day 1, its own doctor');
    const drugsOf = (o) => o.thuoc.map((x) => x.name);
    check(fresh[1] && drugsOf(fresh[1]).includes('CỒN XOA BÓP') && !drugsOf(fresh[0]).includes('CỒN XOA BÓP') && !drugsOf(fresh[2]).includes('CỒN XOA BÓP'), 'Cồn xoa bóp added on day 2 only');

    // The result tab shows what was read back from OneMES.
    await ui.waitForSelector('[data-result] [data-day="3"]', { timeout: 30000 });
    check(/Đúng như đã chọn/.test(await ui.textContent('[data-summary]')), 'result: all days as chosen');
    check((await ui.textContent('[data-day="3"]')).includes('Lirystad 150') === true, 'result: day 3 lists removed Lirystad');
    check(/Đã thêm:\s*Cồn xoa bóp/.test(await ui.textContent('[data-day="2"]')), 'result: day 2 shows the added drug');

    // Correct day 2 from the result tab.
    await ui.click('[data-day="2"] [data-action=edit-day]');
    await ui.fill('[data-day="2"] [data-field=dienBien]', 'Sửa từ tab Kết quả');
    await ui.click('[data-day="2"] [data-remove="Nhang ngải cứu"]');
    await ui.click('[data-day="2"] [data-action=update-day]');
    await ui.click('[data-action=confirm-update]');
    await waitFor('day 2 updated', async () => !(await ui.$('[data-day="2"] [data-editing]')) && (await ui.$('[data-day="2"] [data-action=edit-day]:not([disabled])')), 90000);
    const o2 = m.mock.getState().patients[1].orders.find((o) => o.id === fresh[1].id);
    check(o2.dienBien === 'Sửa từ tab Kết quả' && !names(o2).includes('Nhang ngải cứu') && o2.status === 'Hoàn tất', 'result edit: notes and item updated on OneMES, completed again');
    check((await ui.textContent('[data-day="2"]')).includes('Sửa từ tab Kết quả'), 'result edit: day re-read and shown');

    // Delete day 3 from the tool: Thu hồi, then Xóa on OneMES.
    m.mock.getState().log.length = 0;
    await ui.click('[data-day="3"] [data-action=delete-day]');
    await ui.click('[data-action=confirm-delete]');
    await ui.waitForSelector('[data-day="3"] [data-action=delete-day]', { state: 'detached', timeout: 60000 });
    const lg = m.mock.getState().log;
    check(lg.some((x) => x[0] === 'thuHoi' && x[1] === fresh[2].id) && lg.some((x) => x[0] === 'xoaYLenh' && x[1] === fresh[2].id), 'delete: Thu hồi then Xóa on day 3');
    check(!st.patients[1].orders.includes(fresh[2]) && m.mock.getState().patients[1].orders.some((o) => o.id === fresh[1].id), 'delete: only day 3 removed');

    // Thông tin bệnh án: import an example page, then write it to OneMES.
    const schema = require('../src/benh-an-schema.json');
    const ex = { txtLyDoVaoVien: 'Đau lưng (mẫu e2e)', ckTsThuocLa: true, HinhThai: ['1', '3'], CDCS: ' Cấp II', TomTatBa: 'Tóm tắt e2e' };
    const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    let html = '<html><head><meta charset="utf-8"></head><body><h3>B. PHẦN BỆNH ÁN</h3>';
    for (const f of schema.groups.flatMap((g) => g.fields)) {
      const v = ex[f.id];
      if (f.kind === 'textarea') html += `<textarea id="${f.id}">${esc(v || '')}</textarea>`;
      else if (f.kind === 'check') html += `<input type="checkbox" id="${f.id}"${v ? ' checked' : ''}>`;
      else if (f.kind === 'radio') html += f.options.map((o) => `<input type="radio" name="${f.id}" value="${esc(o.value)}"${v === o.value ? ' checked' : ''}>`).join('');
      else if (f.kind === 'select' || f.kind === 'multi') html += `<select id="${f.id}"${f.kind === 'multi' ? ' multiple' : ''}>${f.options.map((o) => `<option value="${esc(o.value)}"${(v || []).includes(o.value) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      else html += `<input id="${f.id}" value="${esc(v || '')}">`;
    }
    const mauFile = path.join(dataDir, 'mau-e2e.html');
    fs.writeFileSync(mauFile, html + '</body></html>');
    await ui.click('[data-tab=benhan]');
    await ui.waitForSelector('[data-benhan] [data-ba-group]');
    await ui.setInputFiles('[data-input=mau-file]', mauFile);
    await waitFor('template filled', async () => (await ui.inputValue('[data-ba=txtLyDoVaoVien] textarea')) === 'Đau lưng (mẫu e2e)', 10000);
    // Several templates: save the edited form as a second one, then fill from the first again.
    await ui.fill('[data-ba=txtLyDoVaoVien] textarea', 'Lý do mẫu tay');
    await ui.click('[data-action=ba-save-mau]');
    await ui.fill('[data-input=mau-name]', 'Mẫu tay e2e');
    await ui.click('[data-action=ba-confirm-save-mau]');
    await waitFor('second template', async () => (await ui.$$('[data-select=mau] option')).length === 2, 5000);
    check((await ui.inputValue('[data-select=mau]')) !== '' && /Mẫu tay e2e/.test(await ui.textContent('[data-select=mau] option:checked')), 'mẫu: new template saved and picked');
    await ui.selectOption('[data-select=mau]', { index: 0 });
    await ui.click('[data-action=ba-fill]');
    await ui.click('[data-action=ba-confirm-fill]');
    await waitFor('filled from first template', async () => (await ui.inputValue('[data-ba=txtLyDoVaoVien] textarea')) === 'Đau lưng (mẫu e2e)', 5000);
    const maus = JSON.parse(fs.readFileSync(path.join(dataDir, 'data.json'), 'utf8')).benhAnMaus;
    check(maus.length === 2 && maus[1].name === 'Mẫu tay e2e' && maus[1].values.txtLyDoVaoVien === 'Lý do mẫu tay', 'mẫu: two templates kept in data.json');
    await ui.fill('[data-ba=TomTatBa] textarea', 'Tóm tắt đã sửa');
    await ui.click('[data-action=ba-save]');
    await ui.click('[data-action=ba-confirm-save]');
    await waitFor('bệnh án saved', async () => (await ui.$('[data-action=ba-save]:not([disabled])')) && m.mock.getState().patients[1].benhAn.TomTatBa, 90000);
    const ba = m.mock.getState().patients[1].benhAn;
    check(ba.txtLyDoVaoVien === 'Đau lưng (mẫu e2e)' && ba.ckTsThuocLa === true && ba.HinhThai.join() === '1,3' && ba.CDCS === ' Cấp II' && ba.TomTatBa === 'Tóm tắt đã sửa', 'bệnh án: template + edit written to OneMES');
    check(!(await ui.$('[data-ba-warn]')), 'bệnh án: read back without differences');

    // Dọn thủ thuật on the old days: untick one, clean the other two.
    m.mock.getState().log.length = 0;
    await ui.click('[data-tab=dv]');
    await ui.click('[data-action=dv-scan]');
    await ui.waitForSelector('[data-dv-item]', { timeout: 60000 });
    check((await ui.$$('[data-dv-item]')).length === 3, 'dọn: three services listed');
    await ui.click('[data-dv-item="Kỹ thuật xoa bóp vùng"]');
    await ui.click('[data-action=dv-clean]');
    await ui.click('[data-action=dv-confirm]');
    await ui.waitForSelector('[data-runbar]', { timeout: 10000 });
    await waitFor('dọn finished', async () => !(await ui.$('[data-runbar]')), 120000);
    const lgd = m.mock.getState().log.map((x) => x[0]);
    check(lgd.filter((x) => x === 'thuHoiDV').length === 1 && lgd.filter((x) => x === 'xoaDichVu').length === 2 && !lgd.includes('chuyenTH'), 'dọn: one recalled, two deleted: ' + lgd.join());
    await ui.waitForSelector('[data-dv-item]', { timeout: 10000 });
    check((await ui.$$('[data-dv-item]')).length === 1 && !!(await ui.$('[data-dv-item="Kỹ thuật xoa bóp vùng"]')), 'dọn: the unticked one is still listed');

    // Kết quả CLS into a new order.
    await ui.click('[data-tab=cls]');
    await ui.click('[data-action=cls-list]');
    await ui.waitForSelector('[data-cls-date="10/10/2026"]', { timeout: 60000 });
    await ui.click('[data-cls-date="10/10/2026"]');
    await ui.click('[data-action=cls-read]');
    await ui.waitForSelector('[data-cls-results]', { timeout: 60000 });
    const clsText = await ui.inputValue('[data-field=cls-text]');
    check(/^Kết quả CLS:\nCông thức máu: WBC: 11.2 G\/L/.test(clsText) && /Gan nhiễm mỡ độ I/.test(clsText), 'CLS: abnormal values read: ' + JSON.stringify(clsText));
    await ui.fill('[data-cls] [data-field=gio]', '14:20');
    await ui.press('[data-cls] [data-field=gio]', 'Enter');
    await ui.fill('[data-field=cls-ngay]', '11/10/2026');
    const before2 = m.mock.getState().patients[1].orders.map((o) => o.id);
    await ui.click('[data-action=cls-create]');
    await ui.click('[data-action=cls-confirm]');
    await ui.waitForSelector('[data-runbar]', { timeout: 10000 });
    await waitFor('CLS order created', async () => !(await ui.$('[data-runbar]')), 120000);
    const cls = m.mock.getState().patients[1].orders.filter((o) => !before2.includes(o.id));
    check(cls.length === 1 && cls[0].dienBien === clsText && hm(cls[0].dateTH) === '14:20' && cls[0].dateTH.getDate() === 11 && cls[0].status === 'Hoàn tất', 'CLS: new order with the text at 14:20 11/10, completed');

    // Choice is remembered and shown in the list.
    await ui.click('[data-action=back]');
    await ui.waitForSelector('[data-patient="2600000002"]');
    const pill = await ui.textContent('[data-patient="2600000002"]');
    check(/Đã làm hôm nay/.test(pill), 'patient marked done today');
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'data.json'), 'utf8'));
    check(saved.choices[p.noitruid] && saved.choices[p.noitruid].days === 3, 'choice saved to data.json');
    const logs = fs.readdirSync(path.join(dataDir, 'logs'));
    check(logs.length === 1 && /đã xóa "Lirystad 150"/.test(fs.readFileSync(path.join(dataDir, 'logs', logs[0]), 'utf8')), 'log file written');

    // Patient A: Cao thông mạch on 10/10 → ticked by the tool on 13/10 (day 1); after the
    // usual copy the sắc thuốc thang order is copied by itself for the same number of days.
    const pA = m.mock.getState().patients[0];
    const o10 = pA.orders.find((o) => o.date.getDate() === 10 && !/sắc/i.test(o.khac));
    o10.thuoc.push({ ...o10.thuoc[0], id: require('crypto').randomUUID(), name: 'CAO THÔNG MẠCH', hamLuong: '12000mg+10000mg+8000mg', dvt: 'Chai' });
    await ui.click('[data-patient="2400000001"] >> button >> nth=1');
    await ui.waitForSelector('[data-grid]', { timeout: 30000 });
    await waitFor('auto tick', async () => !!(await ui.$('[aria-label="Thêm Cao thông mạch ngày 1"][aria-pressed=true]')), 15000);
    check(!(await ui.$('[aria-label="Thêm Cao thông mạch ngày 2"][aria-pressed=true]')) && !(await ui.$('[aria-label="Thêm Cồn xoa bóp ngày 1"][aria-pressed=true]')) && /Tự tick N1 \(vì 10\/10 có\)/.test(await ui.textContent('[data-add="cao-thong-mach"]')), 'tick sẵn: Cao thông mạch on day 1 only, with the reason');
    const beforeA = pA.orders.map((o) => o.id);
    await ui.click('[data-action=run]');
    check(!!(await ui.$('[data-auto-sac]')), 'confirm sheet says sắc thuốc thang follows');
    await ui.click('[data-action=confirm-run]');
    await ui.waitForSelector('[data-runbar]', { timeout: 10000 });
    await waitFor('run + sắc finished', async () => !(await ui.$('[data-runbar]')), 300000);
    const newA = m.mock.getState().patients[0].orders.filter((o) => !beforeA.includes(o.id));
    const usualA = newA.filter((o) => !/sắc/i.test(o.khac)).sort((a, b) => a.date - b.date);
    const sacA = newA.filter((o) => /sắc/i.test(o.khac)).sort((a, b) => a.dateTH - b.dateTH);
    check(usualA.length === 3 && usualA.map((o) => o.thuoc.filter((x) => x.name === 'CAO THÔNG MẠCH').length).join() === '1,0,0', 'tick sẵn: Cao thông mạch added on day 1 only: ' + usualA.map((o) => o.thuoc.map((x) => x.name).join('/')).join(' | '));
    check(sacA.length === 3 && sacA.map((o) => o.dateTH.getDate()).join() === '12,13,14' && sacA.every((o) => o.status === 'Hoàn tất'), 'sắc: copied by itself for 3 days (thực hiện 12–14/10): ' + sacA.map((o) => o.dateTH.toString()).join(' | '));
    check(sacA[1] && hm(sacA[1].dateTH) === hm(usualA[0].dateTH) && sacA[1].date.getDate() === 12, 'sắc: day 2 thực hiện as the new usual order of 13/10, chỉ định on 12/10');
    const savedA = JSON.parse(fs.readFileSync(path.join(dataDir, 'data.json'), 'utf8'));
    check(savedA.runs[pA.noitruid + '|sac'] && savedA.runs[pA.noitruid + '|sac'].ok && savedA.runs[pA.noitruid].ok, 'sắc: both runs recorded');

    if (process.env.SHOTS) {
      await ui.click('[data-tab=pick]');
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
