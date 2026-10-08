import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Mode = 'light' | 'dark';
type Vars = Record<string, string>;
export interface Theme { name: string; label: string; swatch: string; light: Vars; dark: Vars }

const mk = (name: string, label: string, lp: string, dp: string, lg: [string, string, string], dg: [string, string, string], h: number): Theme => ({
  name,
  label,
  swatch: `linear-gradient(135deg,hsl(${lg[0]}),hsl(${lg[1]}),hsl(${lg[2]}))`,
  light: { '--primary': lp, '--ring': lp, '--primary-foreground': '0 0% 100%', '--accent': `${h} 70% 95%`, '--accent-foreground': `${h} 75% 28%`,
    '--gradient-from': lg[0], '--gradient-via': lg[1], '--gradient-to': lg[2] },
  dark: { '--primary': dp, '--ring': dp, '--primary-foreground': `${h} 100% 8%`, '--accent': `${h} 50% 17%`, '--accent-foreground': `${h} 85% 82%`,
    '--gradient-from': dg[0], '--gradient-via': dg[1], '--gradient-to': dg[2] },
});

export const themes: Theme[] = [
  mk('lamngoc', 'Lam ngọc', '188 85% 36%', '188 80% 48%', ['173 80% 40%', '188 85% 42%', '205 85% 52%'], ['173 85% 28%', '188 90% 33%', '205 85% 42%'], 188),
  mk('ocean', 'Đại dương', '215 90% 55%', '215 95% 60%', ['200 90% 50%', '215 85% 55%', '230 80% 60%'], ['200 95% 35%', '215 90% 40%', '230 85% 45%'], 215),
  mk('midnight', 'Nửa đêm', '262 83% 58%', '270 80% 65%', ['240 60% 50%', '280 70% 55%', '320 65% 50%'], ['240 70% 35%', '280 80% 40%', '320 75% 35%'], 265),
  mk('aurora', 'Cực quang', '175 80% 40%', '175 85% 50%', ['160 80% 45%', '190 85% 50%', '220 80% 55%'], ['160 90% 30%', '190 95% 35%', '220 90% 40%'], 175),
  mk('sunset', 'Hoàng hôn', '25 95% 53%', '30 95% 55%', ['15 90% 55%', '35 95% 55%', '45 90% 50%'], ['15 85% 40%', '35 90% 42%', '45 85% 38%'], 25),
  mk('forest', 'Rừng xanh', '152 75% 40%', '152 80% 48%', ['140 70% 40%', '160 65% 45%', '175 60% 42%'], ['140 75% 28%', '160 70% 32%', '175 65% 30%'], 152),
  mk('candy', 'Kẹo ngọt', '340 85% 55%', '340 90% 60%', ['330 85% 60%', '350 80% 65%', '10 85% 60%'], ['330 90% 42%', '350 85% 48%', '10 90% 45%'], 340),
];

export const STORAGE_KEY = 'sao-y-lenh';
const get = (k: string) => { try { return localStorage.getItem(`${STORAGE_KEY}-${k}`); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(`${STORAGE_KEY}-${k}`, v); } catch { /* ignore */ } };

interface Ctx { theme: string; mode: Mode; setTheme: (t: string) => void; setMode: (m: Mode) => void }
const ThemeCtx = createContext<Ctx>({ theme: 'lamngoc', mode: 'dark', setTheme: () => {}, setMode: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(get('theme') || 'lamngoc');
  const [mode, setMode] = useState<Mode>((get('mode') as Mode) || 'dark');
  useEffect(() => {
    const t = themes.find((x) => x.name === theme) || themes[0];
    const root = document.documentElement;
    root.classList.toggle('dark', mode === 'dark');
    const vars = mode === 'dark' ? t.dark : t.light;
    for (const k of Object.keys(vars)) root.style.setProperty(k, vars[k]);
    set('theme', t.name);
    set('mode', mode);
    set('vars', JSON.stringify(vars));
  }, [theme, mode]);
  return <ThemeCtx.Provider value={{ theme, mode, setTheme, setMode }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
