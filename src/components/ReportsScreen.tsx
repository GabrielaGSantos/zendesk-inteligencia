import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  TrendingUp, TrendingDown, Filter, Download, Printer, 
  Activity, Users, Target, Clock, AlertTriangle, Layers, Map,
  CheckCircle, XCircle, Brain, RefreshCw
} from 'lucide-react';
import { 
  ComposedChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine,
  PieChart, Pie
} from 'recharts';
import { ClientsBI } from './reports/ClientsBI';
import { ClientProfile } from './reports/ClientProfile';
// @ts-ignore
import html2pdf from 'html2pdf.js';

const CustomEvolutionTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const entradas = payload.find((p: any) => p.dataKey === 'entradas')?.value || 0;
    const resolvidos = payload.find((p: any) => p.dataKey === 'resolvidos')?.value || 0;
    const saldo = payload.find((p: any) => p.dataKey === 'saldo')?.value || 0;

    let color = 'var(--color-text-secondary)';
    let situation = '🟢 A fila permaneceu estável.';
    if (saldo > 0) {
      color = '#ef4444';
      situation = `🔴 A fila aumentou em ${saldo} tickets.`;
    } else if (saldo < 0) {
      color = '#22c55e';
      situation = `🟢 A fila reduziu em ${Math.abs(saldo)} tickets.`;
    }

    return (
      <div style={{ backgroundColor: '#ffffff', padding: '16px', border: '1px solid var(--color-border)', borderRadius: '8px', minWidth: '220px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <p style={{ margin: '0 0 12px 0', fontWeight: 'bold', color: '#1e293b' }}>{label}</p>
        
        <div style={{ marginBottom: '4px', color: '#1e293b' }}>
          <span style={{ color: '#64748b', display: 'inline-block', width: '80px' }}>Entraram:</span>
          <strong>{entradas} tickets</strong>
        </div>
        <div style={{ marginBottom: '12px', color: '#1e293b' }}>
          <span style={{ color: '#64748b', display: 'inline-block', width: '80px' }}>Resolvidos:</span>
          <strong>{resolvidos} tickets</strong>
        </div>
        
        <div style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', marginBottom: '8px' }}>
          <span style={{ color: '#64748b', display: 'inline-block', width: '80px' }}>Saldo:</span>
          <strong style={{ color }}>{saldo > 0 ? `+${saldo}` : saldo} tickets</strong>
        </div>
        
        <p style={{ margin: 0, fontSize: '0.85rem', color, fontWeight: 500 }}>{situation}</p>
      </div>
    );
  }
  return null;
};

const CustomEvolutionDot = (props: any) => {
  const { cx, cy, payload } = props;
  const isPositive = payload.saldo > 0;
  const isNegative = payload.saldo < 0;
  const fill = isPositive ? '#ef4444' : isNegative ? '#22c55e' : '#9ca3af';
  
  return (
    <circle cx={cx} cy={cy} r={5} stroke="var(--color-bg-primary)" strokeWidth={2} fill={fill} />
  );
};

export const ReportsScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [isAutoSyncing, setIsAutoSyncing] = useState(true);
  const [data, setData] = useState<any>(null);

  // Parecer Executivo (IA)
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [isCached, setIsCached] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [reportsHistory, setReportsHistory] = useState<any[]>([]);

  // Navegação e Histórico de Longo Prazo
  const [activeTab, setActiveTab] = useState<'overview' | 'operacao' | 'equipe' | 'produtos' | 'clientes' | 'tendencias' | 'historico'>('overview');
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [loadingHistorical, setLoadingHistorical] = useState(false);

  // Filters state
  const [period, setPeriod] = useState('esta_semana');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  
  const [client, setClient] = useState('');
  const [product, setProduct] = useState('');
  const [category, setCategory] = useState('');
  const [group, setGroup] = useState('');
  const [priority, setPriority] = useState('');
  
  const [showFilters, setShowFilters] = useState(false);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const filters = {
        period, customStart, customEnd, client, product, category, group, priority
      };
      
      const response = await api.reports.getDashboard(filters);
      if (response.success) {
        setData(response);
      }
    } catch (err) {
      console.error('Error fetching dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistoricalData = async () => {
    setLoadingHistorical(true);
    try {
      const response = await api.reports.getHistorical();
      if (response.success) {
        setHistoricalData(response.history);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistorical(false);
    }
  };

  const fetchReportsHistory = async () => {
    try {
      const response = await api.reports.getExecutiveReports();
      if (response.success) setReportsHistory(response.reports);
    } catch (err) {
      console.error(err);
    }
  };

  const generateExecutiveSummary = async () => {
    setLoadingAI(true);
    setShowAIModal(true);
    try {
      const payload = {
        periodo: period,
        entradas: data.summary?.entradas,
        resolvidos: data.summary?.resolvidos,
        backlog: data.summary?.backlog,
        variacaoBacklog: data.summary?.backlog - data.summary?.backlogPrev,
        sla: data.summary?.slaCumprido / (data.summary?.slaCumprido + data.summary?.slaVencido) * 100,
        tempoMedio: data.summary?.avgResolutionTime + 'h',
        clientesTop: data.distributions?.byClient?.slice(0, 3).map((c: any) => ({
          nome: c.name,
          tickets: c.entradas,
          tempoMedio: c.avgTime + 'h'
        })),
        produtosTop: data.distributions?.byProduct?.slice(0, 3).map((p: any) => ({
          nome: p.name,
          tickets: p.count
        })),
        demandasInternas: data.distributions?.internalDemand,
        gargalos: data.insights
      };

      const response = await api.reports.getExecutiveSummary(payload);
      if (response.success) {
        setAiSummary(response.text);
        setIsCached(response.cached);
        fetchReportsHistory();
      } else {
        setAiSummary('Não foi possível gerar o parecer neste momento.');
        setIsCached(false);
      }
    } catch (err) {
      console.error(err);
      setAiSummary('Ocorreu um erro de comunicação com a IA.');
      setIsCached(false);
    } finally {
      setLoadingAI(false);
    }
  };

  useEffect(() => {
    const doAutoSync = async () => {
      setIsAutoSyncing(true);
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        await api.startSync({ startDate: thirtyDaysAgo.toISOString() });
        
        let syncing = true;
        let attempts = 0;
        while(syncing && attempts < 15) { // max 30s
          await new Promise(r => setTimeout(r, 2000));
          const res = await api.getSyncStatus();
          if (res.status === 'idle' || res.status === 'error' || res.status === 'completed') {
            syncing = false;
          }
          attempts++;
        }
      } catch (err) {
        console.error('Auto sync failed', err);
      } finally {
        setIsAutoSyncing(false);
      }
    };
    doAutoSync();
  }, []);

  useEffect(() => {
    if (activeTab === 'overview' && !data) {
      fetchDashboard();
    } else if (activeTab === 'historico' && historicalData.length === 0) {
      fetchHistoricalData();
    }
  }, [activeTab]);

  useEffect(() => {
    if (showAIModal && reportsHistory.length === 0) {
      fetchReportsHistory();
    }
  }, [showAIModal]);

  const handleExportCSV = () => {
    if (!data) return;
    const headers = ['Data', 'Entradas', 'Saídas', 'Saldo'];
    const rows = data.evolution.map((e: any) => [e.date, e.entradas, e.resolvidos, e.saldo]);
    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `relatorio_evolucao_${period}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = async () => {
    const container = document.getElementById('report-export-container');
    if (!container) return;

    // Adiciona classe para esconder elementos no-print durante a exportação
    container.classList.add('is-exporting');

    const opt = {
      margin:       [10, 10, 10, 10],
      filename:     `relatorio_gerencial_${period}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, windowWidth: 1200 }, // Força renderização desktop
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:    { mode: ['avoid-all', 'css'] }
    };

    try {
      await html2pdf().set(opt).from(container).save();
    } catch (err) {
      console.error('Erro ao gerar PDF', err);
    } finally {
      container.classList.remove('is-exporting');
    }
  };

  const renderTrend = (value: number) => {
    if (value === 0 || !isFinite(value)) return <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>Sem alteração</span>;
    if (value > 0) return <span style={{ color: 'var(--color-success)', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}><TrendingUp size={14} style={{ marginRight: 4 }}/> +{value.toFixed(1)}%</span>;
    return <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}><TrendingDown size={14} style={{ marginRight: 4 }}/> {value.toFixed(1)}%</span>;
  };

  const renderInvertedTrend = (value: number) => {
    if (value === 0 || !isFinite(value)) return <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>Sem alteração</span>;
    if (value > 0) return <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}><TrendingUp size={14} style={{ marginRight: 4 }}/> +{value.toFixed(1)}% (Crescendo)</span>;
    return <span style={{ color: 'var(--color-success)', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}><TrendingDown size={14} style={{ marginRight: 4 }}/> {value.toFixed(1)}% (Reduzindo)</span>;
  };

  const renderGrowthTrend = (growth: number) => {
    if (growth === 0 || !isFinite(growth)) return <span style={{ color: 'var(--color-text-secondary)' }}>-</span>;
    if (growth > 0) return <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>▲ +{growth.toFixed(0)}%</span>;
    return <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>▼ {growth.toFixed(0)}%</span>;
  };

  const renderParsedAI = (text: string) => {
    try {
      let cleanText = text.trim();
      if (cleanText.startsWith('```json')) cleanText = cleanText.replace('```json', '');
      if (cleanText.startsWith('```')) cleanText = cleanText.replace('```', '');
      if (cleanText.endsWith('```')) cleanText = cleanText.replace(/```$/, '');
      cleanText = cleanText.trim();
      
      const parsed = JSON.parse(cleanText);
      if (parsed.parecerExecutivo && Array.isArray(parsed.parecerExecutivo)) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>
            {parsed.parecerExecutivo.map((section: any, idx: number) => (
              <div key={idx}>
                <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-text-primary)', fontSize: '1.1rem' }}>{section.titulo}</h4>
                <div dangerouslySetInnerHTML={{ __html: section.corpo ? section.corpo.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') : '' }} style={{ lineHeight: 1.6, color: 'var(--color-text-secondary)' }} />
              </div>
            ))}
          </div>
        );
      }
    } catch(e) {}
    
    // Fallback if not JSON or parsing fails
    return <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: 'var(--color-text-primary)', fontSize: '1.05rem' }}>{text}</div>;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column' }}>
        <div className="spinner" style={{ marginBottom: 16 }}></div>
        <p style={{ color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          Compilando relatórios estratégicos...
        </p>
      </div>
    );
  }

  if (!data?.summary && activeTab === 'overview') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column', gap: 16 }}>
        <AlertTriangle size={48} color="#ef4444" />
        <p style={{ color: 'var(--color-text-secondary)' }}>Ocorreu um erro ao carregar os dados. Verifique a conexão com o servidor e se as chaves da API estão corretas.</p>
        <button className="btn btn--primary" onClick={() => fetchDashboard()}>Tentar Novamente</button>
      </div>
    );
  }

  const { summary, distributions, trends, evolution, insights } = data || {};

  const entradasTrend = summary?.entradasPrev === 0 ? (summary?.entradas > 0 ? 100 : 0) : ((summary?.entradas - summary?.entradasPrev) / summary?.entradasPrev) * 100;
  const resolvidosTrend = summary?.resolvidosPrev === 0 ? (summary?.resolvidos > 0 ? 100 : 0) : ((summary?.resolvidos - summary?.resolvidosPrev) / summary?.resolvidosPrev) * 100;
  const backlogTrend = summary?.backlogPrev === 0 ? (summary?.backlog > 0 ? 100 : 0) : ((summary?.backlog - summary?.backlogPrev) / summary?.backlogPrev) * 100;
  const abertosTrend = summary?.abertosPrev === 0 ? (summary?.abertos > 0 ? 100 : 0) : ((summary?.abertos - summary?.abertosPrev) / summary?.abertosPrev) * 100;
  const pendentesTrend = summary?.pendentesPrev === 0 ? (summary?.pendentes > 0 ? 100 : 0) : ((summary?.pendentes - summary?.pendentesPrev) / summary?.pendentesPrev) * 100;

  const renderComparativeCard = (
    title: string,
    icon: any,
    iconColor: string,
    iconBg: string,
    currentValue: string | number,
    prevValue: string | number,
    absDiff: string | number,
    pctDiff: number,
    goodDirection: 'up' | 'down',
    isPercentage: boolean = false
  ) => {
    const isUp = pctDiff > 0;
    const isGood = pctDiff === 0 ? true : (goodDirection === 'up' ? isUp : !isUp);
    const color = pctDiff === 0 ? 'var(--color-text-secondary)' : (isGood ? 'var(--color-success)' : 'var(--color-danger)');
    const arrow = isUp ? '▲' : '▼';
    const comp = data.comparison;
    
    return (
      <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>{title}</span>
          <div style={{ background: iconBg, padding: '6px', borderRadius: '8px', color: iconColor }}>{icon}</div>
        </div>
        
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-end', marginTop: 4 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1 }}>{currentValue}{isPercentage ? '%' : ''}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '8px' }}>{comp.current.label}</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: '3px' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--color-text-secondary)', lineHeight: 1 }}>{prevValue}{isPercentage ? '%' : ''}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '6px' }}>{comp.reference.label}</span>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontWeight: 600, color, background: pctDiff === 0 ? 'var(--color-bg-secondary)' : `${color}15`, padding: '6px 12px', borderRadius: '6px', width: 'fit-content' }}>
          <span>{pctDiff !== 0 ? arrow : '-'} {absDiff > 0 ? '+' : ''}{absDiff}{isPercentage ? 'pp' : ''}</span>
          {pctDiff !== 0 && <span style={{ fontSize: '0.85rem' }}>({pctDiff > 0 ? '+' : ''}{pctDiff.toFixed(1)}%)</span>}
        </div>
      </div>
    );
  };

  return (
    <div id="report-export-container" className="reports-manager print-container" style={{ paddingBottom: '40px' }}>
      <style dangerouslySetInnerHTML={{__html: `
        .print-only { display: none; }
        .is-exporting .no-print { display: none !important; }
        .is-exporting .print-only { display: block !important; margin-bottom: 20px; border-bottom: 2px solid #ddd; padding-bottom: 10px; }
        .is-exporting { background: white; color: black; padding: 20px !important; }
        .is-exporting .card { border: 1px solid #ddd; box-shadow: none; break-inside: avoid; }
        
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; margin-bottom: 20px; border-bottom: 2px solid #ddd; padding-bottom: 10px; }
          .app-sidebar { display: none !important; }
          .app-main { margin-left: 0 !important; padding: 0 !important; }
          .print-container { background: white; color: black; }
          .card { border: 1px solid #ddd; box-shadow: none; break-inside: avoid; }
        }
        .insight-list {
          margin: 0; padding-left: 20px; color: var(--color-text-secondary); font-size: 0.95rem; line-height: 1.6;
        }
        .insight-list li { margin-bottom: 8px; }
      `}} />

      <div className="print-only">
        <h2 style={{ margin: '0 0 16px 0', color: '#111827' }}>Relatório Gerencial de Operações</h2>
        <div style={{ display: 'flex', gap: '40px', fontSize: '0.9rem', color: '#4b5563' }}>
          <div><strong>Período Selecionado:</strong> {period}</div>
          <div><strong>Gerado em:</strong> {new Date().toLocaleString('pt-BR')}</div>
        </div>
      </div>

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className="page-header__title">
            Relatórios Gerenciais
            {isAutoSyncing && (
              <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: 'var(--color-text-secondary)', marginLeft: '12px', display: 'inline-flex', alignItems: 'center' }}>
                <RefreshCw size={14} className="spin" style={{ marginRight: '4px' }} />
                Sincronizando Zendesk...
              </span>
            )}
          </h1>
          <p className="page-header__description">
            Visão executiva e acompanhamento estratégico da operação.
          </p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn--secondary" onClick={() => setShowFilters(!showFilters)}>
            <Filter size={18} /> Filtros
          </button>
          <button className="btn btn--secondary" onClick={handleExportCSV}>
            <Download size={18} /> CSV
          </button>
          <button className="btn btn--secondary" onClick={handlePrint}>
            <Printer size={18} /> Imprimir
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="card no-print" style={{ padding: '20px', marginBottom: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: '1rem', color: 'var(--color-text-primary)' }}>Filtros Globais</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Período</label>
              <select className="form-input" value={period} onChange={e => setPeriod(e.target.value)}>
                <option value="esta_semana">Semana atual</option>
                <option value="personalizado">Personalizado</option>
              </select>
            </div>
            {period === 'personalizado' && (
              <>
                <div className="form-group">
                  <label className="form-label">Data Início</label>
                  <input type="date" className="form-input" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Data Fim</label>
                  <input type="date" className="form-input" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                </div>
              </>
            )}
            <div className="form-group">
              <label className="form-label">Cliente</label>
              <input type="text" className="form-input" value={client} onChange={e => setClient(e.target.value)} placeholder="Ex: MPX" />
            </div>
            <div className="form-group">
              <label className="form-label">Produto</label>
              <input type="text" className="form-input" value={product} onChange={e => setProduct(e.target.value)} placeholder="Ex: Zopim" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button className="btn btn--primary" onClick={() => {
              // Se tiver filtros, fechar o painel pra não ocupar tela
              if (window.innerWidth < 768) setShowFilters(false);
              fetchDashboard();
            }}>
              Buscar Dados
            </button>
          </div>
        </div>
      )}

      {/* SUBMENUS */}
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--color-border)', paddingBottom: 16, overflowX: 'auto' }}>
        {[
          { id: 'overview', label: 'Dashboard Inicial', icon: <Target size={16} /> },
          { id: 'clientes', label: 'Inteligência de Clientes', icon: <Users size={16} /> },
          { id: 'operacao', label: 'Operação & Carga', icon: <Activity size={16} /> },
          { id: 'produtos', label: 'Produtos', icon: <Layers size={16} /> },
          { id: 'tendencias', label: 'Tendências', icon: <TrendingUp size={16} /> },
          { id: 'historico', label: 'Histórico (M/M)', icon: <Clock size={16} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id as any); if (tab.id !== 'clientes') setSelectedClient(null); }}
            style={{ 
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', background: activeTab === tab.id ? 'var(--color-bg-primary)' : 'transparent',
              border: 'none', borderRadius: '6px', 
              color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer',
              boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Comparando Block Global */}
      {data?.comparison && activeTab !== 'historico' && (
        <div className="no-print" style={{ marginBottom: '24px', padding: '16px 20px', background: 'var(--color-bg-secondary)', borderRadius: '8px', borderLeft: '4px solid var(--color-primary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Comparando</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <strong style={{ color: 'var(--color-text-primary)', fontSize: '1.1rem' }}>{data.comparison.current.label}</strong>
              <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                {new Date(data.comparison.current.start).toLocaleDateString('pt-BR', {timeZone: 'UTC', day:'2-digit', month:'2-digit'})} a {new Date(data.comparison.current.end).toLocaleDateString('pt-BR', {timeZone: 'UTC', day:'2-digit', month:'2-digit'})}
              </span>
            </div>
            
            <span style={{ fontSize: '1.2rem', color: 'var(--color-text-secondary)', fontWeight: 300 }}>&times;</span>
            
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <strong style={{ color: 'var(--color-text-primary)', fontSize: '1.1rem' }}>{data.comparison.reference.label}</strong>
              <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                {new Date(data.comparison.reference.start).toLocaleDateString('pt-BR', {timeZone: 'UTC', day:'2-digit', month:'2-digit'})} a {new Date(data.comparison.reference.end).toLocaleDateString('pt-BR', {timeZone: 'UTC', day:'2-digit', month:'2-digit'})}
              </span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'clientes' && (
        selectedClient ? (
          <ClientProfile clientName={selectedClient} filters={{ period, customStart, customEnd }} onBack={() => setSelectedClient(null)} />
        ) : (
          <ClientsBI filters={{ period, customStart, customEnd }} onSelectClient={setSelectedClient} />
        )
      )}

      {data?.summary && activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', marginBottom: '32px' }}>
          {/* Insights + Demanda Block */}
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div className="card" style={{ flex: 2, padding: '20px', background: 'var(--color-bg-primary)', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 0, fontSize: '1.2rem', color: 'var(--color-text-primary)' }}>
                  🧠 Insights Operacionais
                </h3>
                <button className="btn btn--primary no-print" onClick={generateExecutiveSummary} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                  Gerar Parecer (IA)
                </button>
              </div>
              <ul className="insight-list">
                {insights && insights.map((insight: string, idx: number) => (
                  <li key={idx}><strong>{insight.split(':')[0]}</strong>{insight.includes(':') ? ':' + insight.split(':')[1] : ''}</li>
                ))}
              </ul>
            </div>

            <div className="card" style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: '250px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1rem', color: 'var(--color-text-secondary)' }}>
                Estamos acompanhando a demanda?
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {summary?.saldo > 0 ? (
                  <>
                    <XCircle size={36} color="#ef4444" />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>🔴 Operação em Déficit</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Entraram: {summary.entradas} | Resolvidos: {summary.resolvidos} | Saldo: +{summary.saldo}</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ef4444', marginTop: 4 }}>Resolução: {summary.entradas > 0 ? ((summary.resolvidos / summary.entradas) * 100).toFixed(1) : 0}%</span>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle size={36} color="#22c55e" />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#22c55e' }}>🟢 Operação Equilibrada</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Entraram: {summary.entradas} | Resolvidos: {summary.resolvidos} | Saldo: {summary.saldo}</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#22c55e', marginTop: 4 }}>Resolução: {summary.entradas > 0 ? ((summary.resolvidos / summary.entradas) * 100).toFixed(1) : 0}%</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* LINHA 1: Saúde da Operação (4 Cards) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
            {data.comparison && renderComparativeCard("Entradas", <TrendingDown size={18} />, "#ef4444", "rgba(239, 68, 68, 0.1)", summary.entradas, summary.entradasPrev, summary.entradas - summary.entradasPrev, entradasTrend, "down")}
            {data.comparison && renderComparativeCard("Resolvidos", <CheckCircle size={18} />, "#22c55e", "rgba(34, 197, 94, 0.1)", summary.resolvidos, summary.resolvidosPrev, summary.resolvidos - summary.resolvidosPrev, resolvidosTrend, "up")}
            {data.comparison && renderComparativeCard("Tickets em Aberto", <AlertTriangle size={18} />, "#f59e0b", "rgba(245, 158, 11, 0.1)", summary.abertos, summary.abertosPrev, summary.abertos - summary.abertosPrev, abertosTrend, "down")}
            {data.comparison && renderComparativeCard("Tickets Pendentes/Paralisados", <Clock size={18} />, "#8b5cf6", "rgba(139, 92, 246, 0.1)", summary.pendentes, summary.pendentesPrev, summary.pendentes - summary.pendentesPrev, pendentesTrend, "down")}
          </div>

          {/* LINHA 2: Dois gráficos grandes (Evolução Diária x Composição Fila) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
            <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>Evolução Diária (Entradas x Resolvidos x Fila)</h3>
              <div style={{ height: 260, width: '100%' }}>
                <ResponsiveContainer>
                  <ComposedChart data={evolution} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="date" stroke="var(--color-text-secondary)" fontSize={12} tickMargin={10} />
                    <YAxis stroke="var(--color-text-secondary)" fontSize={12} />
                    <Tooltip content={<CustomEvolutionTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: 10 }} />
                    <Bar dataKey="entradas" name="Entradas" fill="#64748b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="resolvidos" name="Resolvidos" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Line type="step" dataKey="saldo" name="Crescimento da fila" stroke="#f59e0b" strokeWidth={3} dot={<CustomEvolutionDot />} activeDot={{ r: 6 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>Composição da Fila (tickets abertos)</h3>
              <div style={{ display: 'flex', flex: 1, gap: 24, alignItems: 'center' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ height: 180, width: '100%', position: 'relative' }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Não Classificado', value: data.workload?.byEffort['Não Classificado'] || 0, fill: '#9ca3af' },
                            { name: 'Baixo', value: data.workload?.byEffort['Baixo'] || 0, fill: '#3b82f6' },
                            { name: 'Médio', value: data.workload?.byEffort['Médio'] || 0, fill: '#f59e0b' },
                            { name: 'Alto', value: data.workload?.byEffort['Alto'] || 0, fill: '#ef4444' },
                            { name: 'Crítico', value: data.workload?.byEffort['Crítico'] || 0, fill: '#7f1d1d' },
                          ].filter(d => d.value > 0)}
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {[...Array(5)].map((_, i) => (
                             <Cell key={`cell-${i}`} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', lineHeight: 1.2 }}>
                       <span style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{data.workload?.mpxResponsibility || 0}</span>
                       <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: '-2px' }}>tickets</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>Esforço da Fila</div>
                </div>
                
                <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Esforço</div>
                    {Object.entries(data.workload?.byEffort || {}).map(([key, val]) => {
                      const effortColors: Record<string, string> = {
                        'Não Classificado': '#9ca3af',
                        'Baixo': '#3b82f6',
                        'Médio': '#f59e0b',
                        'Alto': '#ef4444',
                        'Crítico': '#7f1d1d'
                      };
                      return (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', marginBottom: 4, paddingBottom: 4, borderBottom: '1px dashed var(--color-border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: effortColors[key] || '#9ca3af' }}></div>
                            <span style={{ color: 'var(--color-text-primary)' }}>{key}</span>
                          </div>
                          <strong style={{ color: 'var(--color-text-primary)' }}>{val as React.ReactNode}</strong>
                        </div>
                      );
                    })}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Prazo Esperado</div>
                    {Object.entries(data.workload?.byExpectedTime || {}).map(([key, val]) => (
                      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: 4, paddingBottom: 4, borderBottom: '1px dashed var(--color-border)' }}>
                        <span style={{ color: 'var(--color-text-primary)' }}>{key.replace(/_/g, ' ')}</span>
                        <strong style={{ color: 'var(--color-text-primary)' }}>{val as React.ReactNode}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* LINHA 3: Top Produtos e Clientes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>Volume por Produto (Top 10)</h3>
              <div style={{ height: 350, width: '100%' }}>
                <ResponsiveContainer>
                  <BarChart data={distributions?.byProduct?.slice(0, 10) || []} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
                    <XAxis type="number" fontSize={11} stroke="var(--color-text-secondary)" />
                    <YAxis dataKey="name" type="category" fontSize={12} stroke="var(--color-text-secondary)" width={120} tickFormatter={(val) => val.length > 15 ? val.substring(0,15) + '...' : val} />
                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: 8, borderColor: 'var(--color-border)' }} />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={30} label={{ position: 'right', fill: 'var(--color-text-primary)' }}>
                      {
                        [...Array(10)].map((_, index) => (
                          <Cell key={`cell-${index}`} fill="#8b5cf6" />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="card" style={{ padding: '20px', flex: 1, overflowX: 'auto' }}>
                <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>Tabela Gerencial de Clientes</h3>
                <table className="reports-table" style={{ width: '100%', minWidth: '400px' }}>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th style={{ textAlign: 'center' }}>Tickets</th>
                      <th style={{ textAlign: 'center' }}>Tempo Médio</th>
                      <th style={{ textAlign: 'center' }}>Reabertura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributions?.byClient && distributions.byClient.slice(0, 5).map((cli: any, idx: number) => (
                      <tr key={idx}>
                        <td><div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{cli.name}</div></td>
                        <td style={{ textAlign: 'center' }}>{cli.entradas}</td>
                        <td style={{ textAlign: 'center' }}>{cli.avgTime}{cli.avgTime !== '-' ? 'h' : ''}</td>
                        <td style={{ textAlign: 'center' }}>{cli.reopenRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {distributions?.internalDemand && (
                <div className="card" style={{ padding: '20px', background: 'var(--color-bg-primary)', borderLeft: '4px solid #3b82f6' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                     <Activity size={18} color="#3b82f6" />
                     <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Demandas internas da MPX</span>
                  </div>
                  <div style={{ display: 'flex', gap: '24px', fontSize: '1rem', color: 'var(--color-text-secondary)' }}>
                     <span><strong style={{ color: 'var(--color-text-primary)' }}>Tickets:</strong> {distributions.internalDemand.entradas}</span>
                     <span><strong style={{ color: 'var(--color-text-primary)' }}>Tempo Médio:</strong> {distributions.internalDemand.avgTime}{distributions.internalDemand.avgTime !== '-' ? 'h' : ''}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      )}
      
      
      {/* TABS SECUNDÁRIAS */}
      
      {data?.workload && activeTab === 'operacao' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h2 className="section-title">Detalhes da Carga Operacional</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>Tickets Aguardando (Carga)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>MPX (Conosco)</span>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--color-text-primary)' }}>{data.workload?.mpxResponsibility || 0}</strong>
                  </div>
                  <div style={{ width: '100%', background: 'var(--color-bg-secondary)', height: 20, borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, ((data.workload?.mpxResponsibility || 0) / (data.workload?.totalBacklog || 1)) * 100)}%`, background: '#ef4444', height: '100%' }}></div>
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>Cliente/Terceiros</span>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--color-text-primary)' }}>{data.workload?.clientResponsibility || 0}</strong>
                  </div>
                  <div style={{ width: '100%', background: 'var(--color-bg-secondary)', height: 20, borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, ((data.workload?.clientResponsibility || 0) / (data.workload?.totalBacklog || 1)) * 100)}%`, background: '#3b82f6', height: '100%' }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>Envelhecimento da Fila (Aging)</h3>
              <div style={{ height: 200, width: '100%' }}>
                <ResponsiveContainer>
                  <BarChart data={[
                    { name: '0-2 dias', val: data.workload?.aging['0-2_dias'] || 0 },
                    { name: '3-5 dias', val: data.workload?.aging['3-5_dias'] || 0 },
                    { name: '6-10 dias', val: data.workload?.aging['6-10_dias'] || 0 },
                    { name: '> 10 dias', val: data.workload?.aging['mais_de_10_dias'] || 0 }
                  ]} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
                    <XAxis type="number" fontSize={11} stroke="var(--color-text-secondary)" />
                    <YAxis dataKey="name" type="category" fontSize={12} stroke="var(--color-text-secondary)" width={70} />
                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: 8, borderColor: 'var(--color-border)' }} />
                    <Bar dataKey="val" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={30} label={{ position: 'right', fill: 'var(--color-text-primary)' }}>
                      {
                        [...Array(4)].map((_, index) => (
                          <Cell key={`cell-${index}`} fill={['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'][index]} />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', alignItems: 'center' }}>
               <div style={{ background: 'var(--color-bg-secondary)', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                 <span style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{data.workload.mpxResponsibility}</span>
                 <div style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', marginTop: 8 }}>Tickets na mão da equipe</div>
               </div>
               
               <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                   <div>
                     <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Capacidade Projetada Consumida</div>
                     <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 4 }}>
                       {data.workload.capacityConsumedPct > 0 ? data.workload.capacityConsumedPct.toFixed(1) : 0}% 
                       <span style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', fontWeight: 400, marginLeft: 8 }}>({data.workload.totalHours}h de {data.workload.availableCapacity}h)</span>
                     </div>
                   </div>
                 </div>
                 
                 <div style={{ width: '100%', height: '12px', background: 'var(--color-border)', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ 
                      height: '100%', 
                      width: `${Math.min(100, data.workload.capacityConsumedPct)}%`, 
                      background: data.workload.capacityConsumedPct > 90 ? '#ef4444' : data.workload.capacityConsumedPct > 75 ? '#f59e0b' : '#10b981',
                      transition: 'width 1s ease-in-out'
                    }}></div>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                   <span>0%</span>
                   <span>Alerta em 75%</span>
                   <span>Gargalo em 90%+</span>
                 </div>
               </div>
            </div>
          </div>
          
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>Principais Motivos de Acionamento</h3>
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Motivo Estratégico</th>
                  <th>Tickets Abertos</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.workload?.byReason || {}).map(([key, val], idx: number) => (
                  <tr key={idx}>
                    <td><div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{key}</div></td>
                    <td>{val as React.ReactNode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="section-title" style={{ marginTop: '16px' }}>Desempenho de SLA</h2>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
             <div className="card" style={{ flex: 1, minWidth: '200px', padding: '24px', textAlign: 'center', background: 'var(--color-bg-primary)', borderLeft: '4px solid #10b981' }}>
                <div style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>SLA Cumprido</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{summary.slaCumprido || 0}</div>
             </div>
             <div className="card" style={{ flex: 1, minWidth: '200px', padding: '24px', textAlign: 'center', background: 'var(--color-bg-primary)', borderLeft: '4px solid #ef4444' }}>
                <div style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>SLA Vencido</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{summary.slaVencido || 0}</div>
             </div>
             <div className="card" style={{ flex: 1, minWidth: '200px', padding: '24px', textAlign: 'center', background: 'var(--color-bg-primary)', borderLeft: '4px solid #3b82f6' }}>
                <div style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>Taxa de Sucesso SLA</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                   {summary.slaCumprido + summary.slaVencido > 0 ? ((summary.slaCumprido / (summary.slaCumprido + summary.slaVencido)) * 100).toFixed(1) : 0}%
                </div>
             </div>
          </div>

          <h2 className="section-title" style={{ marginTop: '16px' }}>Distribuição por Equipe</h2>
          <div className="card" style={{ padding: '24px', overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>Ranking de Responsáveis (Carga de Trabalho Projetada)</h3>
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Responsável</th>
                  <th>Tickets Abertos</th>
                  <th>Pontos de Esforço</th>
                  <th>Horas Projetadas</th>
                  <th>Carga (Share)</th>
                </tr>
              </thead>
              <tbody>
                {data.workload.byAssignee.map((ag: any, idx: number) => {
                  const pct = data.workload.totalHours > 0 ? (ag.hours / data.workload.totalHours) * 100 : 0;
                  return (
                    <tr key={idx}>
                      <td><div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{ag.name}</div></td>
                      <td>{ag.count}</td>
                      <td>{ag.points}</td>
                      <td>{ag.hours}h</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ minWidth: '40px', fontWeight: 600 }}>{pct.toFixed(1)}%</span>
                          <div style={{ flex: 1, height: '6px', background: 'var(--color-border)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: pct > 30 ? '#ef4444' : pct > 15 ? '#f59e0b' : '#3b82f6' }}></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {data.workload.byAssignee.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)' }}>Nenhum dado projetado para a equipe.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="card" style={{ padding: '24px' }}>
             <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>Produtividade (Tickets Resolvidos)</h3>
             <table className="reports-table">
                <thead>
                  <tr>
                    <th>Agente</th>
                    <th>Resolvidos no Período</th>
                    <th>Tempo Médio de Resolução</th>
                    <th>% do Total Resolvido</th>
                  </tr>
                </thead>
                <tbody>
                  {distributions?.byAgent && distributions.byAgent.map((agent: any, idx: number) => (
                    <tr key={idx}>
                      <td><div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{agent.name}</div></td>
                      <td>{agent.resolvidos}</td>
                      <td>{agent.avgTime}h</td>
                      <td>{summary.resolvidos > 0 ? ((agent.resolvidos / summary.resolvidos) * 100).toFixed(1) : 0}%</td>
                    </tr>
                  ))}
                  {(!distributions?.byAgent || distributions.byAgent.length === 0) && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)' }}>Nenhum ticket resolvido no período selecionado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
          </div>
        </div>
      )}

      {data?.summary && activeTab === 'produtos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h2 className="section-title">Impacto por Clientes e Produtos</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>Top Clientes Demandantes</h3>
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Tickets</th>
                    <th>Tempo Médio</th>
                  </tr>
                </thead>
                <tbody>
                  {distributions?.byClient && distributions.byClient.slice(0, 10).map((cli: any, idx: number) => (
                    <tr key={idx}>
                      <td><div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{cli.name}</div></td>
                      <td>{cli.entradas}</td>
                      <td>{cli.avgTime}h</td>
                    </tr>
                  ))}
                  {(!distributions?.byClient || distributions.byClient.length === 0) && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)' }}>Nenhum dado para exibir.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>Produtos Mais Demandados</h3>
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Tickets</th>
                    <th>Crescimento (v.s. Prev)</th>
                  </tr>
                </thead>
                <tbody>
                  {trends?.product && trends.product.slice(0, 10).map((prod: any, idx: number) => (
                    <tr key={idx}>
                      <td><div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{prod.name}</div></td>
                      <td>{prod.current}</td>
                      <td>{renderGrowthTrend(prod.growth)}</td>
                    </tr>
                  ))}
                  {(!trends?.product || trends.product.length === 0) && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)' }}>Nenhum dado para exibir.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {data?.summary && activeTab === 'tendencias' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h2 className="section-title">Análise de Tendências Estratégicas</h2>
          
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>Evolução de Volumes: Entradas x Resolvidos x Saldo</h3>
            <div style={{ height: 350, width: '100%' }}>
              <ResponsiveContainer>
                <ComposedChart data={evolution} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--color-text-secondary)" fontSize={12} tickMargin={10} />
                  <YAxis stroke="var(--color-text-secondary)" fontSize={12} />
                  <Tooltip content={<CustomEvolutionTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: 10 }} />
                  <Bar dataKey="entradas" name="Entradas" fill="#64748b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="resolvidos" name="Resolvidos" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Line type="step" dataKey="saldo" name="Saldo Acumulado" stroke="#f59e0b" strokeWidth={3} dot={<CustomEvolutionDot />} activeDot={{ r: 6 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>Categorias com Maior Crescimento de Demanda</h3>
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Volume Atual</th>
                  <th>Volume Anterior</th>
                  <th>Variação</th>
                </tr>
              </thead>
              <tbody>
                {trends?.client?.slice(0, 10).map((cat: any, idx: number) => (
                  <tr key={idx}>
                    <td><div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{cat.name}</div></td>
                    <td>{cat.current}</td>
                    <td>{cat.prev}</td>
                    <td>{renderGrowthTrend(cat.growth)}</td>
                  </tr>
                ))}
                {(!trends?.client || trends.client.length === 0) && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)' }}>Nenhum dado para exibir.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'historico' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {loadingHistorical ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
              <p style={{ color: 'var(--color-text-secondary)' }}>Carregando dados históricos...</p>
            </div>
          ) : (
            <>
              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.1rem', color: 'var(--color-text-primary)' }}>Evolução Month over Month (Longo Prazo)</h3>
                <div style={{ height: 350, width: '100%' }}>
                  <ResponsiveContainer>
                    <ComposedChart data={historicalData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="month" stroke="var(--color-text-secondary)" fontSize={12} />
                      <YAxis stroke="var(--color-text-secondary)" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)', borderRadius: '8px', color: '#1e293b' }} itemStyle={{ color: '#1e293b' }} />
                      <Legend />
                      <Bar dataKey="entradas" name="Entradas Mês" fill="#64748b" radius={[4, 4, 0, 0]} maxBarSize={50} />
                      <Bar dataKey="resolvidos" name="Resolvidos Mês" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} />
                      <Line type="monotone" dataKey="saldo" name="Saldo Mensal da Fila" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.1rem', color: 'var(--color-text-primary)' }}>Tempo Médio de Resolução (M/M)</h3>
                <div style={{ height: 300, width: '100%' }}>
                  <ResponsiveContainer>
                    <ComposedChart data={historicalData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="month" stroke="var(--color-text-secondary)" fontSize={12} />
                      <YAxis stroke="var(--color-text-secondary)" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)', borderRadius: '8px', color: '#1e293b' }} itemStyle={{ color: '#1e293b' }} />
                      <Legend />
                      <Line type="monotone" dataKey="avgTime" name="Tempo Médio (Horas)" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
};

export default ReportsScreen;
