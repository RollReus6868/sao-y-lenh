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
  },
  templates: [],
  choices: {}, // noitruid -> { days, deletions: [[baseKey...]...], hinhThuc, savedAt }
  runs: {}, // noitruid -> { at, ok, message }
  lists: null, // { at, bacSi: [{ id, name, login }], capDo: [{ id, ma, ten, text }] } read from OneMES
  benhAn: {}, // noitruid -> { values, savedAt, readAt, sentAt } Thông tin bệnh án being prepared
  benhAnMau: null, // { values, name, at } the filled-in example new patients start from
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
    patchRun(id, patch) {
      if (!data.runs[id]) return null;
      data.runs[id] = { ...data.runs[id], ...patch };
      save();
      return data.runs[id];
    },
    // Plain top-level entries (lists, benhAnMau).
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
