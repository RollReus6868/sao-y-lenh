import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Globe, Home, ListOrdered, Loader2, RotateCw, X } from 'lucide-react';
import { api, isDemo } from '@/lib/api';
import { useApp } from '@/lib/useApp';
import { Button } from '@/kit/ui';

// The real OneMES page is a native view painted over the placeholder; we only report
// where the placeholder is. App shows the view only while this page is open.
export function BrowserPage() {
  const { state } = useApp();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = '';
    const send = () => {
      const r = el.getBoundingClientRect();
      const b = { x: r.left, y: r.top, width: r.width, height: r.height };
      const k = JSON.stringify(b);
      if (k !== last) {
        last = k;
        api.call('view:bounds', b).catch(() => {});
      }
    };
    const ro = new ResizeObserver(send);
    ro.observe(el);
    window.addEventListener('resize', send);
    const t = setInterval(send, 400); // sidebar width animates
    send();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', send);
      clearInterval(t);
    };
  }, []);

  // Errors go in a strip above the page: the OneMES view covers the usual toasts.
  const [err, setErr] = useState('');
  const [going, setGoing] = useState(false);
  const nav = async (action: string) => {
    setErr('');
    if (action === 'list') setGoing(true);
    try {
      await api.call('view:nav', { action });
    } catch (e) {
      setErr(String((e as Error)?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setGoing(false);
    }
  };
  return (
    <section className="glass-panel flex min-w-0 flex-1 flex-col overflow-hidden" data-pane="onemes">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border/50 px-2">
        <Button variant="ghost" size="icon-sm" aria-label="Lùi" title="Lùi" disabled={!state.canGoBack} onClick={() => nav('back')}><ArrowLeft /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Tải lại" title="Tải lại" onClick={() => nav('reload')}><RotateCw /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Trang đầu OneMES" title="Trang đầu OneMES" onClick={() => nav('home')}><Home /></Button>
        <div className="mx-1 flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md bg-muted/50 px-2.5 text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{state.viewUrl || 'OneMES'}</span>
        </div>
        {state.busy && !going && (
          <span className="flex items-center gap-1.5 px-2 text-xs font-semibold text-primary"><Loader2 className="h-3.5 w-3.5 animate-spin" />Tool đang thao tác</span>
        )}
        <Button variant="gradient" size="sm" onClick={() => nav('list')} disabled={state.busy || going} data-action="goto-list">
          {going ? <Loader2 className="animate-spin" /> : <ListOrdered />} Ds Điều trị nội trú
        </Button>
      </div>
      {err && (
        <div className="flex shrink-0 items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400" data-nav-error>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">{err}</span>
          <button type="button" aria-label="Đóng" onClick={() => setErr('')} className="rounded p-0.5 hover:bg-red-500/20"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      <div ref={ref} className="relative min-h-0 flex-1 bg-white">
        {isDemo && (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-[#f3f3f4] text-sm text-zinc-500">
            <Globe className="h-8 w-8 text-zinc-400" />
            <div className="font-semibold text-zinc-600">Trang OneMES hiện ở đây</div>
            <div>Đăng nhập OneMES trong khung này như trên Chrome.</div>
          </div>
        )}
      </div>
    </section>
  );
}
