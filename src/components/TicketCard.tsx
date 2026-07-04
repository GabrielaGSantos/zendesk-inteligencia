import React from 'react';
import {
  User, Building2, UserCheck, Users, Calendar, ExternalLink,
  Tag, Target, MessageSquare, FileText, AlertCircle, ArrowRight, Clock
} from 'lucide-react';
import type { Ticket } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TicketCardProps {
  ticket: Ticket;
  onClick: (ticket: Ticket) => void;
  onNotSpam?: (ticket: Ticket) => void;
}

function getStatusBadgeClass(status: string): string {
  return `badge badge--status-${status}`;
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    new: 'Novo',
    open: 'Aberto',
    pending: 'Pendente',
    hold: 'Em espera',
    solved: 'Resolvido',
    closed: 'Fechado',
  };
  return labels[status] || status;
}

function getPriorityBadgeClass(priority: string): string {
  return `badge badge--priority-${priority.toLowerCase()}`;
}

function getConfidenceBadge(level: number | null | undefined): { className: string; label: string } {
  if (level === null || level === undefined) return { className: '', label: '' };
  if (level >= 0.8) return { className: 'badge--confidence-high', label: `${Math.round(level * 100)}%` };
  if (level >= 0.5) return { className: 'badge--confidence-medium', label: `${Math.round(level * 100)}%` };
  return { className: 'badge--confidence-low', label: `${Math.round(level * 100)}%` };
}

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

export const TicketCard: React.FC<TicketCardProps> = ({ ticket, onClick, onNotSpam }) => {
  const hasAnalysis = !!ticket.analyzed_at;
  const confidence = getConfidenceBadge(ticket.confidence_level);
  const isSpam = ticket.subject?.startsWith('***SPAM') || 
                 ticket.tags?.includes('spam') || 
                 (ticket.category?.toLowerCase().includes('spam') && !ticket.category?.toLowerCase().includes('análise de spam')) || 
                 ticket.status === 'suspended';

  return (
    <div className="card card--clickable ticket-card" onClick={() => onClick(ticket)}>
      {/* Header */}
      <div className="ticket-card__header">
        <div className="ticket-card__header-left">
          <div className="ticket-card__number">
            <span>#{ticket.zendesk_id}</span>
            {hasAnalysis && ticket.identified_pattern && (
              <span className="badge badge--teal" style={{ fontSize: 10 }}>
                <Target size={10} />
                {ticket.identified_pattern}
              </span>
            )}
          </div>
          <div className="ticket-card__subject">{ticket.subject || 'Sem assunto'}</div>
        </div>
        <div className="ticket-card__badges">
          <span className={getStatusBadgeClass(ticket.status)}>{getStatusLabel(ticket.status)}</span>
          {hasAnalysis && ticket.suggested_priority && (
            <span className={getPriorityBadgeClass(ticket.suggested_priority)}>
              {ticket.suggested_priority}
            </span>
          )}
          {hasAnalysis && confidence.className && (
            <span className={`badge ${confidence.className}`} title="Confiança da IA">
              {confidence.label}
            </span>
          )}
        </div>
      </div>

      {/* Meta info */}
      <div className="ticket-card__meta">
        <div className="ticket-card__meta-item">
          <User size={13} className="ticket-card__meta-icon" />
          <span>{ticket.requester_name || 'Sem solicitante'}</span>
        </div>
        {ticket.organization_name && (
          <div className="ticket-card__meta-item">
            <Building2 size={13} className="ticket-card__meta-icon" />
            <span>{ticket.organization_name}</span>
          </div>
        )}
        {ticket.assignee_name && (
          <div className="ticket-card__meta-item">
            <UserCheck size={13} className="ticket-card__meta-icon" />
            <span>{ticket.assignee_name}</span>
          </div>
        )}
        {ticket.group_name && (
          <div className="ticket-card__meta-item">
            <Users size={13} className="ticket-card__meta-icon" />
            <span>{ticket.group_name}</span>
          </div>
        )}
        <div className="ticket-card__meta-item">
          <Calendar size={13} className="ticket-card__meta-icon" />
          <span>{formatDate(ticket.created_at)}</span>
        </div>
        {ticket.predicted_resolution_time_hours !== undefined && ticket.predicted_resolution_time_hours !== null && (
          <div className="ticket-card__meta-item" title="Previsão da IA de tempo de resolução">
            <Clock size={13} className="ticket-card__meta-icon" style={{ color: 'var(--color-primary)' }} />
            <span style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
              {ticket.predicted_resolution_time_hours}h previstos
            </span>
          </div>
        )}
      </div>

      {/* Analysis section */}
      {hasAnalysis ? (
        <div className="ticket-card__analysis">
          {ticket.product && (
            <div className="ticket-card__analysis-item">
              <span className="ticket-card__analysis-label">
                <Tag size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                Produto
              </span>
              <span className="ticket-card__analysis-value">{ticket.product}</span>
            </div>
          )}
          {ticket.request_type && (
            <div className="ticket-card__analysis-item">
              <span className="ticket-card__analysis-label">
                <FileText size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                Tipo de Solicitação
              </span>
              <span className="ticket-card__analysis-value">{ticket.request_type}</span>
            </div>
          )}
          {ticket.category && (
            <div className="ticket-card__analysis-item">
              <span className="ticket-card__analysis-label">
                <Target size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                Categoria
              </span>
              <span className="ticket-card__analysis-value" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {ticket.category.split(' | ').map((cat, i) => (
                  <span key={i} className="badge badge--neutral" style={{ fontSize: 11, whiteSpace: 'normal', textAlign: 'left', wordBreak: 'break-word' }}>{cat.trim()}</span>
                ))}
              </span>
            </div>
          )}
          {ticket.client_intent && (
            <div className="ticket-card__analysis-item">
              <span className="ticket-card__analysis-label">
                <MessageSquare size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                Intenção do Cliente
              </span>
              <span className="ticket-card__analysis-value">{ticket.client_intent}</span>
            </div>
          )}
          {ticket.problem_summary && (
            <div className="ticket-card__analysis-item" style={{ gridColumn: 'span 2' }}>
              <span className="ticket-card__analysis-label">
                <AlertCircle size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                Resumo do Problema
              </span>
              <span className="ticket-card__analysis-value">{ticket.problem_summary}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="ticket-card__no-analysis">
          Ticket ainda não foi analisado pela IA. Clique em "Analisar com IA" no cabeçalho.
        </div>
      )}

      {/* Footer */}
      <div className="ticket-card__footer">
        <div className="ticket-card__footer-actions">
          {hasAnalysis && ticket.needs_internal_routing && ticket.needs_internal_routing !== 'Nenhum' && (
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              <ArrowRight size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              Encaminhar: {ticket.needs_internal_routing}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isSpam && onNotSpam && (
            <button
              className="btn btn--outline btn--sm"
              style={{ borderColor: 'var(--color-brand-primary-400)', color: 'var(--color-brand-primary-600)' }}
              onClick={(e) => {
                e.stopPropagation();
                onNotSpam(ticket);
              }}
              title="Marcar que não é spam e mover para principal"
            >
              Não é Spam
            </button>
          )}
          <a
            href={ticket.zendesk_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--ghost btn--sm"
            onClick={e => e.stopPropagation()}
            title="Abrir no Zendesk"
          >
            <ExternalLink size={13} />
            Zendesk
          </a>
        </div>
      </div>
    </div>
  );
};
