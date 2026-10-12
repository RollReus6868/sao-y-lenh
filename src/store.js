// Settings, delete templates, per-patient choices and the run log, kept as JSON in
// the user data folder. Plain node so tests can use it.
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  settings: {
    baseUrl: 'http://192.168.30.19:2026/',
    autoComplete: true,
    stepMode: false,
    hinhThuc: '1',
    defaultDays: 3,
    bacSiFav: [], // [{ id, name }] shown first in the per-day Bác sĩ dropdown
    esBase: 'http://192.168.30.88:9200', // fallback when the page does not name its search service
    gpuOff: process.platform === 'win32', // software rendering: stops the window flicker on some PCs
    viewZoom: 0.7, // zoom of the OneMES page in Trình duyệt (the user found 100% too close)
    // Drugs the user can tick to add per day (Kê Tây y/VTYT). Defaults as the user enters them by hand.
    themThuoc: [
      { id: 'con-xoa-bop', label: 'Cồn xoa bóp', kho: 'KCPSX', ten: 'CỒN XOA BÓP', tim: 'cồn xoa', sl: '1', cachDung: 'Mỗi lần dùng 5ml, xoa bóp các chỗ đau 4 lần/ngày', loai: 'KÊ LĨNH' },
      { id: 'cao-thong-mach', label: 'Cao thông mạch', kho: 'KCPSX', ten: 'CAO THÔNG MẠCH', tim: 'cao thông', sl: '1', cachDung: 'Uống 20ml/lần * 2 lần/ngày * 3 ngày (sáng, chiều) sau ăn', loai: 'KÊ LĨNH' },
    ],
  },
  templates: [],
  choices: {}, // noitruid -> { days, deletions: [[baseKey...]...], edits, adds: [[themThuoc id...]...], savedAt }
  runs: {}, // noitruid -> { at, ok, message }
  lists: null, // { at, bacSi: [{ id, name, login }], capDo: [{ id, ma, ten, text }] } read from OneMES
  benhAn: {}, // noitruid -> { values, savedAt, readAt, sentAt } Thông tin bệnh án being prepared
  benhAnMaus: [], // [{ id, name, values, at }] filled-in Thông tin bệnh án examples
  benhAnMauId: null, // the example new patients start from
  dvScans: {}, // noitruid -> { days: [{ id, tg, items: [{ id, name, trangThai, action }] }], at } old services to clean
};

function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'data.json');
  const logDir = path.join(dir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    data = {};
  }
  const fresh = JSON.parse(JSON.stringify(DEFAULTS));
  data = {
    ...fresh,
    ...data,
    settings: { ...fresh.settings, ...(data.settings || {}) },
  };
  // Before 0.3.4 there was one example (benhAnMau); it becomes the first in the list.
  if (data.benhAnMau) {
    if (!data.benhAnMaus.length && data.benhAnMau.values) {
      data.benhAnMaus = [{ id: 'mau-1', name: data.benhAnMau.name || 'Mẫu 1', values: data.benhAnMau.values, at: data.benhAnMau.at || Date.now() }];
      data.benhAnMauId = 'mau-1';
    }
    delete data.benhAnMau;
  }

  function save() {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
    fs.renameSync(tmp, file);
  }

  const pad = (n) => String(n).padStart(2, '0');
  function appendLog(entry) {
    const d = new Date(entry.at || Date.now());
    const f = path.join(logDir, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`);
    const line = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} [${entry.level}] ${entry.msg}\n`;
    try {
      fs.appendFileSync(f, line);
    } catch {}
  }

  return {
    dir,
    logDir,
    get: () => data,
    setSettings(s) {
      data.settings = { ...data.settings, ...s };
      save();
      return data.settings;
    },
    setTemplates(t) {
      data.templates = Array.isArray(t) ? t : [];
      save();
      return data.templates;
    },
    setChoice(id, c) {
      if (c) data.choices[id] = { ...c, savedAt: Date.now() };
      else delete data.choices[id];
      save();
    },
    setRun(id, r) {
      data.runs[id] = { ...r, at: Date.now() };
      save();
    },
    setDvScan(id, r) {
      if (r) data.dvScans[id] = r;
      else delete data.dvScans[id];
      save();
      return data.dvScans[id] || null;
    },
    patchRun(id, patch) {
      if (!data.runs[id]) return null;
      data.runs[id] = { ...data.runs[id], ...patch };
      save();
      return data.runs[id];
    },
    // Bệnh án examples. `m.id` overwrites that one, otherwise a new one is added.
    // Returns { benhAnMaus, benhAnMauId }.
    saveMau(m) {
      const list = data.benhAnMaus;
      const old = m.id && list.find((x) => x.id === m.id);
      const name = String(m.name || '').trim();
      if (old) Object.assign(old, { name: name || old.name, values: m.values || old.values, at: Date.now() });
      else {
        const id = 'mau-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        list.push({ id, name: name || `Mẫu ${list.length + 1}`, values: m.values || {}, at: Date.now() });
        if (!data.benhAnMauId || m.makeDefault) data.benhAnMauId = id;
        m = { ...m, id };
      }
      if (m.makeDefault) data.benhAnMauId = m.id;
      save();
      return { benhAnMaus: data.benhAnMaus, benhAnMauId: data.benhAnMauId, id: m.id };
    },
    renameMau(id, name) {
      const m = data.benhAnMaus.find((x) => x.id === id);
      if (m && String(name || '').trim()) m.name = String(name).trim();
      save();
      return { benhAnMaus: data.benhAnMaus, benhAnMauId: data.benhAnMauId };
    },
    deleteMau(id) {
      data.benhAnMaus = data.benhAnMaus.filter((x) => x.id !== id);
      if (data.benhAnMauId === id) data.benhAnMauId = data.benhAnMaus[0] ? data.benhAnMaus[0].id : null;
      save();
      return { benhAnMaus: data.benhAnMaus, benhAnMauId: data.benhAnMauId };
    },
    defaultMau(id) {
      if (data.benhAnMaus.some((x) => x.id === id)) data.benhAnMauId = id;
      save();
      return { benhAnMaus: data.benhAnMaus, benhAnMauId: data.benhAnMauId };
    },
    // Plain top-level entries (lists).
    set(key, value) {
      data[key] = value;
      save();
      return data[key];
    },
    setBenhAn(id, patch) {
      if (patch === null) delete data.benhAn[id];
      else data.benhAn[id] = { ...(data.benhAn[id] || {}), ...patch };
      save();
      return data.benhAn[id] || null;
    },
    appendLog,
  };
}

module.exports = { createStore, DEFAULTS };
