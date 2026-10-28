// Full runs against the mock: copy, Sao y lệnh, per-day deletions, Hoàn tất.
'use strict';
const { startMock, launch, loggedInPage, hostFor, check, done } = require('./helpers');
const { createDriver, planTicks, fmtTime: fmt } = require('../src/driver');

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
    // What is already written on OneMES stays; only empty boxes are filled.
    const empty = fields.find((f) => f.kind === 'textarea' && want[f.id] === '');
    const r2 = await d.saveBenhAn(pts[2], fields, { ...want, CDCS: 'Cấp III', txtLyDoVaoVien: 'Khác', ckTsThuocLa: false, [empty.id]: 'Mới điền' });
    const ba2 = m.mock.getState().patients[2].benhAn;
    check(ba2.CDCS === ' Cấp II' && ba2.txtLyDoVaoVien === 'Đau lưng' && ba2.ckTsThuocLa === true, 'bệnh án: values already on OneMES kept');
    check(ba2[empty.id] === 'Mới điền' && r2.filled.join() === empty.id, 'bệnh án: only the empty box filled');
    check(['CDCS', 'txtLyDoVaoVien', 'ckTsThuocLa'].every((id) => r2.kept.includes(id)) && !r2.diff.length, 'bệnh án: kept boxes reported');
    m.mock.getState().log.length = 0;
    const r3 = await d.saveBenhAn(pts[2], fields, { ...want, txtLyDoVaoVien: 'Khác' });
    check(!r3.filled.length && !m.mock.getState().log.some((x) => x[0] === 'saveBenhAn'), 'bệnh án: nothing empty to fill, nothing saved');
    // radio given without its stray spaces still matches
    await d.saveBenhAn(pts[1], fields, { CDCS: 'Cấp III' });
    check(m.mock.getState().patients[1].benhAn.CDCS === ' Cấp III', 'bệnh án: radio matched loosely');

    // --- thêm thuốc qua Kê Tây y/VTYT ---
    console.log('thêm thuốc');
    const ITEMS = [
      { id: 'con', label: 'Cồn xoa bóp', kho: 'KCPSX', ten: 'CỒN XOA BÓP', tim: 'cồn xoa', sl: '1', cachDung: 'Mỗi lần dùng 5ml, xoa bóp các chỗ đau 4 lần/ngày', loai: 'KÊ LĨNH' },
      { id: 'cao', label: 'Cao thông mạch', kho: 'KCPSX', ten: 'CAO THÔNG MẠCH', tim: 'cao thông', sl: '1', cachDung: 'Uống 20ml/lần * 2 lần/ngày * 3 ngày (sáng, chiều) sau ăn', loai: 'KÊ LĨNH' },
    ];
    const drugs = (o) => o.thuoc.map((x) => x.name);
    const count = (o, n) => drugs(o).filter((x) => x === n).length;
    m.mock.reset();
    pts = await d.scanPatients();
    ({ source } = await d.loadPatient(pts[0]));
    before = ids(0);
    m.mock.getState().log.length = 0;
    r = await d.run({ patient: pts[0], sourceId: source.id, days: 3, deletions: [[], [], []], adds: [['con', 'cao'], ['con'], ['cao']], addItems: ITEMS });
    fresh = newOrders(0, before);
    check(r.ok && fresh.length === 3 && fresh.every((o) => o.status === 'Hoàn tất'), 'thêm: three days completed');
    check(count(fresh[0], 'CỒN XOA BÓP') === 1 && count(fresh[0], 'CAO THÔNG MẠCH') === 1, 'thêm: day 1 has both');
    check(count(fresh[1], 'CỒN XOA BÓP') === 1 && !count(fresh[1], 'CAO THÔNG MẠCH'), 'thêm: day 2 Cồn xoa bóp only');
    check(!count(fresh[2], 'CỒN XOA BÓP') && count(fresh[2], 'CAO THÔNG MẠCH') === 1, 'thêm: day 3 Cao thông mạch only');
    const con = fresh[0].thuoc.find((x) => x.name === 'CỒN XOA BÓP');
    check(con.kho === 'Kho Chế phẩm sản xuất tại khoa Dược' && con.sl === '1' && con.cachDung === ITEMS[0].cachDung && con.doiTuong === 'Bảo hiểm', 'thêm: kho KCPSX, SL 1, cách dùng, Bảo hiểm');
    check(!m.mock.getState().log.some((x) => x[0] === 'xoaHetThuoc'), 'thêm: never pressed X / Bỏ qua');
    v = await d.verify(pts[0], r.expect, r.days);
    check(v.ok && v.days[0].added.length === 2 && !v.days.some((x) => x.warnings.some((w) => /CỒN|CAO/.test(w))), 'thêm: check passes, added drugs not reported as extra: ' + JSON.stringify(v.days.map((x) => [x.problems, x.warnings])));
    fresh[1].thuoc = fresh[1].thuoc.filter((x) => x.name !== 'CỒN XOA BÓP');
    v = await d.verify(pts[0], r.expect, r.days);
    check(!v.ok && v.days[1].problems.some((x) => /Chưa có "Cồn xoa bóp"/.test(x)), 'thêm: a missing added drug is flagged');
    check((await d.call('keDonClick', 'Bỏ qua')).ok === false, 'thêm: agent refuses the Bỏ qua button');

    // Ticked on every day: added once before Sao y lệnh, which copies it; no Thu hồi.
    ({ source } = await d.loadPatient(pts[1]));
    before = ids(1);
    m.mock.getState().log.length = 0;
    r = await d.run({ patient: pts[1], sourceId: source.id, days: 2, deletions: [[], []], adds: [['con'], ['con']], addItems: ITEMS });
    fresh = newOrders(1, before);
    const lg2 = m.mock.getState().log;
    check(r.ok && fresh.every((o) => count(o, 'CỒN XOA BÓP') === 1), 'thêm: both days have one Cồn xoa bóp');
    check(lg2.filter((x) => x[0] === 'themThuoc').length === 1 && !lg2.some((x) => x[0] === 'thuHoi'), 'thêm: added once on day 1, no Thu hồi');
    // Already in the source: nothing added twice.
    ({ source } = await d.loadPatient(pts[1]));
    before = ids(1);
    m.mock.getState().log.length = 0;
    r = await d.run({ patient: pts[1], sourceId: source.id, days: 1, deletions: [[]], adds: [['con']], addItems: ITEMS });
    fresh = newOrders(1, before);
    check(r.ok && count(fresh[0], 'CỒN XOA BÓP') === 1 && !m.mock.getState().log.some((x) => x[0] === 'themThuoc'), 'thêm: drug already copied from the source is not added again');

    // --- dọn thủ thuật các ngày cũ ---
    console.log('dọn thủ thuật');
    m.mock.reset();
    pts = await d.scanPatients();
    const CUT = '00:00 12/10/2026';
    let sc = await d.scanDvCu(pts[0], { before: CUT });
    check(sc.days.length === 2, 'dọn: two old yellow days (today, the CLS day and the sắc day left out): ' + sc.days.map((x) => x.tg).join(', '));
    check(sc.days[0].items.map((x) => x.action).join() === 'xoa,thuhoi' && sc.days[1].items.map((x) => x.action).join() === 'thuhoi', 'dọn: Hoàn trả to delete, Chờ thực hiện to recall, oldest day first');
    check(!(await d.scanDvCu(pts[2], { before: CUT })).days.length, 'dọn: patient with every service done has nothing');
    m.mock.getState().log.length = 0;
    const cleaned = await d.cleanDvCu(pts[0], sc.days.map((x) => ({ id: x.id, tg: x.tg, items: x.items.map((i) => i.id) })));
    const lgc = m.mock.getState().log.map((x) => x[0]);
    check(cleaned.reduce((a, x) => a + x.deleted.length, 0) === 3 && cleaned.every((x) => !x.failed.length), 'dọn: three services deleted');
    check(lgc.filter((x) => x === 'thuHoiDV').length === 2 && lgc.filter((x) => x === 'xoaDichVu').length === 3, 'dọn: two Thu hồi in Sửa DVKT, three deletions');
    check(!lgc.includes('chuyenTH') && !lgc.includes('thuHoi') && !lgc.includes('hoanTat'), 'dọn: never sent a service, never recalled the order');
    const st0 = m.mock.getState().patients[0];
    const oldDay = st0.orders.find((o) => o.id === sc.days[0].id);
    check(oldDay.status === 'Hoàn tất' && oldDay.dvkt.length === 3 && oldDay.dvkt.every((x) => x.trangThai === 'Hoàn tất'), 'dọn: order stays Hoàn tất with its done services');
    check(st0.orders.find((o) => o.khac.includes('Sắc')).dvkt[0].trangThai === 'Chờ thực hiện', 'dọn: sắc thuốc thang order untouched');
    check(!(await d.call('dvSuaState')).open, 'dọn: Sửa DVKT closed');
    check(!(await d.scanDvCu(pts[0], { before: CUT })).days.length, 'dọn: nothing left after cleaning');
    // Only the ticked service on a day.
    sc = await d.scanDvCu(pts[1], { before: CUT });
    m.mock.getState().log.length = 0;
    await d.cleanDvCu(pts[1], [{ id: sc.days[0].id, tg: sc.days[0].tg, items: [sc.days[0].items[1].id] }]);
    const left = await d.scanDvCu(pts[1], { before: CUT });
    check(left.days.length === 2 && left.days[0].items.length === 1 && left.days[0].items[0].action === 'xoa', 'dọn: unticked services left alone');

    // --- sao chép y lệnh sắc thuốc thang ---
    console.log('sắc thuốc thang');
    m.mock.reset();
    pts = await d.scanPatients();
    const lpS = await d.loadPatient(pts[0], null, 'sac');
    const lpT = await d.loadPatient(pts[0]);
    const khacOf = (lp) => lp.rows.find((x) => x.id === lp.source.id).khac;
    check(lpS.source && /sắc thuốc thang/i.test(khacOf(lpS)) && !/sắc/i.test(khacOf(lpT)), 'sắc: each kind picks its own source');
    check(!(await d.loadPatient(pts[1], null, 'sac')).source, 'sắc: none for a patient without one');
    const srcS = lpS.rows.find((x) => x.id === lpS.source.id);
    check(srcS.tg.endsWith('10/10/2026') && srcS.tgth.endsWith('11/10/2026'), 'sắc: source prescribed the day before it is carried out: ' + srcS.tg + ' / ' + srcS.tgth);
    // What the UI fills in: thực hiện and bác sĩ from the usual order of the day, chỉ định from the day before.
    const usual = (dd) => lpS.rows.find((x) => !/sắc/i.test(x.khac) && x.tgth.endsWith(dd));
    const e1 = { thucHien: usual('12/10/2026').tgth, chiDinh: usual('11/10/2026').tg, bacSi: { id: 'd2', text: 'BS. Trần Thị Hai' } };
    before = ids(0);
    r = await d.run({ patient: pts[0], sourceId: lpS.source.id, kind: 'sac', days: 2, deletions: [[], []], edits: [e1, null], addItems: [{ id: 'x', label: 'X', ten: 'Cồn xoa bóp' }], adds: [['x'], ['x']] });
    fresh = newOrders(0, before);
    check(r.ok && fresh.length === 2 && fresh.every((o) => /sắc/i.test(o.khac) && o.status === 'Hoàn tất'), 'sắc: two sắc days copied and completed');
    check(fmt(fresh[0].dateTH) === e1.thucHien && fmt(fresh[0].date) === e1.chiDinh, 'sắc: day 1 times set with their own dates: ' + fmt(fresh[0].date) + ' / ' + fmt(fresh[0].dateTH));
    check(fresh[0].bacSi.id === 'd2', 'sắc: day 1 doctor as on the usual order');
    check(fresh[1].dateTH.getDate() === 13 && fresh[1].date.getDate() === 12, 'sắc: day 2 found by its Thời gian thực hiện: ' + fmt(fresh[1].date) + ' / ' + fmt(fresh[1].dateTH));
    check(fresh.every((o) => !o.thuoc.some((t) => /cồn/i.test(t.name))), 'sắc: never adds drugs');
    const vS = await d.verify(pts[0], r.expect, r.days);
    check(vS.days.every((x) => !x.problems.length), 'sắc: re-check finds no problem: ' + JSON.stringify(vS.days.map((x) => x.problems)));
    const dupS = await d.run({ patient: pts[0], sourceId: lpS.source.id, kind: 'sac', days: 1, deletions: [[]] }).catch((x) => x);
    check(dupS instanceof Error && /sắc thuốc thang ngày 12\/10/.test(dupS.message), 'sắc: a second sắc order for a day is refused: ' + dupS.message);
    before = ids(0);
    r = await d.run({ patient: pts[0], sourceId: lpT.source.id, days: 1, deletions: [[]] });
    check(r.ok && newOrders(0, before).length === 1, 'sắc: the usual copy still goes onto a day that has a sắc order');

    // --- tick sẵn Cao thông mạch / Cồn xoa bóp từ các y lệnh thường trước (0.5.0) ---
    console.log('tick sẵn');
    m.mock.reset();
    pts = await d.scanPatients();
    const CAT = [{ ...ITEMS[0], tuTick: '5' }, { ...ITEMS[1], tuTick: '3' }];
    const pa = m.mock.getState().patients[0];
    const usualDay = (dd) => pa.orders.find((o) => o.date.getDate() === dd && !/sắc/i.test(o.khac));
    const drugRow = (name) => ({ ...usualDay(12).thuoc[0], id: require('crypto').randomUUID(), name });
    usualDay(9).thuoc.push(drugRow('CỒN XOA BÓP'));
    usualDay(10).thuoc.push(drugRow('CAO THÔNG MẠCH'));
    let lpA = await d.loadPatient(pts[0]);
    let tk = await d.autoTicks(lpA.rows, lpA.source, CAT);
    // Source 12/10: days 13–16. Cao 10/10 +3 → 13/10 (day 1), and day 1 then holds it → 16/10 (day 4).
    // Cồn 9/10 +5 → 14/10 (day 2). The 11/10 order has no PHCN, so it is not a usual order.
    check(JSON.stringify(tk.adds) === JSON.stringify([['cao'], ['con'], [], ['cao']]), 'tick sẵn: Cao day 1 and 4, Cồn day 2: ' + JSON.stringify(tk.adds));
    check(tk.why.some((w) => w.id === 'cao' && w.day === 1 && w.from === '10/10') && tk.why.some((w) => w.id === 'con' && w.day === 2 && w.from === '9/10'), 'tick sẵn: reasons name the day holding the drug');
    // The source itself holds Cao (kept on day 1 by the copy) unless it is deleted there.
    usualDay(12).thuoc.push(drugRow('CAO THÔNG MẠCH'));
    lpA = await d.loadPatient(pts[0]);
    const caoKey = lpA.source.thuoc.find((x) => x.name === 'CAO THÔNG MẠCH').key;
    tk = await d.autoTicks(lpA.rows, lpA.source, CAT);
    check(tk.adds[2].includes('cao') && tk.adds[3].includes('cao'), 'tick sẵn: Cao in the source → day 3 (12+3) and day 4 (day 1 keeps it): ' + JSON.stringify(tk.adds));
    // 0.6.0: the copies drop the Cao the source has, except on the days it is due again.
    check(JSON.stringify(tk.dels) === JSON.stringify([[], [caoKey], [], []]), 'tick xóa: Cao from the source deleted on day 2 only (days 1, 3, 4 are due): ' + JSON.stringify(tk.dels));
    const tkD = planTicks({ history: [], srcDate: new Date(2026, 9, 12, 7), srcThuoc: [{ name: 'CỒN XOA BÓP', key: 't|CỒN XOA BÓP|x#1' }], catalog: [{ ...ITEMS[0], tuTick: '' }] });
    check(tkD.dels.every((x) => x.length === 1 && x[0] === 't|CỒN XOA BÓP|x#1') && tkD.adds.every((x) => !x.length), 'tick xóa: a drug with no Tự tick sau is deleted from every copy');
    tk = await d.autoTicks(lpA.rows, lpA.source, CAT, [[caoKey], [caoKey], [caoKey], [caoKey]]);
    check(tk.adds[2].includes('cao') && tk.adds[3].includes('cao'), 'tick sẵn: deleting it from the copies keeps the ticks from the source day and day 1 tick: ' + JSON.stringify(tk.adds));
    check(JSON.stringify((await d.autoTicks(lpA.rows, lpA.source, ITEMS)).adds) === '[[],[],[],[]]', 'tick sẵn: nothing without Tự tick sau');
    const tkP = planTicks({ history: [], srcDate: new Date(2026, 9, 12, 7), srcThuoc: [], catalog: CAT });
    check(tkP.adds.every((x) => !x.length), 'tick sẵn: no history, no tick');

    // --- sắc thuốc thang tự chạy sau y lệnh thường: giờ và bác sĩ như tab Sắc (0.5.0) ---
    console.log('sắc tự động');
    const lpS2 = await d.loadPatient(pts[0], null, 'sac');
    const se = d.sacEdits(lpS2.rows, lpS2.source, 2, [{ id: 'd1', name: 'BS. Nguyễn Văn Mẫu' }]);
    check(se[0] && se[0].thucHien === '07:05 12/10/2026' && se[0].chiDinh === '07:04 11/10/2026' && se[0].bacSi && se[0].bacSi.id === 'd1', 'sắc tự động: day 1 thực hiện 12/10, chỉ định 11/10, doctor: ' + JSON.stringify(se[0]));
    check(se[1] && !se[1].thucHien && se[1].chiDinh === '07:04 12/10/2026', 'sắc tự động: day 2 has no usual order yet on 13/10, chỉ định from 12/10: ' + JSON.stringify(se[1]));
    before = ids(0);
    r = await d.run({ patient: pts[0], sourceId: lpS2.source.id, kind: 'sac', days: 2, deletions: [], edits: se });
    fresh = newOrders(0, before);
    check(r.ok && fresh.length === 2 && fmt(fresh[0].dateTH) === '07:05 12/10/2026' && fmt(fresh[0].date) === '07:04 11/10/2026', 'sắc tự động: run with those edits');

    // --- cập nhật kết quả cận lâm sàng ---
    console.log('kết quả CLS');
    const cl = await d.clsList(pts[1]);
    check(cl.dates.join() === '10/10/2026,08/10/2026,06/10/2026', 'CLS: dates found, newest first: ' + cl.dates.join());
    check(cl.usual && cl.usual['12/10/2026'] === '07:05' && cl.usual['10/10/2026'] === '07:05', 'CLS: thực hiện time of each day\'s usual order: ' + JSON.stringify(cl.usual));
    let rd = await d.clsRead(pts[1], ['10/10/2026']);
    check(rd.results.length === 3 && rd.results[0].total === 5, 'CLS: two tests and one imaging read for 10/10');
    check(rd.results[0].wrong.map((x) => x.name).join() === 'HCT', 'CLS: a coloured value inside its range is dropped: ' + JSON.stringify(rd.results[0].wrong));
    const WANT = 'Kết quả CLS:\nCông thức máu: WBC: 11.2 G/L; HGB: 112 g/L; PCT: 0.12%\nHóa sinh máu: Glucose: 7.8 mmol/L; Kali: 3.2 mmol/L\nSiêu âm ổ bụng tổng quát: Gan nhiễm mỡ độ I';
    check(rd.text === WANT, 'CLS: red and blue values only, short names: ' + JSON.stringify(rd.text));
    rd = await d.clsRead(pts[1], ['10/10/2026', '06/10/2026']);
    check(/^Kết quả CLS:\nNgày 10\/10:\n- Công thức máu/.test(rd.text) && /\nNgày 06\/10:\n- Hóa sinh máu: Cholesterol toàn phần: 6.1 mmol\/L\n/.test(rd.text), 'CLS: several days get a heading each: ' + JSON.stringify(rd.text));
    check(/\n- Nước tiểu: Tỷ trọng >=1\.030\n/.test(rd.text) && !/Urobilinogen/.test(rd.text), 'CLS: coloured Tỷ trọng >=1.030 kept, written without a colon: ' + JSON.stringify(rd.text));
    check(/\n- Chụp X-quang khớp vai thẳng: Hình ảnh thoái hóa khớp vai$/.test(rd.text) && !/\[/.test(rd.text), 'CLS: no bracketed part after the service name');
    rd = await d.clsRead(pts[1], ['08/10/2026']);
    check(/^Kết quả CLS:\n[^\n:]+: Các chỉ số trong giới hạn bình thường$/.test(rd.text) && !/^Kết quả CLS:\nXét nghiệm/.test(rd.text) && rd.results[0].items.length === 0, 'CLS: nothing abnormal, the heading as abnormal values use: ' + JSON.stringify(rd.text));
    const { clsInRange } = require('../src/driver');
    const R = [['11.2', '4-10', false], ['0,42', '0.36 - 0.50', true], ['10', '4-10', true], ['5', '< 5', false], ['70', '≥ 60', true], ['-3', '-2 - 2', false], ['100', 'Nam: 130-170; Nữ: 120-150', false], ['160', 'Nam: 130-170; Nữ: 120-150', null], ['Âm tính', 'Âm tính', true], ['12', '', null], ['>=1.030', '1.005-1.030', null], ['3.2 µmol/L', '3.2-16 µmol/L', true]];
    for (const [v, ref, want] of R) check(clsInRange(v, ref) === want, `CLS: ${v} in "${ref}" -> ${want}`);
    before = ids(1);
    m.mock.getState().log.length = 0;
    const KHAC = '* Giải thích kết quả CLS với người bệnh và người nhà.';
    const cr = await d.clsCreate(pts[1], { thoiGian: '14:20 13/10/2026', dienBien: WANT, yLenhKhac: KHAC }, false);
    fresh = newOrders(1, before);
    check(fresh.length === 1 && cr.id === fresh[0].id && fresh[0].status === 'Mới' && fresh[0].dienBien === WANT, 'CLS: new order holds the text, left Mới');
    check(fresh[0].dateTH.getDate() === 13 && hm(fresh[0].dateTH) === '14:20' && hm(fresh[0].date) === '14:19', 'CLS: chosen date and time set');
    check(m.mock.getState().log.map((x) => x[0]).join() === 'themYLenh,benhChinhCo,luu', 'CLS: Thêm y lệnh mới, Có to the bệnh chính question, Lưu: ' + m.mock.getState().log.map((x) => x[0]).join());
    check(fresh[0].khac === KHAC, 'CLS: Y lệnh khác filled: ' + JSON.stringify(fresh[0].khac));
    check(!fresh[0].capDo, 'CLS: Cấp độ chăm sóc left empty: ' + JSON.stringify(fresh[0].capDo));
    // Words take no unit; numbers keep theirs.
    const { clsText } = require('../src/driver');
    const tx = clsText([{ kind: 'xn', date: '07:00 14/10/2026', name: 'Xét nghiệm nước tiểu', items: [{ name: 'Nitrit (NIT)', value: 'Positive ', unit: 'mg/dL', ref: 'Negative' }, { name: 'Protein (PRO)', value: 'Trace', unit: 'g/L', ref: 'Negative' }, { name: 'Tỷ trọng (SG)', value: '1.035', unit: '', ref: '1.01-1.025' }] }, { kind: 'xn', date: '07:00 14/10/2026', name: 'Xét nghiệm hóa sinh', items: [{ name: 'Glucose', value: '12.06', unit: 'mmol/L', ref: '3.9-6.4' }] }]);
    check(tx === 'Kết quả CLS:\nNước tiểu: NIT: Positive; PRO: Trace; Tỷ trọng (SG): 1.035\nHóa sinh máu: Glucose: 12.06 mmol/L', 'CLS: Positive / Trace without unit: ' + JSON.stringify(tx));
    const tn = clsText([{ kind: 'xn', date: '07:00 14/10/2026', name: 'Xét nghiệm huyết học', items: [{ name: 'WBC', value: '12', unit: 'G/L' }], total: 20 }, { kind: 'xn', date: '07:00 14/10/2026', name: 'Xét nghiệm hóa sinh', items: [], total: 8 }, { kind: 'xn', date: '07:00 14/10/2026', name: 'Xét nghiệm huyết học', items: [], total: 3 }, { kind: 'xn', date: '07:00 14/10/2026', name: 'Xét nghiệm nước tiểu', items: [], total: 0 }]);
    check(tn === 'Kết quả CLS:\nCông thức máu: WBC: 12 G/L\nHóa sinh máu: Các chỉ số trong giới hạn bình thường', 'CLS: a normal test gets its own line, not when its group has values or nothing was read: ' + JSON.stringify(tn));
    // The CLS order on 13/10 does not block copying the usual order onto that day.
    ({ source } = await d.loadPatient(pts[1]));
    before = ids(1);
    r = await d.run({ patient: pts[1], sourceId: source.id, days: 1, deletions: [[]] });
    check(r.ok && newOrders(1, before).length === 1 && source.dienBienPHCN, 'CLS: usual copy still allowed on the CLS day');

    // --- dòng thuốc/VTYT màu đỏ trên bản sao: tự xóa ở mọi ngày (0.6.0) ---
    console.log('dòng đỏ');
    m.mock.reset();
    pts = await d.scanPatients();
    m.mock.getState().redOnCopy = ['Kim châm'];
    ({ source } = await d.loadPatient(pts[1]));
    before = ids(1);
    r = await d.run({ patient: pts[1], sourceId: source.id, days: 3, deletions: [[], [], []] });
    fresh = newOrders(1, before);
    check(r.ok && fresh.length === 3 && fresh.every((o) => !names(o).some((n) => n.startsWith('Kim châm'))), 'red rows: Kim châm deleted from every day: ' + fresh.map((o) => names(o).length).join());
    check(fresh.every((o) => names(o).length === source.thuoc.length + source.dvkt.length - 1), 'red rows: nothing else deleted');
    check((r.redDeleted || []).some((n) => /Kim châm/.test(n)) && logs.some((l) => /màu đỏ/.test(l)), 'red rows: reported in the result and the log: ' + JSON.stringify(r.redDeleted) + logs.filter((l) => /đỏ|Ngày 1/.test(l)).slice(-5).join(' | '));
    const vr = await d.verify(pts[1], r.expect, r.days.map((x) => ({ day: x.day, id: x.id })));
    check(vr.days.every((x) => !x.problems.length && !x.warnings.length), 'red rows: the check finds no problem: ' + JSON.stringify(vr.days.map((x) => [x.problems, x.warnings])));
    m.mock.getState().redOnCopy = [];
    const oN = await d.openOrder(fresh[0].id);
    check(oN.thuoc.length && oN.thuoc.every((x) => !x.red), 'red rows: a normal row is not red');

    // --- Ds Điều trị nội trú from start pages without the link ---
    console.log('nút Ds');
    await page.goto(m.base + '/home.aspx?scope=sys&lang=vi');
    check((await d.where()).page === 'other', 'Ds: start page with its own tblNoiTru widget is not the list');
    await d.gotoList(true);
    check(/wpid=danhsachdieutrinoitrudraw/.test(page.url()), 'Ds: opened from the start page right after login: ' + page.url());
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
