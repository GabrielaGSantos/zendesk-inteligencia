import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Search, Star, Edit2, Trash2, Copy, Filter, Clock } from 'lucide-react';
import { api } from '../services/api';
import type { KnowledgeRule, PatternGroup } from '../types';

export const KnowledgeManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'rules' | 'patterns'>('rules');
  const [rules, setRules] = useState<KnowledgeRule[]>([]);
  const [patterns, setPatterns] = useState<PatternGroup[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [showPatternModal, setShowPatternModal] = useState(false);
  const [editingRule, setEditingRule] = useState<KnowledgeRule | null>(null);
  const [editingPattern, setEditingPattern] = useState<PatternGroup | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Atendimento');
  const [priority, setPriority] = useState('Média');
  const [description, setDescription] = useState('');
  const [examplesString, setExamplesString] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const categories = [
    'Atendimento', 'Desenvolvimento', 'Procedimentos Internos', 
    'Segurança', 'Comercial', 'Jurídico', 'Clientes', 'Infraestrutura', 'Outros'
  ];

  const loadRules = async () => {
    try {
      setLoading(true);
      const [rulesData, patternsData] = await Promise.all([
        api.getKnowledgeRules(),
        api.getPatterns()
      ]);
      setRules(rulesData);
      setPatterns(patternsData.patterns || []);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsedExamples = examplesString
        .split(',')
        .map(s => s.trim())
        .filter(s => s !== '' && !isNaN(Number(s)))
        .map(Number);
        
      const data = { title, category, priority, description, examples: parsedExamples, is_active: true };
      
      if (editingRule) {
        const historyEntry = {
          date: new Date().toISOString(),
          author: 'Sistema', // Ideally from auth, but no auth for now
          changes: `Editado em ${new Date().toLocaleDateString()}`
        };
        const newHistory = [...(editingRule.history || []), historyEntry];
        await api.updateKnowledgeRule(editingRule.id, { ...data, history: newHistory });
      } else {
        await api.addKnowledgeRule(data);
      }
      
      setShowModal(false);
      resetForm();
      loadRules();
    } catch (err) {
      console.error('Error saving rule:', err);
      alert('Erro ao salvar a regra.');
    }
  };

  const resetForm = () => {
    setEditingRule(null);
    setTitle('');
    setCategory('Atendimento');
    setPriority('Média');
    setDescription('');
    setExamplesString('');
  };

  const openEditModal = (rule: KnowledgeRule) => {
    setEditingRule(rule);
    setTitle(rule.title);
    setCategory(rule.category || 'Outros');
    setPriority(rule.priority || 'Média');
    setDescription(rule.description || '');
    setExamplesString(rule.examples ? rule.examples.join(', ') : '');
    setShowModal(true);
  };

  const handleToggleActive = async (rule: KnowledgeRule) => {
    try {
      await api.updateKnowledgeRule(rule.id, { is_active: !rule.is_active });
      loadRules();
    } catch (err) {
      console.error('Error toggling rule:', err);
    }
  };

  const handleToggleFavorite = async (rule: KnowledgeRule) => {
    try {
      await api.updateKnowledgeRule(rule.id, { is_favorite: !rule.is_favorite });
      loadRules();
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Tem certeza que deseja excluir esta regra?')) {
      try {
        await api.deleteKnowledgeRule(id);
        loadRules();
      } catch (err) {
        console.error('Error deleting rule:', err);
        alert('Erro ao excluir regra.');
      }
    }
  };

  const handleSavePattern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPattern) return;
    try {
      await api.updatePattern(editingPattern.id, {
        name: title,
        description: description,
        common_response: examplesString
      });
      setShowPatternModal(false);
      loadRules();
    } catch (err) {
      console.error('Error saving pattern:', err);
      alert('Erro ao salvar o padrão.');
    }
  };

  const openEditPatternModal = (pattern: PatternGroup) => {
    setEditingPattern(pattern);
    setTitle(pattern.name || '');
    setDescription(pattern.description || '');
    setExamplesString(pattern.common_response || '');
    setShowPatternModal(true);
  };

  const handleDeletePattern = async (id: number) => {
    if (window.confirm('Tem certeza que deseja excluir este padrão?')) {
      try {
        await api.deletePattern(id);
        loadRules();
      } catch (err) {
        console.error('Error deleting pattern:', err);
        alert('Erro ao excluir padrão.');
      }
    }
  };

  const handleDuplicate = (rule: KnowledgeRule) => {
    setTitle(`${rule.title} (Cópia)`);
    setCategory(rule.category);
    setPriority(rule.priority);
    setDescription(rule.description);
    setExamplesString(rule.examples ? rule.examples.join(', ') : '');
    setEditingRule(null);
    setShowModal(true);
  };

  const filteredRules = rules.filter(r => {
    const matchesSearch = (r.title || '').toLowerCase().includes(search.toLowerCase()) || 
                          (r.description || '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter ? r.category === categoryFilter : true;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="knowledge-manager">
      <div className="km-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}><BookOpen size={24} /> Base de Conhecimento</h2>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>Organize as regras da IA e gerencie os padrões identificados.</p>
        </div>
        {activeTab === 'rules' && (
          <button className="btn btn--primary" onClick={() => { resetForm(); setShowModal(true); }}>
            <Plus size={16} /> Nova Regra
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '1px solid var(--color-border)', marginBottom: 24 }}>
        <button 
          onClick={() => setActiveTab('rules')}
          style={{ 
            padding: '8px 16px', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'rules' ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: activeTab === 'rules' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeTab === 'rules' ? 600 : 500,
            cursor: 'pointer',
            fontSize: 14
          }}
        >
          Regras de Ouro
        </button>
        <button 
          onClick={() => setActiveTab('patterns')}
          style={{ 
            padding: '8px 16px', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'patterns' ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: activeTab === 'patterns' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeTab === 'patterns' ? 600 : 500,
            cursor: 'pointer',
            fontSize: 14
          }}
        >
          Padrões Identificados
        </button>
      </div>

      <div className="km-toolbar" style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div className="km-search" style={{ flex: 1, position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--color-text-muted)' }} />
          <input 
            type="text" 
            placeholder="Pesquisar regra pelo título ou conteúdo..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
          />
        </div>
        <div className="km-filters" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter size={18} color="var(--color-text-muted)" />
          <select 
            value={categoryFilter} 
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
          >
            <option value="">Todas as Categorias</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading-spinner" style={{ marginTop: 40 }}><div className="loading-spinner__icon">Z</div></div>
      ) : activeTab === 'rules' ? (
        filteredRules.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 40 }}>
            <BookOpen size={32} />
            <div className="empty-state__title">Nenhuma regra encontrada</div>
            <div className="empty-state__text">Nenhuma regra corresponde à sua busca ou filtro.</div>
          </div>
        ) : (
          <div className="km-grid">
          {filteredRules.map(rule => (
            <div key={rule.id} className={`km-card ${rule.is_favorite ? 'km-card--favorite' : ''} ${!rule.is_active ? 'km-card--inactive' : ''}`}>
              <div className="km-card__header">
                <div className="km-card__title">
                  <button className="km-card__star" onClick={() => handleToggleFavorite(rule)} title={rule.is_favorite ? "Remover dos favoritos" : "Favoritar"}>
                    <Star size={18} fill={rule.is_favorite ? 'gold' : 'none'} color={rule.is_favorite ? 'gold' : 'var(--color-text-muted)'} />
                  </button>
                  <span style={{ fontWeight: 600, fontSize: 16 }}>{rule.title || 'Sem título'}</span>
                </div>
                <label className="toggle" title={rule.is_active ? "Desativar regra" : "Ativar regra"}>
                  <input type="checkbox" checked={rule.is_active} onChange={() => handleToggleActive(rule)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="km-card__body">
                <p>{(rule.description || '').length > 180 ? (rule.description || '').substring(0, 180) + '...' : rule.description}</p>
              </div>

              <div className="km-card__meta">
                <span className="badge badge--neutral">{rule.category || 'Sem Categoria'}</span>
                <span className={`badge badge--priority-${(rule.priority || 'baixa').toLowerCase()}`}>{rule.priority}</span>
              </div>

              <div className="km-card__actions">
                <button className="km-btn-action" onClick={() => openEditModal(rule)}><Edit2 size={14} /> Editar</button>
                <button className="km-btn-action" onClick={() => handleDuplicate(rule)}><Copy size={14} /> Duplicar</button>
                <button className="km-btn-action km-btn-action--danger" onClick={() => handleDelete(rule.id)}><Trash2 size={14} /> Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )) : (
        /* ─── Padrões Identificados Tab ─── */
        <div>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
              {patterns.length} padrões identificados pela IA
            </span>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                placeholder="Buscar padrão..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ padding: '8px 8px 8px 34px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', width: 260, fontSize: 13 }}
              />
            </div>
          </div>

          {patterns.filter(p => (p.name || '').toLowerCase().includes(search.toLowerCase()) || (p.description || '').toLowerCase().includes(search.toLowerCase())).length === 0 ? (
            <div className="empty-state" style={{ marginTop: 40 }}>
              <BookOpen size={32} />
              <div className="empty-state__title">Nenhum padrão encontrado</div>
              <div className="empty-state__text">A IA ainda não identificou padrões nos tickets.</div>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Padrão</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, width: 90, textAlign: 'center' }}>Tickets</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Descrição</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, width: 120, textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {patterns
                    .filter(p => (p.name || '').toLowerCase().includes(search.toLowerCase()) || (p.description || '').toLowerCase().includes(search.toLowerCase()))
                    .map(pattern => (
                    <tr key={pattern.id} style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-alt)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 500, fontSize: 14, maxWidth: 250 }}>
                        {pattern.name || 'Sem nome'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)', padding: '2px 10px', borderRadius: 12, fontWeight: 600, fontSize: 13 }}>
                          {pattern.ticket_count}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontSize: 13, maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pattern.description || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button className="km-btn-action" onClick={() => openEditPatternModal(pattern)}><Edit2 size={14} /> Editar</button>
                          <button className="km-btn-action km-btn-action--danger" onClick={() => handleDeletePattern(pattern.id)}><Trash2 size={14} /> Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pattern Edit Modal */}
      {showPatternModal && editingPattern && (
        <div className="modal-overlay" onClick={() => setShowPatternModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal__header">
              <h2>Editar Padrão</h2>
            </div>
            <form onSubmit={handleSavePattern} className="modal__body" style={{ gap: 16, display: 'flex', flexDirection: 'column' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Nome do Padrão *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 6 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Descrição</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 6, minHeight: 100, resize: 'vertical' }}
                  placeholder="Descreva o padrão identificado..."
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Resposta Comum</label>
                <textarea
                  value={examplesString}
                  onChange={e => setExamplesString(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 6, minHeight: 100, resize: 'vertical' }}
                  placeholder="Resposta padrão sugerida pela IA para tickets desse tipo..."
                />
              </div>

              <div style={{ padding: '8px 12px', background: 'var(--color-bg-alt)', borderRadius: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>
                <strong>Tickets associados:</strong> {editingPattern.ticket_count} ticket(s)
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                <button type="button" className="btn btn--secondary" onClick={() => setShowPatternModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn--primary">Salvar Padrão</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal__header">
              <h2>{editingRule ? 'Editar Regra da IA' : 'Nova Regra da IA'}</h2>
            </div>
            <form onSubmit={handleSave} className="modal__body" style={{ gap: 16, display: 'flex', flexDirection: 'column' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Título *</label>
                <input 
                  type="text" 
                  value={title} 
                  onChange={e => setTitle(e.target.value)} 
                  required
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6 }}
                  placeholder="Ex: Aprovação de Novas Demandas"
                />
              </div>

              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Categoria</label>
                  <select 
                    value={category} 
                    onChange={e => setCategory(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6 }}
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Prioridade</label>
                  <select 
                    value={priority} 
                    onChange={e => setPriority(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6 }}
                  >
                    <option value="Crítica">Crítica</option>
                    <option value="Alta">Alta</option>
                    <option value="Média">Média</option>
                    <option value="Baixa">Baixa</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Descrição *</label>
                <textarea 
                  value={description} 
                  onChange={e => setDescription(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, minHeight: 120, resize: 'vertical' }}
                  placeholder="Descreva a regra em detalhes. Como a IA deve se comportar? Quais os procedimentos?"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Tickets de Exemplo (Opcional)</label>
                <input 
                  type="text" 
                  value={examplesString} 
                  onChange={e => setExamplesString(e.target.value)} 
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6 }}
                  placeholder="IDs dos tickets separados por vírgula (Ex: 8942, 9012)"
                />
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>A IA vai analisar a solução dada nestes tickets para aprender o gabarito prático.</span>
              </div>
              
              {editingRule && editingRule.history && editingRule.history.length > 0 && (
                <div style={{ padding: 12, background: 'var(--color-surface)', borderRadius: 6, fontSize: 12 }}>
                  <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> Histórico de Alterações</h4>
                  {editingRule.history.map((h, i) => (
                    <div key={i} style={{ marginBottom: 4, color: 'var(--color-text-muted)' }}>
                      <strong>{new Date(h.date).toLocaleDateString()} às {new Date(h.date).toLocaleTimeString()}</strong> - {h.author}: {h.changes}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                <button type="button" className="btn btn--secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn--primary">Salvar Regra</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
