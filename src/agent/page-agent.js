// Injected into the OneMES page (webContents.executeJavaScript). Reads the page and
// calls OneMES's own functions; it never calls the server directly.
// Every function returns plain data so it survives structured clone.
(function () {
  if (window.__SYL && window.__SYL.version === 7) return;

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
  // bacSi: {id, text}, capDo: {id, text} }; fields left out stay as they are.
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
    if (f.bacSi && f.bacSi.id && !setPicked('cboBacSiThamKham', f.bacSi.id, f.bacSi.text)) bad.push('Bác sĩ');
    if (f.capDo && f.capDo.id && !setPicked('cboCapDoChamSocThamKham', f.capDo.id, f.capDo.text)) bad.push('Cấp độ chăm sóc');
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
    version: 7,
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
    swal,
    swalIdle,
    swalClick,
    toasts,
    back,
    now: () => Date.now(),
  };
})();
