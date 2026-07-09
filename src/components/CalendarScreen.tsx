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
  const [activeTab, setActiveTab] = useState<'calendar' | 'manage'>('calendar');
  const [calendarView, setCalendarView] = useState<'monthly' | 'weekly'>('monthly');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Filter state
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>(['personal', 'global', 'ticket', 'birthday', 'vacation', 'medical', 'absence']);
  const [showAgentFilter, setShowAgentFilter] = useState(false);
  const [showTypeFilter, setShowTypeFilter] = useState(false);

  // Modal / Form state
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventType, setEventType] = useState<'personal' | 'global' | 'birthday' | 'vacation' | 'medical' | 'absence'>('personal');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [eventCompleted, setEventCompleted] = useState(false);
  const [eventAgent, setEventAgent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
    if (!selectedEventTypes.includes('ticket')) return [];
    
    const dateStr = format(date, 'yyyy-MM-dd');
    return tickets.filter(t => {
      if (!t.due_date) return false;
      const tDate = t.due_date.split('T')[0];
      if (tDate !== dateStr) return false;
      
      // Apply agent filter for tickets
      if (selectedAgents.length > 0 && !selectedAgents.includes(t.assignee_name)) {
        return false;
      }
      
      return true;
    });
  };

  const getEventsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return events.filter(e => {
      if (!selectedEventTypes.includes(e.event_type)) return false;
      
      const isStart = e.start_date === dateStr;
      const isEnd = e.end_date === dateStr;
      
      if (!e.end_date) return isStart;
      
      const d = date.getTime();
      const s = parseISO(e.start_date).getTime();
      const end = parseISO(e.end_date).getTime();
      return d >= s && d <= end;
    });
  };

  const resetForm = (dateStr?: string) => {
    setEditingEventId(null);
    setEventTitle('');
    setEventDescription('');
    setEventType('personal');
    setStartDate(dateStr || format(new Date(), 'yyyy-MM-dd'));
    setStartTime('09:00');
    setEndDate('');
    setEndTime('');
    setEventCompleted(false);
    setEventAgent('');
  };

  const handleSaveEvent = async () => {
    try {
      setIsSaving(true);
      const payload: CalendarEvent = {
        title: eventTitle,
        description: eventDescription,
        event_type: eventType,
        agent_name: eventAgent || undefined,
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
      resetForm();
      await fetchData();
      alert('Lembrete salvo com sucesso!');
    } catch (err) {
      console.error('Error saving event:', err);
      alert('Erro ao salvar lembrete.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este lembrete?')) return;
    try {
      await api.calendar.delete(id);
      setShowEventModal(false);
      resetForm();
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
    resetForm(dateStr);
    setShowEventModal(true);
  };

  const openEditEventModal = (ev: CalendarEvent) => {
    setEditingEventId(ev.id || null);
    setEventTitle(ev.title);
    setEventDescription(ev.description || '');
    setEventType(ev.event_type);
    setEventAgent(ev.agent_name || '');
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
          
          {/* Tipos de Eventos Multi-select */}
          <div style={{ position: 'relative' }}>
            <div 
              onClick={() => setShowTypeFilter(!showTypeFilter)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: '0.85rem', cursor: 'pointer', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              Tipos ({selectedEventTypes.length}) <ChevronRight size={14} style={{ transform: showTypeFilter ? 'rotate(90deg)' : 'none', transition: '0.2s' }} />
            </div>
            {showTypeFilter && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, zIndex: 10, minWidth: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { id: 'personal', label: 'Meus Lembretes' },
                  { id: 'global', label: 'Eventos Globais' },
                  { id: 'ticket', label: 'Vencimento de Tickets' },
                  { id: 'birthday', label: 'Aniversários' },
                  { id: 'vacation', label: 'Férias' },
                  { id: 'medical', label: 'Consultas Médicas' },
                  { id: 'absence', label: 'Ausência Justificada' },
                ].map(type => (
                  <label key={type.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedEventTypes.includes(type.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedEventTypes([...selectedEventTypes, type.id]);
                        else setSelectedEventTypes(selectedEventTypes.filter(t => t !== type.id));
                      }}
                    />
                    {type.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Agentes Multi-select */}
          <div style={{ position: 'relative' }}>
            <div 
              onClick={() => setShowAgentFilter(!showAgentFilter)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: '0.85rem', cursor: 'pointer', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              Agentes ({selectedAgents.length === 0 ? 'Todos' : selectedAgents.length}) <ChevronRight size={14} style={{ transform: showAgentFilter ? 'rotate(90deg)' : 'none', transition: '0.2s' }} />
            </div>
            {showAgentFilter && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, zIndex: 10, minWidth: 200, maxHeight: 300, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {agents.filter(a => a.is_active).map(a => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedAgents.includes(a.name)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedAgents([...selectedAgents, a.name]);
                        else setSelectedAgents(selectedAgents.filter(n => n !== a.name));
                      }}
                    />
                    {a.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => { setActiveTab('manage'); resetForm(); }} className="btn btn--primary" style={{ height: 36, marginLeft: 'auto' }}>
            <Plus size={16} /> Novo Lembrete
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid var(--color-border)', marginBottom: 20 }}>
        <button 
          onClick={() => setActiveTab('calendar')} 
          style={{ background: 'none', border: 'none', borderBottom: activeTab === 'calendar' ? '2px solid var(--color-primary)' : '2px solid transparent', padding: '10px 0', cursor: 'pointer', fontWeight: activeTab === 'calendar' ? 600 : 400, color: activeTab === 'calendar' ? 'var(--color-primary)' : 'var(--color-text-secondary)', transition: '0.2s' }}
        >
          Visão Geral
        </button>
        <button 
          onClick={() => setActiveTab('manage')} 
          style={{ background: 'none', border: 'none', borderBottom: activeTab === 'manage' ? '2px solid var(--color-primary)' : '2px solid transparent', padding: '10px 0', cursor: 'pointer', fontWeight: activeTab === 'manage' ? 600 : 400, color: activeTab === 'manage' ? 'var(--color-primary)' : 'var(--color-text-secondary)', transition: '0.2s' }}
        >
          Gerenciar Lembretes
        </button>
      </div>

      {activeTab === 'calendar' && (
        <>
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
                  
                  let evBg = '#DCFCE7';
                  let evColor = '#166534';
                  let evBorder = '#16A34A';
                  let icon = null;

                  switch (ev.event_type) {
                    case 'global':
                      evBg = '#E0E7FF'; evColor = '#3730A3'; evBorder = '#4F46E5';
                      break;
                    case 'birthday':
                      evBg = '#FEF08A'; evColor = '#854D0E'; evBorder = '#EAB308';
                      icon = '🎂';
                      break;
                    case 'vacation':
                      evBg = '#FFEDD5'; evColor = '#9A3412'; evBorder = '#F97316';
                      icon = '🌴';
                      break;
                    case 'medical':
                      evBg = '#FEE2E2'; evColor = '#991B1B'; evBorder = '#EF4444';
                      icon = '🏥';
                      break;
                    case 'absence':
                      evBg = '#F3E8FF'; evColor = '#7E22CE'; evBorder = '#A855F7';
                      icon = '🚫';
                      break;
                  }

                  if (evCompleted) {
                    evBg = '#F3F4F6'; evColor = '#6B7280'; evBorder = '#9CA3AF';
                  }
                  
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
                    title={`${ev.start_time.substring(0,5)}${ev.end_time && ev.end_time !== ev.start_time ? ` - ${ev.end_time.substring(0,5)}` : ''} - ${ev.title}`}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', width: 'calc(100% - 16px)' }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: evCompleted ? 'line-through' : 'none' }}>
                        <strong>{ev.start_time.substring(0,5)}{ev.end_time && ev.end_time !== ev.start_time ? ` - ${ev.end_time.substring(0,5)}` : ''}</strong> {icon && <span style={{ marginRight: 4 }}>{icon}</span>}{ev.title}
                      </div>
                      {ev.agent_name && (
                        <div style={{ fontSize: '0.65rem', opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ev.agent_name}
                        </div>
                      )}
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
                    // Remove Z or +00:00 to force local time evaluation
                    localDueDateStr = t.due_date.split('+')[0].replace('Z', '');
                    
                    if (localDueDateStr.includes('T')) {
                      const timePart = localDueDateStr.split('T')[1];
                      if (!timePart.startsWith('00:00:00')) {
                        tStr = timePart.substring(0,5);
                      } else {
                         // Se a data do banco for meia-noite, ajustamos a string para 17:00 para bater com a regra visual
                         localDueDateStr = localDueDateStr.replace('00:00:00', '17:00:00');
                         tStr = '17:00';
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
      </>
      )}

      {activeTab === 'manage' && (
        <div style={{ display: 'flex', gap: 24, marginTop: 10 }}>
          {/* Lado Esquerdo: Lista de Lembretes */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--color-text)', display: 'flex', justifyContent: 'space-between' }}>
              Lembretes & Feriados Ativos
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontWeight: 400 }}>({events.length} registrados)</span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--color-surface)', padding: 16, borderRadius: 8, border: '1px solid var(--color-border)', minHeight: 400, maxHeight: 600, overflowY: 'auto' }}>
              {events.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-text-tertiary)' }}>Nenhum lembrete encontrado.</div>
              ) : (
                events.map(ev => {
                  let evBg = '#DCFCE7'; let evColor = '#166534'; let evLabel = 'Pessoal';
                  switch (ev.event_type) {
                    case 'global': evBg = '#E0E7FF'; evColor = '#3730A3'; evLabel = 'Global'; break;
                    case 'birthday': evBg = '#FEF08A'; evColor = '#854D0E'; evLabel = 'Aniversário'; break;
                    case 'vacation': evBg = '#FFEDD5'; evColor = '#9A3412'; evLabel = 'Férias'; break;
                    case 'medical': evBg = '#FEE2E2'; evColor = '#991B1B'; evLabel = 'Consulta Médica'; break;
                    case 'absence': evBg = '#F3E8FF'; evColor = '#7E22CE'; evLabel = 'Ausência Justificada'; break;
                  }

                  return (
                    <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, border: '1px solid var(--color-border)', borderRadius: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <div style={{ width: 12, height: 12, borderRadius: '50%', background: evColor }}></div>
                          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 500, color: 'var(--color-text)' }}>{ev.title}</h3>
                          <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 12, background: evBg, color: evColor, fontWeight: 600, textTransform: 'uppercase' }}>
                            {evLabel}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                          Período: {format(parseISO(ev.start_date), 'dd/MM/yyyy')} {(ev.end_date && ev.end_date !== ev.start_date) ? ` até ${format(parseISO(ev.end_date), 'dd/MM/yyyy')}` : ''} 
                          {ev.start_time && ` (${ev.start_time.substring(0,5)}${ev.end_time && ev.end_time !== ev.start_time ? ` às ${ev.end_time.substring(0,5)}` : ''})`}
                          {ev.agent_name && <span style={{ marginLeft: 8, fontWeight: 500, color: 'var(--color-primary)' }}>• {ev.agent_name}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { setEditingEventId(ev.id || null); setEventTitle(ev.title); setEventDescription(ev.description || ''); setEventType(ev.event_type); setStartDate(ev.start_date); setStartTime(ev.start_time); setEndDate(ev.end_date || ''); setEndTime(ev.end_time || ''); setEventCompleted(ev.completed || false); }} style={{ padding: 8, background: '#F3F4F6', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer' }}><Edit2 size={16} /></button>
                        <button onClick={() => handleDeleteEvent(ev.id!)} style={{ padding: 8, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 4, cursor: 'pointer' }}><Trash2 size={16} /></button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Lado Direito: Formulário */}
          <div style={{ width: 400, background: 'var(--color-surface)', padding: 24, borderRadius: 12, border: '1px solid var(--color-border)' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: 20 }}>
              {editingEventId ? 'Editar Lembrete' : 'Adicionar Novo'}
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>Título / Motivo</label>
                <input type="text" placeholder="Ex: Feriado Tiradentes" value={eventTitle} onChange={e => setEventTitle(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>Tipo do Lembrete</label>
                <select value={eventType} onChange={e => setEventType(e.target.value as any)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff' }}>
                  <option value="personal">Pessoal (Só eu vejo)</option>
                  <option value="global">Global (Todos veem)</option>
                  <option value="birthday">Aniversário</option>
                  <option value="vacation">Férias</option>
                  <option value="medical">Consulta Médica</option>
                  <option value="absence">Ausência Justificada</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>Agente Relacionado (Opcional)</label>
                <select value={eventAgent} onChange={e => setEventAgent(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff' }}>
                  <option value="">Nenhum (Geral)</option>
                  {agents.map(ag => (
                    <option key={ag.id} value={ag.name}>{ag.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>Data Início</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>Data Fim</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)' }} />
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>Hora Inicial</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>Hora Final</label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>Observações</label>
                <textarea value={eventDescription} onChange={e => setEventDescription(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)', minHeight: 80, resize: 'none' }} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button 
                  onClick={() => resetForm()} 
                  disabled={isSaving}
                  style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', borderRadius: 8, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}
                >
                  Limpar
                </button>
                <button 
                  onClick={handleSaveEvent} 
                  disabled={isSaving}
                  style={{ flex: 2, padding: '12px', background: 'var(--color-primary)', border: 'none', color: '#fff', borderRadius: 8, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Plus size={18} /> {isSaving ? 'Salvando...' : (editingEventId ? 'Salvar Edição' : 'Adicionar')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    <option value="birthday">Aniversário</option>
                    <option value="vacation">Férias</option>
                    <option value="medical">Consulta Médica</option>
                    <option value="absence">Ausência Justificada</option>
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

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Agente Relacionado (Opcional)</label>
                <select value={eventAgent} onChange={e => setEventAgent(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--color-border)' }}>
                  <option value="">Nenhum (Geral)</option>
                  {agents.map(ag => (
                    <option key={ag.id} value={ag.name}>{ag.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
              {editingEventId ? (
                <button onClick={() => handleDeleteEvent(editingEventId)} style={{ padding: '8px 16px', background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Excluir</button>
              ) : <div></div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowEventModal(false)} disabled={isSaving} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 4, cursor: isSaving ? 'not-allowed' : 'pointer' }}>Cancelar</button>
                <button onClick={handleSaveEvent} disabled={isSaving} style={{ padding: '8px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 4, cursor: isSaving ? 'not-allowed' : 'pointer' }}>{isSaving ? 'Salvando...' : 'Salvar'}</button>
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
