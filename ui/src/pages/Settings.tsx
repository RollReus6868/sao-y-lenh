import { useEffect, useState } from 'react';
import { Download, Globe, Palette, Play, RefreshCw, Settings as Cog } from 'lucide-react';
import { cn } from '@/kit/cn';
import { Button, Input, PageHeader, Segmented, Select, SettingsRow, SettingsSection, Switch } from '@/kit/ui';
import { themes, useTheme } from '@/kit/theme';
import { useApp } from '@/lib/useApp';
import type { Settings } from '@/lib/types';

const HINH_THUC = [
  { value: '1', text: 'Sao thuốc dự trù và dịch vụ' },
  { value: '0', text: 'Sao thuốc dự trù' },
  { value: '2', text: 'Sao dịch vụ' },
  { value: '3', text: 'Sao đông y' },
  { value: '4', text: 'Sao tây y' },
  { value: '5', text: 'Sao tây y và dịch vụ' },
];

export function SettingsPage() {
  const { data, setData, call, version, state } = useApp();
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
