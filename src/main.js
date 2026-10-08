// Electron main process: the window, the embedded OneMES view, and the commands the
// UI calls. Automation lives in driver.js; this file only wires it up.
'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, net } = require('electron');
const path = require('path');
const { createStore } = require('./store');
const { createDriver } = require('./driver');
const { createUpdater } = require('./updater');
const pkg = require('../package.json');

if (process.env.SYL_DATA_DIR) app.setPath('userData', path.resolve(process.env.SYL_DATA_DIR));
if (!app.requestSingleInstanceLock()) app.quit();

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

function push(extra = {}) {
  Object.assign(state, extra);
  if (win && !win.isDestroyed()) win.webContents.send('state', state);
}
function log(level, msg) {
  const e = { at: Date.now(), level, msg };
  logBuf.push(e);
  if (logBuf.length > 1000) logBuf.shift();
  store.appendLog(e);
  if (win && !win.isDestroyed()) win.webContents.send('log', e);
}

// ---------- OneMES view ----------
function setupView() {
  const ses = session.fromPartition('persist:onemes');
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|SaoYLenh|sao-y-lenh)\/\S+/gi, ''));
  view = new WebContentsView({ webPreferences: { session: ses, backgroundThrottling: false } });
  win.contentView.addChildView(view);
  // Hidden until the Trình duyệt page shows it; the page keeps its size so OneMES lays out normally.
  placeView();
  const wc = view.webContents;
  const upd = () => {
    const u = wc.getURL();
    if (/wpid=danhsachdieutrinoitrudraw/i.test(u) && !/bacsidraw/i.test(u)) lastListUrl = u.replace(/#.*$/, '');
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

// The view is shown only on the Trình duyệt page. Hiding moves it out of the window as
// well as setVisible(false): on some Windows setups setVisible alone leaves it painted
// over the rest of the UI. It keeps its size so OneMES lays out normally while hidden.
let viewShown = false;
let viewBounds = { x: 0, y: 0, width: 1280, height: 800 };
function placeView() {
  if (!view) return;
  const { width, height } = viewBounds;
  view.setBounds(viewShown ? viewBounds : { x: -width - 200, y: -height - 200, width, height });
  view.setVisible(viewShown);
}
function applyBounds(b) {
  if (!b || b.width < 10 || b.height < 10) return;
  viewBounds = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
  if (viewShown) placeView();
}

// ---------- automation ----------
function makeDriver() {
  return createDriver({
    exec: (code) => view.webContents.executeJavaScript(code, true),
    loadURL,
    listUrl: () => lastListUrl,
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
  }),
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
  'view:state': () => ({ shown: viewShown, visible: view.getVisible(), bounds: view.getBounds() }),
  'view:nav': async ({ action }) => {
    const wc = view.webContents;
    if (action === 'home') goHome();
    else if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (action === 'reload') wc.reload();
    else if (action === 'list') {
      if (state.busy) throw new Error('Tool đang thao tác, hãy đợi xong');
      try {
        await makeDriver().gotoList();
      } catch (e) {
        throw new Error(/đăng nhập/i.test(errMsg(e)) ? 'Hãy đăng nhập OneMES trước' : errMsg(e));
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
      return r;
    }),
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
          store.setRun(p.patient.noitruid, { ok: true, message: `${p.days} ngày` });
          out.push({ noitruid: p.patient.noitruid, ok: true, result: r });
        } catch (e) {
          const msg = errMsg(e);
          log(e.stopped ? 'warn' : 'error', `${p.patient.hoTen}: ${msg}`);
          store.setRun(p.patient.noitruid, { ok: false, message: msg });
          out.push({ noitruid: p.patient.noitruid, ok: false, message: msg, stopped: !!e.stopped });
          if (e.stopped) break;
        }
      }
      return out;
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

function pickSettings() {
  const s = store.get().settings;
  return { autoComplete: s.autoComplete, hinhThuc: s.hinhThuc };
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
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
