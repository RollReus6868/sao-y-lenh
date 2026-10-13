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
    return exec(`(function(){if(!window.__SYL||window.__SYL.version!==11){${AGENT}\n}return window.__SYL.${fn}(${a});})()`);
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

  async function listOrders(all = false) {
    // The list is drawn after the page's own scripts finish; retry the call.
    await waitFor('Lịch sử y lệnh', async () => (await call('showOrderList', all)).ok);
    const r = await waitFor('danh sách y lệnh', async () => {
      const x = await call('readOrderList');
      return x.ok ? x : null;
    });
    return r.rows;
  }

  // kind 'sac': orders whose Y lệnh khác reads "Chỉ định sắc thuốc thang"; 'thuong': the
  // usual orders with both progress notes. The two are copied separately.
  function canSource(r, kind) {
    return kind === 'sac' ? isSac(r) : !isSac(r) && !!(r.dienBien && r.dienBienPHCN);
  }
  function pickSource(rows, kind = 'thuong') {
    return rows.find((r) => canSource(r, kind)) || null;
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
  async function loadPatient(p, sourceId, kind = 'thuong') {
    const rows = await openPatient(p);
    if (sourceId) {
      const src = rows.find((r) => r.id === norm(sourceId));
      return { rows, source: src ? await openOrder(src.id) : null, skipped: [] };
    }
    const skipped = [];
    for (const r of rows.filter((x) => canSource(x, kind)).slice(0, 5)) {
      const o = await openOrder(r.id);
      if (/hoàn tất/i.test(o.status)) return { rows, source: o, skipped };
      skipped.push({ id: r.id, tg: r.tg, status: o.status });
    }
    return { rows, source: null, skipped };
  }

  // Thêm thuốc ticks made for the user (0.5.0): reads the drugs of the usual orders
  // (both progress notes) of the last `tuTick` days before the source, then ticks
  // each drug on the copied day that falls `tuTick` days after a day holding it.
  // Completed orders are read once and remembered.
  const drugCache = new Map();
  async function autoTicks(rows, src, catalog, deletions = []) {
    const items = (catalog || []).filter((it) => +it.tuTick > 0);
    const srcRow = rows.find((r) => r.id === norm(src.id));
    const base = (srcRow && rowDate(srcRow, 'thuong')) || parseTime(src.thoiGian);
    if (!items.length || !base) return { adds: [[], [], [], []], why: [] };
    const from = addDays(dayOnly(base), 1 - Math.max(...items.map((it) => +it.tuTick)));
    const history = [];
    for (const r of rows.filter((x) => canSource(x, 'thuong'))) {
      const d = rowDate(r, 'thuong');
      if (!d || d < from || dayOnly(d) > dayOnly(base)) continue;
      let names;
      if (r.id === norm(src.id)) names = src.thuoc.map((x) => x.name);
      else if (drugCache.has(r.id)) names = drugCache.get(r.id);
      else {
        checkStop();
        const o = await openOrder(r.id);
        names = o.thuoc.map((x) => x.name);
        if (isDone(o)) drugCache.set(r.id, names);
      }
      history.push({ id: r.id, tg: r.tg, names });
    }
    return planTicks({ history, srcDate: base, srcThuoc: src.thuoc, deletions, catalog: items });
  }

  // Sắc thuốc thang run right after the usual one (0.5.0): times and doctor as the
  // tab fills them in (sacDef in Patients.tsx). doctors = [{ id, name }].
  function sacEdits(rows, src, N, doctors = []) {
    const srcRow = rows.find((r) => r.id === norm(src.id));
    const base = (srcRow && rowDate(srcRow, 'sac')) || parseTime(src.thoiGianThucHien || src.thoiGian);
    const out = [];
    const missing = [];
    for (let k = 0; k < N; k++) {
      if (!base) {
        out.push(null);
        continue;
      }
      const d = addDays(base, k + 1);
      const same = usualOn(rows, d);
      const prev = usualOn(rows, addDays(d, -1));
      const e = {};
      if (same && same.tgth) e.thucHien = same.tgth;
      else missing.push(`thực hiện ngày ${ddmmOf(d)}`);
      if (prev && prev.tg) e.chiDinh = prev.tg;
      else missing.push(`chỉ định ngày ${ddmmOf(addDays(d, -1))}`);
      const doc = prev && findDoctor(doctors, prev.bacSi);
      if (doc) e.bacSi = doc;
      else if (prev && prev.bacSi) log('warn', `Sắc thuốc thang ngày ${k + 1}: không tìm thấy bác sĩ "${prev.bacSi}" trong danh sách, giữ như bản sao`);
      out.push(Object.keys(e).length ? e : null);
    }
    if (missing.length) log('warn', `Sắc thuốc thang: chưa thấy y lệnh thường cho ${missing.join(', ')}; ô đó giữ như bản sao`);
    return out;
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
    // Sắc thuốc thang: both times given in full, each with its own date.
    const th = parseTime(edit.thucHien);
    const cd = parseTime(edit.chiDinh);
    if (th || cd) {
      if (th && o.thoiGianThucHien !== fmtTime(th)) f.thoiGianThucHien = fmtTime(th);
      if (cd && o.thoiGian !== fmtTime(cd)) f.thoiGian = fmtTime(cd);
    } else if (edit.gio && /^\d{1,2}:\d{2}$/.test(edit.gio)) {
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
    const twoDays = f.thoiGian && f.thoiGianThucHien && f.thoiGian.slice(6) !== f.thoiGianThucHien.slice(6);
    if (f.thoiGian && (twoDays || !f.thoiGianThucHien)) out.push(`thời gian chỉ định ${f.thoiGian}`);
    if (f.thoiGianThucHien) out.push(twoDays ? `thời gian thực hiện ${f.thoiGianThucHien}` : `giờ thực hiện ${f.thoiGianThucHien.slice(0, 5)}`);
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
      thucHien: f.thoiGianThucHien,
      chiDinh: f.thoiGian,
      dienBien: f.dienBien,
      dienBienPHCN: f.dienBienPHCN,
      bacSi: f.bacSi,
      capDo: f.capDo,
    });
    if (Object.keys(left).length) throw new PageError(`${label}: đã bấm Lưu nhưng OneMES chưa nhận ${describeFields(left)}`);
    log('ok', `${label}: đã sửa ${what}`);
    return o;
  }

  // ---------- thêm thuốc qua Kê Tây y/VTYT ----------
  // it = { id, label, kho, ten, tim, sl, cachDung, loai } from Cài đặt > Thêm thuốc.
  const hasItem = (o, it) => o.thuoc.some((x) => norm(x.name) === norm(it.ten) || norm(x.name).startsWith(norm(it.ten)));

  // Types each term in turn into a select2 box until a result matching `match` shows up.
  async function pickS2(id, terms, match, what) {
    let last = null;
    for (const term of terms) {
      const s = await call('s2Search', id, term);
      if (!s.ok) throw new PageError(`${what}: ${s.reason}`);
      await sleep(500); // the box searches 350 ms after the last keystroke
      const end = Date.now() + 10000;
      while (Date.now() < end) {
        checkStop();
        const r = await call('s2Results');
        if (r.open && !r.loading && r.items.length) {
          last = await call('s2Pick', match);
          if (last.ok) return last;
        }
        await sleep(250);
      }
    }
    await call('s2Close').catch(() => {});
    const seen = last && last.seen && last.seen.length ? ` (thấy: ${last.seen.join('; ')})` : '';
    throw new PageError(`${what}: ${last && last.reason === 'ambiguous' ? 'có nhiều mục trùng tên' : 'không tìm thấy'} "${match}"${seen}`);
  }

  async function keDonState() {
    return call('keDonState');
  }

  async function addThuoc(orderId, label, it) {
    const o = await readOrder();
    if (norm(o.id) !== norm(orderId)) throw new PageError('Trang đã chuyển sang y lệnh khác, dừng để an toàn');
    if (hasItem(o, it)) {
      log('info', `${label}: đã có "${it.label}", không thêm nữa`);
      return { added: false, already: true };
    }
    if (!isNew(o)) throw new PageError(`${label}: y lệnh không ở trạng thái Mới (${o.status}), không thêm thuốc`);
    await step(`${label}: thêm "${it.label}" (kho ${it.kho}, SL ${it.sl})`);
    await settle();
    const r = await call('openKeDon');
    if (!r.ok) throw new PageError(`${label}: không mở được Kê Tây y/VTYT (${r.reason})`);
    let st = await waitFor('popup Kê đơn thuốc', async () => {
      await failOnAlert();
      const x = await keDonState();
      return x.open && x.ready && !x.busy ? x : null;
    });
    let picked = null;
    try {
      if (st.disabled) throw new PageError(`${label}: ô Thuốc trong Kê đơn đang khóa`);
      if (it.loai) {
        const l = await call('keDonSetLoai', it.loai);
        if (!l.ok) log('warn', `${label}: không chọn được loại kê "${it.loai}", giữ "${st.loai}"`);
        else if (l.changed) await sleep(500);
      }
      st = await keDonState();
      if (!norm(st.kho.text).includes(norm(it.kho))) {
        await pickS2('cboKho', ['', it.kho], it.kho, `${label}: chọn kho`);
        await waitFor('chọn kho', async () => {
          await failOnAlert();
          const x = await keDonState();
          return norm(x.kho.text).includes(norm(it.kho)) && !x.busy ? x : null;
        }, 10000);
        await sleep(300);
      }
      picked = await pickS2('cboThuoc', [it.tim || it.ten, it.ten], it.ten, `${label}: chọn thuốc`);
      st = await waitFor('chọn thuốc', async () => {
        await failOnAlert();
        const x = await keDonState();
        return x.thuoc.value && !x.busy ? x : null;
      }, 10000);
      await sleep(300);
      await call('s2Close');
      const f = await call('keDonFill', { sl: it.sl || '1', cachDung: it.cachDung || '' });
      if (!f.ok) throw new PageError(`${label}: ${f.reason}`);
      st = await keDonState();
      if (String(st.sl).trim() !== String(it.sl || '1').trim()) throw new PageError(`${label}: ô Số lượng không nhận ${it.sl}`);
      const before = st.rows.length;
      const since = await call('now');
      const c = await call('keDonClick', 'Thêm');
      if (!c.ok) throw new PageError(`${label}: không bấm được Thêm (${c.reason})`);
      await waitFor('Thêm thuốc', async () => {
        const t = await call('toasts', since);
        if (t.some((x) => /thêm mới thành công/i.test(x.msg))) return true;
        const err = t.find((x) => x.type === 'error' || x.type === 'warning');
        if (err) throw new PageError(`${label}: OneMES báo "${err.msg}"`);
        const a = await call('swal');
        if (a.visible && a.ready && a.cancelText) {
          // e.g. "Thuốc đã được chỉ định?": never add a second one.
          await call('swalClick', 'cancel');
          throw new PageError(`${label}: OneMES hỏi "${a.title} ${a.text}", tool chọn Không`);
        }
        if (isError(a) && a.ready) {
          await call('swalClick', 'confirm');
          throw new PageError(`${label}: OneMES báo "${a.text || a.title}"`);
        }
        const m = await call('extraModal');
        if (m) throw new PageError(`${label}: OneMES mở thêm hộp thoại "${m.text}", tool không tự trả lời`);
        return null;
      }, 30000);
      // A short "Cảnh báo!" (odd quantity etc.) may follow a successful add; it closes itself.
      const w = await call('swal');
      if (w.visible) log('warn', `${label}: OneMES lưu ý "${w.text || w.title}"`);
      await waitFor('hộp thoại tự đóng', () => call('swalIdle'), 8000);
      st = await waitFor('dòng thuốc mới', async () => {
        const x = await keDonState();
        return x.rows.length > before ? x : null;
      }, 10000);
      log('ok', `${label}: đã thêm "${picked.name}"${picked.code ? ` (${picked.code})` : ''}`);
      await settle();
      const a2 = await call('keDonClick', 'Chấp nhận');
      if (!a2.ok) throw new PageError(`${label}: không bấm được Chấp nhận (${a2.reason})`);
      await waitFor('đóng Kê đơn', async () => {
        await failOnAlert();
        const x = await keDonState();
        return !x.open;
      }, 30000);
    } catch (e) {
      // Close the popup the safe way (Chấp nhận keeps what is there). Its X and "Bỏ qua"
      // delete the order's whole prescription.
      const x = await keDonState().catch(() => ({ open: false }));
      if (x.open && !(e instanceof StopError)) {
        await call('s2Close').catch(() => {});
        await call('keDonClick', 'Chấp nhận').catch(() => {});
        await sleep(800);
        const y = await keDonState().catch(() => ({ open: false }));
        if (y.open) e.message += '. Popup Kê đơn còn mở: hãy bấm Chấp nhận, ĐỪNG bấm X hay Bỏ qua (OneMES sẽ xóa cả đơn thuốc)';
      }
      throw e;
    }
    const after = await readStable(orderId);
    if (!hasItem(after, it)) throw new PageError(`${label}: đã bấm Thêm và Chấp nhận nhưng y lệnh chưa có "${it.label}"`);
    return { added: true, name: picked.name };
  }

  async function addItems(orderId, label, items) {
    const out = [];
    for (const it of items) {
      checkStop();
      const r = await addThuoc(orderId, label, it);
      if (r.added) out.push(it.id);
    }
    return out;
  }

  /**
   * plan = { patient, sourceId, days: 1..4, deletions: [[keys of day1], [keys of day2], ...],
   *          hinhThuc: '1', autoComplete: true,
   *          adds: [[item ids of day1], ...], addItems: [{ id, label, kho, ten, tim, sl, cachDung, loai }] }
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
    const kind = plan.kind === 'sac' ? 'sac' : 'thuong';
    const del = Array.from({ length: N }, (_, i) => [...new Set((plan.deletions && plan.deletions[i]) || [])]);
    const autoComplete = plan.autoComplete !== false;
    const name = plan.patient.hoTen || plan.patient.maBN;
    log('info', `Bắt đầu: ${name}, ${N} ngày${kind === 'sac' ? ' (y lệnh sắc thuốc thang)' : ''}`);

    const before = await openPatient(plan.patient);
    const beforeIds = new Set(before.map((r) => r.id));
    const src = await openOrder(plan.sourceId);
    if (!isDone(src)) throw new PageError(`Y lệnh nguồn đang ở trạng thái "${src.status}", cần Hoàn tất để sao chép`);
    const edits = resolveEdits(src, plan.edits, N);
    const catalog = plan.addItems || [];
    // Sắc thuốc thang copies never add drugs.
    const add = Array.from({ length: N }, (_, i) => (kind === 'sac' ? [] : catalog.filter((it) => ((plan.adds && plan.adds[i]) || []).includes(it.id))));

    // Never create a second order of the same kind for a day that already has one.
    // Sắc thuốc thang orders sit next to the usual order of the day, so each kind only
    // counts its own (orders made by Cập nhật kết quả CLS count for neither).
    const srcRow = before.find((r) => r.id === norm(src.id));
    const srcDate = (srcRow && rowDate(srcRow, kind)) || parseTime(kind === 'sac' ? src.thoiGianThucHien || src.thoiGian : src.thoiGian);
    result.expect = expectations(src, del, srcDate, autoComplete, edits, add);
    result.expect.kind = kind;
    if (srcDate) {
      const taken = [];
      for (let k = 1; k <= N; k++) {
        const d = addDays(srcDate, k);
        if (before.some((r) => sameKind(r, kind) && dayStamp(rowDate(r, kind)) === dayStamp(d))) taken.push(ddmmOf(d));
      }
      if (taken.length) {
        throw new PageError(`Đã có y lệnh${kind === 'sac' ? ' sắc thuốc thang' : ''} ngày ${taken.join(', ')}. Hãy chọn y lệnh nguồn mới nhất, hoặc xóa y lệnh trùng trên OneMES trước`);
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
      result.days[0].added = await addItems(d1, 'Ngày 1', add[0]);
      if (autoComplete) await complete(d1, 'Ngày 1');
      result.ok = true;
      return result;
    }

    // 2. Items deleted on every day go before Sao y lệnh, so the copies lack them too.
    const common = del[0].filter((k) => del.every((d) => d.includes(k)));
    if (common.length) result.days[0].del = await deleteKeys(d1, common, 'Ngày 1');
    // Drugs added on every day also go in before Sao y lệnh, which copies them on.
    const commonAdd = add[0].filter((it) => add.every((a) => a.includes(it)));
    if (commonAdd.length) result.days[0].added = await addItems(d1, 'Ngày 1', commonAdd);

    // 3. Hoàn tất ngày 1 with Sao y lệnh (ngày) = N-1.
    await complete(d1, 'Ngày 1', N - 1, plan.hinhThuc || '1');

    // 4. Day 1 still needs its own deletions: Thu hồi, delete, Hoàn tất.
    let o1 = await readOrder();
    const rest1 = present(o1, del[0]);
    const add1 = add[0].filter((it) => !hasItem(o1, it));
    if (rest1.length || add1.length) {
      await recall(d1, 'Ngày 1');
      const r = await deleteKeys(d1, rest1, 'Ngày 1');
      result.days[0].del = mergeRes(result.days[0].del, r);
      result.days[0].added = [...(result.days[0].added || []), ...(await addItems(d1, 'Ngày 1', add1))];
      if (autoComplete) await complete(d1, 'Ngày 1');
    }

    // 5. Find the copies made by Sao y lệnh and match them to days 2..N by date.
    const after = await listOrders();
    const fresh = after.filter((r) => !beforeIds.has(r.id) && r.id !== d1 && !isClsRow(r));
    // The history list is the reference for dates; the form field is a fallback.
    const row1 = after.find((r) => r.id === d1);
    const base = (row1 && rowDate(row1, kind)) || parseTime(kind === 'sac' ? day1.thoiGianThucHien || day1.thoiGian : day1.thoiGian);
    const byDay = [];
    if (base && fresh.every((r) => rowDate(r, kind))) {
      for (let k = 1; k < N; k++) {
        const want = dayStamp(addDays(base, k));
        const m = fresh.filter((r) => dayStamp(rowDate(r, kind)) === want);
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
      const addK = add[k].filter((it) => !hasItem(o, it));
      let r = { deleted: [], missing: [], failed: [] };
      let added = [];
      // OneMES creates these copies already Hoàn tất: Thu hồi only when something must change.
      if (keys.length || change || addK.length) {
        if (isDone(o)) await recall(row.id, label);
        else if (!isNew(o)) throw new PageError(`${label} có trạng thái "${o.status}", không sửa`);
        r = await deleteKeys(row.id, keys, label);
        if (change) await applyFields(row.id, label, f);
        added = await addItems(row.id, label, addK);
        if (autoComplete) await complete(row.id, label);
      } else if (isNew(o) && autoComplete) {
        await complete(row.id, label);
      } else {
        log('info', `${label}: không có gì cần sửa, giữ nguyên`);
      }
      r.alreadyGone = gone;
      result.days.push({ day: k + 1, id: row.id, time: row.tg, del: r, added });
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
        const adds = e.add || [];
        const isAdded = (b) => adds.some((a) => hasItem({ thuoc: [{ name: label(b) }] }, a));
        for (const b of Object.keys(have)) {
          if (!(b in e.want) && !(b in e.gone) && !isAdded(b)) warnings.push(`Có thêm "${label(b)}" không có trong y lệnh nguồn`);
        }
        for (const a of adds) {
          if (!hasItem(o, a)) problems.push(`Chưa có "${a.label}" (đã tick thêm)`);
        }
        const d = rowDate(row, expect.kind);
        if (e.date && d && dayStamp(d) !== dayStamp(new Date(e.date))) problems.push(`Sai ngày: ${expect.kind === 'sac' ? row.tgth || row.tg : row.tg}, mong đợi ${ddmmOf(new Date(e.date))}`);
      }
      if (e && e.edit) {
        const left = fieldsFor(o, e.edit);
        if (left.thoiGianThucHien) problems.push(e.edit.thucHien ? `Thời gian thực hiện là ${o.thoiGianThucHien || 'trống'}, đã chọn ${left.thoiGianThucHien}` : `Giờ thực hiện là ${(o.thoiGianThucHien || '').slice(0, 5)}, đã chọn ${e.edit.gio}`);
        if (left.thoiGian && e.edit.chiDinh) problems.push(`Thời gian chỉ định là ${o.thoiGian || 'trống'}, đã chọn ${left.thoiGian}`);
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
        added: e && e.add ? e.add.filter((a) => hasItem(o, a)).map((a) => a.label) : [],
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

  // ---------- dọn dịch vụ kỹ thuật các ngày cũ ----------
  // Days before `before` (default: today) whose DV column is yellow, except the
  // sắc thuốc thang orders. Each is opened and its services that are Hoàn trả or
  // Chờ thực hiện are listed. Read only.
  const DV_DO = /hoàn trả|chờ thực hiện/i;
  async function scanDvCu(patient, opts = {}) {
    const name = patient.hoTen || patient.maBN;
    await gotoPatient(patient);
    const rows = await listOrders(true);
    const cut = opts.before ? parseTime(opts.before) || new Date(opts.before) : new Date();
    const today = new Date(cut.getFullYear(), cut.getMonth(), cut.getDate());
    const yellow = rows.filter((r) => r.dv && !isSac(r) && parseTime(r.tg) && parseTime(r.tg) < today);
    yellow.sort((a, b) => parseTime(a.tg) - parseTime(b.tg));
    log('info', `${name}: ${yellow.length} ngày cũ có cột DV màu vàng`);
    const days = [];
    for (const r of yellow) {
      checkStop();
      const o = await openOrder(r.id);
      const items = o.dvkt
        .filter((x) => DV_DO.test(x.trangThai))
        .map((x) => ({ id: x.id, name: x.name, moTa: x.moTa, group: x.group, trangThai: x.trangThai, action: /hoàn trả/i.test(x.trangThai) ? 'xoa' : 'thuhoi' }));
      days.push({ id: r.id, tg: r.tg, status: o.status, items, other: o.dvkt.filter((x) => !DV_DO.test(x.trangThai)).length });
    }
    await call('back').catch(() => {});
    const n = days.reduce((a, d) => a + d.items.length, 0);
    log('info', `${name}: ${n} thủ thuật cần dọn (hoàn trả hoặc chờ thực hiện)`);
    return { days, at: Date.now() };
  }

  async function suaDVOpen(label) {
    const st = await call('dvSuaState');
    if (st.open) return st;
    await settle();
    const r = await call('dvSuaOpen');
    if (!r.ok) throw new PageError(`${label}: không mở được Sửa DVKT (${r.reason})`);
    return waitFor('bảng Sửa DVKT', async () => {
      await failOnAlert();
      const x = await call('dvSuaState');
      return x.open ? x : null;
    });
  }

  async function suaDVClose() {
    await call('dvSuaClose').catch(() => {});
    await waitFor('đóng Sửa DVKT', async () => !(await call('dvSuaState')).open, 5000).catch(() => {});
  }

  // Waits until service `id` is gone from the order (and from Sửa DVKT if open).
  async function waitDvGone(orderId, id) {
    await waitFor('xóa dịch vụ xong', async () => {
      const s = await failOnAlert();
      if (s.visible) return null;
      const x = await call('readOrder');
      if (!x.ok || norm(x.id) !== norm(orderId) || x.busy) return null;
      if (x.dvkt.some((y) => y.id === norm(id))) return null;
      const st = await call('dvSuaState');
      return !st.open || !st.rows.some((y) => y.id === norm(id));
    }, 30000);
  }

  async function deleteOneDv(orderId, label, it, viaPopup) {
    await step(`${label}: xóa "${it.name}"`);
    await settle();
    let r;
    if (viaPopup) {
      const st = await call('dvSuaState');
      const row = st.rows.find((x) => x.id === norm(it.id));
      if (!row || !row.del) throw new PageError(`${label}: Sửa DVKT không có nút xóa cho "${it.name}"`);
    }
    r = await call('deleteDichVu', it.id);
    if (!r.ok) throw new PageError(`${label}: không xóa được "${it.name}" (${r.reason})`);
    await confirmDialogMatching(/(xóa|hủy) dịch vụ/i, 'hộp thoại xóa dịch vụ');
    await waitDvGone(orderId, it.id);
  }

  /**
   * days = [{ id, items: [service ids] }] from scanDvCu, as ticked by the user.
   * Hoàn trả: delete. Chờ thực hiện: Sửa DVKT > Thu hồi (status becomes Mới) > delete.
   * Every service is re-read first; one whose status changed meanwhile is left alone.
   */
  async function cleanDvCu(patient, days) {
    const name = patient.hoTen || patient.maBN;
    await gotoPatient(patient);
    await listOrders(true);
    const out = [];
    for (const d of days) {
      checkStop();
      const res = { id: d.id, tg: d.tg, deleted: [], skipped: [], failed: [] };
      out.push(res);
      if (!d.items || !d.items.length) continue;
      let o = await openOrder(d.id);
      const label = `${name}, y lệnh ${d.tg || o.thoiGian}`;
      for (const id of d.items) {
        checkStop();
        o = await readStable(d.id);
        const it = o.dvkt.find((x) => x.id === norm(id));
        if (!it) {
          res.skipped.push({ id, why: 'không còn trên y lệnh' });
          continue;
        }
        try {
          if (/hoàn trả/i.test(it.trangThai)) {
            if (it.canDelete) await deleteOneDv(d.id, label, it, false);
            else {
              const st = await suaDVOpen(label);
              if (!st.rows.some((x) => x.id === it.id && x.del)) throw new PageError(`${label}: không thấy nút xóa "${it.name}"`);
              await deleteOneDv(d.id, label, it, true);
            }
          } else if (/chờ thực hiện/i.test(it.trangThai)) {
            const st = await suaDVOpen(label);
            const row = st.rows.find((x) => x.id === it.id);
            if (!row) throw new PageError(`${label}: Sửa DVKT không có "${it.name}"`);
            if (row.thuHoi) {
              await step(`${label}: thu hồi "${it.name}"`);
              await settle();
              const since = await call('now');
              const r = await call('dvThuHoi', it.id);
              if (!r.ok) throw new PageError(`${label}: ${r.reason}`);
              await confirmDialogMatching(/thu hồi dịch vụ/i, 'hộp thoại thu hồi dịch vụ');
              await waitFor('thu hồi dịch vụ', async () => {
                await failOnAlert();
                const t = await call('toasts', since);
                if (!t.some((x) => /thu hồi yêu cầu dịch vụ thành công/i.test(x.msg))) return null;
                const x = await call('dvSuaState');
                const y = x.rows.find((z) => z.id === it.id);
                return y && y.del;
              }, 30000);
              log('ok', `${label}: đã thu hồi "${it.name}"`);
            } else if (!row.del) throw new PageError(`${label}: Sửa DVKT không có nút thu hồi hay xóa cho "${it.name}"`);
            await deleteOneDv(d.id, label, it, true);
          } else {
            res.skipped.push({ id, name: it.name, why: `trạng thái giờ là "${it.trangThai}"` });
            log('warn', `${label}: "${it.name}" đang ở "${it.trangThai}", bỏ qua`);
            continue;
          }
          res.deleted.push({ id, name: it.name });
          log('ok', `${label}: đã xóa "${it.name}"`);
        } catch (e) {
          if (e instanceof StopError) throw e;
          res.failed.push({ id, name: it.name, why: e.message });
          log('err', e.message);
          await call('swalClick', 'cancel').catch(() => {});
          await suaDVClose();
          throw e;
        }
      }
      await suaDVClose();
    }
    await call('back').catch(() => {});
    log('ok', `${name}: xong dọn thủ thuật`);
    return out;
  }

  // ---------- kết quả cận lâm sàng ----------
  async function kqOpen(patient) {
    await gotoPatient(patient);
    await settle();
    const r = await call('kqOpen');
    if (!r.ok) throw new PageError(`Không mở được Xem kết quả (${r.reason})`);
    // The lists arrive a moment later; a patient may have none at all.
    const start = Date.now();
    let tabs = false;
    return waitFor('Xem kết quả', async () => {
      await failOnAlert();
      const x = await call('kqList');
      if (!x.ok || x.busy) return null;
      if (x.xn.length || x.cdha.length) return x;
      if (!tabs && Date.now() - start > 1500) {
        tabs = true;
        await call('kqTabs');
      }
      return Date.now() - start > 8000 ? x : null;
    });
  }

  // The dates (dd/MM/yyyy) that have a result in Lịch sử XN or Lịch sử CĐHA.
  async function clsList(patient) {
    const name = patient.hoTen || patient.maBN;
    const l = await kqOpen(patient);
    await call('kqClose');
    const rows = [...l.xn.map((x) => ({ ...x, kind: 'xn' })), ...l.cdha.map((x) => ({ ...x, kind: 'cdha' }))];
    const dates = [...new Set(rows.map((r) => (r.date.split(' ')[1] || '')).filter(Boolean))];
    dates.sort((a, b) => parseTime('00:00 ' + b) - parseTime('00:00 ' + a));
    log('info', `${name}: có kết quả ${dates.length} ngày (${l.xn.length} xét nghiệm, ${l.cdha.length} CĐHA)`);
    // Not a single row read: write what the lists look like, so the page can be fixed.
    if (!l.xn.length) log('warn', `${name}: Lịch sử XN không đọc được dòng nào (${l.xnShape || '?'})`);
    if (!l.cdha.length) log('info', `${name}: Lịch sử CĐHA trống (${l.cdhaShape || '?'})`);
    const noDate = rows.filter((r) => !r.date).length;
    if (noDate) log('warn', `${name}: ${noDate} dòng kết quả không đọc được ngày`);
    return { dates, rows, at: Date.now() };
  }

  // Reads every XN and CĐHA of the chosen dates (top to bottom) and keeps the values
  // shown in red or blue, plus each CĐHA's Kết luận.
  async function clsRead(patient, dates) {
    const name = patient.hoTen || patient.maBN;
    const l = await kqOpen(patient);
    const want = new Set(dates);
    const dayOf = (r) => r.date.split(' ')[1] || '';
    const out = [];
    for (const kind of ['xn', 'cdha']) {
      for (const r of l[kind]) {
        checkStop();
        if (!want.has(dayOf(r))) continue;
        const o = await call('kqOpenRow', kind, r.idx);
        if (!o.ok) throw new PageError(o.reason);
        if (kind === 'xn') {
          const d = await waitFor(`kết quả ${r.name || 'xét nghiệm'}`, async () => {
            await failOnAlert();
            const x = await call('kqDetailXN');
            return x.ready && !x.busy ? x : null;
          });
          // OneMES sometimes colours a value that sits inside its own reference range:
          // keep a coloured value only when it is outside (or the range can't be read).
          const flagged = d.items.filter((x) => x.flag);
          const bad = flagged.filter((x) => clsInRange(x.value, x.ref) !== true);
          const wrong = flagged.filter((x) => !bad.includes(x)).map((x) => ({ name: clsName(x.name), value: x.value, ref: x.ref, unit: x.unit }));
          out.push({ kind, date: r.date, name: r.name, loai: d.loai, items: bad, total: d.items.length, wrong });
          log('info', `${name}: ${r.name} ${r.date}: ${bad.length}/${d.items.length} chỉ số bất thường` + (wrong.length ? `; bỏ ${wrong.length} chỉ số tô màu nhưng vẫn trong khoảng tham chiếu (${wrong.map((x) => `${x.name} ${x.value}, tham chiếu ${x.ref}`).join('; ')})` : ''));
        } else {
          const d = await waitFor(`kết quả ${r.name || 'CĐHA'}`, async () => {
            await failOnAlert();
            const x = await call('kqDetailCDHA');
            return x.ready && !x.busy ? x : null;
          });
          out.push({ kind, date: r.date, name: r.name || d.dichVu.join(', '), ketLuan: d.ketLuan });
          log('info', `${name}: ${r.name} ${r.date}: đã đọc kết luận`);
        }
      }
    }
    await call('kqClose');
    return { results: out, text: clsText(out), at: Date.now() };
  }

  /**
   * Thêm y lệnh mới, then writes time and diễn biến bệnh into it and saves.
   * thoiGian = 'HH:mm dd/MM/yyyy' (thời gian thực hiện; chỉ định one minute earlier).
   */
  async function clsCreate(patient, { thoiGian, dienBien }, autoComplete = false) {
    const name = patient.hoTen || patient.maBN;
    const th = parseTime(thoiGian);
    if (!th) throw new PageError(`Thời gian "${thoiGian}" không đúng dạng giờ:phút ngày/tháng/năm`);
    if (!String(dienBien || '').trim()) throw new PageError('Nội dung y lệnh đang trống');
    await gotoPatient(patient);
    const before = await listOrders();
    const ids = new Set(before.map((r) => r.id));
    await step(`${name}: Thêm y lệnh mới`);
    await settle();
    const r = await call('newOrder');
    if (!r.ok) throw new PageError(`Không thấy nút Thêm y lệnh mới (${r.reason})`);
    const o = await waitFor('y lệnh mới', async () => {
      await failOnAlert();
      const w = await where();
      if (!w.popupOpen) return null;
      const x = await call('readOrder');
      return x.ok && x.id && x.status && !ids.has(norm(x.id)) ? x : null;
    }, 60000);
    if (!isNew(o)) throw new PageError(`Y lệnh mới có trạng thái "${o.status}", dừng`);
    const id = norm(o.id);
    const label = `${name}, y lệnh mới`;
    log('ok', `${label}: đã tạo (${o.thoiGian})`);
    const f = { thoiGianThucHien: fmtTime(th), thoiGian: fmtTime(new Date(th.getTime() - 60000)), dienBien };
    if (o.thoiGianThucHien === f.thoiGianThucHien) delete f.thoiGianThucHien;
    if (o.thoiGian === f.thoiGian) delete f.thoiGian;
    await applyFields(id, label, f);
    const back = await readStable(id);
    if (back.thoiGianThucHien && back.thoiGianThucHien !== fmtTime(th)) throw new PageError(`${label}: giờ thực hiện trên OneMES là ${back.thoiGianThucHien}, không phải ${fmtTime(th)}`);
    if (autoComplete) await complete(id, label);
    await call('back').catch(() => {});
    return { id, thoiGian: fmtTime(th) };
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

  // Only empty boxes on OneMES are filled: whatever is already written there is kept,
  // so a record someone started by hand is never overwritten.
  async function saveBenhAn(patient, fields, values) {
    const name = patient.hoTen || patient.maBN;
    log('info', `${name}: ghi Thông tin bệnh án`);
    await openBenhAn(patient);
    const cur = await call('readBenhAn', fields);
    const kept = fields.filter((f) => f.id in values && isFilled(cur.values[f.id]) && !sameValue(f.kind, values[f.id], cur.values[f.id])).map((f) => f.id);
    const todo = fields.filter((f) => f.id in values && !kept.includes(f.id) && !cur.missing.includes(f.id) && !sameValue(f.kind, values[f.id], cur.values[f.id]));
    if (kept.length) log('info', `${name}: giữ nguyên ${kept.length} mục đã có nội dung trên OneMES`);
    if (!todo.length) {
      log('ok', `${name}: không có mục trống nào cần điền`);
      return { values: cur.values, missing: cur.missing.filter((id) => id in values), kept, filled: [], diff: [], at: Date.now() };
    }
    const vals = Object.fromEntries(todo.map((f) => [f.id, values[f.id]]));
    const w = await call('writeBenhAn', todo, vals);
    if (w.missing.length) log('warn', `${name}: không điền được ${w.missing.length} mục (${w.missing.slice(0, 5).join(', ')})`);
    const parts = [
      [1, /thông tin chung thành công/i, 'Thông tin chung'],
      [2, /chuyên khoa thành công/i, 'Thông tin chuyên khoa'],
    ];
    for (const [part, ok, title] of parts) {
      if (!todo.some((f) => f.part === part)) continue;
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
      log('ok', `${name}: đã lưu ${title} (điền ${todo.filter((f) => f.part === part).length} mục trống)`);
    }
    // Read the page again from OneMES to be sure what was saved.
    await openBenhAn(patient);
    const back = await call('readBenhAn', fields);
    const diff = todo.filter((f) => !w.missing.includes(f.id) && !sameValue(f.kind, values[f.id], back.values[f.id])).map((f) => f.id);
    if (diff.length) log('warn', `${name}: sau khi lưu, ${diff.length} mục khác với bản đã sửa (${diff.slice(0, 5).join(', ')})`);
    else log('ok', `${name}: Thông tin bệnh án đã lưu đúng`);
    const missing = [...new Set([...cur.missing.filter((id) => id in values), ...w.missing])];
    return { values: back.values, missing, kept, filled: todo.map((f) => f.id), diff, at: Date.now() };
  }

  return { call, where, addThuoc, autoTicks, sacEdits, scanPatients, openPatient, listOrders, pickSource, loadPatient, scanDvCu, cleanDvCu, clsList, clsRead, clsCreate, openOrder, readOrder, run, gotoList, verify, deleteOrder, updateDay, loadLists, readBenhAn, saveBenhAn, fieldsFor };
}

const SAC_RE = /sắc thuốc thang/i;
const isSac = (r) => SAC_RE.test(String((r && r.khac) || ''));
// Orders written by Cập nhật kết quả CLS start with this line.
const CLS_HEAD = 'Kết quả CLS:';
const isClsRow = (r) => String((r && r.dienBien) || '').trim().startsWith(CLS_HEAD);
// The day an order belongs to. A sắc thuốc thang order is prescribed the day before it
// is carried out, so its day is the one of Thời gian thực hiện.
function rowDate(r, kind) {
  return kind === 'sac' ? parseTime(r.tgth) || parseTime(r.tg) : parseTime(r.tg);
}
const sameKind = (r, kind) => (kind === 'sac' ? isSac(r) : !isSac(r) && !isClsRow(r));

const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fold = (s) => norm(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
// The usual order of day d (not sắc thuốc thang, not Kết quả CLS), earliest first.
function usualOn(rows, d) {
  const want = dayStamp(d);
  const t = (r) => parseTime(r.tgth) || parseTime(r.tg);
  return rows
    .filter((r) => !isSac(r) && !isClsRow(r) && t(r) && dayStamp(t(r)) === want)
    .sort((a, b) => t(a) - t(b))[0];
}
function findDoctor(doctors, name) {
  const n = fold(name);
  if (!n) return null;
  const bare = (s) => s.replace(/^bs\.?\s*/, '').trim();
  const hit = doctors.find((x) => fold(x.name) === n) || doctors.find((x) => bare(fold(x.name)) === bare(n));
  return hit ? { id: hit.id, text: hit.name } : null;
}
// Which copied day (1..N) gets which Thêm thuốc tick: a usual order on day D holding
// a drug puts a tick on day D + tuTick. The copied days count too: a day keeps the
// drug when the source has it and it is not deleted there, or when it is ticked.
// history = [{ tg, names }], deletions = base or item keys per day.
function planTicks({ history, srcDate, srcThuoc = [], deletions = [], catalog = [], N = 4 }) {
  const has = (name, it) => norm(name) === norm(it.ten) || norm(name).startsWith(norm(it.ten));
  const adds = Array.from({ length: N }, () => []);
  const why = [];
  const strip = (k) => String(k).replace(/#\d+$/, '');
  for (const it of catalog) {
    const n = parseInt(it.tuTick, 10);
    if (!(n > 0)) continue;
    const holds = new Set();
    for (const h of history) {
      const d = parseTime(h.tg);
      if (d && h.names.some((x) => has(x, it))) holds.add(dayStamp(d));
    }
    const srcItems = srcThuoc.filter((x) => has(x.name, it));
    for (let k = 0; k < N; k++) {
      const from = addDays(srcDate, k + 1 - n);
      if (holds.has(dayStamp(from))) {
        adds[k].push(it.id);
        why.push({ day: k + 1, id: it.id, from: ddmmOf(from) });
      }
      const del = ((deletions && deletions[k]) || []).map(strip);
      if (adds[k].includes(it.id) || srcItems.some((x) => !del.includes(strip(x.key || baseKey(x))))) holds.add(dayStamp(addDays(srcDate, k + 1)));
    }
  }
  return { adds, why };
}

// "Xét nghiệm huyết học" -> "Công thức máu", other groups lose "Xét nghiệm".
function clsGroup(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (/huyết học/i.test(t)) return 'Công thức máu';
  if (/hóa sinh|hoá sinh/i.test(t)) return 'Hóa sinh máu';
  const x = t.replace(/^xét nghiệm\s*/i, '').trim();
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : 'Xét nghiệm';
}
// "(S34) Định lượng Procalcitonin (PCT) (máu)" -> "PCT"; otherwise the plain name.
function clsName(s) {
  let t = String(s || '').replace(/\s+/g, ' ').trim();
  // A leading code: "(S34)" is dropped; "(MPV)" is the short name itself.
  const code = /^\(([A-Z0-9.\-]{1,10})\)\s*/i.exec(t);
  if (code) t = t.slice(code[0].length);
  // "(máu) [Máu]" and the like may come twice.
  for (let i = 0; i < 3; i++) t = t.replace(/\s*[([](máu|huyết thanh|nước tiểu|huyết tương)[)\]]\s*$/i, '').trim();
  t = t.replace(/^định lượng\s+/i, '').replace(/^đo\s+/i, '').trim();
  const ab = /\(([A-Za-z0-9#%.\-+/ ]{3,12})\)\s*$/.exec(t);
  if (ab && /[A-Za-z]/.test(ab[1])) return ab[1].trim();
  // "HDL-C (High density lipoprotein Cholesterol)" -> "HDL-C"
  const lead = /^([A-Za-z0-9\-# ]{2,10}?)\s*\(.{12,}\)$/.exec(t);
  if (lead) return lead[1].trim();
  if (code && /^[A-Z]{2,}$/i.test(code[1]) && t.length > 12) return code[1];
  return t;
}
const CLS_NORMAL = 'Các chỉ số trong giới hạn bình thường';
const CLS_NUM = String.raw`-?\d+(?:[.,]\d+)?`;
const clsNum = (s) => parseFloat(String(s).replace(',', '.'));
// Is the value inside its reference range? true / false, or null when the range
// can't be read (then the site's colour stands). "4-10", "4 – 10", "< 5", "≥ 60",
// "Nam: 130-170; Nữ: 120-150" (inside every range = true, inside none = false),
// "Âm tính" (the same words as the value = true).
function clsInRange(value, ref) {
  const v = String(value || '').trim();
  const r = String(ref || '').trim();
  if (!v || !r) return null;
  const vm = new RegExp(`^[<>≤≥=\\s]*(${CLS_NUM})`).exec(v);
  if (!vm) return norm(v) === norm(r) ? true : null;
  const x = clsNum(vm[1]);
  const checks = [];
  const range = new RegExp(`(${CLS_NUM})\\s*(?:-|–|—|~|đến)\\s*(${CLS_NUM})`, 'gi');
  let m;
  const rest = r.replace(range, (_, a, b) => {
    const lo = Math.min(clsNum(a), clsNum(b));
    const hi = Math.max(clsNum(a), clsNum(b));
    checks.push(x >= lo && x <= hi);
    return ' ';
  });
  const one = new RegExp(`(<=|>=|≤|≥|<|>)\\s*(${CLS_NUM})`, 'g');
  while ((m = one.exec(rest))) {
    const n = clsNum(m[2]);
    checks.push(m[1] === '<' ? x < n : m[1] === '>' ? x > n : m[1] === '<=' || m[1] === '≤' ? x <= n : x >= n);
  }
  if (!checks.length) return null;
  if (checks.every(Boolean)) return true;
  if (!checks.some(Boolean)) return false;
  return null;
}
// The text of the new order: one line per test group, then one per CĐHA.
function clsText(results) {
  const days = [...new Set(results.map((r) => (r.date.split(' ')[1] || '')))];
  const many = days.length > 1;
  const lines = [CLS_HEAD];
  for (const day of days) {
    const rs = results.filter((r) => (r.date.split(' ')[1] || '') === day);
    const block = [];
    const groups = new Map();
    for (const r of rs.filter((x) => x.kind === 'xn')) {
      for (const it of r.items) {
        const g = clsGroup(r.name || r.loai || it.group);
        if (!groups.has(g)) groups.set(g, []);
        const v = `${clsName(it.name)}: ${it.value}${it.unit ? (it.unit === '%' ? '' : ' ') + it.unit : ''}`;
        if (!groups.get(g).includes(v)) groups.get(g).push(v);
      }
    }
    for (const [g, vs] of groups) block.push(`${g}: ${vs.join('; ')}`);
    for (const r of rs.filter((x) => x.kind === 'cdha')) if (r.ketLuan) block.push(`${r.name}: ${r.ketLuan.replace(/\s*\n\s*/g, '; ')}`);
    // Tests read but nothing abnormal in any of them.
    if (rs.some((x) => x.kind === 'xn') && !groups.size) block.unshift(block.length ? 'Xét nghiệm: ' + CLS_NORMAL.toLowerCase() : CLS_NORMAL);
    if (!block.length) continue;
    if (many) lines.push(`Ngày ${day.slice(0, 5)}:`);
    lines.push(...block.map((b) => (many ? '- ' + b : b)));
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

function countBy(list) {
  const o = {};
  for (const x of list) o[x] = (o[x] || 0) + 1;
  return o;
}

// What each created day should hold: the source minus that day's deletions.
function expectations(src, del, srcDate, autoComplete, edits = [], add = []) {
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
      add: (add[i] || []).map((it) => ({ id: it.id, label: it.label, ten: it.ten })),
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

// Something is written in the box: text, a choice, a tick.
function isFilled(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'boolean') return v;
  return String(v == null ? '' : v).trim() !== '';
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

module.exports = { createDriver, planTicks, isSac, clsInRange, clsText, resolveEdits, withKeys, baseKey, parseTime, fmtTime, norm, StopError, PageError, AGENT };
