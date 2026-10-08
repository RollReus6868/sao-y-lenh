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
    const pts = await d.scanPatients();
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
    check(!m.mock.getState().log.some((x) => x[0] === 'thuHoi'), 'no Thu hồi needed');

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
    check(m.mock.getState().log.filter((x) => x[0] === 'thuHoi').length === 1, 'one Thu hồi on day 1');

    // --- autoComplete off ---
    console.log('không tự hoàn tất');
    ({ source } = await d.loadPatient(pts[1]));
    before = ids(1);
    r = await d.run({ patient: pts[1], sourceId: source.id, days: 2, deletions: [[], [L]], autoComplete: false });
    fresh = newOrders(1, before);
    check(fresh[0].status === 'Hoàn tất' && fresh[1].status === 'Mới', 'day 1 completed (needed for copies), day 2 left Mới');

    // --- Stop ---
    console.log('dừng');
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
  } catch (e) {
    console.log('ERROR', e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await m.close();
  }
  done();
})();
