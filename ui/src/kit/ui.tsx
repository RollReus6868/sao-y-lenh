import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'gradient' | 'default' | 'outline' | 'ghost' | 'subtle' | 'soft' | 'destructive' | 'dashed';
type Size = 'xs' | 'sm' | 'default' | 'lg' | 'xl' | 'icon' | 'icon-sm' | 'icon-xl';
const variants: Record<Variant, string> = {
  gradient: 'btn-gradient font-semibold shadow-sm',
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'border border-border/70 bg-background/40 hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  subtle: 'bg-muted/70 text-foreground hover:bg-muted',
  soft: 'border border-dashed border-primary/40 bg-primary/5 text-primary hover:bg-primary/10',
  destructive: 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border border-red-500/20',
  dashed: 'border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40',
};
const sizes: Record<Size, string> = {
  xs: 'h-7 px-2 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  default: 'h-9 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-10 px-5 text-sm gap-2 rounded-xl',
  xl: 'h-12 px-6 text-[15px] gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
  'icon-sm': 'h-7 w-7 rounded-md',
  'icon-xl': 'h-12 w-12 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ variant = 'default', size = 'default', className, ...p }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
      variants[variant],
      sizes[size],
      className
    )}
    {...p}
  />
));

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-primary' : 'bg-muted-foreground/30')}
    >
      <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select
    ref={ref}
    className={cn('h-9 rounded-md border border-input bg-background/60 px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50', className)}
    {...p}
  />
));

export function Input({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('h-9 w-full rounded-md border border-input bg-background/60 px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40', className)} {...p} />;
}

export function Segmented<T extends string | number>({ value, options, onChange, disabled }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-lg bg-muted/60 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn('h-7 min-w-8 rounded-md px-2.5 text-xs font-semibold transition-all disabled:opacity-50', value === o.value ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'muted' | 'active';
const tones: Record<Tone, string> = {
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  error: 'bg-red-500/10 text-red-600 dark:text-red-400',
  info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  muted: 'bg-muted text-muted-foreground',
  active: 'bg-primary/10 text-primary',
};
export function Pill({ tone = 'muted', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold [&_svg]:size-3', tones[tone], className)}>{children}</span>;
}
export function Chip({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return <span title={title} className={cn('inline-flex items-center gap-1 rounded-md bg-muted/70 px-1.5 py-0.5 text-[11px] text-muted-foreground [&_svg]:size-3', className)}>{children}</span>;
}

const tileColors: Record<string, string> = {
  theme: 'bg-primary/10 text-primary',
  emerald: 'bg-emerald-500/10 text-emerald-500',
  amber: 'bg-amber-500/10 text-amber-500',
  sky: 'bg-sky-500/10 text-sky-500',
  violet: 'bg-violet-500/10 text-violet-500',
  red: 'bg-red-500/10 text-red-500',
  slate: 'bg-slate-500/10 text-slate-500',
};
export function IconTile({ color = 'theme', children, className }: { color?: keyof typeof tileColors; children: ReactNode; className?: string }) {
  return <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[18px]', tileColors[color], className)}>{children}</div>;
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary [&_svg]:size-6">{icon}</div>
      <div className="font-semibold">{title}</div>
      {text && <p className="max-w-xs text-sm text-muted-foreground">{text}</p>}
      {action}
    </div>
  );
}

export const GradientDivider = ({ className }: { className?: string }) => (
  <div className={cn('h-px w-full bg-gradient-to-r from-transparent via-border to-transparent', className)} />
);

export function PageHeader({ title, description, icon, actions }: { title: string; description?: string; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-shrink-0 items-center gap-3 px-4 pb-3 pt-4 sm:px-5">
      {icon && <IconTile>{icon}</IconTile>}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-bold leading-tight">{title}</h1>
        {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function SettingsSection({ icon, title, children, color = 'theme' }: { icon: ReactNode; title: string; children: ReactNode; color?: keyof typeof tileColors }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <IconTile color={color} className="h-8 w-8 rounded-lg">{icon}</IconTile>
        <h2 className="font-bold">{title}</h2>
      </div>
      <div className="space-y-3 rounded-xl bg-muted/30 p-4">{children}</div>
    </section>
  );
}
export function SettingsRow({ title, text, children }: { title: string; text?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        {text && <div className="text-xs text-muted-foreground">{text}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
