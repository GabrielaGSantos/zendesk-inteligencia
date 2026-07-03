import React, { useState } from 'react';
import { X, Calendar } from 'lucide-react';

interface SyncModalProps {
  onClose: () => void;
  onSync: (options?: { startDate?: string; endDate?: string }) => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({ onClose, onSync }) => {
  const [mode, setMode] = useState<'new' | 'custom'>('new');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleStart = () => {
    if (mode === 'new') {
      onSync();
    } else {
      if (!startDate || !endDate) {
        alert('Por favor, selecione as datas de início e fim.');
        return;
      }
      if (new Date(startDate) > new Date(endDate)) {
        alert('A data de início não pode ser maior que a data de fim.');
        return;
      }
      onSync({ startDate, endDate });
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <div className="modal__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} />
            Sincronizar Tickets
          </div>
          <button className="modal__close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal__body" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input 
                type="radio" 
                name="syncMode" 
                checked={mode === 'new'} 
                onChange={() => setMode('new')} 
                style={{ width: 16, height: 16, accentColor: 'var(--color-primary)' }}
              />
              <span style={{ fontWeight: 500 }}>Sincronizar Novos Tickets</span>
            </label>
            <div style={{ marginLeft: 24, fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: -12 }}>
              Busca automaticamente apenas os tickets criados desde a última sincronização.
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
              <input 
                type="radio" 
                name="syncMode" 
                checked={mode === 'custom'} 
                onChange={() => setMode('custom')} 
                style={{ width: 16, height: 16, accentColor: 'var(--color-primary)' }}
              />
              <span style={{ fontWeight: 500 }}>Sincronizar por Período</span>
            </label>
            <div style={{ marginLeft: 24, fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: -12 }}>
              Força a busca de tickets criados dentro de um intervalo de datas específico.
            </div>

            {mode === 'custom' && (
              <div style={{ marginLeft: 24, display: 'flex', gap: 12, marginTop: 4 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--color-text-secondary)' }}>Data Inicial</label>
                  <input 
                    type="date" 
                    value={startDate}
                    max={endDate || undefined}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--color-text-secondary)' }}>Data Final</label>
                  <input 
                    type="date" 
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                  />
                </div>
              </div>
            )}

          </div>
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn--secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" onClick={handleStart}>Iniciar</button>
        </div>
      </div>
    </div>
  );
};
