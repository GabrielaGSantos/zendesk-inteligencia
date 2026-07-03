import React from 'react';
import { 
  Inbox, 
  Archive, 
  BookOpen, 
  Brain,
  Activity,
  LogOut,
  LayoutDashboard,
  TicketIcon,
  Network,
  Radar,
  Calendar
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab }) => {
  const menuItems = [
    {
      group: 'Dashboard',
      items: [
        { id: 'principal', label: 'Principal', icon: Inbox },
        { id: 'fechados', label: 'Fechados', icon: Archive },
      ]
    },
    {
      group: 'Operação',
      items: [
        { id: 'radar', label: 'Radar Operacional', icon: Radar },
        { id: 'calendar', label: 'Calendário e Lembretes', icon: Calendar },
      ]
    },
    {
      group: 'Inteligência',
      items: [
        { id: 'knowledge', label: 'Base de Conhecimento', icon: BookOpen },
        { id: 'agents', label: 'Especialistas', icon: Brain },
      ]
    },
    {
      group: 'Configurações',
      items: [
        { id: 'users', label: 'Usuários do Sistema', icon: BookOpen },
        { id: 'logs', label: 'Logs de Auditoria', icon: Activity },
      ]
    }
  ];

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__header">
        <div className="app-sidebar__logo" style={{ background: 'transparent', width: 'auto', height: 'auto', paddingLeft: 8 }}>
          <img src="/logo-mpx.svg" alt="MPX Logo" style={{ height: 48, width: 'auto' }} />
        </div>
        <div className="app-sidebar__title">
          <span>Central de</span>
          <strong>Inteligência</strong>
        </div>
      </div>

      <nav className="app-sidebar__nav">
        {menuItems.map((group, idx) => (
          <div key={idx} className="app-sidebar__group">
            <div className="app-sidebar__group-title">{group.group}</div>
            {group.items.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  className={`app-sidebar__item ${isActive ? 'app-sidebar__item--active' : ''}`}
                  onClick={() => setCurrentTab(item.id)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ padding: '16px', borderTop: '1px solid var(--color-border)', marginTop: 'auto' }}>
        <button
          className="app-sidebar__item app-sidebar__item--logout"
          onClick={() => supabase.auth.signOut()}
        >
          <LogOut size={18} />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
};
