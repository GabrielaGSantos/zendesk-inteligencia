import { SupabaseClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// ─────────────────────────────────────────────────────────────
// Zendesk API — Read-Only Sync Service
// ONLY GET requests. No writes to Zendesk. Ever.
// ─────────────────────────────────────────────────────────────

interface ZendeskConfig {
  subdomain: string;
  email: string;
  apiToken: string;
}

interface SyncProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  phase: string;
  ticketsSynced: number;
  ticketsTotal: number;
  commentsSynced: number;
  errorMessage?: string;
  startedAt?: string;
}

let syncProgress: SyncProgress = {
  status: 'idle',
  phase: '',
  ticketsSynced: 0,
  ticketsTotal: 0,
  commentsSynced: 0,
};

export function getSyncProgress(): SyncProgress {
  return { ...syncProgress };
}

function getAuthHeader(config: ZendeskConfig): string {
  const credentials = `${config.email}/token:${config.apiToken}`;
  return 'Basic ' + Buffer.from(credentials).toString('base64');
}

async function zendeskGet(config: ZendeskConfig, endpoint: string): Promise<any> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `https://${config.subdomain}.zendesk.com${endpoint}`;

  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': getAuthHeader(config),
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
        console.log(`Rate limited. Waiting ${retryAfter} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        return zendeskGet(config, endpoint);
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Zendesk API error ${response.status}: ${text}`);
      }

      return await response.json();
    } catch (err: any) {
      if (err.message.includes('socket disconnected') || err.message.includes('fetch failed') || err.message.includes('ECONNRESET') || err.message.includes('timeout')) {
        retryCount++;
        console.warn(`[Sync] Network error on ${endpoint}: ${err.message}. Retrying ${retryCount}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
        if (retryCount >= maxRetries) throw err;
      } else {
        throw err;
      }
    }
  }
}

const entityCache: Map<string, any> = new Map();

async function resolveEntity(
  config: ZendeskConfig,
  supabase: SupabaseClient,
  type: 'user' | 'organization' | 'group',
  id: number | null
): Promise<{ name: string; email?: string } | null> {
  if (!id) return null;

  const cacheKey = `${type}:${id}`;
  if (entityCache.has(cacheKey)) return entityCache.get(cacheKey);

  const { data: cached } = await supabase
    .from('zendesk_entities')
    .select('name, email')
    .eq('entity_type', type)
    .eq('zendesk_id', id)
    .single();

  if (cached) {
    entityCache.set(cacheKey, cached);
    return cached;
  }

  try {
    const endpointMap = {
      user: `/api/v2/users/${id}.json`,
      organization: `/api/v2/organizations/${id}.json`,
      group: `/api/v2/groups/${id}.json`,
    };

    const data = await zendeskGet(config, endpointMap[type]);
    const entity = data[type];
    const result = { name: entity.name || '', email: entity.email || '' };

    await supabase.from('zendesk_entities').upsert({
      entity_type: type,
      zendesk_id: id,
      name: result.name,
      email: result.email,
      raw_json: JSON.stringify(entity)
    }, { onConflict: 'entity_type,zendesk_id' });

    entityCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`Could not resolve ${type} ${id}:`, err);
    return null;
  }
}

async function syncTicketComments(
  config: ZendeskConfig,
  supabase: SupabaseClient,
  ticketId: number
): Promise<number> {
  let count = 0;
  let url: string | null = `/api/v2/tickets/${ticketId}/comments.json?sort_order=asc`;

  while (url) {
    let data;
    try {
      data = await zendeskGet(config, url);
    } catch (err: any) {
      if (err.message.includes('404')) {
        console.warn(`[Sync] Ticket comments not found for ticket ${ticketId} (404)`);
        break;
      }
      throw err;
    }
    const comments = data.comments || [];

    for (const comment of comments) {
      const author = await resolveEntity(config, supabase, 'user', comment.author_id);
      
      await supabase.from('ticket_comments').upsert({
        zendesk_comment_id: comment.id,
        ticket_zendesk_id: ticketId,
        author_id: comment.author_id,
        author_name: author?.name || 'Desconhecido',
        body: comment.plain_body || comment.body || '',
        html_body: comment.html_body || '',
        is_public: comment.public ? true : false,
        created_at: comment.created_at
      }, { onConflict: 'zendesk_comment_id' });
      
      count++;
    }

    if (comments.length === 0) break;
    url = data.next_page || null;
  }

  return count;
}

async function syncAgents(
  config: ZendeskConfig,
  supabase: SupabaseClient
): Promise<void> {
  let url: string | null = '/api/v2/users.json?role=agent,admin';
  while (url) {
    const data = await zendeskGet(config, url);
    const users = data.users || [];
    
    for (const user of users) {
      if (!user.suspended) {
        await supabase.from('zendesk_agents').upsert({
          id: user.id,
          name: user.name,
          email: user.email,
          is_active: true
        }, { onConflict: 'id' });
      }
    }
    
    if (users.length === 0) break;
    url = data.next_page || null;
  }
}

export async function syncSingleTicket(
  config: ZendeskConfig,
  supabase: SupabaseClient,
  ticketId: number
): Promise<{ commentsSynced: number }> {
  console.log(`[Webhook Sync] Sincronizando ticket #${ticketId}...`);

  // Fetch ticket data from Zendesk
  const ticketData = await zendeskGet(config, `/api/v2/tickets/${ticketId}.json?include=metric_sets`);
  const ticket = ticketData.ticket;

  if (!ticket) {
    throw new Error(`Ticket #${ticketId} não encontrado no Zendesk.`);
  }

  // Resolve related entities
  const requester = await resolveEntity(config, supabase, 'user', ticket.requester_id);
  const assignee = await resolveEntity(config, supabase, 'user', ticket.assignee_id);
  const group = await resolveEntity(config, supabase, 'group', ticket.group_id);
  const organization = await resolveEntity(config, supabase, 'organization', ticket.organization_id);

  let newSolvedAt = null;
  if (ticket.status === 'solved' || ticket.status === 'closed') {
    newSolvedAt = ticket.metric_set?.solved_at || ticket.updated_at;
  }

  // Upsert ticket
  await supabase.from('tickets').upsert({
    zendesk_id: ticket.id,
    ticket_number: ticket.id,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    ticket_type: ticket.type,
    requester_id: ticket.requester_id,
    requester_name: requester?.name || '',
    requester_email: requester?.email || '',
    organization_id: ticket.organization_id,
    organization_name: organization?.name || '',
    assignee_id: ticket.assignee_id,
    assignee_name: assignee?.name || '',
    group_id: ticket.group_id,
    group_name: group?.name || '',
    tags: JSON.stringify(ticket.tags || []),
    custom_fields: JSON.stringify(ticket.custom_fields || []),
    form_id: ticket.ticket_form_id,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    solved_at: newSolvedAt,
    due_date: ticket.due_at,
    zendesk_url: `https://${config.subdomain}.zendesk.com/agent/tickets/${ticket.id}`,
    raw_json: JSON.stringify(ticket),
    synced_at: new Date().toISOString()
  }, { onConflict: 'zendesk_id' });

  // Sync comments
  const commentCount = await syncTicketComments(config, supabase, ticketId);
  console.log(`[Webhook Sync] Ticket #${ticketId} sincronizado com ${commentCount} comentários.`);
  return { commentsSynced: commentCount };
}

export async function startSync(
  config: ZendeskConfig, 
  supabase: SupabaseClient, 
  customStartDate?: string, 
  customEndDate?: string
): Promise<void> {
  if (syncProgress.status === 'running') {
    throw new Error('Sincronização já em andamento');
  }

  syncProgress = {
    status: 'running',
    phase: customStartDate && customEndDate ? 'Buscando tickets no período selecionado...' : 'Buscando tickets mais recentes...',
    ticketsSynced: 0,
    ticketsTotal: 0,
    commentsSynced: 0,
    startedAt: new Date().toISOString(),
  };

  const { data: syncLog } = await supabase
    .from('sync_log')
    .insert([{ status: 'running' }])
    .select('id')
    .single();
    
  const syncLogId = syncLog?.id;

  try {
    syncProgress.phase = 'Sincronizando lista de agentes ativos...';
    await syncAgents(config, supabase);

    const allTickets: any[] = [];
    let queryUrl = '';

    if (customStartDate && customEndDate) {
      queryUrl = `/api/v2/search.json?query=type:ticket created>=${customStartDate} created<=${customEndDate} order_by:created_at sort:asc&include=metric_sets`;
    } else {
      let startTime = 0; // Unix timestamp 0 fetches all, but we will get last updated
      const { data: lastTicket } = await supabase
        .from('tickets')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (lastTicket && lastTicket.updated_at) {
         startTime = Math.floor(new Date(lastTicket.updated_at).getTime() / 1000);
         // Zendesk API exige que o start_time seja no mínimo 60 segundos no passado
         const maxStartTime = Math.floor(Date.now() / 1000) - 61;
         if (startTime > maxStartTime) {
           startTime = maxStartTime;
         }
      }
      queryUrl = `/api/v2/incremental/tickets.json?start_time=${startTime}&include=metric_sets`;
    }

    let url: string | null = queryUrl;

    while (url) {
      const data = await zendeskGet(config, url);
      const tickets = data.results || data.tickets || [];
      allTickets.push(...tickets);
      
      syncProgress.phase = `Descobrimos ${allTickets.length} tickets para analisar...`;
      
      if (data.end_of_stream || (tickets && tickets.length === 0)) {
        break;
      }
      
      url = data.next_page || null;
      
      // Safety break for testing/limits (e.g. max 5000 tickets per sync run)
      if (allTickets.length > 5000) break;
    }

    syncProgress.ticketsTotal = allTickets.length;
    syncProgress.phase = 'Processando detalhes dos tickets...';

    for (const ticket of allTickets) {
      const requester = await resolveEntity(config, supabase, 'user', ticket.requester_id);
      const assignee = await resolveEntity(config, supabase, 'user', ticket.assignee_id);
      const group = await resolveEntity(config, supabase, 'group', ticket.group_id);
      const organization = await resolveEntity(config, supabase, 'organization', ticket.organization_id);

      let newSolvedAt = null;
      if (ticket.status === 'solved' || ticket.status === 'closed') {
        newSolvedAt = ticket.metric_set?.solved_at || ticket.updated_at;
      }

      await supabase.from('tickets').upsert({
        zendesk_id: ticket.id,
        ticket_number: ticket.id,
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        ticket_type: ticket.type,
        requester_id: ticket.requester_id,
        requester_name: requester?.name || '',
        requester_email: requester?.email || '',
        organization_id: ticket.organization_id,
        organization_name: organization?.name || '',
        assignee_id: ticket.assignee_id,
        assignee_name: assignee?.name || '',
        group_id: ticket.group_id,
        group_name: group?.name || '',
        tags: JSON.stringify(ticket.tags || []),
        custom_fields: JSON.stringify(ticket.custom_fields || []),
        form_id: ticket.ticket_form_id,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        solved_at: newSolvedAt,
        due_date: ticket.due_at,
        zendesk_url: `https://${config.subdomain}.zendesk.com/agent/tickets/${ticket.id}`,
        raw_json: JSON.stringify(ticket),
        synced_at: new Date().toISOString()
      }, { onConflict: 'zendesk_id' });

      syncProgress.ticketsSynced++;
      syncProgress.phase = `Sincronizando comentários do ticket #${ticket.id}...`;

      const commentCount = await syncTicketComments(config, supabase, ticket.id);
      syncProgress.commentsSynced += commentCount;
    }

    syncProgress.phase = 'Auditoria de lixo (Garbage Collector)...';
    
    try {
      const { data: openTickets } = await supabase.from('tickets')
        .select('zendesk_id')
        .not('status', 'in', '("solved","closed","deleted")');
        
      if (openTickets && openTickets.length > 0) {
        const openIds = openTickets.map(t => t.zendesk_id);
        const chunkSize = 100;
        let deletedCount = 0;
        
        for (let i = 0; i < openIds.length; i += chunkSize) {
          const chunk = openIds.slice(i, i + chunkSize);
          const data = await zendeskGet(config, `/api/v2/tickets/show_many.json?ids=${chunk.join(',')}`);
          const returnedTickets = data.tickets || [];
          const returnedIds = returnedTickets.map((t: any) => t.id);
          
          const missingIds = chunk.filter(id => !returnedIds.includes(id));
          
          if (missingIds.length > 0) {
            await supabase.from('tickets')
              .update({ status: 'deleted', updated_at: new Date().toISOString() })
              .in('zendesk_id', missingIds);
            deletedCount += missingIds.length;
          }
        }
        if (deletedCount > 0) {
          console.log(`[Garbage Collector] Expurgo automático de ${deletedCount} tickets fantasmas.`);
        }
      }
    } catch (gcErr) {
      console.warn('[Garbage Collector] Erro ao auditar lixo:', gcErr);
    }

    syncProgress.status = 'completed';
    syncProgress.phase = 'Sincronização concluída com sucesso!';
    
    if (syncLogId) {
      await supabase.from('sync_log').update({
        completed_at: new Date().toISOString(),
        tickets_synced: syncProgress.ticketsTotal,
        tickets_updated: syncProgress.ticketsTotal,
        comments_synced: syncProgress.commentsSynced,
        status: 'completed'
      }).eq('id', syncLogId);
    }

  } catch (err: any) {
    console.error('Fatal sync error:', err);
    syncProgress.status = 'error';
    syncProgress.errorMessage = err.message;
    
    if (syncLogId) {
      await supabase.from('sync_log').update({
        completed_at: new Date().toISOString(),
        status: 'error',
        error_message: err.message
      }).eq('id', syncLogId);
    }
  }
}
