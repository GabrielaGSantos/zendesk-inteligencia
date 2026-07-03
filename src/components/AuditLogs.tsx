import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Activity, Search, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { format } from 'date-fns';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs({ page, limit, action: actionFilter });
      setLogs(data.logs);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, limit, actionFilter]);

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'login': return 'Login';
      case 'edit_analysis': return 'Edição de Análise';
      case 'sync_start': return 'Sincronização';
      case 'analyze_start': return 'Análise em Massa';
      case 'webhook_sync': return 'Zendesk: Novo/Atualizado';
      case 'webhook_analyze': return 'IA via Webhook';
      default: return action;
    }
  };

  return (
    <div className="logs-manager">
      <div className="page-header">
        <h1 className="page-header__title">Logs de Auditoria</h1>
        <p className="page-header__description">
          Acompanhe as atividades, edições e acessos realizados no sistema.
        </p>
      </div>

      <div className="filter-bar" style={{ marginBottom: 20, display: 'flex', gap: '20px', alignItems: 'center' }}>
        <div className="filter-bar__group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Filtrar por Ação:</label>
          <select 
            className="filter-bar__select" 
            value={actionFilter} 
            onChange={e => { setActionFilter(e.target.value); setPage(1); }}
          >
            <option value="">Todas as Ações</option>
            <option value="login">Login</option>
            <option value="edit_analysis">Edição de Análise</option>
            <option value="sync_start">Sincronização Manual</option>
            <option value="analyze_start">Análise em Massa</option>
            <option value="webhook_sync">Zendesk: Novo/Atualizado (Webhook)</option>
            <option value="webhook_analyze">IA via Webhook</option>
          </select>
        </div>
        
        <div className="filter-bar__group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Exibir:</label>
          <select 
            className="filter-bar__select" 
            value={limit} 
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
          >
            <option value={10}>10 por página</option>
            <option value={20}>20 por página</option>
            <option value={50}>50 por página</option>
            <option value={100}>100 por página</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <span className="spinner spinner--small" style={{ marginRight: 8 }}></span>
            Carregando logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon"><Activity size={28} /></div>
            <div className="empty-state__title">Nenhum log encontrado</div>
            <div className="empty-state__text">Não há registros para os filtros selecionados.</div>
          </div>
        ) : (
          <div className="table-responsive" style={{ padding: '10px 0' }}>
            <table className="users-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '16px', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Data / Hora</th>
                  <th style={{ padding: '16px', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Usuário</th>
                  <th style={{ padding: '16px', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Ação</th>
                  <th style={{ padding: '16px', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Alvo / Recurso</th>
                  <th style={{ padding: '16px', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Detalhes</th>
                  <th style={{ padding: '16px', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '16px', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss")}
                    </td>
                    <td style={{ padding: '16px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 500 }}>{log.user_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{log.user_email}</div>
                    </td>
                    <td style={{ padding: '16px', verticalAlign: 'top' }}>
                      <span className={`status-badge ${log.action.includes('webhook') ? 'status-badge--closed' : 'status-badge--open'}`}>
                        {getActionLabel(log.action)}
                      </span>
                    </td>
                    <td style={{ padding: '16px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                      <strong>{log.target_type}</strong>
                      {log.target_id ? <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>#{log.target_id}</div> : null}
                    </td>
                    <td style={{ padding: '16px', verticalAlign: 'top', minWidth: '250px' }}>
                      <div style={{ marginBottom: 4, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {log.details?.message || ''}
                      </div>
                      
                      {log.details?.metrics ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px', padding: '12px', backgroundColor: 'var(--color-bg-tertiary, rgba(59, 130, 246, 0.1))', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '0.75rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ color: 'var(--color-text-secondary)' }}>Modelo</span>
                            <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{log.details.metrics.provider} {log.details.metrics.model}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ color: 'var(--color-text-secondary)' }}>Tokens Totais</span>
                            <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{log.details.metrics.total_tokens?.toLocaleString()}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ color: 'var(--color-text-secondary)' }}>Custo Estimado</span>
                            <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>${(log.details.metrics.estimated_cost || 0).toFixed(5)}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ color: 'var(--color-text-secondary)' }}>Status API</span>
                            <span style={{ fontWeight: 500 }}>
                              {log.details.metrics.error_429 > 0 ? (
                                <span style={{ color: '#ef4444' }}>{log.details.metrics.error_429} erros 429</span>
                              ) : (
                                <span style={{ color: '#10b981' }}>{log.details.metrics.api_calls} chamadas (OK)</span>
                              )}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <pre style={{ 
                          margin: '8px 0 0 0', 
                          padding: '8px', 
                          background: 'var(--color-background-soft)', 
                          borderRadius: '4px',
                          fontSize: '11px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          color: 'var(--color-text-secondary)',
                          fontFamily: 'monospace'
                        }}>
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      )}
                    </td>
                    <td style={{ padding: '16px', fontSize: 12, color: 'var(--color-text-secondary)', verticalAlign: 'top' }}>
                      {log.ip_address?.split(',')[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {logs.length > 0 && (
        <div className="pagination" style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="pagination__info" style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
            Página {page} de {totalPages}
          </div>
          <div className="pagination__controls" style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="btn btn--secondary" 
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px' }}
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} /> Anterior
            </button>
            <button 
              className="btn btn--secondary" 
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px' }}
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Próxima <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
