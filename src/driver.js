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
const pad2 = (n) => String(n).padStart(2, '0');
const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
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
    return exec(`(function(){if(!window.__SYL||window.__SYL.version!==6){${AGENT}\n}return window.__SYL.${fn}(${a});})()`);
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
  async function gotoList(force = false) {
    const w = await waitFor('trang OneMES', () => where());
    if (w.page === 'login') throw new PageError('Chưa đăng nhập OneMES');
    if (w.page !== 'list' || force) {
      const role = host.listRole ? host.listRole() : '';
      const link = (w.page === 'list' ? w.url.replace(/#.*$/, '') : '') || (await call('listLink', role)) || listUrl || (host.listUrl ? host.listUrl() : '');
      if (link) await loadURL(link);
      else {
        // No address to open: try the page's own menu entry before giving up.
        const info = await call('pageInfo').catch(() => ({}));
        log('info', `Trang hiện tại: ${info.path || '?'} (${info.params || 'không tham số'}), ${info.menuLinks || 0} liên kết menu`);
        const c = await call('clickListMenu');
        if (!c.ok) throw new PageError('Không tìm thấy đường dẫn Ds Điều trị nội trú trên trang này. Hãy mở trang đó một lần bằng menu của OneMES');
      }
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
    await gotoPatient(p);
    return listOrders();
  }

  async function gotoPatient(p) {
    const w = await where().catch(() => ({}));
    if (!(w.page === 'bacsi' && norm(w.noitruid) === norm(p.noitruid))) {
      await loadURL(p.url);
    }
    await waitFor('hồ sơ bệnh nhân', async () => {
      const x = await where();
      if (x.page === 'login') throw new PageError('Chưa đăng nhập OneMES');
      return x.page === 'bacsi' && norm(x.noitruid) === norm(p.noitruid) ? x : null;
    });
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

  // What must change on order o so it matches edit = { gio: 'HH:mm' (thực hiện),
  // dienBien, dienBienPHCN, bacSi: {id, text}, capDo: {id, text} }. Thời gian chỉ định
  // is set one minute before thời gian thực hiện. Fields already right are left out.
  function fieldsFor(o, edit) {
    const f = {};
    if (!edit) return f;
    if (edit.gio && /^\d{1,2}:\d{2}$/.test(edit.gio)) {
      const d = parseTime(o.thoiGianThucHien) || parseTime(o.thoiGian);
      if (d) {
        const [h, m] = edit.gio.split(':').map(Number);
        const th = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
        const cd = new Date(th.getTime() - 60000);
        if (o.thoiGianThucHien !== fmtTime(th)) f.thoiGianThucHien = fmtTime(th);
        if (o.thoiGian !== fmtTime(cd)) f.thoiGian = fmtTime(cd);
      }
    }
    const same = (a, b) => String(a || '').replace(/\r\n/g, '\n').trim() === String(b || '').replace(/\r\n/g, '\n').trim();
    if (typeof edit.dienBien === 'string' && !same(edit.dienBien, o.dienBien)) f.dienBien = edit.dienBien;
    if (typeof edit.dienBienPHCN === 'string' && !same(edit.dienBienPHCN, o.dienBienPHCN)) f.dienBienPHCN = edit.dienBienPHCN;
    if (edit.bacSi && edit.bacSi.id && norm(edit.bacSi.id) !== norm(o.bacSi && o.bacSi.id)) f.bacSi = { id: edit.bacSi.id, text: edit.bacSi.text || edit.bacSi.name || '' };
    if (edit.capDo && edit.capDo.id && norm(edit.capDo.id) !== norm(o.capDo && o.capDo.id)) f.capDo = { id: edit.capDo.id, text: edit.capDo.text || '' };
    return f;
  }

  function describeFields(f) {
    const out = [];
    if (f.thoiGianThucHien) out.push(`giờ thực hiện ${f.thoiGianThucHien.slice(0, 5)}`);
    if (f.dienBien !== undefined) out.push('diễn biến bệnh');
    if (f.dienBienPHCN !== undefined) out.push('diễn biến PHCN');
    if (f.bacSi) out.push(`bác sĩ ${f.bacSi.text}`);
    if (f.capDo) out.push(`cấp độ ${f.capDo.text}`);
    return out.join(', ');
  }

  // Fills the open (Mới) order and presses Lưu, then reads it back.
  async function applyFields(orderId, label, f) {
    const what = describeFields(f);
    await step(`${label}: sửa ${what}`);
    await settle();
    const r = await call('setOrderFields', f);
    await settle(); // a time OneMES rejects shows a warning here
    if (!r.ok) throw new PageError(`${label}: ${r.reason}`);
    const since = await call('now');
    const c = await call('clickButton', 'btnSaveThamKhamDraw');
    if (!c.ok) throw new PageError(`${label}: không thấy nút Lưu`);
    await waitFor('Lưu y lệnh', async () => {
      const a = await failOnAlert();
      // OneMES reports a refused save in a plain "Thông báo" box.
      if (a.visible && a.ready && !a.cancelText) {
        await call('swalClick', 'confirm');
        throw new PageError(`${label}: OneMES báo "${a.text || a.title}"`);
      }
      const t = await call('toasts', since);
      const err = t.find((x) => x.type === 'error' || x.type === 'warning');
      if (err) throw new PageError(`${label}: OneMES báo "${err.msg}"`);
      return t.some((x) => /đã lưu/i.test(x.msg));
    }, 60000);
    const o = await readStable(orderId);
    const left = fieldsFor(o, {
      gio: f.thoiGianThucHien ? f.thoiGianThucHien.slice(0, 5) : undefined,
      dienBien: f.dienBien,
      dienBienPHCN: f.dienBienPHCN,
      bacSi: f.bacSi,
      capDo: f.capDo,
    });
    if (Object.keys(left).length) throw new PageError(`${label}: đã bấm Lưu nhưng OneMES chưa nhận ${describeFields(left)}`);
    log('ok', `${label}: đã sửa ${what}`);
    return o;
  }

  /**
   * plan = { patient, sourceId, days: 1..4, deletions: [[keys of day1], [keys of day2], ...],
   *          hinhThuc: '1', autoComplete: true }
   * Day 1 is the copy made by Sao chép; days 2..N come from Sao y lệnh (ngày) = N-1.
   */
  async function run(plan) {
    const result = { days: [], ok: false };
    try {
      return await runInner(plan, result);
    } catch (e) {
      e.partial = result;
      throw e;
    }
  }

  async function runInner(plan, result) {
    const N = Math.max(1, Math.min(4, plan.days | 0));
    const del = Array.from({ length: N }, (_, i) => [...new Set((plan.deletions && plan.deletions[i]) || [])]);
    const autoComplete = plan.autoComplete !== false;
    const name = plan.patient.hoTen || plan.patient.maBN;
    log('info', `Bắt đầu: ${name}, ${N} ngày`);

    const before = await openPatient(plan.patient);
    const beforeIds = new Set(before.map((r) => r.id));
    const src = await openOrder(plan.sourceId);
    if (!isDone(src)) throw new PageError(`Y lệnh nguồn đang ở trạng thái "${src.status}", cần Hoàn tất để sao chép`);
    const edits = resolveEdits(src, plan.edits, N);

    // Never create a second order for a day that already has one.
    const srcDate = parseTime(before.find((r) => r.id === norm(src.id))?.tg) || parseTime(src.thoiGian);
    result.expect = expectations(src, del, srcDate, autoComplete, edits);
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

    // Day 1's own changes go in before Sao y lệnh, which copies them to the next days.
    const f1 = fieldsFor(day1, edits[0]);
    if (Object.keys(f1).length) await applyFields(d1, 'Ngày 1', f1);

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
      const f = fieldsFor(o, edits[k]);
      const change = Object.keys(f).length > 0;
      let r = { deleted: [], missing: [], failed: [] };
      // OneMES creates these copies already Hoàn tất: Thu hồi only when something must change.
      if (keys.length || change) {
        if (isDone(o)) await recall(row.id, label);
        else if (!isNew(o)) throw new PageError(`${label} có trạng thái "${o.status}", không sửa`);
        r = await deleteKeys(row.id, keys, label);
        if (change) await applyFields(row.id, label, f);
        if (autoComplete) await complete(row.id, label);
      } else if (isNew(o) && autoComplete) {
        await complete(row.id, label);
      } else {
        log('info', `${label}: không có gì cần sửa, giữ nguyên`);
      }
      r.alreadyGone = gone;
      result.days.push({ day: k + 1, id: row.id, time: row.tg, del: r });
    }
    await call('back').catch(() => {});
    result.ok = true;
    log('ok', `Xong ${name}`);
    return result;
  }

  // ---------- kiểm tra lại sau khi chạy ----------
  /**
   * Re-reads every order the run created and compares it with what was asked:
   * deleted items gone, the rest of the source still there, Hoàn tất, right date.
   * expect = { autoComplete, names: {base: name}, days: [{ day, want: {base: n}, gone: {base: n}, date }] }
   * ids = [{ day, id }]
   */
  async function verify(patient, expect, ids) {
    const name = patient.hoTen || patient.maBN;
    log('info', `${name}: kiểm tra lại các ngày vừa sao chép`);
    const rows = await openPatient(patient);
    const days = [];
    for (const { day, id } of ids) {
      checkStop();
      const e = (expect && expect.days.find((x) => x.day === day)) || null;
      const row = rows.find((r) => r.id === norm(id));
      if (!row) {
        days.push({ day, id, gone: true, problems: ['Không còn trong Lịch sử y lệnh (đã bị xóa?)'], warnings: [] });
        continue;
      }
      const o = await openOrder(row.id);
      const items = [...o.thuoc, ...o.dvkt];
      const have = countBy(items.map(baseKey));
      const problems = [];
      const warnings = [];
      const label = (b) => (expect && expect.names[b]) || items.find((it) => baseKey(it) === b)?.name || keyName(b);
      if (e) {
        for (const [b, n] of Object.entries(e.gone)) {
          if ((have[b] || 0) > (e.want[b] || 0)) problems.push(`"${label(b)}" vẫn còn, cần xóa`);
        }
        for (const [b, n] of Object.entries(e.want)) {
          if ((have[b] || 0) < n) warnings.push(`Thiếu "${label(b)}" so với y lệnh nguồn`);
        }
        for (const b of Object.keys(have)) {
          if (!(b in e.want) && !(b in e.gone)) warnings.push(`Có thêm "${label(b)}" không có trong y lệnh nguồn`);
        }
        const d = parseTime(row.tg);
        if (e.date && d && dayStamp(d) !== dayStamp(new Date(e.date))) problems.push(`Sai ngày: ${row.tg}, mong đợi ${ddmmOf(new Date(e.date))}`);
      }
      if (e && e.edit) {
        const left = fieldsFor(o, e.edit);
        if (left.thoiGianThucHien) problems.push(`Giờ thực hiện là ${(o.thoiGianThucHien || '').slice(0, 5)}, đã chọn ${e.edit.gio}`);
        if (left.dienBien !== undefined) problems.push('Diễn biến bệnh khác với nội dung đã sửa');
        if (left.dienBienPHCN !== undefined) problems.push('Diễn biến PHCN khác với nội dung đã sửa');
        if (left.bacSi) problems.push(`Bác sĩ là ${(o.bacSi && o.bacSi.text) || 'trống'}, đã chọn ${left.bacSi.text}`);
        if (left.capDo) problems.push(`Cấp độ chăm sóc là ${(o.capDo && o.capDo.text) || 'trống'}, đã chọn ${left.capDo.text}`);
      }
      if (expect && expect.autoComplete && !isDone(o)) problems.push(`Chưa Hoàn tất (đang "${o.status}")`);
      if (!o.dienBien) warnings.push('Trống Diễn biến bệnh');
      if (!o.dienBienPHCN) warnings.push('Trống Diễn biến PHCN');
      const slim = (it) => {
        const { key, ...rest } = it;
        return { ...rest, base: baseKey(it) };
      };
      days.push({
        day,
        id: row.id,
        tg: row.tg,
        status: o.status,
        thoiGian: o.thoiGian,
        thoiGianThucHien: o.thoiGianThucHien,
        dienBien: o.dienBien,
        dienBienPHCN: o.dienBienPHCN,
        bacSi: o.bacSi || null,
        capDo: o.capDo || null,
        thuoc: o.thuoc.map(slim),
        dvkt: o.dvkt.map(slim),
        removed: e ? Object.keys(e.gone).map(label) : [],
        problems,
        warnings,
      });
    }
    await call('back').catch(() => {});
    const bad = days.filter((d) => d.problems.length).length;
    if (bad) log('warn', `${name}: kiểm tra thấy ${bad} ngày có vấn đề`);
    else log('ok', `${name}: kiểm tra ${days.length} ngày, đúng như đã chọn`);
    return { at: Date.now(), ok: !bad, days };
  }

  // ---------- xóa một y lệnh ----------
  // OneMES only offers Xóa on a Mới order, and asks no question, so the caller
  // must have confirmed with the user. Hoàn tất orders are recalled first.
  async function deleteOrder(patient, id) {
    const rows = await openPatient(patient);
    const row = rows.find((r) => r.id === norm(id));
    if (!row) throw new PageError('Không thấy y lệnh này trong Lịch sử y lệnh (có thể đã xóa)');
    const label = `Y lệnh ${row.tg}`;
    let o = await openOrder(row.id);
    if (isDone(o)) {
      await recall(row.id, label);
      o = await readOrder();
    }
    if (!isNew(o)) throw new PageError(`${label} có trạng thái "${o.status}", không xóa`);
    await step(`${label}: Xóa y lệnh`);
    await settle();
    const c = await call('clickButton', 'btnPopupXOA');
    if (!c.ok) throw new PageError(`${label}: không thấy nút Xóa`);
    await waitFor('xóa y lệnh', async () => {
      const s = await failOnAlert();
      if (s.visible && s.ready && s.cancelText) {
        // Not seen on OneMES so far; answer only a plain delete question.
        if (/xóa/i.test(s.text + ' ' + s.title) && /^(có|đồng ý|ok)$/i.test(String(s.confirmText).trim())) await call('swalClick', 'confirm');
        else {
          await call('swalClick', 'cancel');
          throw new PageError(`Hộp thoại lạ (${s.title}: ${s.text}), đã bấm hủy`);
        }
        return null;
      }
      const w = await where();
      return !(w.popupOpen && norm(w.orderId) === norm(row.id));
    }, 60000);
    const after = await listOrders();
    if (after.some((r) => r.id === row.id)) throw new PageError(`${label}: vẫn còn sau khi bấm Xóa`);
    log('ok', `${label}: đã xóa y lệnh`);
    return { ok: true, id: row.id, tg: row.tg };
  }

  // ---------- sửa lại một ngày đã tạo ----------
  /**
   * Brings one created order in line with what the user corrected on the Kết quả tab:
   * edit as in fieldsFor, remove = [{ id, base, name }] items to delete.
   * A Hoàn tất order is recalled first and completed again afterwards.
   */
  async function updateDay(patient, id, edit, remove = [], autoComplete = true) {
    const rows = await openPatient(patient);
    const row = rows.find((r) => r.id === norm(id));
    if (!row) throw new PageError('Không thấy y lệnh này trong Lịch sử y lệnh (có thể đã xóa)');
    const label = `Y lệnh ${row.tg}`;
    const o = await openOrder(row.id);
    const f = fieldsFor(o, edit);
    const items = [...o.thuoc, ...o.dvkt];
    const keys = [];
    for (const it of remove) {
      const hit = items.find((x) => x.id === norm(it.id) && !keys.includes(x.key)) || items.find((x) => baseKey(x) === it.base && !keys.includes(x.key));
      if (hit) keys.push(hit.key);
      else log('warn', `${label}: không thấy "${it.name}", bỏ qua`);
    }
    if (!keys.length && !Object.keys(f).length) {
      log('info', `${label}: không có gì cần sửa`);
      return { changed: false };
    }
    const wasDone = isDone(o);
    if (wasDone) await recall(row.id, label);
    else if (!isNew(o)) throw new PageError(`${label} có trạng thái "${o.status}", không sửa`);
    const r = await deleteKeys(row.id, keys, label);
    if (Object.keys(f).length) await applyFields(row.id, label, f);
    if (wasDone || autoComplete) await complete(row.id, label);
    await call('back').catch(() => {});
    log('ok', `${label}: đã cập nhật lên OneMES`);
    return { changed: true, del: r };
  }

  // ---------- danh sách bác sĩ, cấp độ chăm sóc ----------
  async function loadLists(esBase) {
    const w = await waitFor('trang OneMES', () => where());
    if (w.page === 'login') throw new PageError('Chưa đăng nhập OneMES');
    const r = await call('esLists', esBase || '');
    if (!r.ok) throw new PageError(`Không đọc được danh sách bác sĩ / cấp độ chăm sóc (${r.reason})`);
    log('info', `Đọc được ${r.bacSi.length} bác sĩ, ${r.capDo.length} cấp độ chăm sóc`);
    return r;
  }

  // ---------- Thông tin bệnh án ----------
  // fields = [{ id, kind, part }] from benh-an-schema.json; part 1 = Thông tin chung,
  // part 2 = Thông tin chuyên khoa.
  async function openBenhAn(patient) {
    await gotoPatient(patient);
    await settle();
    const r = await waitFor('mục Lập bìa bệnh án', async () => {
      const x = await call('openBenhAn');
      if (!x.ok && /Không thấy/.test(x.reason)) return null;
      if (!x.ok) throw new PageError(x.reason);
      return x;
    }, 15000);
    await waitFor('trang Thông tin bệnh án', async () => {
      await failOnAlert();
      const s = await call('benhAnState');
      return s.ready && !s.busy ? s : null;
    });
    return r;
  }

  async function readBenhAn(patient, fields) {
    const name = patient.hoTen || patient.maBN;
    await openBenhAn(patient);
    const r = await call('readBenhAn', fields);
    if (r.missing.length) log('warn', `${name}: trang bệnh án không có ${r.missing.length} mục (${r.missing.slice(0, 5).join(', ')})`);
    log('info', `${name}: đã đọc Thông tin bệnh án`);
    return { values: r.values, missing: r.missing, at: Date.now() };
  }

  async function saveBenhAn(patient, fields, values) {
    const name = patient.hoTen || patient.maBN;
    log('info', `${name}: ghi Thông tin bệnh án`);
    await openBenhAn(patient);
    const w = await call('writeBenhAn', fields, values);
    if (w.missing.length) log('warn', `${name}: không điền được ${w.missing.length} mục (${w.missing.slice(0, 5).join(', ')})`);
    const parts = [
      [1, /thông tin chung thành công/i, 'Thông tin chung'],
      [2, /chuyên khoa thành công/i, 'Thông tin chuyên khoa'],
    ];
    for (const [part, ok, title] of parts) {
      if (!fields.some((f) => f.part === part)) continue;
      await step(`${name}: Lưu ${title}`);
      await settle();
      const since = await call('now');
      const r = await call('saveBenhAn', part);
      if (!r.ok) throw new PageError(`${name}: không lưu được ${title} (${r.reason})`);
      await waitFor(`Lưu ${title}`, async () => {
        await failOnAlert();
        const t = await call('toasts', since);
        const err = t.find((x) => x.type === 'error');
        if (err) throw new PageError(`${name}: OneMES báo "${err.msg}"`);
        return t.some((x) => ok.test(x.msg));
      }, 60000);
      log('ok', `${name}: đã lưu ${title}`);
    }
    // Read the page again from OneMES to be sure what was saved.
    await openBenhAn(patient);
    const back = await call('readBenhAn', fields);
    const diff = fields.filter((f) => f.id in values && !w.missing.includes(f.id) && !sameValue(f.kind, values[f.id], back.values[f.id])).map((f) => f.id);
    if (diff.length) log('warn', `${name}: sau khi lưu, ${diff.length} mục khác với bản đã sửa (${diff.slice(0, 5).join(', ')})`);
    else log('ok', `${name}: Thông tin bệnh án đã lưu đúng`);
    return { values: back.values, missing: w.missing, diff, at: Date.now() };
  }

  return { call, where, scanPatients, openPatient, listOrders, pickSource, loadPatient, openOrder, readOrder, run, gotoList, verify, deleteOrder, updateDay, loadLists, readBenhAn, saveBenhAn, fieldsFor };
}

function countBy(list) {
  const o = {};
  for (const x of list) o[x] = (o[x] || 0) + 1;
  return o;
}

// What each created day should hold: the source minus that day's deletions.
function expectations(src, del, srcDate, autoComplete, edits = []) {
  const items = [...src.thuoc, ...src.dvkt];
  const names = {};
  for (const it of items) names[baseKey(it)] = it.name;
  return {
    autoComplete,
    names,
    days: del.map((keys, i) => ({
      day: i + 1,
      want: countBy(items.filter((it) => !keys.includes(it.key)).map(baseKey)),
      gone: countBy(items.filter((it) => keys.includes(it.key)).map(baseKey)),
      date: srcDate ? addDays(srcDate, i + 1).getTime() : null,
      edit: edits[i] || null,
    })),
  };
}

// Per-day corrections as the user left them: a field changed on any day is pinned on
// every day, taking the source's value where that day was left alone. Otherwise a
// change made on day 1 would also reach the days Sao y lệnh copies from it.
function resolveEdits(src, edits, N) {
  const list = Array.from({ length: N }, (_, i) => ({ ...((edits && edits[i]) || {}) }));
  const fromSrc = {
    gio: (/^(\d{1,2}:\d{2})/.exec(src.thoiGianThucHien || src.thoiGian || '') || [])[1],
    dienBien: src.dienBien || '',
    dienBienPHCN: src.dienBienPHCN || '',
    bacSi: src.bacSi && src.bacSi.id ? src.bacSi : undefined,
    capDo: src.capDo && src.capDo.id ? src.capDo : undefined,
  };
  for (const k of Object.keys(fromSrc)) {
    const used = list.some((e) => e[k] !== undefined && e[k] !== null && e[k] !== '' && !(typeof e[k] === 'object' && !e[k].id));
    for (const e of list) {
      const empty = e[k] === undefined || e[k] === null || e[k] === '' || (typeof e[k] === 'object' && !e[k].id);
      if (!used) delete e[k];
      else if (empty && fromSrc[k] !== undefined) e[k] = fromSrc[k];
      else if (empty) delete e[k];
    }
  }
  return list.map((e) => (Object.keys(e).length ? e : null));
}

function sameValue(kind, a, b) {
  if (kind === 'check') return !!a === !!b;
  if (kind === 'multi') return [...(a || [])].map(String).sort().join('|') === [...(b || [])].map(String).sort().join('|');
  if (kind === 'radio') return norm(a) === norm(b);
  return String(a == null ? '' : a).replace(/\r\n/g, '\n').trim() === String(b == null ? '' : b).replace(/\r\n/g, '\n').trim();
}

function mergeRes(a, b) {
  if (!a) return b;
  return { deleted: [...a.deleted, ...b.deleted], missing: [...a.missing, ...b.missing], failed: [...a.failed, ...b.failed] };
}

function keyName(key) {
  return String(key).split('|')[1] || key;
}

module.exports = { createDriver, resolveEdits, withKeys, baseKey, parseTime, fmtTime, norm, StopError, PageError, AGENT };
