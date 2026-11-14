// Y lệnh mẫu (0.7.0, user request): order pages saved as HTML become examples the user
// edits here (every field, every drug line), then a new order is created on OneMES like
// the example: the form filled, Lưu, drugs through Kê Tây y/VTYT. No DVKT (user, 2026-11-14).
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileInput, Globe, FilePlus2, FileStack, Loader2, PencilLine, Pill as PillIcon, Plus, Save, Trash2 } from 'lucide-react';
import { cn } from '@/kit/cn';
import { Button, EmptyState, Input, Pill, Select, Textarea } from '@/kit/ui';
import { useApp } from '@/lib/useApp';
import type { MauCreateResult, MauThuoc, Patient, Picked, YLenhMau } from '@/lib/types';
import { mauFromFile } from '@/lib/yLenhMau';
import { Sheet } from '@/components/common';
import { TimeInput } from '@/components/OrderFields';
import { TabBar } from '@/pages/DvCls';

const p2 = (n: number) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`; };
// "12/10/2026", "12/10" (this year) -> "12/10/2026"; '' when not a real day.
function okDay(s: string) {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\s*$/.exec(s || '');
  if (!m) return '';
  const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear();
  const d = new Date(y, +m[2] - 1, +m[1]);
  return d.getDate() === +m[1] && d.getMonth() === +m[2] - 1 ? `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${y}` : '';
}
const fold = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/^bs\.?\s*/, '').replace(/\s+/g, ' ').trim();
const uid = () => Math.random().toString(36).slice(2, 10);
const blankThuoc = (): MauThuoc => ({ id: uid(), ten: '', kho: '', loai: 'KÊ LĨNH', sl: '1', cachDung: '', haoPhi: false, tuTra: false });

interface Draft { mau: YLenhMau | null; dirty: boolean; ngay: string; result: MauCreateResult | null }
const drafts = new Map<string, Draft>(); // per patient, while the app is open
let lastMau = '';

export function MauView({ patient, onBrowser }: { patient: Patient; onBrowser: () => void }) {
  const { data, state, call, toast, setData } = useApp();
  const maus = data?.yLenhMaus || [];
  const [d, setD] = useState<Draft>(() => drafts.get(patient.noitruid) || { mau: null, dirty: false, ngay: today(), result: null });
  const [ask, setAsk] = useState<null | 'create' | 'rename' | 'delete' | 'switch'>(null);
  const [nameText, setNameText] = useState('');
  const [want, setWant] = useState('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { drafts.set(patient.noitruid, d); }, [d, patient.noitruid]);
  // The example last used anywhere is where a patient starts.
  useEffect(() => {
    if (d.mau || !maus.length) return;
    const m = maus.find((x) => x.id === lastMau) || maus[0];
    setD((x) => ({ ...x, mau: structuredClone(m), dirty: false }));
  }, [maus.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = d.mau;
  const set = (p: Partial<YLenhMau>) => setD((x) => (x.mau ? { ...x, mau: { ...x.mau, ...p }, dirty: true } : x));
  const setThuoc = (i: number, p: Partial<MauThuoc>) => m && set({ thuoc: m.thuoc.map((t, k) => (k === i ? { ...t, ...p } : t)) });
  const creating = state.busy && state.task === 'Tạo y lệnh theo mẫu';
  const ngay = okDay(d.ngay);

  // Doctor and care level: the example's choice, or found by name in the lists from OneMES.
  const lists = data?.lists;
  const favs = data?.settings.bacSiFav || [];
  const doctors = [...favs, ...(lists?.bacSi || []).filter((x) => !favs.some((f) => f.id === x.id))];
  const care = (lists?.capDo || []).map((x) => ({ id: x.id, text: x.text }));
  const bacSi: Picked | null = m ? m.bacSi || (() => { const h = doctors.find((x) => fold(x.name) === fold(m.bacSiTen || '')); return h ? { id: h.id, text: h.name } : null; })() : null;
  const capDo: Picked | null = m ? m.capDo || care.find((x) => fold(x.text) === fold(m.capDoTen || '') || fold(x.text).endsWith(fold(m.capDoTen || '-'))) || null : null;

  const saveList = async (list: YLenhMau[]) => {
    const r = await call<YLenhMau[]>('ylMau:set', list);
    setData((x) => x && { ...x, yLenhMaus: r });
    return r;
  };
  const choose = (id: string) => {
    const x = maus.find((y) => y.id === id);
    if (!x) return;
    lastMau = id;
    setD((y) => ({ ...y, mau: structuredClone(x), dirty: false, result: null }));
  };
  const pick = (id: string) => {
    if (d.dirty) { setWant(id); setAsk('switch'); } else choose(id);
  };
  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const got: YLenhMau[] = [];
    const bad: string[] = [];
    for (const f of Array.from(files)) {
      try {
        got.push(await mauFromFile(f));
      } catch (e) {
        bad.push(`${f.name}: ${(e as Error).message}`);
      }
    }
    if (file.current) file.current.value = '';
    if (got.length) {
      await saveList([...maus, ...got]);
      lastMau = got[0].id;
      setD((x) => ({ ...x, mau: structuredClone(got[0]), dirty: false, result: null }));
      toast('success', `Đã thêm ${got.length} mẫu y lệnh${got.length > 1 ? ` (đang mở "${got[0].name}")` : ''}`);
    }
    if (bad.length) toast('error', bad.join('\n'));
  };
  const saveMau = async (asNew: boolean) => {
    if (!m) return;
    const keep: YLenhMau = { ...m, bacSi: bacSi, capDo: capDo, at: Date.now() };
    if (asNew) {
      const nw = { ...keep, id: 'yl-' + Date.now().toString(36) + uid().slice(0, 4), name: nameText.trim() || `${m.name} (sửa)` };
      await saveList([...maus, nw]);
      lastMau = nw.id;
      setD((x) => ({ ...x, mau: structuredClone(nw), dirty: false }));
      toast('success', `Đã lưu thành mẫu mới "${nw.name}"`);
    } else {
      await saveList(maus.map((x) => (x.id === m.id ? keep : x)));
      setD((x) => ({ ...x, mau: structuredClone(keep), dirty: false }));
      toast('success', `Đã lưu mẫu "${m.name}"`);
    }
    setAsk(null);
  };
  const rename = async () => {
    if (!m || !nameText.trim()) return;
    const name = nameText.trim();
    await saveList(maus.map((x) => (x.id === m.id ? { ...x, name } : x)));
    setD((x) => (x.mau ? { ...x, mau: { ...x.mau, name } } : x));
    setAsk(null);
  };
  const remove = async () => {
    if (!m) return;
    const list = await saveList(maus.filter((x) => x.id !== m.id));
    setD((x) => ({ ...x, mau: list[0] ? structuredClone(list[0]) : null, dirty: false, result: null }));
    toast('info', `Đã xóa mẫu "${m.name}"`);
    setAsk(null);
  };
  const create = async () => {
    setAsk(null);
    if (!m) return;
    // An unresolved name leaves OneMES's own choice; an empty one clears Cấp độ chăm sóc.
    const mau = {
      name: m.name,
      thoiGianThucHien: `${m.gio} ${ngay}`,
      dienBien: m.dienBien,
      dienBienPHCN: m.dienBienPHCN,
      yLenhKhac: m.yLenhKhac,
      bacSi: bacSi || undefined,
      capDo: capDo || (m.capDoTen ? undefined : null),
      thuoc: m.thuoc.filter((t) => t.ten.trim()),
    };
    const r = await call<MauCreateResult>('ylMau:create', { patient, mau }).catch(() => null);
    if (!r) return;
    setD((x) => ({ ...x, result: r }));
    toast(r.failed.length ? 'warning' : 'success', r.failed.length ? `Đã tạo y lệnh ${r.thoiGian}, còn ${r.failed.length} thuốc chưa thêm được (xem bên dưới)` : `Đã tạo y lệnh ${r.thoiGian} theo mẫu`);
  };
  const thuocBad = m ? m.thuoc.filter((t) => t.ten.trim() && !t.kho.trim()).length : 0;

  const lbl = 'mb-1 block text-[11px] font-semibold text-muted-foreground';
  return (
    <>
      <input ref={file} type="file" multiple accept=".html,.htm,text/html" className="hidden" onChange={(e) => importFiles(e.target.files)} data-input="yl-mau-file" />
      <TabBar
        actions={<>
          <Button variant="outline" size="sm" onClick={() => file.current?.click()} disabled={state.busy} data-action="yl-import"><FileInput /> Nhập file HTML</Button>
          <Button variant="outline" size="sm" onClick={() => saveMau(false)} disabled={!m || !d.dirty} data-action="yl-save"><Save /> Lưu mẫu</Button>
          <Button variant="gradient" size="sm" onClick={() => setAsk('create')} disabled={!m || state.busy || !ngay || !/^\d{2}:\d{2}$/.test(m?.gio || '') || !!thuocBad} data-action="yl-create">
            {creating ? <Loader2 className="animate-spin" /> : <FilePlus2 />} Tạo y lệnh
          </Button>
        </>}
      >
        Nhập trang y lệnh đã lưu (Ctrl+S khi đang mở y lệnh trên OneMES), chọn được nhiều file một lần. Sửa mọi mục rồi Tạo y lệnh: tool thêm y lệnh mới cho bệnh nhân này giống mẫu (các ô và thuốc/VTYT, không có DVKT).
      </TabBar>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-3 py-3 sm:px-4" data-yl-mau>
        {!m ? (
          <EmptyState icon={<FileStack />} title="Chưa có mẫu y lệnh" text="Mở một y lệnh trên OneMES, bấm Ctrl+S (Trang web, hoàn chỉnh) để lưu, rồi bấm Nhập file HTML và chọn file đó. Chọn nhiều file để thêm nhiều mẫu một lần." action={<Button variant="outline" size="sm" onClick={() => file.current?.click()}><FileInput /> Nhập file HTML</Button>} />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold">Mẫu</span>
              <Select className="h-8 min-w-0 max-w-[260px] flex-1 text-xs" value={m.id} onChange={(e) => pick(e.target.value)} disabled={state.busy} data-field="yl-mau">
                {maus.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                {!maus.some((x) => x.id === m.id) && <option value={m.id}>{m.name}</option>}
              </Select>
              {d.dirty && <Pill tone="warning">chưa lưu</Pill>}
              <Button variant="ghost" size="xs" onClick={() => { setNameText(m.name); setAsk('rename'); }} data-action="yl-rename"><PencilLine /> Đổi tên</Button>
              <Button variant="ghost" size="xs" onClick={() => { setNameText(`${m.name} (sửa)`); setAsk('switch'); setWant(''); }} disabled={!d.dirty} title="Giữ mẫu cũ, lưu bản đang sửa thành mẫu khác" data-action="yl-save-new"><Plus /> Lưu thành mẫu mới</Button>
              <Button variant="ghost" size="xs" className="text-red-600 dark:text-red-400" onClick={() => setAsk('delete')} data-action="yl-delete"><Trash2 /> Xóa mẫu</Button>
            </div>

            {m.note && <div className="flex gap-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400" data-yl-note><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{m.note}</div>}
            <div className="rounded-xl border border-border/50 bg-card/50 p-3" data-yl-fields>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                <div>
                  <span className={lbl}>Thời gian thực hiện</span>
                  <div className="flex gap-1.5">
                    <div className="w-20 shrink-0"><TimeInput value={m.gio} onChange={(v) => set({ gio: v })} disabled={state.busy} /></div>
                    <Input value={d.ngay} onChange={(e) => setD((x) => ({ ...x, ngay: e.target.value }))} onBlur={() => ngay && setD((x) => ({ ...x, ngay }))} placeholder="ngày/tháng/năm" className={cn('h-8 min-w-0 tabular-nums', !ngay && 'border-red-500')} data-field="yl-ngay" />
                  </div>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">Chỉ định sớm hơn 1 phút. Ngày không lưu vào mẫu.</span>
                </div>
                <label className="block min-w-0">
                  <span className={lbl}>Cấp độ chăm sóc</span>
                  <Select className="h-8 w-full text-[13px]" value={capDo?.id || ''} disabled={state.busy} data-field="yl-capDo"
                    onChange={(e) => { const c = care.find((x) => x.id === e.target.value); set({ capDo: c || null, capDoTen: c ? c.text : '' }); }}>
                    <option value="">(trống)</option>
                    {capDo && !care.some((x) => x.id === capDo.id) && <option value={capDo.id}>{capDo.text}</option>}
                    {care.map((x) => <option key={x.id} value={x.id}>{x.text}</option>)}
                  </Select>
                  {!capDo && m.capDoTen && <span className="mt-0.5 block text-[10px] text-amber-600 dark:text-amber-400">Mẫu ghi "{m.capDoTen}", chưa tìm thấy trong danh sách: giữ như OneMES điền.</span>}
                </label>
                <label className="col-span-2 block min-w-0">
                  <span className={lbl}>Bác sĩ</span>
                  <Select className="h-8 w-full text-[13px]" value={bacSi?.id || ''} disabled={state.busy} data-field="yl-bacSi"
                    onChange={(e) => { const h = doctors.find((x) => x.id === e.target.value); set({ bacSi: h ? { id: h.id, text: h.name } : null, bacSiTen: h ? h.name : '' }); }}>
                    <option value="">(để như OneMES điền)</option>
                    {bacSi && !doctors.some((x) => x.id === bacSi.id) && <option value={bacSi.id}>{bacSi.text}</option>}
                    {favs.length > 0 && <optgroup label="Hay dùng">{favs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>}
                    {doctors.length > favs.length && <optgroup label={favs.length ? 'Các bác sĩ khác' : 'Bác sĩ'}>{doctors.slice(favs.length).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>}
                  </Select>
                  {!bacSi && m.bacSiTen && <span className="mt-0.5 block text-[10px] text-amber-600 dark:text-amber-400">Mẫu ghi "{m.bacSiTen}", chưa tìm thấy trong danh sách bác sĩ{lists ? '' : ' (danh sách đọc khi mở thẻ Sao chép lần đầu)'}: hãy chọn tay.</span>}
                </label>
                <label className="col-span-2 block min-w-0">
                  <span className={lbl}>Diễn biến bệnh</span>
                  <Textarea rows={3} value={m.dienBien} onChange={(e) => set({ dienBien: e.target.value })} disabled={state.busy} className="text-[13px]" data-field="yl-dienBien" />
                </label>
                <label className="col-span-2 block min-w-0">
                  <span className={lbl}>Diễn biến PHCN</span>
                  <Textarea rows={2} value={m.dienBienPHCN} onChange={(e) => set({ dienBienPHCN: e.target.value })} disabled={state.busy} className="text-[13px]" data-field="yl-dienBienPHCN" />
                </label>
                <label className="col-span-2 block min-w-0">
                  <span className={lbl}>Y lệnh khác</span>
                  <Textarea rows={2} value={m.yLenhKhac} onChange={(e) => set({ yLenhKhac: e.target.value })} disabled={state.busy} className="text-[13px]" data-field="yl-yLenhKhac" />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-card/50 p-3" data-yl-thuoc>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary [&_svg]:size-3.5"><PillIcon /> Cho thuốc / VTYT <span className="font-semibold text-muted-foreground">({m.thuoc.length})</span>
                <Button variant="ghost" size="xs" className="ml-auto normal-case tracking-normal" onClick={() => set({ thuoc: [...m.thuoc, blankThuoc()] })} disabled={state.busy} data-action="yl-add-thuoc"><Plus /> Thêm dòng</Button>
              </div>
              {!m.thuoc.length && <div className="text-xs text-muted-foreground">Mẫu không có thuốc / VTYT nào.</div>}
              <div className="space-y-2">
                {m.thuoc.map((t, i) => (
                  <div key={t.id} className="rounded-lg bg-muted/30 p-2" data-yl-thuoc-row={t.ten}>
                    <div className="flex items-center gap-1.5">
                      <Input value={t.ten} onChange={(e) => setThuoc(i, { ten: e.target.value })} placeholder="Tên thuốc / VTYT (như trong Kê đơn)" className="h-8 min-w-0 flex-1 text-[13px] font-semibold" disabled={state.busy} data-field="ten" />
                      <span className="text-[11px] text-muted-foreground">SL</span>
                      <Input value={t.sl} onChange={(e) => setThuoc(i, { sl: e.target.value })} className="h-8 w-14 text-center tabular-nums" disabled={state.busy} data-field="sl" />
                      <Button variant="ghost" size="icon" aria-label={`Bỏ ${t.ten || 'dòng này'}`} title="Bỏ dòng này" onClick={() => set({ thuoc: m.thuoc.filter((_, k) => k !== i) })} disabled={state.busy}><Trash2 /></Button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Input value={t.kho} onChange={(e) => setThuoc(i, { kho: e.target.value })} placeholder="Kho (ví dụ KCPSX)" className={cn('h-8 min-w-[140px] flex-1 text-xs', t.ten.trim() && !t.kho.trim() && 'border-red-500')} disabled={state.busy} data-field="kho" />
                      <Select value={t.loai} onChange={(e) => setThuoc(i, { loai: e.target.value })} className="h-8 w-[110px] text-xs" disabled={state.busy} data-field="loai">
                        <option value="KÊ LĨNH">Kê lĩnh</option>
                        <option value="TỦ TRỰC">Tủ trực</option>
                      </Select>
                      <label className="flex items-center gap-1 text-[11px] font-semibold"><input type="checkbox" checked={t.haoPhi} onChange={(e) => setThuoc(i, { haoPhi: e.target.checked, tuTra: e.target.checked ? false : t.tuTra })} disabled={state.busy} data-field="haoPhi" /> Hao phí</label>
                      <label className="flex items-center gap-1 text-[11px] font-semibold"><input type="checkbox" checked={t.tuTra} onChange={(e) => setThuoc(i, { tuTra: e.target.checked, haoPhi: e.target.checked ? false : t.haoPhi })} disabled={state.busy} data-field="tuTra" /> Tự trả</label>
                      {(t.hamLuong || t.dvt) && <span className="truncate text-[11px] text-muted-foreground">{[t.hamLuong, t.dvt].filter(Boolean).join(' · ')}</span>}
                    </div>
                    <Input value={t.cachDung} onChange={(e) => setThuoc(i, { cachDung: e.target.value })} placeholder="Cách dùng" className="mt-1.5 h-8 text-xs" disabled={state.busy} data-field="cachDung" />
                  </div>
                ))}
              </div>
            </div>

            {d.result && (
              <div className="rounded-xl border border-border/50 bg-card/50 p-3 text-xs" data-yl-result>
                <div className="mb-1.5 flex items-center gap-2">
                  {d.result.failed.length ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  <span className="font-bold">Đã tạo y lệnh {d.result.thoiGian}</span>
                  <Pill tone={/hoàn tất/i.test(d.result.status) ? 'success' : 'warning'}>{d.result.status}</Pill>
                </div>
                {d.result.added.length > 0 && <div className="text-emerald-700 dark:text-emerald-400">Đã thêm {d.result.added.length} thuốc/VTYT: {d.result.added.join(', ')}</div>}
                {d.result.failed.map((f) => <div key={f.ten} className="text-red-600 dark:text-red-400" data-yl-failed>Chưa thêm được "{f.ten}": {f.message}</div>)}
                {d.result.open && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-muted-foreground">Y lệnh đang mở sẵn trong Trình duyệt để anh/chị kê nốt.</span>
                    <Button variant="outline" size="xs" onClick={onBrowser} data-action="yl-open-browser"><Globe /> Mở Trình duyệt</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Sheet open={ask === 'create'} onClose={() => setAsk(null)} title={`Tạo y lệnh mới cho ${patient.hoTen}?`}
        footer={<><Button variant="outline" size="lg" onClick={() => setAsk(null)}>Hủy</Button><Button size="lg" className="flex-1" onClick={create} data-action="yl-confirm"><FilePlus2 /> Tạo y lệnh</Button></>}>
        {m && (
          <ol className="space-y-1.5 text-sm">
            <li>Bấm <b>Thêm y lệnh mới</b>, giờ thực hiện <b>{m.gio} {ngay}</b> (chỉ định sớm hơn 1 phút){bacSi ? `, bác sĩ ${bacSi.text}` : ''}{capDo ? `, cấp độ ${capDo.text}` : m.capDoTen ? '' : ', để trống cấp độ chăm sóc'}; điền diễn biến{m.yLenhKhac.trim() ? ', y lệnh khác' : ''} rồi <b>Lưu</b>.</li>
            {m.thuoc.some((t) => t.ten.trim()) && <li>Kê {m.thuoc.filter((t) => t.ten.trim()).length} thuốc/VTYT qua <b>Kê Tây y/VTYT</b>: {m.thuoc.filter((t) => t.ten.trim()).map((t) => `${t.ten} ×${t.sl}${t.haoPhi ? ' (hao phí)' : t.tuTra ? ' (tự trả)' : ''}`).join(', ')}.</li>}
            <li className="text-xs text-muted-foreground">{data?.settings.autoComplete ? 'Kê đủ thuốc thì tool Hoàn tất y lệnh (đang bật Tự Hoàn tất).' : 'Y lệnh để ở trạng thái Mới cho anh/chị kiểm tra.'} OneMES hỏi "Bệnh chính này không được khuyến khích" thì tool bấm Có.</li>
          </ol>
        )}
      </Sheet>
      <Sheet open={ask === 'rename'} onClose={() => setAsk(null)} title="Đổi tên mẫu"
        footer={<><Button variant="outline" size="lg" onClick={() => setAsk(null)}>Hủy</Button><Button size="lg" className="flex-1" disabled={!nameText.trim()} onClick={rename}>Lưu tên</Button></>}>
        <Input autoFocus value={nameText} onChange={(e) => setNameText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && rename()} data-field="yl-name" />
      </Sheet>
      <Sheet open={ask === 'delete'} onClose={() => setAsk(null)} title={`Xóa mẫu "${m?.name || ''}"?`}
        footer={<><Button variant="outline" size="lg" onClick={() => setAsk(null)}>Hủy</Button><Button variant="destructive" size="lg" className="flex-1" onClick={remove} data-action="yl-delete-confirm"><Trash2 /> Xóa</Button></>}>
        <p className="text-sm text-muted-foreground">Chỉ xóa mẫu trong tool, không đụng gì trên OneMES.</p>
      </Sheet>
      <Sheet open={ask === 'switch'} onClose={() => setAsk(null)} title={want ? 'Mẫu đang sửa chưa lưu' : 'Lưu thành mẫu mới'}
        footer={<>
          <Button variant="outline" size="lg" onClick={() => setAsk(null)}>Hủy</Button>
          {want && <Button variant="outline" size="lg" onClick={() => { choose(want); setAsk(null); }}>Bỏ phần sửa</Button>}
          {want && <Button size="lg" className="flex-1" onClick={async () => { await saveMau(false); choose(want); }}>Lưu rồi chuyển</Button>}
          {!want && <Button size="lg" className="flex-1" disabled={!nameText.trim()} onClick={() => saveMau(true)} data-action="yl-save-new-confirm">Lưu mẫu mới</Button>}
        </>}>
        {want ? <p className="text-sm">Mẫu "{m?.name}" có phần sửa chưa lưu.</p> : <Input autoFocus value={nameText} onChange={(e) => setNameText(e.target.value)} placeholder="Tên mẫu mới" data-field="yl-new-name" />}
      </Sheet>
    </>
  );
}
