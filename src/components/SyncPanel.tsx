import React from 'react';
import { AlertCircle, CheckCircle, Loader2, PauseCircle } from 'lucide-react';
import type { SyncProgress, AnalysisProgress } from '../types';

interface SyncPanelProps {
  syncStatus: SyncProgress;
  analysisStatus: AnalysisProgress;
  onPauseAnalysis?: () => void;
}

export const SyncPanel: React.FC<SyncPanelProps> = ({ syncStatus, analysisStatus, onPauseAnalysis }) => {
  const showSync = syncStatus.status === 'running' || syncStatus.status === 'error';
  const showAnalysis = analysisStatus.status === 'running' || analysisStatus.status === 'error';

  if (!showSync && !showAnalysis) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
      {/* Sync progress */}
      {syncStatus.status === 'running' && (
        <div className="card sync-panel">
          <div className="sync-panel__info" style={{ flex: 1 }}>
            <div className="sync-panel__status">
              <Loader2 size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6, animation: 'spin 1s linear infinite' }} />
              Sincronizando com Zendesk...
            </div>
            <div className="sync-panel__detail">{syncStatus.phase}</div>
            {syncStatus.ticketsTotal > 0 && (
              <div className="sync-panel__progress">
                <div
                  className="sync-panel__progress-bar"
                  style={{
                    width: `${(syncStatus.ticketsSynced / syncStatus.ticketsTotal) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {syncStatus.status === 'error' && (
        <div className="card sync-panel" style={{ borderColor: 'var(--color-danger-border)' }}>
          <div className="sync-panel__info">
            <div className="sync-panel__status" style={{ color: 'var(--color-danger)' }}>
              <AlertCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
              Erro na sincronização
            </div>
            <div className="sync-panel__detail">{syncStatus.errorMessage}</div>
          </div>
        </div>
      )}

      {/* Analysis progress */}
      {analysisStatus.status === 'running' && (
        <div className="card sync-panel">
          <div className="sync-panel__info" style={{ flex: 1 }}>
            <div className="sync-panel__status">
              <Loader2 size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6, animation: 'spin 1s linear infinite' }} />
              Analisando com IA...
            </div>
            <div className="sync-panel__detail">{analysisStatus.phase}</div>
            {analysisStatus.ticketsTotal > 0 && (
              <div className="sync-panel__progress">
                <div
                  className="sync-panel__progress-bar"
                  style={{
                    width: `${(analysisStatus.ticketsAnalyzed / analysisStatus.ticketsTotal) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
          {onPauseAnalysis && (
            <button
              className="btn btn--secondary btn--sm"
              onClick={onPauseAnalysis}
              title="Pausar análise atual"
              style={{ alignSelf: 'center', marginLeft: 16 }}
            >
              <PauseCircle size={14} />
              Pausar
            </button>
          )}
        </div>
      )}

      {analysisStatus.status === 'error' && (
        <div className="card sync-panel" style={{ borderColor: 'var(--color-danger-border)' }}>
          <div className="sync-panel__info">
            <div className="sync-panel__status" style={{ color: 'var(--color-danger)' }}>
              <AlertCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
              Erro na análise IA
            </div>
            <div className="sync-panel__detail">{analysisStatus.errorMessage || analysisStatus.phase}</div>
          </div>
        </div>
      )}

      {/* Completion messages */}
      {syncStatus.status === 'completed' && syncStatus.phase && (
        <div className="card sync-panel" style={{ borderColor: 'var(--color-success-border)' }}>
          <div className="sync-panel__info">
            <div className="sync-panel__status" style={{ color: 'var(--color-success)' }}>
              <CheckCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
              {syncStatus.phase}
            </div>
          </div>
        </div>
      )}

      {analysisStatus.status === 'completed' && analysisStatus.phase && (
        <div className="card sync-panel" style={{ borderColor: 'var(--color-success-border)' }}>
          <div className="sync-panel__info">
            <div className="sync-panel__status" style={{ color: 'var(--color-success)' }}>
              <CheckCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
              {analysisStatus.phase}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
