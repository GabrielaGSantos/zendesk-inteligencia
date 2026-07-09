import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Note } from '../types';
import { 
  FileText, Plus, Search, Trash2, Pin, Star, Check, Clock, User
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

export const NotesScreen: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [editingNote, setEditingNote] = useState<Partial<Note> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const data = await api.notes.list();
      setNotes(data || []);
    } catch (err) {
      console.error('Error fetching notes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNewNote = () => {
    setEditingNote({
      title: '',
      content: '',
      is_pinned: false,
      is_important: false,
      is_public: false
    });
  };

  const handleSaveNote = async () => {
    if (!editingNote || !editingNote.title) {
      alert('O título da nota é obrigatório.');
      return;
    }
    
    setIsSaving(true);
    try {
      if (editingNote.id) {
        await api.notes.update(editingNote.id, editingNote);
      } else {
        await api.notes.create(editingNote);
      }
      await fetchNotes();
      setEditingNote(null);
    } catch (err) {
      console.error('Erro ao salvar nota:', err);
      alert('Ocorreu um erro ao salvar a nota.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta anotação?')) return;
    
    try {
      await api.notes.delete(id);
      if (editingNote?.id === id) {
        setEditingNote(null);
      }
      await fetchNotes();
    } catch (err) {
      console.error('Erro ao excluir nota:', err);
      alert('Erro ao excluir a nota.');
    }
  };

  const filteredNotes = notes.filter(n => {
    const term = searchQuery.toLowerCase();
    return n.title.toLowerCase().includes(term) || (n.content && n.content.toLowerCase().includes(term));
  });

  return (
    <div style={{ padding: 24, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text)' }}>
            <FileText size={24} color="var(--color-primary)" />
            Bloco de Notas Interno
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: 4 }}>
            Crie lembretes, anotações de laboratório, tarefas importantes e compartilhe entre administradores e secretárias.
          </p>
        </div>
        <button className="btn-primary" onClick={handleNewNote} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={18} />
          Nova Nota
        </button>
      </div>

      <div style={{ display: 'flex', gap: 24, flex: 1, minHeight: 0 }}>
        
        {/* Lado Esquerdo - Lista de Notas */}
        <div style={{ width: 350, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="search-container" style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--color-text-tertiary)' }} />
            <input 
              type="text" 
              placeholder="Pesquisar por título ou conteúdo..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 14 }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-text-tertiary)' }}>Carregando notas...</div>
            ) : filteredNotes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-text-tertiary)' }}>Nenhuma nota encontrada.</div>
            ) : (
              filteredNotes.map(note => (
                <div 
                  key={note.id}
                  onClick={() => setEditingNote(note)}
                  style={{ 
                    padding: 16, 
                    borderRadius: 8, 
                    border: `1px solid ${editingNote?.id === note.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    backgroundColor: editingNote?.id === note.id ? 'var(--color-surface-hover)' : 'var(--color-surface)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>
                      {note.title}
                    </h3>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {note.is_important && <Star size={14} fill="var(--color-danger)" color="var(--color-danger)" />}
                      {note.is_pinned && <Pin size={14} fill="var(--color-primary)" color="var(--color-primary)" />}
                    </div>
                  </div>
                  
                  <p style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--color-text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {note.content || 'Sem conteúdo'}
                  </p>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <User size={12} /> {note.author_name} {note.is_public && '(Público)'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> {format(parseISO(note.created_at), "dd/MM/yyyy")}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Lado Direito - Editor de Notas */}
        <div style={{ flex: 1, backgroundColor: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {editingNote ? (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', height: '100%' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, color: 'var(--color-primary)' }}>
                  {editingNote.id ? 'EDITAR ANOTAÇÃO' : 'NOVA ANOTAÇÃO'}
                </h2>
                {editingNote.id && (
                  <button 
                    onClick={() => handleDeleteNote(editingNote.id as number)}
                    style={{ background: 'var(--color-surface-hover)', border: 'none', color: 'var(--color-danger)', padding: 8, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Excluir"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>Título da Nota</label>
                <input 
                  type="text" 
                  value={editingNote.title || ''} 
                  onChange={e => setEditingNote({...editingNote, title: e.target.value})}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 15 }}
                  placeholder="Ex: Reunião, Relatório Semanal..."
                />
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>Conteúdo da Anotação</label>
                <textarea 
                  value={editingNote.content || ''} 
                  onChange={e => setEditingNote({...editingNote, content: e.target.value})}
                  style={{ width: '100%', flex: 1, padding: 16, borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 15, resize: 'none', fontFamily: 'inherit' }}
                  placeholder="Escreva sua anotação aqui..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 24 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>
                    <input 
                      type="checkbox" 
                      checked={editingNote.is_pinned || false} 
                      onChange={e => setEditingNote({...editingNote, is_pinned: e.target.checked})}
                      style={{ cursor: 'pointer' }}
                    />
                    <Pin size={16} color="var(--color-primary)" /> Fixar no topo
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>
                    <input 
                      type="checkbox" 
                      checked={editingNote.is_important || false} 
                      onChange={e => setEditingNote({...editingNote, is_important: e.target.checked})}
                      style={{ cursor: 'pointer' }}
                    />
                    <Star size={16} color="var(--color-danger)" /> Marcar como importante
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>
                    <input 
                      type="checkbox" 
                      checked={editingNote.is_public || false} 
                      onChange={e => setEditingNote({...editingNote, is_public: e.target.checked})}
                      style={{ cursor: 'pointer' }}
                    />
                    <User size={16} color="var(--color-text-secondary)" /> Pública (Todos veem)
                  </label>
                </div>
                
                <div style={{ display: 'flex', gap: 12 }}>
                  <button 
                    onClick={() => setEditingNote(null)} 
                    style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', cursor: 'pointer', fontWeight: 500, color: 'var(--color-primary)' }}
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleSaveNote}
                    disabled={isSaving}
                    style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid #767676', background: '#F1F3F4', cursor: 'pointer', fontWeight: 500, color: '#000', display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    {isSaving ? 'Salvando...' : (
                      <>
                        <Check size={18} />
                        {editingNote.id ? 'Atualizar Nota' : 'Criar Nova'}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {editingNote.id && (
                <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-text-tertiary)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Criado por {editingNote.author_name}</span>
                  <span>Última atualização: {format(parseISO(editingNote.updated_at!), "dd/MM/yyyy 'às' HH:mm")}</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)' }}>
              <FileText size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
              <p style={{ fontSize: 16, fontWeight: 500 }}>Selecione uma anotação para visualizar</p>
              <p style={{ fontSize: 14 }}>ou crie uma nova nota usando o botão acima.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
