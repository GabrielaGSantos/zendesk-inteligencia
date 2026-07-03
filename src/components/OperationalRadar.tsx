import React, { useState, useEffect } from 'react';
import { RefreshCw, X, AlertCircle, AlertTriangle, Clock, HelpCircle, Activity, ArrowRight, UserX, Ghost, Cpu, Calendar, MessageSquare, Briefcase, Zap, TrendingUp, TrendingDown, Minus, StopCircle, Info, MessageCircle, AlertOctagon, Bot } from 'lucide-react';
import { api } from '../services/api';
import type { RadarAlert, RadarInsight, Ticket } from '../types';
import { TicketCard } from './TicketCard';
import { Pagination } from './Pagination';

interface OperationalRadarProps {
  onTicketClick?: (ticket: Ticket) => void;
}

export const OperationalRadar: React.FC<OperationalRadarProps> = ({ onTicketClick }) => {
  const [alerts, setAlerts] = useState<RadarAlert[]>([]);
  const [insights, setInsights] = useState<RadarInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<RadarAlert | null>(null);
  
  // Paginação
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<'desc'|'asc'>('desc');
  const limit = 15;

  const fetchRadarData = async () => {
    try {
      setLoading(true);
      const data = await api.getRadarData();
      
      // Sort alerts by criticality
      const levelWeight: Record<string, number> = { critical: 4, high: 3, warning: 2, alert: 1, low: 0 };
      const sortedAlerts = (data.metrics || []).sort((a: RadarAlert, b: RadarAlert) => {
        if (levelWeight[a.level] !== levelWeight[b.level]) {
          return levelWeight[b.level] - levelWeight[a.level];
        }
        return b.count - a.count;
      });

      setAlerts(sortedAlerts);
      setInsights(data.insights || []);
    } catch (err) {
      console.error('Failed to fetch radar data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRadarData();
  }, []);

  const handleAnalyze = async () => {
    try {
      setAnalyzing(true);
      await api.analyzeRadar();
      await fetchRadarData();
    } catch (err) {
      console.error('Failed to analyze radar:', err);
      alert('Erro ao gerar insights com IA. Verifique o console.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSelectAlert = (alert: RadarAlert) => {
    setSelectedAlert(alert);
    setPage(1);
  };

  const getAlertColor = (level: string) => {
    switch (level) {
      case 'critical': return 'var(--color-danger)';
      case 'high': return '#EA580C'; // Orange
      case 'warning': return 'var(--color-warning)';
      case 'alert': return '#EAB308'; // Yellow
      case 'low': return 'var(--color-success)';
      default: return 'var(--color-text-secondary)';
    }
  };

  const getAlertBg = (level: string) => {
    switch (level) {
      case 'critical': return 'var(--color-danger-bg)';
      case 'high': return '#FFEDD5';
      case 'warning': return 'var(--color-warning-bg)';
      case 'alert': return '#FEF9C3';
      case 'low': return '#DCFCE7';
      default: return 'var(--color-bg-alt)';
    }
  };

  const getAlertIcon = (id: string, level: string) => {
    const props = { size: 24, color: getAlertColor(level) };
    switch (id) {
      case 'no_response': return <Clock {...props} />;
      case 'stuck': return <Activity {...props} />;
      case 'no_due_date': return <HelpCircle {...props} />;
      case 'sla_risk': return <AlertTriangle {...props} />;
      case 'internal_return': return <ArrowRight {...props} />;
      case 'no_assignee': return <UserX {...props} />;
      case 'many_reopens': return <RefreshCw {...props} />;
      case 'forgotten': return <Ghost {...props} />;
      case 'escalation': return <AlertOctagon {...props} />;
      case 'first_reply_pending': return <MessageSquare {...props} />;
      case 'old_backlog': return <Calendar {...props} />;
      case 'overdue': return <Zap {...props} />;
      case 'waiting_client': return <MessageCircle {...props} />;
      case 'recurring_client': return <UserX {...props} />;
      case 'unclassified': return <HelpCircle {...props} />;
      case 'low_confidence': return <Cpu {...props} />;
      case 'no_procedure': return <Briefcase {...props} />;
      default: return <Info {...props} />;
    }
  };

  const renderTrend = (trend?: number) => {
    if (trend === undefined) return null;
    if (trend > 0) return <span style={{ color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '12px', fontWeight: 600 }}><TrendingUp size={14} /> +{trend}</span>;
    if (trend < 0) return <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '12px', fontWeight: 600 }}><TrendingDown size={14} /> {trend}</span>;
    return <span style={{ color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '12px', fontWeight: 600 }}><Minus size={14} /> -</span>;
  };

  if (loading && alerts.length === 0) {
    return (
      <div style={{ padding: '40px', display: 'flex', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
        <RefreshCw size={24} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ marginLeft: '12px' }}>Carregando dados operacionais...</span>
      </div>
    );
  }
  
  // Combine insights and critical alerts for priority actions
  const priorityActions = [
    ...insights.map(i => ({ type: 'insight', data: i })),
    ...alerts.filter(a => a.level === 'critical' && a.count > 0).map(a => ({ type: 'metric', data: a }))
  ];

  const total = selectedAlert?.tickets?.length || 0;
  const totalPages = Math.ceil(total / limit);
  
  let sortedTickets = [...(selectedAlert?.tickets || [])];
  sortedTickets.sort((a, b) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return sortOrder === 'desc' ? db - da : da - db;
  });

  const currentTickets = sortedTickets.slice((page - 1) * limit, page * limit);

  return (
    <div className="operational-radar">
      <div className="page-header" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Radar Operacional</h2>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>Monitoramento de gargalos e prioridades. Insights de IA gerados sob demanda.</span>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn--outline btn--sm" onClick={fetchRadarData} disabled={loading || analyzing}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            Atualizar Base
          </button>
          <button className="btn btn--primary btn--sm" onClick={handleAnalyze} disabled={analyzing || loading}>
            <Bot size={16} />
            {analyzing ? 'Analisando Operação...' : 'Gerar Insights (IA)'}
          </button>
        </div>
      </div>

      {!selectedAlert ? (
        <>
          {priorityActions.length > 0 && (
            <div className="priority-actions" style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: 'var(--color-text-primary)' }}>Ações Prioritárias</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {priorityActions.map((action, idx) => (
                  <div key={idx} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '16px', borderLeft: `4px solid ${action.type === 'insight' ? 'var(--color-primary)' : getAlertColor(action.data.level)}` }}>
                    {action.type === 'insight' ? (
                      <Bot size={24} color="var(--color-primary)" style={{ flexShrink: 0, marginTop: '4px' }} />
                    ) : (
                      getAlertIcon(action.data.id, action.data.level)
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {action.type === 'metric' ? `${action.data.count} ${action.data.title}` : action.data.title}
                        </h4>
                        {action.type === 'insight' && (
                          <span style={{ fontSize: '11px', background: 'var(--color-primary-lighter)', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>IA Insight</span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                        {action.type === 'metric' ? `Priorize o atendimento imediatamente. (${action.data.subtitle})` : action.data.description}
                      </p>
                    </div>
                    {action.type === 'metric' && (
                      <button className="btn btn--outline btn--sm" onClick={() => handleSelectAlert(action.data)}>
                        Ver Tickets
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: 'var(--color-text-primary)' }}>Indicadores Operacionais</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
              {alerts.map(alert => (
                <div 
                  key={alert.id} 
                  className="card" 
                  onClick={() => handleSelectAlert(alert)}
                  style={{ 
                    padding: '20px', 
                    cursor: 'pointer', 
                    transition: 'transform 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    borderTop: `4px solid ${getAlertColor(alert.level)}`,
                    opacity: alert.count === 0 ? 0.6 : 1
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {getAlertIcon(alert.id, alert.level)}
                      {renderTrend(alert.trend)}
                    </div>
                    <div style={{ 
                      background: alert.count > 0 ? getAlertBg(alert.level) : 'var(--color-bg-alt)', 
                      color: alert.count > 0 ? getAlertColor(alert.level) : 'var(--color-text-secondary)',
                      padding: '4px 12px',
                      borderRadius: '16px',
                      fontWeight: 'bold',
                      fontSize: '18px'
                    }}>
                      {alert.count}
                    </div>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{alert.title}</h3>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>{alert.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="alert-details">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div>{getAlertIcon(selectedAlert.id, selectedAlert.level)}</div>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{selectedAlert.title}</h3>
                <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{selectedAlert.count} tickets encontrados</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <select 
                className="form-control" 
                value={sortOrder} 
                onChange={e => { setSortOrder(e.target.value as 'asc'|'desc'); setPage(1); }}
                style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '13px', background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
              >
                <option value="desc">Mais recentes primeiro</option>
                <option value="asc">Mais antigos primeiro</option>
              </select>
              <button className="btn btn--outline" onClick={() => setSelectedAlert(null)}>
                <X size={16} /> Voltar para o Radar
              </button>
            </div>
          </div>

          {currentTickets.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', margin: 0 }}>Nenhum ticket nesta categoria no momento. Ótimo trabalho!</p>
            </div>
          ) : (
            <>
              <div className="ticket-list">
                {currentTickets.map(ticket => (
                  <TicketCard
                    key={ticket.zendesk_id}
                    ticket={ticket}
                    onClick={t => onTicketClick ? onTicketClick(t) : null}
                  />
                ))}
              </div>
              
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={limit}
                onPageChange={(p) => {
                  setPage(p);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};
