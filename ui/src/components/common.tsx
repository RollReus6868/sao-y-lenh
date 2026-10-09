import type { ReactNode } from 'react';
import { CheckCircle2, Info, Loader2, Pause, Play, Square, TriangleAlert, XCircle } from 'lucide-react';
import { cn } from '@/kit/cn';
import { Button } from '@/kit/ui';
import { useApp, useLog } from '@/lib/useApp';

// A layer over the control column only (never `fixed`: the OneMES view would hide it).
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-background/70 p-3 animate-in fade-in-0" onMouseDown={onClose} data-sheet>
      <div className="solid-panel max-h-[85%] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4" onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-border/50 px-4 py-3 font-bold">{title}</div>
        <div className="scroll-thin max-h-[60vh] overflow-auto p-4">{children}</div>
        {footer && <div className="flex gap-2 border-t border-border/50 p-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  const icon = { success: <CheckCircle2 className="text-emerald-500" />, error: <XCircle className="text-red-500" />, warning: <TriangleAlert className="text-amber-500" />, info: <Info className="text-sky-500" /> };
  return (
    <div className="pointer-events-none absolute right-4 top-4 z-40 w-[360px] max-w-[calc(100%-2rem)] flex flex-col items-stretch gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="solid-panel pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 text-sm shadow-xl animate-in slide-in-from-top-2 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
          {icon[t.tone]}
          <span className="min-w-0 break-words">{t.text}</span>
        </div>
      ))}
    </div>
  );
}

export function levelTone(l: string) {
  return l === 'ok' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' : l === 'warn' ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10' : l === 'error' ? 'text-red-600 dark:text-red-400 bg-red-500/10' : 'text-sky-600 dark:text-sky-400 bg-sky-500/10';
}
export const levelLabel: Record<string, string> = { ok: 'XONG', warn: 'BỎ QUA', error: 'LỖI', info: 'TIN' };
export const clock = (t: number) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// Shown in the action bar while the tool works: progress, current step, Stop / Continue.
export function RunBar({ onBrowser }: { onBrowser?: () => void }) {
  const { state, call } = useApp();
  const log = useLog();
  const last = log.slice(-3);
  const p = state.progress;
  return (
    <div className="space-y-3" data-runbar>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="gradient-progress progress-animated h-full rounded-full transition-all" style={{ width: p ? `${Math.max(8, ((p.index + 0.5) / p.total) * 100)}%` : '40%' }} />
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
        <span className="min-w-0 flex-1 truncate font-semibold">
          {state.task}
          {p && p.total > 1 ? ` · ${p.index + 1}/${p.total}` : ''}
          {p ? ` · ${p.patient}` : ''}
        </span>
        {onBrowser && <button type="button" onClick={onBrowser} className="shrink-0 text-xs font-semibold text-primary hover:underline">Xem trình duyệt</button>}
      </div>
      {state.stepWaiting && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          <Pause className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">Bước tiếp: <b>{state.stepWaiting}</b></span>
        </div>
      )}
      <div className="space-y-1">
        {last.map((e, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn('rounded px-1.5 py-px text-[10px] font-bold', levelTone(e.level))}>{levelLabel[e.level]}</span>
            <span className="truncate">{e.msg}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {state.stepWaiting && (
          <Button variant="gradient" size="xl" className="flex-1" onClick={() => call('step:continue')} data-action="continue">
            <Play /> Làm bước này
          </Button>
        )}
        <Button variant="destructive" size="xl" className={state.stepWaiting ? '' : 'flex-1'} onClick={() => call('stop')} data-action="stop">
          <Square /> Dừng
        </Button>
      </div>
    </div>
  );
}

export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="flex-shrink-0 border-t border-border/50 p-3 sm:p-4">{children}</div>;
}
