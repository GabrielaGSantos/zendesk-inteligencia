import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Inbox } from 'lucide-react';
import { Layout } from './components/Layout';
import { StatsCards } from './components/StatsCards';
import { FilterBar } from './components/FilterBar';
import { TicketCard } from './components/TicketCard';
import { TicketDetailModal } from './components/TicketDetailModal';
import { Pagination } from './components/Pagination';
import { SyncPanel } from './components/SyncPanel';
import { SyncModal } from './components/SyncModal';
import { KnowledgeManager } from './components/KnowledgeManager';
import { AgentsManager } from './components/AgentsManager';
import { OperationalRadar } from './components/OperationalRadar';
import { UsersManager } from './components/UsersManager';
import { AuditLogs } from './components/AuditLogs';
import { CalendarScreen } from './components/CalendarScreen';
import { NotesScreen } from './components/NotesScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { ReportsScreen } from './components/ReportsScreen';
import { NotificationManager } from './components/NotificationManager';
import { Login } from './components/Login';
import { api } from './services/api';
import { supabase } from './lib/supabase';
import type { Ticket, Stats, SyncProgress, AnalysisProgress, FilterOptions } from './types';

function App() {
  // Data state
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    statuses: [], categories: [], products: [], patterns: [],
  });

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [serverConnected, setServerConnected] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [currentTab, setCurrentTab] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return ['principal', 'fechados', 'knowledge', 'agents', 'radar', 'reports', 'users', 'spam', 'calendar', 'notes'].includes(hash) ? hash : 'principal';
  });

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    };
    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && ['principal', 'fechados', 'knowledge', 'agents', 'radar', 'reports', 'users', 'spam', 'calendar', 'notes'].includes(hash)) {
        setCurrentTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (window.location.hash.replace('#', '') !== currentTab) {
      window.history.replaceState(null, '', `#${currentTab}`);
    }
  }, [currentTab]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [product, setProduct] = useState('');
  const [priority, setPriority] = useState('');
  const [assignee, setAssignee] = useState('');
  const [sortOrder, setSortOrder] = useState('created_desc');

  // Sync & Analysis
  const [syncStatus, setSyncStatus] = useState<SyncProgress>({
    status: 'idle', phase: '', ticketsSynced: 0, ticketsTotal: 0, commentsSynced: 0,
  });
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisProgress>({
    status: 'idle', phase: '', ticketsAnalyzed: 0, ticketsTotal: 0,
  });

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const pollIntervalRef = useRef<ReturnType<typeof setInterval>>();

  // ─── Check server connection ─────────────────────────────────
  const checkServer = useCallback(async () => {
    try {
      await api.checkHealth();
      setServerConnected(true);
      return true;
    } catch {
      setServerConnected(false);
      return false;
    }
  }, []);

  // ─── Load tickets ────────────────────────────────────────────
  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      let effectiveStatus = status;

      if (!status) {
        if (currentTab === 'fechados') {
          effectiveStatus = 'solved,closed'; // Custom backend logic or just filter locally if not supported? We should pass it.
        } else if (currentTab === 'principal') {
          effectiveStatus = 'new,open,pending,hold';
        } else if (currentTab === 'spam') {
          effectiveStatus = 'new,open,pending,hold,solved,closed,suspended'; // Spam can be any status
        }
      }

      const data = await api.getTickets({
        page, limit, search, status: effectiveStatus, category,
        isSpamTab: currentTab === 'spam',
        excludeSpam: currentTab === 'principal',
        product, priority, assignee, sort: sortOrder
      });
      setTickets(data.tickets);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch (err) {
      console.error('Error loading tickets:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, category, product, priority, assignee, sortOrder, currentTab]);

  // ─── Load stats ──────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await api.getStats();
      setStats(data);
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // ─── Load filter options ─────────────────────────────────────
  const loadFilters = useCallback(async () => {
    try {
      const data = await api.getFilters();
      setFilterOptions(data);
    } catch (err) {
      console.error('Error loading filters:', err);
    }
  }, []);

  const serverConnectedRef = useRef(serverConnected);
  useEffect(() => {
    serverConnectedRef.current = serverConnected;
  }, [serverConnected]);

  // ─── Initial connection check ────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const connected = await checkServer();
      if (connected) {
        loadTickets();
        loadStats();
        loadFilters();
      } else {
        setLoading(false);
        setStatsLoading(false);
      }
    };
    init();

    // Re-check every 10 seconds if disconnected
    const interval = setInterval(async () => {
      const nowConnected = await checkServer();
      if (!serverConnectedRef.current && nowConnected) {
        loadTickets();
        loadStats();
        loadFilters();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [checkServer, loadTickets, loadStats, loadFilters]);

  // ─── Reload when filters change ─────────────────────────────
  useEffect(() => {
    if (serverConnected) {
      loadTickets();
    }
  }, [page, status, category, product, priority, serverConnected, currentTab]);

  // ─── Debounced search ────────────────────────────────────────
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      if (serverConnected) loadTickets();
    }, 400);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search]);

  // ─── Poll sync/analysis status ──────────────────────────────
  useEffect(() => {
    const shouldPoll = syncStatus.status === 'running' || analysisStatus.status === 'running';

    if (shouldPoll) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          if (syncStatus.status === 'running') {
            const s = await api.getSyncStatus();
            setSyncStatus(s);
            if (s.status !== 'running') {
              loadTickets();
              loadStats();
              loadFilters();
            }
          }
          if (analysisStatus.status === 'running') {
            const a = await api.getAnalysisStatus();
            setAnalysisStatus(a);
            if (a.status !== 'running') {
              loadTickets();
              loadStats();
              loadFilters();
            }
          }
        } catch (err) {
          console.error('Error polling status:', err);
        }
      }, 3000);
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [syncStatus.status, analysisStatus.status]);

  // ─── Handlers ────────────────────────────────────────────────
  const handleSyncClick = () => {
    setShowSyncModal(true);
  };

  const handleSyncStart = async (options?: { startDate?: string; endDate?: string }) => {
    try {
      const result = await api.startSync(options);
      setSyncStatus(result.status);
      setShowSyncModal(false);
    } catch (err: any) {
      console.error('Sync error:', err);
      setSyncStatus(prev => ({ ...prev, status: 'error', errorMessage: err.message }));
    }
  };

  const handleAnalyze = async () => {
    try {
      const result = await api.startAnalysis();
      setAnalysisStatus(result.status);
    } catch (err: any) {
      console.error('Analysis error:', err);
      setAnalysisStatus(prev => ({ ...prev, status: 'error', errorMessage: err.message }));
    }
  };

  const handlePauseAnalysis = async () => {
    try {
      const result = await api.pauseAnalysis();
      setAnalysisStatus(result.status);
    } catch (err: any) {
      console.error('Pause error:', err);
    }
  };

  const hasActiveFilters = Boolean(search || status || category || product || priority || assignee);

  const handleClearFilters = () => {
    setSearch('');
    setStatus('');
    setCategory('');
    setProduct('');
    setPriority('');
    setAssignee('');
    setSortOrder('created_desc');
    setPage(1);
  };

  const handleNotSpam = async (ticket: Ticket) => {
    try {
      const newCategory = (ticket.category || '').split(' | ')
        .map(c => c.trim())
        .filter(c => c.toLowerCase() !== 'spam')
        .join(' | ') || 'Dúvida Genérica';
        
      await api.updateAnalysis(ticket.zendesk_id, { category: newCategory });
      setTickets(prev => prev.filter(t => t.zendesk_id !== ticket.zendesk_id));
      // Reload stats if needed, but removing from UI is enough for immediate feedback
    } catch (err) {
      console.error('Error removing spam status:', err);
      alert('Erro ao alterar status de spam.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ─── Render ──────────────────────────────────────────────────
  if (isAuthenticated === null) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary-default)' }}><div className="spinner"></div></div>;
  }

  if (isAuthenticated === false) {
    return <Login />;
  }

  return (
    <Layout
      syncStatus={syncStatus}
      analysisStatus={analysisStatus}
      onSync={handleSyncClick}
      onAnalyze={handleAnalyze}
      serverConnected={serverConnected}
      currentTab={currentTab}
      setCurrentTab={setCurrentTab}
    >
      {showSyncModal && (
        <SyncModal 
          onClose={() => setShowSyncModal(false)}
          onSync={handleSyncStart}
        />
      )}

      {currentTab === 'knowledge' ? (
        <KnowledgeManager />
      ) : currentTab === 'agents' ? (
        <AgentsManager />
      ) : currentTab === 'radar' ? (
        <OperationalRadar onTicketClick={setSelectedTicket} />
      ) : currentTab === 'users' ? (
        <UsersManager />
      ) : currentTab === 'logs' ? (
        <AuditLogs />
      ) : currentTab === 'calendar' ? (
        <CalendarScreen />
      ) : currentTab === 'notes' ? (
        <NotesScreen />
      ) : currentTab === 'settings' ? (
        <SettingsScreen />
      ) : currentTab === 'reports' ? (
        <ReportsScreen />
      ) : (
        <>
          {/* Page Header */}
          <div className="page-header">
            <h1 className="page-header__title">
              {currentTab === 'fechados' ? 'Tickets Fechados e Resolvidos' : 
               currentTab === 'spam' ? 'Lixeira e Spam' : 
               'Análise de Padrões dos Tickets'}
            </h1>
            <p className="page-header__description">
              {currentTab === 'spam' ? 'Tickets identificados pela IA como Spam. Eles não aparecem na tela principal.' : 'Visualize os tickets sincronizados do Zendesk e os padrões identificados pela IA.'}
            </p>
          </div>

          {/* Sync / Analysis Progress */}
          <SyncPanel
            syncStatus={syncStatus}
            analysisStatus={analysisStatus}
            onPauseAnalysis={handlePauseAnalysis}
          />

          {/* KPI Stats */}
          <StatsCards stats={stats} loading={statsLoading} />



      {/* Filters */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={v => { setStatus(v); setPage(1); }}
        category={category}
        onCategoryChange={v => { setCategory(v); setPage(1); }}
        product={product}
        onProductChange={v => { setProduct(v); setPage(1); }}
        priority={priority}
        onPriorityChange={(v) => { setPriority(v); setPage(1); }}
        assignee={assignee}
        onAssigneeChange={(v) => { setAssignee(v); setPage(1); }}
        sortOrder={sortOrder}
        onSortOrderChange={(v) => { setSortOrder(v); setPage(1); }}
        filterOptions={filterOptions}
        onClearFilters={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Ticket List */}
      {!serverConnected ? (
        <div className="empty-state">
          <div className="empty-state__icon">
            <Inbox size={28} />
          </div>
          <div className="empty-state__title">Servidor não conectado</div>
          <div className="empty-state__text">
            Inicie o servidor backend com <code>npm run server</code> para conectar ao banco de dados local.
          </div>
        </div>
      ) : loading ? (
        <div className="loading-spinner">
          <div className="loading-spinner__icon">Z</div>
          <div className="loading-spinner__text">Carregando tickets...</div>
        </div>
      ) : tickets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">
            <Inbox size={28} />
          </div>
          <div className="empty-state__title">
            {hasActiveFilters ? 'Nenhum ticket encontrado' : 'Nenhum ticket sincronizado'}
          </div>
          <div className="empty-state__text">
            {hasActiveFilters
              ? 'Ajuste os filtros ou limpe a busca para ver mais resultados.'
              : 'Clique em "Sincronizar" no cabeçalho para importar tickets do Zendesk.'}
          </div>
          {hasActiveFilters && (
            <button className="btn btn--secondary" onClick={handleClearFilters}>
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="ticket-list">
            {tickets.map(ticket => (
              <TicketCard
                key={ticket.zendesk_id}
                ticket={ticket}
                onClick={setSelectedTicket}
                onNotSpam={currentTab === 'spam' ? handleNotSpam : undefined}
                onUpdate={(updated) => setTickets(prev => prev.map(t => t.zendesk_id === updated.zendesk_id ? updated : t))}
              />
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={handlePageChange}
          />
        </>
      )}
      </>
      )}
      {/* Detail Modal */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdate={(updatedTicket) => {
            setSelectedTicket(updatedTicket);
            setTickets(prev => prev.map(t => t.zendesk_id === updatedTicket.zendesk_id ? updatedTicket : t));
            loadStats();
          }}
          filterOptions={filterOptions}
        />
      )}
      
      {/* Global Notifications for Reminders */}
      <NotificationManager />
    </Layout>
  );
}

export default App;
