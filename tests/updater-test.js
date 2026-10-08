// Updater unit tests against a fake GitHub API (plain node, no Electron).
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createUpdater, cmpVersion, assetName, installKind } = require('../src/updater');
const { check, done } = require('./helpers');

(async () => {
  check(cmpVersion('0.10.0', '0.9.9') === 1 && cmpVersion('v1.0.0', '1.0.0') === 0 && cmpVersion('0.1.0', '0.1.1') === -1, 'version compare');
  check(assetName('1.2.3', 'win32') === 'SaoYLenh-1.2.3-windows-setup.exe', 'windows asset name');
  check(assetName('1.2.3', 'darwin', 'arm64') === 'SaoYLenh-1.2.3-mac-arm64.zip' && assetName('1.2.3', 'darwin', 'x64') === 'SaoYLenh-1.2.3-mac-x64.zip', 'mac asset names');
  check(installKind('/tmp/x/SaoYLenh.exe', 'win32') === 'manual', 'portable windows copy is manual');

  const payload = crypto.randomBytes(300000);
  const hash = crypto.createHash('sha256').update(payload).digest('hex');
  let mode = 'digest';
  const srv = http.createServer((req, res) => {
    const base = `http://127.0.0.1:${srv.address().port}`;
    if (req.url.endsWith('/releases/latest')) {
      if (mode === 'none') { res.writeHead(404); return res.end('{}'); }
      const asset = { name: 'SaoYLenh-9.9.9-windows-setup.exe', size: payload.length, browser_download_url: base + '/a' };
      if (mode === 'digest') asset.digest = 'sha256:' + hash;
      if (mode === 'bad') asset.digest = 'sha256:' + '0'.repeat(64);
      const assets = [asset];
      if (mode === 'sums') assets.push({ name: 'SHA256SUMS.txt', browser_download_url: base + '/sums' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ tag_name: 'v9.9.9', html_url: base + '/rel', body: 'notes', assets }));
    }
    if (req.url === '/a') { res.writeHead(200, { 'Content-Length': payload.length }); return res.end(payload); }
    if (req.url === '/sums') { res.writeHead(200); return res.end(`${hash}  SaoYLenh-9.9.9-windows-setup.exe\n`); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syl-upd-'));
  const mk = () => createUpdater({ fetch, currentVersion: '0.1.0', downloadDir: dir, quit: () => {}, api: `http://127.0.0.1:${srv.address().port}`, platform: 'win32', arch: 'x64', exePath: '/nowhere/SaoYLenh.exe' });
  try {
    let u = mk();
    let r = await u.check();
    check(r.available && r.version === '9.9.9' && r.kind === 'manual', 'newer release found');
    let f = await u.download();
    check(fs.readFileSync(f).equals(payload), 'download verified by digest');

    mode = 'sums';
    u = mk(); await u.check();
    f = await u.download();
    check(fs.existsSync(f), 'download verified by SHA256SUMS.txt');

    mode = 'bad';
    u = mk(); await u.check();
    let e = await u.download().catch((x) => x);
    check(e instanceof Error && /không khớp/.test(e.message) && !fs.existsSync(path.join(dir, 'SaoYLenh-9.9.9-windows-setup.exe')), 'bad hash refused and file removed');

    mode = 'nohash';
    u = mk(); await u.check();
    e = await u.download().catch((x) => x);
    check(e instanceof Error && /SHA-256/.test(e.message), 'missing hash refused');

    mode = 'none';
    u = mk();
    r = await u.check();
    check(r.available === false, 'no release (404) is not an error');

    const u2 = createUpdater({ fetch, currentVersion: '9.9.9', downloadDir: dir, quit: () => {}, api: `http://127.0.0.1:${srv.address().port}`, platform: 'win32' });
    mode = 'digest';
    check((await u2.check()).available === false, 'same version not offered');
  } finally {
    srv.close();
  }
  done();
})();
