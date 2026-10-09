import { useEffect, useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/kit/cn';
import { Input, Select, Textarea } from '@/kit/ui';
import { useApp } from '@/lib/useApp';
import { minuteBefore } from '@/lib/dates';
import type { DayEdit, Picked } from '@/lib/types';

/** What a day holds when nothing is changed (the source order, or the day as created). */
export interface OrderBase { gio: string; dienBien: string; dienBienPHCN: string; bacSi?: Picked | null; capDo?: Picked | null }

type Key = keyof DayEdit;
const sameText = (a?: string, b?: string) => (a || '').replace(/\r\n/g, '\n').trim() === (b || '').replace(/\r\n/g, '\n').trim();
const same = (k: Key, a: unknown, b: unknown) =>
  k === 'bacSi' || k === 'capDo' ? (a as Picked | undefined)?.id === (b as Picked | undefined)?.id : sameText(a as string, b as string);

/** Sets one field of an edit; a value equal to the base drops the field. */
export function withField(edit: DayEdit | null | undefined, base: OrderBase, k: Key, v: DayEdit[Key]): DayEdit | null {
  const next: DayEdit = { ...(edit || {}) };
  if (v === undefined || v === '' || same(k, v, base[k])) delete next[k];
  else (next as Record<Key, unknown>)[k] = v;
  return Object.keys(next).length ? next : null;
}

/** Short text of what an edit changes, for confirm sheets and day chips. */
export function editSummary(e?: DayEdit | null) {
  if (!e) return '';
  return [
    e.gio && `giờ ${e.gio}`,
    e.bacSi && e.bacSi.text,
    e.capDo && `CĐCS ${e.capDo.text}`,
    e.dienBien !== undefined && 'diễn biến bệnh',
    e.dienBienPHCN !== undefined && 'diễn biến PHCN',
  ].filter(Boolean).join(' · ');
}

// Thời gian thực hiện, Bác sĩ, Cấp độ chăm sóc and the two progress notes of one day.
export function OrderFields({ edit, base, onChange, disabled }: { edit: DayEdit | null | undefined; base: OrderBase; onChange: (e: DayEdit | null) => void; disabled?: boolean }) {
  const { data } = useApp();
  const lists = data?.lists;
  const favs = data?.settings.bacSiFav || [];
  const v = <K extends Key>(k: K) => (edit && edit[k] !== undefined ? edit[k] : base[k]) as DayEdit[K];
  const set = (k: Key, x: DayEdit[Key]) => onChange(withField(edit, base, k, x));
  const changed = (k: Key) => !!edit && edit[k] !== undefined;
  const gio = (v('gio') as string) || '';
  const bs = v('bacSi') as Picked | undefined;
  const cd = v('capDo') as Picked | undefined;

  // Favourites first, then everyone OneMES lists; the current choice is always there.
  const all = lists?.bacSi || [];
  const favIds = new Set(favs.map((f) => f.id));
  const others = all.filter((x) => !favIds.has(x.id));
  const extra = [base.bacSi, bs].filter((x): x is Picked => !!x && !favIds.has(x.id) && !all.some((y) => y.id === x.id));
  const care = [...(lists?.capDo || []).map((x) => ({ id: x.id, text: x.text }))];
  for (const x of [base.capDo, cd]) if (x && !care.some((y) => y.id === x.id)) care.push(x);

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5" data-order-fields>
      <F label="Giờ thực hiện" changed={changed('gio')} onReset={() => set('gio', undefined)} hint={gio ? `Chỉ định: ${minuteBefore(gio)}` : ''}>
        <TimeInput value={gio} disabled={disabled} onChange={(x) => set('gio', x)} />
      </F>
      <F label="Cấp độ chăm sóc" changed={changed('capDo')} onReset={() => set('capDo', undefined)}>
        <Select className="h-8 w-full text-[13px]" value={cd?.id || ''} disabled={disabled} data-field="capDo"
          onChange={(e) => set('capDo', care.find((x) => x.id === e.target.value))}>
          {!cd && <option value="">(trống)</option>}
          {care.map((x) => <option key={x.id} value={x.id}>{x.text}</option>)}
        </Select>
      </F>
      <F label="Bác sĩ" changed={changed('bacSi')} onReset={() => set('bacSi', undefined)} className="col-span-2">
        <Select className="h-8 w-full text-[13px]" value={bs?.id || ''} disabled={disabled} data-field="bacSi"
          onChange={(e) => {
            const id = e.target.value;
            const hit = favs.find((x) => x.id === id) || all.find((x) => x.id === id);
            set('bacSi', hit ? { id, text: hit.name } : extra.find((x) => x.id === id));
          }}>
          {!bs && <option value="">(trống)</option>}
          {extra.map((x) => <option key={x.id} value={x.id}>{x.text}</option>)}
          {favs.length > 0 && <optgroup label="Hay dùng">{favs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>}
          {others.length > 0 && <optgroup label={favs.length ? 'Các bác sĩ khác' : 'Bác sĩ'}>{others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>}
        </Select>
      </F>
      <F label="Diễn biến bệnh" changed={changed('dienBien')} onReset={() => set('dienBien', undefined)} className="col-span-2">
        <Textarea rows={3} value={(v('dienBien') as string) || ''} disabled={disabled} onChange={(e) => set('dienBien', e.target.value)} className="text-[13px]" data-field="dienBien" />
      </F>
      <F label="Diễn biến PHCN" changed={changed('dienBienPHCN')} onReset={() => set('dienBienPHCN', undefined)} className="col-span-2">
        <Textarea rows={2} value={(v('dienBienPHCN') as string) || ''} disabled={disabled} onChange={(e) => set('dienBienPHCN', e.target.value)} className="text-[13px]" data-field="dienBienPHCN" />
      </F>
    </div>
  );
}

function F({ label, changed, onReset, hint, className, children }: { label: string; changed: boolean; onReset: () => void; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        {label}
        {changed && <span className="rounded bg-amber-500/15 px-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">đã sửa</span>}
        {changed && (
          <button type="button" title="Trả về như cũ" aria-label={`Trả ${label} về như cũ`} onClick={(e) => { e.preventDefault(); onReset(); }} className="text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
        {hint && <span className="ml-auto font-normal">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

// 24-hour "HH:mm" typed as text ("7:30", "0730", "7h30" are accepted), so the
// computer's AM/PM setting never gets in the way.
function TimeInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [text, setText] = useState(value);
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(value); setBad(false); }, [value]);
  const commit = () => {
    const m = /^\s*(\d{1,2})\s*[:hH.,]?\s*(\d{2})\s*$/.exec(text);
    if (!m || +m[1] > 23 || +m[2] > 59) {
      setBad(!!text.trim());
      if (!text.trim()) setText(value);
      return;
    }
    const v = `${m[1].padStart(2, '0')}:${m[2]}`;
    setText(v);
    setBad(false);
    if (v !== value) onChange(v);
  };
  return (
    <Input value={text} disabled={disabled} inputMode="numeric" placeholder="giờ:phút" maxLength={6}
      onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={cn('h-8 tabular-nums', bad && 'border-red-500 focus:ring-red-500/40')} title={bad ? 'Nhập giờ dạng 07:30' : ''} data-field="gio" />
  );
}
