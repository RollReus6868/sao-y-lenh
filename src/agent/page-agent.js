// Injected into the OneMES page (webContents.executeJavaScript). Reads the page and
// calls OneMES's own functions; it never calls the server directly.
// Every function returns plain data so it survives structured clone.
(function () {
  if (window.__SYL && window.__SYL.version === 14) return;

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
  // Text drawn in red (OneMES marks some Cho thuốc/VTYT rows of a new copy that way).
  const isRedText = (el) => {
    if (!el) return false;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).color || '');
    if (!m) return false;
    const [r, g, b] = [+m[1], +m[2], +m[3]];
    return r >= 170 && g <= 120 && b <= 120 && r - Math.max(g, b) >= 80;
  };
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
    const pw = [...document.querySelectorAll('input[type=password]')].some(isShown);
    const login = pw && (/login|dangnhap/i.test(url) || !/usid=/i.test(url));
    const list = /wpid=danhsachdieutrinoitrudraw/i.test(url) || !!listTable();
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

  // ---------- đăng nhập (0.6.0) ----------
  // The login page: a visible password box, the account box before it and the button
  // that sends them. Nothing here reads a password back.
  function loginParts() {
    const pw = [...document.querySelectorAll('input[type=password]')].find(isShown);
    if (!pw) return null;
    const scope = pw.form || document;
    const before = (x) => !!(x.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING);
    const texts = [...scope.querySelectorAll('input')].filter((x) => /^(text|email|tel|)$/i.test(x.getAttribute('type') || '') && isShown(x) && !x.readOnly && !x.disabled);
    const user = texts.filter(before).pop() || texts[0] || null;
    const btns = [...scope.querySelectorAll('button, input[type=submit], input[type=button], input[type=image], a')].filter(isShown);
    const label = (b) => norm(b.value || b.textContent || b.getAttribute('title') || b.getAttribute('alt') || '');
    const btn =
      btns.find((b) => /đăng nhập|dang nhap|login|log in|sign in/.test(label(b))) ||
      btns.find((b) => b.tagName === 'BUTTON' ? (b.getAttribute('type') || 'submit') === 'submit' : b.type === 'submit') ||
      null;
    return { pw, user, btn, form: pw.form || null };
  }
  function loginMessage() {
    const sel = '.validation-summary-errors, .field-validation-error, .alert, .error, .text-danger, [id*="lblError" i], [id*="lblMsg" i], [id*="lblThongBao" i], [class*="error" i]';
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const t = txt(el);
      if (t && isShown(el) && !out.includes(t)) out.push(t);
    }
    const sw = document.querySelector('.sweet-alert.visible, .swal2-popup');
    if (sw && isShown(sw)) out.push(txt(sw.querySelector('p, .swal2-html-container') || sw));
    return out.join(' · ').slice(0, 200);
  }
  function loginForm() {
    const p = loginParts();
    return { ok: !!p, user: !!(p && p.user), button: !!(p && p.btn), message: loginMessage() };
  }
  function doLogin(user, pass) {
    const p = loginParts();
    if (!p || !p.user) return { ok: false, error: 'Không thấy ô tài khoản / mật khẩu' };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [el, v] of [[p.user, user], [p.pw, pass]]) {
      el.focus();
      setter.call(el, v);
      ['input', 'change', 'keyup', 'blur'].forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));
    }
    if (p.btn) {
      p.btn.click();
      return { ok: true, how: 'button' };
    }
    if (p.form) {
      if (p.form.requestSubmit) p.form.requestSubmit();
      else p.form.submit();
      return { ok: true, how: 'form' };
    }
    p.pw.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    return { ok: true, how: 'enter' };
  }

  function isBusy() {
    const ov = document.querySelector('.loadingoverlay');
    return !!(ov && isShown(ov));
  }

  // ---------- Danh sách điều trị nội trú ----------
  // The start page's dashboard widget also has a table called tblNoiTru (Mã BN, Tên
  // bệnh nhân, Giường...); only the real list has the T/G vào and Họ tên columns.
  function listTable() {
    const tbl = byId('tblNoiTru');
    if (!tbl) return null;
    const heads = [...tbl.querySelectorAll('tr th')].map((th) => norm(th.textContent));
    return heads.includes(norm('Họ tên')) && heads.includes(norm('T/G vào')) ? tbl : null;
  }

  function readPatients() {
    const tbl = listTable();
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

  // Link to Ds Điều trị nội trú from the menu (carries the session's usid). Pages
  // without that menu (e.g. the start page after login) may still carry usid in their
  // address or in other links, so the link is rebuilt from it with the last known role.
  function listLink(role) {
    const a = [...document.querySelectorAll('a[href*="wpid=danhsachdieutrinoitrudraw"]')].find(
      (x) => !/bacsidraw/i.test(x.href) && /^https?:/i.test(x.href)
    );
    if (a) return a.href.replace(/#.*$/, '');
    const u = new URL(location.href);
    let usid = u.searchParams.get('usid') || '';
    let r = role || '';
    const html = document.documentElement.innerHTML;
    if (!usid) usid = (/[?&;]usid=([\w.\-]+)/.exec(html) || [])[1] || '';
    if (!usid) {
      try {
        usid = (/(?:^|[;\s])usid=([\w.\-]+)/i.exec(document.cookie) || [])[1] || '';
      } catch (e) {}
    }
    if (!usid) return '';
    if (!r) r = (/[?&;]role=(\d+)/.exec(html) || [])[1] || '';
    const q = new URLSearchParams({ scope: 'sys', lang: u.searchParams.get('lang') || 'vi', wpid: 'danhsachdieutrinoitrudraw' });
    if (r) q.set('role', r);
    q.set('usid', usid);
    return `${u.origin}/home.aspx?${q}`;
  }

  // Last resort: a menu entry named like the list, clicked as a person would.
  function clickListMenu() {
    const want = [norm('Ds Điều trị nội trú'), norm('Danh sách điều trị nội trú'), norm('Điều trị nội trú')];
    const els = [...document.querySelectorAll('a, li, span, div')].filter((x) => x.children.length <= 2 && want.includes(norm(x.textContent)));
    const el = els.find((x) => x.tagName === 'A') || els[0];
    if (!el) return { ok: false };
    (el.closest('a') || el).click();
    return { ok: true, text: txt(el) };
  }

  // What the start page looks like, for the log when the list cannot be reached.
  function pageInfo() {
    const u = new URL(location.href);
    return {
      path: u.pathname,
      params: [...u.searchParams.keys()].join(','),
      title: document.title,
      usidInPage: /usid=/i.test(document.documentElement.innerHTML),
      menuLinks: document.querySelectorAll('a[href*="wpid="]').length,
    };
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
  // all = show every order (Số lượng hiển thị "Tất cả"), needed to reach the first days.
  function showOrderList(all) {
    hookToastr();
    if (typeof window.backForm === 'function' && isShown(byId('divWebpartPopup'))) window.backForm();
    if (typeof window.onshowDsYLenh !== 'function') return { ok: false, reason: 'no-onshowDsYLenh' };
    const sl = byId('soLuongHienThi');
    if (sl && all) {
      const opts = [...sl.options].map((o) => o.value);
      const max = opts.map((v) => parseInt(v, 10)).filter((n) => n > 0).sort((a, b) => b - a)[0];
      if (max && parseInt(sl.value, 10) !== max) sl.value = String(max);
    } else if (sl && sl.value && parseInt(sl.value, 10) < 25) {
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
      dv: col('DV'),
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
        // DV column painted yellow (#fdf500): the day has services still to deal with.
        dv: isYellow(g('dv')),
      });
    }
    return { ok: true, noitruid: String(window.noitruid || ''), rows };
  }

  const rgb = (c) => (/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c || '') || []).slice(1).map(Number);
  function isYellow(td) {
    if (!td) return false;
    const [r, g, b, a] = rgb(getComputedStyle(td).backgroundColor);
    return a !== 0 && r > 200 && g > 200 && b < 120;
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
    // The Kê đơn popup has its own #tblThuoc; the order's table is the one in .divThuocVTYT.
    const tblThuoc = document.querySelector('.divThuocVTYT #tblThuoc') || byId('tblThuoc');
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
        // The whole row in red, not a red note inside a cell (0.6.0).
        red: tc.ten >= 0 && isRedText(tds[tc.ten]) && (tc.kho < 0 || isRedText(tds[tc.kho])),
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
      yLenhKhac: val('txtYLenhKhacThamKham'),
      bacSi: picked('cboBacSiThamKham'),
      capDo: picked('cboCapDoChamSocThamKham'),
      buttons: buttons(),
      busy: isBusy(),
      tables: { thuoc: !!tblThuoc, dvkt: !!tblDV },
      saoYLenh: sel('cboSaoYLenh'),
      hinhThucSao: sel('cboHinhThucSao'),
      thuoc,
      dvkt,
    };
  }

  // The chosen entry of a (select2) dropdown: { id, text }.
  function picked(id) {
    const s = byId(id);
    if (!s || !s.value) return null;
    const o = s.options[s.selectedIndex];
    return { id: s.value, text: o ? txt(o) : '' };
  }

  // A select2 fed by a search service only holds the chosen option, so a new choice
  // is added as an option first, the way OneMES itself does when it opens an order.
  function setPicked(id, value, text) {
    const s = byId(id);
    if (!s) return false;
    let o = [...s.options].find((x) => x.value === value);
    if (!o) {
      o = new Option(text || value, value, false, false);
      s.appendChild(o);
    }
    if (window.jQuery) window.jQuery(s).val(value).trigger('change');
    else {
      s.value = value;
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return s.value === value;
  }

  // Sets a field the way typing would: value, change, then the field's own blur check
  // (OneMES validates the two times on blur and puts the old value back if wrong).
  function setText(id, value, blur) {
    const el = byId(id);
    if (!el) return false;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (blur) el.dispatchEvent(new Event('blur'));
    return el.value === value;
  }

  const timeVal = (s) => {
    const m = /(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || '');
    return m ? new Date(+m[5], +m[4] - 1, +m[3], +m[1], +m[2]).getTime() : NaN;
  };

  // Fills the order form. f = { thoiGian, thoiGianThucHien, dienBien, dienBienPHCN,
  // bacSi: {id, text}, capDo: {id, text}, clearCapDo }; fields left out stay as they are.
  function setOrderFields(f) {
    const w = where();
    if (!w.popupOpen) return { ok: false, reason: 'popup-closed' };
    const bad = [];
    const CD = 'txtThoigianThamKham';
    const TH = 'txtThoigianThucHienThamKham';
    const setT = (id, v, name) => v !== undefined && v !== null && !setText(id, String(v), true) && bad.push(name);
    // Chỉ định may never be after thực hiện, so the order of the two depends on the move.
    const cdNow = timeVal(byId(CD) && byId(CD).value);
    if (f.thoiGianThucHien && !(timeVal(f.thoiGianThucHien) >= cdNow)) {
      setT(CD, f.thoiGian, 'Thời gian chỉ định');
      setT(TH, f.thoiGianThucHien, 'Thời gian thực hiện');
    } else {
      setT(TH, f.thoiGianThucHien, 'Thời gian thực hiện');
      setT(CD, f.thoiGian, 'Thời gian chỉ định');
    }
    if (f.thoiGian && byId(CD)) byId(CD).setAttribute('data-value', f.thoiGian);
    const t = (id, v, name) => v !== undefined && v !== null && !setText(id, String(v), false) && bad.push(name);
    t('txtDienBienYLenhThamKham', f.dienBien, 'Diễn biến bệnh');
    t('txtDienBienPHCNThamKham', f.dienBienPHCN, 'Diễn biến PHCN');
    t('txtYLenhKhacThamKham', f.yLenhKhac, 'Y lệnh khác');
    if (f.bacSi && f.bacSi.id && !setPicked('cboBacSiThamKham', f.bacSi.id, f.bacSi.text)) bad.push('Bác sĩ');
    if (f.capDo && f.capDo.id && !setPicked('cboCapDoChamSocThamKham', f.capDo.id, f.capDo.text)) bad.push('Cấp độ chăm sóc');
    // Kết quả CLS orders leave Cấp độ chăm sóc empty (0.6.3, user request).
    if (f.clearCapDo) {
      const s = byId('cboCapDoChamSocThamKham');
      if (s && s.value) {
        if (window.jQuery) window.jQuery(s).val(null).trigger('change');
        else {
          s.value = '';
          s.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (s.value) bad.push('Cấp độ chăm sóc (để trống)');
      }
    }
    return bad.length ? { ok: false, reason: 'Không điền được: ' + bad.join(', ') } : { ok: true };
  }

  // ---------- danh sách bác sĩ, cấp độ chăm sóc ----------
  // The addresses come from the page's own scripts (CallInitSelect2ES...), so a
  // change on the hospital side is picked up; `base` is the fallback.
  function esUrls(base) {
    const src = [...document.scripts].map((x) => x.textContent).join('\n');
    const find = (index) => {
      const m = new RegExp(`['"](https?://[^'"]+/${index}/_search)['"]`).exec(src);
      return m ? m[1] : base ? `${base.replace(/\/+$/, '')}/${index}/_search` : '';
    };
    return { bacSi: find('owneruser'), capDo: find('chedochamsoc') };
  }

  async function esLists(base) {
    const u = esUrls(base);
    if (!u.bacSi || !u.capDo) return { ok: false, reason: 'không biết địa chỉ dịch vụ tìm kiếm', urls: u };
    const post = async (url, body) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      const j = await r.json();
      return (j.hits && j.hits.hits) || [];
    };
    try {
      // Same filters as the Bác sĩ field of an order (bsdd = 3) and the Cấp độ chăm sóc field.
      const bs = await post(u.bacSi, {
        query: { bool: { must: [{ match: { active: 1 } }, { match: { bacSi: true } }], must_not: [{ match: { 'certificateCode.keyword': '' } }] } },
        from: 0,
        size: 2000,
      });
      const cd = await post(u.capDo, { query: { bool: { filter: [{ term: { hieuLuc: 1 } }] } }, from: 0, size: 200 });
      return {
        ok: true,
        urls: u,
        bacSi: bs.map((h) => ({ id: String(h._id), name: String((h._source && h._source.fullName) || ''), login: String((h._source && h._source.loginName) || '') })).filter((x) => x.name),
        capDo: cd.map((h) => {
          const ma = String((h._source && h._source.ma) || '');
          const ten = String((h._source && h._source.ten) || '');
          return { id: String(h._id), ma, ten, text: ma ? `(${ma}) ${ten}` : ten };
        }),
      };
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || e), urls: u };
    }
  }

  // ---------- Thông tin bệnh án (Tổng kết > Lập bìa bệnh án) ----------
  function benhAnLink() {
    const a = [...document.querySelectorAll('[onclick*="onShowTtBenhAn"]')][0];
    if (!a) return null;
    const m = /onShowTtBenhAn\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/.exec(a.getAttribute('onclick') || '');
    return m ? { id: m[1], container: m[2] } : null;
  }

  function openBenhAn() {
    hookToastr();
    const l = benhAnLink();
    if (!l) return { ok: false, reason: 'Không thấy mục Lập bìa bệnh án' };
    if (typeof window.onShowTtBenhAn !== 'function') return { ok: false, reason: 'no-onShowTtBenhAn' };
    window.onShowTtBenhAn(l.id, l.container);
    return { ok: true, id: l.id };
  }

  // The id each save button's form passes to SaveTtChung / SaveTtChuyenKhoa.
  function benhAnForms() {
    const out = {};
    for (const [k, fn, btn] of [['chung', 'SaveTtChung', 'btnSaveTtChung'], ['chuyenKhoa', 'SaveTtChuyenKhoa', 'btnSaveTtChuyenKhoa']]) {
      const b = byId(btn);
      const f = b && b.closest('form');
      const m = f && new RegExp(fn + '\\(\\s*["\']([^"\']+)["\']').exec(decodeURIComponent(f.getAttribute('action') || ''));
      out[k] = m ? m[1] : '';
    }
    return out;
  }

  function benhAnState() {
    const f = benhAnForms();
    return { ready: !!(byId('txtLyDoVaoVien') && f.chung && f.chuyenKhoa), forms: f, busy: isBusy() };
  }

  const radios = (name) => [...document.querySelectorAll('input[type=radio]')].filter((r) => r.name === name);

  // fields = [{ id, kind }]; returns { values: {id: value}, missing: [id] }.
  function readBenhAn(fields) {
    const values = {};
    const missing = [];
    for (const f of fields) {
      if (f.kind === 'radio') {
        const rs = radios(f.id);
        if (!rs.length) missing.push(f.id);
        const c = rs.find((r) => r.checked);
        values[f.id] = c ? c.value : '';
        continue;
      }
      const el = byId(f.id);
      if (!el) {
        missing.push(f.id);
        continue;
      }
      if (f.kind === 'check') values[f.id] = !!el.checked;
      else if (f.kind === 'multi') values[f.id] = [...el.options].filter((o) => o.selected).map((o) => o.value);
      else values[f.id] = el.value || '';
    }
    return { ok: true, values, missing };
  }

  function writeBenhAn(fields, values) {
    const $ = window.jQuery;
    const missing = [];
    for (const f of fields) {
      if (!(f.id in values)) continue;
      const v = values[f.id];
      if (f.kind === 'radio') {
        const rs = radios(f.id);
        if (!rs.length) {
          missing.push(f.id);
          continue;
        }
        // Some OneMES choices carry stray spaces ("Cấp I "); match them loosely.
        const want = norm(v);
        let hit = false;
        for (const r of rs) {
          r.checked = !!want && (r.value === v || norm(r.value) === want);
          hit = hit || r.checked;
        }
        if (want && !hit) missing.push(f.id);
        const c = rs.find((r) => r.checked) || rs[0];
        c.dispatchEvent(new Event('change', { bubbles: true }));
        continue;
      }
      const el = byId(f.id);
      if (!el) {
        missing.push(f.id);
        continue;
      }
      if (f.kind === 'check') {
        el.checked = !!v;
      } else if (f.kind === 'multi') {
        const want = (Array.isArray(v) ? v : []).map(String);
        for (const o of el.options) o.selected = want.includes(o.value);
      } else {
        el.value = v === undefined || v === null ? '' : String(v);
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if ($) {
        try {
          if (f.kind === 'multi' && el.classList.contains('chosen-select')) $(el).trigger('chosen:updated');
          if (el.classList.contains('selectpicker') && $.fn.selectpicker) $(el).selectpicker('refresh');
        } catch (e) {}
      }
    }
    return { ok: true, missing };
  }

  function saveBenhAn(part) {
    hookToastr();
    const f = benhAnForms();
    const fn = part === 1 ? 'SaveTtChung' : 'SaveTtChuyenKhoa';
    const id = part === 1 ? f.chung : f.chuyenKhoa;
    if (!id) return { ok: false, reason: 'no-form:' + fn };
    if (typeof window[fn] !== 'function') return { ok: false, reason: 'no-' + fn };
    window[fn](id);
    return { ok: true };
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


  // ---------- Kê Tây y/VTYT (popup Kê đơn thuốc) ----------
  // Opened with OneMES's showKeDon(). Never use the popup's X or "Bỏ qua": they call
  // onClosePopup(), which deletes the order's whole prescription (ServerSideDeleteAllToaThuoc).
  const keDonModal = () => byId('modalKeDon');
  const keDonOpen = () => isShown(keDonModal()) && !!byId('cboThuoc');

  function openKeDon() {
    hookToastr();
    if (keDonOpen()) return { ok: true, already: true };
    if (typeof window.showKeDon !== 'function') return { ok: false, reason: 'no-showKeDon' };
    window.showKeDon();
    return { ok: true };
  }

  function keDonButton(label) {
    const m = keDonModal();
    if (!m) return null;
    return [...m.querySelectorAll('button, a.btn, input[type=button], input[type=submit]')].find((b) => isShown(b) && norm(b.value || txt(b)) === norm(label)) || null;
  }

  function s2Text(id) {
    const el = byId(id);
    if (!el) return '';
    const c = el.nextElementSibling && el.nextElementSibling.classList.contains('select2') ? el.nextElementSibling.querySelector('.select2-selection__rendered') : null;
    const o = el.options && el.options[el.selectedIndex];
    return txt(c) || (o ? txt(o) : '');
  }

  function keDonState() {
    hookToastr();
    const open = keDonOpen();
    if (!open) return { open: false, busy: isBusy() };
    const box = document.querySelector('.divThuocVTYTPopupTK');
    const rows = box ? [...box.querySelectorAll('tbody tr')].map((tr) => txt(tr)).filter(Boolean) : [];
    const loai = [...document.querySelectorAll('input[name=cboLoai]')].find((r) => r.checked);
    const loaiLabel = loai ? txt(loai.closest('label')) || txt(loai.parentElement && loai.parentElement.parentElement) : '';
    const s2 = document.querySelector('.select2-container--open');
    return {
      open: true,
      busy: isBusy(),
      ready: !!(byId('cboKho') && byId('cboThuoc') && byId('txtSl') && byId('txtCachDungThuoc')),
      disabled: !!(byId('cboThuoc') && byId('cboThuoc').disabled),
      kho: { value: byId('cboKho') ? byId('cboKho').value : '', text: s2Text('cboKho') },
      thuoc: { value: byId('cboThuoc') ? byId('cboThuoc').value : '', text: s2Text('cboThuoc') },
      loai: loaiLabel,
      haoPhi: !!(byId('cbTrongGoiKD') && byId('cbTrongGoiKD').checked),
      sl: byId('txtSl') ? byId('txtSl').value : '',
      cachDung: byId('txtCachDungThuoc') ? byId('txtCachDungThuoc').value : '',
      rows,
      dropdown: !!s2,
      loading: !!document.querySelector('.select2-container--open .loading-results'),
    };
  }

  // KÊ LĨNH / TỦ TRỰC. Changing it reloads the Kho list, so it goes before the Kho.
  function keDonSetLoai(label) {
    const want = norm(label);
    const rs = [...document.querySelectorAll('input[name=cboLoai]')];
    const lab = (r) => norm(txt(r.closest('label')) || txt(r.parentElement && r.parentElement.parentElement) || r.value);
    const r = rs.find((x) => lab(x).includes(want));
    if (!r) return { ok: false, reason: 'no-loai:' + label, options: rs.map(lab) };
    if (r.checked) return { ok: true, changed: false };
    const $ = window.jQuery;
    if ($ && $.fn.iCheck && $(r).parent('.iradio_square-green').length) $(r).iCheck('check');
    else r.checked = true;
    if ($) $(r).trigger('change');
    else r.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, changed: true };
  }

  // Types into a select2 box's search field like a person does; the results arrive
  // from OneMES's search service a moment later (s2Results).
  function s2Search(id, term) {
    const $ = window.jQuery;
    const el = byId(id);
    if (!$ || !el || !$.fn.select2) return { ok: false, reason: 'no-select2:' + id };
    if (el.disabled) return { ok: false, reason: 'disabled:' + id };
    try {
      $(el).select2('open');
    } catch (e) {
      return { ok: false, reason: 'select2-open:' + e.message };
    }
    const f = document.querySelector('.select2-container--open .select2-search__field');
    if (!f) return { ok: false, reason: 'no-search-field' };
    $(f).val(term).trigger('input');
    return { ok: true };
  }

  function s2Options() {
    const $ = window.jQuery;
    return [...document.querySelectorAll('.select2-container--open .select2-results__option[aria-selected]')].map((li) => {
      const d = ($ && $(li).data('data')) || {};
      return { li, id: String(d.id == null ? '' : d.id), name: String(d.Name || d.text || txt(li)), code: String(d.Code || ''), text: txt(li) };
    });
  }

  function s2Results() {
    const loading = !!document.querySelector('.select2-container--open .loading-results');
    return { open: !!document.querySelector('.select2-container--open'), loading, items: s2Options().map(({ li, ...x }) => x) };
  }

  // Picks the result whose name matches: exact name first, then a name that contains it,
  // then any row text (code, name) that contains it. Several equal matches -> refuse.
  function s2Pick(match) {
    const want = norm(match);
    const all = s2Options();
    let hits = all.filter((o) => norm(o.name) === want);
    if (!hits.length) hits = all.filter((o) => norm(o.name).includes(want));
    if (!hits.length) hits = all.filter((o) => norm(o.text).includes(want));
    if (!hits.length) return { ok: false, reason: 'not-found', seen: all.slice(0, 8).map((o) => o.name) };
    if (hits.length > 1 && new Set(hits.map((h) => norm(h.name))).size > 1) return { ok: false, reason: 'ambiguous', seen: hits.slice(0, 8).map((o) => o.name) };
    const $ = window.jQuery;
    $(hits[0].li).trigger('mouseup');
    return { ok: true, id: hits[0].id, name: hits[0].name, code: hits[0].code };
  }

  function s2Close() {
    const $ = window.jQuery;
    const open = document.querySelector('.select2-container--open');
    if (!open || !$) return { ok: true };
    for (const id of ['cboThuoc', 'cboKho']) {
      try {
        if (byId(id)) $(byId(id)).select2('close');
      } catch (e) {}
    }
    return { ok: true };
  }

  // Số lượng, cách dùng; Hao phí unticked. The rest of the row is left as OneMES fills it.
  function keDonFill(v) {
    const $ = window.jQuery;
    const set = (id, val) => {
      const el = byId(id);
      if (!el) return false;
      el.value = val;
      if ($) $(el).trigger('input').trigger('keyup').trigger('change');
      else el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const hp = byId('cbTrongGoiKD');
    if (hp && hp.checked && !v.haoPhi) {
      if ($ && $.fn.iCheck) $(hp).iCheck('uncheck');
      else hp.checked = false;
    }
    if (!set('txtSl', String(v.sl))) return { ok: false, reason: 'no-txtSl' };
    if (v.cachDung && !set('txtCachDungThuoc', v.cachDung)) return { ok: false, reason: 'no-txtCachDungThuoc' };
    return { ok: true };
  }

  function keDonClick(label) {
    hookToastr();
    if (!['thêm', 'chấp nhận'].includes(norm(label))) return { ok: false, reason: 'refused:' + label };
    const b = keDonButton(label);
    if (!b) return { ok: false, reason: 'no-button:' + label };
    if (b.disabled) return { ok: false, reason: 'disabled:' + label };
    b.click();
    return { ok: true };
  }

  // Other bootstrap modals OneMES may raise over the popup (e.g. tỷ lệ thanh toán).
  function extraModal() {
    const m = [...document.querySelectorAll('.modal')].find((x) => x.id !== 'modalKeDon' && isShown(x) && /\bin\b|show/.test(x.className));
    return m ? { id: m.id, text: txt(m).slice(0, 200) } : null;
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

  // ---------- Sửa DVKT (popup) ----------
  // showSuaDVKT() lists the order's services with their own links: ThuHoiDichVu (status
  // Chờ thực hiện -> Mới), DeleteDichVu, ChuyenTHYeuCauDV.
  function suaDVModal() {
    return byId('divFormModalSuaDV');
  }
  function dvSuaOpen() {
    hookToastr();
    if (typeof window.showSuaDVKT !== 'function') return { ok: false, reason: 'no-showSuaDVKT' };
    window.showSuaDVKT();
    return { ok: true };
  }
  function dvSuaState() {
    const m = suaDVModal();
    const open = !!m && (isShown(m) || m.classList.contains('in'));
    const rows = [];
    if (open) {
      const seen = new Set();
      for (const a of m.querySelectorAll('a[href*="DichVu"], a[onclick*="DichVu"], a[href*="YeuCauDV"], a[onclick*="YeuCauDV"]')) {
        const code = (a.getAttribute('href') || '') + ' ' + (a.getAttribute('onclick') || '');
        const mm = /(ThuHoiDichVu|DeleteDichVu|ChuyenTHYeuCauDV|EditDichVu)\('([0-9a-f-]{36})'/i.exec(code);
        if (!mm) continue;
        const id = mm[2].toLowerCase();
        let r = rows.find((x) => x.id === id);
        if (!r) {
          const tr = a.closest('tr');
          r = { id, thuHoi: false, del: false, chuyen: false, text: txt(tr) };
          rows.push(r);
          seen.add(id);
        }
        if (/ThuHoiDichVu/i.test(mm[1])) r.thuHoi = true;
        if (/DeleteDichVu/i.test(mm[1])) r.del = true;
        if (/ChuyenTHYeuCauDV/i.test(mm[1])) r.chuyen = true;
      }
    }
    return { open, rows };
  }
  function dvThuHoi(id) {
    const st = dvSuaState();
    if (!st.open) return { ok: false, reason: 'Bảng Sửa DVKT chưa mở' };
    const r = st.rows.find((x) => x.id === norm(id));
    if (!r || !r.thuHoi) return { ok: false, reason: 'Không thấy nút Thu hồi của dịch vụ này trong Sửa DVKT' };
    if (typeof window.ThuHoiDichVu !== 'function') return { ok: false, reason: 'no-ThuHoiDichVu' };
    window.ThuHoiDichVu(id);
    return { ok: true };
  }
  function dvSuaClose() {
    const m = suaDVModal();
    if (!m) return { ok: true };
    if (window.jQuery && window.jQuery.fn && window.jQuery.fn.modal) window.jQuery(m).modal('hide');
    else m.style.display = 'none';
    return { ok: true };
  }

  // ---------- Xem kết quả (Lịch sử KCB: XN, CĐHA) ----------
  function kqModal() {
    return byId('divFormModalChung');
  }
  function kqOpen() {
    hookToastr();
    if (typeof window.onShowLichSuChung !== 'function') return { ok: false, reason: 'no-onShowLichSuChung' };
    const a = [...document.querySelectorAll('a[onclick*="onShowLichSuChung"]')].find((x) => /xem kết quả/i.test(txt(x))) || null;
    for (const id of ['divLichSuXNContent', 'divDrawCt', 'divLichSuCDHAContent', 'divLichSuCDHAContentChiTiet']) {
      const el = byId(id);
      if (el) el.innerHTML = '';
    }
    window.onShowLichSuChung(a);
    return { ok: true };
  }
  // Clicks the Lịch sử XN / Lịch sử CĐHA tabs, in case their lists load on demand.
  function kqTabs() {
    const m = kqModal();
    if (!m) return { ok: false };
    let n = 0;
    for (const a of m.querySelectorAll('a, li, button')) {
      if (a.children.length > 1) continue;
      if (/^lịch sử (xn|cđha|cdha)$/i.test(txt(a))) {
        a.click();
        n++;
      }
    }
    return { ok: true, n };
  }
  const TIME_RE = /(\d{1,2}:\d{2})\s+(\d{1,2}\/\d{1,2}\/\d{4})/;
  // A row's text plus what its boxes hold (OneMES shows some dates inside an input).
  const rowText = (tr) => [txt(tr), ...[...tr.querySelectorAll('input, textarea')].map((i) => i.value || '')].join(' ');
  const openAttr = (el) => ['onclick', 'href', 'ondblclick'].map((a) => el.getAttribute(a) || '').join(' ');
  // The rows of one history list, each with the element that opens it. OneMES puts
  // fn(...) on the row or on a link inside it; when the call cannot be found, any row
  // that carries a date is taken and clicked.
  function kqItems(root, fnRe) {
    const out = [];
    if (!root) return out;
    const add = (tr, el) => {
      if (tr && !out.some((x) => x.tr === tr)) out.push({ tr, el });
    };
    for (const el of root.querySelectorAll('[onclick], [ondblclick], a[href]')) if (fnRe.test(openAttr(el))) add(el.closest('tr') || el, el);
    // Otherwise the row opens from the date box in its TG chỉ định column (what the user
    // clicks), so every row with a date is taken and its date box is clicked.
    if (!out.length) {
      for (const tr of root.querySelectorAll('tr')) {
        if (tr.querySelector('th')) continue;
        const tds = [...tr.children].filter((x) => x.tagName === 'TD');
        if (tds.length >= 3 && TIME_RE.test(rowText(tr))) add(tr, dateBox(tr) || tds[1] || tds[0]);
      }
    }
    return out;
  }
  // The innermost element of a row that shows its date (a button, an input, a label).
  function dateBox(tr) {
    const shows = (e) => TIME_RE.test(e.tagName === 'INPUT' ? e.value || '' : txt(e));
    const all = [...tr.querySelectorAll('*')].filter((e) => e.tagName !== 'TD' && shows(e));
    const inner = all.filter((e) => !all.some((x) => x !== e && e.contains(x)));
    return inner.find((e) => e.getAttribute('onclick') || /^(BUTTON|INPUT|A)$/.test(e.tagName)) || inner[0] || null;
  }
  // Clicks like a person: pointer down/up, then click, so handlers bound to any of them run.
  function kqClick(el) {
    if (!el.getAttribute('onclick') && el.getAttribute('ondblclick')) {
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return;
    }
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    for (const t of ['mousedown', 'mouseup']) el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    el.click();
  }
  const XN_RE = /fnLoadChiTiet\s*\(/;
  const CDHA_RE = /fnLoadChiTietKetQuaCDHA\s*\(/;
  // The rows of one history table: its date, name and status.
  function kqRows(root, fnRe, nameHeads) {
    return kqItems(root, fnRe).map(({ tr }, i) => {
      const tbl = tr.closest('table');
      const heads = headerCols(tbl);
      const tds = [...tr.children].filter((x) => x.tagName === 'TD');
      let name = '';
      for (const h of nameHeads) {
        const k = heads.indexOf(norm(h));
        if (k >= 0 && tds[k]) {
          name = txt(tds[k]);
          break;
        }
      }
      const st = heads.indexOf(norm('Trạng thái'));
      const m = TIME_RE.exec(rowText(tr));
      return { idx: i, date: m ? `${m[1]} ${m[2]}` : '', name, status: st >= 0 && tds[st] ? txt(tds[st]) : '' };
    });
  }
  // What a list holds when no row could be read: its headers, row count and the
  // functions its links call (no patient data), for the log.
  function kqShape(root) {
    if (!root) return 'không có khung';
    const tables = [...root.querySelectorAll('table')];
    const fns = [...new Set([...root.querySelectorAll('[onclick], [ondblclick], a[href]')].map((e) => (/([A-Za-z_$][\w$]*)\s*\(/.exec(openAttr(e)) || [])[1]).filter(Boolean))];
    return `${tables.length} bảng [${tables.map((t) => headerCols(t).filter(Boolean).join('|')).join('; ')}], ${root.querySelectorAll('tr').length} dòng, hàm: ${fns.join(', ') || 'không'}, chữ: ${txt(root).length}`;
  }
  function kqList() {
    const m = kqModal();
    const xn = byId('divLichSuXNContent');
    const cd = byId('divLichSuCDHAContent');
    const out = {
      ok: !!(xn && cd),
      open: !!m && (isShown(m) || m.classList.contains('in')),
      xn: kqRows(xn, XN_RE, ['Loại xét nghiệm', 'Tên dịch vụ', 'Loại dịch vụ']),
      cdha: kqRows(cd, CDHA_RE, ['Tên dịch vụ', 'Loại dịch vụ']),
      busy: isBusy(),
    };
    if (!out.xn.length) out.xnShape = kqShape(xn);
    if (!out.cdha.length) out.cdhaShape = kqShape(cd);
    return out;
  }
  // Opens row idx of the XN or CĐHA history and empties the result area first, so the
  // driver can tell the new result from the previous one.
  function kqOpenRow(kind, idx) {
    const root = byId(kind === 'cdha' ? 'divLichSuCDHAContent' : 'divLichSuXNContent');
    if (!root) return { ok: false, reason: 'Chưa mở Xem kết quả' };
    const t = kqItems(root, kind === 'cdha' ? CDHA_RE : XN_RE)[idx];
    if (!t) return { ok: false, reason: 'Không thấy dòng ' + (idx + 1) };
    const target = kind === 'cdha' ? byId('divLichSuCDHAContentChiTiet') : byId('divDrawCt');
    if (target) target.innerHTML = '';
    // A result drawn somewhere else must not be mistaken for the new one.
    const m = kqModal();
    if (m) for (const x of m.querySelectorAll('table, textarea, .note-editable')) x.setAttribute('data-syl-old', '1');
    kqClick(t.el);
    return { ok: true };
  }
  const isRed = (c) => {
    const [r, g, b] = rgb(c);
    return r > 150 && g < 100 && b < 100;
  };
  const isBlue = (c) => {
    const [r, g, b] = rgb(c);
    return b > 150 && r < 100 && g < 160;
  };
  // Red or blue text in a result cell marks a value outside the reference range.
  function flagOf(td) {
    const els = [td, ...td.querySelectorAll('*')].filter((e) => txt(e));
    for (const e of els) {
      const c = getComputedStyle(e).color;
      if (isRed(c)) return 'red';
      if (isBlue(c)) return 'blue';
    }
    return null;
  }
  const isResultTable = (t) => {
    const h = headerCols(t);
    return h.includes(norm('Chỉ số')) && h.some((x) => x && x.startsWith(norm('Kết quả')));
  };
  function kqDetailXN() {
    const m = kqModal();
    const roots = [byId('divDrawCt'), m].filter(Boolean);
    if (!roots.length) return { ok: false, reason: 'no-detail' };
    let tbl = null;
    let root = roots[0];
    for (const r of roots) {
      tbl = [...r.querySelectorAll('table')].find((t) => !t.hasAttribute('data-syl-old') && isResultTable(t));
      if (tbl) {
        root = r;
        break;
      }
    }
    if (!tbl) return { ok: true, ready: false, items: [] };
    const h = headerCols(tbl);
    const c = { name: h.indexOf(norm('Chỉ số')), value: h.findIndex((x) => x && x.startsWith(norm('Kết quả'))), ref: h.findIndex((x) => x && x.startsWith(norm('Khoảng tham chiếu'))), unit: h.indexOf(norm('Đơn vị')) };
    // Some grids keep the header in a table of its own above the body.
    let trs = [...tbl.querySelectorAll('tr')].filter((tr) => !tr.querySelector('th'));
    if (!trs.length) {
      let n = tbl.parentElement;
      for (let i = 0; i < 4 && n && !trs.length; i++, n = n.parentElement) {
        const next = [...n.querySelectorAll('table')].find((t) => t !== tbl && !t.contains(tbl) && !tbl.contains(t) && !t.hasAttribute('data-syl-old') && (tbl.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING));
        if (next) trs = [...next.querySelectorAll('tr')].filter((tr) => !tr.querySelector('th'));
      }
    }
    const items = [];
    let group = '';
    for (const tr of trs) {
      const tds = [...tr.children].filter((x) => x.tagName === 'TD');
      if (tds.length <= 2 || c.value >= tds.length) {
        const t = txt(tr);
        if (t) group = t;
        continue;
      }
      const name = txt(tds[c.name]);
      if (!name) continue;
      items.push({ group, name, value: txt(tds[c.value]), ref: c.ref >= 0 ? txt(tds[c.ref]) : '', unit: c.unit >= 0 ? txt(tds[c.unit]) : '', flag: flagOf(tds[c.value]) });
    }
    const field = (label) => {
      const l = [...root.querySelectorAll('label, span, div, td')].find((e) => e.children.length === 0 && norm(txt(e)) === norm(label));
      const inp = l && (l.parentElement.querySelector('input, textarea') || (l.nextElementSibling && l.nextElementSibling.querySelector && l.nextElementSibling.querySelector('input, textarea')));
      return inp ? inp.value || '' : '';
    };
    return { ok: true, ready: items.length > 0, loai: field('Loại dịch vụ'), items, busy: isBusy() };
  }
  function kqDetailCDHA() {
    const root = byId('divLichSuCDHAContentChiTiet');
    if (!root) return { ok: false, reason: 'no-detail' };
    const label = [...root.querySelectorAll('label, span, div, td, b, strong, th, p')].find((e) => e.children.length === 0 && /^kết luận\s*:?$/i.test(txt(e)));
    let ketLuan = '';
    let found = false;
    // A box whose id names it (kq_txtKetLuan and the like) wins over the label.
    const byName = [...root.querySelectorAll('textarea, input[type=text], .note-editable, [id]')].find((e) => /ket_?luan/i.test(e.id || '') && /^(TEXTAREA|INPUT|DIV)$/.test(e.tagName));
    const ed = !byName ? null : /^(TEXTAREA|INPUT)$/.test(byName.tagName) ? byName : byName.querySelector('.note-editable, textarea, input[type=text]') || (byName.children.length === 0 ? byName : null);
    if (ed) {
      ketLuan = ed.tagName === 'TEXTAREA' || ed.tagName === 'INPUT' ? ed.value : ed.innerText || txt(ed);
      found = true;
    }
    if (label) {
      let n = label;
      for (let i = 0; i < 4 && n && !found; i++) {
        const box = n.parentElement && n.parentElement.querySelector('textarea, .note-editable, input[type=text]');
        if (box) {
          ketLuan = box.tagName === 'TEXTAREA' || box.tagName === 'INPUT' ? box.value : box.innerText || txt(box);
          found = true;
        }
        n = n.parentElement;
      }
    }
    const tbl = [...root.querySelectorAll('table')].find((t) => headerCols(t).includes(norm('Tên dịch vụ')));
    const dv = tbl ? [...tbl.querySelectorAll('tr')].filter((tr) => !tr.querySelector('th')).map((tr) => txt([...tr.children].pop())).filter(Boolean) : [];
    if (/<[a-z][\s\S]*>/i.test(ketLuan || '')) {
      const d = document.createElement('div');
      d.innerHTML = String(ketLuan).replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n');
      ketLuan = d.textContent;
    }
    return { ok: true, ready: found, ketLuan: (ketLuan || '').trim(), dichVu: dv, busy: isBusy() };
  }
  function kqClose() {
    const m = kqModal();
    if (m && window.jQuery && window.jQuery.fn && window.jQuery.fn.modal) window.jQuery(m).modal('hide');
    return { ok: true };
  }

  // ---------- Thêm y lệnh mới ----------
  function newOrder() {
    hookToastr();
    if (typeof window.backForm === 'function' && isShown(byId('divWebpartPopup'))) window.backForm();
    if (typeof window.onshowThamKham !== 'function') return { ok: false, reason: 'no-onshowThamKham' };
    window.onshowThamKham(byId('showThamKham'));
    return { ok: true };
  }

  window.__SYL = {
    version: 14,
    loginForm,
    doLogin,
    where,
    readPatients,
    listLink,
    clickListMenu,
    pageInfo,
    listPages,
    gotoListPage,
    searchPatients,
    showOrderList,
    readOrderList,
    openOrder,
    readOrder,
    clickButton,
    setSelect,
    setOrderFields,
    esLists,
    openBenhAn,
    benhAnState,
    readBenhAn,
    writeBenhAn,
    saveBenhAn,
    deleteThuoc,
    deleteDichVu,
    dvSuaOpen,
    dvSuaState,
    dvThuHoi,
    dvSuaClose,
    kqOpen,
    kqList,
    kqTabs,
    kqOpenRow,
    kqDetailXN,
    kqDetailCDHA,
    kqClose,
    newOrder,
    openKeDon,
    keDonState,
    keDonSetLoai,
    s2Search,
    s2Results,
    s2Pick,
    s2Close,
    keDonFill,
    keDonClick,
    extraModal,
    swal,
    swalIdle,
    swalClick,
    toasts,
    back,
    now: () => Date.now(),
  };
})();
