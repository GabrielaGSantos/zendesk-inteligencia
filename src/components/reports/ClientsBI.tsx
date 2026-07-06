import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, Search, Info } from 'lucide-react';
import { api } from '../../services/api';

export function ClientsBI({ filters, onSelectClient }: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'score', direction: 'desc' });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await api.reports.getClientsBI(filters);
        if (res.success) setData(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [filters]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const sortedClients = useMemo(() => {
    if (!data?.clients) return [];
    let sortableItems = [...data.clients];
    
    if (searchTerm) {
      sortableItems = sortableItems.filter((c: any) => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    sortableItems.sort((a: any, b: any) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sortableItems;
  }, [data, sortConfig, searchTerm]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><div className="loading-spinner"></div></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Alertas e Oportunidades */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        <div className="card" style={{ padding: '24px', borderLeft: '4px solid #ef4444' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 0, marginBottom: '20px', color: '#ef4444', fontSize: '1.1rem' }}>
            <AlertTriangle size={20} /> Clientes que Exigem Atenção
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data?.alerts?.length > 0 ? data.alerts.map((alert: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', paddingBottom: 16, borderBottom: idx < data.alerts.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                <span style={{ fontWeight: 600, minWidth: 160, color: 'var(--color-text-primary)' }}>{alert.client}</span>
                <span style={{ color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>{alert.message}</span>
              </div>
            )) : <span style={{ color: 'var(--color-text-secondary)' }}>Nenhum alerta crítico no período.</span>}
          </div>
        </div>

        <div className="card" style={{ padding: '24px', borderLeft: '4px solid #10b981' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 0, marginBottom: '20px', color: '#10b981', fontSize: '1.1rem' }}>
            <CheckCircle size={20} /> Oportunidades e Destaques
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data?.opportunities?.length > 0 ? data.opportunities.map((opp: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', paddingBottom: 16, borderBottom: idx < data.opportunities.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                <span style={{ fontWeight: 600, minWidth: 160, color: 'var(--color-text-primary)' }}>{opp.client}</span>
                <span style={{ color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>{opp.message}</span>
              </div>
            )) : <span style={{ color: 'var(--color-text-secondary)' }}>Nenhuma oportunidade destacada no período.</span>}
          </div>
        </div>
      </div>

      {/* Tabela de Ranking */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-text-primary)' }}>Ranking de Clientes</h3>
          <div className="search-box" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-bg-secondary)', padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
             <Search size={16} color="var(--color-text-secondary)" />
             <input type="text" placeholder="Buscar cliente..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text-primary)' }} />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', minWidth: 900 }}>
            <thead>
              <tr>
                <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>Cliente</th>
                <th onClick={() => handleSort('score')} style={{ cursor: 'pointer', textAlign: 'center' }}>Saúde da Conta (Score)</th>
                <th style={{ textAlign: 'center' }}>Previsibilidade</th>
                <th onClick={() => handleSort('entradas')} style={{ cursor: 'pointer', textAlign: 'center' }}>Volume</th>
                <th onClick={() => handleSort('avgTime')} style={{ cursor: 'pointer', textAlign: 'center' }}>T. Médio</th>
                <th onClick={() => handleSort('slaPct')} style={{ cursor: 'pointer', textAlign: 'center' }}>SLA</th>
                <th onClick={() => handleSort('reopenRate')} style={{ cursor: 'pointer', textAlign: 'center' }}>Reaberturas</th>
                <th style={{ textAlign: 'center' }}>Tendência (8 sem)</th>
              </tr>
            </thead>
            <tbody>
              {sortedClients.map((client: any, idx: number) => (
                <tr key={idx} onClick={() => onSelectClient(client.name)} style={{ cursor: 'pointer', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = 'var(--color-bg-secondary)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ fontWeight: 600, color: 'var(--color-text-primary)', padding: '16px' }}>{client.name}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, background: client.score >= 80 ? 'rgba(16, 185, 129, 0.1)' : client.score >= 60 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: client.score >= 80 ? '#10b981' : client.score >= 60 ? '#f59e0b' : '#ef4444', fontWeight: 700 }} title={`Composição: SLA (${client.scoreBreakdown.sla}), Reaberturas (${client.scoreBreakdown.reaberturas}), Fila (${client.scoreBreakdown.backlog}), Criticidade (${client.scoreBreakdown.criticidade})`}>
                      {client.score >= 80 ? 'Saudável' : client.score >= 60 ? 'Atenção' : 'Crítico'} <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>({client.score})</span> <Info size={14} style={{ opacity: 0.5 }} />
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '0.9rem', fontWeight: 500 }}>
                     {client.estabilidade === 'Estável' ? <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Minus size={14}/> Previsível</span> : 
                      client.estabilidade === 'Oscilando' ? <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><TrendingUp size={14}/> Picos Isolados</span> : 
                      <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><TrendingDown size={14}/> Caótico</span>}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--color-text-primary)', fontWeight: 500 }}>{client.entradas}</td>
                  <td style={{ textAlign: 'center', color: 'var(--color-text-primary)' }}>{client.avgTime}h</td>
                  <td style={{ textAlign: 'center', color: 'var(--color-text-primary)' }}>{client.slaPct}%</td>
                  <td style={{ textAlign: 'center', color: 'var(--color-text-primary)' }}>{client.reopenRate}%</td>
                  <td style={{ textAlign: 'center', width: 120 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', height: 30, gap: 3, justifyContent: 'center' }}>
                      {client.trend.map((val: number, i: number) => {
                         const max = Math.max(...client.trend, 1);
                         const h = (val / max) * 100;
                         return <div key={i} style={{ width: 8, height: `${Math.max(10, h)}%`, background: i === 7 ? 'var(--color-primary)' : 'var(--color-border)', borderRadius: '2px 2px 0 0', opacity: val === 0 ? 0.3 : 1 }} title={`Semana ${i+1}: ${val} chamados`}></div>
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
