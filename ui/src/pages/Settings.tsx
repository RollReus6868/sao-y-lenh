import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, Globe, KeyRound, LogIn, Pencil, Monitor, Palette, Pill as PillIcon, Play, Plus, RefreshCw, RotateCcw, Settings as Cog, Star, Stethoscope, Trash2, Upload, X } from 'lucide-react';
import { cn } from '@/kit/cn';
import { Button, Input, PageHeader, Segmented, Select, SettingsRow, SettingsSection, Switch } from '@/kit/ui';
import { themes, useTheme } from '@/kit/theme';
import { useApp } from '@/lib/useApp';
import type { AddItem, Data, LoginInfo, MauList, Settings } from '@/lib/types';
import { DEFAULT_THUOC } from '@/lib/thuoc';
import { filledCount, templateFromFile } from '@/lib/benhAn';

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

        <LoginSection autoLogin={s.autoLogin !== false} onAuto={(v) => put({ autoLogin: v })} />

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
  { k: 'tuTick', label: 'Tự tick sau (ngày)', hint: 'Y lệnh thường ngày D có thuốc này thì tick sẵn ngày D + số này; để trống = không tự tick' },
  { k: 'cachDung', label: 'Cách dùng', wide: true },
];

function ThuocSection({ data, setData }: { data: Data; setData: (d: Data) => void }) {
  const { call, toast } = useApp();
  const saved = data.settings.themThuoc || [];
  const [list, setList] = useState<AddItem[]>(saved);
  useEffect(() => setList(data.settings.themThuoc || []), [data.settings.themThuoc]);
  const dirty = JSON.stringify(list) !== JSON.stringify(saved);
  const set = (i: number, k: keyof AddItem, v: string) => setList((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const ok = list.every((x) => x.label.trim() && x.kho.trim() && x.ten.trim() && Number(x.sl) > 0 && /^\d{0,2}$/.test(String(x.tuTick ?? '').trim()));
  const save = async (l: AddItem[]) => {
    const r = await call<Settings>('settings:set', { themThuoc: l.map((x) => ({ ...x, label: x.label.trim(), kho: x.kho.trim(), ten: x.ten.trim(), tim: x.tim.trim(), sl: x.sl.trim(), cachDung: x.cachDung.trim(), loai: x.loai.trim(), tuTick: String(x.tuTick ?? '').trim() })) });
    setData({ ...data, settings: r });
    toast('success', 'Đã lưu danh sách thuốc thêm');
  };
  return (
    <SettingsSection icon={<PillIcon />} title="Thêm thuốc khi sao chép" color="emerald">
      <p className="text-xs text-muted-foreground">Mỗi thuốc ở đây có một hàng ô xanh <b>+</b> trong trang bệnh nhân. Tick ngày nào thì tool mở <b>Kê Tây y/VTYT</b> của ngày đó, chọn kho, tìm thuốc, điền số lượng, cách dùng, bấm Thêm rồi Chấp nhận. Có <b>Tự tick sau</b> thì khi mở bệnh nhân, tool đọc các y lệnh thường gần đây và tick sẵn ngày cần thêm (ví dụ Cao thông mạch 3: ngày 13 có thì tick ngày 16); anh/chị vẫn bỏ tick được.</p>
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
                  <Input value={x[f.k] ?? ''} onChange={(e) => set(i, f.k, e.target.value)} className="mt-0.5 h-8 text-xs" placeholder={f.hint} />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setList((l) => [...l, { id: `t${Date.now()}`, label: '', kho: 'KCPSX', ten: '', tim: '', sl: '1', cachDung: '', loai: 'KÊ LĨNH', tuTick: '' }])}><Plus /> Thêm thuốc khác</Button>
        <Button variant="ghost" size="sm" onClick={() => setList(DEFAULT_THUOC)} title="Về lại Cồn xoa bóp và Cao thông mạch như ban đầu"><RotateCcw /> Mặc định</Button>
        <Button size="sm" className="ml-auto" disabled={!dirty || !ok} onClick={() => save(list)} data-action="thuoc-save">Lưu</Button>
      </div>
      {!ok && <p className="text-xs text-red-500">Mỗi thuốc cần tên hiển thị, kho, tên thuốc và số lượng lớn hơn 0; Tự tick sau là số ngày hoặc để trống.</p>}
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

// The filled-in Thông tin bệnh án examples. The starred one is where new patients start.
function MauSection({ data, setData }: { data: Data; setData: React.Dispatch<React.SetStateAction<Data | null>> }) {
  const { call, toast } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const list = data.benhAnMaus || [];
  const put = (r: MauList) => setData((x) => x && { ...x, benhAnMaus: r.benhAnMaus, benhAnMauId: r.benhAnMauId });
  const load = async (f?: File) => {
    if (!f) return;
    try {
      const r = await templateFromFile(f);
      put(await call<MauList>('mau:save', { values: r.values, name: r.name }));
      toast('success', `Đã thêm mẫu "${r.name}": ${r.filled} mục có nội dung`);
    } catch (e) {
      toast('error', (e as Error).message);
    }
    if (file.current) file.current.value = '';
  };
  const rename = async () => {
    if (edit && edit.name.trim()) put(await call<MauList>('mau:rename', edit));
    setEdit(null);
  };
  return (
    <SettingsSection icon={<FileText />} title="Mẫu Thông tin bệnh án" color="sky">
      <input ref={file} type="file" accept=".html,.htm,text/html" className="hidden" onChange={(e) => load(e.target.files?.[0])} data-input="mau-file-settings" />
      <p className="text-xs text-muted-foreground">
        {list.length ? 'Mẫu có ngôi sao là mẫu bệnh nhân mới bắt đầu. Trong thẻ Bệnh án của từng bệnh nhân có thể chọn mẫu khác để điền.' : 'Chưa có mẫu. Nhập từ file HTML trang Thông tin bệnh án đã hoàn tất (lưu bằng Ctrl+S trong Chrome), hoặc điền tay trong thẻ Bệnh án rồi bấm Lưu làm mẫu.'}
      </p>
      {list.length > 0 && (
        <div className="divide-y divide-border/40 rounded-lg border border-border/40" data-mau-list>
          {list.map((m) => {
            const on = m.id === data.benhAnMauId;
            return (
              <div key={m.id} className="flex items-center gap-2 px-2 py-1.5" data-mau={m.name}>
                <button type="button" onClick={async () => put(await call<MauList>('mau:default', { id: m.id }))} title={on ? 'Mẫu cho bệnh nhân mới' : 'Dùng làm mẫu cho bệnh nhân mới'} aria-label="Mẫu mặc định" className="rounded p-1 hover:bg-muted/50">
                  <Star className={cn('h-4 w-4', on ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
                </button>
                {edit?.id === m.id ? (
                  <Input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEdit(null); }} onBlur={rename} className="h-8 flex-1 text-sm" />
                ) : (
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{m.name}</div>
                    <div className="text-[11px] text-muted-foreground">{filledCount(m.values)} mục có nội dung · lưu lúc {new Date(m.at).toLocaleString('vi-VN')}</div>
                  </div>
                )}
                {del === m.id ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setDel(null)}>Không</Button>
                    <Button variant="destructive" size="sm" onClick={async () => { put(await call<MauList>('mau:delete', { id: m.id })); setDel(null); }} data-action="mau-confirm-delete">Xóa mẫu</Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setEdit({ id: m.id, name: m.name })} aria-label={`Đổi tên ${m.name}`} title="Đổi tên"><Pencil /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setDel(m.id)} aria-label={`Xóa ${m.name}`} title="Xóa mẫu"><Trash2 /></Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div>
        <Button variant="outline" size="sm" onClick={() => file.current?.click()}><Upload /> Thêm mẫu từ file HTML</Button>
      </div>
    </SettingsSection>
  );
}

// The OneMES account the tool logs in with whenever OneMES shows its login page (0.6.0).
function LoginSection({ autoLogin, onAuto }: { autoLogin: boolean; onAuto: (v: boolean) => void }) {
  const { data, state, call, toast } = useApp();
  const info: LoginInfo = state.login || data?.login || { user: '', saved: false, failed: '' };
  const [user, setUser] = useState(info.user);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setUser(info.user), [info.user]);
  const save = async () => {
    setBusy(true);
    const r = await call<LoginInfo>('login:set', { user: user.trim(), pass }).catch(() => null);
    setBusy(false);
    if (r) {
      setPass('');
      toast('success', `Đã lưu tài khoản ${r.user}`);
    }
  };
  const now = async () => {
    setBusy(true);
    const r = await call<{ ok: boolean; already?: boolean }>('login:now').catch(() => null);
    setBusy(false);
    if (r) toast(r.ok ? 'success' : 'warning', r.already ? 'OneMES đang đăng nhập sẵn' : r.ok ? 'Đã đăng nhập OneMES' : 'Chưa đăng nhập được, xem Nhật ký');
  };
  const clear = async () => {
    await call('login:clear').catch(() => null);
    setUser('');
    setPass('');
  };
  return (
    <SettingsSection icon={<KeyRound />} title="Tài khoản OneMES" color="emerald">
      <SettingsRow title="Tự đăng nhập" text="Khi OneMES hiện trang đăng nhập (mở tool, hết phiên, chuyển mục), tool tự điền tài khoản đã lưu và đăng nhập rồi làm tiếp">
        <Switch checked={autoLogin} onChange={onAuto} label="Tự đăng nhập" />
      </SettingsRow>
      <div className="text-sm" data-login-status>
        {info.saved ? <>Đã lưu tài khoản <b>{info.user}</b>. Mật khẩu được mã hóa trên máy này.</> : 'Chưa lưu tài khoản.'}
        {info.failed && <div className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">Lần tự đăng nhập trước không được: {info.failed}</div>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Tên tài khoản" autoComplete="off" data-field="login-user" />
        <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && user.trim() && pass && save()} placeholder={info.saved ? 'Mật khẩu mới (nếu đổi)' : 'Mật khẩu'} autoComplete="new-password" data-field="login-pass" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy || !user.trim() || !pass} onClick={save} data-action="login-save"><KeyRound /> Lưu tài khoản</Button>
        {info.saved && <Button variant="outline" size="sm" disabled={busy || state.busy} onClick={now} data-action="login-now"><LogIn /> Đăng nhập ngay</Button>}
        {info.saved && <Button variant="ghost" size="sm" onClick={clear} data-action="login-clear"><Trash2 /> Xóa tài khoản đã lưu</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Cũng có thể đăng nhập một lần trong trang Trình duyệt: khi đăng nhập được, tool nhớ tài khoản đó (khi Tự đăng nhập đang bật).</p>
    </SettingsSection>
  );
}
