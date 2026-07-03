import React, { useState, useEffect } from 'react';
import { Users, Clock, Hash, Briefcase, Check, Edit2, X } from 'lucide-react';
import { api } from '../services/api';
import type { Agent } from '../types';
import { AgentDetails } from './AgentDetails';

export const AgentsManager: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCargo, setEditCargo] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const data = await api.getAgents();
      setAgents(data);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAgentId === null) {
      fetchAgents();
    }
  }, [selectedAgentId]);

  const handleSaveCargo = async (id: number) => {
    try {
      await api.updateAgentCargo(id, editCargo);
      setAgents(prev => prev.map(a => a.id === id ? { ...a, cargo: editCargo } : a));
      setEditingId(null);
    } catch (err) {
      console.error('Failed to save cargo:', err);
      alert('Erro ao salvar o cargo.');
    }
  };

  if (selectedAgentId !== null) {
    return <AgentDetails agentId={selectedAgentId} onBack={() => setSelectedAgentId(null)} />;
  }

  return (
    <div className="knowledge-manager">
      <div className="page-header" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '24px' }}>
        <h1 className="page-header__title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Users size={24} />
          Especialistas da Equipe
        </h1>
        <p className="page-header__description">
          Gerencie os cargos e acompanhe a fila atual e especialidades da sua equipe.
          Essas informações ajudam a IA a direcionar melhor os atendimentos.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Carregando especialistas...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {agents.map(agent => (
            <div key={agent.id} style={{ 
              background: 'var(--color-bg-secondary)', 
              borderRadius: '8px', 
              padding: '20px',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: 'var(--color-text-primary)' }}>
                    {agent.name}
                  </h3>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    {agent.email}
                  </div>
                </div>
                {!agent.is_active && (
                  <span className="badge badge--priority-urgente" style={{ fontSize: '11px' }}>Inativo</span>
                )}
              </div>

              {/* Cargo Editor */}
              <div style={{ background: 'var(--color-bg-primary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Briefcase size={14} /> CARGO / FUNÇÃO
                </div>
                
                {editingId === agent.id ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text"
                      value={editCargo}
                      onChange={e => setEditCargo(e.target.value)}
                      style={{ 
                        flex: 1, 
                        background: 'var(--color-bg-secondary)', 
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        fontSize: '13px'
                      }}
                      placeholder="Ex: Desenvolvedor Senior"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveCargo(agent.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <button 
                      className="btn btn--primary btn--sm" 
                      onClick={() => handleSaveCargo(agent.id)}
                      style={{ padding: '6px' }}
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <div 
                    onClick={() => {
                      setEditingId(agent.id);
                      setEditCargo(agent.cargo || '');
                    }}
                    style={{ 
                      fontSize: '14px', 
                      color: agent.cargo ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      padding: '6px 8px',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: '4px',
                      border: '1px dashed transparent',
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                  >
                    {agent.cargo || 'Clique para definir o cargo...'}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Hash size={12} /> FILA ATUAL
                  </span>
                  <strong style={{ fontSize: '18px', color: agent.queueCount && agent.queueCount > 10 ? 'var(--color-warning)' : 'var(--color-text-primary)' }}>
                    {agent.queueCount || 0}
                  </strong>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} /> T. MÉDIO (h)
                  </span>
                  <strong style={{ fontSize: '18px', color: 'var(--color-text-primary)' }}>
                    {agent.avgResolutionTime?.toFixed(1) || '0.0'}
                  </strong>
                </div>
              </div>

              {/* Especialidades */}
              {agent.topCategories && agent.topCategories.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>TOP ESPECIALIDADES:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {agent.topCategories.map((cat, idx) => (
                      <span key={idx} className="badge" style={{ fontSize: '10px', background: 'var(--color-bg-primary)' }}>
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              <button 
                onClick={() => setSelectedAgentId(agent.id)}
                className="btn btn--outline"
                style={{ marginTop: '16px', width: '100%', justifyContent: 'center' }}
              >
                Ver Detalhes
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
