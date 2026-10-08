// Real self-update of an installed app: a fake GitHub announces 9.9.9 and serves the
// installer/zip that was just built; the app must download, verify, quit and be replaced.
// Usage: node tests/update-e2e.js <app-executable> <artifact-to-serve> <marker-file>
//   Windows marker: a file inside the install dir (we append to it; the reinstall restores it).
//   macOS marker: the .app folder (its inode changes when swapped).
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { assetName } = require('../src/updater');

const [exe, artifact, marker] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const data = fs.readFileSync(artifact);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  const name = assetName('9.9.9');
  const srv = http.createServer((req, res) => {
    const base = `http://127.0.0.1:${srv.address().port}`;
    if (req.url.endsWith('/releases/latest')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ tag_name: 'v9.9.9', html_url: base, assets: [{ name, size: data.length, digest: 'sha256:' + hash, browser_download_url: base + '/asset' }] }));
    }
    if (req.url === '/asset') {
      res.writeHead(200, { 'Content-Length': data.length });
      return res.end(data);
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));

  const isMac = process.platform === 'darwin';
  let before;
  if (isMac) before = fs.statSync(marker).ino;
  else {
    before = fs.statSync(marker).size;
    fs.appendFileSync(marker, '\nMARKER-' + Date.now());
  }
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syl-upd-e2e-'));
  const app = spawn(exe, [], {
    env: { ...process.env, SYL_UPDATE_API: `http://127.0.0.1:${srv.address().port}`, SYL_AUTO_UPDATE: '1', SYL_UPDATE_NO_RELAUNCH: '1', SYL_DATA_DIR: dataDir },
    stdio: 'ignore',
  });
  const exited = new Promise((r) => app.on('exit', r));
  const t = await Promise.race([exited.then(() => 'exit'), sleep(180000).then(() => 'timeout')]);
  if (t === 'timeout') {
    app.kill();
    console.log('FAIL app did not quit to install the update');
    process.exit(1);
  }
  console.log('app quit for update');
  const keep = setInterval(() => {}, 1000); // the detached installer does not hold the loop open
  const end = Date.now() + 240000;
  let ok = false;
  while (Date.now() < end) {
    await sleep(2000);
    try {
      ok = isMac ? fs.statSync(marker).ino !== before : fs.statSync(marker).size === before;
    } catch {}
    if (ok) break;
  }
  clearInterval(keep);
  srv.close();
  const log = path.join(dataDir, 'logs');
  if (fs.existsSync(log)) for (const f of fs.readdirSync(log)) console.log(fs.readFileSync(path.join(log, f), 'utf8'));
  console.log(ok ? 'ok  app replaced by the downloaded build' : 'FAIL app was not replaced');
  process.exit(ok ? 0 : 1);
})();
