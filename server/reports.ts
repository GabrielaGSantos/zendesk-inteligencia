import { Router } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { callGemini, callOpenAI } from './ai-analyzer';
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

      const joinType = (category || product) ? '!inner' : '!left';
      const applyFiltersSafe = (query) => {
        if (client) query = query.eq('organization_name', client);
        if (group) query = query.eq('group_name', group);
        if (assignee) query = query.eq('assignee_name', assignee);
        if (priority) query = query.eq('priority', priority);
        if (category) query = query.eq('ticket_analysis.category', category);
        if (product) query = query.eq('ticket_analysis.product', product);
        return query;
      };

      let qEntradas = applyFiltersSafe(supabase.from('tickets').select(`id, ticket_analysis${joinType}(category, product)`, { count: 'exact', head: true }).gte('created_at', currentRange.start).lte('created_at', currentRange.end));
      let qEntradasPrev = applyFiltersSafe(supabase.from('tickets').select(`id, ticket_analysis${joinType}(category, product)`, { count: 'exact', head: true }).gte('created_at', prevRange.start).lte('created_at', prevRange.end));
      let qResolvidos = applyFiltersSafe(supabase.from('tickets').select(`id, ticket_analysis${joinType}(category, product)`, { count: 'exact', head: true }).in('status', ['solved', 'closed']).gte('solved_at', currentRange.start).lte('solved_at', currentRange.end));
      let qResolvidosPrev = applyFiltersSafe(supabase.from('tickets').select(`id, ticket_analysis${joinType}(category, product)`, { count: 'exact', head: true }).in('status', ['solved', 'closed']).gte('solved_at', prevRange.start).lte('solved_at', prevRange.end));
      let qBacklog = applyFiltersSafe(supabase.from('tickets').select(`id, ticket_analysis${joinType}(category, product)`, { count: 'exact', head: true }).not('status', 'in', '("solved","closed")'));

      const [entradasRes, entradasPrevRes, resolvidosRes, resolvidosPrevRes, backlogRes] = await Promise.all([
        qEntradas, qEntradasPrev, qResolvidos, qResolvidosPrev, qBacklog
      ]);

      const entradas = entradasRes.count || 0;
      const entradasPrev = entradasPrevRes.count || 0;
      const resolvidos = resolvidosRes.count || 0;
      const resolvidosPrev = resolvidosPrevRes.count || 0;
      const backlog = backlogRes.count || 0;
      const saldo = entradas - resolvidos;
      const backlogPrev = backlog - saldo;

      // SLA
      let qSla = applyFiltersSafe(supabase.from('tickets').select(`id, created_at, solved_at, priority, ticket_analysis${joinType}(category, product)`).in('status', ['solved', 'closed']).gte('solved_at', currentRange.start).lte('solved_at', currentRange.end));
      const { data: slaTickets } = await qSla;
      
      let slaCumprido = 0; let slaVencido = 0; let totalResolutionTimeHours = 0;
      if (slaTickets) {
        slaTickets.forEach((t) => {
          if (!t.solved_at || !t.created_at) return;
          const hours = (new Date(t.solved_at).getTime() - new Date(t.created_at).getTime()) / 3600000;
          totalResolutionTimeHours += hours;
          let limit = 24;
          if (t.priority === 'low') limit = 48;
          else if (t.priority === 'high') limit = 8;
          else if (t.priority === 'urgent') limit = 4;
          else if (t.priority === 'complex') limit = 120;
          if (hours <= limit) slaCumprido++; else slaVencido++;
        });
      }
      const avgResolutionTime = slaTickets && slaTickets.length > 0 ? (totalResolutionTimeHours / slaTickets.length).toFixed(1) : '0.0';
      
      let qSlaPrev = applyFiltersSafe(supabase.from('tickets').select(`id, created_at, solved_at, priority, ticket_analysis${joinType}(category, product)`).in('status', ['solved', 'closed']).gte('solved_at', prevRange.start).lte('solved_at', prevRange.end));
      const { data: slaTicketsPrev } = await qSlaPrev;
      let totalResolutionTimeHoursPrev = 0;
      if (slaTicketsPrev) {
        slaTicketsPrev.forEach((t) => {
          if (!t.solved_at || !t.created_at) return;
          totalResolutionTimeHoursPrev += (new Date(t.solved_at).getTime() - new Date(t.created_at).getTime()) / 3600000;
        });
      }
      const avgResolutionTimePrev = slaTicketsPrev && slaTicketsPrev.length > 0 ? (totalResolutionTimeHoursPrev / slaTicketsPrev.length).toFixed(1) : '0.0';

      // Advanced Volumes
      let qAllCreated = applyFiltersSafe(supabase.from('tickets').select(`organization_name, priority, group_name, created_at, solved_at, status, ticket_analysis${joinType}(category, product, was_reopened)`).gte('created_at', currentRange.start).lte('created_at', currentRange.end));
      const { data: createdTickets } = await qAllCreated;
      
      let qAllActive = applyFiltersSafe(supabase.from('tickets').select(`organization_name, priority, group_name, created_at, solved_at, status, ticket_analysis${joinType}(category, product, was_reopened)`).or(`created_at.gte.${currentRange.start},solved_at.gte.${currentRange.start}`));
      const { data: activeTickets } = await qAllActive;
      
      const groupData = {};
      const clientData = {};
      const volumeByProduct = {};
      const volumeByCategory = {};

      if (activeTickets) {
        activeTickets.forEach((t) => {
          const isCreated = new Date(t.created_at).getTime() >= new Date(currentRange.start).getTime() && new Date(t.created_at).getTime() <= new Date(currentRange.end).getTime();
          const isSolved = t.status === 'solved' || t.status === 'closed' ? (new Date(t.solved_at).getTime() >= new Date(currentRange.start).getTime() && new Date(t.solved_at).getTime() <= new Date(currentRange.end).getTime()) : false;
          const isPending = t.status !== 'solved' && t.status !== 'closed';

          if (t.group_name) {
            if (!groupData[t.group_name]) groupData[t.group_name] = { entradas: 0, resolvidos: 0, pendentes: 0, totalHours: 0, solvedCount: 0 };
            if (isCreated) groupData[t.group_name].entradas++;
            if (isSolved) {
               groupData[t.group_name].resolvidos++;
               groupData[t.group_name].totalHours += (new Date(t.solved_at).getTime() - new Date(t.created_at).getTime()) / 3600000;
               groupData[t.group_name].solvedCount++;
            }
            if (isPending) groupData[t.group_name].pendentes++;
          }

          if (t.organization_name) {
            if (!clientData[t.organization_name]) clientData[t.organization_name] = { entradas: 0, reaberturas: 0, totalHours: 0, solvedCount: 0 };
            if (isCreated) clientData[t.organization_name].entradas++;
            if (t.ticket_analysis && t.ticket_analysis.length > 0 && t.ticket_analysis[0].was_reopened && isCreated) clientData[t.organization_name].reaberturas++;
            if (isSolved) {
              clientData[t.organization_name].totalHours += (new Date(t.solved_at).getTime() - new Date(t.created_at).getTime()) / 3600000;
              clientData[t.organization_name].solvedCount++;
            }
          }
          
          if (isCreated && t.ticket_analysis && t.ticket_analysis.length > 0) {
             const prod = t.ticket_analysis[0].product;
             const cat = t.ticket_analysis[0].category;
             if (prod) volumeByProduct[prod] = (volumeByProduct[prod] || 0) + 1;
             if (cat) volumeByCategory[cat] = (volumeByCategory[cat] || 0) + 1;
          }
        });
      }
      
      const groupStats = Object.keys(groupData).map(k => ({
        name: k,
        entradas: groupData[k].entradas,
        resolvidos: groupData[k].resolvidos,
        pendentes: groupData[k].pendentes,
        avgTime: groupData[k].solvedCount > 0 ? (groupData[k].totalHours / groupData[k].solvedCount).toFixed(1) : '-'
      })).sort((a,b) => b.entradas - a.entradas);

      const clientStats = Object.keys(clientData).map(k => ({
        name: k,
        entradas: clientData[k].entradas,
        reopenRate: clientData[k].entradas > 0 ? ((clientData[k].reaberturas / clientData[k].entradas) * 100).toFixed(0) : '0',
        avgTime: clientData[k].solvedCount > 0 ? (clientData[k].totalHours / clientData[k].solvedCount).toFixed(1) : '-'
      })).sort((a,b) => b.entradas - a.entradas);

      // Prev Volumes for trends
      let qAllPrevCreated = applyFiltersSafe(supabase.from('tickets').select(`organization_name, ticket_analysis${joinType}(category, product)`).gte('created_at', prevRange.start).lte('created_at', prevRange.end));
      const { data: prevCreatedTickets } = await qAllPrevCreated;
      const prevVolumeByProduct = {};
      const prevVolumeByCategory = {};
      
      if (prevCreatedTickets) {
        prevCreatedTickets.forEach((t) => {
          if (t.ticket_analysis && t.ticket_analysis.length > 0) {
            const prod = t.ticket_analysis[0].product;
            const cat = t.ticket_analysis[0].category;
            if (prod) prevVolumeByProduct[prod] = (prevVolumeByProduct[prod] || 0) + 1;
            if (cat) prevVolumeByCategory[cat] = (prevVolumeByCategory[cat] || 0) + 1;
          }
        });
      }
      
      const calcGrowth = (current, prev) => {
        return Object.keys(current).map(key => {
          const currVal = current[key] || 0;
          const prevVal = prev[key] || 0;
          const growth = prevVal === 0 ? 100 : ((currVal - prevVal) / prevVal) * 100;
          return { name: key, current: currVal, prev: prevVal, growth };
        }).sort((a, b) => b.growth - a.growth).filter(x => x.current > 0);
      };
      
      const productGrowth = calcGrowth(volumeByProduct, prevVolumeByProduct);
      const categoryGrowth = calcGrowth(volumeByCategory, prevVolumeByCategory);
      
      // Evolution chart data
      let evolutionData = [];
      const diffDays = (new Date(currentRange.end).getTime() - new Date(currentRange.start).getTime()) / 86400000;
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
          evolutionData.push({
            date: new Date(bStart).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
            entradas: inCount,
            resolvidos: outCount,
            saldo: inCount - outCount
          });
        }
      }

      const entradasGrowth = entradasPrev === 0 ? (entradas > 0 ? 100 : 0) : ((entradas - entradasPrev) / entradasPrev) * 100;
      const backlogGrowth = backlogPrev === 0 ? (backlog > 0 ? 100 : 0) : ((backlog - backlogPrev) / backlogPrev) * 100;

      // Geração de Insights Determinísticos
      const insights: string[] = [];
      
      // Volume e Backlog
      if (entradasGrowth > 0) {
        insights.push(`Entradas aumentaram ${entradasGrowth.toFixed(1)}% em relação ao período anterior.`);
      } else if (entradasGrowth < 0) {
        insights.push(`Volume de entradas caiu ${Math.abs(entradasGrowth).toFixed(1)}% em relação ao período anterior.`);
      }
      
      if (backlogGrowth > 5) {
        insights.push(`Atenção: Backlog aumentou ${backlogGrowth.toFixed(1)}% e requer monitoramento.`);
      } else if (backlogGrowth < -5) {
        insights.push(`Positivo: Backlog foi reduzido em ${Math.abs(backlogGrowth).toFixed(1)}%.`);
      }

      // Produto/Cliente
      if (productGrowth.length > 0 && productGrowth[0].growth > 20) {
        insights.push(`Produto "${productGrowth[0].name}" apresentou crescimento de ${productGrowth[0].growth.toFixed(0)}% nos chamados.`);
      }
      if (clientStats.length > 0 && clientStats[0].entradas > 5) {
        insights.push(`Cliente "${clientStats[0].name}" concentra a maior demanda do período.`);
      }
      
      // SLA
      if (slaVencido > 0) {
        const slaPct = ((slaVencido / (slaCumprido + slaVencido)) * 100);
        if (slaPct > 10) insights.push(`Alerta: ${slaPct.toFixed(1)}% dos tickets resolvidos romperam o SLA estabelecido.`);
      }
      
      if (insights.length === 0) {
        insights.push('A operação está estável, sem anomalias significativas de volume ou backlog.');
      }

      res.json({
        success: true,
        summary: {
          entradas, entradasPrev, resolvidos, resolvidosPrev, backlog, backlogPrev,
          saldo, avgResolutionTime, avgResolutionTimePrev, slaCumprido, slaVencido
        },
        distributions: {
          byProduct: Object.entries(volumeByProduct).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count),
          byCategory: Object.entries(volumeByCategory).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count),
          byClient: clientStats,
          byGroup: groupStats
        },
        trends: {
          product: productGrowth.slice(0, 3),
          category: categoryGrowth.slice(0, 3)
        },
        evolution: evolutionData,
        insights: insights
      });

    } catch (err: any) {
      console.error('[Reports API] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/reports/executive-summary', async (req, res) => {
    try {
      const { summaryData } = req.body;
      const { data: aiSettings } = await supabase.from('system_settings').select('*').eq('id', 1).single();
      const aiProvider = aiSettings?.ai_provider || 'gemini';
      const aiModel = aiSettings?.ai_model || 'gemini-2.5-flash-lite';

      const prompt = `Você é um diretor de operações. Analise os indicadores abaixo e forneça um Parecer Executivo profundo sobre a operação de suporte.
      DADOS OBTIDOS:
      ${JSON.stringify(summaryData, null, 2)}
      
      Não repita os números cegamente. Dê a sua opinião profissional e conselhos do que o gerente da área deve fazer. Ex: "A queda de SLA somada ao aumento em X produto sugere gargalo técnico. Mova especialistas para esta área."
      Escreva em 2 a 3 parágrafos curtos, diretos e profissionais. Sem saudações. Sem introduções. Não use formatação markdown além de negrito.`;

      let aiResponse;
      if (aiProvider === 'openai') {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) throw new Error('OpenAI key missing');
        aiResponse = await callOpenAI(openaiKey, prompt, aiModel);
      } else {
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) throw new Error('Gemini key missing');
        aiResponse = await callGemini(geminiKey, prompt, aiModel);
      }

      res.json({ success: true, text: aiResponse.text });
    } catch (err: any) {
      console.error('[Executive Summary AI] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
