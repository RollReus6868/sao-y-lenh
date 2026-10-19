// Demo backend for previewing the UI in a browser. Fake names only.
import { runKey, type AppState, type BenhAnDraft, type Check, type CheckDay, type ClsRead, type Data, type DvScan, type Item, type LogEntry, type Patient, type RunInfo } from './types';
import { allFields } from './benhAn';
import { DEFAULT_THUOC } from './thuoc';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ROOMS = ['Buồng 101', 'Buồng 101', 'Buồng 103', 'Buồng 103', 'Buồng 105', 'Buồng 105', 'Buồng 107'];
const NAMES = ['NGUYỄN THỊ MẪU A', 'TRẦN VĂN MẪU B', 'LÊ THỊ MẪU C', 'PHẠM VĂN MẪU D', 'HOÀNG THỊ MẪU E', 'VŨ VĂN MẪU G', 'ĐẶNG THỊ MẪU H'];
const DX = ['Tọa cốt phong [Đau dây thần kinh hông to]', 'Chứng tý [Hội chứng cổ vai cánh tay]', 'Khẩu nhãn oa tà [Liệt dây VII ngoại biên]', 'Yêu thống [Đau lưng]', 'Tý chứng [Thoái hóa khớp gối]', 'Chứng huyễn vựng [Thiểu năng tuần hoàn não]', 'Kiên thống [Viêm quanh khớp vai]'];

const patients: Patient[] = NAMES.map((n, i) => ({
  noitruid: `0000000${i}-0000-0000-0000-000000000000`,
  url: '#',
  buong: ROOMS[i],
  tgVao: `0${i + 1}:30 0${i + 1}/10/2026`,
  bg: `${ROOMS[i]} / G${i + 2}-NB`,
  maBN: `26000000${10 + i}`,
  hoTen: n,
  tuoi: String(58 + i * 3),
  gt: i % 2 ? 'Nam' : 'Nữ',
  doiTuong: 'Bảo hiểm (Đúng tuyến)',
  trangThai: 'Đang thực hiện',
  bacSi: 'BS. Nguyễn Văn Mẫu',
  chanDoan: DX[i],
  khoa: 'Khoa Nội B',
}));

const T = (name: string, hamLuong: string, dvt: string, sl: string, group = 'Thuốc Tây Y', cachDung = '', doiTuong = 'Bảo hiểm'): Item => ({
  kind: 'thuoc', id: name, key: `t|${name.toLowerCase()}|${hamLuong.toLowerCase()}#1`, canDelete: true, group, name, hamLuong, dvt, sl, cachDung, duongDung: group === 'Vật tư y tế' ? '' : 'Uống', doiTuong, trangThai: 'Mới',
});
const DOCTORS = ['BS. Nguyễn Văn Mẫu', 'BS. Trần Thị Hai', 'BS. Lê Văn Ba', 'BS. Phạm Thị Bốn', 'BS. Hoàng Văn Năm', 'BS. Vũ Thị Sáu'].map((name, i) => ({ id: `d${i + 1}`, name, login: `bs${i + 1}` }));
const CARE = [['c1', 'I', 'Cấp I'], ['c2', 'II', 'Cấp II'], ['c3', 'III-C', 'III-C']].map(([id, ma, ten]) => ({ id, ma, ten, text: `(${ma}) ${ten}` }));
const D = (name: string, moTa: string, group: string): Item => ({
  kind: 'dvkt', id: name, key: `d|${name.toLowerCase()}|${moTa.toLowerCase()}#1`, canDelete: true, group, name, moTa, sl: '1', doiTuong: 'Bảo hiểm', trangThai: 'Mới',
});

const source = {
  id: 'src', status: 'Hoàn tất', info: 'Ngày điều trị thứ 6', thoiGian: '07:04 13/10/2026', thoiGianThucHien: '07:05 13/10/2026',
  bacSi: { id: 'd1', text: 'BS. Nguyễn Văn Mẫu' }, capDo: { id: 'c3', text: '(III-C) III-C' },
  dienBien: 'Bệnh nhân tỉnh, tiếp xúc tốt. Đau vùng thắt lưng lan xuống mông chân 2 bên, giảm so với hôm qua.',
  dienBienPHCN: 'Cột sống thắt lưng giảm đường cong sinh lý, co cứng cơ cạnh sống.',
  thuoc: [
    T('Renaxib 200', '200mg', 'Viên', '1', 'Thuốc Tây Y', 'Uống 1 viên/lần, sáng sau ăn'),
    T('HOẠT HUYẾT KHỨ Ứ ẨM', '6000mg+6000mg', 'Túi', '2', 'Thuốc Tây Y', 'Uống 1 túi/lần x 2 lần/ngày'),
    T('Lirystad 150', '150mg', 'Viên', '1', 'Thuốc Tây Y', 'Uống 1 viên tối sau ăn'),
    T('Kim châm cứu tiệt trùng dùng một lần', '', 'Cái', '20', 'Vật tư y tế', '', 'Hao phí'),
    T('Bông y tế thấm nước', '', 'Gói', '1', 'Vật tư y tế', '', 'Bảo hiểm'),
    T('Nhang ngải cứu', '', 'Cái', '1', 'Vật tư y tế', '', 'Hao phí'),
  ],
  dvkt: [
    D('Giác hơi điều trị các chứng đau', 'Vùng thắt lưng, giác chân không. Ngày 01 lần x 15 phút', 'Y học dân tộc - Phục hồi chức năng'),
    D('Điện châm [kim ngắn]', 'Châm tả: A thị huyệt, Giáp tích L4-L5. Ngày 01 lần x 30 phút', 'Y học dân tộc - Phục hồi chức năng'),
    D('Kỹ thuật xoa bóp vùng', 'Vùng thắt lưng và mông chân 2 bên. Ngày 01 lần x 15 phút', 'Phục hồi chức năng'),
    D('Điều trị bằng các dòng điện xung', 'Vùng mông đùi T, ngày 01 lần x 20 phút', 'Phục hồi chức năng'),
    D('Điều trị bằng siêu âm', 'Vùng cơ cạnh sống thắt lưng 2 bên. Ngày 01 lần x 15 phút', 'Phục hồi chức năng'),
  ],
  saoYLenh: { value: '0', options: ['0', '1', '2', '3'].map((v) => ({ value: v, text: v })) },
  hinhThucSao: { value: '', options: [{ value: '1', text: 'Sao thuốc dự trù và dịch vụ' }] },
};

// What a read-back after a 3-day run looks like; day 2 shows a leftover to flag.
function demoCheck(deletions: string[][]): Check {
  const all = [...source.thuoc, ...source.dvkt];
  const days: CheckDay[] = deletions.map((del, i) => {
    const keep = all.filter((it) => !del.includes(it.key) || (i === 1 && it.name === 'Lirystad 150'));
    const strip = (it: Item) => ({ ...it, base: it.key.replace(/#\d+$/, '') });
    return {
      day: i + 1, id: `new${i}`, tg: `07:04 ${14 + i}/10/2026`, status: 'Hoàn tất', thoiGian: `07:04 ${14 + i}/10/2026`, thoiGianThucHien: `07:05 ${14 + i}/10/2026`,
      dienBien: source.dienBien, dienBienPHCN: source.dienBienPHCN, bacSi: source.bacSi, capDo: source.capDo,
      thuoc: keep.filter((x) => x.kind === 'thuoc').map(strip), dvkt: keep.filter((x) => x.kind === 'dvkt').map(strip),
      removed: all.filter((it) => del.includes(it.key)).map((it) => it.name),
      problems: i === 1 && del.some((k) => k.startsWith('t|lirystad')) ? ['"Lirystad 150" vẫn còn, cần xóa'] : [],
      warnings: [],
    };
  });
  return { at: Date.now(), ok: !days.some((d) => d.problems.length), days };
}

const q0 = new URLSearchParams(location.search);

// A made-up filled example (no real patient) so the Bệnh án tab can be shown.
function demoMau() {
  const v: Record<string, string | boolean | string[]> = {};
  for (const f of allFields) {
    if (f.kind === 'textarea') v[f.id] = f.id === 'txtLyDoVaoVien' ? 'Đau vùng thắt lưng lan xuống chân' : f.id === 'txtBenhSu' ? 'Bệnh khởi phát 1 tuần nay, đau tăng khi vận động.' : '';
    else if (f.kind === 'radio') v[f.id] = f.options?.[1]?.value || '';
    else if (f.kind === 'multi') v[f.id] = (f.options || []).slice(0, 1).map((o) => o.value);
    else if (f.kind === 'check') v[f.id] = false;
    else v[f.id] = '';
  }
  return v;
}

export function demoApi() {
  const data: Data = {
    settings: { baseUrl: 'http://192.168.30.19:2026/', autoComplete: true, stepMode: false, hinhThuc: '1', defaultDays: 3, bacSiFav: DOCTORS.slice(0, 3).map(({ id, name }) => ({ id, name })), esBase: '', gpuOff: true, themThuoc: DEFAULT_THUOC },
    lists: { at: Date.now(), bacSi: DOCTORS, capDo: CARE },
    benhAn: {},
    benhAnMaus: q0.get('nomau') ? [] : [
      { id: 'm1', name: 'Mẫu Tọa cốt phong', at: Date.now(), values: demoMau() },
      { id: 'm2', name: 'Mẫu Yêu thống', at: Date.now() - 86400000, values: { ...demoMau(), txtLyDoVaoVien: 'Đau vùng thắt lưng' } },
    ],
    benhAnMauId: q0.get('nomau') ? null : 'm1',
    templates: [
      { id: 'a', name: 'Bỏ điện xung', keys: ['d|điều trị bằng các dòng điện xung|vùng mông đùi t, ngày 01 lần x 20 phút'] },
      { id: 'b', name: 'Chỉ giữ thuốc', keys: source.dvkt.map((x) => x.key.replace(/#\d+$/, '')) },
    ],
    choices: { [patients[1].noitruid]: { days: 3, deletions: [[], [], []] } },
    runs: { [patients[2].noitruid]: { at: Date.now(), ok: true, message: '3 ngày' }, [patients[4].noitruid]: { at: Date.now(), ok: false, message: 'OneMES báo: Chưa chọn loại phiếu lĩnh' } },
  };
  let state: AppState = { busy: false, task: '', stepWaiting: null, progress: null, viewUrl: 'http://192.168.30.19:2026/home.aspx', viewZoom: 0.7, update: null };
  const stateCbs: ((s: AppState) => void)[] = [];
  const logCbs: ((e: LogEntry) => void)[] = [];
  const log: LogEntry[] = [
    { at: Date.now() - 60000, level: 'info', msg: 'Sao Y Lệnh khởi động' },
    { at: Date.now() - 50000, level: 'info', msg: 'Quét được 7 bệnh nhân' },
    { at: Date.now() - 40000, level: 'ok', msg: 'Ngày 2: đã xóa "Lirystad 150"' },
    { at: Date.now() - 30000, level: 'warn', msg: 'Ngày 3: không thấy "nhang ngải cứu", bỏ qua' },
    { at: Date.now() - 20000, level: 'error', msg: 'HOÀNG THỊ MẪU E: OneMES báo: Chưa chọn loại phiếu lĩnh' },
  ];
  const pushState = (s: Partial<AppState>) => { state = { ...state, ...s }; stateCbs.forEach((c) => c(state)); };
  const addLog = (level: LogEntry['level'], msg: string) => { const e = { at: Date.now(), level, msg }; log.push(e); logCbs.forEach((c) => c(e)); };
  const q = new URLSearchParams(location.search);
  if (q.get('update')) pushState({ update: { version: '0.2.0', kind: 'installer', url: '#' } });

  return {
    async call<T>(cmd: string, payload?: any): Promise<T> {
      switch (cmd) {
        case 'init': return { version: '0.3.0', platform: 'win32', data, state, log, logDir: '', gpuOff: true } as T;
        case 'lists:load': return data.lists as T;
        case 'benhAn:set': data.benhAn[payload.id] = { ...(data.benhAn[payload.id] || {}), values: payload.values, savedAt: Date.now() }; return data.benhAn[payload.id] as T;
        case 'mau:save': case 'mau:rename': case 'mau:delete': case 'mau:default': {
          let list = data.benhAnMaus.slice();
          let id: string | undefined = payload.id;
          const old = list.find((x) => x.id === id);
          if (cmd === 'mau:save') {
            if (old) list = list.map((x) => (x.id === id ? { ...x, name: payload.name?.trim() || x.name, values: payload.values || x.values, at: Date.now() } : x));
            else { id = 'm' + Date.now(); list.push({ id, name: payload.name?.trim() || `Mẫu ${list.length + 1}`, values: payload.values || {}, at: Date.now() }); if (!data.benhAnMauId) data.benhAnMauId = id; }
            if (payload.makeDefault) data.benhAnMauId = id!;
          } else if (cmd === 'mau:rename') list = list.map((x) => (x.id === id && payload.name?.trim() ? { ...x, name: payload.name.trim() } : x));
          else if (cmd === 'mau:delete') { list = list.filter((x) => x.id !== id); if (data.benhAnMauId === id) data.benhAnMauId = list[0]?.id || null; }
          else if (old) data.benhAnMauId = id!;
          data.benhAnMaus = list;
          return { benhAnMaus: list, benhAnMauId: data.benhAnMauId, id } as T;
        }
        case 'benhAn:read':
        case 'benhAn:save': {
          const task = cmd === 'benhAn:read' ? 'Đọc bệnh án' : 'Ghi bệnh án';
          pushState({ busy: true, task }); await sleep(900); pushState({ busy: false, task: '' });
          const id = payload.patient.noitruid;
          const values = cmd === 'benhAn:save' ? payload.values : data.benhAn[id]?.values || demoMau();
          const d: BenhAnDraft = { values, readAt: Date.now(), savedAt: Date.now(), ...(cmd === 'benhAn:save' ? { sentAt: Date.now(), diff: [], missing: [], kept: ['txtLyDoVaoVien'], filled: Object.keys(values).slice(0, 40) } : {}) };
          data.benhAn[id] = d;
          return d as T;
        }
        case 'order:update': {
          pushState({ busy: true, task: 'Sửa y lệnh' }); await sleep(900); pushState({ busy: false, task: '' });
          const r: RunInfo = data.runs[runKey(payload.patient, payload.kind)];
          const e = payload.edit || {};
          const gone: string[] = (payload.remove || []).map((x: { id: string }) => x.id);
          r.check = { ...r.check!, days: r.check!.days.map((d) => d.id !== payload.id ? d : {
            ...d, problems: [],
            thoiGianThucHien: e.gio ? `${e.gio} ${d.thoiGianThucHien!.slice(6)}` : d.thoiGianThucHien,
            dienBien: e.dienBien ?? d.dienBien, dienBienPHCN: e.dienBienPHCN ?? d.dienBienPHCN, bacSi: e.bacSi ?? d.bacSi, capDo: e.capDo ?? d.capDo,
            thuoc: d.thuoc!.filter((x) => !gone.includes(x.id)), dvkt: d.dvkt!.filter((x) => !gone.includes(x.id)),
          }) };
          return { ...r } as T;
        }
        case 'settings:set': data.settings = { ...data.settings, ...payload }; return data.settings as T;
        case 'login:set': data.login = { user: payload.user, saved: true, failed: '' }; pushState({ login: data.login }); return data.login as T;
        case 'login:clear': data.login = { user: '', saved: false, failed: '' }; pushState({ login: data.login }); return data.login as T;
        case 'login:now': return { ok: true, already: true } as T;
        case 'templates:set': data.templates = payload; return data.templates as T;
        case 'choice:set': if (payload.choice) data.choices[payload.id] = payload.choice; else delete data.choices[payload.id]; return undefined as T;
        case 'scan': pushState({ busy: true, task: 'Quét danh sách' }); await sleep(500); pushState({ busy: false, task: '' }); addLog('info', `Quét được ${patients.length} bệnh nhân`); return patients as T;
        case 'patient:load': pushState({ busy: true, task: 'Đọc y lệnh' }); await sleep(400); pushState({ busy: false, task: '' });
          if (q.get('edits') && !data.choices[payload.patient.noitruid]) data.choices[payload.patient.noitruid] = { days: 3, deletions: [[], [], []], edits: [{ gio: '07:30', bacSi: { id: 'd2', text: 'BS. Trần Thị Hai' } }, null, { dienBien: 'Đỡ đau nhiều, ngủ được.' }] };
          if (payload.kind === 'sac') {
            const sac = { ...source, id: 'sac', thoiGian: '15:00 12/10/2026', thoiGianThucHien: '07:30 13/10/2026', dienBien: 'Chỉ định sắc thuốc thang', dienBienPHCN: '', thuoc: [T('Thang thuốc mẫu', '', 'Thang', '1', 'Thuốc Đông Y', 'Sắc uống ngày 1 thang')], dvkt: [D('Sắc thuốc thang', '1 thang/ngày', 'Y học dân tộc')] };
            // Usual orders already copied for 14/10, none yet for 15/10.
            const usual = (tg: string, tgth: string, bacSi: string) => ({ id: 'u' + tgth, tg, tgth, bacSi, dienBien: source.dienBien, dienBienPHCN: source.dienBienPHCN, khac: '' });
            return { rows: [usual('07:09 14/10/2026', '07:10 14/10/2026', 'BS. Trần Thị Hai'), { id: 'sac', tg: sac.thoiGian, tgth: sac.thoiGianThucHien, bacSi: 'BS. Nguyễn Văn Mẫu', dienBien: sac.dienBien, dienBienPHCN: '', khac: 'Chỉ định Sắc thuốc thang' }, usual('07:04 13/10/2026', '07:05 13/10/2026', 'BS. Lê Văn Ba')], source: sac, skipped: [] } as T;
          }
          // Cao thông mạch was on 11/10, so day 1 (14/10) is ticked by the tool.
          const auto = { adds: [['cao-thong-mach'], [], [], []], why: [{ day: 1, id: 'cao-thong-mach', from: '11/10' }], for: source.id };
          return { auto, rows: [{ id: 'src', tg: '07:04 13/10/2026', tgth: '07:05 13/10/2026', bacSi: 'BS. Nguyễn Văn Mẫu', dienBien: source.dienBien, dienBienPHCN: source.dienBienPHCN, khac: '' }, { id: 'old', tg: '07:04 12/10/2026', tgth: '07:05 12/10/2026', bacSi: 'BS. Nguyễn Văn Mẫu', dienBien: source.dienBien, dienBienPHCN: source.dienBienPHCN, khac: '' }], source, skipped: [] } as T;
        case 'run': {
          pushState({ busy: true, task: 'Sao chép y lệnh', progress: { patient: payload.plans[0].patient.hoTen, index: 0, total: payload.plans.length } });
          if (q.get('step')) { pushState({ stepWaiting: 'Ngày 2: xóa "Lirystad 150"' }); return new Promise(() => {}) as Promise<T>; }
          await sleep(1500); addLog('ok', 'Xong'); pushState({ busy: false, task: '', progress: null });
          return payload.plans.map((p: any) => {
            const dels: string[][] = p.deletions || Array.from({ length: p.days }, () => []);
            const check = demoCheck(dels);
            data.runs[runKey(p.patient, p.kind)] = { at: Date.now(), ok: true, message: `${p.days} ngày`, days: check.days.map((d) => ({ day: d.day, id: d.id, time: d.tg })), check };
            return { noitruid: p.patient.noitruid, ok: true, check, ...(p.kind !== 'sac' ? { sac: { ok: true, days: p.days } } : {}) };
          }) as T;
        }
        case 'patient:check': {
          pushState({ busy: true, task: 'Kiểm tra lại' }); await sleep(800); pushState({ busy: false, task: '' });
          const r = data.runs[runKey(payload.patient, payload.kind)];
          r.check = { ...r.check!, at: Date.now() };
          return { ...r } as T;
        }
        case 'order:delete': {
          pushState({ busy: true, task: 'Xóa y lệnh' }); await sleep(800); pushState({ busy: false, task: '' });
          const r: RunInfo = data.runs[runKey(payload.patient, payload.kind)];
          r.days = r.days!.map((d) => (d.id === payload.id ? { ...d, deleted: true } : d));
          r.check = { ...r.check!, days: r.check!.days.map((d) => (d.id === payload.id ? { ...d, deleted: true } : d)) };
          addLog('ok', `Đã xóa y lệnh ${payload.id}`);
          return { ...r } as T;
        }
        case 'dvkt:scan': {
          pushState({ busy: true, task: 'Quét thủ thuật cũ' }); await sleep(700); pushState({ busy: false, task: '' });
          const id = payload.patient.noitruid;
          const it = (n: string, moTa: string, action: 'xoa' | 'thuhoi') => ({ id: n + id, name: n, moTa, trangThai: action === 'xoa' ? 'Hoàn trả' : 'Chờ thực hiện', action });
          const r: DvScan = data.dvScans?.[id]?.at && data.dvScans[id].days.every((d) => !d.items.length) ? data.dvScans[id] : { at: Date.now(), days: [
            { id: 'o1', tg: '07:04 09/10/2026', status: 'Hoàn tất', other: 3, items: [it('Giác hơi điều trị các chứng đau', 'Vùng thắt lưng. Ngày 01 lần x 15 phút', 'xoa'), it('Điện châm [kim ngắn]', 'Châm tả: A thị huyệt. Ngày 01 lần x 30 phút', 'thuhoi')] },
            { id: 'o2', tg: '07:04 10/10/2026', status: 'Hoàn tất', other: 4, items: [it('Kỹ thuật xoa bóp vùng', 'Vùng thắt lưng và mông chân 2 bên', 'thuhoi')] },
          ] };
          data.dvScans = { ...(data.dvScans || {}), [id]: r };
          return r as T;
        }
        case 'dvkt:clean': {
          pushState({ busy: true, task: 'Dọn thủ thuật' }); await sleep(1200); pushState({ busy: false, task: '' });
          const id = payload.patient.noitruid;
          const gone = new Set(payload.days.flatMap((d: { items: string[] }) => d.items));
          const old = data.dvScans![id];
          data.dvScans = { ...data.dvScans, [id]: { at: Date.now(), days: old.days.map((d) => ({ ...d, items: d.items.filter((x) => !gone.has(x.id)) })).filter((d) => d.items.length) } };
          addLog('ok', `Đã dọn ${gone.size} thủ thuật`);
          return { result: [], deleted: gone.size, dvScans: data.dvScans } as T;
        }
        case 'cls:list': pushState({ busy: true, task: 'Đọc kết quả CLS' }); await sleep(600); pushState({ busy: false, task: '' });
          return { dates: ['10/10/2026', '06/10/2026'], rows: [
            { kind: 'xn', idx: 0, date: '07:30 10/10/2026', name: 'Xét nghiệm huyết học', status: 'Hoàn tất' }, { kind: 'xn', idx: 1, date: '07:30 10/10/2026', name: 'Xét nghiệm hóa sinh', status: 'Hoàn tất' },
            { kind: 'xn', idx: 2, date: '08:00 06/10/2026', name: 'Xét nghiệm hóa sinh', status: 'Hoàn tất' }, { kind: 'cdha', idx: 0, date: '09:00 10/10/2026', name: 'Siêu âm ổ bụng tổng quát', status: '' },
          ], usual: Object.fromEntries([0, 1, 2, 3].map((i) => { const x = new Date(Date.now() - i * 864e5); return [`${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`, '07:08']; })), at: Date.now() } as T;
        case 'cls:read': {
          pushState({ busy: true, task: 'Đọc kết quả CLS' }); await sleep(900); pushState({ busy: false, task: '' });
          const r: ClsRead = { at: Date.now(), results: [
            { kind: 'xn', date: '07:30 10/10/2026', name: 'Xét nghiệm huyết học', total: 18, items: [{ name: 'WBC', value: '11.2', unit: 'G/L', ref: '4-10', flag: 'red' }, { name: 'HGB', value: '112', unit: 'g/L', ref: '120-170', flag: 'blue' }], wrong: [{ name: 'HCT', value: '0.42', unit: 'L/L', ref: '0.36 - 0.50' }] },
            { kind: 'xn', date: '07:30 10/10/2026', name: 'Xét nghiệm hóa sinh', total: 6, items: [{ name: 'Glucose', value: '7.8', unit: 'mmol/L', ref: '3.9-6.4', flag: 'red' }] },
            { kind: 'cdha', date: '09:00 10/10/2026', name: 'Siêu âm ổ bụng tổng quát', ketLuan: 'Gan nhiễm mỡ độ I' },
          ], text: 'Kết quả CLS:\nCông thức máu: WBC: 11.2 G/L; HGB: 112 g/L\nHóa sinh máu: Glucose: 7.8 mmol/L\nSiêu âm ổ bụng tổng quát: Gan nhiễm mỡ độ I' };
          return r as T;
        }
        case 'cls:create': pushState({ busy: true, task: 'Tạo y lệnh kết quả CLS' }); await sleep(900); pushState({ busy: false, task: '' });
          return { id: 'new', thoiGian: payload.thoiGian } as T;
        case 'view:zoom': {
          const z = Math.min(2, Math.max(0.3, Math.round((Number(payload?.zoom) || 0.7) * 20) / 20));
          pushState({ viewZoom: z });
          return z as T;
        }
        case 'view:nav':
          if (payload?.action === 'list' && q.get('navfail')) throw new Error('Hãy đăng nhập OneMES trước');
          return undefined as T;
        default: return undefined as T;
      }
    },
    onState: (cb: (s: AppState) => void) => { stateCbs.push(cb); return () => {}; },
    onLog: (cb: (e: LogEntry) => void) => { logCbs.push(cb); return () => {}; },
  };
}
