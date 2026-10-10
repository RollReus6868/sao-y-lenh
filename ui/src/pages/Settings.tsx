import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, Globe, Monitor, Palette, Pill as PillIcon, Play, Plus, RefreshCw, RotateCcw, Settings as Cog, Star, Stethoscope, Trash2, Upload, X } from 'lucide-react';
import { cn } from '@/kit/cn';
import { Button, Input, PageHeader, Segmented, Select, SettingsRow, SettingsSection, Switch } from '@/kit/ui';
import { themes, useTheme } from '@/kit/theme';
import { useApp } from '@/lib/useApp';
import type { AddItem, Data, Settings } from '@/lib/types';
import { DEFAULT_THUOC } from '@/lib/thuoc';
import { templateFromFile } from '@/lib/benhAn';

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const HINH_THUC = [
  { value: '1', text: 'Sao thuốc dự trù và dịch vụ' },
  { value: '0', text: 'Sao thuốc dự trù' },
  { value: '2', text: 'Sao dịch vụ' },
  { value: '3', text: 'Sao đông y' },
  { value: '4', text: 'Sao tây y' },
  { value: '5', text: 'Sao tây y và dịch vụ' },
];

export function SettingsPage() {
  const { data, setData, call, version, state, toast, gpuOff } = useApp();
  const { theme, setTheme, mode, setMode } = useTheme();
  const s = data?.settings;
  const [url, setUrl] = useState(s?.baseUrl || '');
  useEffect(() => setUrl(s?.baseUrl || ''), [s?.baseUrl]);
  if (!s || !data) return null;
  const put = async (p: Partial<Settings>) => {
    const r = await call<Settings>('settings:set', p);
    setData({ ...data, settings: r });
  };
  const u = state.update;
  return (
    <>
      <PageHeader title="Cài đặt" icon={<Cog />} />
      <div className="scroll-thin min-h-0 flex-1 space-y-8 overflow-auto px-4 pb-6 sm:px-5">
        <SettingsSection icon={<Globe />} title="OneMES">
          <div className="text-sm font-semibold">Địa chỉ trang</div>
          <div className="flex gap-2">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} />
            <Button variant="outline" onClick={() => put({ baseUrl: url.trim() })} disabled={!url.trim() || url.trim() === s.baseUrl}>Lưu</Button>
          </div>
          <p className="text-xs text-muted-foreground">Chỉ đổi khi bệnh viện đổi địa chỉ máy chủ.</p>
        </SettingsSection>

        <SettingsSection icon={<Play />} title="Khi chạy" color="emerald">
          <SettingsRow title="Tự bấm Hoàn tất" text="Tắt để các ngày 2+ ở trạng thái Mới cho anh/chị tự xem">
            <Switch checked={s.autoComplete} onChange={(v) => put({ autoComplete: v })} label="Tự bấm Hoàn tất" />
          </SettingsRow>
          <SettingsRow title="Chạy từng bước" text="Dừng trước mỗi thao tác, bấm để làm tiếp">
            <Switch checked={s.stepMode} onChange={(v) => put({ stepMode: v })} label="Chạy từng bước" />
          </SettingsRow>
          <SettingsRow title="Hình thức sao y lệnh" text="Dùng khi tạo thêm ngày">
            <Select value={s.hinhThuc} onChange={(e) => put({ hinhThuc: e.target.value })} className="max-w-[210px]">
              {HINH_THUC.map((h) => <option key={h.value} value={h.value}>{h.text}</option>)}
            </Select>
          </SettingsRow>
          <SettingsRow title="Số ngày mặc định" text="Khi bệnh nhân chưa có lựa chọn">
            <Segmented value={s.defaultDays} onChange={(v) => put({ defaultDays: v })} options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} />
          </SettingsRow>
        </SettingsSection>

        <ThuocSection data={data} setData={setData} />

        <DoctorSection data={data} setData={setData} />

        <MauSection data={data} setData={setData} />

        <SettingsSection icon={<Monitor />} title="Hiển thị" color="amber">
          <SettingsRow title="Chống nháy màn hình" text="Vẽ giao diện bằng CPU thay cho card đồ họa. Bật nếu cửa sổ tool bị nháy">
            <Switch checked={s.gpuOff} onChange={(v) => put({ gpuOff: v })} label="Chống nháy màn hình" />
          </SettingsRow>
          {s.gpuOff !== gpuOff && (
            <div className="flex items-center gap-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <span className="flex-1">Cần mở lại tool để áp dụng.</span>
              <Button size="xs" disabled={state.busy} onClick={() => call('app:restart').catch(() => toast('error', 'Không mở lại được, hãy tự tắt và mở tool'))} data-action="restart">Mở lại tool</Button>
            </div>
          )}
        </SettingsSection>

        <SettingsSection icon={<Palette />} title="Giao diện" color="violet">
          <SettingsRow title="Chế độ">
            <Segmented value={mode} onChange={setMode} options={[{ value: 'light', label: 'Sáng' }, { value: 'dark', label: 'Tối' }]} />
          </SettingsRow>
          <div className="grid grid-cols-4 gap-2">
            {themes.map((t) => (
              <button key={t.name} type="button" onClick={() => setTheme(t.name)} className={cn('flex flex-col items-center gap-1.5 rounded-xl border p-2 text-[11px] font-semibold transition-all', theme === t.name ? 'border-primary bg-primary/10 text-primary' : 'border-border/60 hover:border-primary/40')}>
                <span className="h-6 w-full rounded-md" style={{ background: t.swatch }} />
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection icon={<Download />} title="Phiên bản" color="sky">
          <SettingsRow title={`Sao Y Lệnh ${version}`} text={u ? `Có bản mới ${u.version}` : 'Tool tự kiểm tra bản mới khi mở'}>
            {u ? (
              <Button size="sm" onClick={() => call('update:install')} disabled={!!u.downloading || state.busy} data-action="update">
                <Download /> {u.downloading ? `Đang tải ${Math.round((u.progress || 0) * 100)}%` : u.kind === 'installer' ? 'Cập nhật' : 'Mở trang tải'}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => call('update:check')}><RefreshCw /> Kiểm tra</Button>
            )}
          </SettingsRow>
          {u?.error && <p className="text-xs text-red-500">{u.error}</p>}
        </SettingsSection>
      </div>
    </>
  );
}

// Drugs offered as "+" ticks per day on the patient page, added through Kê Tây y/VTYT.
const THUOC_FIELDS: { k: keyof AddItem; label: string; hint?: string; wide?: boolean }[] = [
  { k: 'label', label: 'Tên hiển thị' },
  { k: 'kho', label: 'Kho', hint: 'Mã hoặc tên kho, ví dụ KCPSX' },
  { k: 'ten', label: 'Tên thuốc trên OneMES', hint: 'Tool chọn dòng có đúng tên này' },
  { k: 'tim', label: 'Từ khóa tìm', hint: 'Gõ vào ô Thuốc/VTYT để tìm' },
  { k: 'sl', label: 'Số lượng' },
  { k: 'loai', label: 'Loại kê', hint: 'KÊ LĨNH hoặc TỦ TRỰC' },
  { k: 'cachDung', label: 'Cách dùng', wide: true },
];

function ThuocSection({ data, setData }: { data: Data; setData: (d: Data) => void }) {
  const { call, toast } = useApp();
  const saved = data.settings.themThuoc || [];
  const [list, setList] = useState<AddItem[]>(saved);
  useEffect(() => setList(data.settings.themThuoc || []), [data.settings.themThuoc]);
  const dirty = JSON.stringify(list) !== JSON.stringify(saved);
  const set = (i: number, k: keyof AddItem, v: string) => setList((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const ok = list.every((x) => x.label.trim() && x.kho.trim() && x.ten.trim() && Number(x.sl) > 0);
  const save = async (l: AddItem[]) => {
    const r = await call<Settings>('settings:set', { themThuoc: l.map((x) => ({ ...x, label: x.label.trim(), kho: x.kho.trim(), ten: x.ten.trim(), tim: x.tim.trim(), sl: x.sl.trim(), cachDung: x.cachDung.trim(), loai: x.loai.trim() })) });
    setData({ ...data, settings: r });
    toast('success', 'Đã lưu danh sách thuốc thêm');
  };
  return (
    <SettingsSection icon={<PillIcon />} title="Thêm thuốc khi sao chép" color="emerald">
      <p className="text-xs text-muted-foreground">Mỗi thuốc ở đây có một hàng ô xanh <b>+</b> trong trang bệnh nhân. Tick ngày nào thì tool mở <b>Kê Tây y/VTYT</b> của ngày đó, chọn kho, tìm thuốc, điền số lượng, cách dùng, bấm Thêm rồi Chấp nhận.</p>
      <div className="space-y-3" data-thuoc-settings>
        {list.map((x, i) => (
          <div key={x.id} className="rounded-xl border border-border/50 bg-card/40 p-3" data-thuoc={x.id}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-bold">{x.label || 'Thuốc mới'}</span>
              <Button variant="ghost" size="xs" className="ml-auto" onClick={() => setList((l) => l.filter((_, j) => j !== i))} aria-label={`Bỏ ${x.label}`}><Trash2 /> Bỏ</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {THUOC_FIELDS.map((f) => (
                <label key={f.k} className={cn('text-[11px] font-semibold text-muted-foreground', f.wide && 'col-span-2')} title={f.hint}>
                  {f.label}
                  <Input value={x[f.k]} onChange={(e) => set(i, f.k, e.target.value)} className="mt-0.5 h-8 text-xs" placeholder={f.hint} />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setList((l) => [...l, { id: `t${Date.now()}`, label: '', kho: 'KCPSX', ten: '', tim: '', sl: '1', cachDung: '', loai: 'KÊ LĨNH' }])}><Plus /> Thêm thuốc khác</Button>
        <Button variant="ghost" size="sm" onClick={() => setList(DEFAULT_THUOC)} title="Về lại Cồn xoa bóp và Cao thông mạch như ban đầu"><RotateCcw /> Mặc định</Button>
        <Button size="sm" className="ml-auto" disabled={!dirty || !ok} onClick={() => save(list)} data-action="thuoc-save">Lưu</Button>
      </div>
      {!ok && <p className="text-xs text-red-500">Mỗi thuốc cần tên hiển thị, kho, tên thuốc và số lượng lớn hơn 0.</p>}
    </SettingsSection>
  );
}

// Doctors offered first in the Bác sĩ dropdown of each day.
function DoctorSection({ data, setData }: { data: Data; setData: (d: Data) => void }) {
  const { call, state, toast } = useApp();
  const [q, setQ] = useState('');
  const favs = data.settings.bacSiFav || [];
  const all = data.lists?.bacSi || [];
  const shown = useMemo(() => {
    const f = fold(q.trim());
    return (f ? all.filter((x) => fold(`${x.name} ${x.login}`).includes(f)) : all).slice(0, 60);
  }, [all, q]);
  const save = async (list: { id: string; name: string }[]) => {
    const r = await call<Settings>('settings:set', { bacSiFav: list });
    setData({ ...data, settings: r });
  };
  const reload = async () => {
    const l = await call<Data['lists']>('lists:load').catch(() => null);
    if (l) {
      setData({ ...data, lists: l });
      toast('success', `Đã đọc ${l.bacSi.length} bác sĩ, ${l.capDo.length} cấp độ chăm sóc`);
    }
  };
  const isFav = (id: string) => favs.some((f) => f.id === id);
  return (
    <SettingsSection icon={<Stethoscope />} title="Bác sĩ hay dùng" color="emerald">
      <p className="text-xs text-muted-foreground">Bấm ngôi sao để đưa bác sĩ lên đầu danh sách chọn Bác sĩ của từng ngày.{data.lists ? ` Danh sách đọc từ OneMES lúc ${new Date(data.lists.at).toLocaleString('vi-VN')}.` : ' Danh sách được đọc từ OneMES khi mở bệnh nhân đầu tiên.'}</p>
      {favs.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-favs>
          {favs.map((f) => (
            <span key={f.id} className="flex h-7 items-center gap-1 rounded-lg bg-primary/15 pl-2 pr-1 text-xs font-semibold text-primary">
              <Star className="h-3 w-3 fill-current" />{f.name}
              <button type="button" aria-label={`Bỏ ${f.name}`} onClick={() => save(favs.filter((x) => x.id !== f.id))} className="rounded p-0.5 hover:bg-primary/20"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={all.length ? `Tìm trong ${all.length} bác sĩ` : 'Chưa có danh sách'} disabled={!all.length} />
        <Button variant="outline" onClick={reload} disabled={state.busy} title="Đọc lại danh sách từ OneMES (cần đăng nhập)"><RefreshCw /> Đọc lại</Button>
      </div>
      {all.length > 0 && (
        <div className="scroll-thin max-h-56 divide-y divide-border/40 overflow-auto rounded-lg border border-border/40" data-doctors>
          {shown.map((x) => (
            <button key={x.id} type="button" onClick={() => save(isFav(x.id) ? favs.filter((f) => f.id !== x.id) : [...favs, { id: x.id, name: x.name }])}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/40">
              <Star className={cn('h-4 w-4 shrink-0', isFav(x.id) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{x.login}</span>
            </button>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}

// The filled-in Thông tin bệnh án that new patients start from.
function MauSection({ data, setData }: { data: Data; setData: (d: Data) => void }) {
  const { call, toast } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const m = data.benhAnMau;
  const load = async (f?: File) => {
    if (!f) return;
    try {
      const r = await templateFromFile(f);
      const saved = await call<Data['benhAnMau']>('benhAnMau:set', { values: r.values, name: r.name });
      setData({ ...data, benhAnMau: saved });
      toast('success', `Đã nhập mẫu "${r.name}": ${r.filled} mục có nội dung`);
    } catch (e) {
      toast('error', (e as Error).message);
    }
    if (file.current) file.current.value = '';
  };
  const clear = async () => {
    await call('benhAnMau:set', null);
    setData({ ...data, benhAnMau: null });
  };
  return (
    <SettingsSection icon={<FileText />} title="Mẫu Thông tin bệnh án" color="sky">
      <input ref={file} type="file" accept=".html,.htm,text/html" className="hidden" onChange={(e) => load(e.target.files?.[0])} />
      <SettingsRow title={m ? `Mẫu: ${m.name}` : 'Chưa có mẫu'} text={m ? `Nhập lúc ${new Date(m.at).toLocaleString('vi-VN')}. Bệnh nhân mới bắt đầu từ mẫu này.` : 'Chọn file HTML trang Thông tin bệnh án đã hoàn tất (lưu bằng Ctrl+S trong Chrome).'}>
        <div className="flex gap-2">
          {m && <Button variant="ghost" size="sm" onClick={clear} aria-label="Bỏ mẫu"><Trash2 /></Button>}
          <Button variant="outline" size="sm" onClick={() => file.current?.click()}><Upload /> Nhập từ file</Button>
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
