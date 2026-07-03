import { Router } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths } from 'date-fns';

export function registerReportRoutes(supabase: SupabaseClient) {
  const router = Router();

  function getDateRange(period: string, customStart?: string, customEnd?: string) {
    const now = new Date();
    switch (period) {
      case 'hoje':
        return { start: startOfDay(now).toISOString(), end: endOfDay(now).toISOString() };
      case 'ontem': {
        const ontem = subDays(now, 1);
        return { start: startOfDay(ontem).toISOString(), end: endOfDay(ontem).toISOString() };
      }
      case 'ultimos_7_dias':
        return { start: subDays(now, 7).toISOString(), end: now.toISOString() };
      case 'esta_semana':
        return { start: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), end: now.toISOString() };
      case 'semana_passada': {
        const lastWeek = subWeeks(now, 1);
        return { start: startOfWeek(lastWeek, { weekStartsOn: 1 }).toISOString(), end: endOfWeek(lastWeek, { weekStartsOn: 1 }).toISOString() };
      }
      case 'este_mes':
        return { start: startOfMonth(now).toISOString(), end: now.toISOString() };
      case 'mes_passado': {
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth).toISOString(), end: endOfMonth(lastMonth).toISOString() };
      }
      case 'personalizado':
        if (customStart && customEnd) {
          return { start: new Date(customStart).toISOString(), end: new Date(customEnd).toISOString() };
        }
        return { start: subDays(now, 30).toISOString(), end: now.toISOString() };
      default:
        return { start: subDays(now, 30).toISOString(), end: now.toISOString() };
    }
  }

  function getPreviousDateRange(period: string, customStart?: string, customEnd?: string) {
    const now = new Date();
    switch (period) {
      case 'hoje': {
        const ontem = subDays(now, 1);
        return { start: startOfDay(ontem).toISOString(), end: endOfDay(ontem).toISOString() };
      }
      case 'ontem': {
        const anteontem = subDays(now, 2);
        return { start: startOfDay(anteontem).toISOString(), end: endOfDay(anteontem).toISOString() };
      }
      case 'ultimos_7_dias':
        return { start: subDays(now, 14).toISOString(), end: subDays(now, 7).toISOString() };
      case 'esta_semana': {
        const lastWeek = subWeeks(now, 1);
        return { start: startOfWeek(lastWeek, { weekStartsOn: 1 }).toISOString(), end: endOfWeek(lastWeek, { weekStartsOn: 1 }).toISOString() };
      }
      case 'semana_passada': {
        const twoWeeks = subWeeks(now, 2);
        return { start: startOfWeek(twoWeeks, { weekStartsOn: 1 }).toISOString(), end: endOfWeek(twoWeeks, { weekStartsOn: 1 }).toISOString() };
      }
      case 'este_mes': {
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth).toISOString(), end: endOfMonth(lastMonth).toISOString() };
      }
      case 'mes_passado': {
        const twoMonths = subMonths(now, 2);
        return { start: startOfMonth(twoMonths).toISOString(), end: endOfMonth(twoMonths).toISOString() };
      }
      case 'personalizado':
        if (customStart && customEnd) {
          const start = new Date(customStart);
          const end = new Date(customEnd);
          const diff = end.getTime() - start.getTime();
          return { start: new Date(start.getTime() - diff).toISOString(), end: new Date(end.getTime() - diff).toISOString() };
        }
        return { start: subDays(now, 60).toISOString(), end: subDays(now, 30).toISOString() };
      default:
        return { start: subDays(now, 60).toISOString(), end: subDays(now, 30).toISOString() };
    }
  }

  router.post('/api/reports/dashboard', async (req, res) => {
    try {
      const { period, customStart, customEnd, client, product, group, assignee, category, priority } = req.body;
      
      const currentRange = getDateRange(period, customStart, customEnd);
      const prevRange = getPreviousDateRange(period, customStart, customEnd);

      const applyFilters = (query: any) => {
        if (client) query = query.eq('organization_name', client);
        if (group) query = query.eq('group_name', group);
        if (assignee) query = query.eq('assignee_name', assignee);
        if (priority) query = query.eq('priority', priority);
        if (category) query = query.eq('ticket_analysis.category', category);
        if (product) query = query.eq('ticket_analysis.product', product);
        return query;
      };

      // 1. Entradas & Resolvidos & Backlog
      let qEntradas = supabase.from('tickets').select('id, ticket_analysis!inner(category, product)', { count: 'exact', head: true })
        .gte('created_at', currentRange.start).lte('created_at', currentRange.end);
      let qEntradasPrev = supabase.from('tickets').select('id, ticket_analysis!inner(category, product)', { count: 'exact', head: true })
        .gte('created_at', prevRange.start).lte('created_at', prevRange.end);
      
      let qResolvidos = supabase.from('tickets').select('id, ticket_analysis!inner(category, product)', { count: 'exact', head: true })
        .in('status', ['solved', 'closed'])
        .gte('solved_at', currentRange.start).lte('solved_at', currentRange.end);
      let qResolvidosPrev = supabase.from('tickets').select('id, ticket_analysis!inner(category, product)', { count: 'exact', head: true })
        .in('status', ['solved', 'closed'])
        .gte('solved_at', prevRange.start).lte('solved_at', prevRange.end);

      let qBacklog = supabase.from('tickets').select('id, ticket_analysis!inner(category, product)', { count: 'exact', head: true })
        .not('status', 'in', '("solved","closed")');

      // Note: !inner forces the join so we can filter by it, but if no analysis exists it might drop the row.
      // Since we just need it to not fail when filtering by category/product, we will conditionally use !inner vs !left
      const joinType = (category || product) ? '!inner' : '!left';
      
      const applyFiltersSafe = (query: any, tableName: string) => {
        if (client) query = query.eq('organization_name', client);
        if (group) query = query.eq('group_name', group);
        if (assignee) query = query.eq('assignee_name', assignee);
        if (priority) query = query.eq('priority', priority);
        if (category) query = query.eq(`ticket_analysis.category`, category);
        if (product) query = query.eq(`ticket_analysis.product`, product);
        return query;
      };

      qEntradas = applyFiltersSafe(supabase.from('tickets').select(`id, ticket_analysis${joinType}(category, product)`, { count: 'exact', head: true }).gte('created_at', currentRange.start).lte('created_at', currentRange.end), 'tickets');
      qEntradasPrev = applyFiltersSafe(supabase.from('tickets').select(`id, ticket_analysis${joinType}(category, product)`, { count: 'exact', head: true }).gte('created_at', prevRange.start).lte('created_at', prevRange.end), 'tickets');
      qResolvidos = applyFiltersSafe(supabase.from('tickets').select(`id, ticket_analysis${joinType}(category, product)`, { count: 'exact', head: true }).in('status', ['solved', 'closed']).gte('solved_at', currentRange.start).lte('solved_at', currentRange.end), 'tickets');
      qResolvidosPrev = applyFiltersSafe(supabase.from('tickets').select(`id, ticket_analysis${joinType}(category, product)`, { count: 'exact', head: true }).in('status', ['solved', 'closed']).gte('solved_at', prevRange.start).lte('solved_at', prevRange.end), 'tickets');
      qBacklog = applyFiltersSafe(supabase.from('tickets').select(`id, ticket_analysis${joinType}(category, product)`, { count: 'exact', head: true }).not('status', 'in', '("solved","closed")'), 'tickets');

      const [entradasRes, entradasPrevRes, resolvidosRes, resolvidosPrevRes, backlogRes] = await Promise.all([
        qEntradas, qEntradasPrev, qResolvidos, qResolvidosPrev, qBacklog
      ]);

      const entradas = entradasRes.count || 0;
      const entradasPrev = entradasPrevRes.count || 0;
      const resolvidos = resolvidosRes.count || 0;
      const resolvidosPrev = resolvidosPrevRes.count || 0;
      const backlog = backlogRes.count || 0;

      const saldo = entradas - resolvidos;
      
      // SLA
      let qSla = supabase.from('tickets').select(`id, created_at, solved_at, priority, ticket_analysis${joinType}(category, product)`)
        .in('status', ['solved', 'closed'])
        .gte('solved_at', currentRange.start).lte('solved_at', currentRange.end);
      qSla = applyFiltersSafe(qSla, 'tickets');
      
      const { data: slaTickets } = await qSla;
      
      let slaCumprido = 0;
      let slaVencido = 0;
      let totalResolutionTimeHours = 0;
      
      if (slaTickets) {
        slaTickets.forEach((t: any) => {
          if (!t.solved_at || !t.created_at) return;
          const created = new Date(t.created_at).getTime();
          const solved = new Date(t.solved_at).getTime();
          const hours = (solved - created) / (1000 * 60 * 60);
          totalResolutionTimeHours += hours;
          
          let limit = 24; 
          if (t.priority === 'low') limit = 48;
          else if (t.priority === 'normal') limit = 24;
          else if (t.priority === 'high') limit = 8;
          else if (t.priority === 'urgent') limit = 4;
          else if (t.priority === 'complex') limit = 120; // Alta complexidade (+5 dias)
          
          if (hours <= limit) slaCumprido++;
          else slaVencido++;
        });
      }
      
      const avgResolutionTime = slaTickets && slaTickets.length > 0 ? (totalResolutionTimeHours / slaTickets.length).toFixed(1) : '0.0';
      
      // Volumes by Dims
      let qAllCreated = supabase.from('tickets').select(`organization_name, priority, group_name, ticket_analysis${joinType}(category, product)`)
        .gte('created_at', currentRange.start).lte('created_at', currentRange.end);
      qAllCreated = applyFiltersSafe(qAllCreated, 'tickets');
      
      const { data: createdTickets } = await qAllCreated;
      
      const volumeByClient: Record<string, number> = {};
      const volumeByProduct: Record<string, number> = {};
      const volumeByCategory: Record<string, number> = {};
      const volumeByGroup: Record<string, number> = {};
      const volumeByPriority: Record<string, number> = {};

      if (createdTickets) {
        createdTickets.forEach((t: any) => {
          if (t.organization_name) volumeByClient[t.organization_name] = (volumeByClient[t.organization_name] || 0) + 1;
          if (t.group_name) volumeByGroup[t.group_name] = (volumeByGroup[t.group_name] || 0) + 1;
          
          let prio = t.priority || 'Não definida';
          if (prio === 'low') prio = 'Baixa';
          else if (prio === 'normal') prio = 'Normal';
          else if (prio === 'high') prio = 'Alta';
          else if (prio === 'urgent') prio = 'Urgente';
          else if (prio === 'complex') prio = 'Alta complexidade';
          volumeByPriority[prio] = (volumeByPriority[prio] || 0) + 1;
          
          if (t.ticket_analysis && t.ticket_analysis.length > 0) {
            const prod = t.ticket_analysis[0].product;
            const cat = t.ticket_analysis[0].category;
            if (prod) volumeByProduct[prod] = (volumeByProduct[prod] || 0) + 1;
            if (cat) volumeByCategory[cat] = (volumeByCategory[cat] || 0) + 1;
          }
        });
      }
      
      // Prev Volumes for trends
      let qAllPrevCreated = supabase.from('tickets').select(`organization_name, ticket_analysis${joinType}(category, product)`)
        .gte('created_at', prevRange.start).lte('created_at', prevRange.end);
      qAllPrevCreated = applyFiltersSafe(qAllPrevCreated, 'tickets');
      
      const { data: prevCreatedTickets } = await qAllPrevCreated;
      const prevVolumeByClient: Record<string, number> = {};
      const prevVolumeByProduct: Record<string, number> = {};
      const prevVolumeByCategory: Record<string, number> = {};
      
      if (prevCreatedTickets) {
        prevCreatedTickets.forEach((t: any) => {
          if (t.organization_name) prevVolumeByClient[t.organization_name] = (prevVolumeByClient[t.organization_name] || 0) + 1;
          if (t.ticket_analysis && t.ticket_analysis.length > 0) {
            const prod = t.ticket_analysis[0].product;
            const cat = t.ticket_analysis[0].category;
            if (prod) prevVolumeByProduct[prod] = (prevVolumeByProduct[prod] || 0) + 1;
            if (cat) prevVolumeByCategory[cat] = (prevVolumeByCategory[cat] || 0) + 1;
          }
        });
      }
      
      const calcGrowth = (current: Record<string, number>, prev: Record<string, number>) => {
        return Object.keys(current).map(key => {
          const currVal = current[key] || 0;
          const prevVal = prev[key] || 0;
          const growth = prevVal === 0 ? 100 : ((currVal - prevVal) / prevVal) * 100;
          return { name: key, current: currVal, prev: prevVal, growth };
        }).sort((a, b) => b.growth - a.growth).filter(x => x.current > 0);
      };
      
      const clientGrowth = calcGrowth(volumeByClient, prevVolumeByClient);
      const productGrowth = calcGrowth(volumeByProduct, prevVolumeByProduct);
      const categoryGrowth = calcGrowth(volumeByCategory, prevVolumeByCategory);
      
      // Evolution chart data
      let evolutionData = [];
      const diffDays = (new Date(currentRange.end).getTime() - new Date(currentRange.start).getTime()) / (1000 * 60 * 60 * 24);
      let bucketCount = diffDays <= 14 ? Math.ceil(diffDays) : 7;
      if (bucketCount < 1) bucketCount = 1;
      
      const bucketSize = (new Date(currentRange.end).getTime() - new Date(currentRange.start).getTime()) / bucketCount;
      
      let qEvolCreated = supabase.from('tickets').select('created_at').gte('created_at', currentRange.start).lte('created_at', currentRange.end);
      let qEvolSolved = supabase.from('tickets').select('solved_at').in('status', ['solved', 'closed']).gte('solved_at', currentRange.start).lte('solved_at', currentRange.end);
      
      const [evolC, evolS] = await Promise.all([qEvolCreated, qEvolSolved]);
      
      if (evolC.data && evolS.data) {
        for (let i = 0; i < bucketCount; i++) {
          const bStart = new Date(currentRange.start).getTime() + i * bucketSize;
          const bEnd = bStart + bucketSize;
          
          const inCount = evolC.data.filter(t => new Date(t.created_at).getTime() >= bStart && new Date(t.created_at).getTime() < bEnd).length;
          const outCount = evolS.data.filter(t => new Date(t.solved_at).getTime() >= bStart && new Date(t.solved_at).getTime() < bEnd).length;
          
          const dateLabel = new Date(bStart).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          evolutionData.push({
            date: dateLabel,
            entradas: inCount,
            saidas: outCount,
            saldo: inCount - outCount
          });
        }
      }

      res.json({
        success: true,
        summary: {
          entradas,
          entradasPrev,
          resolvidos,
          resolvidosPrev,
          backlog,
          saldo,
          avgResolutionTime,
          slaCumprido,
          slaVencido
        },
        distributions: {
          byClient: Object.entries(volumeByClient).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count),
          byProduct: Object.entries(volumeByProduct).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count),
          byCategory: Object.entries(volumeByCategory).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count),
          byGroup: Object.entries(volumeByGroup).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count),
          byPriority: Object.entries(volumeByPriority).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count)
        },
        trends: {
          client: clientGrowth.slice(0, 3),
          product: productGrowth.slice(0, 3),
          category: categoryGrowth.slice(0, 3)
        },
        evolution: evolutionData
      });

    } catch (err: any) {
      console.error('[Reports API] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
