import { useEffect, useMemo, useState } from 'react';
import { Check, Eraser, FilePlus2, FlaskConical, Loader2, ScanLine, Stethoscope, Trash2, Undo2 } from 'lucide-react';
import { cn } from '@/kit/cn';
import { Button, EmptyState, Input, Pill, Textarea } from '@/kit/ui';
import { useApp } from '@/lib/useApp';
import type { ClsList, ClsRead, DvCleanDay, DvScan, Patient } from '@/lib/types';
import { Sheet } from '@/components/common';
import { TimeInput } from '@/components/OrderFields';

const when = (t: number) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const p2 = (n: number) => String(n).padStart(2, '0');

// A thin row of controls at the top of a tab: what it does on the left, buttons on the right.
export function TabBar({ children, actions }: { children: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border/40 px-3 pb-2 sm:px-4">
      <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">{children}</div>
      <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
    </div>
  );
}

// ---------------- Dọn thủ thuật các ngày cũ ----------------
export function DvCleanView({ patient }: { patient: Patient }) {
  const { data, state, call, toast, setData } = useApp();
  const scan: DvScan | undefined = data?.dvScans?.[patient.noitruid];
  const [off, setOff] = useState<Set<string>>(new Set());
  const [ask, setAsk] = useState(false);
  const scanning = state.busy && state.task === 'Quét thủ thuật cũ';
  const cleaning = state.busy && state.task === 'Dọn thủ thuật';
  const all = useMemo(() => (scan?.days || []).flatMap((d) => d.items), [scan]);
  const ticked = all.filter((it) => !off.has(it.id));

  const doScan = async () => {
    const r = await call<DvScan>('dvkt:scan', { patient }).catch(() => null);
    if (!r) return;
    setOff(new Set());
    setData((x) => x && { ...x, dvScans: { ...(x.dvScans || {}), [patient.noitruid]: r } });
    const n = r.days.reduce((a, d) => a + d.items.length, 0);
    toast(n ? 'info' : 'success', n ? `Có ${n} thủ thuật cần dọn ở ${r.days.filter((d) => d.items.length).length} ngày` : 'Các ngày cũ không còn thủ thuật cần dọn');
  };
  const clean = async () => {
    setAsk(false);
    if (!scan) return;
    const days = scan.days.map((d) => ({ id: d.id, tg: d.tg, items: d.items.filter((it) => !off.has(it.id)).map((it) => it.id) })).filter((d) => d.items.length);
    const r = await call<{ result: DvCleanDay[]; deleted: number; dvScans: Record<string, DvScan> }>('dvkt:clean', { patient, days }).catch(() => null);
    if (r) {
      setData((x) => x && { ...x, dvScans: r.dvScans });
      setOff(new Set());
      toast('success', `Đã dọn ${r.deleted} thủ thuật`);
    } else {
      // Read what is left even after an error.
      const s = await call<DvScan>('dvkt:scan', { patient }).catch(() => null);
      if (s) setData((x) => x && { ...x, dvScans: { ...(x.dvScans || {}), [patient.noitruid]: s } });
    }
  };
  const flip = (ids: string[], on: boolean) =>
    setOff((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.delete(id) : n.add(id)));
      return n;
    });

  return (
    <>
      <TabBar
        actions={<>
          <Button variant="outline" size="sm" onClick={doScan} disabled={state.busy} data-action="dv-scan">
            {scanning ? <Loader2 className="animate-spin" /> : <ScanLine />} {scan ? 'Quét lại' : 'Quét các ngày cũ'}
          </Button>
          <Button variant="gradient" size="sm" onClick={() => setAsk(true)} disabled={state.busy || !ticked.length} data-action="dv-clean">
            {cleaning ? <Loader2 className="animate-spin" /> : <Eraser />} Dọn {ticked.length || ''}
          </Button>
        </>}
      >
        Các ngày trước hôm nay có cột DV vàng (trừ y lệnh sắc thuốc thang). <b className="text-red-600 dark:text-red-400">Hoàn trả</b>: xóa. <b className="text-sky-600 dark:text-sky-400">Chờ thực hiện</b>: Sửa DVKT, thu hồi rồi xóa.
      </TabBar>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-3 py-3 sm:px-4" data-dv>
        {!scan ? (
          <EmptyState icon={<Stethoscope />} title="Chưa quét" text="Bấm Quét các ngày cũ: tool mở từng ngày có cột DV vàng và liệt kê thủ thuật Hoàn trả hoặc Chờ thực hiện. Chưa xóa gì cho tới khi anh/chị bấm Dọn." />
        ) : !all.length ? (
          <EmptyState icon={<Check />} title="Không còn gì cần dọn" text={`Quét lúc ${when(scan.at)}: ${scan.days.length ? `${scan.days.length} ngày cột DV vàng nhưng không có thủ thuật Hoàn trả hay Chờ thực hiện.` : 'không có ngày cũ nào cột DV vàng.'}`} />
        ) : (
          <div className="space-y-2.5">
            <div className="text-[11px] text-muted-foreground">Quét lúc {when(scan.at)} · bỏ tick mục nào không muốn dọn</div>
            {scan.days.filter((d) => d.items.length).map((d) => {
              const allOn = d.items.every((it) => !off.has(it.id));
              return (
                <div key={d.id} className="rounded-xl border border-border/50 bg-card/50" data-dv-day={d.tg}>
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => flip(d.items.map((x) => x.id), !allOn)}>
                    <Box on={allOn} />
                    <span className="text-sm font-bold">Y lệnh {d.tg}</span>
                    <Pill tone={/hoàn tất/i.test(d.status) ? 'success' : 'warning'}>{d.status}</Pill>
                    <span className="ml-auto text-[11px] text-muted-foreground">{d.items.length} mục{d.other ? ` · ${d.other} thủ thuật khác giữ nguyên` : ''}</span>
                  </button>
                  <div className="border-t border-border/40 px-3 py-1.5">
                    {d.items.map((it) => (
                      <button key={it.id} type="button" className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-muted/50" onClick={() => flip([it.id], off.has(it.id))} data-dv-item={it.name}>
                        <Box on={!off.has(it.id)} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold">{it.name}</div>
                          {it.moTa && <div className="truncate text-[11px] text-muted-foreground">{it.moTa}</div>}
                        </div>
                        {it.action === 'xoa' ? <Pill tone="error"><Trash2 />Hoàn trả · xóa</Pill> : <Pill tone="info"><Undo2 />Chờ thực hiện · thu hồi, xóa</Pill>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Sheet
        open={ask}
        onClose={() => setAsk(false)}
        title={`Dọn ${ticked.length} thủ thuật trên OneMES?`}
        footer={<><Button variant="outline" size="lg" onClick={() => setAsk(false)}>Hủy</Button><Button variant="destructive" size="lg" className="flex-1" onClick={clean} data-action="dv-confirm"><Eraser /> Dọn</Button></>}
      >
        <ul className="space-y-1.5 text-sm">
          <li><b>{ticked.filter((x) => x.action === 'xoa').length}</b> thủ thuật Hoàn trả: bấm xóa, chọn Có.</li>
          <li><b>{ticked.filter((x) => x.action === 'thuhoi').length}</b> thủ thuật Chờ thực hiện: mở Sửa DVKT, Thu hồi, rồi xóa.</li>
          <li className="text-xs text-muted-foreground">Y lệnh vẫn giữ Hoàn tất. Trước mỗi mục tool đọc lại trạng thái, mục nào đã đổi thì bỏ qua.{data?.settings.stepMode ? ' Chạy từng bước: tool dừng trước mỗi thao tác.' : ''}</li>
          <li className="text-xs text-red-600 dark:text-red-400">Xóa xong không lấy lại được.</li>
        </ul>
      </Sheet>
    </>
  );
}

function Box({ on }: { on: boolean }) {
  return (
    <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
      {on && <Check className="h-3 w-3" />}
    </span>
  );
}

// ---------------- Cập nhật kết quả cận lâm sàng ----------------
const nowParts = () => {
  const d = new Date();
  return { gio: `${p2(d.getHours())}:${p2(d.getMinutes())}`, ngay: `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` };
};
const okDay = (s: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return '';
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return d.getDate() === +m[1] && d.getMonth() === +m[2] - 1 ? `${p2(+m[1])}/${p2(+m[2])}/${m[3]}` : '';
};

interface ClsDraft { list: ClsList | null; dates: string[]; read: ClsRead | null; text: string; gio: string; ngay: string }
const drafts = new Map<string, ClsDraft>(); // kept while the app is open, per patient

export function ClsView({ patient }: { patient: Patient }) {
  const { data, state, call, toast } = useApp();
  const [d, setD] = useState<ClsDraft>(() => drafts.get(patient.noitruid) || { list: null, dates: [], read: null, text: '', ...nowParts() });
  const [ask, setAsk] = useState(false);
  useEffect(() => { drafts.set(patient.noitruid, d); }, [d, patient.noitruid]);
  const set = (p: Partial<ClsDraft>) => setD((x) => ({ ...x, ...p }));
  const reading = state.busy && state.task === 'Đọc kết quả CLS';
  const creating = state.busy && state.task === 'Tạo y lệnh kết quả CLS';
  const ngay = okDay(d.ngay);

  const list = async () => {
    const r = await call<ClsList>('cls:list', { patient }).catch(() => null);
    if (!r) return;
    set({ list: r, dates: r.dates.filter((x) => d.dates.includes(x)) });
    if (!r.dates.length) toast('info', 'Không thấy kết quả xét nghiệm hay CĐHA nào');
  };
  const read = async () => {
    const r = await call<ClsRead>('cls:read', { patient, dates: d.dates }).catch(() => null);
    if (!r) return;
    set({ read: r, text: r.text });
    if (!r.text) toast('info', 'Các ngày đã chọn không có chỉ số bất thường');
  };
  const create = async () => {
    setAsk(false);
    const thoiGian = `${d.gio} ${ngay}`;
    const r = await call<{ id: string; thoiGian: string }>('cls:create', { patient, thoiGian, dienBien: d.text }).catch(() => null);
    if (r) toast('success', `Đã tạo y lệnh ${r.thoiGian} trên OneMES`);
  };
  const toggle = (x: string) => set({ dates: d.dates.includes(x) ? d.dates.filter((y) => y !== x) : [...d.dates, x] });
  const count = (date: string) => (d.list?.rows || []).filter((r) => r.date.endsWith(date)).length;

  return (
    <>
      <TabBar
        actions={<>
          <Button variant="outline" size="sm" onClick={list} disabled={state.busy} data-action="cls-list">
            {reading && !d.list ? <Loader2 className="animate-spin" /> : <ScanLine />} {d.list ? 'Đọc lại ngày' : 'Đọc Xem kết quả'}
          </Button>
          <Button variant="outline" size="sm" onClick={read} disabled={state.busy || !d.dates.length} data-action="cls-read">
            {reading && d.list ? <Loader2 className="animate-spin" /> : <FlaskConical />} Lấy kết quả{d.dates.length ? ` ${d.dates.length} ngày` : ''}
          </Button>
          <Button variant="gradient" size="sm" onClick={() => setAsk(true)} disabled={state.busy || !d.text.trim() || !ngay} data-action="cls-create">
            {creating ? <Loader2 className="animate-spin" /> : <FilePlus2 />} Tạo y lệnh mới
          </Button>
        </>}
      >
        Lịch sử XN và Lịch sử CĐHA trong Xem kết quả: chỉ số màu đỏ hoặc xanh dương được ghi lại, chỉ số bình thường bỏ qua.
      </TabBar>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-3 py-3 sm:px-4" data-cls>
        {!d.list ? (
          <EmptyState icon={<FlaskConical />} title="Chưa đọc kết quả" text="Bấm Đọc Xem kết quả để lấy các ngày có kết quả, chọn ngày, rồi Lấy kết quả. Nội dung hiện ở đây để anh/chị sửa trước khi tạo y lệnh mới." />
        ) : (
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-xs font-bold">Chọn ngày có kết quả</div>
              {!d.list.dates.length ? (
                <div className="text-xs text-muted-foreground">Không có kết quả nào.</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {d.list.dates.map((x) => (
                    <button key={x} type="button" onClick={() => toggle(x)} data-cls-date={x}
                      className={cn('flex h-7 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors', d.dates.includes(x) ? 'border-primary bg-primary/15 text-primary' : 'border-border/60 hover:border-primary/40')}>
                      {d.dates.includes(x) && <Check className="h-3 w-3" />}{x}<span className="font-normal text-muted-foreground">· {count(x)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {d.read && (
              <div className="space-y-1" data-cls-results>
                {d.read.results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <Pill tone={r.kind === 'xn' ? 'active' : 'info'}>{r.kind === 'xn' ? 'XN' : 'CĐHA'}</Pill>
                    <span className="truncate font-semibold">{r.name}</span>
                    <span className="text-muted-foreground">{r.date}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground">
                      {r.kind === 'xn' ? (r.items?.length ? <span className="text-red-600 dark:text-red-400">{r.items.length}/{r.total} bất thường</span> : `${r.total} chỉ số bình thường`) : r.ketLuan ? 'có kết luận' : 'không có kết luận'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold">Nội dung y lệnh mới (Diễn biến bệnh)<span className="font-normal text-muted-foreground">sửa được</span></div>
              <Textarea value={d.text} onChange={(e) => set({ text: e.target.value })} rows={8} placeholder="Bấm Lấy kết quả, hoặc tự gõ" className="font-mono text-[12px]" data-field="cls-text" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold">Thời gian thực hiện</span>
              <div className="w-20"><TimeInput value={d.gio} onChange={(v) => set({ gio: v })} disabled={state.busy} /></div>
              <Input value={d.ngay} onChange={(e) => set({ ngay: e.target.value })} onBlur={() => ngay && set({ ngay })} placeholder="ngày/tháng/năm" className={cn('h-8 w-32 tabular-nums', !ngay && 'border-red-500')} data-field="cls-ngay" />
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => set(nowParts())}>Bây giờ</button>
              <span className="text-muted-foreground">thời gian chỉ định sớm hơn 1 phút</span>
            </div>
          </div>
        )}
      </div>
      <Sheet
        open={ask}
        onClose={() => setAsk(false)}
        title="Tạo y lệnh mới trên OneMES?"
        footer={<><Button variant="outline" size="lg" onClick={() => setAsk(false)}>Hủy</Button><Button size="lg" className="flex-1" onClick={create} data-action="cls-confirm"><FilePlus2 /> Tạo y lệnh</Button></>}
      >
        <p className="text-sm">Tool bấm <b>Thêm y lệnh mới</b>, đặt giờ thực hiện <b>{d.gio} {ngay}</b>, ghi nội dung dưới đây vào Diễn biến bệnh rồi bấm <b>Lưu</b>.{data?.settings.autoComplete ? ' Sau đó Hoàn tất (đang bật Tự Hoàn tất).' : ' Y lệnh để ở trạng thái Mới cho anh/chị kiểm tra.'}</p>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 p-2 text-xs">{d.text}</pre>
      </Sheet>
    </>
  );
}
