import { supabase } from '../lib/supabase';
import type {
  Ticket, TicketDetail, PaginatedResponse, Stats,
  SyncProgress, AnalysisProgress, FilterOptions, PatternGroup
} from '../types';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3002' : '';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(errorData.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {  // Tickets
  getTickets: (params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    category?: string;
    product?: string;
    pattern?: string;
    priority?: string;
    hasAnalysis?: string;
    isSpamTab?: boolean;
    excludeSpam?: boolean;
  } = {}): Promise<PaginatedResponse<Ticket>> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.set(key, String(value));
      }
    });
    return request(`/api/tickets?${searchParams}`);
  },

  getTicketDetail: (zendeskId: number): Promise<TicketDetail> => {
    return request(`/api/tickets/${zendeskId}`);
  },

  updateAnalysis: (zendeskId: number, data: Partial<any>): Promise<{ success: boolean }> => {
    return request(`/api/tickets/${zendeskId}/analysis`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  // Stats
  getStats: (): Promise<Stats> => {
    return request('/api/stats');
  },

  // Patterns
  getPatterns: (): Promise<{ patterns: PatternGroup[] }> => {
    return request('/api/patterns');
  },

  updatePattern: (id: number, data: Partial<PatternGroup>): Promise<PatternGroup> => {
    return request(`/api/patterns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  deletePattern: (id: number): Promise<{ success: boolean }> => {
    return request(`/api/patterns/${id}`, {
      method: 'DELETE'
    });
  },

  analyzeTicket: (zendeskId: number): Promise<TicketDetail> => {
    return request(`/api/tickets/${zendeskId}/analyze`, {
      method: 'POST'
    });
  },

  // Filters
  getFilters: (): Promise<FilterOptions> => {
    return request('/api/filters');
  },

  // Sync
  startSync: (options?: { startDate?: string; endDate?: string }): Promise<SyncProgress> => {
    return request('/api/sync/start', {
      method: 'POST',
      body: options ? JSON.stringify(options) : undefined
    });
  },

  getSyncStatus: (): Promise<SyncProgress> => {
    return request('/api/sync/status');
  },

  // Analysis
  async startAnalysis(force?: boolean) {
    return request<{ message: string; status: AnalysisProgress }>('/api/analyze/start', {
      method: 'POST',
      body: JSON.stringify({ force })
    });
  },

  async pauseAnalysis() {
    return request<{ status: AnalysisProgress }>('/api/analyze/pause', {
      method: 'POST',
    });
  },

  async getAnalysisStatus() {
    return request<AnalysisProgress>('/api/analyze/status');
  },

  // Knowledge Base
  getKnowledgeRules: (): Promise<any[]> => {
    return request('/api/knowledge');
  },

  addKnowledgeRule: (data: { title: string, description: string, category: string, priority: string, is_active?: boolean, is_favorite?: boolean }): Promise<any> => {
    return request('/api/knowledge', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  updateKnowledgeRule: (id: number, data: { title?: string, description?: string, category?: string, priority?: string, is_active?: boolean, is_favorite?: boolean, history?: any[] }): Promise<any> => {
    return request(`/api/knowledge/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  deleteKnowledgeRule: (id: number): Promise<{ success: boolean }> => {
    return request(`/api/knowledge/${id}`, {
      method: 'DELETE'
    });
  },

  // Health
  checkHealth: (): Promise<{ status: string; database: string; timestamp: string }> => {
    return request('/api/health');
  },

  // Agents
  getAgents: (): Promise<any[]> => {
    return request('/api/agents');
  },
  
  updateAgentCargo: (id: number, cargo: string): Promise<{ success: boolean }> => {
    return request(`/api/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ cargo })
    });
  },

  getAgentDetails: (id: number): Promise<any> => {
    return request(`/api/agents/${id}/details`);
  },

  getRadarData: (): Promise<{ metrics: any[], insights: any[] }> => {
    return request('/api/radar');
  },

  analyzeRadar: (): Promise<{ success: boolean, insights: any[] }> => {
    return request('/api/radar/analyze', {
      method: 'POST'
    });
  },

  // Audit Logs
  getAuditLogs: (params: { page?: number; limit?: number; action?: string }): Promise<{ logs: any[]; total: number; page: number; totalPages: number }> => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.action) searchParams.set('action', params.action);
    return request(`/api/audit-logs?${searchParams.toString()}`);
  },

  logLogin: (): Promise<{ success: boolean }> => {
    return request('/api/audit-logs/login', { method: 'POST' });
  },

  // Calendar
  calendar: {
    list: (): Promise<any[]> => request('/api/calendar/events'),
    create: (data: any): Promise<any> => request('/api/calendar/events', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id: string, data: any): Promise<any> => request(`/api/calendar/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    delete: (id: string): Promise<any> => request(`/api/calendar/events/${id}`, {
      method: 'DELETE'
    })
  },

  // Reports
  reports: {
    getDashboard: (filters: any): Promise<any> => request('/api/reports/dashboard', {
      method: 'POST',
      body: JSON.stringify(filters)
    })
  },

  // Settings
  settings: {
    get: (): Promise<any> => request('/api/settings'),
    update: (data: any): Promise<any> => request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  }
};
