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

  if (MOCK_PAGE === 'list') {
    // Like OneMES: an empty table first, the patients a little later.
    document.getElementById('divToaThuocDanhSachContent').innerHTML = '<table id="tblNoiTru"><tr><th>T/G vào</th><th>Họ tên</th></tr></table>';
    setTimeout(window.FilterChange, 1200);
    return;
  }
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
    document.getElementById('txtThoigianThamKham').setAttribute('data-value', ylenh.tg);
    // Like OneMES: the pickers hold just the chosen entry, appended as an option.
    var bs = document.getElementById('cboBacSiThamKham');
    bs.innerHTML = '';
    if (ylenh.bacSiObj) bs.appendChild(new Option(ylenh.bacSiObj.name, ylenh.bacSiObj.id, true, true));
    var cd = document.getElementById('cboCapDoChamSocThamKham');
    cd.innerHTML = '';
    if (ylenh.capDo) cd.appendChild(new Option(ylenh.capDo.text, ylenh.capDo.id, true, true));
    var ro = done;
    ['txtThoigianThamKham', 'txtThoigianThucHienThamKham', 'txtDienBienYLenhThamKham', 'txtDienBienPHCNThamKham'].forEach(function (k) { document.getElementById(k).readOnly = ro; });
    show('btnSaveThamKhamDraw', !done);
    show('btnSaoChep', done); show('btnPopupTHUHOI', done); show('btnPopupHOANTAT', !done); show('btnPopupXOA', !done);
    // Like OneMES, the drug and service tables arrive a moment later (async callbacks).
    document.querySelector('.divThuocVTYT').innerHTML = '';
    document.getElementById('divDichVu').innerHTML = '';
    var drawnFor = ylenh;
    setTimeout(function () { if (ylenh === drawnFor) drawTables(done); }, 250);
    document.getElementById('cboSaoYLenh').value = '0';
    document.getElementById('cboHinhThucSao').value = '';
  }
  function drawTables(done) {

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

  function parseT(t) {
    var m = /(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t || '');
    return m ? new Date(+m[5], +m[4] - 1, +m[3], +m[1], +m[2]) : null;
  }
  window.CheckSuaThoiGianYLenh = function () {
    var cd = document.getElementById('txtThoigianThamKham');
    var th = document.getElementById('txtThoigianThucHienThamKham');
    if (parseT(cd.value) > parseT(th.value)) {
      window.callGallAlert('Thời gian thực hiện y lệnh không được nhỏ hơn thời gian chỉ định!');
      cd.value = cd.getAttribute('data-value');
    }
  };
  window.CheckSuaThoiGianThucHienYLenh = function () {
    var cd = document.getElementById('txtThoigianThamKham');
    var th = document.getElementById('txtThoigianThucHienThamKham');
    if (parseT(cd.value) > parseT(th.value)) {
      window.callGallAlert('Thời gian thực hiện y lệnh không được nhỏ hơn thời gian chỉ định!');
      th.value = cd.value;
    }
  };
  window.OnSaveFormPopupThamKhamDraw = function () {
    if (!ylenh || ylenh.status === 'Hoàn tất') return;
    var v = function (id) { return document.getElementById(id).value; };
    var opt = function (id) { var s = document.getElementById(id); var o = s.options[s.selectedIndex]; return s.value ? { id: s.value, text: o ? o.text : '' } : null; };
    var bs = opt('cboBacSiThamKham');
    var r = call('luu', {
      id: window._ylenh_ID, thoiGian: v('txtThoigianThamKham'), thoiGianThucHien: v('txtThoigianThucHienThamKham'),
      dienBien: v('txtDienBienYLenhThamKham'), dienBienPHCN: v('txtDienBienPHCNThamKham'),
      bacSi: bs ? { id: bs.id, name: bs.text } : null, capDo: opt('cboCapDoChamSocThamKham'),
    }).value;
    if (r.Error) { window.callSweetAlert(r.InfoMessage); return; }
    toastr.info('Đã lưu!');
  };
  window.OnLoadActionFormPopup = function () { setTimeout(drawOrder, 200); };

  // ----- Thông tin bệnh án (Tổng kết > Lập bìa bệnh án) -----
  var schema = null;
  window.onShowTtBenhAn = function (benhAnId, container) {
    if (!schema) {
      var x = new XMLHttpRequest();
      x.open('GET', '/benh-an-schema.json', false);
      x.send();
      schema = JSON.parse(x.responseText);
    }
    var vals = call('benhAn', { id: benhAnId }).value.RetObject || {};
    var ctl = function (f) {
      var v = vals[f.id];
      if (f.kind === 'textarea') return '<textarea class="form-control" id="' + f.id + '">' + esc(v || '') + '</textarea>';
      if (f.kind === 'check') return '<input type="checkbox" id="' + f.id + '"' + (v ? ' checked' : '') + '>';
      if (f.kind === 'radio') return f.options.map(function (o) {
        return '<label><input type="radio" name="' + f.id + '" value="' + esc(o.value) + '"' + (v === o.value ? ' checked' : '') + '><span>' + esc(o.label) + '</span></label>';
      }).join(' ');
      if (f.kind === 'select' || f.kind === 'multi') {
        var list = Array.isArray(v) ? v : [v];
        return '<select id="' + f.id + '"' + (f.kind === 'multi' ? ' multiple class="chosen-select"' : ' class="selectpicker"') + '>' +
          (f.kind === 'select' ? '<option value=""></option>' : '') +
          f.options.map(function (o) { return '<option value="' + esc(o.value) + '"' + (list.indexOf(o.value) >= 0 ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select>';
      }
      return '<input type="' + (f.kind === 'number' ? 'number' : 'text') + '" class="form-control" id="' + f.id + '" value="' + esc(v == null ? '' : v) + '">';
    };
    var part = function (n) {
      return schema.groups.filter(function (g) { return g.part === n; }).map(function (g) {
        return '<fieldset><legend>' + esc(g.title) + '</legend>' + g.fields.map(function (f) {
          return '<div class="form-group"><span class="leftLabel">' + esc(f.label) + ': </span>' + ctl(f) + '</div>';
        }).join('') + '</fieldset>';
      }).join('');
    };
    var q = '&quot;' + benhAnId + '&quot;';
    document.getElementById(container).innerHTML = '<h3>B. PHẦN BỆNH ÁN</h3>' +
      '<form action="javascript:SaveTtChung(' + q + ');">' + part(1) + '<input type="submit" id="btnSaveTtChung" value="Lưu" style="display:none;"></form>' +
      '<div class="divba"><form action="javascript:SaveTtChuyenKhoa(' + q + ');">' + part(2) + '<input type="submit" id="btnSaveTtChuyenKhoa" value="Lưu" style="display:none;"></form></div>' +
      '<h3>C. TỔNG KẾT BỆNH ÁN</h3>';
  };
  function collect(n) {
    var out = {};
    schema.groups.filter(function (g) { return g.part === n; }).forEach(function (g) {
      g.fields.forEach(function (f) {
        if (f.kind === 'radio') {
          var c = document.querySelector('input[name="' + f.id + '"]:checked');
          out[f.id] = c ? c.value : '';
        } else {
          var el = document.getElementById(f.id);
          if (f.kind === 'check') out[f.id] = el.checked;
          else if (f.kind === 'multi') out[f.id] = [].slice.call(el.options).filter(function (o) { return o.selected; }).map(function (o) { return o.value; });
          else out[f.id] = el.value;
        }
      });
    });
    return out;
  }
  window.SaveTtChung = function (id) {
    var r = call('saveBenhAn', { id: id, part: 1, values: collect(1) }).value;
    if (r.Error) { window.callGallAlert(r.InfoMessage); return; }
    toastr.info('Lưu Thông tin chung thành công.');
  };
  window.SaveTtChuyenKhoa = function (id) {
    // OneMES first fetches the list of fields (async), then saves.
    setTimeout(function () {
      var r = call('saveBenhAn', { id: id, part: 2, values: collect(2) }).value;
      if (r.Error) { window.callGallAlert(r.InfoMessage); return; }
      toastr.info('Lưu Thông tin chuyên khoa thành công.');
    }, 300);
  };

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


  // ----- Kê Tây y/VTYT (popup Kê đơn thuốc) -----
  var $ = window.jQuery;
  $.fn.modal = function (a) {
    return this.each(function () {
      this.style.display = a === 'hide' ? 'none' : 'block';
      this.classList.toggle('in', a !== 'hide');
    });
  };
  var urlHang = '';
  function keDonRows() {
    var r = call('keDon', { id: window._ylenh_ID }).value;
    return r.RetObject.map(function (x, i) {
      return '<tr id="td' + x.id + '" class="td' + x.id + '"><td>' + (i + 1) + '</td><td>' + esc(x.loaiKe) + '</td><td>' + esc(x.kho) + '</td><td>' + esc(x.name) + '</td><td>' + esc(x.hamLuong) +
        '</td><td>' + esc(x.dvt) + '</td><td>' + esc(x.sl) + '</td><td>' + esc(x.cachDung) + '</td><td>' + esc(x.doiTuong) + '</td></tr>';
    }).join('');
  }
  function formatHang(repo) {
    if (repo.loading) return repo.text;
    return '<table style="width:100%"><tr><td style="color:maroon;font-weight:bold">' + repo.Code + '</td><td>' + repo.Name + '</td><td>' + repo.DonViTinh + '</td><td>' + repo.HamLuong + '</td><td>' + repo.Ton + '</td></tr></table>';
  }
  function initS2(id, url, place, hang) {
    $('#' + id).select2({
      placeholder: place, allowClear: true,
      ajax: { url: url, dataType: 'json', delay: 350, type: 'POST', data: function (p) { return { q: p.term, page: p.page }; },
        processResults: function (data) { return { results: data.items }; }, cache: true },
      escapeMarkup: function (m) { return m; }, minimumInputLength: 0,
      templateResult: hang ? formatHang : undefined,
      templateSelection: hang ? function (r) { return r.Code == undefined ? r.text : r.text + ' ( ' + r.Code + ')'; } : undefined,
    });
  }
  window.showKeDon = function () {
    if (!ylenh || ylenh.status !== 'Mới') { window.callGallAlert('Y lệnh đã hoàn tất'); return; }
    document.getElementById('divContentModalThamKhamKeDon').innerHTML =
      '<div class="modal-body"><div class="divThuocVTYTPopupTK"><table class="table" id="tblThuoc"><thead><tr><th>STT</th><th>Loại kê</th><th>Tên kho</th><th>Tên dược</th><th>Hàm lượng</th><th>ĐVT</th><th>SL</th><th>Cách dùng</th><th>Đối tượng</th></tr></thead><tbody>' +
      keDonRows() + '</tbody></table><span id="spCountThuoc"></span></div>' +
      '<div id="divChiDinhThuoc">Loại kê: <label><input type="radio" name="cboLoai" value="1"> KÊ LĨNH</label> <label><input type="radio" name="cboLoai" value="2"> TỦ TRỰC</label>' +
      ' <label><input type="checkbox" id="cbTrongGoiKD"> Hao phí</label> <label><input type="checkbox" id="cbNguoiBenhTTKD"> Tự trả (ngoài BHYT)</label>' +
      ' <select id="cbbDoiTuongTt"><option value="bh">Bảo hiểm</option></select><br>' +
      'Kho <select id="cboKho" style="width:300px" onchange="checkToaThuocThamKhamByKho(this.value);"></select> ' +
      'Thuốc/ VTYT <select id="cboThuoc" style="width:400px" onchange="changeThuocThamKham(this.value);"></select><br>' +
      'Số lượng <input id="txtSl"> Số ngày <input id="txtSN"> Số lần/ngày <input id="txtSlN"> Số lượng/lần <input id="txtSlL"><br>' +
      '<input id="txtCachDungThuoc" placeholder="Cách dùng thuốc" style="width:500px"> <button type="button" class="btn btn-primary" onclick="AddNewThuoc();">Thêm</button></div></div>' +
      '<div class="modal-footer"><button type="button" class="btn" onclick="ChapNhanVaKTTuongTacThuoc();">Chấp nhận và KT tương tác thuốc</button>' +
      '<button type="button" class="btn" onclick="ChapNhan();">Chấp nhận</button><button type="button" class="btn" onclick="onClosePopup();">Bỏ qua</button></div>';
    $('input[name=cboLoai][value=1]').prop('checked', true);
    $('#modalKeDon').modal('show');
    initS2('cboKho', '/svc/kho', 'Kho');
    // Like OneMES, a default kho is filled in, not necessarily the one needed.
    $('#cboKho').append(new Option('KCDTD - Kho Cao đơn - Tân dược', 'k2', true, true)).trigger('change');
  };
  window.showKeDonYHCT = function () { window.callGallAlert('Không dùng trong mô phỏng'); };
  window.checkToaThuocThamKhamByKho = function (kho) {
    if (!kho) return;
    urlHang = '/svc/hang?kho=' + kho;
    $('#cboThuoc').empty();
    initS2('cboThuoc', urlHang, 'Thuốc', true);
  };
  window.changeThuocThamKham = function (hangid) {
    if (!hangid) return;
    var d = $('#cboThuoc').select2('data')[0] || {};
    document.getElementById('txtCachDungThuoc').value = d.DonViTinh === 'Lọ' ? 'Dùng ngoài' : 'Uống';
    document.getElementById('cboThuoc').innerHTML = '<option value="' + esc(hangid) + '" selected>' + esc((d.Name || d.text) + ' (' + (d.HamLuong || '') + ')') + '</option>';
    initS2('cboThuoc', urlHang, 'Thuốc', true);
  };
  function cleanThuoc() {
    $('#cboThuoc').empty();
    initS2('cboThuoc', urlHang, 'Thuốc', true);
    ['txtCachDungThuoc', 'txtSl', 'txtSN', 'txtSlN', 'txtSlL'].forEach(function (k) { document.getElementById(k).value = ''; });
    $('#cboThuoc').select2('open');
  }
  function insertThuoc() {
    var r = call('themThuoc', { id: window._ylenh_ID, kho: document.getElementById('cboKho').value, hang: document.getElementById('cboThuoc').value,
      sl: document.getElementById('txtSl').value, cachDung: document.getElementById('txtCachDungThuoc').value, haoPhi: document.getElementById('cbTrongGoiKD').checked }).value;
    if (r.Error) { cleanThuoc(); window.callGallAlert(r.InfoMessage); return; }
    toastr.info('Thêm mới thành công');
    $('.divThuocVTYTPopupTK tbody').html(keDonRows());
    cleanThuoc();
  }
  window.AddNewThuoc = function () {
    var hang = document.getElementById('cboThuoc').value;
    if (!hang) { window.callGallAlert('Chưa nhập thuốc'); return; }
    if (call('coThuoc', { id: window._ylenh_ID, hang: hang }).value.RetBoolean) {
      swal({ title: 'Thuốc đã được chỉ định?', text: 'Bạn có muốn kê thêm thuốc này không?', type: 'warning', showCancelButton: true,
        confirmButtonClass: 'btn-danger', confirmButtonText: 'Có', cancelButtonText: 'Không', closeOnConfirm: false, closeOnCancel: false },
      function (ok) { swal.close(); if (ok) insertThuoc(); });
      return;
    }
    insertThuoc();
  };
  function closeKeDon() {
    $('#modalKeDon').modal('hide');
    drawOrder();
  }
  window.ChapNhan = function () { closeKeDon(); };
  window.ChapNhanVaKTTuongTacThuoc = function () { closeKeDon(); };
  window.onClosePopup = function () {
    call('xoaHetThuoc', { id: window._ylenh_ID });
    $('#modalKeDon').modal('hide');
    drawOrder();
  };

  window.DeleteThuocInThamKham = function (Id) {
    swal({ title: 'Bạn có chắc?', text: 'Bạn có muốn xóa toa thuốc chi tiết không?', type: 'warning', showCancelButton: true,
      confirmButtonClass: 'btn-danger', confirmButtonText: 'Có', cancelButtonText: 'Không', closeOnConfirm: false, closeOnCancel: false },
    function (ok) {
      if (ok) {
        var r = call('xoaThuoc', { id: Id }).value;
        if (r.Error) { window.callGallAlert(r.InfoMessage); return; }
        toastr.info('Xóa yêu cầu toa thuốc chi tiết thành công');
        $('.td' + Id).remove(); // by class, like OneMES: the main table and the Kê đơn popup
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
