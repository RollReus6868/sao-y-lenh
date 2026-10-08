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
  },
  templates: [],
  choices: {}, // noitruid -> { days, deletions: [[baseKey...]...], hinhThuc, savedAt }
  runs: {}, // noitruid -> { at, ok, message }
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
  data = {
    ...DEFAULTS,
    ...data,
    settings: { ...DEFAULTS.settings, ...(data.settings || {}) },
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
    appendLog,
  };
}

module.exports = { createStore, DEFAULTS };
