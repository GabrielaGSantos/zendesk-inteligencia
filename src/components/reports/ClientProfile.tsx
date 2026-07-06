import React, { useState, useEffect } from 'react';
import { ArrowLeft, Clock, Target, AlertCircle, RefreshCw, ChevronRight, Activity, Zap, CheckCircle, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const profileCache: Record<string, any> = {};
const historyCache: Record<string, any> = {};

export function ClientProfile({ clientName, filters, onBack }: any) {
  const [data, setData] = useState<any>(profileCache[clientName] || null);
  const [history, setHistory] = useState<any>(historyCache[clientName] || null);
  const [loading, setLoading] = useState(!data);
  const [loadingHistory, setLoadingHistory] = useState(!history);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        if (!profileCache[clientName]) setLoading(true);
        const res = await api.reports.getClientProfile(clientName, filters);
        if (res.success) {
          setData(res);
          profileCache[clientName] = res;
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const fetchHistory = async () => {
      try {
        if (!historyCache[clientName]) setLoadingHistory(true);
        const res = await api.reports.getClientHistory(clientName);
        if (res.success) {
          setHistory(res.events);
          historyCache[clientName] = res.events;
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchProfile();
    fetchHistory();
  }, [clientName, filters]);

  const generateStrategicAnalysis = async () => {
    setAnalyzing(true);
    try {
      const payload = {
        client: data.clientName,
        metrics: data.metrics,
        radar: data.radar,
        dependency: data.dependency,
        history
      };
      
      const res = await api.reports.getExecutiveSummary(payload);
      if (res.success) {
        setAiAnalysis(res.text);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><div className="loading-spinner"></div></div>;
  }

  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.3s' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button className="btn-secondary" onClick={onBack} style={{ padding: '8px', borderRadius: '50%' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-primary)' }}>
            {data.clientName}
            <span style={{ fontSize: '0.8rem', padding: '4px 8px', background: 'var(--color-bg-secondary)', borderRadius: 12, fontWeight: 'normal', color: 'var(--color-text-secondary)' }}>Perfil Operacional</span>
          </h2>
        </div>
      </div>

      {/* Resumo Executivo Determinístico e Botão IA */}
      <div className="card" style={{ padding: '24px', background: 'linear-gradient(to right, var(--color-bg-secondary), transparent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px' }}>
           <div style={{ flex: 1 }}>
             <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-primary)', marginBottom: 16 }}>
               <Activity size={20} color="var(--color-primary)" />
               Visão Geral
             </h3>
             <p style={{ fontSize: '1.05rem', lineHeight: 1.6, color: 'var(--color-text-secondary)', margin: 0 }}>
               {data.executiveSummary}
             </p>

             {aiAnalysis && (
               <div style={{ marginTop: 24, padding: 20, background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 8 }}>
                 <h4 style={{ margin: '0 0 12px 0', color: '#10b981', display: 'flex', alignItems: 'center', gap: 8 }}><Zap size={18}/> Análise Estratégica (IA)</h4>
                 <div style={{ lineHeight: 1.6, color: 'var(--color-text-primary)' }} dangerouslySetInnerHTML={{ __html: aiAnalysis.replace(/\n/g, '<br/>') }} />
               </div>
             )}
           </div>
           
           {!aiAnalysis && (
             <button className="btn-primary" onClick={generateStrategicAnalysis} disabled={analyzing} style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
               {analyzing ? <RefreshCw size={18} className="spin" /> : <Zap size={18} />}
               {analyzing ? 'Gerando Análise...' : 'Gerar Análise Estratégica'}
             </button>
           )}
        </div>
      </div>

      {/* Grid Principal */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px' }}>
        
        {/* Esquerda: Métricas e Radar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Comparativo de Carteira */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
             <MetricComparison title="SLA Cumprido" value={`${data.metrics.slaPct}%`} portfolio={`${data.portfolio.slaPct}%`} isBetter={parseFloat(data.metrics.slaPct) >= parseFloat(data.portfolio.slaPct)} icon={<Target/>} />
             <MetricComparison title="Tempo Médio" value={`${data.metrics.avgTime}h`} portfolio={`${data.portfolio.avgTime}h`} isBetter={parseFloat(data.metrics.avgTime) <= parseFloat(data.portfolio.avgTime)} icon={<Clock/>} />
             <MetricComparison title="Reaberturas" value={`${data.metrics.reopenRate}%`} portfolio={`${data.portfolio.reopenRate}%`} isBetter={parseFloat(data.metrics.reopenRate) <= parseFloat(data.portfolio.reopenRate)} icon={<AlertCircle/>} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Radar Operacional */}
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ marginTop: 0, marginBottom: 16, color: 'var(--color-text-primary)' }}>Radar Operacional</h3>
              <div style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data.radar}>
                    <PolarGrid stroke="var(--color-border)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }} />
                    <Radar name="Tickets" dataKey="A" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.4} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Índice de Dependência */}
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ marginTop: 0, marginBottom: 16, color: 'var(--color-text-primary)' }}>Índice de Dependência</h3>
              {data.dependency.product ? (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: 140, height: 140, borderRadius: '50%', background: `conic-gradient(var(--color-primary) ${data.dependency.pct}%, var(--color-bg-secondary) 0)` }}>
                    <div style={{ position: 'absolute', top: '10%', left: '10%', right: '10%', bottom: '10%', background: 'var(--color-bg-primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                       <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>{data.dependency.pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', marginTop: 24 }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Produto Ofensor</span>
                    <div style={{ fontWeight: 600, fontSize: '1.1rem', marginTop: 8, color: 'var(--color-text-primary)' }}>{data.dependency.product}</div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--color-text-secondary)' }}>Sem dados suficientes</div>
              )}
            </div>
          </div>

          {/* Recomendações Determinísticas */}
          <div className="card" style={{ padding: '24px', background: 'var(--color-bg-secondary)' }}>
             <h3 style={{ marginTop: 0, marginBottom: 20, color: 'var(--color-text-primary)' }}>Recomendações Táticas</h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
               {data.recommendations.map((rec: string, idx: number) => (
                 <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                   <CheckCircle size={18} color="var(--color-primary)" style={{ flexShrink: 0 }} />
                   <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{rec}</span>
                 </div>
               ))}
             </div>
          </div>

        </div>

        {/* Direita: Timeline de Acontecimentos */}
        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginTop: 0, marginBottom: 24, color: 'var(--color-text-primary)' }}>Timeline (Últimas 8 Sem)</h3>
          
          {loadingHistory ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}><div className="loading-spinner"></div></div>
          ) : history && history.length > 0 ? (
            <div style={{ position: 'relative', flex: 1 }}>
              <div style={{ position: 'absolute', left: 7, top: 10, bottom: 10, width: 2, background: 'var(--color-border)' }}></div>
              {history.map((evt: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', gap: 16, marginBottom: 24, position: 'relative' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--color-bg-primary)', border: '4px solid var(--color-primary)', zIndex: 1, marginTop: 4 }}></div>
                  <div style={{ flex: 1, marginTop: -2 }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                      {new Date(evt.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </div>
                    <div style={{ fontWeight: 500, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>{evt.label}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
             <div style={{ color: 'var(--color-text-secondary)', textAlign: 'center', marginTop: 40 }}>Nenhum evento crítico registrado.</div>
          )}
        </div>

      </div>
    </div>
  );
}

function MetricComparison({ title, value, portfolio, isBetter, icon }: any) {
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        {React.cloneElement(icon, { size: 18 })} {title}
      </div>
      <div style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 20 }}>{value}</div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Média da carteira: <strong style={{ color: 'var(--color-text-primary)' }}>{portfolio}</strong></span>
        {isBetter ? 
           <span style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14}/> Melhor</span> 
         : <span style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={14}/> Pior</span>}
      </div>
    </div>
  );
}
