// Bệnh án templates in the store: the old single template migrates into the list,
// and add / overwrite / rename / default / delete keep the list consistent.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/store');

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syl-store-'));
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ benhAnMau: { name: 'Cũ', values: { a: 'x' }, at: 1 } }));
let s = createStore(dir);
check(s.get().benhAnMaus.length === 1 && s.get().benhAnMaus[0].name === 'Cũ' && s.get().benhAnMauId === s.get().benhAnMaus[0].id, 'old template migrated and starred');
check(!('benhAnMau' in s.get()), 'old key removed');

let r = s.saveMau({ name: 'Mới', values: { a: 'y' } });
check(r.benhAnMaus.length === 2 && r.id && r.benhAnMauId === 'mau-1', 'add keeps the star');
const second = r.id;
r = s.saveMau({ id: second, values: { a: 'z' }, makeDefault: true });
check(r.benhAnMaus.length === 2 && r.benhAnMaus[1].values.a === 'z' && r.benhAnMaus[1].name === 'Mới' && r.benhAnMauId === second, 'overwrite keeps name, makes default');
r = s.renameMau(second, '  Tên khác ');
check(r.benhAnMaus[1].name === 'Tên khác', 'rename');
r = s.defaultMau('mau-1');
check(r.benhAnMauId === 'mau-1', 'set default');
r = s.deleteMau('mau-1');
check(r.benhAnMaus.length === 1 && r.benhAnMauId === second, 'delete starred moves star to the next');

s = createStore(dir);
check(s.get().benhAnMaus.length === 1 && s.get().benhAnMauId === second, 'list survives reload');
r = s.deleteMau(second);
check(!r.benhAnMaus.length && r.benhAnMauId === null, 'delete last leaves none');

// 0.5.0: Thêm thuốc lists saved before get the Tự tick sau numbers for the two defaults.
const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'syl-store-'));
fs.writeFileSync(path.join(dir2, 'data.json'), JSON.stringify({ settings: { themThuoc: [{ id: 'con-xoa-bop', label: 'Cồn' }, { id: 'cao-thong-mach', label: 'Cao' }, { id: 't1', label: 'Khác' }, { id: 't2', label: 'Đã đặt', tuTick: '7' }] } }));
const t = createStore(dir2).get().settings.themThuoc;
check(t.map((x) => x.tuTick).join() === '5,3,,7', 'themThuoc: tuTick filled for the defaults only: ' + t.map((x) => x.tuTick).join());
check(createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'syl-store-'))).get().settings.themThuoc.map((x) => x.tuTick).join() === '5,3', 'themThuoc: fresh defaults carry tuTick');
fs.rmSync(dir2, { recursive: true, force: true });
fs.rmSync(dir, { recursive: true, force: true });
console.log(failed ? `${failed} failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
