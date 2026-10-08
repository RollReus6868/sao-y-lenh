// Page agent against the mock: reading list, history, an order, and dialogs.
'use strict';
const { startMock, launch, loggedInPage, hostFor, check, done } = require('./helpers');
const { createDriver } = require('../src/driver');

(async () => {
  const m = await startMock();
  const browser = await launch();
  try {
    const page = await loggedInPage(browser, m.base);
    const d = createDriver(hostFor(page));
    check((await d.where()).page === 'other', 'home page detected');
    const pts = await d.scanPatients();
    check(pts.length === 3, 'scan finds 3 patients');
    check(pts[0].hoTen === 'NGUYỄN THỊ MẪU A' && pts[0].buong === 'Buồng 103' && pts[0].maBN === '2400000001', 'patient fields parsed');
    check(pts[1].chanDoan.includes('cổ vai'), 'diagnosis parsed');

    const { rows, source } = await d.loadPatient(pts[0]);
    check(rows.length === 4, 'order history has 4 rows');
    check(source && source.id === rows[0].id, 'source = newest order with both progress notes');
    check(source.thuoc.length === 5 && source.dvkt.length === 5, 'source items read');
    check(source.thuoc[1].name === 'HOẠT HUYẾT KHỨ Ứ ẨM' && source.thuoc[1].group === 'Thuốc Tây Y' && source.thuoc[1].sl === '2', 'drug columns aligned');
    check(source.thuoc[3].group === 'Vật tư y tế', 'VTYT group parsed');
    check(source.dvkt[1].name === 'Điện châm [kim ngắn]' && source.dvkt[1].moTa.startsWith('Châm tả'), 'DVKT name/description split');
    check(source.dvkt[3].group === 'Phục hồi chức năng', 'DVKT group parsed');
    check(/hoàn tất/i.test(source.status) && source.buttons.btnSaoChep && !source.buttons.btnPopupHOANTAT, 'done order shows Sao chép only');
    check(source.saoYLenh.options.length === 4 && source.hinhThucSao.options.length === 7, 'dropdowns read');

    // Patient C has no order with PHCN -> no source.
    const r3 = await d.loadPatient(pts[2]);
    check(r3.source === null, 'patient without PHCN gets no source');

    // Dialog round trip: open a delete dialog on a Mới order and cancel it.
    const st = m.mock.getState();
    const o = st.patients[0].orders[0];
    o.status = 'Mới';
    await d.loadPatient(pts[0], o.id);
    await d.call('deleteThuoc', o.thuoc[0].id);
    await page.waitForTimeout(700); // SweetAlert accepts clicks once it is fully shown
    const s = await d.call('swal');
    check(s.ready, 'dialog ready for clicks');
    check(s.visible && s.confirmText === 'Có' && s.cancelText === 'Không', 'delete dialog visible with Có/Không');
    await d.call('swalClick', 'cancel');
    await page.waitForTimeout(500);
    check(!(await d.call('swal')).visible, 'dialog closed');
    check(m.mock.getState().patients[0].orders[0].thuoc.length === 5, 'cancel kept the drug');

    // A page without the menu (start page after login) still yields the list address from usid.
    await page.goto(m.base + '/nomenu.aspx?scope=sys&lang=vi&usid=10.0.0.1_abc&st=1');
    const link = await d.call('listLink', '61');
    check(link === m.base + '/home.aspx?scope=sys&lang=vi&wpid=danhsachdieutrinoitrudraw&role=61&usid=10.0.0.1_abc', 'list link rebuilt from usid: ' + link);
    await page.goto(m.base + '/nomenu.aspx');
    check((await d.call('listLink', '61')) === '', 'no usid, no link');
  } finally {
    await browser.close();
    await m.close();
  }
  done();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
