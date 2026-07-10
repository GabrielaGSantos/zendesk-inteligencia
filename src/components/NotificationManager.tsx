import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { CalendarEvent } from '../types';
import { Bell, X, Check } from 'lucide-react';
import { format } from 'date-fns';

const playAlertSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';
    
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.15);
    
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    gainNode.gain.setValueAtTime(0.5, ctx.currentTime + 0.15);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (err) {
    console.error('Erro ao reproduzir som de notificação:', err);
  }
};

export const NotificationManager: React.FC = () => {
  const [activeNotifications, setActiveNotifications] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    // Check events every 30 seconds
    const intervalId = setInterval(checkEvents, 30000);
    checkEvents(); // Initial check

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (activeNotifications.length > 0) {
      playAlertSound();
    }
  }, [activeNotifications.length]);

  const checkEvents = async () => {
    try {
      const evs = await api.calendar.list();
      const now = new Date();
      const dateStr = format(now, 'yyyy-MM-dd');
      const timeStr = format(now, 'HH:mm');

      const triggered = evs.filter(e => {
        return e.start_date === dateStr && e.start_time.substring(0, 5) === timeStr;
      });

      if (triggered.length > 0) {
        setActiveNotifications(prev => {
          const newNotifs = [...prev];
          let changed = false;
          triggered.forEach(t => {
            if (!newNotifs.find(n => n.id === t.id)) {
              newNotifs.push(t);
              changed = true;
            }
          });
          return changed ? newNotifs : prev;
        });
      }
    } catch (err) {
      console.error('Error fetching events for notification check:', err);
    }
  };

  const dismissNotification = (id: string) => {
    setActiveNotifications(prev => prev.filter(n => n.id !== id));
  };

  if (activeNotifications.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      zIndex: 99999
    }}>
      {activeNotifications.map(n => (
        <div key={n.id} style={{
          background: '#fff',
          borderLeft: '4px solid var(--color-primary)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          borderRadius: 8,
          padding: 16,
          width: 320,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12
        }}>
          <div style={{ color: 'var(--color-primary)', marginTop: 2 }}>
            <Bell size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 4, color: 'var(--color-text)' }}>
              {n.title}
            </div>
            {n.description && (
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                {n.description}
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 12 }}>
              {n.event_type === 'global' ? 'Lembrete Global' : 'Lembrete Pessoal'} • {n.start_time}
            </div>
            
            <button
              onClick={() => dismissNotification(n.id!)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                width: '100%',
                padding: '8px 0',
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            >
              <Check size={16} />
              Marcar como Visto
            </button>
          </div>
          <button 
            onClick={() => dismissNotification(n.id!)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};
