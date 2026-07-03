import React from 'react';
import { Ticket, BarChart3, Layers, Clock } from 'lucide-react';
import type { Stats } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface StatsCardsProps {
  stats: Stats | null;
  loading: boolean;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats, loading }) => {
  if (loading || !stats) {
    return (
      <div className="kpi-grid">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="card kpi-card" style={{ opacity: 0.5 }}>
            <div className="kpi-card__content">
              <span className="kpi-card__label">Carregando...</span>
              <span className="kpi-card__value">—</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const lastSyncText = stats.lastSync
    ? formatDistanceToNow(new Date(stats.lastSync.completed_at), {
        addSuffix: true,
        locale: ptBR,
      })
    : 'Nunca sincronizado';

  return (
    <div className="kpi-grid">
      <div className="card kpi-card">
        <div className="kpi-card__content">
          <span className="kpi-card__label">Tickets Sincronizados</span>
          <span className="kpi-card__value">{stats.totalTickets.toLocaleString('pt-BR')}</span>
          <span className="kpi-card__detail">Total importado do Zendesk</span>
        </div>
        <div className="kpi-card__icon">
          <Ticket size={18} />
        </div>
      </div>

      <div className="card kpi-card">
        <div className="kpi-card__content">
          <span className="kpi-card__label">Analisados pela IA</span>
          <span className="kpi-card__value">{stats.analyzedTickets.toLocaleString('pt-BR')}</span>
          <span className="kpi-card__detail">
            {stats.totalTickets > 0
              ? `${Math.round((stats.analyzedTickets / stats.totalTickets) * 100)}% do total`
              : 'Nenhum ticket importado'}
          </span>
        </div>
        <div className="kpi-card__icon">
          <BarChart3 size={18} />
        </div>
      </div>

      <div className="card kpi-card">
        <div className="kpi-card__content">
          <span className="kpi-card__label">Padrões Identificados</span>
          <span className="kpi-card__value">{stats.totalPatterns}</span>
          <span className="kpi-card__detail">Grupos de padrão criados</span>
        </div>
        <div className="kpi-card__icon">
          <Layers size={18} />
        </div>
      </div>

      <div className="card kpi-card">
        <div className="kpi-card__content">
          <span className="kpi-card__label">Última Sincronização</span>
          <span className="kpi-card__value" style={{ fontSize: 16 }}>{lastSyncText}</span>
          <span className="kpi-card__detail">
            {stats.lastSync
              ? `${stats.lastSync.tickets_synced} tickets, ${stats.lastSync.comments_synced} comentários`
              : 'Clique em Sincronizar para começar'}
          </span>
        </div>
        <div className="kpi-card__icon">
          <Clock size={18} />
        </div>
      </div>
    </div>
  );
};
