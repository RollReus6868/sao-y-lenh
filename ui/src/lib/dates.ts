// OneMES writes times as "HH:mm dd/MM/yyyy".
export const parseTime = (s?: string) => {
  const m = /(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || '');
  return m ? new Date(+m[5], +m[4] - 1, +m[3], +m[1], +m[2]) : null;
};
export const parseDay = (s?: string) => {
  const d = parseTime(s);
  return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
};
const p2 = (n: number) => String(n).padStart(2, '0');
export const ddmm = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
export const hhmmOf = (s?: string) => (/^(\d{1,2}):(\d{2})/.exec(s || '') || []).slice(1, 3).map((x) => p2(+x)).join(':');
export const weekdayShort = (d: Date) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
export const weekdayLong = (d: Date) => ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][d.getDay()];
/** "Thứ 3 14/10" */
export const dayLabel = (d: Date | null) => (d ? `${weekdayLong(d)} ${ddmm(d)}` : '');
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** One minute before "HH:mm" (Thời gian chỉ định from Thời gian thực hiện). */
export const minuteBefore = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return '';
  const t = (+m[1] * 60 + +m[2] + 1439) % 1440;
  return `${p2(Math.floor(t / 60))}:${p2(t % 60)}`;
};
