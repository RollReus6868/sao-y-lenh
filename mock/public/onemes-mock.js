// Page-side half of the OneMES mock. Function names, element ids and markup copy the
// real pages so the tool's page agent sees the same thing it sees on OneMES.
/* global swal, toastr, MOCK_PAGE */
(function () {
  function call(name, body) {
    var x = new XMLHttpRequest();
    x.open('POST', '/api/' + name, false); // synchronous, like AjaxPro .value
    x.setRequestHeader('Content-Type', 'application/json');
    x.send(JSON.stringify(body || {}));
    return { value: JSON.parse(x.responseText) };
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  window.callGallAlert = function (d) { swal('Cảnh báo', d, 'warning'); };
  window.callSweetAlert = function (d) { swal('Thông báo', d, 'success'); };

  // ----- Danh sách điều trị nội trú -----
  window.FilterChange = function () {
    var r = call('patients').value;
    var rows = r.RetObject;
    var h = '<div class="ibox float-e-margins"><div class="ibox-content"><div class="table-responsive">' +
      '<table class="table table-striped table-bordered sticky" id="tblNoiTru"><tr>' +
      ['T/G vào', 'ĐD', 'KQ', 'B-G', 'Mã BN', 'Họ tên', 'Tuổi', 'GT', 'Đối tượng', 'Tạm ứng', 'Phải trả', 'Trạng thái', 'Bác sĩ', 'Chẩn đoán', 'Khoa']
        .map(function (t) { return '<th>' + t + '</th>'; }).join('') + '</tr>';
    var lastBuong = '';
    rows.forEach(function (p) {
      if (p.buong !== lastBuong) {
        h += '<tr> <td colspan="11" style="font-weight:bolder;">' + esc(p.buong) + '</td> </tr>';
        lastBuong = p.buong;
      }
      var url = location.origin + '/home.aspx?scope=sys&lang=vi&wpid=bacsidraw&noitruid=' + p.noitruid + '&kp=k1&tt=1&wpre=danhsachdieutrinoitrudraw';
      var a = function (t) { return '<a href="' + url + '" target="">' + t + '</a>'; };
      h += '<tr>' +
        '<td>' + a(esc(p.tgVao)) + '</td>' +
        '<td><a href="' + url.replace('bacsidraw', 'dieuduongdraw') + '" class="btn btn-xs"><i class="far fa-eye"></i></a></td>' +
        '<td><a onclick="onShowLichSuChung(\'' + p.noitruid + '\');" class="btn btn-xs btn-primary">Xem KQ</a></td>' +
        '<td>' + a(esc(p.bg)) + '</td>' +
        '<td>' + a(esc(p.maBN)) + '</td>' +
        '<td><div class="btn-group"><button type="button" style="display: none" class="btn btn-danger dropdown-toggle"></button><ul class="dropdown-menu" role="menu"><li><span class="btn btn-xs">Buồng giường</span></li></ul></div>' +
        ' <a id="btna' + p.noitruid + '" href="' + url + '">' + esc(p.hoTen) + '</a></td>' +
        '<td>' + a(esc(p.tuoi)) + '</td><td>' + a(esc(p.gt)) + '</td>' +
        '<td>' + a('Bảo hiểm<br>(Đúng tuyến)') + '</td><td>' + a('0') + '</td><td>' + a('<b>0</b>') + '</td>' +
        '<td>' + a('<span class="badge">Đang thực hiện</span>') + '</td>' +
        '<td>' + a('BS. Nguyễn Văn Mẫu') + '</td>' +
        '<td title="' + esc(p.chanDoan) + '">' + a(esc(p.chanDoan)) + '</td><td>' + a('Khoa Nội B') + '</td></tr>';
    });
    h += '</table></div></div></div>';
    document.getElementById('divToaThuocDanhSachContent').innerHTML = h;
  };
  window.onShowLichSuChung = function () {};

  if (MOCK_PAGE === 'list') { window.FilterChange(); return; }
  if (MOCK_PAGE !== 'bacsi') return;

  // ----- Lịch sử y lệnh -----
  function drawList() {
    var r = call('orders', { noitruid: window.noitruid }).value;
    var cols = ['TT', 'Xem', 'TG Y lệnh', 'TGTH Y lệnh', 'Bác sĩ', 'Diễn biến bệnh', 'Diễn biến PHCN', 'Y lệnh theo dõi', 'Y lệnh khác', 'CĐ CS', 'CĐ DD', 'T/VT', 'DV'];
    var h = '<div id="divDsYLenh"><div class="ibox-content"><div class="table-responsive tl0_list"><table class="table table-striped table-bordered table-hover"><tr>' +
      cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr>';
    r.RetObject.forEach(function (o, i) {
      var cl = 'onclick="onDrawWebpartYLenh(\'' + o.id + '\')"';
      var short = function (s) { return s ? esc(s.slice(0, 20)) + '...' : ''; };
      h += '<tr id="tr' + o.id + '"><td>' + (i + 1) + '</td><td><a onclick="OnLoadChiTietLSYLenh(\'' + o.id + '\')">👁</a></td>' +
        '<td><a ' + cl + '>' + o.tg + '</a></td><td><a ' + cl + '>' + o.tgth + '</a></td><td><a ' + cl + '>' + esc(o.bacSi) + '</a></td>' +
        '<td>' + (o.dienBien ? '<a data-content="' + esc(o.dienBien) + '" data-toggle="popover" ' + cl + '>' + short(o.dienBien) + '</a>' : '') + '</td>' +
        '<td>' + (o.dienBienPHCN ? '<a data-content="' + esc(o.dienBienPHCN) + '" data-toggle="popover" ' + cl + '>' + short(o.dienBienPHCN) + '</a>' : '') + '</td>' +
        '<td></td><td>' + esc(o.khac) + '</td><td>III-C</td><td></td><td></td><td></td></tr>';
    });
    h += '</table></div></div></div>';
    document.getElementById('divNoiTruContent').innerHTML = h;
  }
  window.onshowDsYLenh = function () { drawList(); };
  window.loadListYLenh = function () { drawList(); toastr.info('Tải thành công danh sách y lệnh'); };
  window.OnLoadChiTietLSYLenh = function () {};

  // ----- Một y lệnh (popup) -----
  var ylenh = null;
  function show(id, on) { var e = document.getElementById(id); if (e) e.style.display = on ? '' : 'none'; }
  function drawOrder() {
    var r = call('order', { id: window._ylenh_ID }).value;
    if (r.Error) { window.callGallAlert(r.InfoMessage); return; }
    ylenh = r.RetObject;
    var done = ylenh.status === 'Hoàn tất';
    document.getElementById('divStatusPopup').innerHTML = '<i class="badge">' + ylenh.status + '</i>';
    document.getElementById('txtYLenhInfo').innerHTML = 'Y lệnh mới | Ngày điều trị thứ ' + ylenh.ngayDieuTri;
    document.getElementById('txtThoigianThamKham').value = ylenh.tg;
    document.getElementById('txtThoigianThucHienThamKham').value = ylenh.tgth;
    document.getElementById('txtDienBienYLenhThamKham').value = ylenh.dienBien;
    document.getElementById('txtDienBienPHCNThamKham').value = ylenh.dienBienPHCN;
    show('btnSaoChep', done); show('btnPopupTHUHOI', done); show('btnPopupHOANTAT', !done); show('btnPopupXOA', !done);

    // Thuốc / VTYT
    var t = '<div class="table-responsive"><table class="table table-striped table-bordered" id="tblThuoc"><tr>' +
      '<th colspan="2"><a href="javascript:deleteAllToaThuocInThamKham();">x</a></th><th>STT</th><th>Loại kê</th><th>Tên kho</th><th>Tên dược ( ' + ylenh.thuoc.length + ' )</th><th>Hàm lượng</th><th>ĐVT</th><th>Đường dùng</th><th>SL</th><th>Cách dùng</th><th>Đối tượng</th><th>Trạng thái</th></tr><tbody>';
    var groups = {};
    ylenh.thuoc.forEach(function (x) { (groups[x.group] = groups[x.group] || []).push(x); });
    Object.keys(groups).forEach(function (g) {
      t += '<tr><td colspan="13">' + esc(g) + ' (' + groups[g].length + ')</td></tr>';
      groups[g].forEach(function (x, i) {
        var actions = done ? '<td></td><td></td>' :
          '<td><a href="javascript:EditThuocInThamKham(\'' + x.id + '\',\'k\');">✎</a></td><td><a href="javascript:DeleteThuocInThamKham(\'' + x.id + '\');">⊗</a></td>';
        t += '<tr id="td' + x.id + '" data-stt="' + (i + 1) + '" class="isthuocdutru groupthuoc collapse in td' + x.id + '">' + actions +
          '<td class="tdSTT">' + (i + 1) + '</td><td>' + esc(x.loaiKe) + '</td><td>' + esc(x.kho) + '</td><td>' + esc(x.name) + '</td><td>' + esc(x.hamLuong) +
          '</td><td>' + esc(x.dvt) + '</td><td>' + esc(x.duongDung) + '</td><td>' + esc(x.sl) + '</td><td>' + esc(x.cachDung) + '</td><td>' + esc(x.doiTuong) + '</td><td>' + esc(x.trangThai) + '</td></tr>';
      });
    });
    t += '</tbody></table></div>';
    document.querySelector('.divThuocVTYT').innerHTML = t;

    // DVKT
    var d = '<div class="table-responsive"><table class="table table-striped table-bordered tblDichVu" id="tblDichVu"><tr>' +
      '<th><a href="javascript:deleteAllDichVu();">x</a></th><th></th><th>STT</th><th>Thời gian chỉ định</th><th>Thông tin chỉ định (' + ylenh.dvkt.length + ')</th><th>Nơi thực hiện</th><th>SL</th><th>TLTT (%)</th><th>Đối tượng</th><th>Trạng thái</th></tr>';
    var tops = {};
    ylenh.dvkt.forEach(function (x) { tops[x.top] = tops[x.top] || {}; (tops[x.top][x.group] = tops[x.top][x.group] || []).push(x); });
    Object.keys(tops).forEach(function (top) {
      var n = 0; Object.keys(tops[top]).forEach(function (g) { n += tops[top][g].length; });
      d += '<tr><td colspan="10"><a href="javascript:void(0);" class="item-question" data-toggle="collapse" data-target=".grouploaidv1">' + esc(top) + ' (' + n + ')</a></td></tr>';
      Object.keys(tops[top]).forEach(function (g) {
        d += '<tr class="grouploaidv1 collapse in"><td colspan="10"><a style="margin-left: 30px" href="javascript:void(0);" class="item-question">' + esc(g) + ' (' + tops[top][g].length + ')</a></td></tr>';
        tops[top][g].forEach(function (x, i) {
          var actions = done ? '<td></td><td></td>' :
            '<td><a href="javascript:EditDichVu(\'' + x.id + '\');">✎</a> <a href="javascript:DeleteDichVu(\'' + x.id + '\');">⊗</a></td><td><a href="javascript:ChuyenTHYeuCauDV(\'' + x.id + '\', \'0\');">↷</a></td>';
          d += '<tr id="' + x.id + '" class="grouploaidv1 collapse in">' + actions + '<td>' + (i + 1) + '</td><td>' + ylenh.tg + '</td><td>' + esc(x.name) +
            ' <i style="color: red;">(' + esc(x.moTa) + ')</i></td><td>' + esc(x.noiThucHien) + '</td><td>' + esc(x.sl) + '</td><td>100</td><td>' + esc(x.doiTuong) + '</td><td>' + esc(x.trangThai) + '</td></tr>';
        });
      });
    });
    d += '</table></div>';
    document.getElementById('divDichVu').innerHTML = d;
    document.getElementById('cboSaoYLenh').value = '0';
    document.getElementById('cboHinhThucSao').value = '';
  }

  window.onDrawWebpartYLenh = function (id) {
    document.getElementById('divWebpart').style.display = 'none';
    document.getElementById('divHeader').style.display = 'none';
    document.getElementById('divWebpartPopup').style.display = '';
    window._ylenh_ID = id;
    window.ObjectWebpartPopup_Id = id;
    drawOrder();
  };
  window.backForm = function () {
    document.getElementById('divWebpart').style.display = '';
    document.getElementById('divHeader').style.display = '';
    document.getElementById('divWebpartPopup').style.display = 'none';
    drawList();
  };
  window.OnLoadFormPopupThamKhamDraw = function () { drawOrder(); toastr.info('Cập nhập thông tin y lệnh thành công!'); };

  window.onSaoChep = function () {
    swal({ title: 'Thông báo', text: 'Bạn có muốn sao chép Y lệnh này cho ngày hôm sau không?!', type: 'warning', showCancelButton: true,
      confirmButtonColor: '#DD6B55', confirmButtonText: 'Đồng ý', cancelButtonText: 'Hủy bỏ', closeOnConfirm: false },
    function (ok) {
      if (!ok) { swal.close(); return false; }
      var r = call('saoChep', { id: window._ylenh_ID }).value;
      if (r.Error) { window.callGallAlert(r.InfoMessage); return; }
      swal.close();
      window.onDrawWebpartYLenh(r.RetExtraParam1);
    });
  };

  function OnSaoYLenh() {
    var sl = document.getElementById('cboSaoYLenh').value;
    if (sl > 0) {
      var r = call('saoYLenh', { id: window._ylenh_ID, soLan: sl, loai: document.getElementById('cboHinhThucSao').value }).value;
      if (r.Error) window.callGallAlert(r.InfoMessage);
      else { swal.close(); toastr.info('Sao y lệnh thành công'); }
    }
  }
  window.OnActionPopup = function (a, b, c, d, code) {
    setTimeout(function () {
      var sao = document.getElementById('cboSaoYLenh');
      var ht = document.getElementById('cboHinhThucSao');
      if (code === 'HOANTAT') {
        if (sao.value !== '0' && ht.value === '') { window.callGallAlert('Yêu cầu chọn hình thức sao.'); return; }
        if (sao.value > 0) {
          var text = ht.options[ht.selectedIndex].text;
          swal({ title: 'Bạn có chắc?', text: 'Bạn có muốn sao y lệnh ' + sao.value + ' ngày ( ' + text + '). Nếu không có thể lựa chọn lại hình thức sao chép y lệnh (chỉ sao chép thuốc/ chỉ sao dịch vụ/ sao chép đồng thời cả thuốc và dịch vụ)',
            type: 'warning', showCancelButton: true, confirmButtonClass: 'btn-danger', confirmButtonText: 'Có', cancelButtonText: 'Không', closeOnConfirm: false, closeOnCancel: true },
          function (ok) { if (ok) setTimeout(OnSaoYLenh, 50); });
        }
        var r = call('hoanTat', { id: window._ylenh_ID }).value;
        if (r.Error) { window.callGallAlert(r.InfoMessage); return; }
        var keepSao = sao.value, keepHt = ht.value;
        drawOrder();
        sao.value = keepSao; ht.value = keepHt; // the real page keeps the dropdowns until reload
      } else if (code === 'THUHOI') {
        var r2 = call('thuHoi', { id: window._ylenh_ID }).value;
        if (r2.Error) { window.callGallAlert(r2.InfoMessage); return; }
        drawOrder();
      } else if (code === 'XOA') {
        var r3 = call('xoaYLenh', { id: window._ylenh_ID }).value;
        if (r3.Error) { window.callGallAlert(r3.InfoMessage); return; }
        window.backForm();
      }
    }, 300);
  };

  window.DeleteThuocInThamKham = function (Id) {
    swal({ title: 'Bạn có chắc?', text: 'Bạn có muốn xóa toa thuốc chi tiết không?', type: 'warning', showCancelButton: true,
      confirmButtonClass: 'btn-danger', confirmButtonText: 'Có', cancelButtonText: 'Không', closeOnConfirm: false, closeOnCancel: false },
    function (ok) {
      if (ok) {
        var r = call('xoaThuoc', { id: Id }).value;
        if (r.Error) { window.callGallAlert(r.InfoMessage); return; }
        toastr.info('Xóa yêu cầu toa thuốc chi tiết thành công');
        var row = document.getElementById('td' + Id); if (row) row.parentNode.removeChild(row);
      }
      swal.close();
    });
  };
  window.DeleteDichVu = function (yeucauid) {
    var row = document.getElementById(yeucauid); if (row) row.style.backgroundColor = 'red';
    swal({ title: 'Bạn có chắc?', text: 'Bạn có muốn xóa dịch vụ không?', type: 'warning', showCancelButton: true,
      confirmButtonClass: 'btn-danger', confirmButtonText: 'Có', cancelButtonText: 'Không', closeOnConfirm: false, closeOnCancel: false },
    function (ok) {
      if (ok) {
        var r = call('xoaDichVu', { id: yeucauid }).value;
        if (r.Error) { window.callGallAlert(r.InfoMessage); return; }
        toastr.info('Xóa yêu cầu dịch vụ thành công');
        drawOrder();
      } else { swal.close(); }
      swal.close();
    });
  };
})();
