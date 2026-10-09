// A small stand-in for OneMES used by tests. It reproduces the markup, element ids
// and page functions the tool relies on (taken from saved OneMES pages), with an
// in-memory state. Start: node mock/server.js [port]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUB = path.join(__dirname, 'public');
const uid = () => crypto.randomUUID();

const fmt = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const parseTime = (t) => {
  const m = /(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t || '');
  return m ? new Date(+m[5], +m[4] - 1, +m[3], +m[1], +m[2]) : null;
};

// Search-service data for the Bác sĩ and Cấp độ chăm sóc pickers (Elasticsearch shape).
const DOCTORS = [
  ['d1', 'BS. Nguyễn Văn Mẫu', 'bsmau'],
  ['d2', 'BS. Trần Thị Hai', 'bshai'],
  ['d3', 'BS. Lê Văn Ba', 'bsba'],
  ['d4', 'BS. Phạm Thị Bốn', 'bsbon'],
].map(([id, fullName, loginName]) => ({ _id: id, _source: { fullName, loginName, active: 1, bacSi: true, certificateCode: 'CC' + id } }));
const CARE = [
  ['c1', 'I', 'Cấp I'],
  ['c2', 'II', 'Cấp II'],
  ['c3', 'III-C', 'III-C'],
].map(([id, ma, ten]) => ({ _id: id, _source: { ma, ten, hieuLuc: 1 } }));

function sampleItems() {
  return {
    thuoc: [
      { group: 'Thuốc Tây Y', loaiKe: 'Dự trù', kho: 'Kho Cao đơn - Tân dược', name: 'Renaxib 200', hamLuong: '200mg', dvt: 'Viên', duongDung: 'Uống', sl: '1', cachDung: 'Uống 1 viên/lần * 1 lần/ngày (sáng) sau ăn', doiTuong: 'Bảo hiểm' },
      { group: 'Thuốc Tây Y', loaiKe: 'Dự trù', kho: 'Kho Chế phẩm sản xuất tại khoa Dược', name: 'HOẠT HUYẾT KHỨ Ứ ẨM', hamLuong: '6000mg+6000mg+6', dvt: 'Túi', duongDung: 'Uống', sl: '2', cachDung: 'Uống 1 túi/lần * 2 lần/ngày (sáng - chiều) sau ăn', doiTuong: 'Bảo hiểm' },
      { group: 'Thuốc Tây Y', loaiKe: 'Dự trù', kho: 'Kho Cao đơn - Tân dược', name: 'Lirystad 150', hamLuong: '150mg', dvt: 'Viên', duongDung: 'Uống', sl: '1', cachDung: 'Uống 1 viên/lần * 1 lần/ngày (tối) sau ăn', doiTuong: 'Bảo hiểm' },
      { group: 'Vật tư y tế', loaiKe: 'Dự trù', kho: 'Kho Hóa chất - VTYT', name: 'Kim châm cứu tiệt trùng dùng một lần', hamLuong: '', dvt: 'Cái', duongDung: '', sl: '20', cachDung: '', doiTuong: 'Hao phí' },
      { group: 'Vật tư y tế', loaiKe: 'Dự trù', kho: 'Kho Hóa chất - VTYT', name: 'Nhang ngải cứu', hamLuong: '', dvt: 'Cái', duongDung: '', sl: '1', cachDung: '', doiTuong: 'Hao phí' },
    ],
    dvkt: [
      { top: 'Thủ thuật', group: 'Y học dân tộc - Phục hồi chức năng', name: 'Giác hơi điều trị các chứng đau', moTa: 'Vùng thắt lưng bằng phương pháp giác chân không. Ngày 01 lần x 15 phút' },
      { top: 'Thủ thuật', group: 'Y học dân tộc - Phục hồi chức năng', name: 'Điện châm [kim ngắn]', moTa: 'Châm tả: A thị huyệt, Giáp tích L4-L5. Ngày 01 lần x 30 phút' },
      { top: 'Thủ thuật', group: 'Phục hồi chức năng', name: 'Kỹ thuật xoa bóp vùng', moTa: 'Vùng thắt lưng và mông chân 2 bên. Ngày 01 lần x 15 phút' },
      { top: 'Thủ thuật', group: 'Phục hồi chức năng', name: 'Điều trị bằng các dòng điện xung', moTa: 'Vùng mông đùi T, ngày 01 lần x 20 phút.' },
      { top: 'Thủ thuật', group: 'Phục hồi chức năng', name: 'Điều trị bằng siêu âm', moTa: 'Vùng cơ cạnh sống thắt lưng 2 bên. Ngày 01 lần x 15 phút.' },
    ],
  };
}

function freshState() {
  const base = new Date(2026, 9, 12, 7, 4);
  const mkOrder = (d, opts = {}) => {
    const it = sampleItems();
    return {
      id: uid(),
      date: d,
      dateTH: new Date(d.getTime() + 60000),
      bacSi: { id: 'd1', name: 'BS. Nguyễn Văn Mẫu' },
      capDo: { id: 'c3', text: '(III-C) III-C' },
      dienBien: opts.dienBien ?? 'Bệnh nhân tỉnh, tiếp xúc tốt\nĐau vùng thắt lưng lan xuống mông chân 2 bên.',
      dienBienPHCN: opts.dienBienPHCN ?? 'Cột sống thắt lưng giảm đường cong sinh lý',
      khac: opts.khac || '',
      status: opts.status || 'Hoàn tất',
      thuoc: (opts.noItems ? [] : it.thuoc).map((x) => ({ ...x, id: uid(), trangThai: 'Mới' })),
      dvkt: (opts.noItems ? [] : it.dvkt).map((x) => ({ ...x, id: uid(), noiThucHien: 'P. Thủ thuật K.Nội B', sl: '1', doiTuong: 'Bảo hiểm', trangThai: 'Mới' })),
    };
  };
  const patients = [
    { buong: 'Buồng 103', bg: 'Buồng 103 / G3-NB', maBN: '2400000001', hoTen: 'NGUYỄN THỊ MẪU A', tuoi: '75', gt: 'Nữ', chanDoan: 'Tọa cốt phong [Đau dây thần kinh hông to]' },
    { buong: 'Buồng 105', bg: 'Buồng 105 / G9-NB', maBN: '2600000002', hoTen: 'TRẦN VĂN MẪU B', tuoi: '62', gt: 'Nam', chanDoan: 'Chứng tý [Hội chứng cổ vai cánh tay]' },
    { buong: 'Buồng 105', bg: 'Buồng 105 / G8-NB', maBN: '2600000003', hoTen: 'LÊ THỊ MẪU C', tuoi: '70', gt: 'Nữ', chanDoan: 'Khẩu nhãn oa tà', noPHCN: true },
  ].map((p, i) => {
    const noitruid = uid();
    const benhAnId = uid();
    const orders = [
      mkOrder(addDays(base, -3), { dienBienPHCN: p.noPHCN ? '' : undefined }),
      mkOrder(addDays(base, -2), { dienBienPHCN: p.noPHCN ? '' : undefined }),
      mkOrder(addDays(base, -1), { dienBienPHCN: '', khac: 'Chỉ định CLS', noItems: true }),
      mkOrder(base, { dienBienPHCN: p.noPHCN ? '' : undefined }),
    ];
    return { ...p, noitruid, benhAnId, benhAn: {}, tgVao: fmt(addDays(base, -10 - i)), orders };
  });
  return { patients, log: [] };
}

let state = freshState();

const findOrder = (id) => {
  for (const p of state.patients) {
    const o = p.orders.find((x) => x.id === id);
    if (o) return { p, o };
  }
  return null;
};

function copyOrder(o, days, loai, status = 'Mới') {
  const withThuoc = loai === undefined || ['0', '1', '3', '4', '5'].includes(String(loai));
  const withDv = loai === undefined || ['1', '2', '5'].includes(String(loai));
  return {
    ...o,
    id: uid(),
    date: addDays(o.date, days),
    dateTH: addDays(o.dateTH, days),
    status,
    thuoc: withThuoc ? o.thuoc.map((x) => ({ ...x, id: uid(), trangThai: 'Mới' })) : [],
    dvkt: withDv ? o.dvkt.map((x) => ({ ...x, id: uid(), trangThai: 'Mới' })) : [],
  };
}

// ---------- API (called with synchronous XHR from the page, like AjaxPro) ----------
const api = {
  saoChep({ id }) {
    const f = findOrder(id);
    if (!f) return { Error: true, InfoMessage: 'Không tìm thấy y lệnh' };
    const n = copyOrder(f.o, 1);
    f.p.orders.push(n);
    state.log.push(['saoChep', id, n.id]);
    return { Error: false, RetExtraParam1: n.id };
  },
  hoanTat({ id }) {
    const f = findOrder(id);
    if (!f) return { Error: true, InfoMessage: 'Không tìm thấy y lệnh' };
    if (!f.o.dienBien && !f.o.dienBienPHCN) return { Error: true, InfoMessage: 'Vui lòng nhập ít nhất 1 diễn biến YHCT hoặc PHCN' };
    f.o.status = 'Hoàn tất';
    state.log.push(['hoanTat', id]);
    return { Error: false };
  },
  saoYLenh({ id, soLan, loai }) {
    const f = findOrder(id);
    if (!f) return { Error: true, InfoMessage: 'Không tìm thấy y lệnh' };
    const ids = [];
    for (let i = 1; i <= Number(soLan); i++) {
      const n = copyOrder(f.o, i, loai, 'Hoàn tất'); // OneMES completes these copies itself
      f.p.orders.push(n);
      ids.push(n.id);
    }
    state.log.push(['saoYLenh', id, ids]);
    return { Error: false, RetObject: ids };
  },
  thuHoi({ id }) {
    const f = findOrder(id);
    if (!f) return { Error: true, InfoMessage: 'Không tìm thấy y lệnh' };
    f.o.status = 'Mới';
    state.log.push(['thuHoi', id]);
    return { Error: false };
  },
  xoaYLenh({ id }) {
    const f = findOrder(id);
    if (!f) return { Error: true, InfoMessage: 'Không tìm thấy y lệnh' };
    if (f.o.status !== 'Mới') return { Error: true, InfoMessage: 'Y lệnh đã hoàn tất, không thể xóa' };
    f.p.orders = f.p.orders.filter((x) => x !== f.o);
    state.log.push(['xoaYLenh', id]);
    return { Error: false };
  },
  xoaThuoc({ id }) {
    for (const p of state.patients)
      for (const o of p.orders) {
        const i = o.thuoc.findIndex((x) => x.id === id);
        if (i >= 0) {
          if (o.status !== 'Mới') return { Error: true, InfoMessage: 'Y lệnh đã hoàn tất, không thể xóa' };
          o.thuoc.splice(i, 1);
          state.log.push(['xoaThuoc', o.id, id]);
          return { Error: false };
        }
      }
    return { Error: true, InfoMessage: 'Không tìm thấy toa thuốc' };
  },
  xoaDichVu({ id }) {
    for (const p of state.patients)
      for (const o of p.orders) {
        const i = o.dvkt.findIndex((x) => x.id === id);
        if (i >= 0) {
          if (o.status !== 'Mới') return { Error: true, InfoMessage: 'Y lệnh đã hoàn tất, không thể xóa dịch vụ' };
          o.dvkt.splice(i, 1);
          state.log.push(['xoaDichVu', o.id, id]);
          return { Error: false };
        }
      }
    return { Error: true, InfoMessage: 'Không tìm thấy dịch vụ' };
  },
  // Lưu on the order form (ServerSideUpdateYLenh).
  luu({ id, thoiGian, thoiGianThucHien, dienBien, dienBienPHCN, bacSi, capDo }) {
    const f = findOrder(id);
    if (!f) return { Error: true, InfoMessage: 'Không tìm thấy y lệnh' };
    if (f.o.status !== 'Mới') return { Error: false }; // OneMES ignores Lưu on a completed order
    const cd = parseTime(thoiGian);
    const th = parseTime(thoiGianThucHien);
    if (!cd || !th) return { Error: true, InfoMessage: 'Thời gian không đúng định dạng' };
    if (cd > th) return { Error: true, InfoMessage: 'Thời gian thực hiện y lệnh không được nhỏ hơn thời gian chỉ định!' };
    if (!bacSi || !bacSi.id) return { Error: true, InfoMessage: 'Chưa chọn bác sỹ' };
    Object.assign(f.o, { date: cd, dateTH: th, dienBien, dienBienPHCN, bacSi, capDo: capDo && capDo.id ? capDo : null });
    state.log.push(['luu', id]);
    return { Error: false };
  },
  benhAn({ id }) {
    const p = state.patients.find((x) => x.benhAnId === id);
    if (!p) return { Error: true, InfoMessage: 'Không tìm thấy bệnh án' };
    return { Error: false, RetObject: p.benhAn };
  },
  saveBenhAn({ id, part, values }) {
    const p = state.patients.find((x) => x.benhAnId === id);
    if (!p) return { Error: true, InfoMessage: 'Không tìm thấy bệnh án' };
    Object.assign(p.benhAn, values);
    state.log.push(['saveBenhAn', id, part, Object.keys(values).length]);
    return { Error: false };
  },
  order({ id }) {
    const f = findOrder(id);
    if (!f) return { Error: true, InfoMessage: 'Không tìm thấy y lệnh' };
    return { Error: false, RetObject: orderView(f.p, f.o) };
  },
  orders({ noitruid }) {
    const p = state.patients.find((x) => x.noitruid === noitruid);
    if (!p) return { Error: true, InfoMessage: 'Không tìm thấy bệnh nhân' };
    return { Error: false, RetObject: [...p.orders].sort((a, b) => b.date - a.date).map((o) => orderView(p, o)) };
  },
  patients() {
    return { Error: false, RetObject: state.patients.map(({ orders, ...p }) => p) };
  },
};

function orderView(p, o) {
  const sorted = [...p.orders].sort((a, b) => a.date - b.date);
  return {
    id: o.id,
    noitruid: p.noitruid,
    tg: fmt(o.date),
    tgth: fmt(o.dateTH),
    ngayDieuTri: sorted.indexOf(o) + 1,
    bacSi: o.bacSi ? o.bacSi.name : '',
    bacSiObj: o.bacSi,
    capDo: o.capDo,
    dienBien: o.dienBien,
    dienBienPHCN: o.dienBienPHCN,
    khac: o.khac,
    status: o.status,
    thuoc: o.thuoc,
    dvkt: o.dvkt,
  };
}

// ---------- HTTP ----------
const LOGIN_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>ONEMES.KB</title></head><body>
<form method="post" action="/login.aspx" style="margin:80px auto;width:280px;font-family:sans-serif">
<h3>QUẢN LÝ KHÁM CHỮA BỆNH</h3>
<label>Tên tài khoản<br><input name="u" id="txtUser"></label><br><br>
<label>Mật khẩu<br><input name="p" id="txtPass" type="password"></label><br><br>
<button id="btnLogin" type="submit">Đăng nhập</button></form></body></html>`;

function page(wpid, query, host) {
  const head = `<!doctype html><html><head><meta charset="utf-8"><title>b4.58 ONEMES.KCB</title>
<link rel="stylesheet" href="/vendor/sweetalert.css"><link rel="stylesheet" href="/vendor/toastr.min.css">
<link rel="stylesheet" href="/onemes-mock.css">
<script src="/vendor/jquery.min.js"></script><script src="/vendor/sweetalert.min.js"></script><script src="/vendor/toastr.min.js"></script>
</head><body>`;
  if (wpid === 'danhsachdieutrinoitrudraw') {
    return `${head}<div id="divHeader"><a href="/home.aspx?scope=sys&wpid=danhsachdieutrinoitrudraw">Ds Điều trị nội trú</a></div>
<div id="divFilter"><select id="drpSelectKhoaPhong"><option value="k1">Khoa Nội B</option></select>
<input id="txtTimKiem" placeholder="Tìm kiếm"><button id="btnTimKiem" onclick="FilterChange()">Tìm kiếm</button></div>
<div id="divWebPartContent"><div id="divListForm"><div id="divToaThuocDanhSachContent"></div></div></div>
<script>var MOCK_PAGE='list';</script><script src="/onemes-mock.js"></script></body></html>`;
  }
  if (wpid === 'bacsidraw') {
    const nt = query.get('noitruid') || '';
    return `${head}<div id="divHeader" class="mock-head">HỒ SƠ ĐIỀU TRỊ: KHOA NỘI B
 <a id="showDsYLenh" onclick="onshowDsYLenh(this);" href="javascript:void(0)">Lịch sử y lệnh</a>
 <a href="/home.aspx?scope=sys&wpid=danhsachdieutrinoitrudraw">Về danh sách</a>
 <span class="mock-menu">Tổng kết: <a onclick="onShowTtBenhAn('${(state.patients.find((x) => x.noitruid === nt) || {}).benhAnId || ''}', 'divNoiTruContent');">Lập bìa bệnh án</a></span></div>
<div id="divWebpart" style="margin-top: 10px;"><div id="divNoiTruContent"><p>Thông tin bệnh nhân</p></div></div>
<div id="divWebpartPopup" style="display:none; margin-top: 10px">
  <div><span id="divStatusPopup" style="padding-right:5px;"></span> <span id="txtYLenhInfo"></span></div>
  <div id="divWorkflowStatusPopup">
    <button id="btnSaveThamKhamDraw" class="btn" type="submit" onclick="OnSaveFormPopupThamKhamDraw(); OnLoadActionFormPopup();">Lưu</button>
    <button id="btnSaoChep" class="btn" style="display:none" onclick="javascript:onSaoChep();">Sao chép</button>
    <button id="btnPopupHOANTAT" class="btn" style="display:none" onclick="javascript:OnActionPopup('','','p','l','HOANTAT','YLENH','w');">Hoàn tất</button>
    <button id="btnPopupTHUHOI" class="btn" style="display:none" onclick="javascript:OnActionPopup('','','p','l','THUHOI','YLENH','w');">Thu hồi</button>
    <button id="btnPopupXOA" class="btn" style="display:none" onclick="javascript:OnActionPopup('','','p','l','XOA','YLENH','w');">Xóa</button>
    <button class="btn" onclick="backForm()">Quay lại</button>
  </div>
  <div class="row"><label>Thời gian chỉ định <input id="txtThoigianThamKham" class="datetimepicker" onblur="CheckSuaThoiGianYLenh(_ylenh_ID);"></label>
  <label>Thời gian thực hiện <input id="txtThoigianThucHienThamKham" class="datetimepicker" onblur="CheckSuaThoiGianThucHienYLenh(_ylenh_ID);"></label></div>
  <div class="row"><label>Bác sĩ <select id="cboBacSiThamKham" class="form-control"></select></label>
  <label>Cấp độ chăm sóc <select id="cboCapDoChamSocThamKham" class="form-control"></select></label></div>
  <label>Diễn biến bệnh<textarea id="txtDienBienYLenhThamKham"></textarea></label>
  <label>Diễn biến PHCN<textarea id="txtDienBienPHCNThamKham"></textarea></label>
  <label>Sao y lệnh (ngày) <select id="cboSaoYLenh" class="form-control"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
  <label>Hình thức sao y lệnh <select id="cboHinhThucSao"><option value="" selected>Chọn hình thức sao</option><option value="1">Sao thuốc dự trù và dịch vụ</option><option value="0">Sao thuốc dự trù</option><option value="2">Sao dịch vụ</option><option value="3">Sao đông y</option><option value="4">Sao tây y</option><option value="5">Sao tây y và dịch vụ</option></select></label>
  <div id="divIboxThuoc"><h4>Cho thuốc/ VTYT</h4><div class="row divThuocVTYT _divThuocVTYTTK"></div></div>
  <div id="divIboxDichVu"><h4>Chỉ định DVKT</h4><div id="divDichVu" class="row"></div></div>
</div>
<script>var MOCK_PAGE='bacsi'; var noitruid='${nt}'; var _ylenh_ID=''; var ObjectWebpartPopup_Id='';
function readyOpenFormThamKhamDraw(id) {
  CallInitSelect2ES('cboCapDoChamSocThamKham', 'http://${host}/es/chedochamsoc/_search', '')
  CallInitSelect2ESOW('cboBacSiThamKham', 'http://${host}/es/owneruser/_search', '',3)
}
function CallInitSelect2ES() {}
function CallInitSelect2ESOW() {}
</script>
<script src="/onemes-mock.js"></script></body></html>`;
  }
  return `${head}<div id="divHeader">Trang chủ OneMES (mô phỏng)
<a href="/home.aspx?scope=sys&wpid=danhsachdieutrinoitrudraw">Điều trị nội trú · Ds Điều trị nội trú</a></div></body></html>`;
}

function send(res, code, body, type = 'text/html; charset=utf-8', headers = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function readBody(req) {
  return new Promise((r) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => r(b));
  });
}

const DELAY = Number(process.env.MOCK_DELAY || 60);

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const authed = /(?:^|;\s*)ASP\.NET_SessionId=mock/.test(req.headers.cookie || '');
  if (u.pathname === '/login.aspx') {
    if (req.method === 'POST') {
      return send(res, 302, '', 'text/plain', { 'Set-Cookie': 'ASP.NET_SessionId=mock; Path=/', Location: '/home.aspx?scope=sys&lang=vi' });
    }
    return send(res, 200, LOGIN_PAGE);
  }
  if (u.pathname === '/' ) return send(res, 302, '', 'text/plain', { Location: authed ? '/home.aspx?scope=sys' : '/login.aspx' });
  // Start pages without a Ds Điều trị nội trú link, to test how the tool still gets there.
  if (u.pathname === '/start-usid.aspx' && authed) {
    return send(res, 200, `<!doctype html><html><head><meta charset="utf-8"><title>Trang chủ</title></head><body>
<p>Trang chủ</p><a href="/home.aspx?scope=sys&lang=vi&wpid=dashboarddvkt&usid=10.0.0.1_start">Dashboard</a></body></html>`);
  }
  if (u.pathname === '/start-menu.aspx' && authed) {
    return send(res, 200, `<!doctype html><html><head><meta charset="utf-8"><title>Trang chủ</title></head><body>
<ul class="menu"><li><a href="javascript:void(0)" onclick="location.href='/home.aspx?scope=sys&lang=vi&wpid=danhsachdieutrinoitrudraw'">Ds Điều trị nội trú</a></li></ul></body></html>`);
  }
  if (u.pathname === '/home.aspx') {
    if (!authed) return send(res, 302, '', 'text/plain', { Location: '/login.aspx' });
    return send(res, 200, page(u.searchParams.get('wpid'), u.searchParams, req.headers.host));
  }
  if (u.pathname.startsWith('/es/') && req.method === 'POST') {
    const q = JSON.parse((await readBody(req)) || '{}');
    const all = u.pathname.includes('owneruser') ? DOCTORS : u.pathname.includes('chedochamsoc') ? CARE : [];
    const from = q.from || 0;
    const hits = all.slice(from, from + (q.size || 25));
    return send(res, 200, JSON.stringify({ hits: { total: { value: all.length }, hits } }), 'application/json');
  }
  if (u.pathname === '/benh-an-schema.json') {
    return send(res, 200, fs.readFileSync(path.join(__dirname, '..', 'src', 'benh-an-schema.json')), 'application/json');
  }
  if (u.pathname.startsWith('/api/')) {
    const name = u.pathname.slice(5);
    if (name === '__reset') {
      state = freshState();
      return send(res, 200, '{}', 'application/json');
    }
    if (name === '__state') return send(res, 200, JSON.stringify(state), 'application/json');
    const fn = api[name];
    if (!fn) return send(res, 404, '{}', 'application/json');
    const body = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : Object.fromEntries(u.searchParams);
    await new Promise((r) => setTimeout(r, DELAY));
    return send(res, 200, JSON.stringify(fn(body)), 'application/json');
  }
  const file = path.join(PUB, path.normalize(u.pathname).replace(/^([/\\])+/, ''));
  if (file.startsWith(PUB) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    const ext = path.extname(file);
    const type = { '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'application/octet-stream';
    return send(res, 200, fs.readFileSync(file), type);
  }
  send(res, 404, 'not found', 'text/plain');
});

if (require.main === module) {
  const port = Number(process.argv[2] || 2026);
  server.listen(port, '127.0.0.1', () => console.log('mock OneMES on http://127.0.0.1:' + port));
}

module.exports = { server, getState: () => state, reset: () => (state = freshState()) };
