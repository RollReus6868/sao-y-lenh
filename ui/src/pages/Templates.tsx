import { useState } from 'react';
import { ClipboardList, Pencil, Trash2 } from 'lucide-react';
import { Button, Chip, EmptyState, Input, PageHeader } from '@/kit/ui';
import { useApp } from '@/lib/useApp';
import type { Template } from '@/lib/types';

const label = (k: string) => {
  const [kind, name, extra] = k.split('|');
  return { kind, name: name || k, extra };
};

export function TemplatesPage() {
  const { data, setData, call } = useApp();
  const [edit, setEdit] = useState<string | null>(null);
  const [name, setName] = useState('');
  const list = data?.templates || [];
  const save = async (next: Template[]) => {
    const r = await call<Template[]>('templates:set', next);
    if (data) setData({ ...data, templates: r });
  };
  return (
    <>
      <PageHeader title="Mẫu xóa" description="Áp nhanh cho một ngày ở bảng tick" icon={<ClipboardList />} />
      <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-auto px-4 pb-4 sm:px-5" data-list="templates">
        {!list.length ? (
          <EmptyState icon={<ClipboardList />} title="Chưa có mẫu" text="Ở bảng tick của một bệnh nhân, bấm tiêu đề cột ngày rồi chọn Lưu ngày này thành mẫu." />
        ) : (
          list.map((t) => (
            <div key={t.id} className="rounded-xl border border-border/50 bg-card/40 p-3">
              <div className="flex items-center gap-2">
                {edit === t.id ? (
                  <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { save(list.map((x) => (x.id === t.id ? { ...x, name: name.trim() || x.name } : x))); setEdit(null); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className="h-8" />
                ) : (
                  <span className="min-w-0 flex-1 truncate font-bold">{t.name}</span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">{t.keys.length} mục</span>
                <Button variant="ghost" size="icon-sm" aria-label="Đổi tên" onClick={() => { setEdit(t.id); setName(t.name); }}><Pencil /></Button>
                <Button variant="ghost" size="icon-sm" aria-label="Xóa mẫu" className="hover:text-red-500" onClick={() => save(list.filter((x) => x.id !== t.id))}><Trash2 /></Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {t.keys.map((k) => {
                  const l = label(k);
                  return <Chip key={k} title={l.extra} className={l.kind === 'd' ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : ''}>{l.name}</Chip>;
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
