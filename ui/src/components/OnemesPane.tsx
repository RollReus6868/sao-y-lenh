import { useEffect, useRef } from 'react';
import { ArrowLeft, Globe, Home, Loader2, RotateCw } from 'lucide-react';
import { api, isDemo } from '@/lib/api';
import { useApp } from '@/lib/useApp';
import { Button } from '@/kit/ui';

// The real OneMES page is a native view painted over the placeholder; we only report
// where the placeholder is. Nothing from this UI may overlap it.
export function OnemesPane() {
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
    return () => { ro.disconnect(); window.removeEventListener('resize', send); clearInterval(t); };
  }, []);

  const nav = (action: string) => api.call('view:nav', { action }).catch(() => {});
  return (
    <section className="glass-panel flex min-w-0 flex-1 flex-col overflow-hidden" data-pane="onemes">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border/50 px-2">
        <Button variant="ghost" size="icon-sm" aria-label="Lùi" title="Lùi" disabled={!state.canGoBack} onClick={() => nav('back')}><ArrowLeft /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Tải lại" title="Tải lại" onClick={() => nav('reload')}><RotateCw /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Trang đầu OneMES" title="Trang đầu OneMES" onClick={() => nav('home')}><Home /></Button>
        <div className="ml-1 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md bg-muted/50 px-2.5 text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{state.viewUrl || 'OneMES'}</span>
        </div>
        {state.busy && (
          <span className="flex items-center gap-1.5 px-2 text-xs font-semibold text-primary"><Loader2 className="h-3.5 w-3.5 animate-spin" />Tool đang thao tác</span>
        )}
      </div>
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
