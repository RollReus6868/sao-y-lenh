// Y lệnh mẫu (0.7.0): an order page of OneMES saved as HTML (Ctrl+S with the order open),
// read into an example the tool can edit and create new orders from. The tables are read
// the way the page agent reads a live order (header names, rows by id); the form fields
// come from the order form, and from its row in Lịch sử y lệnh when the saved file lost
// what the page's scripts had typed in. Services (DVKT) are left out: the user does not
// want them in orders made from an example (2026-11-14).
import type { MauThuoc, Picked, YLenhMau } from './types';

const norm = (s: string | null | undefined) => (s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
const txt = (el: Element | null | undefined) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');
const uid = () => Math.random().toString(36).slice(2, 10);

function headerCols(tbl: Element | null) {
  const cols: string[] = [];
  const tr = tbl?.querySelector('tr');
  if (!tr) return cols;
  for (const th of Array.from(tr.children)) {
    const span = parseInt(th.getAttribute('colspan') || '1', 10) || 1;
    for (let i = 0; i < span; i++) cols.push(i === 0 ? norm(th.textContent) : '');
  }
  return cols;
}

/** Rows of a table drawn in groups: the item rows, each with the cells of its own row. */
function itemRows(tbl: Element | null, rowSelector: string) {
  if (!tbl) return [] as HTMLTableCellElement[][];
  return Array.from(tbl.querySelectorAll('tr'))
    .filter((tr) => tr.closest('table') === tbl && !tr.querySelector('th') && tr.matches(rowSelector))
    .map((tr) => Array.from(tr.children).filter((x): x is HTMLTableCellElement => x.tagName === 'TD'));
}

/** "Loại kê" of the order list to the Kê đơn choice; only Tủ trực differs from the default. */
export const loaiOf = (s: string) => (/tủ trực/i.test(s) ? 'TỦ TRỰC' : 'KÊ LĨNH');

function readThuoc(doc: Document): MauThuoc[] {
  // The Kê đơn popup has its own #tblThuoc; the order's table is the one in .divThuocVTYT.
  const tbl = doc.querySelector('.divThuocVTYT #tblThuoc') || doc.querySelector('#tblThuoc');
  const heads = headerCols(tbl);
  const col = (n: string) => heads.findIndex((h) => h && h.startsWith(norm(n)));
  const c = { loai: col('Loại kê'), kho: col('Tên kho'), ten: col('Tên dược'), hamLuong: col('Hàm lượng'), dvt: col('ĐVT'), sl: col('SL'), cachDung: col('Cách dùng'), doiTuong: col('Đối tượng') };
  if (c.ten < 0) return [];
  return itemRows(tbl, 'tr[id^="td"]').map((tds) => {
    const g = (k: keyof typeof c) => (c[k] >= 0 ? txt(tds[c[k]]) : '');
    const dt = g('doiTuong');
    return {
      id: uid(),
      ten: g('ten'),
      hamLuong: g('hamLuong'),
      dvt: g('dvt'),
      kho: g('kho'),
      loai: loaiOf(g('loai')),
      sl: g('sl') || '1',
      cachDung: g('cachDung'),
      haoPhi: /hao phí/i.test(dt),
      tuTra: /tự trả/i.test(dt),
    };
  }).filter((x) => x.ten);
}

/** The order's row in Lịch sử y lệnh (TG Y lệnh = the form's Thời gian chỉ định). */
function historyRow(doc: Document, tg: string) {
  const th = Array.from(doc.querySelectorAll('th')).find((x) => norm(x.textContent) === norm('Diễn biến PHCN'));
  const tbl = th?.closest('table');
  if (!tbl) return null;
  const heads = Array.from(tbl.querySelectorAll('tr th')).map((x) => norm(x.textContent));
  const col = (n: string) => heads.indexOf(norm(n));
  const c = { tg: col('TG Y lệnh'), tgth: col('TGTH Y lệnh'), bacSi: col('Bác sĩ'), db: col('Diễn biến bệnh'), dbp: col('Diễn biến PHCN'), khac: col('Y lệnh khác'), cdcs: col('CĐ CS') };
  const full = (td?: Element) => {
    if (!td) return '';
    const a = td.querySelector('[data-content]');
    return ((a && a.getAttribute('data-content')) || td.textContent || '').trim();
  };
  const rows = Array.from(tbl.querySelectorAll('tr[id^="tr"]')).map((tr) => Array.from(tr.children).filter((x) => x.tagName === 'TD'));
  const hits = rows.filter((tds) => c.tg >= 0 && txt(tds[c.tg]) === tg.trim());
  if (!hits.length) return null;
  const hit = hits[0];
  const g = (k: keyof typeof c) => (c[k] >= 0 ? hit[c[k]] : undefined);
  return { many: hits.length, tg: tg.trim(), tgth: txt(g('tgth')), bacSi: txt(g('bacSi')), dienBien: full(g('db')), dienBienPHCN: full(g('dbp')), khac: full(g('khac')), cdcs: txt(g('cdcs')) };
}

/** Thời gian chỉ định on the order's service rows: the most common one. */
function dvTime(doc: Document) {
  const tbl = doc.querySelector('#tblDichVu');
  const col = headerCols(tbl).findIndex((h) => h && h.startsWith(norm('Thời gian chỉ định')));
  if (!tbl || col < 0) return '';
  const n = new Map<string, number>();
  for (const tr of Array.from(tbl.querySelectorAll('tr'))) {
    if (tr.closest('table') !== tbl || !/^[0-9a-f-]{36}$/i.test(tr.id)) continue;
    const t = txt(Array.from(tr.children).filter((x) => x.tagName === 'TD')[col]);
    if (/\d{1,2}:\d{2} \d{1,2}\/\d{1,2}\/\d{4}/.test(t)) n.set(t, (n.get(t) || 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

function field(doc: Document, id: string) {
  const el = doc.getElementById(id);
  if (!el) return '';
  if (el.tagName === 'TEXTAREA') return el.textContent || el.getAttribute('value') || '';
  return el.getAttribute('value') || el.getAttribute('data-value') || '';
}

function picked(doc: Document, id: string): Picked | null {
  const s = doc.getElementById(id);
  if (!s) return null;
  const opts = Array.from(s.querySelectorAll('option'));
  const o = opts.find((x) => x.hasAttribute('selected') && x.getAttribute('value')) || (opts.length === 1 && opts[0].getAttribute('value') ? opts[0] : null);
  if (o) return { id: o.getAttribute('value') || '', text: txt(o) };
  return null;
}
/** What select2 shows for a box when its option was not saved. */
function shownText(doc: Document, id: string) {
  const r = doc.querySelector(`#select2-${id}-container`) || doc.getElementById(id)?.parentElement?.querySelector('.select2-selection__rendered');
  return r ? (r.getAttribute('title') || txt(r)).replace(/^×\s*/, '').trim() : '';
}

const hhmm = (s: string) => (/(\d{1,2}):(\d{2})/.exec(s || '') || []).slice(1).map((x) => x.padStart(2, '0')).join(':');

/** Reads one saved order page; throws a readable error when it holds no order. */
export function mauFromHtml(html: string, name: string): YLenhMau {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const hasForm = !!doc.getElementById('txtDienBienYLenhThamKham') || !!doc.getElementById('txtThoigianThamKham');
  const thuoc = readThuoc(doc);
  if (!hasForm && !thuoc.length) throw new Error('File này không phải trang y lệnh của OneMES (không thấy khung y lệnh đang mở)');
  // A saved page keeps in the form's value the time the form was first drawn (when the
  // page was opened), not the order's: OneMES types the order's values in by script, and
  // saving keeps neither those nor the notes. The order is found in Lịch sử y lệnh by the
  // time on its service rows (drawn by the server), else the form's data-value, else its
  // value, and its notes are taken from that row.
  // 0.7.1: an order without services has no service rows; then the form's data-value
  // holds the order's time (files of 2026-11-14) while value holds when the page opened.
  const tgEl = doc.getElementById('txtThoigianThamKham');
  const formTg = (tgEl?.getAttribute('data-value') || tgEl?.getAttribute('value') || '').trim();
  const dvTg = dvTime(doc);
  const tries = [dvTg, tgEl?.getAttribute('data-value'), tgEl?.getAttribute('value')].map((x) => (x || '').trim()).filter(Boolean);
  let row: ReturnType<typeof historyRow> = null;
  for (const t of tries) if ((row = historyRow(doc, t))) break;
  const pick = (id: string, fromRow?: string) => field(doc, id).trim() || (fromRow || '').trim();
  const fromForm = (id: string) => (row ? '' : field(doc, id).trim());
  const bacSi = picked(doc, 'cboBacSiThamKham');
  const capDo = picked(doc, 'cboCapDoChamSocThamKham');
  const notes: string[] = [];
  if (!row) notes.push('Không tìm thấy y lệnh này trong Lịch sử y lệnh của file (hãy lưu trang khi danh sách y lệnh đang hiện), nên diễn biến và giờ có thể trống hoặc sai: hãy kiểm tra.');
  else if (row.many > 1) notes.push(`Lịch sử y lệnh có ${row.many} y lệnh cùng giờ ${row.tg}; tool lấy diễn biến của y lệnh đầu tiên, hãy kiểm tra.`);
  return {
    id: 'yl-' + Date.now().toString(36) + uid().slice(0, 4),
    name,
    file: name,
    at: Date.now(),
    gio: hhmm(row ? row.tgth || row.tg : '') || hhmm(fromForm('txtThoigianThucHienThamKham')) || hhmm(dvTg || formTg),
    dienBien: pick('txtDienBienYLenhThamKham', row?.dienBien),
    dienBienPHCN: pick('txtDienBienPHCNThamKham', row?.dienBienPHCN),
    yLenhKhac: pick('txtYLenhKhacThamKham', row?.khac),
    bacSi,
    bacSiTen: bacSi ? bacSi.text : shownText(doc, 'cboBacSiThamKham') || row?.bacSi || '',
    capDo,
    capDoTen: capDo ? capDo.text : shownText(doc, 'cboCapDoChamSocThamKham') || row?.cdcs || '',
    note: notes.join(' '),
    rowBacSi: row?.bacSi || '',
    thuoc,
  };
}

export async function mauFromFile(file: File) {
  return mauFromHtml(await file.text(), file.name.replace(/\.html?$/i, ''));
}
