// window.app comes from the Electron preload. In a plain browser (UI preview and
// screenshots) a small demo backend stands in so every screen can be shown.
import type { AppState, LogEntry } from './types';
import { demoApi } from './demo';

export interface Api {
  call: <T = unknown>(cmd: string, payload?: unknown) => Promise<T>;
  onState: (cb: (s: AppState) => void) => () => void;
  onLog: (cb: (e: LogEntry) => void) => () => void;
}

declare global {
  interface Window { app?: Api }
}

export const api: Api = window.app ?? demoApi();
export const isDemo = !window.app;
