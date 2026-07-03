import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  TrendingUp, TrendingDown, Filter, Download, Printer, 
  Activity, Users, Target, Clock, AlertTriangle, Layers, Map
} from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';

export const ReportsScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  // Filters state
  const [period, setPeriod] = useState('ultimos_7_dias');
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

  useEffect(() => {
    fetchDashboard();
  }, [period, client, product, category, group, priority]);

  const handleExportCSV = () => {
    if (!data) return;
    
    // Create a simple CSV from the evolution data
    const headers = ['Data', 'Entradas', 'Saídas', 'Saldo'];
    const rows = data.evolution.map((e: any) => [e.date, e.entradas, e.saidas, e.saldo]);
    
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

  const handlePrint = () => {
    window.print();
  };

  const renderTrend = (value: number) => {
    if (value === 0) return <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>Sem alteração</span>;
    if (value > 0) return <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}><TrendingUp size={14} style={{ marginRight: 4 }}/> +{value.toFixed(1)}%</span>;
    return <span style={{ color: 'var(--color-success)', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}><TrendingDown size={14} style={{ marginRight: 4 }}/> {value.toFixed(1)}%</span>;
  };

  const renderGrowthTrend = (growth: number) => {
    if (growth > 0) return <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>▲ +{growth.toFixed(0)}%</span>;
    if (growth < 0) return <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>▼ {growth.toFixed(0)}%</span>;
    return <span style={{ color: 'var(--color-text-secondary)' }}>-</span>;
  };

  if (!data && loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column' }}>
        <div className="spinner" style={{ marginBottom: 16 }}></div>
        <p style={{ color: 'var(--color-text-secondary)' }}>Compilando relatórios estratégicos...</p>
      </div>
    );
  }

  const { summary, distributions, trends, evolution } = data || {};

  return (
    <div className="reports-manager print-container">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          .no-print { display: none !important; }
          .app-sidebar { display: none !important; }
          .app-main { margin-left: 0 !important; padding: 0 !important; }
          .print-container { background: white; color: black; }
          .card { border: 1px solid #ddd; box-shadow: none; break-inside: avoid; }
        }
      `}} />

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-header__title">Relatórios Gerenciais</h1>
          <p className="page-header__description">
            Acompanhamento estratégico da capacidade operacional e volume de suporte.
          </p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn--secondary" onClick={() => setShowFilters(!showFilters)}>
            <Filter size={18} /> Filtros
          </button>
          <button className="btn btn--secondary" onClick={handleExportCSV}>
            <Download size={18} /> Exportar CSV
          </button>
          <button className="btn btn--secondary" onClick={handlePrint}>
            <Printer size={18} /> Imprimir (PDF)
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="card no-print" style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: '1rem', color: 'var(--color-text-primary)' }}>Filtros Globais</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            
            <div className="form-group">
              <label className="form-label">Período</label>
              <select className="form-input" value={period} onChange={e => setPeriod(e.target.value)}>
                <option value="hoje">Hoje</option>
                <option value="ontem">Ontem</option>
                <option value="ultimos_7_dias">Últimos 7 dias</option>
                <option value="esta_semana">Esta semana</option>
                <option value="semana_passada">Semana passada</option>
                <option value="este_mes">Este mês</option>
                <option value="mes_passado">Mês passado</option>
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
                <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button className="btn btn--primary" onClick={fetchDashboard}>Aplicar Data</button>
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">Cliente (Organização)</label>
              <input type="text" className="form-input" placeholder="Buscar cliente..." value={client} onChange={e => setClient(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Produto</label>
              <input type="text" className="form-input" placeholder="Filtrar produto..." value={product} onChange={e => setProduct(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Categoria</label>
              <input type="text" className="form-input" placeholder="Filtrar categoria..." value={category} onChange={e => setCategory(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Grupo</label>
              <input type="text" className="form-input" placeholder="Ex: Suporte, Infra..." value={group} onChange={e => setGroup(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Prioridade</label>
              <select className="form-input" value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="">Todas</option>
                <option value="low">Baixa</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>

          </div>
        </div>
      )}

      {loading && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'var(--color-primary)', animation: 'loading-pulse 1.5s infinite' }} />
      )}

      {data && (
        <>
          {/* Executive Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            
            <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Entradas</span>
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '6px', borderRadius: '8px', color: '#ef4444' }}><TrendingUp size={18} /></div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{summary.entradas}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>vs período anterior</span>
                {renderTrend(summary.entradasPrev === 0 ? 0 : ((summary.entradas - summary.entradasPrev) / summary.entradasPrev) * 100)}
              </div>
            </div>

            <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Resolvidos</span>
                <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '6px', borderRadius: '8px', color: '#22c55e' }}><TrendingDown size={18} /></div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{summary.resolvidos}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>vs período anterior</span>
                {renderTrend(summary.resolvidosPrev === 0 ? 0 : ((summary.resolvidos - summary.resolvidosPrev) / summary.resolvidosPrev) * 100)}
              </div>
            </div>

            <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Saldo Operacional</span>
                <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '6px', borderRadius: '8px', color: '#3b82f6' }}><Activity size={18} /></div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: summary.saldo > 0 ? '#ef4444' : '#22c55e' }}>
                {summary.saldo > 0 ? `+${summary.saldo}` : summary.saldo}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Entradas - Resolvidos</span>
              </div>
            </div>

            <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Backlog Total</span>
                <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '6px', borderRadius: '8px', color: '#f59e0b' }}><Layers size={18} /></div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{summary.backlog}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Tickets em aberto agora</span>
              </div>
            </div>

            <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Tempo Médio / SLA</span>
                <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '6px', borderRadius: '8px', color: '#8b5cf6' }}><Clock size={18} /></div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{summary.avgResolutionTime} <span style={{fontSize: '1rem'}}>h</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-success)' }}>{summary.slaCumprido} no SLA</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-danger)' }}>{summary.slaVencido} Vencidos</span>
              </div>
            </div>
            
          </div>

          {/* AI Trends Alerts */}
          <div style={{ display: 'flex', gap: '20px', marginBottom: '24px' }}>
            <div className="card" style={{ flex: 1, padding: '20px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 0, marginBottom: '16px', fontSize: '1.1rem', color: 'var(--color-text-primary)' }}>
                <AlertTriangle size={20} color="#f59e0b" /> Tendências de Alta (Gargalos)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                
                {trends.product && trends.product.length > 0 && (
                  <div style={{ padding: '12px', background: 'var(--color-bg-primary)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Produto com maior aumento</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{trends.product[0].name}</span>
                      {renderGrowthTrend(trends.product[0].growth)}
                    </div>
                  </div>
                )}
                
                {trends.client && trends.client.length > 0 && (
                  <div style={{ padding: '12px', background: 'var(--color-bg-primary)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Cliente com maior aumento</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{trends.client[0].name}</span>
                      {renderGrowthTrend(trends.client[0].growth)}
                    </div>
                  </div>
                )}
                
                {trends.category && trends.category.length > 0 && (
                  <div style={{ padding: '12px', background: 'var(--color-bg-primary)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Categoria em alta</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{trends.category[0].name}</span>
                      {renderGrowthTrend(trends.category[0].growth)}
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '24px' }}>
            
            {/* Evolution Line Chart */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.1rem', color: 'var(--color-text-primary)' }}>Evolução da Operação (Entradas vs Saídas)</h3>
              <div style={{ height: 300, width: '100%' }}>
                <ResponsiveContainer>
                  <LineChart data={evolution} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="date" stroke="var(--color-text-secondary)" fontSize={12} tickMargin={10} />
                    <YAxis stroke="var(--color-text-secondary)" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', borderRadius: '8px', color: 'var(--color-text-primary)' }}
                      itemStyle={{ fontWeight: 500 }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                    <Line type="monotone" dataKey="entradas" name="Entradas" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="saidas" name="Resolvidos" stroke="#22c55e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Capacity (Distribution by Group) */}
            <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.1rem', color: 'var(--color-text-primary)' }}>Capacidade / Distribuição por Grupo</h3>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {distributions.byGroup.map((g: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '12px 0', color: 'var(--color-text-primary)', fontWeight: 500 }}>{g.name}</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                          <span style={{ background: 'var(--color-bg-primary)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 600 }}>
                            {g.count}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {distributions.byGroup.length === 0 && (
                      <tr><td colSpan={2} style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Nenhum grupo encontrado no período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            
            {/* Products Bar Chart */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.1rem', color: 'var(--color-text-primary)' }}>Volume por Produto (Top 10)</h3>
              <div style={{ height: 300, width: '100%' }}>
                <ResponsiveContainer>
                  <BarChart data={distributions.byProduct.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={true} vertical={false} />
                    <XAxis type="number" stroke="var(--color-text-secondary)" fontSize={12} />
                    <YAxis dataKey="name" type="category" stroke="var(--color-text-secondary)" fontSize={11} width={120} tickFormatter={(val) => val.length > 15 ? val.substring(0, 15) + '...' : val} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)', borderRadius: '8px', color: 'var(--color-text-primary)' }}
                      cursor={{ fill: 'var(--color-bg-primary)' }}
                    />
                    <Bar dataKey="count" name="Tickets" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                      {distributions.byProduct.slice(0, 10).map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#6d28d9' : '#8b5cf6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Clients List */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.1rem', color: 'var(--color-text-primary)' }}>Principais Clientes Demandantes</h3>
              <div style={{ height: 300, overflowY: 'auto', paddingRight: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {distributions.byClient.slice(0, 20).map((c: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '12px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--color-bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                            {i + 1}
                          </div>
                          <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{c.name}</span>
                        </td>
                        <td style={{ padding: '12px 0', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.count}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>tickets</span>
                          </div>
                          {/* Try to find growth for this client */}
                          {(() => {
                            const growthObj = trends.client.find((t: any) => t.name === c.name);
                            if (growthObj && growthObj.growth !== 0) {
                              return <div style={{ marginTop: '2px', textAlign: 'right' }}>{renderGrowthTrend(growthObj.growth)}</div>;
                            }
                            return null;
                          })()}
                        </td>
                      </tr>
                    ))}
                    {distributions.byClient.length === 0 && (
                      <tr><td colSpan={2} style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Nenhum cliente registrado no período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
};
