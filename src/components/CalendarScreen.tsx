import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Ticket, CalendarEvent, Agent } from '../types';
import { 
  CheckCircle2, Plus, Trash2, Info,
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Edit2, AlertCircle, Clock
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const CalendarScreen: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  
  const [loading, setLoading] = useState(true);

  // Calendar states
  const [calendarView, setCalendarView] = useState<'monthly' | 'weekly'>('monthly');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Filter state
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [showPersonalEvents, setShowPersonalEvents] = useState(true);
  const [showGlobalEvents, setShowGlobalEvents] = useState(true);
  const [showTickets, setShowTickets] = useState(true);

  // Modal / Form state
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventType, setEventType] = useState<'personal' | 'global'>('personal');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [eventCompleted, setEventCompleted] = useState(false);

  // Ticket time editing
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [ticketNewTime, setTicketNewTime] = useState('17:00');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tRes, evRes, aRes] = await Promise.allSettled([
        api.getTickets({ page: 1, limit: 1000 }),
        api.calendar.list(),
        api.getAgents()
      ]);
      
      if (tRes.status === 'fulfilled') setTickets(tRes.value.tickets);
      if (evRes.status === 'fulfilled') {
        setEvents(evRes.value);
      } else {
        console.error('Error fetching events. Make sure the table exists.');
      }
      if (aRes.status === 'fulfilled') setAgents(aRes.value);
      
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Calendar utilities
  const getDaysInMonthGrid = (date: Date) => {
    const start = startOfWeek(startOfMonth(date), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(date), { weekStartsOn: 0 });
    const days: Date[] = [];
    let curr = start;
    while (curr <= end) {
      days.push(curr);
      curr = addDays(curr, 1);
    }
    return days;
  };

  const getDaysInWeekGrid = (date: Date) => {
    const start = startOfWeek(date, { weekStartsOn: 0 });
    const days: Date[] = [];
    let curr = start;
    for (let i = 0; i < 7; i++) {
      days.push(curr);
      curr = addDays(curr, 1);
    }
    return days;
  };

  // Filtering
  const getTicketsForDate = (date: Date) => {
    if (!showTickets) return [];
    
    const dateStr = format(date, 'yyyy-MM-dd');
    return tickets.filter(t => {
      if (!t.due_date) return false;
      const tDate = t.due_date.split('T')[0];
      if (tDate !== dateStr) return false;
      
      // Apply agent filter for tickets
      if (selectedAgent && t.assignee_name !== selectedAgent) {
        return false;
      }
      
      return true;
    });
  };

  const getEventsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return events.filter(e => {
      if (e.event_type === 'personal' && !showPersonalEvents) return false;
      if (e.event_type === 'global' && !showGlobalEvents) return false;
      
      const isStart = e.start_date === dateStr;
      const isEnd = e.end_date === dateStr;
      
      if (!e.end_date) return isStart;
      
      const d = date.getTime();
      const s = parseISO(e.start_date).getTime();
      const end = parseISO(e.end_date).getTime();
      return d >= s && d <= end;
    });
  };

  const handleSaveEvent = async () => {
    try {
      const payload: CalendarEvent = {
        title: eventTitle,
        description: eventDescription,
        event_type: eventType,
        start_date: startDate,
        start_time: startTime,
        end_date: endDate || undefined,
        end_time: endTime || undefined,
        completed: eventCompleted
      };

      if (editingEventId) {
        await api.calendar.update(editingEventId, payload);
      } else {
        await api.calendar.create(payload);
      }
      
      setShowEventModal(false);
      fetchData();
    } catch (err) {
      console.error('Error saving event:', err);
      alert('Erro ao salvar lembrete.');
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este lembrete?')) return;
    try {
      await api.calendar.delete(id);
      setShowEventModal(false);
      fetchData();
    } catch (err) {
      console.error('Error deleting event:', err);
    }
  };

  const handleToggleEventCompleted = async (ev: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ev.id) return;
    try {
      const payload = { ...ev, completed: !ev.completed };
      // Optimistic update
      setEvents(events.map(event => event.id === ev.id ? { ...event, completed: !event.completed } : event));
      await api.calendar.update(ev.id, payload);
    } catch (err) {
      console.error('Erro ao atualizar lembrete', err);
      alert('Erro ao atualizar status do lembrete.');
      fetchData(); // revert on failure
    }
  };

  const handleSaveTicketTime = async () => {
    if (!editingTicket) return;
    try {
      const datePart = editingTicket.due_date ? editingTicket.due_date.split('T')[0] : format(new Date(), 'yyyy-MM-dd');
      const newDueDate = `${datePart}T${ticketNewTime}:00Z`;
      await api.updateTicketDueDate(editingTicket.zendesk_id, newDueDate);
      setEditingTicket(null);
      fetchData();
    } catch (err) {
      console.error('Erro ao atualizar horário', err);
      alert('Erro ao atualizar horário.');
    }
  };

  const openNewEventModal = (dateStr?: string) => {
    setEditingEventId(null);
    setEventTitle('');
    setEventDescription('');
    setEventType('personal');
    setStartDate(dateStr || format(new Date(), 'yyyy-MM-dd'));
    setStartTime('09:00');
    setEndDate('');
    setEndTime('');
    setEventCompleted(false);
    setShowEventModal(true);
  };

  const openEditEventModal = (ev: CalendarEvent) => {
    setEditingEventId(ev.id || null);
    setEventTitle(ev.title);
    setEventDescription(ev.description || '');
    setEventType(ev.event_type);
    setStartDate(ev.start_date);
    setStartTime(ev.start_time);
    setEndDate(ev.end_date || '');
    setEndTime(ev.end_time || '');
    setEventCompleted(ev.completed || false);
    setShowEventModal(true);
  };

  const prevPeriod = () => setCurrentDate(subDays(currentDate, calendarView === 'monthly' ? 30 : 7));
  const nextPeriod = () => setCurrentDate(addDays(currentDate, calendarView === 'monthly' ? 30 : 7));
  const today = () => setCurrentDate(new Date());

  const daysGrid = calendarView === 'monthly' ? getDaysInMonthGrid(currentDate) : getDaysInWeekGrid(currentDate);

  if (loading && tickets.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <span className="spinner spinner--small"></span> Carregando calendário...
      </div>
    );
  }

  return (
    <div className="calendar-screen" style={{ padding: 20 }}>
      {/* Header & Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text)' }}>Calendário & Lembretes</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            Acompanhe vencimentos de tickets e seus lembretes programados.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: 15, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={showPersonalEvents} onChange={e => setShowPersonalEvents(e.target.checked)} />
            Meus Eventos
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={showGlobalEvents} onChange={e => setShowGlobalEvents(e.target.checked)} />
            Eventos Globais
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={showTickets} onChange={e => setShowTickets(e.target.checked)} />
            Tickets
          </label>
          
          {showTickets && (
            <select 
              className="filter-bar__select"
              value={selectedAgent}
              onChange={e => setSelectedAgent(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', height: 32, fontSize: '0.85rem' }}
            >
              <option value="">Todos os Agentes</option>
              {agents.filter(a => a.is_active).map(a => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
            </select>
          )}

          <button onClick={() => openNewEventModal()} className="btn btn--primary" style={{ height: 36, marginLeft: 'auto' }}>
            <Plus size={16} /> Novo Lembrete
          </button>
        </div>
      </div>

      {/* Calendar Navigation */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        background: 'var(--color-background-soft)',
        padding: '12px 20px',
        borderRadius: '8px 8px 0 0',
        border: '1px solid var(--color-border)',
        borderBottom: 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <div style={{ display: 'flex', background: '#fff', borderRadius: 6, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            <button 
              onClick={() => setCalendarView('monthly')}
              style={{ padding: '6px 12px', background: calendarView === 'monthly' ? 'var(--color-background-soft)' : 'transparent', border: 'none', fontWeight: calendarView === 'monthly' ? 600 : 400, cursor: 'pointer' }}
            >
              Mês
            </button>
            <button 
              onClick={() => setCalendarView('weekly')}
              style={{ padding: '6px 12px', background: calendarView === 'weekly' ? 'var(--color-background-soft)' : 'transparent', border: 'none', borderLeft: '1px solid var(--color-border)', fontWeight: calendarView === 'weekly' ? 600 : 400, cursor: 'pointer' }}
            >
              Semana
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={prevPeriod} style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer' }}><ChevronLeft size={20} /></button>
            <button onClick={today} style={{ padding: '4px 12px', background: '#fff', border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer' }}>Hoje</button>
            <button onClick={nextPeriod} style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer' }}><ChevronRight size={20} /></button>
          </div>
        </div>

        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, textTransform: 'capitalize' }}>
          {format(currentDate, calendarView === 'monthly' ? 'MMMM yyyy' : "'Semana de' dd 'de' MMMM", { locale: ptBR })}
        </h2>
      </div>

      {/* Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(7, 1fr)', 
        borderLeft: '1px solid var(--color-border)', 
        borderTop: '1px solid var(--color-border)',
        backgroundColor: '#fff'
      }}>
        {/* Week Days Header */}
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
          <div key={day} style={{ padding: '10px', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-secondary)', borderRight: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
            {day}
          </div>
        ))}

        {/* Days */}
        {daysGrid.map((date, idx) => {
          const isCurrentMonth = isSameMonth(date, currentDate);
          const isToday = isSameDay(date, new Date());
          const dateStr = format(date, 'yyyy-MM-dd');
          const dayEvents = getEventsForDate(date);
          
          const dayTickets = getTicketsForDate(date);

          return (
            <div 
              key={idx} 
              style={{ 
                minHeight: calendarView === 'monthly' ? 120 : 400,
                padding: '8px',
                borderRight: '1px solid var(--color-border)',
                borderBottom: '1px solid var(--color-border)',
                background: isCurrentMonth ? '#fff' : '#fafafa',
                opacity: isCurrentMonth ? 1 : 0.6,
                cursor: 'pointer'
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) openNewEventModal(dateStr);
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: 8,
                pointerEvents: 'none'
              }}>
                <span style={{ 
                  width: 24, 
                  height: 24, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  borderRadius: '50%',
                  background: isToday ? 'var(--color-primary)' : 'transparent',
                  color: isToday ? '#fff' : 'inherit',
                  fontWeight: isToday ? 600 : 400,
                  fontSize: '0.9rem'
                }}>
                  {format(date, 'd')}
                </span>
                <button 
                  onClick={(e) => { e.stopPropagation(); openNewEventModal(dateStr); }} 
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', pointerEvents: 'auto' }}
                >
                  <Plus size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dayEvents.map(ev => {
                  const evCompleted = ev.completed;
                  const evBg = evCompleted ? '#F3F4F6' : (ev.event_type === 'global' ? '#E0E7FF' : '#DCFCE7');
                  const evColor = evCompleted ? '#6B7280' : (ev.event_type === 'global' ? '#3730A3' : '#166534');
                  const evBorder = evCompleted ? '#9CA3AF' : (ev.event_type === 'global' ? '#4F46E5' : '#16A34A');
                  
                  return (
                  <div 
                    key={ev.id} 
                    onClick={(e) => { e.stopPropagation(); openEditEventModal(ev); }}
                    style={{ 
                      fontSize: '0.75rem', 
                      padding: '4px 6px', 
                      borderRadius: 4, 
                      background: evBg,
                      color: evColor,
                      borderLeft: `3px solid ${evBorder}`,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    title={`${ev.start_time} - ${ev.title}`}
                  >
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: evCompleted ? 'line-through' : 'none' }}>
                      <strong>{ev.start_time}</strong> {ev.title}
                    </div>
                    <button 
                      onClick={(e) => handleToggleEventCompleted(ev, e)}
                      style={{ 
                        background: 'transparent', 
                        border: 'none', 
                        cursor: 'pointer', 
                        color: 'inherit',
                        padding: 0,
                        marginLeft: 4,
                        opacity: evCompleted ? 1 : 0.5
                      }}
                      title={evCompleted ? 'Marcar como pendente' : 'Marcar como concluído'}
                    >
                      <CheckCircle2 size={12} fill={evCompleted ? "currentColor" : "none"} />
                    </button>
                  </div>
                )})}

                {dayTickets.map(t => {
                  const isCompleted = t.status === 'solved' || t.status === 'closed';
                  
                  let tStr = '17:00';
                  let localDueDateStr = '';

                  if (t.due_date) {
                    localDueDateStr = t.due_date.endsWith('Z') ? t.due_date.slice(0, -1) : t.due_date;
                    
                    if (localDueDateStr.includes('T')) {
                      const timePart = localDueDateStr.split('T')[1];
                      if (!timePart.startsWith('00:00:00')) {
                        tStr = timePart.substring(0,5);
                      } else {
                         // Se a data do banco for meia-noite, ajustamos a string para 17:00 para bater com a regra visual
                         localDueDateStr = localDueDateStr.replace('00:00:00', '17:00:00');
                      }
                    }
                  }
                  
                  let isOverdue = false;
                  if (!isCompleted && localDueDateStr) {
                    isOverdue = new Date(localDueDateStr) < new Date();
                  }
                  
                  const bg = isCompleted ? '#F3F4F6' : (isOverdue ? '#FEE2E2' : '#EFF6FF');
                  const color = isCompleted ? '#6B7280' : (isOverdue ? '#991B1B' : '#1E40AF');
                  const border = isCompleted ? '#9CA3AF' : (isOverdue ? '#DC2626' : '#3B82F6');

                  return (
                  <div 
                    key={t.zendesk_id} 
                    style={{ 
                      fontSize: '0.75rem', 
                      padding: '4px 6px', 
                      borderRadius: 4, 
                      background: bg,
                      color: color,
                      borderLeft: `3px solid ${border}`,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      position: 'relative'
                    }}
                    title={`Ticket #${t.zendesk_id} vence dia ${format(date, 'dd/MM')}: ${t.subject}`}
                    onClick={(e) => { e.stopPropagation(); window.open(t.zendesk_url, '_blank'); }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <AlertCircle size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                        <strong>#{t.zendesk_id}</strong> Vence {tStr}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setTicketNewTime(tStr || '17:00'); setEditingTicket(t); }}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6 }}
                        title="Editar horário"
                      >
                        <Edit2 size={10} />
                      </button>
                    </div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.assignee_name || 'Sem atribuição'}
                    </div>
                  </div>
                )})}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Lembrete */}
      {showEventModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ background: '#fff', padding: 24, borderRadius: 8, width: 400, maxWidth: '90%' }}>
            <h3 style={{ marginTop: 0, marginBottom: 20 }}>{editingEventId ? 'Editar Lembrete' : 'Novo Lembrete'}</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Título</label>
                <input type="text" value={eventTitle} onChange={e => setEventTitle(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--color-border)' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Descrição / Detalhes</label>
                <textarea value={eventDescription} onChange={e => setEventDescription(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--color-border)', minHeight: 60 }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Data</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--color-border)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Hora</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--color-border)' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Tipo de Lembrete</label>
                  <select value={eventType} onChange={e => setEventType(e.target.value as any)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--color-border)' }}>
                    <option value="personal">Pessoal (Só eu vejo)</option>
                    <option value="global">Global (Todos veem)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Status</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 4, border: '1px solid var(--color-border)', cursor: 'pointer', background: eventCompleted ? '#F3F4F6' : '#fff' }}>
                    <input type="checkbox" checked={eventCompleted} onChange={e => setEventCompleted(e.target.checked)} style={{ cursor: 'pointer' }} />
                    <span style={{ fontSize: '0.85rem' }}>Concluído</span>
                  </label>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
              {editingEventId ? (
                <button onClick={() => handleDeleteEvent(editingEventId)} style={{ padding: '8px 16px', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Excluir</button>
              ) : <div></div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowEventModal(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleSaveEvent} style={{ padding: '8px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edição de Hora do Ticket */}
      {editingTicket && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ background: '#fff', padding: 24, borderRadius: 8, width: 350, maxWidth: '90%' }}>
            <h3 style={{ marginTop: 0, marginBottom: 15, fontSize: '1.1rem' }}>Horário do Ticket #{editingTicket.zendesk_id}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 20 }}>
              Defina o horário de vencimento deste ticket (Dia {editingTicket.due_date ? format(parseISO(editingTicket.due_date), 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy')}).
            </p>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Horário</label>
              <input 
                type="time" 
                value={ticketNewTime} 
                onChange={e => setTicketNewTime(e.target.value)} 
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--color-border)' }} 
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingTicket(null)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSaveTicketTime} style={{ padding: '8px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
