import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, BookmarkPlus, Check, CheckCircle2, Download, FileInput, FileText, Loader2, RotateCcw, Upload } from 'lucide-react';
import { cn } from '@/kit/cn';
import { Button, EmptyState, Input, Select, Textarea } from '@/kit/ui';
import { useApp } from '@/lib/useApp';
import { allFields, filledCount, isFilled, schema, templateFromFile } from '@/lib/benhAn';
import type { BaField, BaValue, BaValues, BenhAnDraft, Patient } from '@/lib/types';
import { ActionBar, Sheet } from '@/components/common';

const when = (t?: number) => (t ? new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '');
const labelOf = (id: string) => allFields.find((f) => f.id === id)?.label || id;

// Thông tin bệnh án (section B) of one patient: filled from the saved example, edited
// here, then written to OneMES in one go.
export function BenhAnView({ patient }: { patient: Patient }) {
  const { data, setData, call, state, toast } = useApp();
  const id = patient.noitruid;
  const draft: BenhAnDraft | undefined = data?.benhAn?.[id];
  const mau = data?.benhAnMau || null;
  const [values, setValues] = useState<BaValues>(() => draft?.values || mau?.values || {});
  const [dirty, setDirty] = useState(false);
  const [ask, setAsk] = useState<'save' | 'read' | 'mau' | 'saveMau' | null>(null);
  const [mauName, setMauName] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const saving = state.busy && state.task === 'Ghi bệnh án';
  const reading = state.busy && state.task === 'Đọc bệnh án';

  // Keep the draft per patient so nothing is lost when switching patients.
  useEffect(() => {
    if (!dirty || !data) return;
    const t = setTimeout(() => {
      call<BenhAnDraft>('benhAn:set', { id, values }).then((d) => setData({ ...data, benhAn: { ...data.benhAn, [id]: d } })).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [values]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: BaValue) => {
    setValues((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };
  const putDraft = (d: BenhAnDraft | null) => {
    if (!d || !data) return;
    setData({ ...data, benhAn: { ...data.benhAn, [id]: d } });
    if (d.values) setValues(d.values);
    setDirty(false);
  };

  const readOnemes = async () => {
    setAsk(null);
    const d = await call<BenhAnDraft>('benhAn:read', { patient }).catch(() => null);
    putDraft(d);
    if (d) toast('success', `Đã đọc bệnh án trên OneMES: ${filledCount(d.values || {})} mục có nội dung`);
  };
  const save = async () => {
    setAsk(null);
    const d = await call<BenhAnDraft>('benhAn:save', { patient, values }).catch(() => null);
    putDraft(d);
    if (!d) return;
    const kept = d.kept?.length ? `, giữ nguyên ${d.kept.length} mục đã có trên OneMES` : '';
    if (d.diff?.length || d.missing?.length) toast('warning', 'Đã lưu, nhưng có mục chưa khớp (xem phía trên)');
    else if (!d.filled?.length) toast('info', `Không có mục trống nào cần điền${kept}`);
    else toast('success', `Đã điền ${d.filled.length} mục trống lên OneMES${kept}`);
  };
  const fillMau = () => {
    setAsk(null);
    if (!mau) return;
    setValues(mau.values);
    setDirty(true);
    toast('info', 'Đã điền từ mẫu');
  };
  const saveMau = async () => {
    setAsk(null);
    if (!data) return;
    const m = await call<Data['benhAnMau']>('benhAnMau:set', { values, name: mauName.trim() || patient.hoTen });
    setData({ ...data, benhAnMau: m });
    toast('success', 'Đã lưu làm mẫu cho bệnh nhân mới');
  };
  const importFile = async (f?: File) => {
    if (!f || !data) return;
    try {
      const r = await templateFromFile(f);
      const m = await call<Data['benhAnMau']>('benhAnMau:set', { values: r.values, name: r.name });
      setData({ ...data, benhAnMau: m });
      if (!draft?.values && !dirty) setValues(r.values);
      toast('success', `Đã nhập mẫu "${r.name}": ${r.filled} mục có nội dung`);
    } catch (e) {
      toast('error', (e as Error).message);
    }
    if (file.current) file.current.value = '';
  };

  const source = draft?.sentAt ? `Đã ghi lên OneMES lúc ${when(draft.sentAt)}` : draft?.readAt ? `Đọc từ OneMES lúc ${when(draft.readAt)}` : draft?.values ? `Bản đang sửa (lưu lúc ${when(draft.savedAt)})` : mau ? `Đang dùng mẫu "${mau.name}"` : 'Chưa có nội dung';
  const n = filledCount(values);
  const groups = schema.groups.filter((g) => g.fields.length);

  return (
    <>
      <input ref={file} type="file" accept=".html,.htm,text/html" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} data-input="mau-file" />
      <div className="flex-shrink-0 space-y-2 px-3 pb-2 sm:px-4" data-benhan-bar>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="xs" onClick={() => (dirty || draft?.values ? setAsk('read') : readOnemes())} disabled={state.busy} data-action="ba-read">
            {reading ? <Loader2 className="animate-spin" /> : <Download />} Đọc từ OneMES
          </Button>
          <Button variant="outline" size="xs" onClick={() => setAsk('mau')} disabled={!mau || state.busy} data-action="ba-fill" title={mau ? `Mẫu: ${mau.name}` : 'Chưa có mẫu'}><RotateCcw /> Điền từ mẫu</Button>
          <Button variant="ghost" size="xs" onClick={() => { setMauName(patient.hoTen); setAsk('saveMau'); }} disabled={!n} data-action="ba-save-mau"><BookmarkPlus /> Lưu làm mẫu</Button>
          <Button variant="ghost" size="xs" onClick={() => file.current?.click()} data-action="ba-import"><FileInput /> Nhập mẫu từ file HTML</Button>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{source}</span>
          <span className="ml-auto shrink-0">{n}/{allFields.length} mục có nội dung</span>
        </div>
        {!!draft?.sentAt && draft.sentAt >= (draft.readAt || 0) && !dirty && draft.kept !== undefined && (
          <div className="rounded-lg border border-border/50 bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-ba-kept>
            Lần ghi trước: điền {draft.filled?.length || 0} mục trống{draft.kept?.length ? `, giữ nguyên ${draft.kept.length} mục đã có sẵn trên OneMES (${draft.kept.slice(0, 6).map(labelOf).join(', ')}${draft.kept.length > 6 ? '…' : ''})` : ''}.
          </div>
        )}
        {(!!draft?.diff?.length || !!draft?.missing?.length) && !dirty && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300" data-ba-warn>
            <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />Lần ghi trước có mục chưa khớp</div>
            {!!draft?.missing?.length && <div>Không thấy trên trang OneMES: {draft.missing.map(labelOf).join(', ')}</div>}
            {!!draft?.diff?.length && <div>Khác sau khi lưu: {draft.diff.map(labelOf).join(', ')}</div>}
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {groups.map((g, i) => (
            <button key={i} type="button" onClick={() => document.getElementById(`ba-g${i}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
              className="shrink-0 rounded-md bg-muted/50 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
              {g.title || 'Khác'}
            </button>
          ))}
        </div>
      </div>

      <div ref={top} className="scroll-thin min-h-0 flex-1 overflow-auto px-3 pb-4 sm:px-4" data-benhan>
        {!n && !mau && !draft ? (
          <div className="mb-3">
            <EmptyState icon={<FileText />} title="Chưa có mẫu bệnh án" text="Bấm Nhập mẫu từ file HTML và chọn file trang Thông tin bệnh án đã hoàn tất (ví dụ 6-thong-tin-benh-an-mau) để điền sẵn, hoặc Đọc từ OneMES để lấy bệnh án hiện có." />
          </div>
        ) : null}
        <div className="space-y-3">
          {groups.map((g, i) => (
            <section key={i} id={`ba-g${i}`} className="scroll-mt-2 rounded-xl border border-border/50 bg-card/50" data-ba-group={g.title}>
              <div className={cn('border-b border-border/40 px-3 py-2 text-xs font-bold uppercase tracking-wide', g.level === 1 ? 'text-primary' : 'text-muted-foreground')}>
                {g.title || 'Khác'}
                <span className="ml-1.5 font-semibold normal-case tracking-normal text-muted-foreground">({g.fields.filter((f) => isFilled(values[f.id])).length}/{g.fields.length})</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-3 p-3">
                {g.fields.map((f) => <BaControl key={f.id} f={f} v={values[f.id]} onChange={(v) => set(f.id, v)} disabled={state.busy} />)}
              </div>
            </section>
          ))}
        </div>
      </div>

      <ActionBar>
        <Button variant="gradient" size="xl" className="w-full" disabled={state.busy || !n} onClick={() => setAsk('save')} data-action="ba-save">
          {saving ? <Loader2 className="animate-spin" /> : <Upload />} {saving ? 'Đang ghi lên OneMES…' : 'Cập nhật bệnh án lên OneMES'}
        </Button>
      </ActionBar>

      <Sheet
        open={ask === 'save'}
        onClose={() => setAsk(null)}
        title={`Ghi bệnh án của ${patient.hoTen}?`}
        footer={<><Button variant="outline" size="lg" onClick={() => setAsk(null)}>Không</Button><Button size="lg" className="flex-1" onClick={save} data-action="ba-confirm-save"><Upload /> Ghi lên OneMES</Button></>}
      >
        <p className="text-sm">Tool mở <b>Tổng kết › Lập bìa bệnh án</b> của bệnh nhân này, điền mục B theo nội dung đang có ({n} mục có nội dung), bấm Lưu <b>Thông tin chung</b> và <b>Thông tin chuyên khoa</b>, rồi đọc lại để kiểm tra.</p>
        <p className="mt-2 text-sm">Chỉ điền vào <b>ô còn trống</b> trên OneMES. Ô nào trên OneMES đã có nội dung thì giữ nguyên, không ghi đè.</p>
        <p className="mt-2 text-xs text-muted-foreground">Ô chẩn đoán ICD và mục C. Tổng kết bệnh án không bị đụng tới.</p>
      </Sheet>
      <Sheet
        open={ask === 'read'}
        onClose={() => setAsk(null)}
        title="Thay bằng bản trên OneMES?"
        footer={<><Button variant="outline" size="lg" onClick={() => setAsk(null)}>Không</Button><Button size="lg" className="flex-1" onClick={readOnemes} data-action="ba-confirm-read"><Download /> Đọc từ OneMES</Button></>}
      >
        <p className="text-sm">Nội dung đang sửa ở đây sẽ được thay bằng bệnh án hiện có trên OneMES của {patient.hoTen}.</p>
      </Sheet>
      <Sheet
        open={ask === 'mau'}
        onClose={() => setAsk(null)}
        title="Điền lại từ mẫu?"
        footer={<><Button variant="outline" size="lg" onClick={() => setAsk(null)}>Không</Button><Button size="lg" className="flex-1" onClick={fillMau} data-action="ba-confirm-fill"><RotateCcw /> Điền từ mẫu</Button></>}
      >
        <p className="text-sm">Toàn bộ nội dung đang sửa sẽ được thay bằng mẫu "{mau?.name}".</p>
      </Sheet>
      <Sheet
        open={ask === 'saveMau'}
        onClose={() => setAsk(null)}
        title="Lưu làm mẫu cho bệnh nhân mới"
        footer={<><Button variant="outline" size="lg" onClick={() => setAsk(null)}>Hủy</Button><Button size="lg" className="flex-1" onClick={saveMau}><Check /> Lưu mẫu</Button></>}
      >
        <Input autoFocus value={mauName} onChange={(e) => setMauName(e.target.value)} placeholder="Tên mẫu" />
        <p className="mt-2 text-xs text-muted-foreground">Bệnh nhân chưa có bản sửa sẽ bắt đầu từ mẫu này. Mẫu chỉ lưu trên máy này.</p>
      </Sheet>
    </>
  );
}

type Data = NonNullable<ReturnType<typeof useApp>['data']>;

function BaControl({ f, v, onChange, disabled }: { f: BaField; v: BaValue | undefined; onChange: (v: BaValue) => void; disabled?: boolean }) {
  const label = f.label || '';
  const wide = f.kind === 'textarea' || f.kind === 'multi' || (f.kind === 'radio' && (f.options?.length || 0) > 4);
  const box = cn('min-w-0', wide ? 'basis-full' : f.kind === 'check' ? '' : 'basis-[calc(50%-0.5rem)] grow');
  if (f.kind === 'check') {
    const on = v === true;
    return (
      <button type="button" disabled={disabled} onClick={() => onChange(!on)} aria-pressed={on} data-ba={f.id}
        className={cn('flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-semibold transition-colors', on ? 'border-primary bg-primary/15 text-primary' : 'border-border/60 text-muted-foreground hover:border-primary/40')}>
        <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
        {label}
      </button>
    );
  }
  return (
    <div className={box} data-ba={f.id}>
      {label && <div className="mb-1 text-[11px] font-semibold text-muted-foreground">{label}</div>}
      {f.kind === 'textarea' ? (
        <Textarea rows={Math.min(8, Math.max(2, String(v || '').split('\n').length))} value={String(v || '')} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="text-[13px]" />
      ) : f.kind === 'radio' || f.kind === 'multi' ? (
        <div className="flex flex-wrap gap-1">
          {(f.options || []).map((o) => {
            const on = f.kind === 'multi' ? Array.isArray(v) && v.includes(o.value) : typeof v === 'string' && v.trim() === o.value.trim() && v !== '';
            const click = () => {
              if (f.kind === 'multi') {
                const cur = Array.isArray(v) ? v : [];
                onChange(on ? cur.filter((x) => x !== o.value) : [...cur, o.value]);
              } else onChange(on ? '' : o.value);
            };
            return (
              <button key={o.value} type="button" disabled={disabled} onClick={click} aria-pressed={on}
                className={cn('h-7 rounded-md border px-2 text-xs font-semibold transition-colors', on ? 'border-primary bg-primary/15 text-primary' : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground')}>
                {f.kind === 'multi' && on && <CheckCircle2 className="mr-1 inline h-3 w-3" />}{o.label}
              </button>
            );
          })}
        </div>
      ) : f.kind === 'select' ? (
        <Select className="h-8 w-full text-[13px]" value={String(v || '')} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="">(trống)</option>
          {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ) : (
        <Input type={f.kind === 'number' ? 'number' : 'text'} className="h-8 text-[13px]" value={String(v ?? '')} disabled={disabled} placeholder={f.format === 'HH:mm dd/MM/yyyy' ? 'giờ:phút ngày/tháng/năm' : ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
