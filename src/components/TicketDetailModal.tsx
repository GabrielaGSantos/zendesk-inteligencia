import React, { useState, useEffect } from 'react';
import {
  X, ExternalLink, Copy, Check, User, Building2, UserCheck,
  Calendar, Tag, Target, MessageSquare, FileText, AlertCircle,
  ArrowRight, Shield, Lightbulb, Clock, Sparkles, BookOpen, Activity, Send, ChevronDown, ChevronUp
} from 'lucide-react';
import type { Ticket, TicketComment } from '../types';
import { api } from '../services/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TicketDetailModalProps {
  ticket: Ticket;
  onClose: () => void;
  onUpdate?: (ticket: Ticket) => void;
  filterOptions?: import('../types').FilterOptions;
}

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

function getConfidenceColor(level: number): string {
  if (level >= 0.8) return 'var(--color-success)';
  if (level >= 0.5) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function getConfidenceClass(level: number): string {
  if (level >= 0.8) return 'confidence-bar__fill--high';
  if (level >= 0.5) return 'confidence-bar__fill--medium';
  return 'confidence-bar__fill--low';
}

const ComboInput = ({ value, options, onChange, placeholder, isMulti = false, strictSelect = false }: any) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <select 
        style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, background: 'var(--color-surface)' }}
        value={strictSelect && !isMulti ? (value || '') : ""}
        onChange={e => {
          if (!e.target.value) {
            if (strictSelect && !isMulti) onChange('');
            return;
          }
          if (isMulti) {
            const current = value ? value.split(' | ').map((s: string) => s.trim()).filter(Boolean) : [];
            if (!current.includes(e.target.value)) {
              onChange(current.length > 0 ? `${value} | ${e.target.value}` : e.target.value);
            }
          } else {
            onChange(e.target.value);
          }
        }}
      >
        <option value="">{isMulti ? '+ Adicionar da lista...' : '-- Selecione --'}</option>
        {options?.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
      
      {(!strictSelect || isMulti) && (
        <div style={{ position: 'relative' }}>
          <input 
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, background: 'var(--color-surface)' }}
            value={value || ''} 
            readOnly={strictSelect}
            onChange={e => { if (!strictSelect) onChange(e.target.value); }}
            placeholder={placeholder}
          />
          {strictSelect && isMulti && value && (
            <button 
              title="Limpar seleções"
              onClick={() => onChange('')} 
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 10, padding: '2px 6px' }}
            >
              Limpar
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const TicketDetailModal: React.FC<TicketDetailModalProps> = ({ ticket: initialTicket, onClose, onUpdate, filterOptions }) => {
  const [ticket, setTicket] = useState<Ticket>(initialTicket);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedBriefing, setCopiedBriefing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<any>>({});
  const [newSimilarId, setNewSimilarId] = useState('');
  const [userInstructions, setUserInstructions] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [refineInitialInput, setRefineInitialInput] = useState('');
  const [refineFinalInput, setRefineFinalInput] = useState('');
  const [isRefiningInitial, setIsRefiningInitial] = useState(false);
  const [isRefiningFinal, setIsRefiningFinal] = useState(false);
  const [finalEmailInstructions, setFinalEmailInstructions] = useState('');
  const [showFinalEmailInstructions, setShowFinalEmailInstructions] = useState(false);

  useEffect(() => {
    setTicket(initialTicket);
  }, [initialTicket]);

  useEffect(() => {
    loadComments();
    // Close on Escape
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [ticket.zendesk_id]);

  const loadComments = async () => {
    try {
      setLoadingComments(true);
      const data = await api.getTicketDetail(ticket.zendesk_id);
      setComments(data.comments || []);
    } catch (err) {
      console.error('Error loading comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleAnalyze = async () => {
    if (ticket.is_manually_corrected) {
      const confirm = window.confirm(
        "Este ticket possui um Gabarito Manual salvo!\n\nSe você reanalisar agora, a IA vai apagar as suas edições e tentar adivinhar a categoria 'do zero' de novo (ela não olha para o gabarito do próprio ticket, só de tickets anteriores).\n\nDeseja realmente apagar seu gabarito e reanalisar?"
      );
      if (!confirm) return;
    }
    try {
      setIsAnalyzing(true);
      const updatedTicket = await api.analyzeTicket(ticket.zendesk_id, userInstructions || undefined);
      setTicket(updatedTicket);
      if (onUpdate) onUpdate(updatedTicket);
      setUserInstructions('');
      setShowInstructions(false);
    } catch (err) {
      alert(`Erro ao analisar ticket: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      await api.updateAnalysis(ticket.zendesk_id, editForm);
      const updatedTicket = { ...ticket, ...editForm, is_manually_corrected: true, analyzed_at: ticket.analyzed_at || new Date().toISOString() };
      setTicket(updatedTicket);
      if (onUpdate) onUpdate(updatedTicket);
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving edit:', err);
      alert('Erro ao salvar correções');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMoveToPrincipal = async () => {
    setIsSaving(true);
    try {
      const newCategory = (ticket.category || '').split(' | ')
        .map(c => c.trim())
        .filter(c => c.toLowerCase() !== 'spam')
        .join(' | ') || 'Dúvida Genérica'; // fallback se ficar vazio

      await api.updateAnalysis(ticket.zendesk_id, { category: newCategory });
      const updatedTicket = { ...ticket, category: newCategory, is_manually_corrected: true };
      setTicket(updatedTicket);
      if (onUpdate) onUpdate(updatedTicket);
    } catch (err) {
      console.error('Error moving to principal:', err);
      alert('Erro ao mover ticket');
    } finally {
      setIsSaving(false);
    }
  };

  const [isGeneratingFinalEmail, setIsGeneratingFinalEmail] = useState(false);

  const generateFinalEmail = async () => {
    try {
      setIsGeneratingFinalEmail(true);
      const data = await api.generateFinalEmail(ticket.zendesk_id, finalEmailInstructions || undefined);
      
      const updatedTicket = { ...ticket, suggested_final_response: data.suggested_final_response };
      setTicket(updatedTicket);
      if (onUpdate) onUpdate(updatedTicket);
      setFinalEmailInstructions('');
      setShowFinalEmailInstructions(false);
    } catch (err: any) {
      console.error('Error generating final email:', err);
      alert(err.message || 'Erro ao gerar e-mail final com a IA.');
    } finally {
      setIsGeneratingFinalEmail(false);
    }
  };

  const handleRefine = async (field: 'suggested_response' | 'suggested_final_response', instruction: string) => {
    if (!instruction.trim()) return;
    const setRefining = field === 'suggested_response' ? setIsRefiningInitial : setIsRefiningFinal;
    const setInput = field === 'suggested_response' ? setRefineInitialInput : setRefineFinalInput;
    
    try {
      setRefining(true);
      const data = await api.refineResponse(ticket.zendesk_id, field, instruction);
      const updatedTicket = { ...ticket, [field]: data.text };
      setTicket(updatedTicket);
      if (onUpdate) onUpdate(updatedTicket);
      setInput('');
    } catch (err: any) {
      console.error(`Error refining ${field}:`, err);
      alert(err.message || 'Erro ao refinar resposta.');
    } finally {
      setRefining(false);
    }
  };

  const copyResponse = async () => {
    if (ticket.suggested_response) {
      await navigator.clipboard.writeText(ticket.suggested_response);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyBriefing = async () => {
    let text = '';
    if (ticket.client_intent) text += `INTENÇÃO DO CLIENTE:\n${ticket.client_intent}\n\n`;
    if (ticket.problem_summary) text += `RESUMO DO PROBLEMA:\n${ticket.problem_summary}\n\n`;
    if (ticket.detailed_requirements) {
      text += `REQUISITOS DETALHADOS:\n`;
      let parsed = ticket.detailed_requirements;
      try {
        if (typeof parsed === 'string' && parsed.trim().startsWith('[')) {
          parsed = JSON.parse(parsed);
        }
      } catch (e) {}
      if (Array.isArray(parsed)) {
        parsed.forEach(item => text += `- ${item}\n`);
      } else {
        const lines = String(ticket.detailed_requirements).split('\n').filter(line => line.trim().length > 0);
        lines.forEach(line => text += `- ${line.replace(/^[\s\-\*\u2022]+/, '').trim()}\n`);
      }
    }
    
    await navigator.clipboard.writeText(text.trim());
    setCopiedBriefing(true);
    setTimeout(() => setCopiedBriefing(false), 2000);
  };

  const hasAnalysis = !!ticket.analyzed_at;
  const statusLabels: Record<string, string> = {
    new: 'Novo', open: 'Aberto', pending: 'Pendente',
    hold: 'Em espera', solved: 'Resolvido', closed: 'Fechado',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal__header">
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', marginBottom: 4 }}>
              #{ticket.zendesk_id}
            </div>
            <div className="modal__title">{ticket.subject || 'Sem assunto'}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className={`badge badge--status-${ticket.status}`}>
                {statusLabels[ticket.status] || ticket.status}
              </span>
              {hasAnalysis && ticket.suggested_priority && (
                <span className={`badge badge--priority-${ticket.suggested_priority.toLowerCase()}`}>
                  {ticket.suggested_priority}
                </span>
              )}
              {hasAnalysis && ticket.identified_pattern && (
                <span className="badge badge--teal">
                  <Target size={10} />
                  {ticket.identified_pattern}
                </span>
              )}
              {ticket.is_manually_corrected && (
                <span className="badge" style={{ background: 'var(--color-brand-primary-100)', color: 'var(--color-brand-primary-700)', border: '1px solid var(--color-brand-primary-300)' }}>
                  <Check size={10} />
                  Gabarito Manual
                </span>
              )}
              
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {hasAnalysis && (
                  <>
                    {isEditing && (
                      <button 
                        className="btn btn--ghost"
                        style={{ padding: '4px 12px', fontSize: 12 }}
                        onClick={() => setIsEditing(false)}
                        disabled={isSaving}
                      >
                        <X size={14} style={{ marginRight: 4 }} /> Cancelar
                      </button>
                    )}
                    <button 
                      className={`btn ${isEditing ? 'btn--primary' : 'btn--ghost'}`}
                      style={{ padding: '4px 12px', fontSize: 12 }}
                      onClick={() => {
                        if (isEditing) {
                          handleSaveEdit();
                        } else {
                          setEditForm({
                            category: ticket.category,
                            product: ticket.product,
                            request_type: ticket.request_type,
                            recommended_procedure: ticket.recommended_procedure,
                            recommended_expert: ticket.recommended_expert,
                            suggested_response: ticket.suggested_response,
                            needs_internal_routing: ticket.needs_internal_routing,
                            ai_feedback: ticket.ai_feedback
                          });
                          setIsEditing(true);
                        }
                      }}
                      disabled={isSaving || isAnalyzing}
                    >
                      {isSaving ? (
                        <><span className="spinner spinner--small" style={{ marginRight: 6 }}></span> Salvando...</>
                      ) : isEditing ? (
                        <><Check size={14} style={{ marginRight: 6 }} /> Salvar Gabarito</>
                      ) : (
                        <>✏️ Editar Gabarito</>
                      )}
                    </button>
                  </>
                )}
                {hasAnalysis && (
                  <button 
                    className="btn btn--secondary"
                    style={{ padding: '4px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={copyBriefing}
                    title="Copia Intenção, Resumo e Requisitos"
                  >
                    {copiedBriefing ? <Check size={14} /> : <Copy size={14} />}
                    Copiar Briefing
                  </button>
                )}
                <button 
                  className={hasAnalysis ? "btn btn--ghost" : "btn btn--primary"}
                  style={{ padding: '4px 12px', fontSize: 12 }}
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || isEditing || isSaving}
                >
                  {isAnalyzing ? (
                    <><span className="spinner spinner--small" style={{ marginRight: 6 }}></span> Analisando...</>
                  ) : (
                    <><Sparkles size={14} style={{ marginRight: 6 }} /> {hasAnalysis ? 'Analisar Novamente' : 'Analisar com IA'}</>
                  )}
                </button>
                <button
                  className="btn btn--ghost"
                  style={{ padding: '4px 8px', fontSize: 11 }}
                  onClick={() => setShowInstructions(!showInstructions)}
                  title="Adicionar observação para a IA"
                >
                  {showInstructions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {!hasAnalysis && (
                  <button 
                    className="btn btn--outline"
                    style={{ padding: '4px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => {
                      setEditForm({});
                      setIsEditing(true);
                    }}
                    disabled={isAnalyzing || isEditing || isSaving}
                  >
                    <FileText size={14} /> Adicionar Manualmente
                  </button>
                )}
                {hasAnalysis && ticket.category?.toLowerCase().includes('spam') && !ticket.category?.toLowerCase().includes('análise de spam') && (
                  <button 
                    className="btn btn--outline"
                    style={{ padding: '4px 12px', fontSize: 12, borderColor: 'var(--color-brand-primary-400)', color: 'var(--color-brand-primary-600)' }}
                    onClick={handleMoveToPrincipal}
                    disabled={isAnalyzing || isEditing || isSaving}
                  >
                    Mover para Principal
                  </button>
                )}
              </div>
            </div>

            {/* Observação Inicial para IA */}
            {showInstructions && (
              <div className="ai-instructions-box" style={{ margin: '0 24px 0', padding: '12px 16px', background: 'var(--color-bg-secondary)', border: '1px dashed var(--color-primary)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Sparkles size={12} />
                  Observação para a IA (pré-análise)
                </div>
                <textarea
                  style={{ width: '100%', minHeight: '60px', padding: '10px 12px', resize: 'vertical', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 12, background: 'var(--color-surface)', fontFamily: 'inherit' }}
                  placeholder="Ex: Foque na parte de configuração do portal, ignore a menção ao PLDO..."
                  value={userInstructions}
                  onChange={e => setUserInstructions(e.target.value)}
                />
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                  Esta observação será considerada com prioridade máxima na análise e na geração das respostas.
                </div>
              </div>
            )}
          </div>
          <button className="modal__close" onClick={onClose} disabled={isSaving}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal__body">
          {/* Ticket Info Grid */}
          <div className="modal__section">
            <div className="modal__section-title">
              <FileText size={14} />
              Informações do Ticket
            </div>
            <div className="modal__info-grid">
              <div className="modal__info-item">
                <span className="modal__info-label">Solicitante</span>
                <span className="modal__info-value">
                  <User size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                  {ticket.requester_name}
                  {ticket.requester_email && (
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12, marginLeft: 4 }}>
                      ({ticket.requester_email})
                    </span>
                  )}
                </span>
              </div>
              <div className="modal__info-item">
                <span className="modal__info-label">Organização</span>
                <span className="modal__info-value">
                  <Building2 size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                  {ticket.organization_name || '—'}
                </span>
              </div>
              <div className="modal__info-item">
                <span className="modal__info-label">Responsável</span>
                <span className="modal__info-value">
                  <UserCheck size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                  {ticket.assignee_name || 'Não atribuído'}
                </span>
              </div>
              <div className="modal__info-item">
                <span className="modal__info-label">Grupo</span>
                <span className="modal__info-value">{ticket.group_name || '—'}</span>
              </div>
              <div className="modal__info-item">
                <span className="modal__info-label">Criado em</span>
                <span className="modal__info-value">
                  <Calendar size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                  {formatDate(ticket.created_at)}
                </span>
              </div>
              {ticket.solved_at && (
                <div className="modal__info-item">
                  <span className="modal__info-label">Resolvido em</span>
                  <span className="modal__info-value">{formatDate(ticket.solved_at)}</span>
                </div>
              )}
              {ticket.predicted_resolution_time_hours !== undefined && ticket.predicted_resolution_time_hours !== null && (
                <div className="modal__info-item">
                  <span className="modal__info-label">Previsão da IA</span>
                  <span className="modal__info-value">
                    <Clock size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6, color: 'var(--color-primary)' }} />
                    <strong style={{ color: 'var(--color-primary)' }}>{ticket.predicted_resolution_time_hours} horas</strong>
                  </span>
                </div>
              )}
              <div className="modal__info-item">
                <span className="modal__info-label">Link Zendesk</span>
                <a
                  href={ticket.zendesk_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="modal__info-value"
                  style={{ color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  Abrir ticket original <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>

          {/* AI Analysis */}
          {(hasAnalysis || isEditing) && (
            <>
              <div className="modal__section">
                <div className="modal__section-title">
                  <Sparkles size={14} />
                  {hasAnalysis && !ticket.is_manually_corrected ? 'Análise da IA' : 'Análise do Ticket'}
                  {ticket.confidence_level !== null && (
                    <span className="confidence-bar" style={{ marginLeft: 'auto' }}>
                      <span className="confidence-bar__track">
                        <span
                          className={`confidence-bar__fill ${getConfidenceClass(ticket.confidence_level)}`}
                          style={{ width: `${ticket.confidence_level * 100}%` }}
                        />
                      </span>
                      <span
                        className="confidence-bar__label"
                        style={{ color: getConfidenceColor(ticket.confidence_level) }}
                      >
                        {Math.round(ticket.confidence_level * 100)}%
                      </span>
                    </span>
                  )}
                </div>
                <div className="modal__info-grid">
                  <div className="modal__info-item">
                    <span className="modal__info-label">
                      <Tag size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      Produto
                    </span>
                    {isEditing ? (
                      <ComboInput 
                        value={editForm.product} 
                        options={filterOptions?.products || []} 
                        onChange={(v: string) => setEditForm({...editForm, product: v})} 
                        placeholder="Selecione o produto..." 
                        strictSelect={true}
                      />
                    ) : (
                      <span className="modal__info-value">{ticket.product || '—'}</span>
                    )}
                  </div>
                  <div className="modal__info-item">
                    <span className="modal__info-label">
                      <FileText size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      Tipo de Solicitação
                    </span>
                    {isEditing ? (
                      <ComboInput 
                        value={editForm.request_type} 
                        options={filterOptions?.requestTypes || []} 
                        onChange={(v: string) => setEditForm({...editForm, request_type: v})} 
                        placeholder="Digite o tipo de solicitação..." 
                      />
                    ) : (
                      <span className="modal__info-value">{ticket.request_type || '—'}</span>
                    )}
                  </div>
                  <div className="modal__info-item">
                    <span className="modal__info-label">
                      <Target size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      Categoria
                    </span>
                    {isEditing ? (
                      <ComboInput 
                        value={editForm.category} 
                        options={filterOptions?.categories || []} 
                        onChange={(v: string) => setEditForm({...editForm, category: v})} 
                        placeholder="Adicione categorias da lista..." 
                        isMulti={true}
                        strictSelect={true}
                      />
                    ) : (
                      <span className="modal__info-value" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(ticket.category || '—').split(' | ').map((cat, i) => (
                          <span key={i} className="badge badge--neutral" style={{ fontSize: 11, whiteSpace: 'normal', textAlign: 'left', wordBreak: 'break-word' }}>{cat.trim()}</span>
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="modal__info-item">
                    <span className="modal__info-label">
                      <Shield size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      Prioridade Sugerida
                    </span>
                    <span className="modal__info-value">{ticket.suggested_priority || '—'}</span>
                  </div>
                  <div className="modal__info-item">
                    <span className="modal__info-label">
                      <Activity size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      Complexidade (Esforço)
                    </span>
                    {isEditing ? (
                      <ComboInput 
                        value={editForm.operational_effort} 
                        options={['Baixo', 'Médio', 'Alto', 'Crítico']} 
                        onChange={(v: string) => setEditForm({...editForm, operational_effort: v})} 
                        placeholder="Selecione o esforço..." 
                      />
                    ) : (
                      <span className="modal__info-value">{ticket.operational_effort || 'Não Classificado'}</span>
                    )}
                  </div>
                  <div className="modal__info-item">
                    <span className="modal__info-label">
                      <Clock size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      Prazo Esperado
                    </span>
                    {isEditing ? (
                      <ComboInput 
                        value={editForm.expected_completion_effort} 
                        options={['Mesmo dia', 'Até 2 dias úteis', 'Até 5 dias úteis', 'Mais de 5 dias úteis']} 
                        onChange={(v: string) => setEditForm({...editForm, expected_completion_effort: v})} 
                        placeholder="Selecione o prazo..." 
                      />
                    ) : (
                      <span className="modal__info-value">{ticket.expected_completion_effort || 'Não Classificado'}</span>
                    )}
                  </div>
                </div>
              </div>

              {ticket.client_intent && (
                <div className="modal__section">
                  <div className="modal__section-title">
                    <MessageSquare size={14} />
                    Intenção do Cliente
                  </div>
                  <div className="modal__section-content">{ticket.client_intent}</div>
                </div>
              )}

              {ticket.problem_summary && (
                <div className="modal__section">
                  <div className="modal__section-title">
                    <AlertCircle size={14} />
                    Resumo do Problema
                  </div>
                  <div className="modal__section-content">{ticket.problem_summary}</div>
                </div>
              )}

              {ticket.detailed_requirements && (
                <div className="modal__section">
                  <div className="modal__section-title">
                    <BookOpen size={14} />
                    Requisitos Detalhados
                  </div>
                  <div className="modal__section-content" style={{ background: 'var(--color-bg-secondary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                    {(() => {
                      try {
                        let parsed = ticket.detailed_requirements;
                        if (typeof parsed === 'string' && parsed.trim().startsWith('[')) {
                          parsed = JSON.parse(parsed);
                        }
                        if (Array.isArray(parsed)) {
                          return (
                            <ul style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {parsed.map((item, idx) => (
                                <li key={idx} style={{ color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          );
                        }
                      } catch (e) {}

                      // Fallback to string processing
                      const text = String(ticket.detailed_requirements);
                      const lines = text.split('\n').filter(line => line.trim().length > 0);
                      
                      return (
                        <ul style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {lines.map((line, idx) => {
                            const cleanLine = line.replace(/^[\s\-\*\u2022]+/, '').trim();
                            return (
                              <li key={idx} style={{ color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                                {cleanLine}
                              </li>
                            );
                          })}
                        </ul>
                      );
                    })()}
                  </div>
                </div>
              )}

              {(ticket.suggested_response || ticket.suggested_final_response || isEditing) && (
                <div className="modal__section">
                  <div className="modal__section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Lightbulb size={14} />
                      Respostas Sugeridas
                    </div>
                  </div>
                  
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 500, color: 'var(--color-text-secondary)' }}>E-mail Inicial (Aviso de Recebimento)</label>
                        <textarea 
                          style={{ width: '100%', minHeight: '80px', padding: '12px', resize: 'vertical', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, background: 'var(--color-surface)', fontFamily: 'inherit' }}
                          value={editForm.suggested_response || ''} 
                          onChange={e => setEditForm({...editForm, suggested_response: e.target.value})}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 500, color: 'var(--color-text-secondary)' }}>E-mail Final (Resolução)</label>
                        <textarea 
                          style={{ width: '100%', minHeight: '80px', padding: '12px', resize: 'vertical', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, background: 'var(--color-surface)', fontFamily: 'inherit' }}
                          value={editForm.suggested_final_response || ''} 
                          onChange={e => setEditForm({...editForm, suggested_final_response: e.target.value})}
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {ticket.suggested_response && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>E-mail Inicial (Aviso de Recebimento)</div>
                          <div className="modal__response-box">
                            {ticket.suggested_response}
                            <button
                              className="btn btn--ghost btn--sm modal__response-copy"
                              onClick={() => { navigator.clipboard.writeText(ticket.suggested_response || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                              title="Copiar resposta inicial"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                          {/* Chat de Refinamento - Email Inicial */}
                          <div className="refine-chat" style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                            <input
                              type="text"
                              value={refineInitialInput}
                              onChange={e => setRefineInitialInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRefine('suggested_response', refineInitialInput); } }}
                              placeholder="Peça um ajuste... Ex: Mencione o prazo de 3 dias"
                              disabled={isRefiningInitial}
                              style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 20, fontSize: 12, background: 'var(--color-surface)', fontFamily: 'inherit', outline: 'none' }}
                            />
                            <button
                              className="btn btn--primary"
                              style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, minWidth: 'auto' }}
                              onClick={() => handleRefine('suggested_response', refineInitialInput)}
                              disabled={isRefiningInitial || !refineInitialInput.trim()}
                            >
                              {isRefiningInitial ? (
                                <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }}></div>
                              ) : (
                                <Send size={12} />
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                      {ticket.suggested_final_response ? (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>E-mail Final (Resolução)</div>
                          <div className="modal__response-box">
                            {ticket.suggested_final_response}
                            <button
                              className="btn btn--ghost btn--sm modal__response-copy"
                              onClick={() => { navigator.clipboard.writeText(ticket.suggested_final_response || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                              title="Copiar resposta final"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                          {/* Chat de Refinamento - Email Final */}
                          <div className="refine-chat" style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                            <input
                              type="text"
                              value={refineFinalInput}
                              onChange={e => setRefineFinalInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRefine('suggested_final_response', refineFinalInput); } }}
                              placeholder="Peça um ajuste... Ex: Remova menção à homologação"
                              disabled={isRefiningFinal}
                              style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 20, fontSize: 12, background: 'var(--color-surface)', fontFamily: 'inherit', outline: 'none' }}
                            />
                            <button
                              className="btn btn--primary"
                              style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, minWidth: 'auto' }}
                              onClick={() => handleRefine('suggested_final_response', refineFinalInput)}
                              disabled={isRefiningFinal || !refineFinalInput.trim()}
                            >
                              {isRefiningFinal ? (
                                <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }}></div>
                              ) : (
                                <Send size={12} />
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>E-mail Final (Resolução)</div>
                          {/* Observação para gerar email final */}
                          <div style={{ marginBottom: 8 }}>
                            <button
                              className="btn btn--ghost"
                              style={{ padding: '2px 8px', fontSize: 10, marginBottom: 4 }}
                              onClick={() => setShowFinalEmailInstructions(!showFinalEmailInstructions)}
                            >
                              {showFinalEmailInstructions ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                              <span style={{ marginLeft: 4 }}>Observação para a IA</span>
                            </button>
                            {showFinalEmailInstructions && (
                              <textarea
                                style={{ width: '100%', minHeight: '50px', padding: '8px 10px', resize: 'vertical', border: '1px dashed var(--color-primary)', borderRadius: 6, fontSize: 11, background: 'var(--color-bg-secondary)', fontFamily: 'inherit', marginBottom: 6 }}
                                placeholder="Ex: Mencione que a funcionalidade está disponível em homologação para teste..."
                                value={finalEmailInstructions}
                                onChange={e => setFinalEmailInstructions(e.target.value)}
                              />
                            )}
                          </div>
                          <button
                            className="btn btn--outline"
                            onClick={generateFinalEmail}
                            disabled={isGeneratingFinalEmail}
                            style={{ width: '100%', justifyContent: 'center' }}
                          >
                            {isGeneratingFinalEmail ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></div> Gerando...
                              </span>
                            ) : (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Lightbulb size={14} /> Gerar E-mail Final com IA
                              </span>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {(ticket.recommended_expert || isEditing) && (
                <div className="modal__section" style={{ background: 'var(--color-bg-secondary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                  <div className="modal__section-title" style={{ color: 'var(--color-brand-primary-600)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Target size={16} />
                    Especialista Recomendado
                  </div>
                  {isEditing ? (
                    <div>
                      <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
                        <strong>Sugerido pela IA:</strong> {ticket.recommended_expert}
                      </div>
                      <select 
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, background: 'var(--color-surface)' }}
                        value={editForm.recommended_expert || ''} 
                        onChange={e => setEditForm({...editForm, recommended_expert: e.target.value})}
                      >
                        <option value="">Selecione um especialista...</option>
                        {filterOptions?.assignees?.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, fontWeight: 600, fontSize: 14 }}>{ticket.recommended_expert}</div>
                  )}
                  {!isEditing && (
                    <div className="modal__section-content" style={{ marginTop: '8px', fontStyle: 'italic', fontSize: '13px' }}>
                      {ticket.expert_reasoning || 'O agente com o melhor histórico para esta categoria.'}
                    </div>
                  )}
                </div>
              )}

              {ticket.applied_rules && ticket.applied_rules.length > 0 && (
                <div className="modal__section">
                  <div className="modal__section-title">
                    <BookOpen size={14} />
                    Regras Aplicadas
                  </div>
                  <div className="modal__section-content">
                    <ul style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {ticket.applied_rules.map((rule: string, i: number) => (
                        <li key={i} style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                          {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {ticket.missing_info && (
                <div className="modal__section" style={{ background: 'var(--color-bg-secondary)', padding: '16px', borderRadius: '8px', border: '1px dashed var(--color-warning)' }}>
                  <div className="modal__section-title" style={{ color: 'var(--color-warning)' }}>
                    <AlertCircle size={14} />
                    Faltam Informações
                  </div>
                  <div className="modal__section-content" style={{ color: 'var(--color-warning)' }}>
                    {ticket.missing_info}
                  </div>
                </div>
              )}

              {(ticket.recommended_procedure || isEditing) && (
                <div className="modal__section">
                  <div className="modal__section-title">
                    <ArrowRight size={14} />
                    Procedimento Recomendado
                  </div>
                  {isEditing ? (
                    <textarea 
                      style={{ width: '100%', minHeight: '80px', padding: '12px', resize: 'vertical', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, background: 'var(--color-surface)', fontFamily: 'inherit' }}
                      value={editForm.recommended_procedure || ''} 
                      onChange={e => setEditForm({...editForm, recommended_procedure: e.target.value})}
                    />
                  ) : (
                    <div className="modal__section-content">{ticket.recommended_procedure}</div>
                  )}
                </div>
              )}

              {(ticket.ai_feedback || isEditing) && (
                <div className="modal__section">
                  <div className="modal__section-title">
                    <MessageSquare size={14} />
                    Dica / Instrução para a IA (Opcional)
                  </div>
                  {isEditing ? (
                    <textarea 
                      style={{ width: '100%', minHeight: '60px', padding: '12px', resize: 'vertical', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, background: 'var(--color-surface)', fontFamily: 'inherit' }}
                      placeholder="Descreva o que faltou, por que foi corrigido ou adicione uma dica de contexto..."
                      value={editForm.ai_feedback || ''} 
                      onChange={e => setEditForm({...editForm, ai_feedback: e.target.value})}
                    />
                  ) : (
                    <div className="modal__section-content">{ticket.ai_feedback}</div>
                  )}
                </div>
              )}

              <div className="modal__section">
                <div className="modal__section-title">
                  <BookOpen size={14} />
                  Tickets Similares Analisados
                </div>
                <div className="modal__section-content" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {ticket.similar_tickets_ids
                    ?.filter(id => !(ticket.rejected_similar_tickets || []).includes(id))
                    .map(id => (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '2px 8px' }}>
                      <a 
                        href={`https://mpxbrasil.zendesk.com/agent/tickets/${id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '11px', textDecoration: 'none', color: 'var(--color-text-secondary)', marginRight: '6px' }}
                      >
                        #{id}
                      </a>
                      <button 
                        onClick={async () => {
                           const rejected = [...(ticket.rejected_similar_tickets || []), id];
                           await api.updateAnalysis(ticket.zendesk_id, { rejected_similar_tickets: rejected });
                           setTicket({ ...ticket, rejected_similar_tickets: rejected });
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center' }}
                        title="Rejeitar este ticket similar"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  
                  {ticket.added_similar_tickets?.filter(id => !ticket.similar_tickets_ids?.includes(id)).map(id => (
                     <div key={`added-${id}`} style={{ display: 'flex', alignItems: 'center', background: 'var(--color-brand-primary-50)', border: '1px solid var(--color-brand-primary-300)', borderRadius: '16px', padding: '2px 8px' }}>
                     <a 
                       href={`https://mpxbrasil.zendesk.com/agent/tickets/${id}`}
                       target="_blank"
                       rel="noopener noreferrer"
                       style={{ fontSize: '11px', textDecoration: 'none', color: 'var(--color-brand-primary-700)', marginRight: '6px' }}
                     >
                       #{id} (Adicionado)
                     </a>
                     <button 
                       onClick={async () => {
                          const added = ticket.added_similar_tickets!.filter(a => a !== id);
                          await api.updateAnalysis(ticket.zendesk_id, { added_similar_tickets: added });
                          setTicket({ ...ticket, added_similar_tickets: added });
                       }}
                       style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-brand-primary-700)', display: 'flex', alignItems: 'center' }}
                       title="Remover"
                     >
                       <X size={12} />
                     </button>
                   </div>
                  ))}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                    <input 
                      type="number" 
                      placeholder="Add ID..." 
                      value={newSimilarId}
                      onChange={e => setNewSimilarId(e.target.value)}
                      style={{ fontSize: '11px', padding: '2px 6px', width: '70px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                    />
                    <button 
                      className="btn btn--secondary btn--sm" 
                      style={{ padding: '2px 6px', fontSize: '11px' }}
                      onClick={async () => {
                        if (!newSimilarId) return;
                        const id = parseInt(newSimilarId);
                        const added = [...(ticket.added_similar_tickets || []), id];
                        await api.updateAnalysis(ticket.zendesk_id, { added_similar_tickets: added });
                        setTicket({ ...ticket, added_similar_tickets: added });
                        setNewSimilarId('');
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {(ticket.needs_internal_routing || isEditing) && (
                <div className="modal__section">
                  <div className="modal__section-title">
                    <ArrowRight size={14} />
                    Trâmite Interno
                  </div>
                  {isEditing ? (
                    <ComboInput 
                      value={editForm.needs_internal_routing} 
                      options={['Nenhum', 'Equipe de Desenvolvimento', 'Equipe de Infraestrutura', 'Equipe Comercial', 'Diretoria', ...(filterOptions?.assignees || [])]} 
                      onChange={(v: string) => setEditForm({...editForm, needs_internal_routing: v})} 
                      placeholder="Digite a equipe/agente..." 
                    />
                  ) : (
                    <div className="modal__section-content">{ticket.needs_internal_routing}</div>
                  )}
                </div>
              )}

              {ticket.solution_applied && ticket.solution_applied !== 'Pendente' && (
                <div className="modal__section">
                  <div className="modal__section-title">
                    <Check size={14} />
                    Solução Aplicada
                  </div>
                  <div className="modal__section-content">{ticket.solution_applied}</div>
                </div>
              )}
            </>
          )}

          {/* Comments */}
          <div className="modal__section">
            <div className="modal__section-title">
              <MessageSquare size={14} />
              Histórico de Conversas
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                ({comments.length} {comments.length === 1 ? 'comentário' : 'comentários'})
              </span>
            </div>

            {loadingComments ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                Carregando comentários...
              </div>
            ) : comments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                Nenhum comentário encontrado. Sincronize os tickets primeiro.
              </div>
            ) : (
              comments.map(comment => (
                <div
                  key={comment.id || comment.zendesk_comment_id}
                  className={`modal__comment ${comment.is_public ? 'modal__comment--public' : 'modal__comment--internal'}`}
                >
                  <div className="modal__comment-header">
                    <span className="modal__comment-author">
                      {comment.author_name}
                      {!comment.is_public && (
                        <span style={{ 
                          fontSize: 10, fontWeight: 600, color: '#EA580C', 
                          marginLeft: 6, padding: '1px 6px', 
                          background: '#FFF7ED', borderRadius: 'var(--radius-full)',
                          border: '1px solid #FED7AA'
                        }}>
                          Interno
                        </span>
                      )}
                    </span>
                    <span className="modal__comment-date">
                      <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      {formatDate(comment.created_at)}
                    </span>
                  </div>
                  <div className="modal__comment-body">{comment.body.replace(/&nbsp;/g, ' ')}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
