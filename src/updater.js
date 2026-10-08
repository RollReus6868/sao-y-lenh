// Self-update from GitHub Releases. No top-level require('electron') so plain node
// can test it: the host passes fetch, paths and a quit function.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const REPO = 'RollReus6868/sao-y-lenh';
const APP = 'SaoYLenh';

function cmpVersion(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  return 0;
}

function assetName(version, platform = process.platform, arch = process.arch) {
  if (platform === 'win32') return `${APP}-${version}-windows-setup.exe`;
  if (platform === 'darwin') return `${APP}-${version}-mac-${arch === 'arm64' ? 'arm64' : 'x64'}.zip`;
  return null;
}

// "installer" when we can replace ourselves, otherwise "manual" (open the Releases page).
function installKind(exePath = process.execPath, platform = process.platform) {
  if (platform === 'win32') {
    const dir = path.dirname(exePath);
    return fs.existsSync(path.join(dir, `Uninstall ${APP}.exe`)) ? 'installer' : 'manual';
  }
  if (platform === 'darwin') {
    const m = /^(.*?\.app)\//.exec(exePath);
    if (!m || /AppTranslocation/.test(m[1])) return 'manual';
    try {
      fs.accessSync(path.dirname(m[1]), fs.constants.W_OK);
      return 'installer';
    } catch {
      return 'manual';
    }
  }
  return 'manual';
}

function createUpdater({ fetch, currentVersion, downloadDir, quit, log = () => {}, api, exePath, platform, arch }) {
  const apiBase = api || process.env.SYL_UPDATE_API || 'https://api.github.com';
  platform = platform || process.platform;
  arch = arch || process.arch;
  let latest = null;

  async function check() {
    const res = await fetch(`${apiBase}/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': APP },
    });
    if (res.status === 404) return { available: false };
    if (!res.ok) throw new Error('GitHub trả về ' + res.status);
    const rel = await res.json();
    const version = String(rel.tag_name || '').replace(/^v/, '');
    const name = assetName(version, platform, arch);
    const asset = (rel.assets || []).find((a) => a.name === name);
    latest = { version, asset, release: rel };
    return {
      available: cmpVersion(version, currentVersion) > 0 && !!asset,
      version,
      url: rel.html_url,
      notes: rel.body || '',
      kind: installKind(exePath, platform),
    };
  }

  async function expectedHash(rel, asset) {
    if (asset.digest && /^sha256:/.test(asset.digest)) return asset.digest.slice(7).toLowerCase();
    const sums = (rel.assets || []).find((a) => a.name === 'SHA256SUMS.txt');
    if (!sums) return null;
    const r = await fetch(sums.browser_download_url, { headers: { 'User-Agent': APP } });
    if (!r.ok) return null;
    const line = (await r.text()).split(/\r?\n/).find((l) => l.trim().endsWith(asset.name));
    return line ? line.trim().split(/\s+/)[0].toLowerCase() : null;
  }

  async function download(onProgress = () => {}) {
    if (!latest || !latest.asset) throw new Error('Chưa có thông tin bản mới');
    const { asset, release } = latest;
    const want = await expectedHash(release, asset);
    if (!want) throw new Error('Bản mới không có mã kiểm tra SHA-256, không cài');
    fs.mkdirSync(downloadDir, { recursive: true });
    const file = path.join(downloadDir, asset.name);
    const res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': APP } });
    if (!res.ok) throw new Error('Tải bản mới lỗi ' + res.status);
    const total = Number(res.headers.get('content-length')) || asset.size || 0;
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(file);
    let got = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const buf = Buffer.from(value);
      hash.update(buf);
      got += buf.length;
      if (!out.write(buf)) await new Promise((r) => out.once('drain', r));
      onProgress(total ? got / total : 0);
    }
    await new Promise((r, j) => {
      out.on('close', r);
      out.on('error', j);
      out.end();
    });
    const have = hash.digest('hex');
    if (have !== want) {
      fs.rmSync(file, { force: true });
      throw new Error('Mã kiểm tra không khớp, đã hủy bản tải');
    }
    log('info', `Đã tải ${asset.name}`);
    return file;
  }

  async function spawnRetry(cmd, args) {
    const end = Date.now() + 10000;
    for (;;) {
      try {
        const p = spawn(cmd, args, { detached: true, stdio: 'ignore' });
        await new Promise((res, rej) => {
          p.once('error', rej);
          p.once('spawn', res);
        });
        p.unref();
        return;
      } catch (e) {
        if (!/EBUSY|EACCES|EPERM/.test(e.code || e.message) || Date.now() > end) throw e;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  async function install(file) {
    if (platform === 'win32') {
      const args = ['/S', '--updated'];
      if (!process.env.SYL_UPDATE_NO_RELAUNCH) args.push('--force-run');
      await spawnRetry(file, args);
      quit();
      return;
    }
    if (platform === 'darwin') {
      const m = /^(.*?\.app)\//.exec(exePath || process.execPath);
      if (!m) throw new Error('Không xác định được vị trí ứng dụng');
      const appPath = m[1];
      const stage = path.join(downloadDir, 'new');
      fs.rmSync(stage, { recursive: true, force: true });
      fs.mkdirSync(stage, { recursive: true });
      execFileSync('ditto', ['-x', '-k', file, stage]);
      const newApp = fs.readdirSync(stage).find((x) => x.endsWith('.app'));
      if (!newApp) throw new Error('Gói cập nhật không có ứng dụng');
      const helper = path.join(downloadDir, 'swap.sh');
      fs.writeFileSync(
        helper,
        `#!/bin/bash
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done
OLD="${appPath}"; NEW="${path.join(stage, newApp)}"; BAK="$OLD.old"
rm -rf "$BAK"
mv "$OLD" "$BAK" && mv "$NEW" "$OLD" && rm -rf "$BAK" || { rm -rf "$OLD"; mv "$BAK" "$OLD"; }
${process.env.SYL_UPDATE_NO_RELAUNCH ? '' : 'open "$OLD"'}
`,
        { mode: 0o755 }
      );
      await spawnRetry('/bin/bash', [helper]);
      quit();
      return;
    }
    throw new Error('Hệ điều hành này không tự cập nhật được');
  }

  return { check, download, install };
}

module.exports = { createUpdater, cmpVersion, assetName, installKind, REPO };
