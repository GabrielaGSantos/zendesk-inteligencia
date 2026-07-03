// ─────────────────────────────────────────────────────────────
// Types for Zendesk Intelligence Central
// ─────────────────────────────────────────────────────────────

export interface SystemSettings {
  id?: number;
  ai_provider: 'gemini' | 'openai';
  ai_model: string;
  auto_analyze_webhooks: boolean;
  updated_at?: string;
}

export interface Ticket {
  zendesk_id: number;
  ticket_number: number;
  subject: string;
  status: string;
  priority: string;
  requester_name: string;
  requester_email: string;
  organization_name: string;
  assignee_name: string;
  group_name: string;
  tags: string;
  created_at: string;
  updated_at: string;
  solved_at: string | null;
  due_date?: string | null;
  zendesk_url: string;

  // Analysis fields (from JOIN with ticket_analysis)
  product: string | null;
  request_type: string | null;
  category: string | null;
  client_intent: string | null;
  problem_summary: string | null;
  identified_pattern: string | null;
  suggested_response: string | null;
  missing_info: string | null;
  recommended_procedure: string | null;
  suggested_priority: string | null;
  confidence_level: number | null;
  needs_internal_routing: string | null;
  solution_applied: string | null;
  applied_rules?: string[] | null;
  rule_particularities?: string | null;
  similar_tickets_ids?: number[] | null;
  recommended_expert?: string | null;
  expert_reasoning?: string | null;
  predicted_resolution_time_hours?: number | null;
  detailed_requirements?: string | null;
  rejected_similar_tickets?: number[] | null;
  added_similar_tickets?: number[] | null;
  ai_feedback?: string | null;
  analyzed_at: string | null;
}

export interface TicketComment {
  id: number;
  zendesk_comment_id: number;
  ticket_zendesk_id: number;
  author_id: number;
  author_name: string;
  body: string;
  html_body: string;
  is_public: number;
  created_at: string;
}

export interface TicketDetail {
  ticket: Ticket & {
    description: string;
    custom_fields: string;
    form_id: number;
    raw_json: string;
  };
  comments: TicketComment[];
}

export interface PaginatedResponse<T> {
  tickets: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Stats {
  totalTickets: number;
  analyzedTickets: number;
  totalPatterns: number;
  lastSync: {
    completed_at: string;
    tickets_synced: number;
    comments_synced: number;
  } | null;
  statusDistribution: Array<{ status: string; count: number }>;
  categoryDistribution: Array<{ category: string; count: number }>;
  productDistribution: Array<{ product: string; count: number }>;
  priorityDistribution: Array<{ suggested_priority: string; count: number }>;
}

export interface SyncProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  phase: string;
  ticketsSynced: number;
  ticketsTotal: number;
  commentsSynced: number;
  errorMessage?: string;
  startedAt?: string;
}

export interface AnalysisProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  phase: string;
  ticketsAnalyzed: number;
  ticketsTotal: number;
  errorMessage?: string;
}

export interface FilterOptions {
  statuses: string[];
  categories: string[];
  products: string[];
  patterns: string[];
  requestTypes?: string[];
  assignees?: string[];
}

export interface KnowledgeRule {
  id: number;
  title: string;
  category: string;
  priority: string;
  description: string;
  is_active: boolean;
  is_favorite: boolean;
  history: any[];
  examples?: any[];
  source_ticket_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PatternGroup {
  id: number;
  name: string;
  description: string;
  ticket_count: number;
  common_response: string;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: number;
  name: string;
  email: string;
  cargo: string | null;
  is_active: boolean;
  topCategories?: string[];
  avgResolutionTime?: number;
  queueCount?: number;
}

export interface AgentQueueTicket {
  zendesk_id: number;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AgentCategoryMetrics {
  assignee_id: number;
  assignee_name: string;
  category: string;
  tickets_resolved: number;
  resolution_rate: number;
  avg_resolution_time: number;
  reopen_rate: number;
}

export interface AgentDetailsResponse {
  agent: Agent;
  queue: AgentQueueTicket[];
  expertise: AgentCategoryMetrics[];
}

export interface RadarAlert {
  id: string;
  title: string;
  icon: string;
  subtitle: string;
  level: 'critical' | 'warning' | 'alert' | 'low';
  count: number;
  trend?: number;
  tickets: any[];
}

export interface RadarInsight {
  id: string;
  type: string;
  title: string;
  description: string;
  level: 'critical' | 'high' | 'medium' | 'low';
  created_at: string;
  is_active: boolean;
}

export interface CalendarEvent {
  id?: string;
  title: string;
  description: string;
  event_type: 'personal' | 'global';
  created_by?: string;
  start_date: string;
  start_time: string;
  end_date?: string;
  end_time?: string;
  created_at?: string;
}
