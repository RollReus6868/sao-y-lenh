export interface Patient {
  noitruid: string; url: string; buong: string; tgVao: string; bg: string; maBN: string; hoTen: string;
  tuoi: string; gt: string; doiTuong: string; trangThai: string; bacSi: string; chanDoan: string; khoa: string;
}
export interface OrderRow { id: string; tg: string; tgth: string; bacSi: string; dienBien: string; dienBienPHCN: string; khac: string }
export interface Item {
  kind: 'thuoc' | 'dvkt'; id: string; key: string; canDelete: boolean; group: string; name: string;
  hamLuong?: string; dvt?: string; duongDung?: string; sl: string; cachDung?: string; moTa?: string; kho?: string; loaiKe?: string;
  doiTuong: string; trangThai: string;
}
export interface SelectInfo { value: string; options: { value: string; text: string }[] }
export interface Picked { id: string; text: string }
export interface Order {
  id: string; status: string; info: string; thoiGian: string; thoiGianThucHien?: string; dienBien: string; dienBienPHCN: string;
  bacSi?: Picked | null; capDo?: Picked | null;
  thuoc: Item[]; dvkt: Item[]; saoYLenh: SelectInfo | null; hinhThucSao: SelectInfo | null;
}
export interface Lists { at: number; bacSi: { id: string; name: string; login: string }[]; capDo: { id: string; ma: string; ten: string; text: string }[] }
export interface LoadResult { rows: OrderRow[]; source: Order | null; skipped: { id: string; tg: string; status: string }[]; lists?: Lists | null }
export interface Settings {
  baseUrl: string; autoComplete: boolean; stepMode: boolean; hinhThuc: string; defaultDays: number;
  bacSiFav: { id: string; name: string }[]; esBase: string; gpuOff: boolean; themThuoc: AddItem[];
}
/** A drug the user can tick to add on a day, through Kê Tây y/VTYT. */
export interface AddItem { id: string; label: string; kho: string; ten: string; tim: string; sl: string; cachDung: string; loai: string }
export interface Template { id: string; name: string; keys: string[] }
/** Corrections for one created day; a field left out keeps what the copy got. */
export interface DayEdit { gio?: string; dienBien?: string; dienBienPHCN?: string; bacSi?: Picked; capDo?: Picked }
export interface Choice { days: number; deletions: string[][]; edits?: (DayEdit | null)[]; adds?: string[][]; savedAt?: number }
export interface CheckItem {
  kind: 'thuoc' | 'dvkt'; id: string; base: string; group: string; name: string; hamLuong?: string; dvt?: string; duongDung?: string;
  sl: string; cachDung?: string; moTa?: string; thoiGian?: string; noiThucHien?: string; doiTuong: string; trangThai: string;
}
export interface CheckDay {
  day: number; id: string; tg?: string; status?: string; thoiGian?: string; thoiGianThucHien?: string; dienBien?: string; dienBienPHCN?: string;
  bacSi?: Picked | null; capDo?: Picked | null; thuoc?: CheckItem[]; dvkt?: CheckItem[]; removed?: string[]; added?: string[]; problems: string[]; warnings: string[]; gone?: boolean; deleted?: boolean;
}
export interface Check { at: number; ok: boolean; days: CheckDay[] }
export interface RunDay { day: number; id: string; time?: string; deleted?: boolean }
export interface RunInfo { at: number; ok: boolean; message: string; days?: RunDay[]; check?: Check | null }
export type BaValue = string | boolean | string[];
export type BaValues = Record<string, BaValue>;
export interface BenhAnDraft { values?: BaValues; savedAt?: number; readAt?: number; sentAt?: number; diff?: string[]; missing?: string[]; kept?: string[]; filled?: string[] }
export interface BaField { id: string; label: string; kind: 'textarea' | 'text' | 'number' | 'check' | 'radio' | 'select' | 'multi'; options?: { value: string; label: string }[]; format?: string }
export interface BaGroup { title: string; level: number; part: number; fields: BaField[] }
export interface BaSchema { source: string; groups: BaGroup[] }
export interface Data {
  settings: Settings; templates: Template[]; choices: Record<string, Choice>; runs: Record<string, RunInfo>;
  lists: Lists | null; benhAn: Record<string, BenhAnDraft>; benhAnMau: { values: BaValues; name: string; at: number } | null;
}
export interface UpdateInfo { version: string; kind: string; url: string; downloading?: boolean; progress?: number; error?: string }
export interface AppState {
  busy: boolean; task: string; stepWaiting: string | null;
  progress: { patient: string; index: number; total: number } | null;
  viewUrl: string; canGoBack?: boolean; update: UpdateInfo | null;
}
export interface LogEntry { at: number; level: 'info' | 'ok' | 'warn' | 'error'; msg: string }
export interface Plan { patient: Patient; sourceId?: string; days: number; deletions?: string[][]; baseDeletions?: string[][]; edits?: (DayEdit | null)[]; adds?: string[][] }
export interface RunResult { noitruid: string; ok: boolean; message?: string; stopped?: boolean; check?: Check | null }

export const baseKey = (key: string) => key.replace(/#\d+$/, '');

/** Vật tư y tế rows carry "(Hao phí)" or "(Bảo hiểm)" so the user knows which to drop. */
export const itemName = (it: { kind: string; group?: string; name: string; doiTuong?: string }) =>
  it.kind === 'thuoc' && /vật tư/i.test(it.group || '') && it.doiTuong ? `${it.name} (${it.doiTuong})` : it.name;
