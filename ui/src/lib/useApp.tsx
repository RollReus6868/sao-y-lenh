import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import type { AppState, Data, LogEntry, Patient } from './types';

export interface Toast { id: number; tone: 'success' | 'error' | 'warning' | 'info'; text: string }

interface Ctx {
  ready: boolean;
  version: string;
  data: Data | null;
  state: AppState;
  log: LogEntry[];
  patients: Patient[];
  setPatients: (p: Patient[]) => void;
  refresh: () => Promise<void>;
  setData: (d: Data) => void;
  toasts: Toast[];
  toast: (tone: Toast['tone'], text: string) => void;
  call: <T>(cmd: string, payload?: unknown) => Promise<T>;
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
const PKEY = 'sao-y-lenh-patients';

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<AppState>({ busy: false, task: '', stepWaiting: null, progress: null, viewUrl: '', update: null });
  const [log, setLog] = useState<LogEntry[]>([]);
  const [patients, setPatientsRaw] = useState<Patient[]>(() => {
    try { return JSON.parse(localStorage.getItem(PKEY) || '[]'); } catch { return []; }
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tid = useRef(0);

  const toast = useCallback((tone: Toast['tone'], text: string) => {
    const id = ++tid.current;
    setToasts((t) => [...t.slice(-2), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 8000 : 4000);
  }, []);

  const call = useCallback(async <T,>(cmd: string, payload?: unknown) => {
    try {
      return await api.call<T>(cmd, payload);
    } catch (e) {
      const msg = String((e as Error)?.message || e).replace(/^Error invoking remote method 'call': (Error: )?/, '');
      toast('error', msg);
      throw e;
    }
  }, [toast]);

  const refresh = useCallback(async () => {
    const r = await api.call<{ version: string; data: Data; state: AppState; log: LogEntry[] }>('init');
    setVersion(r.version);
    setData(r.data);
    setState(r.state);
    setLog(r.log);
    setReady(true);
  }, []);

  useEffect(() => {
    refresh();
    const a = api.onState((s) => setState({ ...s }));
    const b = api.onLog((e) => setLog((l) => [...l.slice(-499), e]));
    return () => { a(); b(); };
  }, [refresh]);

  const setPatients = (p: Patient[]) => {
    setPatientsRaw(p);
    try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch { /* ignore */ }
  };

  return (
    <AppCtx.Provider value={{ ready, version, data, state, log, patients, setPatients, refresh, setData, toasts, toast, call }}>
      {children}
    </AppCtx.Provider>
  );
}

export const useApp = () => useContext(AppCtx);
