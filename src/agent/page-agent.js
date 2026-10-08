// Injected into the OneMES page (webContents.executeJavaScript). Reads the page and
// calls OneMES's own functions; it never calls the server directly.
// Every function returns plain data so it survives structured clone.
(function () {
  if (window.__SYL && window.__SYL.version === 4) return;

  const txt = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  const norm = (s) =>
    (s || '')
      .normalize('NFC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  const isShown = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    return el.offsetParent !== null || cs.position === 'fixed';
  };
  const byId = (id) => document.getElementById(id);
  // Column positions from the first header row, honouring colspan.
  const headerCols = (tbl) => {
    const cols = [];
    const tr = tbl && tbl.querySelector('tr');
    if (!tr) return cols;
    for (const th of tr.children) {
      const span = parseInt(th.getAttribute('colspan') || '1', 10) || 1;
      for (let i = 0; i < span; i++) cols.push(i === 0 ? norm(th.textContent) : '');
    }
    return cols;
  };

  // Remember toastr messages so the driver can tell success from failure.
  const toastLog = [];
  function hookToastr() {
    const t = window.toastr;
    if (!t || t.__sylHooked) return;
    ['info', 'success', 'warning', 'error'].forEach((k) => {
      const orig = t[k];
      if (typeof orig !== 'function') return;
      t[k] = function (msg) {
        toastLog.push({ type: k, msg: String(msg || ''), at: Date.now() });
        if (toastLog.length > 50) toastLog.shift();
        return orig.apply(this, arguments);
      };
    });
    t.__sylHooked = true;
  }

  function where() {
    hookToastr();
    const url = location.href;
    const login = !!document.querySelector('input[type=password]') && /login/i.test(url);
    const list = !!byId('tblNoiTru') || /wpid=danhsachdieutrinoitrudraw/i.test(url);
    const bacsi = /wpid=bacsidraw/i.test(url);
    const popup = byId('divWebpartPopup');
    const popupOpen = isShown(popup) && typeof window._ylenh_ID === 'string' && window._ylenh_ID.length > 0 && !!byId('divStatusPopup');
    return {
      url,
      page: login ? 'login' : list ? 'list' : bacsi ? 'bacsi' : 'other',
      popupOpen: !!popupOpen,
      orderId: popupOpen ? String(window._ylenh_ID || window.ObjectWebpartPopup_Id || '') : '',
      noitruid: typeof window.noitruid === 'string' ? window.noitruid : '',
      busy: isBusy(),
    };
  }

  function isBusy() {
    const ov = document.querySelector('.loadingoverlay');
    return !!(ov && isShown(ov));
  }

  // ---------- Danh sách điều trị nội trú ----------
  function readPatients() {
    const tbl = byId('tblNoiTru');
    if (!tbl) return { ok: false, reason: 'no-table' };
    const heads = [...tbl.querySelectorAll('tr th')].map((th) => norm(th.textContent));
    const col = (name) => heads.indexOf(norm(name));
    const idx = {
      tgVao: col('T/G vào'),
      bg: col('B-G'),
      maBN: col('Mã BN'),
      hoTen: col('Họ tên'),
      tuoi: col('Tuổi'),
      gt: col('GT'),
      doiTuong: col('Đối tượng'),
      tamUng: col('Tạm ứng'),
      phaiTra: col('Phải trả'),
      trangThai: col('Trạng thái'),
      bacSi: col('Bác sĩ'),
      chanDoan: col('Chẩn đoán'),
      khoa: col('Khoa'),
    };
    const out = [];
    let buong = '';
    for (const tr of tbl.querySelectorAll('tr')) {
      const tds = [...tr.children].filter((c) => c.tagName === 'TD');
      if (!tds.length) continue;
      if (tds.length === 1) {
        buong = txt(tds[0]);
        continue;
      }
      const link = tr.querySelector('a[href*="wpid=bacsidraw"]');
      if (!link) continue;
      const href = link.href;
      const m = /[?&]noitruid=([0-9a-f-]{36})/i.exec(href);
      const cell = (k) => (idx[k] >= 0 && tds[idx[k]] ? tds[idx[k]] : null);
      // Họ tên cell also holds a hidden dropdown; take the visible link text.
      const nameCell = cell('hoTen');
      let hoTen = '';
      if (nameCell) {
        const a = [...nameCell.querySelectorAll('a')].find((x) => /bacsidraw/i.test(x.href || '') && txt(x));
        hoTen = a ? txt(a) : txt(nameCell);
      }
      const chanDoanCell = cell('chanDoan');
      out.push({
        noitruid: m ? m[1].toLowerCase() : '',
        url: href,
        buong,
        tgVao: txt(cell('tgVao')),
        bg: txt(cell('bg')),
        maBN: txt(cell('maBN')),
        hoTen,
        tuoi: txt(cell('tuoi')),
        gt: txt(cell('gt')),
        doiTuong: txt(cell('doiTuong')),
        tamUng: txt(cell('tamUng')),
        phaiTra: txt(cell('phaiTra')),
        trangThai: txt(cell('trangThai')),
        bacSi: txt(cell('bacSi')),
        chanDoan: (chanDoanCell && chanDoanCell.getAttribute('title')) || txt(chanDoanCell),
        khoa: txt(cell('khoa')),
      });
    }
    return { ok: true, patients: out.filter((p) => p.noitruid) };
  }

  // Link to Ds Điều trị nội trú from the menu (carries the session's usid).
  function listLink() {
    const a = [...document.querySelectorAll('a[href*="wpid=danhsachdieutrinoitrudraw"]')].find(
      (x) => !/bacsidraw/i.test(x.href) && /^https?:/i.test(x.href)
    );
    return a ? a.href.replace(/#.*$/, '') : '';
  }

  // Page numbers offered by the patient list pager (NextPage(n) links), if any.
  function listPages() {
    const nums = new Set();
    for (const a of document.querySelectorAll('a[href*="NextPage("], a[onclick*="NextPage("]')) {
      const m = /NextPage\((\d+)\)/.exec((a.getAttribute('href') || '') + ' ' + (a.getAttribute('onclick') || ''));
      if (m) nums.add(parseInt(m[1], 10));
    }
    return { current: typeof window._currentPageIndex === 'number' ? window._currentPageIndex : 0, pages: [...nums].sort((a, b) => a - b) };
  }

  function gotoListPage(i) {
    if (typeof window.NextPage !== 'function') return { ok: false, reason: 'no-NextPage' };
    window.NextPage(i);
    return { ok: true };
  }

  function searchPatients() {
    if (typeof window.FilterChange !== 'function') return { ok: false, reason: 'no-FilterChange' };
    window.FilterChange();
    return { ok: true };
  }

  // ---------- Lịch sử y lệnh ----------
  function showOrderList() {
    hookToastr();
    if (typeof window.backForm === 'function' && isShown(byId('divWebpartPopup'))) window.backForm();
    if (typeof window.onshowDsYLenh !== 'function') return { ok: false, reason: 'no-onshowDsYLenh' };
    const sl = byId('soLuongHienThi');
    if (sl && sl.value && parseInt(sl.value, 10) < 25) {
      sl.value = '25';
    }
    if (byId('divDsYLenh') && typeof window.loadListYLenh === 'function') window.loadListYLenh();
    else window.onshowDsYLenh(byId('showDsYLenh'));
    return { ok: true };
  }

  function findOrderTable() {
    const root = byId('divDsYLenh') || document;
    const th = [...root.querySelectorAll('th')].find((x) => norm(x.textContent) === norm('Diễn biến PHCN'));
    return th ? th.closest('table') : null;
  }

  function readOrderList() {
    const tbl = findOrderTable();
    if (!tbl) return { ok: false, reason: 'no-table' };
    const heads = [...tbl.querySelectorAll('tr th')].map((th) => norm(th.textContent));
    const col = (n) => heads.indexOf(norm(n));
    const c = {
      tg: col('TG Y lệnh'),
      tgth: col('TGTH Y lệnh'),
      bacSi: col('Bác sĩ'),
      db: col('Diễn biến bệnh'),
      dbp: col('Diễn biến PHCN'),
      theoDoi: col('Y lệnh theo dõi'),
      khac: col('Y lệnh khác'),
      cdcs: col('CĐ CS'),
    };
    const full = (td) => {
      if (!td) return '';
      const a = td.querySelector('[data-content]');
      return ((a && a.getAttribute('data-content')) || td.textContent || '').trim();
    };
    const rows = [];
    for (const tr of tbl.querySelectorAll('tr[id^="tr"]')) {
      const id = tr.id.slice(2);
      if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
      const tds = [...tr.children].filter((x) => x.tagName === 'TD');
      const g = (k) => (c[k] >= 0 ? tds[c[k]] : null);
      rows.push({
        id: id.toLowerCase(),
        tg: txt(g('tg')),
        tgth: txt(g('tgth')),
        bacSi: txt(g('bacSi')),
        dienBien: full(g('db')),
        dienBienPHCN: full(g('dbp')),
        theoDoi: full(g('theoDoi')),
        khac: full(g('khac')),
        cdcs: txt(g('cdcs')),
      });
    }
    return { ok: true, noitruid: String(window.noitruid || ''), rows };
  }

  // ---------- Một y lệnh ----------
  function openOrder(id) {
    hookToastr();
    if (typeof window.onDrawWebpartYLenh !== 'function') return { ok: false, reason: 'no-onDrawWebpartYLenh' };
    window.onDrawWebpartYLenh(id);
    return { ok: true };
  }

  function buttons() {
    const ids = ['btnSaoChep', 'btnPopupHOANTAT', 'btnPopupTHUHOI', 'btnPopupXOA', 'btnSaveThamKhamDraw', 'btnThemYLenhMoi'];
    const o = {};
    for (const id of ids) o[id] = isShown(byId(id));
    return o;
  }

  function readGroupedRows(tbl, rowSelector) {
    const items = [];
    if (!tbl) return items;
    let group = '';
    for (const tr of tbl.querySelectorAll('tbody tr, tr')) {
      if (tr.closest('table') !== tbl) continue;
      if (tr.querySelector('th')) continue;
      const tds = [...tr.children].filter((x) => x.tagName === 'TD');
      if (!tr.matches(rowSelector)) {
        const t = txt(tr).replace(/\(\d+\)\s*$/, '').trim();
        if (t && tds.length <= 2) group = t;
        continue;
      }
      items.push({ tr, tds, group });
    }
    return items;
  }

  function readOrder() {
    hookToastr();
    const w = where();
    if (!w.popupOpen) return { ok: false, reason: 'popup-closed' };
    const status = txt(byId('divStatusPopup'));
    const info = txt(byId('txtYLenhInfo'));
    const val = (id) => (byId(id) ? byId(id).value || '' : '');

    const thuoc = [];
    const tblThuoc = byId('tblThuoc');
    const thHeads = headerCols(tblThuoc);
    const thCol = (n) => thHeads.findIndex((h) => h && h.startsWith(norm(n)));
    const tc = {
      loaiKe: thCol('Loại kê'),
      kho: thCol('Tên kho'),
      ten: thCol('Tên dược'),
      hamLuong: thCol('Hàm lượng'),
      dvt: thCol('ĐVT'),
      duongDung: thCol('Đường dùng'),
      sl: thCol('SL'),
      cachDung: thCol('Cách dùng'),
      doiTuong: thCol('Đối tượng'),
      trangThai: thCol('Trạng thái'),
    };
    for (const { tr, tds, group } of readGroupedRows(tblThuoc, 'tr[id^="td"][data-stt]')) {
      const del = tr.querySelector('a[href*="DeleteThuocInThamKham"]');
      const m = del && /DeleteThuocInThamKham\('([0-9a-f-]{36})'\)/i.exec(del.getAttribute('href') || '');
      const g = (k) => (tc[k] >= 0 ? txt(tds[tc[k]]) : '');
      thuoc.push({
        kind: 'thuoc',
        id: m ? m[1].toLowerCase() : tr.id.slice(2).toLowerCase(),
        canDelete: !!m,
        group,
        loaiKe: g('loaiKe'),
        kho: g('kho'),
        name: g('ten'),
        hamLuong: g('hamLuong'),
        dvt: g('dvt'),
        duongDung: g('duongDung'),
        sl: g('sl'),
        cachDung: g('cachDung'),
        doiTuong: g('doiTuong'),
        trangThai: g('trangThai'),
      });
    }

    const dvkt = [];
    const tblDV = byId('tblDichVu');
    const dvHeads = headerCols(tblDV);
    const dvCol = (n) => dvHeads.findIndex((h) => h && h.startsWith(norm(n)));
    const dc = {
      tg: dvCol('Thời gian chỉ định'),
      info: dvCol('Thông tin chỉ định'),
      noi: dvCol('Nơi thực hiện'),
      sl: dvCol('SL'),
      tltt: dvCol('TLTT'),
      doiTuong: dvCol('Đối tượng'),
      trangThai: dvCol('Trạng thái'),
    };
    for (const { tr, tds, group } of readGroupedRows(tblDV, 'tr[id]')) {
      if (!/^[0-9a-f-]{36}$/i.test(tr.id)) continue;
      const del = tr.querySelector('a[href*="DeleteDichVu"]');
      const infoTd = dc.info >= 0 ? tds[dc.info] : null;
      let name = '';
      let moTa = '';
      if (infoTd) {
        const i = infoTd.querySelector('i');
        moTa = i ? txt(i).replace(/^\(|\)$/g, '').trim() : '';
        const clone = infoTd.cloneNode(true);
        clone.querySelectorAll('i').forEach((x) => x.remove());
        name = txt(clone);
      }
      const g = (k) => (dc[k] >= 0 ? txt(tds[dc[k]]) : '');
      dvkt.push({
        kind: 'dvkt',
        id: tr.id.toLowerCase(),
        canDelete: !!del,
        group,
        name,
        moTa,
        thoiGian: g('tg'),
        noiThucHien: g('noi'),
        sl: g('sl'),
        doiTuong: g('doiTuong'),
        trangThai: g('trangThai'),
      });
    }

    const sel = (id) => {
      const s = byId(id);
      if (!s) return null;
      return { value: s.value, options: [...s.options].map((o) => ({ value: o.value, text: txt(o) })) };
    };

    return {
      ok: true,
      id: String(window._ylenh_ID || '').toLowerCase(),
      noitruid: String(window.noitruid || '').toLowerCase(),
      status,
      info,
      thoiGian: val('txtThoigianThamKham'),
      thoiGianThucHien: val('txtThoigianThucHienThamKham'),
      dienBien: val('txtDienBienYLenhThamKham'),
      dienBienPHCN: val('txtDienBienPHCNThamKham'),
      buttons: buttons(),
      busy: isBusy(),
      tables: { thuoc: !!tblThuoc, dvkt: !!tblDV },
      saoYLenh: sel('cboSaoYLenh'),
      hinhThucSao: sel('cboHinhThucSao'),
      thuoc,
      dvkt,
    };
  }

  function clickButton(id) {
    const b = byId(id);
    if (!b || !isShown(b)) return { ok: false, reason: 'hidden:' + id };
    b.click();
    return { ok: true };
  }

  function setSelect(id, value) {
    const s = byId(id);
    if (!s) return { ok: false, reason: 'no-select:' + id };
    if (![...s.options].some((o) => o.value === String(value))) return { ok: false, reason: 'no-option:' + value };
    s.value = String(value);
    s.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) {
      try {
        window.jQuery(s).trigger('change');
      } catch (e) {}
    }
    return { ok: true, value: s.value };
  }

  function deleteThuoc(id) {
    if (typeof window.DeleteThuocInThamKham !== 'function') return { ok: false, reason: 'no-DeleteThuocInThamKham' };
    if (!byId('td' + id)) return { ok: false, reason: 'row-missing' };
    window.DeleteThuocInThamKham(id);
    return { ok: true };
  }

  function deleteDichVu(id) {
    if (typeof window.DeleteDichVu !== 'function') return { ok: false, reason: 'no-DeleteDichVu' };
    if (!byId(id)) return { ok: false, reason: 'row-missing' };
    window.DeleteDichVu(id);
    return { ok: true };
  }

  // ---------- Hộp thoại SweetAlert ----------
  function swal() {
    const el = document.querySelector('.sweet-alert');
    if (!el) return { visible: false };
    const visible = isShown(el) && !el.classList.contains('hideSweetAlert');
    if (!visible) return { visible: false };
    const confirm = el.querySelector('button.confirm');
    const cancel = el.querySelector('button.cancel');
    return {
      visible: true,
      // SweetAlert v1 ignores button clicks until it adds "visible" (~500 ms after showing).
      ready: el.classList.contains('visible'),
      title: txt(el.querySelector('h2')),
      text: txt(el.querySelector('p')),
      confirmText: txt(confirm),
      cancelText: isShown(cancel) ? txt(cancel) : '',
      type: ['warning', 'error', 'success', 'info'].find((t) => el.querySelector('.sa-icon.sa-' + t) && isShown(el.querySelector('.sa-icon.sa-' + t))) || '',
    };
  }

  // True when no SweetAlert is on screen and its fade-out has finished. Opening a new
  // dialog during the previous one's fade-out leaves the new one hidden.
  function swalIdle() {
    const el = document.querySelector('.sweet-alert');
    const ov = document.querySelector('.sweet-overlay');
    const gone = (x) => !x || getComputedStyle(x).display === 'none';
    return gone(el) && gone(ov) && !isBusy();
  }

  function swalClick(which) {
    const el = document.querySelector('.sweet-alert');
    if (!el) return { ok: false, reason: 'no-swal' };
    const b = el.querySelector(which === 'cancel' ? 'button.cancel' : 'button.confirm');
    if (!b) return { ok: false, reason: 'no-button' };
    if (!el.classList.contains('visible')) return { ok: false, reason: 'not-ready' };
    b.click();
    return { ok: true };
  }

  function toasts(since) {
    return toastLog.filter((t) => t.at >= (since || 0));
  }

  function back() {
    if (typeof window.backForm === 'function') window.backForm();
    return { ok: true };
  }

  window.__SYL = {
    version: 4,
    where,
    readPatients,
    listLink,
    listPages,
    gotoListPage,
    searchPatients,
    showOrderList,
    readOrderList,
    openOrder,
    readOrder,
    clickButton,
    setSelect,
    deleteThuoc,
    deleteDichVu,
    swal,
    swalIdle,
    swalClick,
    toasts,
    back,
    now: () => Date.now(),
  };
})();
