import { useState, type ReactNode } from 'react';
import { ClipboardList, Globe, ScrollText, Settings, Users } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { BrowserPage } from '@/components/OnemesPane';
import { Toasts } from '@/components/common';
import { PatientsPage } from '@/pages/Patients';
import { TemplatesPage } from '@/pages/Templates';
import { LogPage } from '@/pages/Log';
import { SettingsPage } from '@/pages/Settings';
import { useApp } from '@/lib/useApp';

const K = 'sao-y-lenh-ui';
const load = () => { try { return JSON.parse(localStorage.getItem(K) || '{}'); } catch { return {}; } };
const store = (v: object) => { try { localStorage.setItem(K, JSON.stringify({ ...load(), ...v })); } catch { /* ignore */ } };

// Single-panel pages (templates, log, settings) share this frame.
const Panel = ({ children }: { children: ReactNode }) => (
  <main className="glass-panel relative flex min-w-0 flex-1 flex-col overflow-hidden" data-column="page">
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">{children}</div>
  </main>
);

export default function App() {
  const { ready, state, log } = useApp();
  const [page, setPage] = useState<string>(() => new URLSearchParams(location.search).get('page') || load().page || 'patients');
  const [collapsed, setCollapsed] = useState<boolean>(() => !!load().collapsed);
  const errors = log.filter((e) => e.level === 'error' && Date.now() - e.at < 3600_000).length;
  const go = (p: string) => { setPage(p); store({ page: p === 'browser' ? 'patients' : p }); };

  return (
    <div className="relative flex h-full gap-3 p-3">
      <div className="app-bg-glow" />
      <Sidebar
        items={[
          { id: 'patients', label: 'Bệnh nhân', icon: Users },
          { id: 'browser', label: 'Trình duyệt', icon: Globe, dot: state.busy },
          { id: 'templates', label: 'Mẫu xóa', icon: ClipboardList },
          { id: 'log', label: 'Nhật ký', icon: ScrollText, badge: errors || undefined },
        ]}
        bottom={[{ id: 'settings', label: 'Cài đặt', icon: Settings }]}
        active={page}
        onSelect={go}
        collapsed={collapsed}
        setCollapsed={(v) => { setCollapsed(v); store({ collapsed: v }); }}
        update={state.update?.version}
        onUpdate={() => go('settings')}
      />
      {!ready ? null : page === 'browser' ? (
        <BrowserPage />
      ) : page === 'templates' ? (
        <Panel><TemplatesPage /></Panel>
      ) : page === 'log' ? (
        <Panel><LogPage /></Panel>
      ) : page === 'settings' ? (
        <Panel><SettingsPage /></Panel>
      ) : (
        <PatientsPage onBrowser={() => go('browser')} />
      )}
      <Toasts />
    </div>
  );
}
