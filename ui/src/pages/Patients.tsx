import { useEffect, useMemo, useRef, useState } from 'react';
import { BedDouble, ClipboardCheck, FileText, Globe, MousePointerClick, Check, ChevronDown, ClipboardCopy, Copy, ListChecks, PencilLine, Pill as PillIcon, Play, Plus, RefreshCw, RotateCcw, ScanLine, Search, Stethoscope, Users, X } from 'lucide-react';
import { cn } from '@/kit/cn';
import { Button, Chip, EmptyState, Input, PageHeader, Pill, Segmented, Select, Switch } from '@/kit/ui';
import { useApp } from '@/lib/useApp';
import { baseKey, itemName, type AddItem, type Choice, type DayEdit, type Item, type LoadResult, type Patient, type Plan, type RunResult, type Template } from '@/lib/types';
import { ActionBar, RunBar, Sheet } from '@/components/common';
import { OrderFields, editSummary, type OrderBase } from '@/components/OrderFields';
import { addDays, dayLabel, ddmm, hhmmOf, parseDay, weekdayShort } from '@/lib/dates';
import { ResultView } from '@/pages/Result';
import { BenhAnView } from '@/pages/BenhAn';


const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const today = () => new Date().toDateString();

export function PatientsPage({ onBrowser }: { onBrowser: () => void }) {
  const [open, setOpen] = useState<Patient | null>(null);
  const { state } = useApp();
  const running = state.busy && state.task === 'Sao chép y lệnh';
  return (
    <div className="flex min-w-0 flex-1 gap-3">
      <section className="glass-panel relative flex w-[400px] shrink-0 flex-col overflow-hidden" data-column="list">
        <PatientList onOpen={(p) => !running && setOpen(p)} selected={open?.noitruid} onBrowser={onBrowser} />
      </section>
      <section className="glass-panel relative flex min-w-0 flex-1 flex-col overflow-hidden" data-column="detail">
        {open ? (
          <PatientDetail key={open.noitruid} patient={open} onBack={() => setOpen(null)} onBrowser={onBrowser} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={<MousePointerClick />} title="Chọn một bệnh nhân" text="Bấm vào bệnh nhân ở danh sách bên trái để xem y lệnh nguồn và chọn mục xóa cho từng ngày." />
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------- danh sách ----------------
function PatientList({ onOpen, selected, onBrowser }: { onOpen: (p: Patient) => void; selected?: string; onBrowser: () => void }) {
  const { patients, setPatients, data, state, call, toast, refresh } = useApp();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const choices = data?.choices || {};
  const runs = data?.runs || {};

  const shown = useMemo(() => {
    const f = fold(q.trim());
    return f ? patients.filter((p) => fold(`${p.hoTen} ${p.maBN} ${p.bg} ${p.chanDoan}`).includes(f)) : patients;
  }, [patients, q]);
  const groups = useMemo(() => {
    const m = new Map<string, Patient[]>();
    shown.forEach((p) => m.set(p.buong || 'Khác', [...(m.get(p.buong || 'Khác') || []), p]));
    return [...m.entries()];
  }, [shown]);

  const scan = async () => {
    const r = await call<Patient[]>('scan').catch(() => null);
    if (r) {
      setPatients(r);
      toast('success', `Đã quét ${r.length} bệnh nhân`);
    }
  };
  const runBatch = async () => {
    setConfirm(false);
    const plans: Plan[] = patients
      .filter((p) => picked.has(p.noitruid) && choices[p.noitruid])
      .map((p) => ({ patient: p, days: choices[p.noitruid].days, baseDeletions: choices[p.noitruid].deletions, edits: choices[p.noitruid].edits, adds: choices[p.noitruid].adds }));
    const r = await call<RunResult[]>('run', { plans }).catch(() => null);
    await refresh();
    if (r) {
      const ok = r.filter((x) => x.ok).length;
      toast(ok === r.length ? 'success' : 'warning', `Xong ${ok}/${r.length} bệnh nhân${ok < r.length ? ', xem Nhật ký' : ''}`);
      setPicked(new Set());
    }
  };

  const toggle = (id: string) => {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setPicked(n);
  };
  const pickable = patients.filter((p) => choices[p.noitruid]);

  return (
    <>
      <PageHeader
        title="Bệnh nhân"
        description={patients.length ? `${patients.length} bệnh nhân trong Ds Điều trị nội trú` : 'Ds Điều trị nội trú'}
        icon={<Users />}
        actions={patients.length > 0 && <Button variant="outline" size="sm" onClick={scan} disabled={state.busy} data-action="scan"><RefreshCw /> Quét lại</Button>}
      />
      {patients.length > 0 && (
        <div className="flex-shrink-0 space-y-2 px-4 pb-3 sm:px-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên, mã BN, giường, chẩn đoán" className="h-10 pl-9" />
          </div>
          {pickable.length > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Tick bệnh nhân đã có lựa chọn để chạy một lượt</span>
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setPicked(picked.size ? new Set() : new Set(pickable.map((p) => p.noitruid)))}>
                {picked.size ? 'Bỏ chọn' : `Chọn cả ${pickable.length}`}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-4 pb-4 sm:px-5" data-list="patients">
        {!patients.length ? (
          <EmptyState icon={<ScanLine />} title="Chưa có danh sách" text="Đăng nhập OneMES ở mục Trình duyệt, rồi bấm Quét danh sách để đọc các bệnh nhân đang điều trị." action={<Button variant="outline" size="sm" onClick={onBrowser}><Globe /> Mở trình duyệt OneMES</Button>} />
        ) : !shown.length ? (
          <EmptyState icon={<Search />} title="Không thấy bệnh nhân" text="Thử từ khóa khác." />
        ) : (
          groups.map(([room, list]) => (
            <div key={room} className="mb-3">
              <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><BedDouble className="h-3.5 w-3.5" />{room}</div>
              <div className="space-y-1.5">
                {list.map((p) => {
                  const run = runs[p.noitruid];
                  const ch: Choice | undefined = choices[p.noitruid];
                  const ranToday = run && new Date(run.at).toDateString() === today();
                  return (
                    <div key={p.noitruid} className={cn('group flex items-start gap-2.5 rounded-xl border p-3 transition-colors', selected === p.noitruid ? 'border-primary/50 bg-primary/10' : 'border-border/50 bg-card/40 hover:border-primary/30 hover:bg-card/70')} data-patient={p.maBN}>
                      <button
                        type="button"
                        aria-label="Chọn để chạy"
                        disabled={!ch}
                        title={ch ? 'Chọn để chạy một lượt' : 'Mở bệnh nhân và tick mục xóa trước'}
                        onClick={() => toggle(p.noitruid)}
                        className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-30', picked.has(p.noitruid) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}
                      >
                        {picked.has(p.noitruid) && <Check className="h-3.5 w-3.5" />}
                      </button>
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(p)}>
                        <div className="flex items-center gap-2">
                          <span className="truncate font-bold">{p.hoTen}</span>
                          <span className="ml-auto shrink-0">
                            {ranToday ? (
                              !run.ok ? <Pill tone="error">Lỗi</Pill>
                              : run.check?.days.some((d) => !d.deleted && d.problems.length) ? <Pill tone="warning">Cần xem lại</Pill>
                              : <Pill tone="success"><Check />Đã làm hôm nay</Pill>
                            ) : ch ? (
                              <Pill tone="active">Có lựa chọn · {ch.days} ngày</Pill>
                            ) : (
                              <Pill tone="muted">Chưa chọn</Pill>
                            )}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Chip>{p.maBN}</Chip>
                          <Chip>{p.tuoi} tuổi · {p.gt}</Chip>
                          {p.bg && <Chip>{p.bg.replace(/^.*\/\s*/, 'Giường ')}</Chip>}
                        </div>
                        <div className="mt-1 line-clamp-1 text-xs text-muted-foreground" title={p.chanDoan}>{p.chanDoan}</div>
                        {ranToday && !run.ok && <div className="mt-1 line-clamp-2 text-xs text-red-600 dark:text-red-400">{run.message}</div>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
      <ActionBar>
        {state.busy && state.task === 'Sao chép y lệnh' ? (
          <RunBar onBrowser={onBrowser} />
        ) : !patients.length ? (
          <Button variant="gradient" size="xl" className="w-full" onClick={scan} disabled={state.busy} data-action="scan">
            <ScanLine /> {state.busy ? 'Đang quét…' : 'Quét danh sách'}
          </Button>
        ) : (
          <Button variant="gradient" size="xl" className="w-full" disabled={!picked.size || state.busy} onClick={() => setConfirm(true)} data-action="run-batch">
            <Play /> {picked.size ? `Chạy ${picked.size} bệnh nhân đã chọn` : 'Mở bệnh nhân để chọn mục xóa'}
          </Button>
        )}
      </ActionBar>
      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Chạy ${picked.size} bệnh nhân`}
        footer={<>
          <Button variant="outline" size="lg" onClick={() => setConfirm(false)}>Hủy</Button>
          <Button variant="default" size="lg" className="flex-1" onClick={runBatch} data-action="confirm-run"><Play /> Bắt đầu</Button>
        </>}
      >
        <p className="mb-3 text-sm text-muted-foreground">Mỗi bệnh nhân: tool chọn y lệnh Hoàn tất mới nhất có đủ 2 diễn biến, sao chép, rồi xóa theo lựa chọn đã lưu. Mục không còn trong y lệnh sẽ được bỏ qua và ghi nhật ký.</p>
        <div className="space-y-1.5">
          {patients.filter((p) => picked.has(p.noitruid)).map((p) => (
            <div key={p.noitruid} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span className="truncate font-semibold">{p.hoTen}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{choices[p.noitruid]?.days} ngày · xóa {choices[p.noitruid]?.deletions.reduce((a, d) => a + d.length, 0)} mục{choices[p.noitruid]?.adds?.some((d) => d.length) ? ` · thêm ${choices[p.noitruid].adds!.reduce((a, d) => a + d.length, 0)}` : ''}</span>
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}

// ---------------- một bệnh nhân ----------------
const EMPTY: string[][] = [[], [], [], []];
const NO_EDITS: (DayEdit | null)[] = [null, null, null, null];
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const fold2 = (s: string) => s.normalize('NFC').toLowerCase().trim();
const hasDrug = (list: Item[], it: AddItem) => list.some((x) => fold2(x.name).startsWith(fold2(it.ten)));

function PatientDetail({ patient, onBack, onBrowser }: { patient: Patient; onBack: () => void; onBrowser: () => void }) {
  const { data, state, call, toast, refresh, setData } = useApp();
  const [res, setRes] = useState<LoadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(data?.settings.defaultDays || 3);
  const [sel, setSel] = useState<string[][]>(EMPTY);
  const [menu, setMenu] = useState<number | null>(null);
  const [saveTpl, setSaveTpl] = useState<number | null>(null);
  const [tplName, setTplName] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<'pick' | 'result' | 'benhan'>('pick');
  const [edits, setEdits] = useState<(DayEdit | null)[]>(NO_EDITS);
  const [adds, setAdds] = useState<string[][]>(EMPTY);
  const [eday, setEday] = useState<number | null>(null);
  const loaded = useRef(false);

  const load = async (sourceId?: string) => {
    setLoading(true);
    loaded.current = false;
    const r = await call<LoadResult>('patient:load', { patient, sourceId }).catch(() => null);
    setLoading(false);
    setRes(r);
    if (r?.lists) refresh(); // doctor / care level lists were read for the first time
    if (r?.source) {
      const items = [...r.source.thuoc, ...r.source.dvkt];
      const ch = data?.choices[patient.noitruid];
      if (ch) {
        setDays(ch.days);
        setSel([0, 1, 2, 3].map((i) => items.filter((it) => (ch.deletions[i] || []).includes(baseKey(it.key))).map((it) => it.key)));
        setEdits([0, 1, 2, 3].map((i) => (ch.edits && ch.edits[i]) || null));
        setAdds([0, 1, 2, 3].map((i) => (ch.adds && ch.adds[i]) || []));
      } else {
        setSel(EMPTY);
        setEdits(NO_EDITS);
        setAdds(EMPTY);
      }
      loaded.current = true;
    }
  };
  useEffect(() => {
    load();
  }, [patient.noitruid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember the choice per patient (by item name, so it carries to the next copy).
  useEffect(() => {
    if (!loaded.current || !data) return;
    const t = setTimeout(() => {
      const choice: Choice = { days, deletions: sel.slice(0, days).map((d) => d.map(baseKey)), edits: edits.slice(0, days), adds: adds.slice(0, days) };
      call('choice:set', { id: patient.noitruid, choice }).catch(() => {});
      setData({ ...data, choices: { ...data.choices, [patient.noitruid]: choice } });
    }, 400);
    return () => clearTimeout(t);
  }, [sel, days, edits, adds]); // eslint-disable-line react-hooks/exhaustive-deps

  const src = res?.source;
  const items = useMemo(() => (src ? [...src.thuoc, ...src.dvkt] : []), [src]);
  const base = src ? parseDay(src.thoiGian) : null;
  const dayOf = (k: number) => (base ? addDays(base, k + 1) : null);
  const dayDate = (k: number) => dayLabel(dayOf(k));
  const srcBase: OrderBase | null = src
    ? { gio: hhmmOf(src.thoiGianThucHien || src.thoiGian), dienBien: src.dienBien, dienBienPHCN: src.dienBienPHCN, bacSi: src.bacSi, capDo: src.capDo }
    : null;
  // A change on one day carries to the days after it, unless a later day was set apart.
  const setEdit = (k: number, e: DayEdit | null) =>
    setEdits((x) => {
      const old = (x[k] || {}) as Record<string, unknown>;
      const nw = (e || {}) as Record<string, unknown>;
      const keys = [...new Set([...Object.keys(old), ...Object.keys(nw)])].filter((f) => !same(old[f], nw[f]));
      return x.map((y, i) => {
        if (i === k) return e;
        if (i < k || i >= days) return y;
        const cur = { ...(y || {}) } as Record<string, unknown>;
        for (const f of keys) {
          if (!same(cur[f], old[f])) continue;
          if (nw[f] === undefined || nw[f] === null || nw[f] === '') delete cur[f];
          else cur[f] = nw[f];
        }
        return Object.keys(cur).length ? (cur as DayEdit) : null;
      });
    });
  const catalog: AddItem[] = data?.settings.themThuoc || [];
  const toggleAdd = (k: number, id: string) => setAdds((s) => s.map((d, i) => (i !== k ? d : d.includes(id) ? d.filter((x) => x !== id) : [...d, id])));
  const toggleAddRow = (id: string) => {
    const all = adds.slice(0, days).every((d) => d.includes(id));
    setAdds((s) => s.map((d, i) => (i >= days ? d : all ? d.filter((x) => x !== id) : d.includes(id) ? d : [...d, id])));
  };
  const addCount = adds.slice(0, days).reduce((a, d) => a + d.filter((id) => catalog.some((c) => c.id === id)).length, 0);
  const addNames = (k: number) => catalog.filter((c) => adds[k].includes(c.id)).map((c) => c.label);
  const editCount = edits.slice(0, days).filter(Boolean).length;
  const templates = data?.templates || [];

  const toggle = (k: number, key: string) => setSel((s) => s.map((d, i) => (i !== k ? d : d.includes(key) ? d.filter((x) => x !== key) : [...d, key])));
  const toggleRow = (key: string) => {
    const all = sel.slice(0, days).every((d) => d.includes(key));
    setSel((s) => s.map((d, i) => (i >= days ? d : all ? d.filter((x) => x !== key) : d.includes(key) ? d : [...d, key])));
  };
  const setCol = (k: number, keys: string[]) => setSel((s) => s.map((d, i) => (i === k ? keys : d)));
  const applyTpl = (k: number, t: Template) => setCol(k, items.filter((it) => t.keys.includes(baseKey(it.key))).map((it) => it.key));
  const saveTemplate = async () => {
    if (saveTpl === null || !tplName.trim() || !data) return;
    const t: Template = { id: String(Date.now()), name: tplName.trim(), keys: [...new Set(sel[saveTpl].map(baseKey))] };
    const list = await call<Template[]>('templates:set', [...templates, t]);
    setData({ ...data, templates: list });
    setSaveTpl(null);
    setTplName('');
    toast('success', `Đã lưu mẫu "${t.name}"`);
  };

  const run = async () => {
    setConfirm(false);
    if (!src) return;
    const plan: Plan = { patient, sourceId: src.id, days, deletions: sel.slice(0, days), edits: edits.slice(0, days), adds: adds.slice(0, days) };
    const r = await call<RunResult[]>('run', { plans: [plan] }).catch(() => null);
    await refresh();
    if (r && r[0] && (r[0].check || r[0].ok)) setTab('result');
    // The copied days now hold the corrected notes; the newest becomes the next source.
    if (r && r[0]?.ok) setEdits((x) => x.map((e) => {
      if (!e) return e;
      const { dienBien, dienBienPHCN, ...rest } = e; // eslint-disable-line @typescript-eslint/no-unused-vars
      return Object.keys(rest).length ? rest : null;
    }));
    load(); // the newest order is now the source for next time
    if (r && r[0]) {
      if (r[0].ok) toast('success', `Xong ${days} ngày cho ${patient.hoTen}`);
      else toast(r[0].stopped ? 'warning' : 'error', r[0].message || 'Có lỗi, xem Nhật ký');
    }
  };

  const groupsOf = (list: Item[]) => {
    const m = new Map<string, Item[]>();
    list.forEach((it) => m.set(it.group || '', [...(m.get(it.group || '') || []), it]));
    return [...m.entries()];
  };
  const candidates = (res?.rows || []).filter((r) => r.dienBien && r.dienBienPHCN);
  const running = state.busy && state.task === 'Sao chép y lệnh';
  const lastRun = data?.runs[patient.noitruid];
  const total = sel.slice(0, days).reduce((a, d) => a + d.length, 0);
  const cols = `minmax(0,1fr) repeat(${days}, 56px)`;

  const section = (title: string, icon: React.ReactNode, list: Item[]) => (
    <>
      <div key={title} className="col-span-full mt-2 flex items-center gap-2 px-1 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-primary [&_svg]:size-3.5">{icon}{title} <span className="font-semibold text-muted-foreground">({list.length})</span></div>
      {!list.length && <div className="col-span-full px-1 pb-2 text-xs text-muted-foreground">Không có mục nào</div>}
      {groupsOf(list).map(([g, its]) => (
        <div key={g} className="contents">
          {g && <div className="col-span-full px-1 pt-1 text-[11px] font-semibold text-muted-foreground">{g}</div>}
          {its.map((it) => {
            const allDays = sel.slice(0, days).every((d) => d.includes(it.key));
            return (
              <div key={it.key} className="contents" data-item={it.name}>
                <button type="button" onClick={() => toggleRow(it.key)} title={`${itemName(it)}${it.moTa ? ` (${it.moTa})` : ''}\nBấm để chọn/bỏ cả hàng`} className="min-w-0 rounded-lg px-1.5 py-1.5 text-left hover:bg-muted/50">
                  <div className={cn('truncate text-[13px] font-semibold', allDays && 'text-muted-foreground line-through')}>
                    {it.name}
                    {it.kind === 'thuoc' && /vật tư/i.test(it.group) && it.doiTuong && (
                      <span className={cn('ml-1 font-bold', /hao phí/i.test(it.doiTuong) ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400')} data-doituong>({it.doiTuong})</span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {it.kind === 'thuoc' ? [it.hamLuong, `${it.sl} ${it.dvt || ''}`.trim(), it.cachDung].filter(Boolean).join(' · ') : it.moTa}
                  </div>
                </button>
                {Array.from({ length: days }, (_, k) => {
                  const on = sel[k].includes(it.key);
                  return (
                    <div key={k} className="flex items-center justify-center">
                      <button
                        type="button"
                        aria-label={`Xóa ${it.name} ngày ${k + 1}`}
                        aria-pressed={on}
                        onClick={() => toggle(k, it.key)}
                        className={cn('flex h-7 w-7 items-center justify-center rounded-md border transition-all', on ? 'border-red-500/50 bg-red-500/15 text-red-600 dark:text-red-400' : 'border-muted-foreground/30 text-transparent hover:border-primary/60')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );


  const addSection = () => (
    <>
      <div className="col-span-full mt-2 flex items-center gap-2 px-1 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 [&_svg]:size-3.5" data-add-section><Plus />Thêm thuốc (Kê Tây y/VTYT)</div>
      {catalog.map((c) => {
        const inSrc = src ? hasDrug(src.thuoc, c) : false;
        return (
          <div key={c.id} className="contents" data-add={c.id}>
            <button type="button" onClick={() => toggleAddRow(c.id)} title={`${c.ten} · kho ${c.kho} · SL ${c.sl}\n${c.cachDung}\nBấm để chọn/bỏ cả hàng`} className="min-w-0 rounded-lg px-1.5 py-1.5 text-left hover:bg-muted/50">
              <div className="truncate text-[13px] font-semibold">{c.label}{inSrc && <span className="ml-1 text-[11px] font-normal text-muted-foreground">(đã có trong y lệnh nguồn)</span>}</div>
              <div className="truncate text-[11px] text-muted-foreground">{[c.kho, `SL ${c.sl}`, c.cachDung].filter(Boolean).join(' · ')}</div>
            </button>
            {Array.from({ length: days }, (_, k) => {
              const on = adds[k].includes(c.id);
              return (
                <div key={k} className="flex items-center justify-center">
                  <button
                    type="button"
                    aria-label={`Thêm ${c.label} ngày ${k + 1}`}
                    aria-pressed={on}
                    onClick={() => toggleAdd(k, c.id)}
                    className={cn('flex h-7 w-7 items-center justify-center rounded-md border transition-all', on ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'border-muted-foreground/30 text-transparent hover:border-primary/60')}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );

  return (
    <>
      <div className="flex flex-shrink-0 items-center gap-2 px-3 pb-2 pt-3 sm:px-4">
        <Button variant="ghost" size="icon" aria-label="Đóng" title="Đóng" onClick={onBack} disabled={running} data-action="back"><X /></Button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold leading-tight">{patient.hoTen}</div>
          <div className="truncate text-xs text-muted-foreground">{patient.maBN} · {patient.tuoi} tuổi · {patient.bg}</div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Đọc lại" title="Đọc lại y lệnh" onClick={() => load(src?.id)} disabled={state.busy}><RefreshCw /></Button>
      </div>
      <div className="flex flex-shrink-0 gap-1 px-3 pb-2 sm:px-4" role="tablist">
        <TabBtn on={tab === 'pick'} onClick={() => setTab('pick')} data-tab="pick"><ListChecks /> Chọn mục xóa</TabBtn>
        <TabBtn on={tab === 'result'} onClick={() => setTab('result')} data-tab="result">
          <ClipboardCheck /> Kết quả
          {lastRun?.check ? (
            lastRun.check.days.some((d) => !d.deleted && d.problems.length) ? <span className="h-2 w-2 rounded-full bg-red-500" /> : <span className="h-2 w-2 rounded-full bg-emerald-500" />
          ) : null}
        </TabBtn>
        <TabBtn on={tab === 'benhan'} onClick={() => setTab('benhan')} data-tab="benhan">
          <FileText /> Bệnh án
          {data?.benhAn?.[patient.noitruid]?.sentAt ? <span className="h-2 w-2 rounded-full bg-emerald-500" /> : null}
        </TabBtn>
      </div>

      {tab === 'benhan' ? <BenhAnView patient={patient} /> : tab === 'result' ? <ResultView patient={patient} /> : <>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-3 pb-4 sm:px-4" data-detail>
        {loading && !src ? (
          <div className="space-y-3 pt-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/50" />)}</div>
        ) : !src ? (
          <EmptyState icon={<ClipboardCopy />} title="Không có y lệnh nguồn" text="Bệnh nhân này chưa có y lệnh Hoàn tất nào đủ cả Diễn biến bệnh và Diễn biến PHCN." action={<Button variant="outline" size="sm" onClick={() => load()}><RefreshCw /> Đọc lại</Button>} />
        ) : (
          <>
            <div className="rounded-xl border border-border/50 bg-card/50 p-3" data-source>
              <div className="flex items-center gap-2">
                <Copy className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm font-bold">Y lệnh nguồn</span>
                <Pill tone={/hoàn tất/i.test(src.status) ? 'success' : 'warning'}>{src.status}</Pill>
                <Select className="ml-auto h-8 max-w-[160px] text-xs" value={src.id} disabled={state.busy} onChange={(e) => load(e.target.value)} aria-label="Đổi y lệnh nguồn">
                  {candidates.map((r) => <option key={r.id} value={r.id}>{r.tg}</option>)}
                  {!candidates.some((r) => r.id === src.id) && <option value={src.id}>{src.thoiGian}</option>}
                </Select>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="line-clamp-2"><span className="font-semibold text-muted-foreground">Diễn biến: </span>{src.dienBien}</div>
                <div className="line-clamp-2"><span className="font-semibold text-muted-foreground">PHCN: </span>{src.dienBienPHCN}</div>
              </div>
              {!!res?.skipped.length && <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">Bỏ qua {res.skipped.map((s) => `${s.tg} (${s.status})`).join(', ')} vì chưa Hoàn tất.</div>}
            </div>

            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm font-bold">Số ngày tạo</span>
              <Segmented value={days} onChange={setDays} disabled={state.busy} options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n), title: n === 1 ? 'Chỉ Sao chép' : `Sao chép + Sao y lệnh ${n - 1} ngày` }))} />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Ngày 1 là bản Sao chép. {days > 1 ? `Ngày 2–${days} do Sao y lệnh (ngày) = ${days - 1} tạo ra.` : 'Không dùng Sao y lệnh.'} Tick ô đỏ = xóa mục đó ở ngày đó{catalog.length ? ', ô xanh = thêm thuốc ở ngày đó' : ''}.</p>

            <div className="mt-3 rounded-xl border border-border/50 bg-card/50" data-day-edits>
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
                <PencilLine className="h-4 w-4 shrink-0 text-primary" />
                <span className="mr-1 text-sm font-bold">Sửa từng ngày</span>
                {Array.from({ length: days }, (_, k) => (
                  <button key={k} type="button" onClick={() => setEday(eday === k ? null : k)} data-eday={k + 1}
                    className={cn('flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition-colors', eday === k ? 'border-primary bg-primary/15 text-primary' : 'border-border/60 hover:border-primary/40')}>
                    N{k + 1} · {dayOf(k) ? `${weekdayShort(dayOf(k)!)} ${ddmm(dayOf(k)!)}` : ''}
                    {edits[k] && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                  </button>
                ))}
                <span className="ml-auto text-[11px] text-muted-foreground">{editCount ? `${editCount} ngày có sửa` : 'Giờ, bác sĩ, cấp độ CS, diễn biến'}</span>
              </div>
              {eday !== null && eday < days && srcBase && (
                <div className="border-t border-border/40 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs">
                    <span className="font-bold">Ngày {eday + 1} · {dayDate(eday)}</span>
                    <span className="text-muted-foreground">{eday < days - 1 ? `Sửa ở đây áp dụng luôn cho ngày ${eday + 2}–${days}` : 'Ô không sửa giữ như y lệnh nguồn'}</span>
                    <span className="ml-auto flex gap-1">
                      <Button variant="ghost" size="xs" disabled={!edits[eday]} onClick={() => setEdit(eday, null)} data-action="edit-reset"><RotateCcw /> Bỏ sửa</Button>
                    </span>
                  </div>
                  <OrderFields edit={edits[eday]} base={srcBase} onChange={(e) => setEdit(eday, e)} disabled={state.busy} />
                </div>
              )}
            </div>

            <div className="mt-3 grid items-center gap-x-1" style={{ gridTemplateColumns: cols }} data-grid>
              <div className="sticky top-0 z-10 self-stretch bg-card px-1.5 py-2 text-[11px] font-semibold text-muted-foreground">Bấm tên để chọn cả hàng</div>
              {Array.from({ length: days }, (_, k) => (
                <button key={k} type="button" onClick={() => setMenu(k)} className="sticky top-0 z-10 flex flex-col items-center rounded-lg bg-card py-1 hover:bg-muted/60" data-col={k + 1} title={`${dayDate(k)}: chọn nhanh cho ngày này`}>
                  <span className="flex items-center text-xs font-bold">N{k + 1}<ChevronDown className="h-3 w-3" /></span>
                  <span className="text-[10px] font-semibold text-muted-foreground">{dayOf(k) ? `${weekdayShort(dayOf(k)!)} ${ddmm(dayOf(k)!)}` : ''}</span>
                  <span className={cn('text-[10px] font-bold', sel[k].length ? 'text-red-500' : 'text-muted-foreground/60')}>−{sel[k].length}</span>
                </button>
              ))}
              {catalog.length > 0 && addSection()}
              {section('Cho thuốc / VTYT', <PillIcon />, src.thuoc)}
              {section('Chỉ định DVKT', <Stethoscope />, src.dvkt)}
            </div>
          </>
        )}
      </div>

      <ActionBar>
        {running ? (
          <RunBar onBrowser={onBrowser} />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-2"><Switch checked={!!data?.settings.stepMode} onChange={(v) => data && call('settings:set', { stepMode: v }).then((s) => setData({ ...data, settings: s as typeof data.settings }))} label="Chạy từng bước" /> Từng bước</label>
              <label className="flex items-center gap-2"><Switch checked={!!data?.settings.autoComplete} onChange={(v) => data && call('settings:set', { autoComplete: v }).then((s) => setData({ ...data, settings: s as typeof data.settings }))} label="Tự Hoàn tất" /> Tự Hoàn tất</label>
              <span className="ml-auto text-muted-foreground">xóa {total} mục{addCount ? ` · thêm ${addCount}` : ''}</span>
            </div>
            <Button variant="gradient" size="xl" className="w-full" disabled={!src || state.busy} onClick={() => setConfirm(true)} data-action="run">
              <Copy /> Sao chép & xóa cho {days} ngày
            </Button>
          </div>
        )}
      </ActionBar>
      </>}

      <Sheet open={menu !== null} onClose={() => setMenu(null)} title={menu !== null ? `Ngày ${menu + 1} (${dayDate(menu)}): chọn nhanh` : ''}>
        {menu !== null && (
          <div className="space-y-1.5">
            {menu > 0 && <QuickBtn onClick={() => { setCol(menu, [...sel[menu - 1]]); setMenu(null); }} icon={<ListChecks />} text="Giống ngày trước" />}
            <QuickBtn onClick={() => { setCol(menu, items.filter((i) => i.kind === 'thuoc').map((i) => i.key)); setMenu(null); }} icon={<PillIcon />} text="Xóa hết thuốc/VTYT" />
            <QuickBtn onClick={() => { setCol(menu, items.filter((i) => i.kind === 'dvkt').map((i) => i.key)); setMenu(null); }} icon={<Stethoscope />} text="Xóa hết DVKT" />
            <QuickBtn onClick={() => { setCol(menu, []); setMenu(null); }} icon={<X />} text="Không xóa gì" />
            {templates.length > 0 && <div className="px-1 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Áp mẫu</div>}
            {templates.map((t) => <QuickBtn key={t.id} onClick={() => { applyTpl(menu, t); setMenu(null); }} icon={<ClipboardCopy />} text={t.name} sub={`${t.keys.length} mục`} />)}
            <Button variant="soft" size="lg" className="mt-2 w-full" disabled={!sel[menu].length} onClick={() => { setSaveTpl(menu); setMenu(null); }}>Lưu ngày này thành mẫu</Button>
          </div>
        )}
      </Sheet>
      <Sheet open={saveTpl !== null} onClose={() => setSaveTpl(null)} title="Lưu thành mẫu xóa" footer={<><Button variant="outline" size="lg" onClick={() => setSaveTpl(null)}>Hủy</Button><Button size="lg" className="flex-1" disabled={!tplName.trim()} onClick={saveTemplate}>Lưu mẫu</Button></>}>
        <Input autoFocus value={tplName} onChange={(e) => setTplName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveTemplate()} placeholder="Tên mẫu, ví dụ: Bỏ điện xung" />
        <p className="mt-2 text-xs text-muted-foreground">Mẫu nhận theo tên thuốc/DVKT nên dùng được cho bệnh nhân khác.</p>
      </Sheet>
      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Sao chép & xóa cho ${days} ngày`}
        footer={<><Button variant="outline" size="lg" onClick={() => setConfirm(false)}>Hủy</Button><Button size="lg" className="flex-1" onClick={run} data-action="confirm-run"><Play /> Bắt đầu</Button></>}
      >
        <ol className="space-y-2 text-sm">
          <li><b>Sao chép</b> y lệnh {src?.thoiGian} → ngày 1 ({dayDate(0)}).</li>
          {days > 1 && <li><b>Hoàn tất</b> ngày 1 với Sao y lệnh (ngày) = {days - 1} → ngày 2–{days}.</li>}
          {Array.from({ length: days }, (_, k) => (
            <li key={k} className="rounded-lg bg-muted/40 px-3 py-2">
              <div className="font-semibold">Ngày {k + 1} ({dayDate(k)}): {sel[k].length ? `xóa ${sel[k].length} mục` : edits[k] || addNames(k).length ? 'không xóa mục nào' : 'giữ nguyên'}</div>
              {!!sel[k].length && <div className="mt-0.5 text-xs text-muted-foreground">{items.filter((i) => sel[k].includes(i.key)).map(itemName).join(', ')}</div>}
              {addNames(k).length > 0 && <div className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">Thêm: {addNames(k).join(', ')}</div>}
              {edits[k] && <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">Sửa: {editSummary(edits[k])}</div>}
            </li>
          ))}
          <li className="text-xs text-muted-foreground">{data?.settings.autoComplete ? 'Mỗi ngày sửa xong sẽ được Hoàn tất.' : 'Các ngày 2+ để ở trạng thái Mới cho anh/chị tự xem và Hoàn tất.'}{data?.settings.stepMode ? ' Chạy từng bước: tool dừng trước mỗi thao tác.' : ''}</li>
        </ol>
      </Sheet>
    </>
  );
}

function TabBtn({ on, children, ...p }: { on: boolean; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" role="tab" aria-selected={on} className={cn('flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors [&_svg]:size-3.5', on ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')} {...p}>
      {children}
    </button>
  );
}

function QuickBtn({ onClick, icon, text, sub }: { onClick: () => void; icon: React.ReactNode; text: string; sub?: string }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted/60 [&_svg]:size-4 [&_svg]:text-primary">
      {icon}
      <span className="min-w-0 flex-1 truncate">{text}</span>
      {sub && <span className="text-xs font-normal text-muted-foreground">{sub}</span>}
    </button>
  );
}
