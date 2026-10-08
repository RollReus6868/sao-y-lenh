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
export interface Order {
  id: string; status: string; info: string; thoiGian: string; dienBien: string; dienBienPHCN: string;
  thuoc: Item[]; dvkt: Item[]; saoYLenh: SelectInfo | null; hinhThucSao: SelectInfo | null;
}
export interface LoadResult { rows: OrderRow[]; source: Order | null; skipped: { id: string; tg: string; status: string }[] }
export interface Settings { baseUrl: string; autoComplete: boolean; stepMode: boolean; hinhThuc: string; defaultDays: number }
export interface Template { id: string; name: string; keys: string[] }
export interface Choice { days: number; deletions: string[][]; savedAt?: number }
export interface CheckItem {
  kind: 'thuoc' | 'dvkt'; id: string; base: string; group: string; name: string; hamLuong?: string; dvt?: string; duongDung?: string;
  sl: string; cachDung?: string; moTa?: string; thoiGian?: string; noiThucHien?: string; doiTuong: string; trangThai: string;
}
export interface CheckDay {
  day: number; id: string; tg?: string; status?: string; thoiGian?: string; thoiGianThucHien?: string; dienBien?: string; dienBienPHCN?: string;
  thuoc?: CheckItem[]; dvkt?: CheckItem[]; removed?: string[]; problems: string[]; warnings: string[]; gone?: boolean; deleted?: boolean;
}
export interface Check { at: number; ok: boolean; days: CheckDay[] }
export interface RunDay { day: number; id: string; time?: string; deleted?: boolean }
export interface RunInfo { at: number; ok: boolean; message: string; days?: RunDay[]; check?: Check | null }
export interface Data { settings: Settings; templates: Template[]; choices: Record<string, Choice>; runs: Record<string, RunInfo> }
export interface UpdateInfo { version: string; kind: string; url: string; downloading?: boolean; progress?: number; error?: string }
export interface AppState {
  busy: boolean; task: string; stepWaiting: string | null;
  progress: { patient: string; index: number; total: number } | null;
  viewUrl: string; canGoBack?: boolean; update: UpdateInfo | null;
}
export interface LogEntry { at: number; level: 'info' | 'ok' | 'warn' | 'error'; msg: string }
export interface Plan { patient: Patient; sourceId?: string; days: number; deletions?: string[][]; baseDeletions?: string[][] }
export interface RunResult { noitruid: string; ok: boolean; message?: string; stopped?: boolean; check?: Check | null }

export const baseKey = (key: string) => key.replace(/#\d+$/, '');
