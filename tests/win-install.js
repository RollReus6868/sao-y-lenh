// Windows: silent NSIS install / uninstall with diagnostics.
// Usage: node tests/win-install.js install <setup.exe> <dir>
//        node tests/win-install.js uninstall <dir>
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [mode, a, b] = process.argv.slice(2);

function list(dir) {
  try {
    return fs.readdirSync(dir).join(', ');
  } catch (e) {
    return '(' + e.code + ')';
  }
}

(async () => {
  if (mode === 'install') {
    const setup = path.resolve(a);
    // "default" = where a user's double-click install goes (per-user Programs folder).
    const dir = b === 'default' ? path.join(process.env.LOCALAPPDATA, 'Programs', 'SaoYLenh') : b;
    console.log('installer', setup, fs.existsSync(setup) ? fs.statSync(setup).size : 'MISSING');
    // NSIS wants /D last and unquoted, even with spaces.
    const exe = path.join(dir, 'SaoYLenh.exe');
    // A freshly written installer occasionally crashes on the runner (0xC0000005, likely
    // the virus scanner); retry, and say so in the log.
    for (let attempt = 1; attempt <= 3 && !fs.existsSync(exe); attempt++) {
      await sleep(attempt === 1 ? 3000 : 10000);
      const r = spawnSync(b === 'default' ? `"${setup}" /S` : `"${setup}" /S /D=${dir}`, { shell: true, windowsVerbatimArguments: true, stdio: 'inherit' });
      console.log(`attempt ${attempt}: installer exit`, r.status, r.error || '');
      for (let i = 0; i < 30 && !fs.existsSync(exe); i++) await sleep(2000);
    }
    console.log('install dir:', list(dir));
    const local = path.join(process.env.LOCALAPPDATA || '', 'Programs');
    console.log('LOCALAPPDATA\\Programs:', list(local), '| sao-y-lenh:', list(path.join(local, 'sao-y-lenh')));
    const ok = fs.existsSync(exe) && fs.existsSync(path.join(dir, 'Uninstall SaoYLenh.exe'));
    console.log(ok ? 'ok  installed' : 'FAIL not installed');
    process.exit(ok ? 0 : 1);
  }
  if (mode === 'debug') {
    // Try variants and report which one installs.
    const setup = path.resolve(a, fs.readdirSync(a).find((f) => f.endsWith('.exe')));
    const run = (cmd) => { const t = Date.now(); const r = spawnSync(cmd, { shell: true, windowsVerbatimArguments: true, stdio: 'inherit' }); return `exit ${r.status} in ${Date.now() - t} ms`; };
    const local = path.join(process.env.LOCALAPPDATA, 'Programs');
    const tries = [
      ['default', `"${setup}" /S`, path.join(local, 'sao-y-lenh')],
      ['D no spaces', `"${setup}" /S /D=C:\\TestApps\\SYL`, 'C:\\TestApps\\SYL'],
      ['D spaces', `"${setup}" /S /D=C:\\Test Apps\\Sao Y Lenh`, 'C:\\Test Apps\\Sao Y Lenh'],
      ['D spaces user', `"${setup}" /S /D=${process.env.LOCALAPPDATA}\\Test Apps\\SYL`, `${process.env.LOCALAPPDATA}\\Test Apps\\SYL`],
    ];
    for (const [name, cmd, dir] of tries) {
      const r = run(cmd);
      for (let i = 0; i < 30 && !fs.existsSync(path.join(dir, 'SaoYLenh.exe')); i++) await sleep(2000);
      console.log(`== ${name}: ${r}; ${dir}: ${list(dir)}`);
    }
    console.log('Programs:', list(local));
    process.exit(1);
  }
  if (mode === 'uninstall') {
    const dir = a;
    const un = path.join(dir, 'Uninstall SaoYLenh.exe');
    const r = spawnSync(`"${un}" /S`, { shell: true, windowsVerbatimArguments: true, stdio: 'inherit' });
    console.log('uninstaller exit', r.status);
    const exe = path.join(dir, 'SaoYLenh.exe');
    for (let i = 0; i < 60 && fs.existsSync(exe); i++) await sleep(2000);
    const ok = !fs.existsSync(exe);
    console.log(ok ? 'ok  uninstalled' : 'FAIL exe still there: ' + list(dir));
    process.exit(ok ? 0 : 1);
  }
})();
