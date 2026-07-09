import { Router, Request, Response, NextFunction } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { getAdminDatabase } from './database.js';
import { startSync, getSyncProgress, syncSingleTicket } from './zendesk-sync.js';
import { startAnalysis, getAnalysisStatus, pauseAnalysis, analyzeSingleTicket, generateRadarInsights, generateFinalResponse } from './ai-analyzer.js';

export function createRoutes(supabase: SupabaseClient): Router {
  const router = Router();

  // Auth Middleware
  const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    // Exclude health check and similar public routes if any
    if (req.path === '/api/health') return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação ausente' });
    }

    const token = authHeader.split(' ')[1];
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada' });
    }

    // Pass user forward if needed
    (req as any).user = data.user;
    next();
  };

  // ─── Audit Log Helper ──────────────────────────────────────────
  async function logAudit(req: Request, action: string, targetType: string, targetId: string, details: any = {}) {
    try {
      const user = (req as any).user;
      await supabase.from('audit_logs').insert({
        user_id: user?.id || null,
        user_email: user?.email || 'sistema',
        user_name: user?.user_metadata?.name || user?.email || 'Sistema (Webhook)',
        action,
        target_type: targetType,
        target_id: targetId,
        details,
        ip_address: req.headers['x-forwarded-for'] as string || req.ip || ''
      });
    } catch (err) {
      console.error('[Audit] Erro ao salvar log:', err);
    }
  }

  // ─── Zendesk Webhook (BEFORE auth middleware — uses its own token) ──
  router.post('/api/webhooks/zendesk', async (req: Request, res: Response) => {
    try {
      // Validate webhook secret (configured only as environment variable on Render)
      const webhookSecret = process.env.ZENDESK_WEBHOOK_SECRET;
      if (webhookSecret) {
        const providedToken = req.headers['x-webhook-secret'] as string;
        if (providedToken !== webhookSecret) {
          console.warn('[Webhook] Token inválido recebido.');
          return res.status(401).json({ error: 'Token inválido' });
        }
      }

      // Support both formats: { ticket: { id } } and { ticket_id }
      const ticketId = parseInt(req.body?.ticket?.id || req.body?.ticket_id);
      if (!ticketId || isNaN(ticketId)) {
        return res.status(400).json({ error: 'ticket_id é obrigatório' });
      }

      console.log(`[Webhook] Recebido evento para ticket #${ticketId}`);

      // Respond immediately (Zendesk expects a fast response)
      res.status(200).json({ received: true, ticket_id: ticketId });

      // Process in background: sync ticket + analyze
      const zendeskConfig = {
        subdomain: process.env.ZENDESK_SUBDOMAIN || '',
        email: process.env.ZENDESK_EMAIL || '',
        apiToken: process.env.ZENDESK_API_TOKEN || ''
      };

      try {
        const result = await syncSingleTicket(zendeskConfig, supabase, ticketId);
        
        // Registrar a sincronização na tabela sync_log para refletir na dashboard
        await supabase.from('sync_log').insert([{
          status: 'completed',
          phase: 'concluído via webhook',
          tickets_synced: 1,
          comments_synced: result.commentsSynced,
          completed_at: new Date().toISOString()
        }]);

        await logAudit(req, 'webhook_sync', 'ticket', String(ticketId), { message: 'Ticket sincronizado via webhook' });

        // Check settings to see if auto-analyze is enabled
        const { data: settings } = await supabase.from('system_settings').select('auto_analyze_webhooks').eq('id', 1).single();
        const autoAnalyze = settings ? settings.auto_analyze_webhooks : true;

        if (!autoAnalyze) {
          console.log(`[Webhook] Auto-análise desativada nas configurações para o ticket #${ticketId}.`);
          return;
        }

        // Trigger AI analysis for this specific ticket
        const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '';
        if (apiKey) {
          try {
            const aiResult = await analyzeSingleTicket(apiKey, supabase, ticketId);
            console.log(`[Webhook] Ticket #${ticketId} analisado pela IA com sucesso.`);
            await logAudit(req, 'webhook_analyze', 'ticket', String(ticketId), { 
              message: 'Ticket analisado via webhook',
              metrics: {
                api_calls: 1,
                input_tokens: aiResult.usage?.prompt || 0,
                output_tokens: aiResult.usage?.completion || 0,
                total_tokens: aiResult.usage?.total || 0,
                estimated_cost: aiResult.cost || 0,
                model: aiResult.model || 'Desconhecido',
                provider: aiResult.provider || 'Desconhecido',
                error_429: 0
              }
            });
          } catch (aiErr: any) {
            const is429 = aiErr.message === 'RATE_LIMIT' || aiErr.message.includes('429');
            console.error(`[Webhook] Erro da IA no ticket #${ticketId}:`, aiErr.message);
            await logAudit(req, 'webhook_analyze', 'ticket', String(ticketId), { 
              message: 'Falha na análise da IA', 
              error: aiErr.message,
              metrics: { error_429: is429 ? 1 : 0 }
            });
          }
        }
      } catch (bgErr: any) {
        console.error(`[Webhook] Erro ao processar ticket #${ticketId} em background:`, bgErr.message);
      }

    } catch (err: any) {
      console.error('[Webhook] Erro:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  // Apply middleware to all /api routes except login/health (login is already handled client side, no backend route)
  router.use('/api', requireAuth);

  // ─── Audit Logs Routes ─────────────────────────────────────────

  router.get('/api/audit-logs', async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const action = req.query.action as string;
      const offset = (page - 1) * limit;

      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (action) {
        query = query.eq('action', action);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      res.json({
        logs: data || [],
        total: count || 0,
        page,
        totalPages: Math.ceil((count || 0) / limit)
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/audit-logs/login', async (req, res) => {
    try {
      await logAudit(req, 'login', 'user', (req as any).user?.id || '', { message: 'Usuário realizou login' });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/taxonomy/rename
  router.post('/api/taxonomy/rename', async (req, res) => {
    try {
      const { type, id, oldName, newName } = req.body;
      if (!type || !id || !oldName || !newName) {
        return res.status(400).json({ error: 'Faltam parâmetros' });
      }

      if (type === 'product') {
        await supabase.from('catalog_products').update({ name: newName }).eq('id', id);
        await supabase.from('ticket_analysis').update({ product: newName }).eq('product', oldName);
      } else if (type === 'category') {
        await supabase.from('catalog_categories').update({ name: newName }).eq('id', id);
        await supabase.from('ticket_analysis').update({ category: newName }).eq('category', oldName);
      }
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Users (Admin only in production) ──────────────────────────
  
  router.get('/api/users', async (_req, res) => {
    try {
      const { data, error } = await getAdminDatabase().from('users').select('id, name, email, role, created_at');
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/users', async (req, res) => {
    try {
      const { name, email, pass, role } = req.body;
      if (!name || !email || !pass) {
        return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
      }

      const adminAuth = getAdminDatabase().auth.admin;
      
      // Create user in auth.users
      const { data: authData, error: authError } = await adminAuth.createUser({
        email,
        password: pass,
        email_confirm: true
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          return res.status(400).json({ error: 'E-mail já está em uso.' });
        }
        throw authError;
      }

      if (!authData.user) {
        throw new Error('Erro ao criar usuário no Supabase Auth.');
      }

      // Create user profile in public.users
      const { data: profile, error: profileError } = await getAdminDatabase().from('users').insert([{
        id: authData.user.id,
        name,
        email,
        role: role || 'user'
      }]).select('id, name, email, role, created_at').single();

      if (profileError) {
        // Rollback auth user creation if profile fails
        await adminAuth.deleteUser(authData.user.id);
        throw profileError;
      }
      
      res.json(profile);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/api/users/:id', async (req, res) => {
    try {
      const adminAuth = getAdminDatabase().auth.admin;
      
      // Delete from auth.users (will cascade delete profile because of FK ON DELETE CASCADE)
      const { error: authError } = await adminAuth.deleteUser(req.params.id);
      
      if (authError) throw authError;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Tickets ───────────────────────────────────────────────────

  router.get('/api/tickets', async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      const search = req.query.search as string || '';
      const status = req.query.status as string || '';
      const category = req.query.category as string || '';
      const product = req.query.product as string || '';
      const pattern = req.query.pattern as string || '';
      const priority = req.query.priority as string || '';
      const hasAnalysis = req.query.hasAnalysis as string || '';
      const assignee = req.query.assignee as string || '';
      const sort = req.query.sort as string || 'created_desc';
      const isSpamTab = req.query.isSpamTab === 'true';
      const excludeSpam = req.query.excludeSpam === 'true';

      let query = supabase.from('tickets').select(`
        *,
        ticket_analysis (*)
      `, { count: 'exact' });

      if (search) {
        const isNumeric = /^\d+$/.test(search);
        let orQuery = `subject.ilike.%${search}%,requester_name.ilike.%${search}%,organization_name.ilike.%${search}%,description.ilike.%${search}%`;
        if (isNumeric) {
          orQuery += `,zendesk_id.eq.${search}`;
        }
        query = query.or(orQuery);
      }
      if (status) {
        const statuses = status.split(',').map(s => s.trim());
        if (statuses.length > 1) {
          query = query.in('status', statuses);
        } else {
          query = query.eq('status', status);
        }
      }
      if (category) {
        // If we filter by a specific category, we MUST inner join to filter the parent
        query = query.not('ticket_analysis', 'is', null).ilike('ticket_analysis.category', `%${category}%`);
      }
      if (product) query = query.not('ticket_analysis', 'is', null).eq('ticket_analysis.product', product);
      if (pattern) query = query.not('ticket_analysis', 'is', null).ilike('ticket_analysis.identified_pattern', `%${pattern}%`);
      if (priority) query = query.not('ticket_analysis', 'is', null).eq('ticket_analysis.suggested_priority', priority);
      if (assignee) query = query.eq('assignee_name', assignee);

      if (isSpamTab || excludeSpam) {
        const { data: spamAnalyses } = await supabase.from('ticket_analysis')
          .select('ticket_zendesk_id')
          .ilike('category', '%Spam%')
          .not('category', 'ilike', '%Análise de Spam%');
        const spamIds = (spamAnalyses || []).map(a => a.ticket_zendesk_id);
        
        if (isSpamTab) {
          let orStr = `subject.ilike.\\*\\*\\*SPAM%,status.eq.suspended`;
          if (spamIds.length > 0) {
            orStr += `,zendesk_id.in.(${spamIds.join(',')})`;
          }
          query = query.or(orStr);
        } else if (excludeSpam) {
          query = query.not('subject', 'ilike', '\\*\\*\\*SPAM%');
          query = query.neq('status', 'suspended');
          if (spamIds.length > 0) {
             const chunkSize = 200;
             for (let i = 0; i < spamIds.length; i += chunkSize) {
                const chunk = spamIds.slice(i, i + chunkSize);
                query = query.not('zendesk_id', 'in', `(${chunk.join(',')})`);
             }
          }
        }
      }

      if (hasAnalysis === 'true') {
        query = query.not('ticket_analysis', 'is', null);
      } else if (hasAnalysis === 'false') {
        query = query.is('ticket_analysis', null);
      }

      if (sort === 'created_desc') {
        query = query.order('created_at', { ascending: false });
      } else if (sort === 'created_asc') {
        query = query.order('created_at', { ascending: true });
      } else if (sort === 'updated_desc') {
        query = query.order('updated_at', { ascending: false });
      } else if (sort === 'updated_asc') {
        query = query.order('updated_at', { ascending: true });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data: ticketsData, error, count } = await query
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // Map back to the flat format the frontend expects
      const tickets = (ticketsData || []).map(t => {
        const ta = t.ticket_analysis || {};
        return {
          ...t,
          product: ta.product,
          request_type: ta.request_type,
          category: ta.category,
          client_intent: ta.client_intent,
          problem_summary: ta.problem_summary,
          identified_pattern: ta.identified_pattern,
          suggested_response: ta.suggested_response,
          missing_info: ta.missing_info,
          recommended_procedure: ta.recommended_procedure,
          suggested_priority: ta.suggested_priority,
          confidence_level: ta.confidence_level,
          needs_internal_routing: ta.needs_internal_routing,
          solution_applied: ta.solution_applied,
          similar_tickets_ids: ta.similar_tickets_ids,
          detailed_requirements: ta.detailed_requirements,
          rejected_similar_tickets: ta.rejected_similar_tickets,
          added_similar_tickets: ta.added_similar_tickets,
          operational_effort: ta.operational_effort,
          criticality: ta.criticality,
          expected_completion_effort: ta.expected_completion_effort,
          effort_reason: ta.effort_reason,
          analyzed_at: ta.analyzed_at
        };
      });

      res.json({
        tickets,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/tickets/:id', async (req, res) => {
    try {
      const zendesk_id = parseInt(req.params.id);

      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select('*, ticket_analysis(*)')
        .eq('zendesk_id', zendesk_id)
        .single();

      if (ticketError || !ticketData) {
        return res.status(404).json({ error: 'Ticket não encontrado' });
      }

      const ta = ticketData.ticket_analysis || {};
      const ticket = { ...ticketData, ...ta };

      const { data: comments, error: commentsError } = await supabase
        .from('ticket_comments')
        .select('*')
        .eq('ticket_zendesk_id', zendesk_id)
        .order('created_at', { ascending: true });

      if (commentsError) throw commentsError;

      res.json({ ticket, comments });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/api/tickets/:id/analysis', async (req, res) => {
    try {
      const zendesk_id = parseInt(req.params.id);
      const updates = req.body;
      
      const { error } = await supabase
        .from('ticket_analysis')
        .update({
          ...updates,
          is_manually_corrected: true
        })
        .eq('ticket_zendesk_id', zendesk_id);

      if (error) throw error;
      
      await logAudit(req, 'edit_analysis', 'ticket', String(zendesk_id), { fields_changed: Object.keys(updates) });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/api/tickets/:id/due-date', async (req, res) => {
    try {
      const zendesk_id = parseInt(req.params.id);
      const { due_date } = req.body;
      
      const { error } = await supabase
        .from('tickets')
        .update({ due_date })
        .eq('zendesk_id', zendesk_id);

      if (error) throw error;
      
      await logAudit(req, 'edit_due_date', 'ticket', String(zendesk_id), { due_date });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/tickets/:id/comments', async (req, res) => {
    try {
      const zendesk_id = parseInt(req.params.id);
      const { data: comments, error } = await supabase
        .from('ticket_comments')
        .select('*')
        .eq('ticket_zendesk_id', zendesk_id)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      res.json({ comments });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Stats ─────────────────────────────────────────────────────

  router.get('/api/stats', async (_req, res) => {
    try {
      const { count: totalTickets } = await supabase.from('tickets').select('*', { count: 'exact', head: true });
      const { count: analyzedTickets } = await supabase.from('ticket_analysis').select('*', { count: 'exact', head: true });
      const { count: totalPatterns } = await supabase.from('pattern_groups').select('*', { count: 'exact', head: true }).eq('status', 'active');

      const { data: lastSync } = await supabase
        .from('sync_log')
        .select('completed_at, tickets_synced, comments_synced')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .single();

      // For distributions, doing it in memory since Postgres doesn't have a direct equivalent to SQLite's simple grouping without raw SQL
      const { data: statusData } = await supabase.from('tickets').select('status');
      const statusCounts = (statusData || []).reduce((acc: any, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, {});
      const statusDist = Object.entries(statusCounts).map(([status, count]) => ({ status, count })).sort((a: any, b: any) => b.count - a.count);

      const { data: analysisData } = await supabase.from('ticket_analysis').select('category, product, suggested_priority');
      
      const catCounts = (analysisData || []).filter(a => a.category).reduce((acc: any, a) => {
        const cats = (a.category || '').split(' | ').map((c: string) => c.trim()).filter(Boolean);
        cats.forEach((cat: string) => { acc[cat] = (acc[cat] || 0) + 1; });
        return acc;
      }, {});
      const categoryDist = Object.entries(catCounts).map(([category, count]) => ({ category, count })).sort((a: any, b: any) => b.count - a.count).slice(0, 15);

      const prodCounts = (analysisData || []).filter(a => a.product).reduce((acc: any, a) => {
        acc[a.product] = (acc[a.product] || 0) + 1; return acc;
      }, {});
      const productDist = Object.entries(prodCounts).map(([product, count]) => ({ product, count })).sort((a: any, b: any) => b.count - a.count).slice(0, 15);

      const prioCounts = (analysisData || []).filter(a => a.suggested_priority).reduce((acc: any, a) => {
        acc[a.suggested_priority] = (acc[a.suggested_priority] || 0) + 1; return acc;
      }, {});
      const priorityDist = Object.entries(prioCounts).map(([suggested_priority, count]) => ({ suggested_priority, count })).sort((a: any, b: any) => b.count - a.count);

      res.json({
        totalTickets: totalTickets || 0,
        analyzedTickets: analyzedTickets || 0,
        totalPatterns: totalPatterns || 0,
        lastSync: lastSync || null,
        statusDistribution: statusDist,
        categoryDistribution: categoryDist,
        productDistribution: productDist,
        priorityDistribution: priorityDist,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Patterns ──────────────────────────────────────────────────

  router.get('/api/patterns', async (_req, res) => {
    try {
      const { data: patterns, error } = await supabase
        .from('pattern_groups')
        .select('*')
        .eq('status', 'active')
        .order('ticket_count', { ascending: false });
      
      if (error) throw error;
      res.json({ patterns });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/api/patterns/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, description, common_response } = req.body;
      
      const updateData: any = { updated_at: new Date().toISOString() };
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (common_response !== undefined) updateData.common_response = common_response;

      const { data, error } = await supabase
        .from('pattern_groups')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/api/patterns/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { error } = await supabase.from('pattern_groups').delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Filter Options ───────────────────────────────────────────

  router.get('/api/filters', async (_req, res) => {
    try {
      const statuses = ['new', 'open', 'pending', 'hold', 'solved', 'closed'];

      // Puxa as opções oficiais do catálogo para preencher os dropdowns (UI e Filtros)
      const { data: catData } = await supabase.from('catalog_categories').select('name').eq('is_active', true).order('name');
      const { data: prodData } = await supabase.from('catalog_products').select('name').eq('is_active', true).order('name');
      
      const categories = catData ? catData.map(c => c.name) : [];
      const products = prodData ? prodData.map(p => p.name) : [];

      const { data: analysisData } = await supabase.from('ticket_analysis').select('identified_pattern, request_type');
      const patterns = [...new Set((analysisData || []).map(a => a.identified_pattern).filter(Boolean))].sort();
      const requestTypes = [...new Set((analysisData || []).map(a => a.request_type).filter(Boolean))].sort();

      const { data: assigneesData } = await supabase.from('tickets').select('assignee_name');
      const assignees = [...new Set((assigneesData || []).map(a => a.assignee_name).filter(Boolean))].sort();

      res.json({ statuses, categories, products, patterns, requestTypes, assignees });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Knowledge Base ───────────────────────────────────────────

  router.get('/api/knowledge', async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from('ai_knowledge_base')
        .select('*')
        .order('is_favorite', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/knowledge', async (req, res) => {
    try {
      const { title, description, category, priority, is_active, is_favorite } = req.body;
      const { data, error } = await supabase
        .from('ai_knowledge_base')
        .insert({
          title,
          description,
          category,
          priority,
          is_active: is_active !== false,
          is_favorite: is_favorite === true,
          history: []
        })
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/api/knowledge/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { title, description, category, priority, is_active, is_favorite, history } = req.body;
      
      const updateData: any = { updated_at: new Date().toISOString() };
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (category !== undefined) updateData.category = category;
      if (priority !== undefined) updateData.priority = priority;
      if (is_active !== undefined) updateData.is_active = is_active;
      if (is_favorite !== undefined) updateData.is_favorite = is_favorite;
      if (history !== undefined) updateData.history = history;

      const { data, error } = await supabase
        .from('ai_knowledge_base')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/api/knowledge/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { error } = await supabase.from('ai_knowledge_base').delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Sync ──────────────────────────────────────────────────────

  router.post('/api/sync/start', (req, res) => {
    const config = {
      subdomain: process.env.ZENDESK_SUBDOMAIN || '',
      email: process.env.ZENDESK_EMAIL || '',
      apiToken: process.env.ZENDESK_API_TOKEN || '',
    };

    const { startDate, endDate } = req.body || {};

    if (!config.subdomain || !config.email || !config.apiToken) {
      return res.status(400).json({ error: 'Credenciais do Zendesk não configuradas no .env' });
    }

    startSync(config, supabase, startDate, endDate).catch(err => {
      console.error('Sync error:', err);
    });

    logAudit(req, 'sync_start', 'system', '', { startDate, endDate });
    res.json({ message: 'Sincronização iniciada', status: getSyncProgress() });
  });

  router.get('/api/sync/status', (_req, res) => {
    res.json(getSyncProgress());
  });

  // ─── AI Analysis ────────────────────────────────────────────────
  
  router.post('/api/tickets/:id/analyze', async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const apiKey = process.env.GEMINI_API_KEY || ''; // In reality, we could pass this via req.body if not stored in env
      
      await analyzeSingleTicket(apiKey, supabase, ticketId);
      
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select('*, ticket_analysis(*)')
        .eq('zendesk_id', ticketId)
        .single();

      if (ticketError || !ticketData) {
        return res.status(404).json({ error: 'Ticket não encontrado após análise' });
      }

      const ta = ticketData.ticket_analysis || {};
      const ticket = { ...ticketData, ...ta };
      
      res.json(ticket);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Analyze ───────────────────────────────────────────────────

  router.post('/api/analyze/start', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('Chave da API Gemini não configurada no .env');

      const { force } = req.body || {};
      
      if (force) {
        // Delete previous analyses from the cache table so the AI starts completely fresh (except manual corrections)
        await supabase.from('ticket_analysis').delete().neq('is_manually_corrected', true);
      }

      startAnalysis(apiKey, supabase).catch(err => {
        console.error('Analysis error:', err);
      });

      logAudit(req, 'analyze_start', 'system', '', { reanalyze: !!reanalyze });
      res.json({ message: 'Análise iniciada', status: getAnalysisStatus() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/analyze/pause', (req, res) => {
    try {
      pauseAnalysis();
      res.json({ status: getAnalysisStatus() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/tickets/:id/analyze', async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id, 10);
      if (isNaN(ticketId)) {
        return res.status(400).json({ error: 'ID inválido' });
      }

      await analyzeSingleTicket(supabase, ticketId);

      const { data: ticket } = await supabase.from('tickets').select('*').eq('zendesk_id', ticketId).single();
      if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });
      
      const { data: analysis } = await supabase.from('ticket_analysis').select('*').eq('ticket_zendesk_id', ticketId).single();
      const { data: comments } = await supabase.from('ticket_comments').select('*').eq('ticket_zendesk_id', ticketId).order('created_at', { ascending: true });
      
      let patternGroup = null;
      if (analysis?.pattern_group_id) {
        const { data: pg } = await supabase.from('pattern_groups').select('name').eq('id', analysis.pattern_group_id).single();
        patternGroup = pg;
      }

      res.json({
        ...ticket,
        tags: JSON.parse(ticket.tags || '[]'),
        custom_fields: JSON.parse(ticket.custom_fields || '[]'),
        comments: comments || [],
        ...(analysis || {}),
        pattern_group: patternGroup?.name || null
      });
    } catch (err: any) {
      console.error(`Erro ao analisar ticket individual ${req.params.id}:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/analyze/status', (req, res) => {
    res.json(getAnalysisStatus());
  });

  // ─── Custom Fields Discovery ──────────────────────────────────

  router.get('/api/custom-fields', async (_req, res) => {
    try {
      const { data: sample } = await supabase
        .from('tickets')
        .select('custom_fields')
        .not('custom_fields', 'is', null)
        .neq('custom_fields', '[]')
        .limit(10);

      const fieldMap = new Map<number, { id: number; values: Set<string> }>();

      for (const row of sample || []) {
        try {
          const fields = JSON.parse(row.custom_fields);
          for (const field of fields) {
            if (!fieldMap.has(field.id)) {
              fieldMap.set(field.id, { id: field.id, values: new Set() });
            }
            if (field.value) {
              fieldMap.get(field.id)!.values.add(String(field.value));
            }
          }
        } catch {}
      }

      const result = Array.from(fieldMap.values()).map(f => ({
        id: f.id,
        sampleValues: Array.from(f.values).slice(0, 5),
      }));

      res.json({ customFields: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Agents ───────────────────────────────────────────────────

  router.get('/api/agents', async (req, res) => {
    try {
      const { data: agents, error: agentsError } = await supabase.from('zendesk_agents').select('*').order('name');
      
      if (agentsError) {
        console.error('[Agents API] Error fetching agents:', agentsError);
        return res.status(500).json({ error: 'Falha ao buscar agentes do banco de dados. Verifique as permissões da tabela.' });
      }

      const { data: expertise } = await supabase.from('agent_expertise_ranking').select('*');
      
      const { data: openTickets } = await supabase.from('tickets')
        .select('assignee_id')
        .in('status', ['new', 'open', 'pending', 'hold']);
        
      const agentsWithStats = (agents || []).map(agent => {
        const agentExp = expertise?.filter(e => e.assignee_id === agent.id) || [];
        const topCategories = agentExp.sort((a, b) => b.tickets_resolved - a.tickets_resolved).slice(0, 3).map(e => e.category);
        const avgResTime = agentExp.length > 0 ? agentExp.reduce((acc, curr) => acc + Number(curr.avg_resolution_time), 0) / agentExp.length : 0;
        const queueCount = openTickets?.filter(t => t.assignee_id === agent.id).length || 0;
        
        return {
          ...agent,
          topCategories,
          avgResolutionTime: avgResTime,
          queueCount
        };
      });
      
      res.json(agentsWithStats);
    } catch (err: any) {
      console.error('[Agents API] Caught error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/agents/:id/details', async (req, res) => {
    try {
      const agentId = Number(req.params.id);
      
      const { data: agent, error: agentError } = await supabase.from('zendesk_agents').select('*').eq('id', agentId).single();
      if (agentError) throw agentError;

      const { data: queue } = await supabase.from('tickets')
        .select('zendesk_id, subject, status, created_at, updated_at')
        .eq('assignee_id', agentId)
        .in('status', ['new', 'open', 'pending', 'hold'])
        .order('updated_at', { ascending: false });

      const { data: expertise } = await supabase.from('agent_expertise_ranking')
        .select('*')
        .eq('assignee_id', agentId)
        .order('tickets_resolved', { ascending: false });

      res.json({
        agent,
        queue: queue || [],
        expertise: expertise || []
      });
    } catch (err: any) {
      console.error('[Agents API] Caught error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/radar', async (req, res) => {
    try {
      // Puxar todos os tickets em aberto (com join em ticket_analysis)
      const { data: tickets, error } = await supabase
        .from('tickets')
        .select(`
          zendesk_id, subject, status, priority, created_at, updated_at, due_date, assignee_id, assignee_name, requester_name, organization_name, group_name,
          ticket_analysis ( needs_internal_routing, was_reopened, confidence_level, analyzed_at, identified_pattern, suggested_priority, category, product, request_type, is_manually_corrected )
        `)
        .in('status', ['new', 'open', 'pending', 'hold']);

      if (error) throw error;

      const now = new Date();
      const hoursDiff = (dateStr: string) => (now.getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
      const daysDiff = (dateStr: string) => hoursDiff(dateStr) / 24;

      const alerts = {
        no_response: [] as any[],
        stuck: [] as any[],
        no_due_date: [] as any[],
        sla_risk: [] as any[],
        internal_return: [] as any[],
        no_assignee: [] as any[],
        many_reopens: [] as any[],
        forgotten: [] as any[],
        escalation: [] as any[],
        first_reply_pending: [] as any[],
        old_backlog: [] as any[],
        overdue: [] as any[],
        no_group: [] as any[],
        waiting_client: [] as any[],
        recurring_client: [] as any[],
        unclassified: [] as any[],
        low_confidence: [] as any[],
        no_procedure: [] as any[]
      };

      const requesterCounts: Record<string, number> = {};
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const isNewInBucket = (dateStr: string) => new Date(dateStr).getTime() > yesterday.getTime();

      for (const t of tickets || []) {
        const analysisArray = Array.isArray(t.ticket_analysis) ? t.ticket_analysis : [t.ticket_analysis];
        const analysis = analysisArray[0] || {};
        
        const mergedTicket = {
          ...t,
          ...analysis,
          ticket_analysis: undefined,
          isNew: isNewInBucket(t.updated_at || t.created_at)
        };
        
        // Count requesters for recurring client
        if (mergedTicket.requester_name) {
          requesterCounts[mergedTicket.requester_name] = (requesterCounts[mergedTicket.requester_name] || 0) + 1;
        }

        // 1. Cliente sem resposta: novo há mais de 24h
        if (mergedTicket.status === 'new' && hoursDiff(mergedTicket.created_at) > 24) {
          alerts.no_response.push(mergedTicket);
        }
        // 2. Sem atualização: aberto há mais de 3 dias sem atualizar
        if (mergedTicket.status === 'open' && daysDiff(mergedTicket.updated_at) > 3) {
          alerts.stuck.push(mergedTicket);
        }
        // 3. Prazo prometido: prioridade alta/urgente sem due_date
        if (['high', 'urgent'].includes(mergedTicket.priority?.toLowerCase()) && !mergedTicket.due_date) {
          alerts.no_due_date.push(mergedTicket);
        }
        // 4. SLA em risco: urgente/alto aberto há mais de 48h
        if (['high', 'urgent'].includes(mergedTicket.priority?.toLowerCase()) && hoursDiff(mergedTicket.created_at) > 48) {
          alerts.sla_risk.push(mergedTicket);
        }
        // 5. Aguardando retorno interno: needs_internal_routing true
        if (mergedTicket.needs_internal_routing && mergedTicket.status === 'open') {
          alerts.internal_return.push(mergedTicket);
        }
        // 6. Ticket sem responsável
        if (!mergedTicket.assignee_id) {
          alerts.no_assignee.push(mergedTicket);
        }
        // 7. Muitas reaberturas
        if (mergedTicket.was_reopened) {
          alerts.many_reopens.push(mergedTicket);
        }
        // 8. Tickets esquecidos: pending/hold sem atualização há mais de 7 dias
        if (['pending', 'hold'].includes(mergedTicket.status) && daysDiff(mergedTicket.updated_at) > 7) {
          alerts.forgotten.push(mergedTicket);
        }
        // 9. Escalação necessária: urgente ou confiança baixa (< 0.5)
        if (mergedTicket.priority?.toLowerCase() === 'urgent') {
          alerts.escalation.push(mergedTicket);
        }
        // 10. Primeira resposta pendente
        if (mergedTicket.status === 'new' && hoursDiff(mergedTicket.created_at) > 4) {
          alerts.first_reply_pending.push(mergedTicket);
        }
        // 11. Backlog envelhecido (> 30 dias)
        if (daysDiff(mergedTicket.created_at) > 30) {
          alerts.old_backlog.push(mergedTicket);
        }
        // 12. Prazo vencido
        if (mergedTicket.due_date && new Date(mergedTicket.due_date).getTime() < now.getTime()) {
          alerts.overdue.push(mergedTicket);
        }
        // 13. Sem grupo
        if (!mergedTicket.group_name) {
          alerts.no_group.push(mergedTicket);
        }
        // 14. Aguardando cliente
        if (mergedTicket.status === 'pending') {
          alerts.waiting_client.push(mergedTicket);
        }
        // 15. Ticket sem classificação (sem category ou product)
        if (!mergedTicket.category || !mergedTicket.product) {
          alerts.unclassified.push(mergedTicket);
        }
        // 16. Baixa confiança
        if (mergedTicket.confidence_level !== undefined && mergedTicket.confidence_level !== null && mergedTicket.confidence_level < 0.5) {
          alerts.low_confidence.push(mergedTicket);
        }
        // 17. Sem procedimento
        if (mergedTicket.recommended_procedure && mergedTicket.recommended_procedure.toLowerCase().includes('não encontrado')) {
          alerts.no_procedure.push(mergedTicket);
        }
      }

      // Populate recurring clients
      for (const t of tickets || []) {
        if (t.requester_name && requesterCounts[t.requester_name] > 3) {
          const analysisArray = Array.isArray(t.ticket_analysis) ? t.ticket_analysis : [t.ticket_analysis];
          const analysis = analysisArray[0] || {};
          const isNew = isNewInBucket(t.updated_at || t.created_at);
          alerts.recurring_client.push({ ...t, ...analysis, ticket_analysis: undefined, isNew });
        }
      }

      // Fetch radar insights from DB
      const { data: insightsData } = await supabase.from('radar_insights').select('*').eq('is_active', true).order('created_at', { ascending: false });

      // Calculate trends
      const calcTrend = (list: any[]) => list.filter(i => i.isNew).length;

      const results = [
        { id: 'no_response', title: 'Cliente sem resposta', icon: '🔴', subtitle: 'há mais de 24 horas', level: 'critical', count: alerts.no_response.length, trend: calcTrend(alerts.no_response), tickets: alerts.no_response },
        { id: 'stuck', title: 'Sem atualização', icon: '🟠', subtitle: 'ticket parado > 3 dias', level: 'warning', count: alerts.stuck.length, trend: calcTrend(alerts.stuck), tickets: alerts.stuck },
        { id: 'no_due_date', title: 'Prazo prometido', icon: '🟡', subtitle: 'prazo não informado', level: 'alert', count: alerts.no_due_date.length, trend: calcTrend(alerts.no_due_date), tickets: alerts.no_due_date },
        { id: 'sla_risk', title: 'SLA em risco', icon: '🔴', subtitle: 'alta prioridade > 48h', level: 'critical', count: alerts.sla_risk.length, trend: calcTrend(alerts.sla_risk), tickets: alerts.sla_risk },
        { id: 'internal_return', title: 'Aguardando retorno interno', icon: '🟠', subtitle: 'ação de outras áreas', level: 'warning', count: alerts.internal_return.length, trend: calcTrend(alerts.internal_return), tickets: alerts.internal_return },
        { id: 'no_assignee', title: 'Ticket sem responsável', icon: '🔴', subtitle: 'sem tribo designada', level: 'critical', count: alerts.no_assignee.length, trend: calcTrend(alerts.no_assignee), tickets: alerts.no_assignee },
        { id: 'many_reopens', title: 'Muitas reaberturas', icon: '🟡', subtitle: 'vai e volta', level: 'alert', count: alerts.many_reopens.length, trend: calcTrend(alerts.many_reopens), tickets: alerts.many_reopens },
        { id: 'forgotten', title: 'Tickets esquecidos', icon: '🔴', subtitle: 'pendente > 7 dias', level: 'critical', count: alerts.forgotten.length, trend: calcTrend(alerts.forgotten), tickets: alerts.forgotten },
        { id: 'escalation', title: 'Escalação necessária', icon: '🟠', subtitle: 'urgente', level: 'warning', count: alerts.escalation.length, trend: calcTrend(alerts.escalation), tickets: alerts.escalation },
        { id: 'first_reply_pending', title: 'Primeira resposta', icon: '🟠', subtitle: '> 4 horas', level: 'warning', count: alerts.first_reply_pending.length, trend: calcTrend(alerts.first_reply_pending), tickets: alerts.first_reply_pending },
        { id: 'old_backlog', title: 'Tickets Antigos em Aberto', icon: '🔴', subtitle: '> 30 dias', level: 'critical', count: alerts.old_backlog.length, trend: calcTrend(alerts.old_backlog), tickets: alerts.old_backlog },
        { id: 'overdue', title: 'Prazo vencido', icon: '🔴', subtitle: 'atrasado', level: 'critical', count: alerts.overdue.length, trend: calcTrend(alerts.overdue), tickets: alerts.overdue },
        { id: 'waiting_client', title: 'Aguardando cliente', icon: '🟢', subtitle: 'pendente', level: 'low', count: alerts.waiting_client.length, trend: calcTrend(alerts.waiting_client), tickets: alerts.waiting_client },
        { id: 'recurring_client', title: 'Cliente recorrente', icon: '🟡', subtitle: '> 3 chamados', level: 'alert', count: alerts.recurring_client.length, trend: calcTrend(alerts.recurring_client), tickets: alerts.recurring_client },
        { id: 'unclassified', title: 'Sem classificação', icon: '🟡', subtitle: 'faltam dados IA', level: 'alert', count: alerts.unclassified.length, trend: calcTrend(alerts.unclassified), tickets: alerts.unclassified },
        { id: 'low_confidence', title: 'Baixa confiança IA', icon: '🟠', subtitle: 'necessita revisão', level: 'warning', count: alerts.low_confidence.length, trend: calcTrend(alerts.low_confidence), tickets: alerts.low_confidence },
        { id: 'no_procedure', title: 'Sem procedimento', icon: '🟡', subtitle: 'não documentado', level: 'alert', count: alerts.no_procedure.length, trend: calcTrend(alerts.no_procedure), tickets: alerts.no_procedure }
      ];

      res.json({
        metrics: results,
        insights: insightsData || []
      });
    } catch (err: any) {
      console.error('[Radar API] Caught error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/api/agents/:id', async (req, res) => {
    try {
      const { cargo } = req.body;
      const { error } = await supabase.from('zendesk_agents').update({ cargo }).eq('id', req.params.id);
      if (error) {
        console.error('[Agents API] Error updating cargo:', error);
        throw error;
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Agents API] Caught error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/radar/analyze', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '';
      const insights = await generateRadarInsights(apiKey, supabase);
      res.json({ success: true, insights });
    } catch (err: any) {
      console.error('[Radar Analyze API] Caught error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Calendar Events ───────────────────────────────────────────
  router.get('/api/calendar/events', async (req, res) => {
    try {
      const user = (req as any).user;
      const userId = user?.id;

      let query = supabase.from('calendar_events').select('*');
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Filter out 'personal' events not belonging to current user
      const filtered = (data || []).filter(e => e.event_type === 'global' || e.created_by === userId);
      
      res.json(filtered);
    } catch (err: any) {
      console.error('[Calendar API] GET error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/calendar/events', async (req, res) => {
    try {
      const user = (req as any).user;
      const payload = {
        ...req.body,
        created_by: user?.id,
        end_date: req.body.end_date || null,
        end_time: req.body.end_time || null
      };
      
      const { data, error } = await supabase.from('calendar_events').insert([payload]).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      console.error('[Calendar API] POST error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/api/calendar/events/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const payload = {
        ...req.body
      };
      if (payload.end_date === '') payload.end_date = null;
      if (payload.end_time === '') payload.end_time = null;

      const { data, error } = await supabase.from('calendar_events').update(payload).eq('id', id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      console.error('[Calendar API] PUT error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/api/calendar/events/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { error } = await supabase.from('calendar_events').delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Calendar API] DELETE error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Notes ───────────────────────────────────────────────────
  router.get('/api/notes', requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const userId = user?.id;

      let query = supabase.from('user_notes').select('*');
      
      const { data, error } = await query.order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      
      // Filter out notes that are not public and not created by the current user
      const filtered = (data || []).filter(n => n.is_public || n.user_id === userId);
      
      res.json(filtered);
    } catch (err: any) {
      console.error('[Notes API] GET error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/notes', requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const payload = {
        ...req.body,
        user_id: user?.id,
        author_name: user?.user_metadata?.name || user?.email || 'Usuário Desconhecido'
      };
      
      const { data, error } = await supabase.from('user_notes').insert([payload]).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      console.error('[Notes API] POST error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/api/notes/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const payload = {
        ...req.body,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase.from('user_notes').update(payload).eq('id', id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      console.error('[Notes API] PUT error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/api/notes/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { error } = await supabase.from('user_notes').delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Notes API] DELETE error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── AI Generation ───────────────────────────────────────────
  router.post('/api/ai/generate-final-response/:id', async (req, res) => {
    try {
      const zendeskId = parseInt(req.params.id);
      if (isNaN(zendeskId)) return res.status(400).json({ error: 'ID inválido' });
      
      const apiKey = process.env.GEMINI_API_KEY || '';
      const finalResponse = await generateFinalResponse(apiKey, supabase, zendeskId);
      
      res.json({ suggested_final_response: finalResponse });
    } catch (err: any) {
      console.error('[AI Final Response API] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── System Settings ───────────────────────────────────────────
  router.get('/api/settings', async (req, res) => {
    try {
      let { data, error } = await supabase.from('system_settings').select('*').eq('id', 1).single();
      if (error || !data) {
        // Fallback se não existir
        data = {
          ai_provider: 'gemini',
          ai_model: 'gemini-2.5-flash',
          auto_analyze_webhooks: true
        };
      }
      res.json(data);
    } catch (err: any) {
      console.error('[Settings API] GET error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/api/settings', async (req, res) => {
    try {
      const payload = {
        ai_provider: req.body.ai_provider,
        ai_model: req.body.ai_model,
        auto_analyze_webhooks: req.body.auto_analyze_webhooks,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await supabase.from('system_settings').upsert({ id: 1, ...payload }, { onConflict: 'id' }).select().single();
      if (error) throw error;
      
      await logAudit(req, 'edit_settings', 'system', '1', { 
        message: 'Configurações de IA atualizadas', 
        details: payload 
      });

      res.json(data);
    } catch (err: any) {
      console.error('[Settings API] PUT error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
