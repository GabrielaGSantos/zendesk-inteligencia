import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Activity, Search, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { format } from 'date-fns';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs({ page, limit: 50, action: actionFilter });
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
  }, [page, actionFilter]);

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'login': return 'Login';
      case 'edit_analysis': return 'Edição de Análise';
      case 'sync_start': return 'Sincronização';
      case 'analyze_start': return 'Análise de IA';
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

      <div className="filter-bar" style={{ marginBottom: 20 }}>
        <div className="filter-bar__group">
          <div className="filter-bar__item">
            <label>Filtrar por Ação</label>
            <div className="filter-bar__select-wrapper">
              <Filter size={14} className="filter-bar__icon" />
              <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }}>
                <option value="">Todas as Ações</option>
                <option value="login">Login</option>
                <option value="edit_analysis">Edição de Análise</option>
                <option value="sync_start">Sincronização</option>
                <option value="analyze_start">Análise em Massa</option>
              </select>
            </div>
          </div>
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
          <div className="table-responsive">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Data / Hora</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>Alvo / Recurso</th>
                  <th>Detalhes</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss")}
                    </td>
                    <td>
                      <div><strong>{log.user_name}</strong></div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{log.user_email}</div>
                    </td>
                    <td>
                      <span className={`status-badge ${log.action === 'login' ? 'status-badge--closed' : 'status-badge--open'}`}>
                        {getActionLabel(log.action)}
                      </span>
                    </td>
                    <td>
                      {log.target_type} {log.target_id ? `#${log.target_id}` : ''}
                    </td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {JSON.stringify(log.details)}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      {log.ip_address}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination" style={{ marginTop: 20 }}>
          <div className="pagination__info">
            Página {page} de {totalPages}
          </div>
          <div className="pagination__controls">
            <button 
              className="pagination__button" 
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} /> Anterior
            </button>
            <button 
              className="pagination__button" 
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
