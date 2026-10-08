// Drives the OneMES page through the injected page agent. Pure Node: the host
// (Electron main, or a Playwright test) supplies exec/loadURL, so the same code is
// tested against the mock and runs inside the app.
'use strict';
const fs = require('fs');
const path = require('path');

const AGENT = fs.readFileSync(path.join(__dirname, 'agent', 'page-agent.js'), 'utf8');

class StopError extends Error {
  constructor() {
    super('Đã dừng theo yêu cầu');
    this.stopped = true;
  }
}
class PageError extends Error {}

const norm = (s) =>
  String(s || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// "07:04 13/10/2026" -> Date (local), or null.
function parseTime(s) {
  const m = /(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || '');
  if (!m) return null;
  return new Date(+m[5], +m[4] - 1, +m[3], +m[1], +m[2]);
}
const ddmmOf = (d) => `${d.getDate()}/${d.getMonth() + 1}`;
const dayStamp = (d) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : '');
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());

// Stable key per item: kind | name | strength-or-description, plus the occurrence
// number so two identical rows stay distinct. Keys carry across copied days.
function baseKey(it) {
  return it.kind === 'thuoc' ? `t|${norm(it.name)}|${norm(it.hamLuong)}` : `d|${norm(it.name)}|${norm(it.moTa)}`;
}
function withKeys(items) {
  const seen = {};
  return items.map((it) => {
    const b = baseKey(it);
    seen[b] = (seen[b] || 0) + 1;
    return { ...it, key: `${b}#${seen[b]}` };
  });
}

const isError = (s) =>
  s && s.visible && !s.cancelText && (/cảnh báo|lỗi|error/i.test(s.title) || s.type === 'error' || s.type === 'warning');

function createDriver(host) {
  const {
    exec, // (code) => Promise<any>   evaluate in the OneMES page
    loadURL, // (url) => Promise
    log = () => {},
    stopped = () => false,
    step = async () => {}, // awaited before each change to OneMES (step-by-step mode)
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    timeout = 25000,
  } = host;

  async function call(fn, ...args) {
    const a = args.map((x) => JSON.stringify(x)).join(',');
    return exec(`(function(){if(!window.__SYL||window.__SYL.version!==4){${AGENT}\n}return window.__SYL.${fn}(${a});})()`);
  }

  function checkStop() {
    if (stopped()) throw new StopError();
  }

  // Polls fn until it returns a truthy value. A rejected evaluation (page reloading)
  // counts as "not yet". An OneMES warning dialog aborts with its message.
  async function waitFor(what, fn, ms = timeout) {
    const end = Date.now() + ms;
    for (;;) {
      checkStop();
      let r;
      try {
        r = await fn();
      } catch (e) {
        r = undefined;
        if (process.env.DBG) console.error('waitFor', what, e.message);
        if (e instanceof PageError || e instanceof StopError) throw e;
      }
      if (r) return r;
      if (Date.now() > end) throw new PageError(`Quá thời gian chờ: ${what}`);
      await sleep(150);
    }
  }

  async function failOnAlert() {
    const s = await call('swal');
    if (isError(s)) {
      if (!s.ready) return { visible: true, ready: false }; // let it settle, then close it
      await call('swalClick', 'confirm');
      throw new PageError(`OneMES báo: ${s.text || s.title}`);
    }
    return s;
  }

  // Wait for a confirm dialog whose button reads one of `labels`, then press it.
  async function confirmDialog(labels, what) {
    const s = await waitFor(what, async () => {
      const x = await failOnAlert();
      return x.visible && x.ready && x.cancelText ? x : null;
    });
    if (!labels.some((l) => norm(l) === norm(s.confirmText))) {
      await call('swalClick', 'cancel');
      throw new PageError(`Hộp thoại lạ (${s.title}: ${s.text}), đã bấm hủy`);
    }
    await call('swalClick', 'confirm');
    return s;
  }

  // Before anything that opens an OneMES dialog: wait for the previous one to be gone.
  async function settle() {
    await waitFor('hộp thoại đóng', async () => {
      await failOnAlert();
      return call('swalIdle');
    });
    await sleep(250);
  }

  async function where() {
    return call('where');
  }

  // ---------- danh sách bệnh nhân ----------
  let listUrl = '';
  async function gotoList() {
    const w = await waitFor('trang OneMES', () => where());
    if (w.page === 'login') throw new PageError('Chưa đăng nhập OneMES');
    if (w.page !== 'list') {
      const link = listUrl || (await call('listLink')) || (host.listUrl ? host.listUrl() : '');
      if (!link) throw new PageError('Không tìm thấy đường dẫn Ds Điều trị nội trú, hãy mở trang đó trong khung OneMES');
      await loadURL(link);
    }
    const w2 = await waitFor('Ds Điều trị nội trú', async () => {
      const x = await where();
      return x.page === 'list' || x.page === 'login' ? x : null;
    });
    if (w2.page === 'login') throw new PageError('Chưa đăng nhập OneMES');
    listUrl = w2.url.replace(/#.*$/, '');
  }

  async function scanPatients() {
    await gotoList();
    // OneMES draws the list a moment after the page opens; an empty table at first
    // means "not yet". If nothing shows, press its Tìm kiếm once and accept the answer.
    const read = (needRows) => async () => {
      const x = await call('readPatients');
      return x.ok && (!needRows || x.patients.length) ? x : null;
    };
    let r;
    try {
      r = await waitFor('bảng bệnh nhân', read(true), 8000);
    } catch (e) {
      if (e instanceof StopError) throw e;
      await call('searchPatients');
      await sleep(1500);
      try {
        r = await waitFor('bảng bệnh nhân', read(true), 10000);
      } catch (e2) {
        if (e2 instanceof StopError) throw e2;
        r = await waitFor('bảng bệnh nhân', read(false));
      }
    }
    const all = new Map(r.patients.map((p) => [p.noitruid, p]));
    const pg = await call('listPages');
    for (const i of pg.pages) {
      if (i === pg.current) continue;
      checkStop();
      await call('gotoListPage', i);
      await sleep(400);
      const x = await waitFor('trang ' + (i + 1), async () => {
        const y = await call('readPatients');
        return y.ok ? y : null;
      });
      x.patients.forEach((p) => all.set(p.noitruid, p));
    }
    if (pg.pages.length) await call('gotoListPage', pg.current);
    const patients = [...all.values()];
    log('info', `Quét được ${patients.length} bệnh nhân`);
    return patients;
  }

  // ---------- một bệnh nhân ----------
  async function openPatient(p) {
    const w = await where().catch(() => ({}));
    if (!(w.page === 'bacsi' && norm(w.noitruid) === norm(p.noitruid))) {
      await loadURL(p.url);
    }
    await waitFor('hồ sơ bệnh nhân', async () => {
      const x = await where();
      if (x.page === 'login') throw new PageError('Chưa đăng nhập OneMES');
      return x.page === 'bacsi' && norm(x.noitruid) === norm(p.noitruid) ? x : null;
    });
    return listOrders();
  }

  async function listOrders() {
    // The list is drawn after the page's own scripts finish; retry the call.
    await waitFor('Lịch sử y lệnh', async () => (await call('showOrderList')).ok);
    const r = await waitFor('danh sách y lệnh', async () => {
      const x = await call('readOrderList');
      return x.ok ? x : null;
    });
    return r.rows;
  }

  function pickSource(rows) {
    return rows.find((r) => r.dienBien && r.dienBienPHCN) || null;
  }

  // OneMES fills the drug and service tables after the order opens (and again after
  // each deletion), so a read is trusted only when both tables are there, nothing is
  // loading, and two reads a moment apart agree.
  async function readStable(id) {
    const sig = (x) => [x.status, ...x.thuoc.map((y) => y.id), '|', ...x.dvkt.map((y) => y.id)].join(',');
    let prev = null;
    const softEnd = Date.now() + 8000;
    const o = await waitFor('đọc y lệnh', async () => {
      await failOnAlert();
      const x = await call('readOrder');
      if (!x.ok || (id && norm(x.id) !== norm(id)) || !x.status || x.busy) return null;
      const tablesOk = (x.tables.thuoc && x.tables.dvkt) || Date.now() > softEnd;
      if (!tablesOk) return null;
      const same = prev && sig(prev) === sig(x);
      prev = x;
      if (!same) {
        await sleep(350);
        return null;
      }
      return x;
    });
    if (!o.tables.thuoc || !o.tables.dvkt) log('warn', `Y lệnh ${o.thoiGian}: không thấy bảng ${!o.tables.thuoc ? 'Cho thuốc/VTYT' : 'Chỉ định DVKT'}`);
    return { ...o, thuoc: withKeys(o.thuoc), dvkt: withKeys(o.dvkt) };
  }

  async function openOrder(id) {
    await call('openOrder', id);
    return readStable(id);
  }

  async function readOrder() {
    return readStable(null);
  }

  // Loads the patient and reads the source order: the given one, or the newest order
  // that has both progress notes and is Hoàn tất (only those can be copied).
  async function loadPatient(p, sourceId) {
    const rows = await openPatient(p);
    if (sourceId) {
      const src = rows.find((r) => r.id === norm(sourceId));
      return { rows, source: src ? await openOrder(src.id) : null, skipped: [] };
    }
    const skipped = [];
    for (const r of rows.filter((x) => x.dienBien && x.dienBienPHCN).slice(0, 5)) {
      const o = await openOrder(r.id);
      if (/hoàn tất/i.test(o.status)) return { rows, source: o, skipped };
      skipped.push({ id: r.id, tg: r.tg, status: o.status });
    }
    return { rows, source: null, skipped };
  }

  // ---------- thao tác trên y lệnh đang mở ----------
  const isDone = (o) => /hoàn tất/i.test(o.status);
  const isNew = (o) => /mới/i.test(o.status) && !isDone(o);

  async function deleteKeys(orderId, keys, label) {
    const res = { deleted: [], missing: [], failed: [] };
    for (const key of keys) {
      checkStop();
      const o = await readOrder();
      if (norm(o.id) !== norm(orderId)) throw new PageError('Trang đã chuyển sang y lệnh khác, dừng để an toàn');
      if (!isNew(o)) throw new PageError(`Y lệnh ${label} không ở trạng thái Mới (${o.status}), không xóa`);
      const it = [...o.thuoc, ...o.dvkt].find((x) => x.key === key);
      if (!it) {
        res.missing.push(key);
        log('warn', `${label}: không thấy "${keyName(key)}", bỏ qua`);
        continue;
      }
      if (!it.canDelete) {
        res.failed.push(key);
        log('warn', `${label}: "${it.name}" không có nút xóa, bỏ qua`);
        continue;
      }
      await step(`${label}: xóa "${it.name}"`);
      await settle();
      const r = await call(it.kind === 'thuoc' ? 'deleteThuoc' : 'deleteDichVu', it.id);
      if (!r.ok) {
        res.failed.push(key);
        log('warn', `${label}: không xóa được "${it.name}" (${r.reason})`);
        continue;
      }
      await confirmDialog(['Có'], 'hộp thoại xác nhận xóa');
      await waitFor('xóa xong', async () => {
        const s = await failOnAlert();
        if (s.visible) return null;
        const x = await call('readOrder');
        return x.ok && ![...x.thuoc, ...x.dvkt].some((y) => y.id === it.id);
      });
      res.deleted.push(key);
      log('ok', `${label}: đã xóa "${it.name}"`);
    }
    return res;
  }

  async function setSao(n, hinhThuc) {
    if (n > 0) {
      const a = await call('setSelect', 'cboHinhThucSao', String(hinhThuc));
      if (!a.ok) throw new PageError('Không chọn được Hình thức sao: ' + a.reason);
    }
    const b = await call('setSelect', 'cboSaoYLenh', String(n));
    if (!b.ok) throw new PageError('Không chọn được Sao y lệnh (ngày): ' + b.reason);
  }

  async function complete(orderId, label, saoN = 0, hinhThuc = '1') {
    await setSao(saoN, hinhThuc);
    await step(saoN > 0 ? `${label}: Hoàn tất và sao thêm ${saoN} ngày` : `${label}: Hoàn tất`);
    await settle();
    const since = await call('now');
    const c = await call('clickButton', 'btnPopupHOANTAT');
    if (!c.ok) throw new PageError(`${label}: không thấy nút Hoàn tất`);
    if (saoN > 0) {
      const s = await confirmDialogMatching(/sao y lệnh/i, 'hộp thoại Sao y lệnh');
      log('info', `${label}: ${s.text.split('.')[0]}`);
      await waitFor('Sao y lệnh thành công', async () => {
        await failOnAlert();
        const t = await call('toasts', since);
        return t.some((x) => /sao y lệnh thành công/i.test(x.msg));
      }, 60000);
    }
    const o = await waitFor('Hoàn tất', async () => {
      const s = await failOnAlert();
      if (s.visible && s.ready && s.cancelText) {
        // A question we do not know how to answer (e.g. package-fee warning).
        await call('swalClick', 'cancel');
        throw new PageError(`OneMES hỏi "${s.text}", tool không tự trả lời. Hãy làm tay.`);
      }
      const x = await call('readOrder');
      return x.ok && norm(x.id) === norm(orderId) && isDone(x) ? x : null;
    }, 60000);
    await setSao(0).catch(() => {});
    log('ok', `${label}: đã Hoàn tất`);
    return o;
  }

  async function confirmDialogMatching(re, what) {
    const s = await waitFor(what, async () => {
      const x = await failOnAlert();
      return x.visible && x.ready && x.cancelText ? x : null;
    });
    if (!re.test(s.text) || norm(s.confirmText) !== norm('Có')) {
      await call('swalClick', 'cancel');
      throw new PageError(`Hộp thoại lạ (${s.title}: ${s.text}), đã bấm Không`);
    }
    await call('swalClick', 'confirm');
    return s;
  }

  async function recall(orderId, label) {
    await step(`${label}: Thu hồi để sửa`);
    await settle();
    const c = await call('clickButton', 'btnPopupTHUHOI');
    if (!c.ok) throw new PageError(`${label}: không thấy nút Thu hồi`);
    await waitFor('Thu hồi', async () => {
      await failOnAlert();
      const x = await call('readOrder');
      return x.ok && norm(x.id) === norm(orderId) && isNew(x) && !isDone(x) ? x : null;
    }, 60000);
    log('ok', `${label}: đã Thu hồi`);
  }

  const present = (o, keys) => {
    const have = new Set([...o.thuoc, ...o.dvkt].map((x) => x.key));
    return keys.filter((k) => have.has(k));
  };

  /**
   * plan = { patient, sourceId, days: 1..4, deletions: [[keys of day1], [keys of day2], ...],
   *          hinhThuc: '1', autoComplete: true }
   * Day 1 is the copy made by Sao chép; days 2..N come from Sao y lệnh (ngày) = N-1.
   */
  async function run(plan) {
    const N = Math.max(1, Math.min(4, plan.days | 0));
    const del = Array.from({ length: N }, (_, i) => [...new Set((plan.deletions && plan.deletions[i]) || [])]);
    const autoComplete = plan.autoComplete !== false;
    const name = plan.patient.hoTen || plan.patient.maBN;
    const result = { days: [], ok: false };
    log('info', `Bắt đầu: ${name}, ${N} ngày`);

    const before = await openPatient(plan.patient);
    const beforeIds = new Set(before.map((r) => r.id));
    const src = await openOrder(plan.sourceId);
    if (!isDone(src)) throw new PageError(`Y lệnh nguồn đang ở trạng thái "${src.status}", cần Hoàn tất để sao chép`);

    // Never create a second order for a day that already has one.
    const srcDate = parseTime(before.find((r) => r.id === norm(src.id))?.tg) || parseTime(src.thoiGian);
    if (srcDate) {
      const taken = [];
      for (let k = 1; k <= N; k++) {
        const d = addDays(srcDate, k);
        if (before.some((r) => dayStamp(parseTime(r.tg)) === dayStamp(d))) taken.push(ddmmOf(d));
      }
      if (taken.length) {
        throw new PageError(`Đã có y lệnh ngày ${taken.join(', ')}. Hãy chọn y lệnh nguồn mới nhất, hoặc xóa y lệnh trùng trên OneMES trước`);
      }
    }

    // 1. Sao chép -> Đồng ý. OneMES opens the new order itself.
    await step('Sao chép y lệnh nguồn');
    await settle();
    const c = await call('clickButton', 'btnSaoChep');
    if (!c.ok) throw new PageError('Không thấy nút Sao chép trên y lệnh nguồn');
    await confirmDialog(['Đồng ý'], 'hộp thoại Sao chép');
    const day1 = await waitFor('y lệnh mới', async () => {
      await failOnAlert();
      const w = await where();
      if (!w.popupOpen || norm(w.orderId) === norm(src.id)) return null;
      const x = await call('readOrder');
      return x.ok && x.status && !beforeIds.has(norm(x.id)) ? x : null;
    }, 60000);
    const d1 = norm(day1.id);
    log('ok', `Đã sao chép: ngày 1 (${day1.thoiGian || day1.info})`);
    if (!isNew(day1)) throw new PageError(`Y lệnh mới có trạng thái "${day1.status}", dừng`);
    result.days.push({ day: 1, id: d1, time: day1.thoiGian });

    if (N === 1) {
      result.days[0].del = await deleteKeys(d1, del[0], 'Ngày 1');
      if (autoComplete) await complete(d1, 'Ngày 1');
      result.ok = true;
      return result;
    }

    // 2. Items deleted on every day go before Sao y lệnh, so the copies lack them too.
    const common = del[0].filter((k) => del.every((d) => d.includes(k)));
    if (common.length) result.days[0].del = await deleteKeys(d1, common, 'Ngày 1');

    // 3. Hoàn tất ngày 1 with Sao y lệnh (ngày) = N-1.
    await complete(d1, 'Ngày 1', N - 1, plan.hinhThuc || '1');

    // 4. Day 1 still needs its own deletions: Thu hồi, delete, Hoàn tất.
    let o1 = await readOrder();
    const rest1 = present(o1, del[0]);
    if (rest1.length) {
      await recall(d1, 'Ngày 1');
      const r = await deleteKeys(d1, rest1, 'Ngày 1');
      result.days[0].del = mergeRes(result.days[0].del, r);
      if (autoComplete) await complete(d1, 'Ngày 1');
    }

    // 5. Find the copies made by Sao y lệnh and match them to days 2..N by date.
    const after = await listOrders();
    const fresh = after.filter((r) => !beforeIds.has(r.id) && r.id !== d1);
    // The history list is the reference for dates; the form field is a fallback.
    const base = parseTime(after.find((r) => r.id === d1)?.tg) || parseTime(day1.thoiGian);
    const byDay = [];
    if (base && fresh.every((r) => parseTime(r.tg))) {
      for (let k = 1; k < N; k++) {
        const want = dayStamp(addDays(base, k));
        const m = fresh.filter((r) => dayStamp(parseTime(r.tg)) === want);
        if (m.length !== 1) {
          throw new PageError(`Không xác định được y lệnh ngày ${k + 1} (tìm thấy ${m.length} y lệnh ngày ${ddmmOf(addDays(base, k))}), dừng để an toàn`);
        }
        byDay.push(m[0]);
      }
    } else if (fresh.length === N - 1) {
      log('warn', 'Không đọc được ngày của các y lệnh mới, xếp theo thứ tự trong Lịch sử y lệnh');
      byDay.push(...[...fresh].reverse());
    } else {
      throw new PageError(`Tìm thấy ${fresh.length} y lệnh mới, mong đợi ${N - 1}, dừng để an toàn`);
    }
    if (fresh.length !== N - 1) log('warn', `Có ${fresh.length} y lệnh mới, mong đợi ${N - 1}`);

    // 6. Open each following day, delete its items, Hoàn tất.
    for (let k = 1; k < N; k++) {
      checkStop();
      const label = `Ngày ${k + 1}`;
      const row = byDay[k - 1];
      const o = await openOrder(row.id);
      log('info', `${label}: mở y lệnh ${row.tg} (${o.status})`);
      const keys = present(o, del[k]);
      const gone = del[k].filter((x) => !keys.includes(x));
      let r = { deleted: [], missing: [], failed: [] };
      // OneMES creates these copies already Hoàn tất: Thu hồi only when something must go.
      if (keys.length) {
        if (isDone(o)) await recall(row.id, label);
        else if (!isNew(o)) throw new PageError(`${label} có trạng thái "${o.status}", không sửa`);
        r = await deleteKeys(row.id, keys, label);
        if (autoComplete) await complete(row.id, label);
      } else if (isNew(o) && autoComplete) {
        await complete(row.id, label);
      } else {
        log('info', `${label}: không có mục cần xóa, giữ nguyên`);
      }
      r.alreadyGone = gone;
      result.days.push({ day: k + 1, id: row.id, time: row.tg, del: r });
    }
    await call('back').catch(() => {});
    result.ok = true;
    log('ok', `Xong ${name}`);
    return result;
  }

  return { call, where, scanPatients, openPatient, listOrders, pickSource, loadPatient, openOrder, readOrder, run, gotoList };
}

function mergeRes(a, b) {
  if (!a) return b;
  return { deleted: [...a.deleted, ...b.deleted], missing: [...a.missing, ...b.missing], failed: [...a.failed, ...b.failed] };
}

function keyName(key) {
  return String(key).split('|')[1] || key;
}

module.exports = { createDriver, withKeys, baseKey, parseTime, norm, StopError, PageError, AGENT };
