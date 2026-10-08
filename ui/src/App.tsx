import { useState } from 'react';
import { ClipboardList, ScrollText, Settings, Users } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { OnemesPane } from '@/components/OnemesPane';
import { Toasts } from '@/components/common';
import { PatientsPage } from '@/pages/Patients';
import { TemplatesPage } from '@/pages/Templates';
import { LogPage } from '@/pages/Log';
import { SettingsPage } from '@/pages/Settings';
import { useApp } from '@/lib/useApp';

const K = 'sao-y-lenh-ui';
const load = () => { try { return JSON.parse(localStorage.getItem(K) || '{}'); } catch { return {}; } };
const store = (v: object) => { try { localStorage.setItem(K, JSON.stringify({ ...load(), ...v })); } catch { /* ignore */ } };

export default function App() {
  const { ready, state, log } = useApp();
  const [page, setPage] = useState<string>(() => new URLSearchParams(location.search).get('page') || load().page || 'patients');
  const [collapsed, setCollapsed] = useState<boolean>(() => !!load().collapsed);
  const errors = log.filter((e) => e.level === 'error' && Date.now() - e.at < 3600_000).length;
  const go = (p: string) => { setPage(p); store({ page: p }); };

  return (
    <div className="relative flex h-full gap-3 p-3">
      <div className="app-bg-glow" />
      <Sidebar
        items={[
          { id: 'patients', label: 'Bệnh nhân', icon: Users },
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
      <main className="glass-panel relative flex w-[430px] shrink-0 xl:w-[480px] flex-col overflow-hidden" data-column>
        {!ready ? null : page === 'templates' ? <TemplatesPage /> : page === 'log' ? <LogPage /> : page === 'settings' ? <SettingsPage /> : <PatientsPage />}
        <Toasts />
      </main>
      <OnemesPane />
    </div>
  );
}
