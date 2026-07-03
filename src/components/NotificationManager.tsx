import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { CalendarEvent } from '../types';
import { Bell, X } from 'lucide-react';
import { format } from 'date-fns';

export const NotificationManager: React.FC = () => {
  const [activeNotifications, setActiveNotifications] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    // Check events every 30 seconds
    const intervalId = setInterval(checkEvents, 30000);
    checkEvents(); // Initial check

    return () => clearInterval(intervalId);
  }, []);

  const checkEvents = async () => {
    try {
      const evs = await api.calendar.list();
      const now = new Date();
      const dateStr = format(now, 'yyyy-MM-dd');
      const timeStr = format(now, 'HH:mm'); // e.g., '09:00'

      const triggered = evs.filter(e => {
        return e.start_date === dateStr && e.start_time.substring(0, 5) === timeStr;
      });

      if (triggered.length > 0) {
        setActiveNotifications(prev => {
          const newNotifs = [...prev];
          triggered.forEach(t => {
            // Prevent duplicate toasts for the same event
            if (!newNotifs.find(n => n.id === t.id)) {
              newNotifs.push(t);
            }
          });
          return newNotifs;
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
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              {n.event_type === 'global' ? 'Lembrete Global' : 'Lembrete Pessoal'} • {n.start_time}
            </div>
          </div>
          <button 
            onClick={() => dismissNotification(n.id!)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};
