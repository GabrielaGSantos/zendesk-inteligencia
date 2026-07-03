import React, { useEffect, useState } from 'react';
import { ArrowLeft, Clock, CheckCircle2, Ticket as TicketIcon } from 'lucide-react';
import { api } from '../services/api';
import type { AgentDetailsResponse } from '../types';

interface AgentDetailsProps {
  agentId: number;
  onBack: () => void;
}

export const AgentDetails: React.FC<AgentDetailsProps> = ({ agentId, onBack }) => {
  const [details, setDetails] = useState<AgentDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchDetails = async () => {
      try {
        setLoading(true);
        const data = await api.getAgentDetails(agentId);
        if (mounted) {
          setDetails(data);
          setError(null);
        }
      } catch (err: any) {
        if (mounted) setError(err.message || 'Erro ao carregar detalhes do agente');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchDetails();
    return () => { mounted = false; };
  }, [agentId]);

  if (loading) {
    return (
      <div style={{ padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
        Carregando detalhes do especialista...
      </div>
    );
  }

  if (error || !details) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-danger)' }}>
        <p>{error || 'Não foi possível encontrar o agente'}</p>
        <button className="btn btn--outline" onClick={onBack} style={{ marginTop: '16px' }}>Voltar</button>
      </div>
    );
  }

  const { agent, queue, expertise } = details;

  return (
    <div className="agent-details">
      {/* Header */}
      <div className="page-header" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button className="btn btn--outline btn--sm" onClick={onBack}>
          <ArrowLeft size={16} /> Voltar
        </button>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{agent.name}</h2>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>{agent.cargo || 'Cargo não definido'}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        {/* Queue Section */}
        <section className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
            <TicketIcon size={20} style={{ color: 'var(--color-primary)' }} /> 
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Fila Atual ({queue.length})</h3>
          </div>
          
          {queue.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>Nenhum ticket pendente na fila.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '500px', overflowY: 'auto', paddingRight: '8px' }}>
              {queue.map(ticket => (
                <div key={ticket.zendesk_id} style={{ 
                  background: 'var(--color-bg)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
                  boxShadow: 'var(--shadow-xs)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                    <a 
                      href={`https://mpxbrasil.zendesk.com/agent/tickets/${ticket.zendesk_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontWeight: '600', color: 'var(--color-primary)', fontSize: '13px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                    >
                      <TicketIcon size={14} /> #{ticket.zendesk_id}
                    </a>
                    <span className="badge" style={{ 
                      background: ticket.status === 'open' ? 'var(--color-danger-bg)' : 'var(--color-bg-alt)',
                      color: ticket.status === 'open' ? 'var(--color-danger)' : 'var(--color-text-secondary)'
                    }}>
                      {{
                        new: 'Novo',
                        open: 'Aberto',
                        pending: 'Pendente',
                        hold: 'Em espera',
                        solved: 'Resolvido',
                        closed: 'Fechado'
                      }[ticket.status] || ticket.status.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {ticket.subject}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Expertise Section */}
        <section className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
            <CheckCircle2 size={20} style={{ color: 'var(--color-success)' }} /> 
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Histórico por Categoria</h3>
          </div>
          
          {expertise.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>Nenhum histórico de resolução registrado.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tickets-table" style={{ width: '100%', fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '12px 8px', color: 'var(--color-text-tertiary)', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>CATEGORIA</th>
                    <th style={{ padding: '12px 8px', color: 'var(--color-text-tertiary)', fontWeight: 600, textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>RESOLVIDOS</th>
                    <th style={{ padding: '12px 8px', color: 'var(--color-text-tertiary)', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid var(--color-border)' }}>TEMPO MÉDIO</th>
                  </tr>
                </thead>
                <tbody>
                  {expertise.map(exp => (
                    <tr key={exp.category} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '12px 8px', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                        <span className="badge" style={{ background: 'var(--color-bg)' }}>{exp.category}</span>
                      </td>
                      <td style={{ padding: '12px 8px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                        {exp.tickets_resolved}
                      </td>
                      <td style={{ padding: '12px 8px', color: 'var(--color-text-secondary)', textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-success)', fontWeight: 600, title: 'Tempo Líquido Dedicado' }}>
                            <Clock size={12} />
                            {Number(exp.avg_resolution_time).toFixed(1)}h
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
