import { Router } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { callGemini, callOpenAI } from './ai-analyzer';
import { startOfDay, endOfDay, subDays, addDays, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, isSaturday, isSunday, getDay, differenceInCalendarDays } from 'date-fns';
import * as crypto from 'crypto';


export function registerReportRoutes(supabase: SupabaseClient) {
  const router = Router();

  const applyBaseFilters = (query: any) => {
    return query.neq('status', 'deleted')
                .neq('status', 'suspended')
                .not('subject', 'ilike', '\\*\\*\\*SPAM%');
  };

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
      case 'esta_semana': {
        const start = startOfWeek(now, { weekStartsOn: 6 }); // Starts on Saturday
        return { start: startOfDay(start).toISOString(), end: endOfDay(now).toISOString() };
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
          const start = new Date(customStart + "T00:00:00");
          const end = new Date(customEnd + "T00:00:00");
          return { start: startOfDay(start).toISOString(), end: endOfDay(end).toISOString() };
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
      case 'esta_semana': {
        const startLastWeek = subWeeks(startOfWeek(now, { weekStartsOn: 6 }), 1);
        const endLastWeek = addDays(startLastWeek, 6); // Up to Friday
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
          const start = new Date(customStart + "T00:00:00");
          const end = new Date(customEnd + "T00:00:00");
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

  const getBusinessHours = (startStr: string, endStr: string): number => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (start >= end) return 0;
    let totalMs = 0;
    let current = new Date(start);
    while (current < end) {
      const day = current.getDay();
      const isWeekend = day === 0 || day === 6;
      const nextDay = new Date(current);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);
      const endOfDay = nextDay < end ? nextDay : end;
      if (!isWeekend) {
        const startWork = new Date(current);
        startWork.setHours(9, 0, 0, 0);
        const endWork = new Date(current);
        endWork.setHours(18, 0, 0, 0);
        const effectiveStart = current > startWork ? current : startWork;
        const effectiveEnd = endOfDay < endWork ? endOfDay : endWork;
        if (effectiveStart < effectiveEnd) {
          totalMs += effectiveEnd.getTime() - effectiveStart.getTime();
        }
      }
      current = nextDay;
    }
    return totalMs / 3600000;
  };

  const getMedian = (numbers: number[]): number => {
    if (!numbers || numbers.length === 0) return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
  };

  router.post('/api/reports/dashboard', async (req, res) => {
    try {
      const { period, customStart, customEnd, client, product, group, assignee, category, priority } = req.body;
      
      const currentRange = getDateRange(period, customStart, customEnd);
      const prevRange = getPreviousDateRange(period, customStart, customEnd);

      const joinType = (category || product) ? '!inner' : '!left';
      const applyFiltersSafe = (query: any) => {
        query = applyBaseFilters(query);
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
      let qAbertos = applyFiltersSafe(supabase.from('tickets').select(`id, ticket_analysis${joinType}(category, product)`, { count: 'exact', head: true }).in('status', ['new', 'open']));
      let qAbertosPrev = applyFiltersSafe(supabase.from('tickets').select(`id, ticket_analysis${joinType}(category, product)`, { count: 'exact', head: true }).in('status', ['new', 'open']));
      
      let qPendentes = applyFiltersSafe(supabase.from('tickets').select(`id, ticket_analysis${joinType}(category, product)`, { count: 'exact', head: true }).in('status', ['pending', 'hold']));
      let qPendentesPrev = applyFiltersSafe(supabase.from('tickets').select(`id, ticket_analysis${joinType}(category, product)`, { count: 'exact', head: true }).in('status', ['pending', 'hold']));

      let qBacklog = applyFiltersSafe(supabase.from('tickets').select(`id, ticket_analysis${joinType}(category, product)`, { count: 'exact', head: true }).in('status', ['new', 'open', 'pending', 'hold']));

      const [entradasRes, entradasPrevRes, resolvidosRes, resolvidosPrevRes, backlogRes, abertosRes, abertosPrevRes, pendentesRes, pendentesPrevRes] = await Promise.all([
        qEntradas, qEntradasPrev, qResolvidos, qResolvidosPrev, qBacklog, qAbertos, qAbertosPrev, qPendentes, qPendentesPrev
      ]);

      const entradas = entradasRes.count || 0;
      const entradasPrev = entradasPrevRes.count || 0;
      const resolvidos = resolvidosRes.count || 0;
      const resolvidosPrev = resolvidosPrevRes.count || 0;
      const backlog = backlogRes.count || 0;
      
      const abertos = abertosRes.count || 0;
      const abertosPrev = abertosPrevRes.count || 0;
      const pendentes = pendentesRes.count || 0;
      const pendentesPrev = pendentesPrevRes.count || 0;
      
      const saldo = entradas - resolvidos;
      const saldoPrev = entradasPrev - resolvidosPrev;
      const backlogPrev = backlog - saldo;

      // SLA
      let qSla = applyFiltersSafe(supabase.from('tickets').select(`id, created_at, solved_at, priority, ticket_analysis${joinType}(category, product)`).in('status', ['solved', 'closed']).gte('solved_at', currentRange.start).lte('solved_at', currentRange.end));
      const { data: slaTickets } = await qSla;
      
      let slaCumprido = 0; let slaVencido = 0;
      let resolutionTimesSla: number[] = [];
      if (slaTickets) {
        slaTickets.forEach((t) => {
          if (!t.solved_at || !t.created_at) return;
          const hours = getBusinessHours(t.created_at, t.solved_at);
          resolutionTimesSla.push(hours);
          let limit = 24;
          if (t.priority === 'low') limit = 48;
          else if (t.priority === 'high') limit = 8;
          else if (t.priority === 'urgent') limit = 4;
          else if (t.priority === 'complex') limit = 120;
          if (hours <= limit) slaCumprido++; else slaVencido++;
        });
      }
      const avgResolutionTime = getMedian(resolutionTimesSla).toFixed(1);
      
      let qSlaPrev = applyFiltersSafe(supabase.from('tickets').select(`id, created_at, solved_at, priority, ticket_analysis${joinType}(category, product)`).in('status', ['solved', 'closed']).gte('solved_at', prevRange.start).lte('solved_at', prevRange.end));
      const { data: slaTicketsPrev } = await qSlaPrev;
      let resolutionTimesSlaPrev: number[] = [];
      if (slaTicketsPrev) {
        slaTicketsPrev.forEach((t) => {
          if (!t.solved_at || !t.created_at) return;
          resolutionTimesSlaPrev.push(getBusinessHours(t.created_at, t.solved_at));
        });
      }
      const avgResolutionTimePrev = getMedian(resolutionTimesSlaPrev).toFixed(1);

      // Advanced Volumes
      let qAllCreated = applyFiltersSafe(supabase.from('tickets').select(`organization_name, priority, group_name, assignee_name, created_at, solved_at, status, ticket_analysis${joinType}(category, product, was_reopened)`).gte('created_at', currentRange.start).lte('created_at', currentRange.end));
      const { data: createdTickets } = await qAllCreated;
      
      let qAllActive = applyFiltersSafe(supabase.from('tickets').select(`organization_name, priority, group_name, assignee_name, created_at, solved_at, status, ticket_analysis${joinType}(category, product, was_reopened)`).or(`created_at.gte.${currentRange.start},solved_at.gte.${currentRange.start}`));
      const { data: activeTickets } = await qAllActive;
      
      const groupData = {};
      const agentData = {};
      const clientData = {};
      const volumeByProduct = {};
      const volumeByCategory = {};

      if (activeTickets) {
        activeTickets.forEach((t) => {
          const isCreated = new Date(t.created_at).getTime() >= new Date(currentRange.start).getTime() && new Date(t.created_at).getTime() <= new Date(currentRange.end).getTime();
          const isSolved = t.status === 'solved' || t.status === 'closed' ? (new Date(t.solved_at).getTime() >= new Date(currentRange.start).getTime() && new Date(t.solved_at).getTime() <= new Date(currentRange.end).getTime()) : false;
          const isPending = t.status !== 'solved' && t.status !== 'closed' && t.status !== 'deleted';

          const groupName = t.group_name && t.group_name.trim() !== '' ? t.group_name : 'Sem grupo definido';
          const assigneeName = t.assignee_name && t.assignee_name.trim() !== '' ? t.assignee_name : null;

          if (groupName) {
            if (!groupData[groupName]) groupData[groupName] = { entradas: 0, resolvidos: 0, pendentes: 0, resolutionTimes: [] };
            if (isCreated) groupData[groupName].entradas++;
            if (isSolved) {
               groupData[groupName].resolvidos++;
               groupData[groupName].resolutionTimes.push(getBusinessHours(t.created_at, t.solved_at));
            }
            if (isPending) groupData[groupName].pendentes++;
          }
          
          if (assigneeName) {
            if (!agentData[assigneeName]) agentData[assigneeName] = { entradas: 0, resolvidos: 0, pendentes: 0, resolutionTimes: [] };
            if (isCreated) agentData[assigneeName].entradas++;
            if (isSolved) {
               agentData[assigneeName].resolvidos++;
               agentData[assigneeName].resolutionTimes.push(getBusinessHours(t.created_at, t.solved_at));
            }
            if (isPending) agentData[assigneeName].pendentes++;
          }

          if (t.organization_name) {
            if (!clientData[t.organization_name]) clientData[t.organization_name] = { entradas: 0, reaberturas: 0, resolutionTimes: [] };
            if (isCreated) clientData[t.organization_name].entradas++;
            if (t.ticket_analysis && isCreated) {
              const analysisObj = Array.isArray(t.ticket_analysis) ? t.ticket_analysis[0] : t.ticket_analysis;
              if (analysisObj && analysisObj.was_reopened) {
                clientData[t.organization_name].reaberturas++;
              }
            }
            if (isSolved) {
              clientData[t.organization_name].resolutionTimes.push(getBusinessHours(t.created_at, t.solved_at));
            }
          }
          
          if (isCreated && t.ticket_analysis) {
             const analysisObj = Array.isArray(t.ticket_analysis) ? t.ticket_analysis[0] : t.ticket_analysis;
             if (analysisObj) {
               const prod = analysisObj.product;
               const cat = analysisObj.category;
               if (prod) volumeByProduct[prod] = (volumeByProduct[prod] || 0) + 1;
               if (cat) volumeByCategory[cat] = (volumeByCategory[cat] || 0) + 1;
             }
          }
        });
      }
      
      const groupStats = Object.keys(groupData).map(k => ({
        name: k,
        entradas: groupData[k].entradas,
        resolvidos: groupData[k].resolvidos,
        pendentes: groupData[k].pendentes,
        avgTime: groupData[k].resolutionTimes.length > 0 ? getMedian(groupData[k].resolutionTimes).toFixed(1) : '-'
      })).sort((a,b) => b.entradas - a.entradas);

      const agentStats = Object.keys(agentData).map(k => ({
        name: k,
        entradas: agentData[k].entradas,
        resolvidos: agentData[k].resolvidos,
        pendentes: agentData[k].pendentes,
        avgTime: agentData[k].resolutionTimes.length > 0 ? getMedian(agentData[k].resolutionTimes).toFixed(1) : '-'
      })).sort((a,b) => b.resolvidos - a.resolvidos);

      let internalDemand = null;
      const clientStats = Object.keys(clientData)
        .filter(k => {
          if (k === 'MPX Brasil') {
            internalDemand = {
              name: k,
              entradas: clientData[k].entradas,
              reopenRate: clientData[k].entradas > 0 ? ((clientData[k].reaberturas / clientData[k].entradas) * 100).toFixed(0) : '0',
              avgTime: clientData[k].resolutionTimes.length > 0 ? getMedian(clientData[k].resolutionTimes).toFixed(1) : '-'
            };
            return false;
          }
          return true;
        })
        .map(k => ({
          name: k,
          entradas: clientData[k].entradas,
          reopenRate: clientData[k].entradas > 0 ? ((clientData[k].reaberturas / clientData[k].entradas) * 100).toFixed(0) : '0',
          avgTime: clientData[k].resolutionTimes.length > 0 ? getMedian(clientData[k].resolutionTimes).toFixed(1) : '-'
        })).sort((a,b) => b.entradas - a.entradas);

      // Prev Volumes for trends
      let qAllPrevCreated = applyFiltersSafe(supabase.from('tickets').select(`organization_name, ticket_analysis${joinType}(category, product)`).gte('created_at', prevRange.start).lte('created_at', prevRange.end));
      const { data: prevCreatedTickets } = await qAllPrevCreated;
      const prevVolumeByProduct = {};
      const prevVolumeByCategory = {};
      
      if (prevCreatedTickets) {
        prevCreatedTickets.forEach((t) => {
          if (t.ticket_analysis) {
            const analysisObj = Array.isArray(t.ticket_analysis) ? t.ticket_analysis[0] : t.ticket_analysis;
            if (analysisObj) {
              const prod = analysisObj.product;
              const cat = analysisObj.category;
              if (prod) prevVolumeByProduct[prod] = (prevVolumeByProduct[prod] || 0) + 1;
              if (cat) prevVolumeByCategory[cat] = (prevVolumeByCategory[cat] || 0) + 1;
            }
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
      
      let qEvolCreated = applyFiltersSafe(supabase.from('tickets').select('created_at').gte('created_at', currentRange.start).lte('created_at', currentRange.end));
      let qEvolSolved = applyFiltersSafe(supabase.from('tickets').select('solved_at').in('status', ['solved', 'closed']).gte('solved_at', currentRange.start).lte('solved_at', currentRange.end));
      const [evolC, evolS] = await Promise.all([qEvolCreated, qEvolSolved]);
      
      if (evolC.data && evolS.data) {
        if (diffDays <= 14) {
          const dateMap = {};
          const startDt = new Date(currentRange.start);
          
          const getTargetDate = (dateObj: Date) => {
             const d = new Date(dateObj);
             if (d.getDay() === 6) d.setDate(d.getDate() + 2);
             else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
             return d;
          };

          for (let i = 0; i <= Math.ceil(diffDays); i++) {
            const d = new Date(startDt);
            d.setDate(d.getDate() + i);
            if (d.getTime() > new Date(currentRange.end).getTime()) continue;
            if (d.getDay() === 0 || d.getDay() === 6) continue; // Skip weekends in pre-fill
            
            const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            if (!dateMap[dateStr]) dateMap[dateStr] = { date: dateStr, entradas: 0, resolvidos: 0, saldo: 0, sortKey: d.getTime() };
          }

          const addTicketToDate = (dateObj: Date, type: 'entradas' | 'resolvidos') => {
             const targetD = getTargetDate(dateObj);
             const dateStr = targetD.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
             if (!dateMap[dateStr]) {
                 dateMap[dateStr] = { date: dateStr, entradas: 0, resolvidos: 0, saldo: 0, sortKey: targetD.getTime() };
             }
             dateMap[dateStr][type]++;
          };

          evolC.data.forEach(t => addTicketToDate(new Date(t.created_at), 'entradas'));
          evolS.data.forEach(t => addTicketToDate(new Date(t.solved_at), 'resolvidos'));
          
          evolutionData = Object.values(dateMap).sort((a: any, b: any) => a.sortKey - b.sortKey);
          evolutionData.forEach((v: any) => v.saldo = v.entradas - v.resolvidos);
        } else {
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

      // ─────────────────────────────────────────────────────────────
      // CARGA OPERACIONAL (WORKLOAD)
      // ─────────────────────────────────────────────────────────────
      const { data: workloadSettings } = await supabase.from('system_settings').select('workload_config').eq('id', 1).single();
      const workloadConfig = workloadSettings?.workload_config || {
        capacity: { total_hours_available: 320 },
        points: { "Crítico": 5, "Alto": 4, "Médio": 2, "Baixo": 1 },
        hours: { "Crítico": 8, "Alto": 12, "Médio": 4, "Baixo": 1 }
      };

      let dynamicCapacity = 0;
      try {
        const { data: agents } = await supabase.from('zendesk_agents').select('cargo');
        if (agents && agents.length > 0) {
          agents.forEach(a => {
            const cargo = (a.cargo || '').toLowerCase();
            if (cargo.includes('estagiário') || cargo.includes('estagiario') || cargo.includes('jovem aprendiz')) {
              dynamicCapacity += 100; // Carga reduzida
            } else if (!cargo.includes('gerente') && !cargo.includes('diretor') && !cargo.includes('ceo') && cargo.trim() !== '') {
              dynamicCapacity += 160; // Carga integral padrão (aprox 160h/mês)
            }
          });
        }
      } catch (e) {
        console.error("Erro ao calcular capacidade dinâmica", e);
      }
      
      const finalCapacity = dynamicCapacity > 0 ? dynamicCapacity : workloadConfig.capacity.total_hours_available;

      let qWorkload = applyFiltersSafe(supabase.from('tickets').select(`
        id, zendesk_id, status, assignee_name, group_name, created_at, updated_at,
        ticket_analysis (operational_effort, criticality, expected_completion_effort, effort_reason)
      `).not('status', 'in', '("solved","closed","deleted")'));
      
      const { data: workloadTickets } = await qWorkload;
      
      const mpxResponsibilityStatuses = ['new', 'open'];
      let workloadStats = {
        totalBacklog: 0,
        mpxResponsibility: 0,
        clientResponsibility: 0,
        totalPoints: 0,
        totalHours: 0,
        capacityConsumedPct: 0,
        availableCapacity: finalCapacity,
        aging: { '0-2_dias': 0, '3-5_dias': 0, '6-10_dias': 0, 'mais_de_10_dias': 0 },
        byEffort: {},
        byCriticality: {},
        byExpectedTime: {},
        byReason: {},
        byAssignee: [] as any[]
      };

      const assigneeMap = {};

      if (workloadTickets) {
        workloadStats.totalBacklog = workloadTickets.length;
        workloadTickets.forEach(t => {
          if (mpxResponsibilityStatuses.includes(t.status)) {
            workloadStats.mpxResponsibility++;
            
            // Envelhecimento (Aging)
            const ageDays = differenceInCalendarDays(new Date(), new Date(t.created_at));
            if (ageDays <= 2) workloadStats.aging['0-2_dias']++;
            else if (ageDays <= 5) workloadStats.aging['3-5_dias']++;
            else if (ageDays <= 10) workloadStats.aging['6-10_dias']++;
            else workloadStats.aging['mais_de_10_dias']++;

            // Extração da IA
            const analysis = Array.isArray(t.ticket_analysis) ? t.ticket_analysis[0] : t.ticket_analysis;
            if (analysis) {
              const effort = analysis.operational_effort || 'Não Classificado';
              const crit = analysis.criticality || 'Não Classificado';
              const expTime = analysis.expected_completion_effort || 'Não Classificado';
              const reason = analysis.effort_reason || 'Não Classificado';

              workloadStats.byEffort[effort] = (workloadStats.byEffort[effort] || 0) + 1;
              workloadStats.byCriticality[crit] = (workloadStats.byCriticality[crit] || 0) + 1;
              workloadStats.byExpectedTime[expTime] = (workloadStats.byExpectedTime[expTime] || 0) + 1;
              workloadStats.byReason[reason] = (workloadStats.byReason[reason] || 0) + 1;

              const pts = workloadConfig.points[effort] || 0;
              const hrs = workloadConfig.hours[effort] || 0;
              
              workloadStats.totalPoints += pts;
              workloadStats.totalHours += hrs;

              const assignee = t.assignee_name || 'Sem Responsável';
              if (!assigneeMap[assignee]) {
                assigneeMap[assignee] = { name: assignee, tickets: 0, points: 0, hours: 0 };
              }
              assigneeMap[assignee].tickets++;
              assigneeMap[assignee].points += pts;
              assigneeMap[assignee].hours += hrs;
            } else {
              workloadStats.byEffort['Não Classificado'] = (workloadStats.byEffort['Não Classificado'] || 0) + 1;
              workloadStats.byCriticality['Não Classificado'] = (workloadStats.byCriticality['Não Classificado'] || 0) + 1;
              workloadStats.byExpectedTime['Não Classificado'] = (workloadStats.byExpectedTime['Não Classificado'] || 0) + 1;
              workloadStats.byReason['Sem Análise'] = (workloadStats.byReason['Sem Análise'] || 0) + 1;
              
              const assignee = t.assignee_name || 'Sem Responsável';
              if (!assigneeMap[assignee]) {
                assigneeMap[assignee] = { name: assignee, tickets: 0, points: 0, hours: 0 };
              }
              assigneeMap[assignee].tickets++;
            }
          } else {
            workloadStats.clientResponsibility++;
          }
        });
      }

      workloadStats.byAssignee = Object.values(assigneeMap).sort((a: any, b: any) => b.points - a.points);
      
      workloadStats.capacityConsumedPct = workloadStats.availableCapacity > 0 
        ? Math.round((workloadStats.totalHours / workloadStats.availableCapacity) * 100) 
        : 0;

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
          abertos, abertosPrev, pendentes, pendentesPrev,
          saldo, saldoPrev, avgResolutionTime, avgResolutionTimePrev, slaCumprido, slaVencido
        },
        distributions: {
          byProduct: Object.entries(volumeByProduct).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count),
          byCategory: Object.entries(volumeByCategory).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count),
          byGroup: groupStats,
          byAgent: agentStats,
          byClient: clientStats,
          internalDemand
        },
        trends: {
          product: productGrowth.slice(0, 3),
          category: categoryGrowth.slice(0, 3)
        },
        evolution: evolutionData,
        workload: workloadStats,
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
        let qCreated = applyBaseFilters(supabase.from('tickets').select('id, group_name')).gte('created_at', m.start).lte('created_at', m.end);
        let qSolved = applyBaseFilters(supabase.from('tickets').select('id, solved_at, created_at, group_name')).in('status', ['solved', 'closed']).gte('solved_at', m.start).lte('solved_at', m.end);
        
        let qSla = supabase.from('ticket_analysis').select('category').gte('created_at', m.start).lte('created_at', m.end);

        const [resCreated, resSolved] = await Promise.all([qCreated, qSolved]);
        
        const entradas = resCreated.data?.length || 0;
        const resolvidos = resSolved.data?.length || 0;
        
        let resolutionTimes: number[] = [];
        if (resSolved.data) {
           resSolved.data.forEach(t => {
             resolutionTimes.push(getBusinessHours(t.created_at, t.solved_at));
           });
        }
        const avgTime = resolutionTimes.length > 0 ? getMedian(resolutionTimes).toFixed(1) : 0;

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

  // ─── Clients BI Endpoints ─────────────────────────────────────────

  router.get('/api/reports/clients-bi', async (req, res) => {
    try {
      const period = (req.query.period as string) || 'este_mes';
      const customStart = req.query.customStart as string | undefined;
      const customEnd = req.query.customEnd as string | undefined;
      const groupFilter = req.query.group as string | undefined;

      const currentRange = getDateRange(period, customStart, customEnd);

      let qAll = applyBaseFilters(supabase.from('tickets').select(`
        organization_name, 
        created_at, 
        solved_at, 
        status, 
        ticket_analysis(was_reopened, operational_effort, criticality, predicted_resolution_time_hours)
      `)).gte('created_at', currentRange.start).lte('created_at', currentRange.end);

      if (groupFilter) qAll = qAll.eq('group_name', groupFilter);

      const { data: currentTickets } = await qAll;
      
      const eightWeeksAgo = subWeeks(new Date(), 8);
      let qTrend = applyBaseFilters(supabase.from('tickets').select('organization_name, created_at')).gte('created_at', eightWeeksAgo.toISOString());
      if (groupFilter) qTrend = qTrend.eq('group_name', groupFilter);
      const { data: trendTickets } = await qTrend;

      const clientMap: Record<string, any> = {};

      if (currentTickets) {
         currentTickets.forEach(t => {
           if (!t.organization_name) return;
           const org = t.organization_name;
           if (!clientMap[org]) {
             clientMap[org] = {
               name: org,
               entradas: 0,
               resolvidos: 0,
               pendentes: 0,
               abertos: 0,
               reaberturas: 0,
               slaVencido: 0,
               slaCumprido: 0,
               pesoOperacional: 0,
               resolutionTimes: []
             };
           }
           clientMap[org].entradas++;
           if (['solved', 'closed'].includes(t.status)) {
             clientMap[org].resolvidos++;
             if (t.created_at && t.solved_at) {
               const hours = getBusinessHours(t.created_at, t.solved_at);
               clientMap[org].resolutionTimes.push(hours);
               // SLA mockup if no Zendesk SLA is present: if resolved in <= 48h business hours, it's cumprido.
               if (hours <= 48) clientMap[org].slaCumprido++; else clientMap[org].slaVencido++;
             }
           } else {
             clientMap[org].pendentes++;
           }

           if (t.ticket_analysis) {
             const analysisObj = Array.isArray(t.ticket_analysis) ? t.ticket_analysis[0] : t.ticket_analysis;
             if (analysisObj) {
               if (analysisObj.was_reopened) clientMap[org].reaberturas++;
               
               if (analysisObj.operational_effort === 'Crítico' || analysisObj.criticality === 'Crítico' || analysisObj.criticality === 'Alta') clientMap[org].pesoOperacional += 5;
               else if (analysisObj.operational_effort === 'Alto' || analysisObj.criticality === 'Média') clientMap[org].pesoOperacional += 3;
               else if (analysisObj.operational_effort === 'Médio') clientMap[org].pesoOperacional += 2;
               else clientMap[org].pesoOperacional += 1;
             }
           }
         });
      }

      const trendsMap: Record<string, number[]> = {};
      if (trendTickets) {
        trendTickets.forEach(t => {
          if (!t.organization_name) return;
          const org = t.organization_name;
          if (!trendsMap[org]) trendsMap[org] = [0,0,0,0,0,0,0,0];
          
          const createdTime = new Date(t.created_at).getTime();
          const weeksAgo = Math.floor((new Date().getTime() - createdTime) / (1000*60*60*24*7));
          if (weeksAgo >= 0 && weeksAgo < 8) {
             trendsMap[org][7 - weeksAgo]++; 
          }
        });
      }

      const clientsData = Object.values(clientMap).map(c => {
         const slaTotal = c.slaCumprido + c.slaVencido;
         const slaPct = slaTotal > 0 ? c.slaCumprido / slaTotal : 1;
         const reopenPct = c.entradas > 0 ? c.reaberturas / c.entradas : 0;
         const reopenScore = Math.max(0, 1 - (reopenPct * 2)); 
         const backlogPct = c.entradas > 0 ? c.pendentes / c.entradas : 0;
         const backlogScore = Math.max(0, 1 - backlogPct);
         const avgWeight = c.entradas > 0 ? c.pesoOperacional / c.entradas : 1;
         const weightScore = Math.max(0, 1 - ((avgWeight - 1) / 4)); 

         let scoreSla = slaPct * 35;
         let scoreReopen = reopenScore * 25;
         let scoreFila = backlogScore * 20;
         let scorePeso = weightScore * 20;
         
         const totalScore = Math.round(scoreSla + scoreReopen + scoreFila + scorePeso);

         const trend = trendsMap[c.name] || [0,0,0,0,0,0,0,0];
         let totalTrend = trend.reduce((a,b)=>a+b, 0);
         let avgTrend = totalTrend / 8;
         let variance = trend.reduce((a,b)=>a + Math.pow(b-avgTrend, 2), 0) / 8;
         let stdDev = Math.sqrt(variance);
         let stability = 'Estável';
         // Só calculamos instabilidade estatística se houver volume mínimo (ex: > 3 chamados em 8 semanas)
         // e se o desvio padrão for maior que 1 chamado.
         if (totalTrend > 3 && stdDev >= 1) {
           if (stdDev > avgTrend * 0.5) stability = 'Oscilando';
           if (stdDev > avgTrend) stability = 'Instável';
         }

         return {
           name: c.name,
           score: totalScore,
           scoreBreakdown: {
             sla: Math.round(scoreSla),
             reaberturas: Math.round(scoreReopen),
             backlog: Math.round(scoreFila),
             criticidade: Math.round(scorePeso)
           },
           estabilidade: stability,
           entradas: c.entradas,
           resolvidos: c.resolvidos,
           pendentes: c.pendentes,
           avgTime: c.resolutionTimes.length > 0 ? parseFloat(getMedian(c.resolutionTimes).toFixed(1)) : 0,
           slaPct: (slaPct * 100).toFixed(0),
           reaberturas: c.reaberturas,
           reopenRate: (reopenPct * 100).toFixed(0),
           trend
         };
      }).sort((a,b) => b.score - a.score);

      const alerts: any[] = [];
      const opportunities: any[] = [];
      clientsData.forEach(c => {
         if (c.scoreBreakdown.sla < 20) alerts.push({ client: c.name, type: 'sla', message: `SLA crítico (${c.slaPct}%)` });
         else if (c.scoreBreakdown.sla === 35 && c.entradas > 5) opportunities.push({ client: c.name, type: 'sla', message: `SLA perfeito no período` });

         if (c.estabilidade === 'Instável' && c.entradas > 5) alerts.push({ client: c.name, type: 'growth', message: `Alta variação no volume de tickets` });
         
         if (c.scoreBreakdown.reaberturas < 10 && c.entradas > 5) alerts.push({ client: c.name, type: 'reopen', message: `Taxa de reabertura altíssima (${c.reopenRate}%)` });
         else if (c.reopenRate === '0' && c.entradas > 10) opportunities.push({ client: c.name, type: 'reopen', message: `Nenhuma reabertura de chamado` });

         if (c.pendentes > c.resolvidos && c.entradas > 5) alerts.push({ client: c.name, type: 'backlog', message: `Fila acumulando (Pendentes > Resolvidos)` });
      });

      res.json({ success: true, clients: clientsData, alerts: alerts.slice(0, 15), opportunities: opportunities.slice(0, 15) });
    } catch (err: any) {
      console.error('[Clients BI Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/reports/client/:id', async (req, res) => {
    try {
      const orgName = decodeURIComponent(req.params.id);
      const period = (req.query.period as string) || 'este_mes';
      const customStart = req.query.customStart as string | undefined;
      const customEnd = req.query.customEnd as string | undefined;

      const currentRange = getDateRange(period, customStart, customEnd);
      
      // Global stats for portfolio comparison
      const { data: globalTickets } = await applyBaseFilters(supabase.from('tickets').select('created_at, solved_at, status, ticket_analysis(was_reopened)'))
        .gte('created_at', currentRange.start).lte('created_at', currentRange.end);
        
      let globalEntradas = 0;
      let globalReaberturas = 0;
      let globalSlaCumprido = 0;
      let globalSlaVencido = 0;
      let globalResolutionTimes: number[] = [];
      
      if (globalTickets) {
        globalTickets.forEach(t => {
          globalEntradas++;
          if (['solved', 'closed'].includes(t.status)) {
            if (t.created_at && t.solved_at) {
              const hours = getBusinessHours(t.created_at, t.solved_at);
              globalResolutionTimes.push(hours);
              if (hours <= 48) globalSlaCumprido++; else globalSlaVencido++;
            }
          }
          if (t.ticket_analysis) {
            const analysisObj = Array.isArray(t.ticket_analysis) ? t.ticket_analysis[0] : t.ticket_analysis;
            if (analysisObj?.was_reopened) globalReaberturas++;
          }
        });
      }
      
      const globalAvgTime = globalResolutionTimes.length > 0 ? parseFloat(getMedian(globalResolutionTimes).toFixed(1)) : 0;
      const globalSlaPct = (globalSlaCumprido + globalSlaVencido) > 0 ? (globalSlaCumprido / (globalSlaCumprido + globalSlaVencido)) * 100 : 100;
      const globalReopenRate = globalEntradas > 0 ? (globalReaberturas / globalEntradas) * 100 : 0;

      // Client Specific Stats
      const { data: clientTickets } = await applyBaseFilters(supabase.from('tickets').select(`
        created_at, solved_at, status, 
        ticket_analysis(product, category, was_reopened, operational_effort, criticality, expected_completion_effort, effort_reason)
      `)).eq('organization_name', orgName).gte('created_at', currentRange.start).lte('created_at', currentRange.end);

      let entradas = 0;
      let resolvidos = 0;
      let pendentes = 0;
      let reaberturas = 0;
      let slaCumprido = 0;
      let slaVencido = 0;
      let resolutionTimes: number[] = [];
      
      const byProduct: Record<string, number> = {};
      const byCategory: Record<string, number> = {};
      
      let devTickets = 0;
      let supportTickets = 0;
      let contentTickets = 0;
      let infraTickets = 0;

      if (clientTickets) {
        clientTickets.forEach(t => {
          entradas++;
          if (['solved', 'closed'].includes(t.status)) {
            resolvidos++;
            if (t.created_at && t.solved_at) {
              const hours = getBusinessHours(t.created_at, t.solved_at);
              resolutionTimes.push(hours);
              if (hours <= 48) slaCumprido++; else slaVencido++;
            }
          } else {
            pendentes++;
          }

          if (t.ticket_analysis) {
            const analysisObj = Array.isArray(t.ticket_analysis) ? t.ticket_analysis[0] : t.ticket_analysis;
            if (analysisObj) {
              if (analysisObj.was_reopened) reaberturas++;
              const prod = analysisObj.product;
              const cat = analysisObj.category;
              if (prod) byProduct[prod] = (byProduct[prod] || 0) + 1;
              if (cat) {
                 byCategory[cat] = (byCategory[cat] || 0) + 1;
                 const lcat = cat.toLowerCase();
                 if (lcat.includes('bug') || lcat.includes('nova funcionalidade') || lcat.includes('integração') || lcat.includes('melhoria')) devTickets++;
                 else if (lcat.includes('conteúdo') || lcat.includes('documento')) contentTickets++;
                 else if (lcat.includes('indisponibilidade') || lcat.includes('lentidão') || lcat.includes('ssl') || lcat.includes('hospedagem') || lcat.includes('dns')) infraTickets++;
                 else supportTickets++;
              }
            }
          }
        });
      }

      const clientAvgTime = resolutionTimes.length > 0 ? parseFloat(getMedian(resolutionTimes).toFixed(1)) : 0;
      const clientSlaPct = (slaCumprido + slaVencido) > 0 ? (slaCumprido / (slaCumprido + slaVencido)) * 100 : 100;
      const clientReopenRate = entradas > 0 ? (reaberturas / entradas) * 100 : 0;

      const topProducts = Object.entries(byProduct).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count);
      const topCategories = Object.entries(byCategory).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count);
      
      const dependencyProduct = topProducts.length > 0 ? topProducts[0] : null;
      const dependencyPct = (dependencyProduct && entradas > 0) ? (dependencyProduct.count / entradas) * 100 : 0;

      // Deterministic Insights Engine
      const insights = [];
      insights.push(`Nas últimas semanas, o cliente ${orgName} gerou ${entradas} chamados.`);
      
      if (dependencyPct > 50) {
        insights.push(`O crescimento operacional está altamente concentrado em "${dependencyProduct?.name}", responsável por ${dependencyPct.toFixed(0)}% das demandas.`);
      } else {
        insights.push(`A demanda está bem distribuída entre os produtos atendidos.`);
      }

      if (clientSlaPct >= globalSlaPct) {
        insights.push(`Apesar do volume, o SLA de ${clientSlaPct.toFixed(0)}% permanece positivo e acima da média da carteira.`);
      } else {
        insights.push(`Atenção: O SLA de ${clientSlaPct.toFixed(0)}% está abaixo da média da carteira, exigindo ação rápida.`);
      }
      
      if (devTickets > entradas * 0.4) {
        insights.push(`Existe uma forte tendência de chamados complexos focados em Desenvolvimento e Melhorias, indicando que o produto está passando por evoluções sob a perspectiva deste cliente.`);
      }

      // Recomendações
      const recommendations = [];
      if (dependencyPct > 50) recommendations.push(`Reduzir dependência do produto "${dependencyProduct?.name}" com treinamentos ou melhorias de UX.`);
      if (clientSlaPct < 90) recommendations.push(`Priorizar o atendimento da fila atual para recuperar o indicador de SLA.`);
      if (clientReopenRate > 5) recommendations.push(`Revisar a qualidade das entregas, pois a taxa de reabertura (${clientReopenRate.toFixed(1)}%) indica retrabalho.`);
      if (recommendations.length === 0) recommendations.push(`Cliente estável. Manter operação regular sem ações corretivas de urgência.`);

      res.json({
        success: true,
        clientName: orgName,
        metrics: {
          entradas,
          resolvidos,
          pendentes,
          avgTime: clientAvgTime,
          slaPct: clientSlaPct.toFixed(0),
          reopenRate: clientReopenRate.toFixed(1)
        },
        portfolio: {
          avgTime: globalAvgTime,
          slaPct: globalSlaPct.toFixed(0),
          reopenRate: globalReopenRate.toFixed(1)
        },
        radar: [
          { subject: 'Atendimento', A: supportTickets },
          { subject: 'Desenvolvimento', A: devTickets },
          { subject: 'Conteúdo', A: contentTickets },
          { subject: 'Infraestrutura', A: infraTickets }
        ],
        dependency: {
          product: dependencyProduct?.name,
          pct: dependencyPct
        },
        topProducts: topProducts.slice(0, 5),
        topCategories: topCategories.slice(0, 5),
        executiveSummary: insights.join(' '),
        recommendations
      });

    } catch (err: any) {
      console.error('[Client Profile Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/reports/client/:id/history', async (req, res) => {
    try {
      const orgName = decodeURIComponent(req.params.id);
      
      // We look back 8 weeks for history
      const start = subWeeks(new Date(), 8).toISOString();
      const { data: tickets } = await applyBaseFilters(supabase.from('tickets').select('created_at, ticket_analysis(criticality, operational_effort)'))
        .eq('organization_name', orgName).gte('created_at', start).order('created_at', { ascending: true });

      const events: any[] = [];
      if (tickets && tickets.length > 0) {
        let firstCritical = false;
        
        // Group by week
        const weeklyCounts: Record<string, number> = {};
        tickets.forEach(t => {
          const weekStr = startOfWeek(new Date(t.created_at)).toISOString();
          weeklyCounts[weekStr] = (weeklyCounts[weekStr] || 0) + 1;
          
          if (!firstCritical && t.ticket_analysis) {
            const an = Array.isArray(t.ticket_analysis) ? t.ticket_analysis[0] : t.ticket_analysis;
            if (an && (an.criticality === 'Crítico' || an.operational_effort === 'Crítico')) {
              events.push({ date: t.created_at, label: 'Primeiro ticket crítico reportado' });
              firstCritical = true;
            }
          }
        });
        
        let maxWeek = '';
        let maxCount = 0;
        Object.keys(weeklyCounts).forEach(w => {
           if (weeklyCounts[w] > maxCount) { maxCount = weeklyCounts[w]; maxWeek = w; }
        });
        if (maxCount > 5) {
          events.push({ date: maxWeek, label: `Maior pico de chamados no período (${maxCount} tickets)` });
        }
      }
      
      // Sort descending
      events.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      res.json({ success: true, events });
    } catch (err: any) {
      console.error('[Client History Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
