import { useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ClipboardCheck, Clock, Loader2, Pill as PillIcon, RefreshCw, Stethoscope, Trash2, XCircle } from 'lucide-react';
import { cn } from '@/kit/cn';
import { Button, EmptyState, Pill } from '@/kit/ui';
import { useApp } from '@/lib/useApp';
import type { CheckDay, CheckItem, Patient, RunInfo } from '@/lib/types';
import { ActionBar, Sheet } from '@/components/common';

const when = (t: number) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

// What the tool found when it read back the days it just created, with a way to
// remove a day that came out wrong.
export function ResultView({ patient }: { patient: Patient }) {
  const { data, state, call, toast, setData } = useApp();
  const [ask, setAsk] = useState<CheckDay | null>(null);
  const [pending, setPending] = useState('');
  const run = data?.runs[patient.noitruid];
  const check = run?.check;
  const checking = state.busy && state.task === 'Kiểm tra lại';
  const deleting = state.busy && state.task === 'Xóa y lệnh';
  const created = (run?.days || []).filter((d) => !d.deleted);

  const save = (r: RunInfo | null) => {
    if (r && data) setData({ ...data, runs: { ...data.runs, [patient.noitruid]: r } });
  };
  const recheck = async () => {
    const r = await call<RunInfo>('patient:check', { patient }).catch(() => null);
    save(r);
    if (r?.check) toast(r.check.ok ? 'success' : 'warning', r.check.ok ? 'Kiểm tra xong: đúng như đã chọn' : 'Kiểm tra xong: có ngày cần xem lại');
  };
  const remove = async () => {
    const d = ask;
    setAsk(null);
    if (!d) return;
    setPending(d.id);
    const r = await call<RunInfo>('order:delete', { patient, id: d.id }).catch(() => null);
    setPending('');
    save(r);
    if (r) toast('success', `Đã xóa y lệnh ngày ${d.day}${d.tg ? ` (${d.tg})` : ''}`);
  };

  if (!run?.days?.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <EmptyState icon={<ClipboardCheck />} title="Chưa có kết quả" text="Sau khi tool sao chép và xóa xong, các ngày vừa tạo được đọc lại và hiện ở đây để anh/chị kiểm tra." />
      </div>
    );
  }

  const bad = check ? check.days.filter((d) => !d.deleted && d.problems.length).length : 0;
  const days: CheckDay[] = check?.days.length ? check.days : run.days.map((d) => ({ day: d.day, id: d.id, tg: d.time, problems: [], warnings: [], deleted: d.deleted }));

  return (
    <>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-3 pb-4 sm:px-4" data-result>
        <div className={cn('flex items-center gap-3 rounded-xl border p-3', !check ? 'border-border/50 bg-card/50' : bad ? 'border-amber-500/40 bg-amber-500/10' : 'border-emerald-500/40 bg-emerald-500/10')} data-summary>
          {!check ? <Clock className="h-5 w-5 shrink-0 text-muted-foreground" /> : bad ? <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">{!check ? 'Chưa kiểm tra lại' : bad ? `${bad} ngày cần xem lại` : 'Đúng như đã chọn'}</div>
            <div className="text-xs text-muted-foreground">
              {run.ok ? `Chạy lúc ${when(run.at)}` : `Lần chạy ${when(run.at)} dừng giữa chừng: ${run.message}`}
              {check && ` · kiểm tra lúc ${when(check.at)}`}
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-3">
          {days.map((d) => (
            <DayCard key={d.id} d={d} busy={state.busy} deleting={deleting && pending === d.id} onDelete={() => setAsk(d)} />
          ))}
        </div>
      </div>

      <ActionBar>
        <Button variant="gradient" size="xl" className="w-full" disabled={state.busy || !created.length} onClick={recheck} data-action="recheck">
          {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} {checking ? 'Đang kiểm tra…' : 'Kiểm tra lại trên OneMES'}
        </Button>
      </ActionBar>

      <Sheet
        open={!!ask}
        onClose={() => setAsk(null)}
        title={ask ? `Xóa y lệnh ngày ${ask.day}${ask.tg ? ` (${ask.tg})` : ''}?` : ''}
        footer={<><Button variant="outline" size="lg" onClick={() => setAsk(null)}>Không</Button><Button variant="destructive" size="lg" className="flex-1" onClick={remove} data-action="confirm-delete"><Trash2 /> Xóa y lệnh này</Button></>}
      >
        <p className="text-sm">Tool sẽ mở y lệnh này trên OneMES, bấm <b>Thu hồi</b> (nếu đã Hoàn tất) rồi bấm <b>Xóa</b>.</p>
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">Xóa xong không lấy lại được. Muốn có lại ngày này phải sao chép lại.</p>
      </Sheet>
    </>
  );
}

function DayCard({ d, busy, deleting, onDelete }: { d: CheckDay; busy: boolean; deleting: boolean; onDelete: () => void }) {
  const gone = d.deleted || d.gone;
  const tone = gone ? 'muted' : d.problems.length ? 'error' : /hoàn tất/i.test(d.status || '') ? 'success' : 'warning';
  return (
    <div className={cn('rounded-xl border bg-card/50', gone ? 'border-border/40 opacity-60' : d.problems.length ? 'border-red-500/40' : 'border-border/50')} data-day={d.day}>
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2.5">
        <span className="text-sm font-bold">Ngày {d.day}</span>
        <span className="truncate text-xs text-muted-foreground">{d.tg || d.thoiGian}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {d.deleted ? <Pill tone="muted"><Trash2 />Đã xóa</Pill> : d.gone ? <Pill tone="muted">Không còn trên OneMES</Pill> : d.status ? <Pill tone={tone}>{d.status}</Pill> : null}
          {!gone && (
            <Button variant="destructive" size="xs" disabled={busy} onClick={onDelete} data-action="delete-day" title="Thu hồi rồi Xóa y lệnh này trên OneMES">
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />} Xóa
            </Button>
          )}
        </span>
      </div>

      {!gone && (
        <div className="space-y-3 p-3">
          {(d.problems.length > 0 || d.warnings.length > 0) && (
            <div className="space-y-1">
              {d.problems.map((p) => <div key={p} className="flex items-start gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400"><XCircle className="mt-px h-3.5 w-3.5 shrink-0" />{p}</div>)}
              {d.warnings.map((p) => <div key={p} className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />{p}</div>)}
            </div>
          )}
          {!d.problems.length && d.thuoc && <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" />Đã xóa đúng các mục đã chọn</div>}

          {d.thuoc && (
            <>
              <div className="grid gap-1.5 text-xs">
                {d.thoiGianThucHien && <Field label="Thời gian thực hiện" value={d.thoiGianThucHien} />}
                <Field label="Diễn biến bệnh" value={d.dienBien} />
                <Field label="Diễn biến PHCN" value={d.dienBienPHCN} />
              </div>
              {!!d.removed?.length && (
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <span className="font-semibold text-muted-foreground">Đã bỏ:</span>
                  {d.removed.map((n) => <span key={n} className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-red-600 line-through dark:text-red-400">{n}</span>)}
                </div>
              )}
              <Items title="Cho thuốc / VTYT" icon={<PillIcon />} list={d.thuoc} />
              <Items title="Chỉ định DVKT" icon={<Stethoscope />} list={d.dvkt || []} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <span className="font-semibold text-muted-foreground">{label}: </span>
      {value ? <span className="whitespace-pre-wrap">{value}</span> : <span className="italic text-amber-600 dark:text-amber-400">trống</span>}
    </div>
  );
}

function Items({ title, icon, list }: { title: string; icon: React.ReactNode; list: CheckItem[] }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 pb-1 text-[11px] font-bold uppercase tracking-wide text-primary [&_svg]:size-3.5">{icon}{title}<span className="font-semibold text-muted-foreground">({list.length})</span></div>
      {!list.length ? (
        <div className="text-xs text-muted-foreground">Không có mục nào</div>
      ) : (
        <div className="divide-y divide-border/40 rounded-lg border border-border/40">
          {list.map((it) => (
            <div key={it.id} className="flex items-baseline gap-2 px-2.5 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold">{it.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {it.kind === 'thuoc' ? [it.hamLuong, it.duongDung, it.cachDung].filter(Boolean).join(' · ') : [it.moTa, it.noiThucHien].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums">{`${it.sl || ''} ${it.dvt || ''}`.trim()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
