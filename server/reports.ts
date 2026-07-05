import { Router } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { callGemini, callOpenAI } from './ai-analyzer';
import { startOfDay, endOfDay, subDays, addDays, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, isSaturday, isSunday, getDay, differenceInCalendarDays } from 'date-fns';
import * as crypto from 'crypto';


export function registerReportRoutes(supabase: SupabaseClient) {
  const router = Router();

  function getAdjustedToday(date: Date): Date {
    let adj = date;
    if (isSaturday(adj)) adj = subDays(adj, 1);
    else if (isSunday(adj)) adj = subDays(adj, 2);
    return adj;
  }

  function getPreviousWorkday(date: Date): Date {
    let prev = subDays(date, 1);
    while (isSaturday(prev) || isSunday(prev)) {
      prev = subDays(prev, 1);
    }
    return prev;
  }

  function getDateRange(period: string, customStart?: string, customEnd?: string) {
    const now = new Date();
    const adjNow = getAdjustedToday(now);

    switch (period) {
      case 'hoje':
        return { start: startOfDay(adjNow).toISOString(), end: endOfDay(adjNow).toISOString() };
      case 'ontem': {
        const ontem = getPreviousWorkday(adjNow);
        return { start: startOfDay(ontem).toISOString(), end: endOfDay(ontem).toISOString() };
      }
      case 'ultimos_7_dias':
      case 'esta_semana': {
        const start = startOfWeek(adjNow, { weekStartsOn: 1 });
        return { start: startOfDay(start).toISOString(), end: endOfDay(adjNow).toISOString() };
      }
      case 'semana_passada': {
        const lastWeek = subWeeks(now, 1);
        const start = startOfWeek(lastWeek, { weekStartsOn: 1 });
        return { start: startOfDay(start).toISOString(), end: endOfDay(addDays(start, 4)).toISOString() };
      }
      case 'este_mes':
        return { start: startOfMonth(adjNow).toISOString(), end: endOfDay(adjNow).toISOString() };
      case 'mes_passado': {
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth).toISOString(), end: endOfMonth(lastMonth).toISOString() };
      }
      case 'personalizado':
        if (customStart && customEnd) {
          return { start: new Date(customStart).toISOString(), end: new Date(customEnd).toISOString() };
        }
        return { start: subDays(now, 30).toISOString(), end: endOfDay(now).toISOString() };
      default:
        return { start: subDays(now, 30).toISOString(), end: endOfDay(now).toISOString() };
    }
  }

  function getPreviousDateRange(period: string, customStart?: string, customEnd?: string) {
    const now = new Date();
    const adjNow = getAdjustedToday(now);

    switch (period) {
      case 'hoje': {
        const ontem = getPreviousWorkday(adjNow);
        return { start: startOfDay(ontem).toISOString(), end: endOfDay(ontem).toISOString() };
      }
      case 'ontem': {
        const ontem = getPreviousWorkday(adjNow);
        const anteontem = getPreviousWorkday(ontem);
        return { start: startOfDay(anteontem).toISOString(), end: endOfDay(anteontem).toISOString() };
      }
      case 'ultimos_7_dias':
      case 'esta_semana': {
        const startLastWeek = startOfWeek(subWeeks(adjNow, 1), { weekStartsOn: 1 });
        let dayOfWeek = getDay(adjNow);
        if (dayOfWeek === 0) dayOfWeek = 7;
        const offset = Math.min(dayOfWeek - 1, 4);
        const endLastWeek = addDays(startLastWeek, offset);
        return { start: startOfDay(startLastWeek).toISOString(), end: endOfDay(endLastWeek).toISOString() };
      }
      case 'semana_passada': {
        const twoWeeksAgo = subWeeks(now, 2);
        const start = startOfWeek(twoWeeksAgo, { weekStartsOn: 1 });
        const end = addDays(start, 4);
        return { start: startOfDay(start).toISOString(), end: endOfDay(end).toISOString() };
      }
      case 'este_mes': {
        const lastMonth = subMonths(adjNow, 1);
        const start = startOfMonth(lastMonth);
        const dayOfMonth = adjNow.getDate();
        let end = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), dayOfMonth);
        if (end.getMonth() !== lastMonth.getMonth()) {
          end = endOfMonth(lastMonth);
        }
        return { start: startOfDay(start).toISOString(), end: endOfDay(end).toISOString() };
      }
      case 'mes_passado': {
        const twoMonths = subMonths(now, 2);
        return { start: startOfMonth(twoMonths).toISOString(), end: endOfMonth(twoMonths).toISOString() };
      }
      case 'personalizado':
        if (customStart && customEnd) {
          const start = new Date(customStart);
          const end = new Date(customEnd);
          const diffInMs = end.getTime() - start.getTime();
          const prevEnd = subDays(start, 1);
          const prevStart = new Date(prevEnd.getTime() - diffInMs);
          return { start: startOfDay(prevStart).toISOString(), end: endOfDay(prevEnd).toISOString() };
        }
        return { start: subDays(now, 60).toISOString(), end: subDays(now, 30).toISOString() };
      default:
        return { start: subDays(now, 60).toISOString(), end: subDays(now, 30).toISOString() };
    }
  }

  function getPeriodLabels(period: string, currentStart: string, prevStart: string) {
    const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const prevDayName = dias[new Date(prevStart).getDay()];
    
    switch (period) {
      case 'hoje': {
        const isOneDayDiff = differenceInCalendarDays(new Date(currentStart), new Date(prevStart)) === 1;
        return { current: 'Hoje', reference: isOneDayDiff ? 'Ontem' : prevDayName };
      }
      case 'ontem': {
        const isOneDayDiff = differenceInCalendarDays(new Date(currentStart), new Date(prevStart)) === 1;
        return { current: 'Ontem', reference: isOneDayDiff ? 'Anteontem' : prevDayName };
      }
      case 'ultimos_7_dias':
      case 'esta_semana': return { current: 'Semana atual', reference: 'Semana anterior' };
      case 'semana_passada': return { current: 'Semana passada', reference: 'Semana retrasada' };
      case 'este_mes': return { current: 'Mês atual', reference: 'Mesmo período do mês anterior' };
      case 'mes_passado': return { current: 'Mês passado', reference: 'Mês retrasado' };
      case 'personalizado': return { current: 'Período selecionado', reference: 'Período imediatamente anterior' };
      default: return { current: 'Últimos 30 dias', reference: '30 dias anteriores' };
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
      const saldoPrev = entradasPrev - resolvidosPrev;
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

          const groupName = t.group_name && t.group_name.trim() !== '' ? t.group_name : 'Sem grupo definido';

          if (groupName) {
            if (!groupData[groupName]) groupData[groupName] = { entradas: 0, resolvidos: 0, pendentes: 0, totalHours: 0, solvedCount: 0 };
            if (isCreated) groupData[groupName].entradas++;
            if (isSolved) {
               groupData[groupName].resolvidos++;
               groupData[groupName].totalHours += (new Date(t.solved_at).getTime() - new Date(t.created_at).getTime()) / 3600000;
               groupData[groupName].solvedCount++;
            }
            if (isPending) groupData[groupName].pendentes++;
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

      let internalDemand = null;
      const clientStats = Object.keys(clientData)
        .filter(k => {
          if (k === 'MPX Brasil') {
            internalDemand = {
              name: k,
              entradas: clientData[k].entradas,
              reopenRate: clientData[k].entradas > 0 ? ((clientData[k].reaberturas / clientData[k].entradas) * 100).toFixed(0) : '0',
              avgTime: clientData[k].solvedCount > 0 ? (clientData[k].totalHours / clientData[k].solvedCount).toFixed(1) : '-'
            };
            return false;
          }
          return true;
        })
        .map(k => ({
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
        insights.push(`📈 Volume de entradas subiu ${entradasGrowth.toFixed(1)}% em relação ao período anterior.`);
      } else if (entradasGrowth < 0) {
        insights.push(`📉 Volume de entradas caiu ${Math.abs(entradasGrowth).toFixed(1)}% em relação ao período anterior.`);
      }
      
      if (backlogGrowth > 5) {
        insights.push(`🟡 Atenção: Os tickets em aberto aumentaram ${backlogGrowth.toFixed(1)}% e requerem monitoramento.`);
      } else if (backlogGrowth < -5) {
        insights.push(`🟢 Positivo: Os tickets em aberto foram reduzidos em ${Math.abs(backlogGrowth).toFixed(1)}%.`);
      }

      // Produto/Cliente
      if (productGrowth.length > 0 && productGrowth[0].growth > 20) {
        insights.push(`⚠ Produto "${productGrowth[0].name}" apresentou crescimento de ${productGrowth[0].growth.toFixed(0)}% nos chamados.`);
      }
      if (clientStats.length > 0 && clientStats[0].entradas > 5) {
        insights.push(`🏛 Cliente "${clientStats[0].name}" concentra a maior demanda do período.`);
      }
      
      // SLA
      if (slaVencido > 0) {
        const slaPct = ((slaVencido / (slaCumprido + slaVencido)) * 100);
        if (slaPct > 10) insights.push(`🔴 Alerta: ${slaPct.toFixed(1)}% dos tickets resolvidos romperam o SLA estabelecido.`);
      }
      
      if (insights.length === 0) {
        insights.push('🟢 A operação está estável, sem anomalias significativas de volume ou fila de tickets.');
      }

      const periodLabels = getPeriodLabels(period, currentRange.start, prevRange.start);

      res.json({
        success: true,
        comparison: {
          mode: period,
          current: {
            label: periodLabels.current,
            start: currentRange.start,
            end: currentRange.end
          },
          reference: {
            label: periodLabels.reference,
            start: prevRange.start,
            end: prevRange.end
          }
        },
        summary: {
          entradas, entradasPrev, resolvidos, resolvidosPrev, backlog, backlogPrev,
          saldo, saldoPrev, avgResolutionTime, avgResolutionTimePrev, slaCumprido, slaVencido
        },
        distributions: {
          byProduct: Object.entries(volumeByProduct).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count),
          byCategory: Object.entries(volumeByCategory).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count),
          byClient: clientStats,
          byGroup: groupStats,
          internalDemand
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

  router.get('/api/reports/executive-reports', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('executive_reports')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      res.json({ success: true, reports: data });
    } catch (err: any) {
      console.error('[Get Executive Reports Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/reports/executive-summary', async (req, res) => {
    try {
      const { summaryData } = req.body;
      const { data: aiSettings } = await supabase.from('system_settings').select('*').eq('id', 1).single();
      const aiProvider = aiSettings?.ai_provider || 'gemini';
      const aiModel = aiSettings?.ai_model || 'gemini-2.5-flash-lite';
      const providerStr = `${aiProvider} / ${aiModel}`;

      // Hash the payload
      const payloadString = JSON.stringify(summaryData);
      const hash = crypto.createHash('md5').update(payloadString).digest('hex');

      // Check cache (last 30 minutes)
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60000).toISOString();
      const { data: cachedReport } = await supabase
        .from('executive_reports')
        .select('report_text')
        .eq('metrics_hash', hash)
        .gte('created_at', thirtyMinsAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cachedReport) {
        return res.json({ success: true, text: cachedReport.report_text, cached: true });
      }

      const prompt = `Você é um diretor de operações focado em suporte técnico corporativo.
Analise os indicadores abaixo e forneça um Parecer Executivo profundo e qualitativo sobre a operação.

DADOS OBTIDOS:
${JSON.stringify(summaryData, null, 2)}

ATENÇÃO (CRÍTICO):
1. O objeto "demandasInternas" representa chamados internos da própria organização (ajustes de infraestrutura, rotinas, desenvolvimento). Trate-os como "Demanda Interna / Backoffice" e não como um cliente que está reclamando.
2. Apenas os clientes na lista "clientesTop" são clientes externos.
3. NÃO descreva ou repita os números que já estão visíveis na tela. Em vez disso, responda tacitamente: O que preocupa? O que mudou? Qual a tendência? O que merece atenção amanhã?
4. Seja analítico e aponte correlações (ex: aumento de entradas com queda de SLA, ou impacto de categorias específicas nos tickets em aberto).
5. OBRIGATÓRIO: Sua resposta final deve ser um objeto JSON válido. NENHUM texto fora do JSON. Não use bloco de código (marcador \`\`\`).

FORMATO OBRIGATÓRIO (JSON):
{
  "parecerExecutivo": [
    { "titulo": "Situação Geral", "corpo": "Texto focando no diagnóstico da operação..." },
    { "titulo": "Principais Riscos", "corpo": "Pontos de atenção, anomalias e gargalos identificados..." },
    { "titulo": "Prioridades", "corpo": "O que a gestão deve fazer hoje/amanhã com base nos dados..." }
  ]
}`;

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

      // Save to database
      await supabase.from('executive_reports').insert({
        period_filter: summaryData.periodo || 'Desconhecido',
        filters_applied: summaryData.filters || {},
        metrics_hash: hash,
        report_text: aiResponse.text,
        provider_model: providerStr,
        created_by: 'system' // Em cenário com Auth, injetar usuário logado
      });

      res.json({ success: true, text: aiResponse.text, cached: false });
    } catch (err: any) {
      console.error('[Executive Summary AI] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/reports/historical', async (req, res) => {
    try {
      const now = new Date();
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(now, i);
        months.push({
          start: startOfMonth(d).toISOString(),
          end: endOfMonth(d).toISOString(),
          label: d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
        });
      }

      const results = [];
      for (const m of months) {
        let qCreated = supabase.from('tickets').select('id, group_name').gte('created_at', m.start).lte('created_at', m.end);
        let qSolved = supabase.from('tickets').select('id, solved_at, created_at, group_name').in('status', ['solved', 'closed']).gte('solved_at', m.start).lte('solved_at', m.end);
        
        let qSla = supabase.from('ticket_analysis').select('category').gte('created_at', m.start).lte('created_at', m.end);

        const [resCreated, resSolved] = await Promise.all([qCreated, qSolved]);
        
        const entradas = resCreated.data?.length || 0;
        const resolvidos = resSolved.data?.length || 0;
        
        let totalHours = 0;
        if (resSolved.data) {
           resSolved.data.forEach(t => {
             totalHours += (new Date(t.solved_at).getTime() - new Date(t.created_at).getTime()) / 3600000;
           });
        }
        const avgTime = resolvidos > 0 ? (totalHours / resolvidos).toFixed(1) : 0;

        results.push({
          month: m.label,
          entradas,
          resolvidos,
          saldo: entradas - resolvidos,
          avgTime: parseFloat(avgTime.toString())
        });
      }

      res.json({ success: true, history: results });
    } catch (err: any) {
      console.error('[Historical Indicators Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
