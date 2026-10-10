// Electron main process: the window, the embedded OneMES view, and the commands the
// UI calls. Automation lives in driver.js; this file only wires it up.
'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { createStore } = require('./store');
const { createDriver } = require('./driver');
const { createUpdater } = require('./updater');
const pkg = require('../package.json');
const BENH_AN = require('./benh-an-schema.json');
const BA_FIELDS = BENH_AN.groups.flatMap((g) => g.fields.map((f) => ({ id: f.id, kind: f.kind, part: g.part })));

if (process.env.SYL_DATA_DIR) app.setPath('userData', path.resolve(process.env.SYL_DATA_DIR));
if (!app.requestSingleInstanceLock()) app.quit();

// Software rendering is chosen before the window exists: on some Windows PCs the
// GPU path makes the whole window flicker while the OneMES page repaints.
const gpuOff = (() => {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'data.json'), 'utf8')).settings || {};
    if (typeof s.gpuOff === 'boolean') return s.gpuOff;
  } catch {}
  return process.platform === 'win32';
})();
if (gpuOff && !process.env.SYL_GPU_ON) app.disableHardwareAcceleration();

let win = null;
let view = null;
let store = null;
let updater = null;
let lastListUrl = ''; // last Ds Điều trị nội trú address seen in the view (carries the session id)

const state = {
  busy: false,
  task: '',
  stepWaiting: null,
  progress: null, // { patient, index, total }
  viewUrl: '',
  update: null, // { version, kind, downloading, progress, error }
};
const logBuf = [];
let stopFlag = false;
let stepResolve = null;

// State and log lines reach the UI in batches (at most ~8 a second), so a busy run
// does not make the window redraw on every step.
let outbox = { state: false, logs: [] };
let flushTimer = null;
function flush() {
  flushTimer = null;
  if (!win || win.isDestroyed()) return;
  if (outbox.logs.length) win.webContents.send('log', outbox.logs);
  if (outbox.state) win.webContents.send('state', state);
  outbox = { state: false, logs: [] };
}
function schedule() {
  if (!flushTimer) flushTimer = setTimeout(flush, 120);
}
function push(extra = {}) {
  Object.assign(state, extra);
  outbox.state = true;
  schedule();
}
function log(level, msg) {
  const e = { at: Date.now(), level, msg };
  logBuf.push(e);
  if (logBuf.length > 1000) logBuf.shift();
  store.appendLog(e);
  outbox.logs.push(e);
  schedule();
}

// ---------- OneMES view ----------
function setupView() {
  const ses = session.fromPartition('persist:onemes');
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|SaoYLenh|sao-y-lenh)\/\S+/gi, ''));
  view = new WebContentsView({
    webPreferences: { session: ses, backgroundThrottling: false, sandbox: true, spellcheck: false, preload: path.join(__dirname, 'view-preload.js') },
  });
  // Not in the window until the Trình duyệt page shows it; it keeps its size so OneMES lays out normally.
  placeView();
  const wc = view.webContents;
  const upd = () => {
    const u = wc.getURL();
    if (/wpid=danhsachdieutrinoitrudraw/i.test(u) && !/bacsidraw/i.test(u)) {
      lastListUrl = u.replace(/#.*$/, '');
      const role = (/[?&]role=(\d+)/.exec(u) || [])[1];
      if (role && store.get().settings.listRole !== role) store.setSettings({ listRole: role });
    }
    push({ viewUrl: u, canGoBack: wc.navigationHistory.canGoBack() });
  };
  wc.on('did-navigate', upd);
  wc.on('did-navigate-in-page', upd);
  wc.on('did-finish-load', upd);
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (isMain && code !== -3) log('error', `Không mở được OneMES (${desc}): ${url}`);
  });
  // OneMES opens reports in new windows: keep them in normal child windows on the same session.
  wc.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: { width: 1100, height: 800, autoHideMenuBar: true, webPreferences: { session: ses } },
  }));
  goHome();
}

function goHome() {
  const url = process.env.SYL_ONEMES_URL || store.get().settings.baseUrl;
  view.webContents.loadURL(url).catch(() => {});
}

function loadURL(url) {
  return view.webContents.loadURL(url).catch((e) => {
    // ERR_ABORTED (-3) happens when the page redirects itself; the poller decides.
    if (!/ERR_ABORTED|-3/.test(String(e && e.message))) throw e;
  });
}

// The view is part of the window only while the Trình duyệt page is shown. Taken out
// of the window it paints nothing, so a page loading in the background cannot make
// the rest of the UI flicker or cover it. The page keeps running and keeps its size.
let viewShown = false;
let viewBounds = { x: 0, y: 0, width: 1280, height: 800 };
function placeView() {
  if (!view || !win || win.isDestroyed()) return;
  const attached = win.contentView.children.includes(view);
  view.setBounds(viewBounds);
  if (viewShown) {
    if (!attached) win.contentView.addChildView(view);
    view.setVisible(true);
  } else {
    view.setVisible(false);
    if (attached) win.contentView.removeChildView(view);
  }
}
function applyBounds(b) {
  if (!b || b.width < 10 || b.height < 10) return;
  viewBounds = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
  placeView();
}

// ---------- automation ----------
function makeDriver() {
  return createDriver({
    exec: (code) => view.webContents.executeJavaScript(code, true),
    loadURL,
    listUrl: () => lastListUrl,
    listRole: () => store.get().settings.listRole || '',
    log,
    stopped: () => stopFlag,
    step: async (desc) => {
      if (!store.get().settings.stepMode) return;
      push({ stepWaiting: desc });
      await new Promise((r) => (stepResolve = r));
      push({ stepWaiting: null });
    },
  });
}

async function task(name, fn) {
  if (state.busy) throw new Error('Đang chạy việc khác');
  stopFlag = false;
  push({ busy: true, task: name, stepWaiting: null });
  try {
    return await fn(makeDriver());
  } finally {
    stepResolve = null;
    push({ busy: false, task: '', stepWaiting: null, progress: null });
  }
}

function errMsg(e) {
  return (e && e.message) || String(e);
}

const commands = {
  init: () => ({
    version: pkg.version,
    platform: process.platform,
    data: store.get(),
    state,
    log: logBuf.slice(-300),
    logDir: store.logDir,
    gpuOff,
    benhAnSchema: BENH_AN,
  }),
  'app:restart': () => {
    app.relaunch();
    setTimeout(() => app.exit(0), 200);
  },
  'settings:set': (s) => {
    const before = store.get().settings.baseUrl;
    const r = store.setSettings(s || {});
    if (r.baseUrl !== before) goHome();
    return r;
  },
  'templates:set': (t) => store.setTemplates(t),
  'choice:set': ({ id, choice }) => store.setChoice(id, choice),
  'view:bounds': (b) => applyBounds(b),
  'view:visible': (v) => {
    viewShown = !!v;
    placeView();
  },
  'view:state': () => ({ shown: viewShown, visible: view.getVisible(), attached: win.contentView.children.includes(view), bounds: view.getBounds() }),
  'view:nav': async ({ action }) => {
    const wc = view.webContents;
    if (action === 'home') goHome();
    else if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (action === 'reload') wc.reload();
    else if (action === 'list') {
      if (state.busy) throw new Error('Tool đang thao tác, hãy đợi xong');
      try {
        await makeDriver().gotoList(true);
        log('info', 'Đã mở Ds Điều trị nội trú');
      } catch (e) {
        const m = /đăng nhập/i.test(errMsg(e)) ? 'Hãy đăng nhập OneMES trước' : errMsg(e);
        log('warn', `Không mở được Ds Điều trị nội trú: ${m}`);
        throw new Error(m);
      }
    }
  },
  scan: () =>
    task('Quét danh sách', async (d) => {
      log('info', 'Quét Ds Điều trị nội trú');
      return d.scanPatients();
    }),
  'patient:load': ({ patient, sourceId }) =>
    task('Đọc y lệnh', async (d) => {
      const r = await d.loadPatient(patient, sourceId);
      if (!r.source) log('warn', `${patient.hoTen}: không có y lệnh Hoàn tất nào đủ Diễn biến bệnh và Diễn biến PHCN`);
      // The Bác sĩ / Cấp độ chăm sóc choices are read once and kept.
      let lists = null;
      if (!store.get().lists) lists = await readLists(d).catch(() => null);
      return { ...r, lists };
    }),
  'lists:load': () => task('Đọc danh sách bác sĩ', (d) => readLists(d)),
  run: ({ plans }) =>
    task('Sao chép y lệnh', async (d) => {
      const out = [];
      for (let i = 0; i < plans.length; i++) {
        const p = { ...plans[i], ...pickSettings() };
        push({ progress: { patient: p.patient.hoTen, index: i, total: plans.length } });
        try {
          if (!p.sourceId) {
            const r = await d.loadPatient(p.patient);
            if (!r.source) throw new Error('Không có y lệnh nguồn phù hợp');
            p.sourceId = r.source.id;
            if (p.baseDeletions) p.deletions = resolveKeys(r.source, p.baseDeletions);
          }
          const r = await d.run(p);
          const check = await checkAfter(d, p.patient, r);
          store.setRun(p.patient.noitruid, { ok: true, message: `${p.days} ngày`, ...runRecord(r), check });
          forgetNotes(p.patient.noitruid);
          out.push({ noitruid: p.patient.noitruid, ok: true, result: r, check });
          if (stopFlag) break;
        } catch (e) {
          const msg = errMsg(e);
          log(e.stopped ? 'warn' : 'error', `${p.patient.hoTen}: ${msg}`);
          // Whatever was created before the error still gets checked, so it can be fixed or removed.
          const part = e.partial && e.partial.days.length ? e.partial : null;
          const check = part && !e.stopped ? await checkAfter(d, p.patient, part) : null;
          store.setRun(p.patient.noitruid, { ok: false, message: msg, ...(part ? runRecord(part) : {}), check });
          out.push({ noitruid: p.patient.noitruid, ok: false, message: msg, stopped: !!e.stopped, check });
          if (e.stopped) break;
        }
      }
      return out;
    }),
  'patient:check': ({ patient }) =>
    task('Kiểm tra lại', async (d) => {
      const run = store.get().runs[patient.noitruid];
      const ids = ((run && run.days) || []).filter((x) => !x.deleted);
      if (!ids.length) throw new Error('Chưa có ngày nào do tool tạo để kiểm tra');
      const check = await d.verify(patient, run.expect, ids);
      return store.patchRun(patient.noitruid, { check: keepDeleted(run.check, check) });
    }),
  'order:delete': ({ patient, id }) =>
    task('Xóa y lệnh', async (d) => {
      const run = store.get().runs[patient.noitruid];
      const day = run && (run.days || []).find((x) => x.id === id);
      // Only orders this tool created can be deleted from here.
      if (!day) throw new Error('Chỉ xóa được y lệnh do tool vừa tạo');
      log('info', `${patient.hoTen}: xóa y lệnh ngày ${day.day} (${day.time || ''})`);
      await d.deleteOrder(patient, id);
      const days = run.days.map((x) => (x.id === id ? { ...x, deleted: true } : x));
      const check = run.check && { ...run.check, days: run.check.days.map((x) => (x.id === id ? { ...x, deleted: true } : x)) };
      return store.patchRun(patient.noitruid, { days, check });
    }),
  'order:update': ({ patient, id, edit, remove }) =>
    task('Sửa y lệnh', async (d) => {
      const run = store.get().runs[patient.noitruid];
      const day = run && (run.days || []).find((x) => x.id === id && !x.deleted);
      if (!day) throw new Error('Chỉ sửa được y lệnh do tool vừa tạo');
      log('info', `${patient.hoTen}: sửa y lệnh ngày ${day.day} (${day.time || ''})`);
      await d.updateDay(patient, id, edit || null, remove || [], store.get().settings.autoComplete);
      // What this day should now hold, then read it back.
      const expect = run.expect ? { ...run.expect, days: run.expect.days.map((e) => (e.day === day.day ? expectAfterEdit(e, edit, remove) : e)) } : null;
      const one = await d.verify(patient, expect, [{ day: day.day, id }]);
      const days = ((run.check && run.check.days) || []).filter((x) => x.id !== id).concat(one.days).sort((a, b) => a.day - b.day);
      return store.patchRun(patient.noitruid, { expect, check: { at: one.at, ok: !days.some((x) => !x.deleted && x.problems.length), days } });
    }),
  'benhAn:set': ({ id, values }) => store.setBenhAn(id, { values, savedAt: Date.now() }),
  'benhAn:clear': ({ id }) => store.setBenhAn(id, null),
  'benhAnMau:set': (m) => store.set('benhAnMau', m && m.values ? { values: m.values, name: m.name || '', at: Date.now() } : null),
  'benhAn:read': ({ patient }) =>
    task('Đọc bệnh án', async (d) => {
      const r = await d.readBenhAn(patient, BA_FIELDS);
      return store.setBenhAn(patient.noitruid, { values: r.values, readAt: r.at, savedAt: r.at });
    }),
  'benhAn:save': ({ patient, values }) =>
    task('Ghi bệnh án', async (d) => {
      store.setBenhAn(patient.noitruid, { values, savedAt: Date.now() });
      const r = await d.saveBenhAn(patient, BA_FIELDS, values);
      return store.setBenhAn(patient.noitruid, { values: r.values, sentAt: r.at, readAt: r.at, savedAt: r.at, diff: r.diff, missing: r.missing, kept: r.kept, filled: r.filled });
    }),
  stop: () => {
    stopFlag = true;
    if (stepResolve) stepResolve();
    log('warn', 'Đã bấm Dừng');
  },
  'step:continue': () => {
    if (stepResolve) stepResolve();
  },
  'log:open': () => shell.openPath(store.logDir),
  'update:check': () => checkUpdate(true),
  'update:install': () => installUpdate(),
  'open:releases': () => shell.openExternal(`https://github.com/RollReus6868/sao-y-lenh/releases/latest`),
};

async function readLists(d) {
  const r = await d.loadLists(store.get().settings.esBase);
  return store.set('lists', { at: Date.now(), bacSi: r.bacSi, capDo: r.capDo });
}

// After a run the copied days hold the corrected notes, so they are not applied again
// next time (the newest day becomes the source). Time, doctor and care level stay.
function forgetNotes(id) {
  const c = store.get().choices[id];
  if (!c || !c.edits) return;
  const edits = c.edits.map((e) => {
    if (!e) return e;
    const { dienBien, dienBienPHCN, ...rest } = e;
    return Object.keys(rest).length ? rest : null;
  });
  store.setChoice(id, { ...c, edits });
}

// A corrected day's expectation: removed items are now meant to be gone.
function expectAfterEdit(e, edit, remove) {
  const want = { ...e.want };
  const gone = { ...e.gone };
  for (const it of remove || []) {
    if (want[it.base] > 0) want[it.base] -= 1;
    if (!want[it.base]) delete want[it.base];
    gone[it.base] = (gone[it.base] || 0) + 1;
  }
  const merged = { ...(e.edit || {}) };
  for (const [k, v] of Object.entries(edit || {})) if (v !== undefined && v !== null && v !== '') merged[k] = v;
  // A drug the tool added and the user now removes is no longer expected.
  const low = (x) => String(x || '').normalize('NFC').toLowerCase().trim();
  const add = (e.add || []).filter((a) => !(remove || []).some((it) => low(it.name).startsWith(low(a.ten))));
  return { ...e, want, gone, add, edit: Object.keys(merged).length ? merged : null };
}

function runRecord(r) {
  return { expect: r.expect || null, days: r.days.map((x) => ({ day: x.day, id: x.id, time: x.time })) };
}

async function checkAfter(d, patient, r) {
  try {
    return await d.verify(patient, r.expect, r.days);
  } catch (e) {
    log('warn', e.stopped ? `${patient.hoTen}: đã dừng, chưa kiểm tra lại` : `${patient.hoTen}: không kiểm tra lại được (${errMsg(e)})`);
    return null;
  }
}

// A re-check does not see deleted orders; keep them listed as deleted.
function keepDeleted(old, fresh) {
  const gone = ((old && old.days) || []).filter((x) => x.deleted && !fresh.days.some((y) => y.id === x.id));
  return { ...fresh, days: [...fresh.days, ...gone].sort((a, b) => a.day - b.day) };
}

function pickSettings() {
  const s = store.get().settings;
  return { autoComplete: s.autoComplete, hinhThuc: s.hinhThuc, addItems: s.themThuoc || [] };
}

// Saved choices keep base keys (name-based); turn them into this source's item keys.
function resolveKeys(source, baseDeletions) {
  const items = [...source.thuoc, ...source.dvkt];
  return baseDeletions.map((day) => items.filter((it) => day.includes(it.key.replace(/#\d+$/, ''))).map((it) => it.key));
}

// ---------- updates ----------
async function checkUpdate(manual) {
  try {
    const r = await updater.check();
    if (r.available) {
      push({ update: { version: r.version, kind: r.kind, url: r.url } });
      log('info', `Có bản mới ${r.version}`);
      if (process.env.SYL_AUTO_UPDATE) installUpdate(); // CI self-update test
    } else if (manual) log('info', 'Đang dùng bản mới nhất');
    return r;
  } catch (e) {
    if (manual) log('warn', 'Không kiểm tra được bản mới: ' + errMsg(e));
    return { available: false, error: errMsg(e) };
  }
}

async function installUpdate() {
  const u = state.update;
  if (!u) return;
  if (u.kind !== 'installer') return shell.openExternal(u.url);
  if (state.busy) throw new Error('Đang chạy, hãy đợi xong rồi cập nhật');
  try {
    push({ update: { ...u, downloading: true, progress: 0 } });
    const file = await updater.download((p) => push({ update: { ...state.update, progress: p } }));
    log('info', 'Đang cài bản mới, tool sẽ tự mở lại');
    await updater.install(file);
  } catch (e) {
    push({ update: { ...u, downloading: false, error: errMsg(e) } });
    log('error', 'Cập nhật lỗi: ' + errMsg(e));
  }
}

// ---------- app ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1100,
    minHeight: 640,
    title: 'Sao Y Lệnh',
    backgroundColor: '#0b0b0f',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'ui_dist', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  setupView();
  win.on('closed', () => {
    win = null;
    // The view may be out of the window at this point, so close its page explicitly.
    if (view && !view.webContents.isDestroyed()) view.webContents.close();
  });
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  store = createStore(app.getPath('userData'));
  log('info', `Sao Y Lệnh ${pkg.version} khởi động`);
  updater = createUpdater({
    fetch: (u, o) => net.fetch(u, o),
    currentVersion: pkg.version,
    downloadDir: path.join(app.getPath('temp'), 'SaoYLenh-update'),
    quit: () => setTimeout(() => app.quit(), 300),
    log,
  });
  ipcMain.handle('call', async (_e, cmd, payload) => {
    const fn = commands[cmd];
    if (!fn) throw new Error('Lệnh lạ: ' + cmd);
    return fn(payload === undefined || payload === null ? {} : payload);
  });
  createWindow();
  if (!process.env.SYL_NO_UPDATE_CHECK) setTimeout(() => checkUpdate(false), 4000);
});

app.on('window-all-closed', () => app.quit());

module.exports = { resolveKeys };
