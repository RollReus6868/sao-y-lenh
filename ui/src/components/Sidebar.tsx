import { ChevronLeft, ChevronRight, Moon, Sun, Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@/kit/cn';
import { useTheme } from '@/kit/theme';

export interface NavItem { id: string; label: string; icon: LucideIcon; badge?: number }

function Item({ it, active, collapsed, onClick }: { it: NavItem; active: boolean; collapsed: boolean; onClick: () => void }) {
  const Icon = it.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? it.label : undefined}
      data-nav={it.id}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200',
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        collapsed && 'justify-center px-0'
      )}
    >
      {active && <span className="absolute left-0 h-5 w-1 rounded-r-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.5)]" />}
      <Icon className="h-5 w-5 shrink-0 transition-transform group-hover:scale-110" />
      {!collapsed && <span className="truncate">{it.label}</span>}
      {!!it.badge && (
        <span className={cn('rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground', collapsed ? 'absolute right-1.5 top-1' : 'ml-auto')}>{it.badge}</span>
      )}
    </button>
  );
}

export function Sidebar({ items, bottom, active, onSelect, collapsed, setCollapsed, update, onUpdate }: {
  items: NavItem[]; bottom: NavItem[]; active: string; onSelect: (id: string) => void;
  collapsed: boolean; setCollapsed: (v: boolean) => void; update?: string; onUpdate: () => void;
}) {
  const { mode, setMode } = useTheme();
  return (
    <aside className={cn('glass-panel flex shrink-0 flex-col p-2 transition-[width] duration-300', collapsed ? 'w-[60px]' : 'w-[180px]')}>
      <div className={cn('flex items-center gap-2.5 px-1.5 pb-4 pt-2', collapsed && 'justify-center px-0')}>
        <div className="btn-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[13px] font-black shadow-sm">YL</div>
        {!collapsed && <div className="gradient-text truncate text-[15px] font-extrabold">Sao Y Lệnh</div>}
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map((it) => <Item key={it.id} it={it} active={active === it.id} collapsed={collapsed} onClick={() => onSelect(it.id)} />)}
      </nav>
      <div className="flex flex-col gap-1">
        {update && (
          <button type="button" onClick={onUpdate} title={`Có bản mới ${update}`} className={cn('flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/15', collapsed && 'justify-center px-0')}>
            <Sparkles className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">Bản mới {update}</span>}
          </button>
        )}
        {bottom.map((it) => <Item key={it.id} it={it} active={active === it.id} collapsed={collapsed} onClick={() => onSelect(it.id)} />)}
        <div className={cn('flex items-center gap-1 pt-1', collapsed ? 'flex-col' : 'justify-between px-1')}>
          <button type="button" aria-label="Đổi sáng tối" title={mode === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'} onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted/60">
            {mode === 'dark' ? <Sun className="h-[18px] w-[18px] text-amber-400" /> : <Moon className="h-[18px] w-[18px] text-indigo-400" />}
          </button>
          <button type="button" aria-label="Thu gọn" onClick={() => setCollapsed(!collapsed)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
