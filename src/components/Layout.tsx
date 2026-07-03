import React from 'react';
import { Brain, RefreshCw, Sparkles, BookOpen } from 'lucide-react';
import type { SyncProgress, AnalysisProgress } from '../types';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  syncStatus: SyncProgress;
  analysisStatus: AnalysisProgress;
  onSync: () => void;
  onAnalyze: (force?: boolean) => void;
  serverConnected: boolean;
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  syncStatus,
  analysisStatus,
  onSync,
  onAnalyze,
  serverConnected,
  currentTab,
  setCurrentTab
}) => {
  const isSyncing = syncStatus.status === 'running';
  const isAnalyzing = analysisStatus.status === 'running';

  return (
    <div className="app-layout">
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />
      
      <div className="app-content">
        <header className="app-header" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="app-header__brand">
            {/* Logo and title moved to Sidebar, but keeping a simplified header for actions */}
            <div className="app-header__title">
              {currentTab === 'principal' && 'Tickets Principais'}
              {currentTab === 'fechados' && 'Tickets Fechados'}
              {currentTab === 'knowledge' && 'Gerenciador de Regras'}
              {currentTab === 'agents' && 'Especialistas'}
              {currentTab === 'radar' && 'Radar Operacional'}
              {currentTab === 'users' && 'Usuários do Sistema'}
            </div>
          </div>

          <div className="app-header__actions">
            {!serverConnected && (
              <span className="badge badge--priority-urgente">Servidor offline</span>
            )}

            <button
              className="btn btn--secondary btn--sm"
              onClick={onSync}
              disabled={isSyncing || !serverConnected}
              title="Sincronizar tickets do Zendesk"
            >
              <RefreshCw size={14} className={isSyncing ? 'loading-spinner__icon' : ''} style={isSyncing ? { animation: 'spin 1s linear infinite', background: 'none', width: 14, height: 14, borderRadius: 0 } : {}} />
              {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn--outline btn--sm"
                onClick={() => onAnalyze(true)}
                disabled={isAnalyzing || !serverConnected}
                title="Apagar análises anteriores e re-analisar TUDO do zero"
              >
                <Sparkles size={14} />
                Re-analisar Todos
              </button>
              
              <button
                className="btn btn--primary btn--sm"
                onClick={() => onAnalyze(false)}
                disabled={isAnalyzing || !serverConnected}
                title="Analisar apenas os tickets que ainda não foram analisados"
              >
                <Sparkles size={14} />
                {isAnalyzing ? 'Analisando...' : 'Analisar Novos'}
              </button>
            </div>
          </div>
        </header>

        <main className="app-main">
          {children}
        </main>
      </div>
    </div>
  );
};
