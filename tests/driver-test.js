// Full runs against the mock: copy, Sao y lệnh, per-day deletions, Hoàn tất.
'use strict';
const { startMock, launch, loggedInPage, hostFor, check, done } = require('./helpers');
const { createDriver } = require('../src/driver');

const names = (o) => [...o.thuoc, ...o.dvkt].map((x) => x.name);

(async () => {
  const m = await startMock();
  const browser = await launch();
  try {
    const page = await loggedInPage(browser, m.base);
    const logs = [];
    const d = createDriver({ ...hostFor(page, logs), timeout: 15000 });
    let pts = await d.scanPatients();
    const keyOf = (src, name) => [...src.thuoc, ...src.dvkt].find((x) => x.name.startsWith(name)).key;
    const newOrders = (pi, before) => m.mock.getState().patients[pi].orders.filter((o) => !before.includes(o.id)).sort((a, b) => a.date - b.date);
    const ids = (pi) => m.mock.getState().patients[pi].orders.map((o) => o.id);

    // --- 1 day ---
    console.log('1 ngày');
    let { source } = await d.loadPatient(pts[0]);
    let before = ids(0);
    let r = await d.run({ patient: pts[0], sourceId: source.id, days: 1, deletions: [[keyOf(source, 'Renaxib'), keyOf(source, 'Giác hơi')]] });
    let fresh = newOrders(0, before);
    check(r.ok && fresh.length === 1, 'one new order');
    check(fresh[0].status === 'Hoàn tất', 'completed');
    check(!names(fresh[0]).includes('Renaxib 200') && !names(fresh[0]).some((n) => n.startsWith('Giác hơi')) && names(fresh[0]).length === 8, 'two items deleted, eight kept');

    // --- 3 days, deletions shared by all days happen before Sao y lệnh ---
    console.log('3 ngày');
    m.mock.getState().log.length = 0;
    ({ source } = await d.loadPatient(pts[1]));
    before = ids(1);
    const L = keyOf(source, 'Lirystad'), K = keyOf(source, 'Kim châm'), DC = keyOf(source, 'Điện châm');
    r = await d.run({ patient: pts[1], sourceId: source.id, days: 3, deletions: [[L], [L, K], [L, DC]] });
    fresh = newOrders(1, before);
    check(r.ok && fresh.length === 3, 'three new orders');
    check(fresh.every((o) => o.status === 'Hoàn tất'), 'all completed');
    check(fresh.every((o) => !names(o).includes('Lirystad 150')), 'Lirystad gone every day');
    check(names(fresh[0]).length === 9, 'day 1 kept 9 items');
    check(!names(fresh[1]).some((n) => n.startsWith('Kim châm')) && names(fresh[1]).length === 8, 'day 2 also lost Kim châm');
    check(!names(fresh[2]).includes('Điện châm [kim ngắn]') && names(fresh[2]).length === 8, 'day 3 also lost Điện châm');
    const days = fresh.map((o) => o.date.getDate());
    check(days[1] === days[0] + 1 && days[2] === days[0] + 2, 'consecutive dates');
    const th = m.mock.getState().log.filter((x) => x[0] === 'thuHoi').map((x) => x[1]);
    check(th.length === 2 && th[0] === fresh[1].id && th[1] === fresh[2].id, 'Thu hồi only on days 2 and 3 (copies come Hoàn tất)');

    // --- 4 days, day 1 has its own deletion -> Thu hồi ---
    console.log('4 ngày + thu hồi');
    m.mock.getState().log.length = 0;
    ({ source } = await d.loadPatient(pts[0]));
    before = ids(0);
    const N = keyOf(source, 'Nhang'), SA = keyOf(source, 'Điều trị bằng siêu âm');
    r = await d.run({ patient: pts[0], sourceId: source.id, days: 4, deletions: [[N], [], [SA], [SA]] });
    fresh = newOrders(0, before);
    check(r.ok && fresh.length === 4 && fresh.every((o) => o.status === 'Hoàn tất'), 'four new orders completed');
    const n0 = source.thuoc.length + source.dvkt.length;
    check(!names(fresh[0]).includes('Nhang ngải cứu') && names(fresh[0]).length === n0 - 1, 'day 1 lost Nhang only');
    check(names(fresh[1]).length === n0, 'day 2 untouched');
    check(!names(fresh[2]).includes('Điều trị bằng siêu âm') && !names(fresh[3]).includes('Điều trị bằng siêu âm'), 'days 3-4 lost siêu âm');
    const th4 = m.mock.getState().log.filter((x) => x[0] === 'thuHoi').map((x) => x[1]);
    check(th4.length === 3 && th4[0] === fresh[0].id && !th4.includes(fresh[1].id), 'Thu hồi on day 1, 3, 4 but not on untouched day 2');

    // --- autoComplete off ---
    console.log('không tự hoàn tất');
    ({ source } = await d.loadPatient(pts[1]));
    before = ids(1);
    r = await d.run({ patient: pts[1], sourceId: source.id, days: 2, deletions: [[], [keyOf(source, 'Giác hơi')]], autoComplete: false });
    fresh = newOrders(1, before);
    check(fresh[0].status === 'Hoàn tất' && fresh[1].status === 'Mới', 'day 1 completed (needed for copies), edited day 2 left Mới');

    // --- same source again: the days already exist, nothing may be created ---
    console.log('trùng ngày');
    before = ids(1);
    const dup = await d.run({ patient: pts[1], sourceId: source.id, days: 2, deletions: [[], []] }).catch((x) => x);
    check(dup instanceof Error && /Đã có y lệnh ngày/.test(dup.message), 'duplicate days refused: ' + (dup && dup.message));
    check(newOrders(1, before).length === 0, 'nothing created for duplicate days');

    // --- Stop ---
    console.log('dừng');
    m.mock.reset();
    pts = await d.scanPatients();
    let n = 0;
    const d2 = createDriver({ ...hostFor(page), stopped: () => n > 0, step: async () => { n++; } });
    ({ source } = await d2.loadPatient(pts[1]));
    before = ids(1);
    const e = await d2.run({ patient: pts[1], sourceId: source.id, days: 2, deletions: [[], []] }).catch((x) => x);
    check(e && e.stopped, 'stop raises StopError');
    check(newOrders(1, before).length === 0, 'nothing created after stop at first step');

    // --- warning from OneMES stops the run ---
    console.log('cảnh báo');
    ({ source } = await d.loadPatient(pts[1]));
    const api = require('../mock/server');
    const st = api.getState();
    const before2 = ids(1);
    // make day-1 completion fail: empty both notes on the source so the copy has none
    const so = st.patients[1].orders.find((o) => o.id === source.id);
    so.dienBien = '';
    so.dienBienPHCN = '';
    const e2 = await d.run({ patient: pts[1], sourceId: source.id, days: 2, deletions: [[], []] }).catch((x) => x);
    check(e2 && /diễn biến/i.test(e2.message), 'OneMES warning surfaces: ' + (e2 && e2.message));
    check(newOrders(1, before2).length === 1 && newOrders(1, before2)[0].status === 'Mới', 'stopped with the copy still Mới');
    check(!(await d.call('swal')).visible, 'warning dialog closed');
    check(e2.partial && e2.partial.days.length === 1, 'error carries the day already created');

    // --- check afterwards, then delete a created day ---
    console.log('kiểm tra lại + xóa ngày');
    m.mock.reset();
    pts = await d.scanPatients();
    ({ source } = await d.loadPatient(pts[1]));
    before = ids(1);
    const L2 = keyOf(source, 'Lirystad'), SA2 = keyOf(source, 'Điều trị bằng siêu âm');
    r = await d.run({ patient: pts[1], sourceId: source.id, days: 3, deletions: [[L2], [L2], [L2, SA2]] });
    let v = await d.verify(pts[1], r.expect, r.days);
    check(v.ok && v.days.length === 3 && v.days.every((x) => !x.problems.length), 'check: all three days as chosen');
    check(v.days.every((x) => /hoàn tất/i.test(x.status) && x.dienBien && x.thuoc.length && x.dvkt.length), 'check: full details read back');
    check(v.days[2].removed.includes('Điều trị bằng siêu âm') && v.days[2].dvkt.every((x) => x.name !== 'Điều trị bằng siêu âm'), 'check: day 3 lists what was removed');
    // put a deleted drug back on day 2 behind the tool's back
    fresh = newOrders(1, before);
    const lir = m.mock.getState().patients[1].orders.find((o) => o.id === source.id).thuoc.find((x) => x.name === 'Lirystad 150');
    fresh[1].thuoc.push({ ...lir, id: 'aaaaaaaa-0000-4000-8000-000000000001' });
    v = await d.verify(pts[1], r.expect, r.days);
    check(!v.ok && v.days[1].problems.some((x) => /Lirystad 150.*vẫn còn/.test(x)) && !v.days[0].problems.length, 'check: leftover drug flagged on day 2 only');

    const gone = await d.deleteOrder(pts[1], r.days[2].id);
    check(gone.ok && !ids(1).includes(r.days[2].id), 'delete: day 3 removed from OneMES');
    check(m.mock.getState().log.some((x) => x[0] === 'thuHoi' && x[1] === r.days[2].id), 'delete: Thu hồi first (it was Hoàn tất)');
    const again = await d.deleteOrder(pts[1], r.days[2].id).catch((x) => x);
    check(again instanceof Error && /Không thấy/.test(again.message), 'delete: a missing order is refused');
    v = await d.verify(pts[1], r.expect, r.days);
    check(v.days[2].gone && v.days[2].problems.length, 'check: deleted day reported as gone');

    // --- per-day corrections: time, notes, doctor, care level ---
    console.log('sửa từng ngày');
    m.mock.reset();
    pts = await d.scanPatients();
    const viaBase = await d.loadLists(m.base + '/es');
    check(viaBase.bacSi.length === 4, 'lists: list page uses the fallback address');
    ({ source } = await d.loadPatient(pts[0]));
    const lists = await d.loadLists('http://192.0.2.1:9');
    check(lists.bacSi.length === 4 && lists.capDo.length === 3 && lists.capDo[0].text === '(I) Cấp I', 'lists: on the patient page the address comes from the page script');
    check(source.bacSi && source.bacSi.id === 'd1' && source.capDo && source.capDo.id === 'c3', 'source: doctor and care level read');
    before = ids(0);
    m.mock.getState().log.length = 0;
    const bs2 = { id: 'd2', text: 'BS. Trần Thị Hai' };
    const cd1 = lists.capDo[0];
    r = await d.run({
      patient: pts[0], sourceId: source.id, days: 3, deletions: [[], [], []],
      edits: [{ gio: '07:30', bacSi: bs2 }, { dienBien: 'Ngày 2: đỡ đau' }, { gio: '08:15', capDo: cd1 }],
    });
    fresh = newOrders(0, before);
    const hm = (d0) => `${String(d0.getHours()).padStart(2, '0')}:${String(d0.getMinutes()).padStart(2, '0')}`;
    check(r.ok && fresh.length === 3 && fresh.every((o) => o.status === 'Hoàn tất'), 'edits: three days completed');
    check(hm(fresh[0].dateTH) === '07:30' && hm(fresh[0].date) === '07:29', 'edits: day 1 thực hiện 07:30, chỉ định 07:29');
    check(hm(fresh[1].dateTH) === hm(source.thoiGianThucHien ? new Date(0, 0, 1, ...source.thoiGianThucHien.slice(0, 5).split(':').map(Number)) : new Date()), 'edits: day 2 keeps the source time');
    check(hm(fresh[2].dateTH) === '08:15' && hm(fresh[2].date) === '08:14', 'edits: day 3 at 08:15');
    check(fresh[0].dateTH.getDate() + 1 === fresh[1].dateTH.getDate(), 'edits: dates unchanged');
    check(fresh[0].bacSi.id === 'd2' && fresh[1].bacSi.id === 'd1' && fresh[2].bacSi.id === 'd1', 'edits: doctor changed on day 1 only (copies put back to the source doctor)');
    check(fresh[1].dienBien === 'Ngày 2: đỡ đau' && fresh[0].dienBien === source.dienBien && fresh[2].dienBien === source.dienBien, 'edits: notes changed on day 2 only');
    check(fresh[2].capDo.id === 'c1' && fresh[0].capDo.id === 'c3' && fresh[1].capDo.id === 'c3', 'edits: care level changed on day 3 only');
    check(m.mock.getState().log.filter((x) => x[0] === 'luu').length === 3, 'edits: Lưu once per day that changed');
    v = await d.verify(pts[0], r.expect, r.days);
    check(v.ok && v.days[0].bacSi.id === 'd2' && v.days[2].capDo.id === 'c1', 'edits: check reads doctor and care level back: ' + JSON.stringify(v.days.map((x) => x.problems)));
    fresh[1].dienBien = 'đổi tay';
    v = await d.verify(pts[0], r.expect, r.days);
    check(!v.ok && v.days[1].problems.some((x) => /Diễn biến bệnh/.test(x)), 'edits: a changed note is flagged');

    // --- correct a created day from the Kết quả tab ---
    console.log('sửa lại một ngày');
    m.mock.getState().log.length = 0;
    const kim = v.days[1].thuoc.find((x) => x.name.startsWith('Kim châm'));
    const u = await d.updateDay(pts[0], r.days[1].id, { gio: '09:00', dienBien: 'Ngày 2: sửa lại', bacSi: { id: 'd3', text: 'BS. Lê Văn Ba' } }, [{ id: kim.id, base: kim.base, name: kim.name }], true);
    const o2 = m.mock.getState().patients[0].orders.find((o) => o.id === r.days[1].id);
    check(u.changed && o2.status === 'Hoàn tất' && hm(o2.dateTH) === '09:00' && hm(o2.date) === '08:59', 'update: time changed, completed again');
    check(o2.dienBien === 'Ngày 2: sửa lại' && o2.bacSi.id === 'd3' && !names(o2).some((n) => n.startsWith('Kim châm')), 'update: notes, doctor and item deletion applied');
    const lg = m.mock.getState().log.map((x) => x[0]);
    check(lg.indexOf('thuHoi') < lg.indexOf('xoaThuoc') && lg.indexOf('xoaThuoc') < lg.indexOf('luu') && lg.indexOf('luu') < lg.indexOf('hoanTat'), 'update: Thu hồi, xóa, Lưu, Hoàn tất in order');
    const same = await d.updateDay(pts[0], r.days[1].id, { gio: '09:00' }, [], true);
    check(!same.changed, 'update: nothing to do when already right');
    // An earlier time than chỉ định must still go in (chỉ định is moved first).
    await d.updateDay(pts[0], r.days[1].id, { gio: '06:05' }, [], true);
    check(hm(o2.dateTH) === '06:05' && hm(o2.date) === '06:04', 'update: moving the time earlier works');

    // --- Thông tin bệnh án ---
    console.log('bệnh án');
    const schema = require('../src/benh-an-schema.json');
    const fields = schema.groups.flatMap((g) => g.fields.map((f) => ({ id: f.id, kind: f.kind, part: g.part })));
    const blank = await d.readBenhAn(pts[2], fields);
    check(!blank.missing.length && blank.values.txtLyDoVaoVien === '' && Array.isArray(blank.values.HinhThai), 'bệnh án: blank page read, every field found');
    const want = { ...blank.values, txtLyDoVaoVien: 'Đau lưng', ckTsThuocLa: true, txtTgBAThuocLa: '5', HinhThai: ['1', '3'], CDCS: ' Cấp II', BieuHienHanNhiet: blank.values.BieuHienHanNhiet, ToanThans: 'Tỉnh\nTiếp xúc tốt' };
    const sel = fields.find((f) => f.kind === 'select');
    want[sel.id] = schema.groups.flatMap((g) => g.fields).find((f) => f.id === sel.id).options[1].value;
    const saved = await d.saveBenhAn(pts[2], fields, want);
    const ba = m.mock.getState().patients[2].benhAn;
    check(!saved.diff.length && !saved.missing.length, 'bệnh án: saved and read back the same');
    check(ba.txtLyDoVaoVien === 'Đau lưng' && ba.ckTsThuocLa === true && ba.HinhThai.join() === '1,3' && ba.CDCS === ' Cấp II' && ba.ToanThans === 'Tỉnh\nTiếp xúc tốt', 'bệnh án: values stored on OneMES (both parts)');
    check(m.mock.getState().log.filter((x) => x[0] === 'saveBenhAn').map((x) => x[2]).join() === '1,2', 'bệnh án: Thông tin chung then chuyên khoa saved');
    const again2 = await d.readBenhAn(pts[2], fields);
    check(again2.values.HinhThai.join() === '1,3' && again2.values.CDCS === ' Cấp II', 'bệnh án: read back from OneMES');
    // radio given without its stray spaces still matches
    await d.saveBenhAn(pts[2], fields, { ...want, CDCS: 'Cấp III' });
    check(m.mock.getState().patients[2].benhAn.CDCS === ' Cấp III', 'bệnh án: radio matched loosely');

    // --- Ds Điều trị nội trú from start pages without the link ---
    console.log('nút Ds');
    await page.goto(m.base + '/start-usid.aspx');
    await d.gotoList(true);
    check(/wpid=danhsachdieutrinoitrudraw/.test(page.url()) && /usid=10.0.0.1_start/.test(page.url()), 'Ds: usid found in another link: ' + page.url());
    await page.goto(m.base + '/start-menu.aspx');
    await d.gotoList(true);
    check(/wpid=danhsachdieutrinoitrudraw/.test(page.url()), 'Ds: menu entry clicked when no address is known');
  } catch (e) {
    console.log('ERROR', e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await m.close();
  }
  done();
})();
