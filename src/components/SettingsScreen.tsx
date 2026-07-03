import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Activity, Cpu } from 'lucide-react';
import { api } from '../services/api';
import type { SystemSettings } from '../types';

export function SettingsScreen() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await api.settings.get();
      setSettings(data);
    } catch (err) {
      console.error('Failed to load settings', err);
      setMessage({ text: 'Erro ao carregar configurações', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    try {
      setSaving(true);
      setMessage(null);
      await api.settings.update(settings);
      setMessage({ text: 'Configurações salvas com sucesso!', type: 'success' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error('Failed to save settings', err);
      setMessage({ text: 'Erro ao salvar configurações. Verifique o console.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof SystemSettings, value: any) => {
    setSettings(prev => prev ? { ...prev, [field]: value } : null);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-blue-500"></div>
          <p>Carregando configurações...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <p>Não foi possível carregar as configurações.</p>
      </div>
    );
  }

  const geminiModels = [
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite',
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest',
    'gemini-pro-latest'
  ];
  const openaiModels = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'];
  const currentModels = settings.ai_provider === 'gemini' ? geminiModels : openaiModels;

  return (
    <div style={{ margin: '0 auto', maxWidth: '768px', paddingBottom: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', height: '48px', width: '48px', alignItems: 'center', justifyContent: 'center', borderRadius: '12px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
          <SettingsIcon size={24} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>Configurações do Sistema</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>Gerencie a IA e automações globais</p>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px', borderRadius: '12px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', padding: '24px' }}>
        
        {message && (
          <div style={{
            borderRadius: '8px', padding: '16px', fontSize: '0.875rem',
            backgroundColor: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: message.type === 'success' ? '#10b981' : '#ef4444',
            border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
          }}>
            {message.text}
          </div>
        )}

        {/* AI Provider & Model Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.125rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
            <Cpu size={20} color="#3b82f6" />
            <h2>Inteligência Artificial</h2>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Provedor de IA</label>
              <select
                value={settings.ai_provider}
                onChange={(e) => {
                  const newProvider = e.target.value as 'gemini' | 'openai';
                  handleChange('ai_provider', newProvider);
                  handleChange('ai_model', newProvider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini');
                }}
                style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-primary)', padding: '10px 16px', color: 'var(--color-text-primary)', outline: 'none' }}
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI (ChatGPT)</option>
              </select>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>A chave da API (API_KEY) deve estar configurada nas variáveis de ambiente.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Modelo de IA</label>
              <select
                value={settings.ai_model}
                onChange={(e) => handleChange('ai_model', e.target.value)}
                style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-primary)', padding: '10px 16px', color: 'var(--color-text-primary)', outline: 'none' }}
              >
                {currentModels.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>Recomendamos modelos flash/mini para melhor custo-benefício.</p>
            </div>
          </div>
        </div>

        <hr style={{ borderColor: 'var(--color-border)', margin: '8px 0' }} />

        {/* Automation Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.125rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
            <Activity size={20} color="#10b981" />
            <h2>Automações</h2>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-primary)', padding: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <h3 style={{ fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>Análise Automática (Webhook)</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                Se ativado, a IA irá analisar imediatamente todos os tickets que chegarem via webhook.
                Se desativado, os tickets serão sincronizados mas você precisará iniciar a análise manualmente.
              </p>
            </div>
            
            <label style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer', alignItems: 'center', marginLeft: '16px' }}>
              <input 
                type="checkbox" 
                style={{ opacity: 0, position: 'absolute', width: 0, height: 0 }}
                checked={settings.auto_analyze_webhooks}
                onChange={(e) => handleChange('auto_analyze_webhooks', e.target.checked)}
              />
              <div style={{ 
                height: '24px', width: '44px', borderRadius: '9999px', 
                backgroundColor: settings.auto_analyze_webhooks ? '#3b82f6' : 'var(--color-border)', 
                position: 'relative', transition: 'all 0.2s' 
              }}>
                <div style={{ 
                  position: 'absolute', left: '2px', top: '2px', height: '20px', width: '20px', 
                  borderRadius: '9999px', backgroundColor: '#fff', transition: 'all 0.2s',
                  transform: settings.auto_analyze_webhooks ? 'translateX(20px)' : 'translateX(0)'
                }}></div>
              </div>
            </label>
          </div>
        </div>

        <div style={{ paddingTop: '16px' }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', backgroundColor: '#2563eb', 
              padding: '10px 24px', fontWeight: 500, color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? (
              <span className="spinner spinner--small"></span>
            ) : (
              <Save size={18} />
            )}
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>

      </form>
    </div>
  );
}
