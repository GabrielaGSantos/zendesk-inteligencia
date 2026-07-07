import { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ─────────────────────────────────────────────────────────────
// AI Analyzer — Google Gemini & OpenAI
// Analyzes tickets semantically and saves results in Supabase
// ─────────────────────────────────────────────────────────────

function applyDeterministicLogic(parsed: AnalysisResult, ticket: any, existingAnalysis?: any) {
  if (existingAnalysis && existingAnalysis.operational_effort) {
    parsed.operational_effort = existingAnalysis.operational_effort;
    parsed.criticality = existingAnalysis.criticality;
    parsed.expected_completion_effort = existingAnalysis.expected_completion_effort;
    parsed.effort_reason = existingAnalysis.effort_reason;
    return;
  }

  const cat = (parsed.category || '').toLowerCase();
  const type = (parsed.request_type || '').toLowerCase();
  const group = (ticket.group_name || '').toLowerCase();
  const subject = (ticket.subject || '').toLowerCase();
  const priority = (ticket.priority || '').toLowerCase();

  // 1. Criticidade
  if (priority === 'urgente' || subject.includes('fora do ar') || subject.includes('indisponível') || subject.includes('parou') || subject.includes('caiu')) {
    parsed.criticality = 'Crítica';
    if (!parsed.effort_reason) parsed.effort_reason = 'Correção crítica';
    if (!parsed.expected_completion_effort) parsed.expected_completion_effort = 'Mesmo dia';
  } else if (priority === 'alta' || cat.includes('incidente') || cat.includes('segurança')) {
    if (!parsed.criticality) parsed.criticality = 'Alta';
  } else if (priority === 'baixa') {
    if (!parsed.criticality) parsed.criticality = 'Baixa';
  } else {
    if (!parsed.criticality) parsed.criticality = 'Normal';
  }

  // 2. Esforço e Motivo
  if (cat.includes('nova funcionalidade') || type.includes('desenvolvimento') || group.includes('desenvolvimento')) {
    if (!parsed.operational_effort) parsed.operational_effort = 'Alto';
    if (!parsed.effort_reason) parsed.effort_reason = 'Desenvolvimento';
    if (!parsed.expected_completion_effort) parsed.expected_completion_effort = 'Mais de 5 dias úteis';
  } else if (cat.includes('conteúdo') || cat.includes('cadastro') || cat.includes('senha') || cat.includes('acesso')) {
    if (!parsed.operational_effort) parsed.operational_effort = 'Baixo';
    if (!parsed.effort_reason) parsed.effort_reason = 'Outro';
    if (!parsed.expected_completion_effort) parsed.expected_completion_effort = 'Mesmo dia';
  } else if (cat.includes('integração') || cat.includes('api')) {
    if (!parsed.operational_effort) parsed.operational_effort = 'Alto';
    if (!parsed.effort_reason) parsed.effort_reason = 'Integração';
  } else if (group.includes('infraestrutura') || cat.includes('servidor') || cat.includes('banco de dados')) {
    if (!parsed.operational_effort) parsed.operational_effort = 'Médio';
    if (!parsed.effort_reason) parsed.effort_reason = 'Infraestrutura';
  }
}

interface AnalysisProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  phase: string;
  ticketsAnalyzed: number;
  ticketsTotal: number;
  errorMessage?: string;
}

let analysisProgress: AnalysisProgress = {
  status: 'idle',
  phase: '',
  ticketsAnalyzed: 0,
  ticketsTotal: 0,
};

let isAnalysisPaused = false;

export function pauseAnalysis() {
  if (analysisProgress.status === 'running') {
    isAnalysisPaused = true;
    analysisProgress.phase = 'Pausando análise...';
  }
}

export function getAnalysisStatus(): AnalysisProgress {
  return { ...analysisProgress };
}

interface TicketForAnalysis {
  zendesk_id: number;
  subject: string;
  description: string;
  status: string;
  priority: string;
  requester_name: string;
  organization_name: string;
  assignee_name: string;
  group_name: string;
  tags: string;
  custom_fields: string;
  created_at: string;
  comments: Array<{
    author_name: string;
    body: string;
    is_public: boolean | number;
    created_at: string;
  }>;
}

interface AnalysisResult {
  product: string;
  request_type: string;
  category: string;
  client_intent: string;
  problem_summary: string;
  identified_pattern: string;
  suggested_response: string;
  missing_info: string;
  recommended_procedure: string;
  suggested_priority: string;
  confidence_level: number;
  pattern_group: string;
  needs_internal_routing: string;
  solution_applied: string;
  new_learned_rule?: string | null;
  applied_rules?: string[];
  rule_particularities?: string | null;
  recommended_expert?: string | null;
  expert_reasoning?: string | null;
  predicted_resolution_time_hours?: number | null;
  operational_effort?: string | null;
  criticality?: string | null;
  expected_completion_effort?: string | null;
  effort_reason?: string | null;
}

export interface AIResponse {
  text: string;
  usage: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export async function callGemini(apiKey: string, prompt: string, model: string = 'gemini-2.5-flash'): Promise<AIResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
  };

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const text = await response.text();
        console.error(`Gemini API Response: ${response.status} - ${text}`);
        if (response.status === 429 || text.includes('RESOURCE_EXHAUSTED')) {
           throw new Error('RATE_LIMIT');
        }
        throw new Error(`Gemini API error ${response.status}: ${text}`);
      }

      const data = await response.json();
      const usage = {
        prompt: data.usageMetadata?.promptTokenCount || 0,
        completion: data.usageMetadata?.candidatesTokenCount || 0,
        total: data.usageMetadata?.totalTokenCount || 0
      };
      if (data.usageMetadata) {
        console.log(`[Tokens] Prompt: ${usage.prompt} | Resposta: ${usage.completion} | Total: ${usage.total}`);
      }
      return {
        text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
        usage
      };
    } catch (err: any) {
      lastError = err;
      if (err.message === 'RATE_LIMIT') {
        console.warn(`[Gemini] Quota Excedida / Rate Limit no attempt ${attempt}. Aguardando 30s antes de tentar novamente...`);
        if (attempt >= 3) throw err;
        await new Promise(resolve => setTimeout(resolve, 30000));
      } else {
        console.warn(`[Gemini] Attempt ${attempt} failed: ${err.message}. Retrying in 3s...`);
        if (attempt >= 3) throw err;
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
  throw lastError;
}

export async function callOpenAI(apiKey: string, prompt: string, model: string = 'gpt-4o-mini'): Promise<AIResponse> {
  const openai = new OpenAI({ apiKey });
  let lastError;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: model,
        temperature: 0.3,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente especialista em suporte ao cliente. Responda apenas com o JSON válido e exato solicitado nas instruções.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      });
      
      const usage = {
        prompt: response.usage?.prompt_tokens || 0,
        completion: response.usage?.completion_tokens || 0,
        total: response.usage?.total_tokens || 0
      };
      
      if (response.usage) {
        console.log(`[Tokens OpenAI] Prompt: ${usage.prompt} | Resposta: ${usage.completion} | Total: ${usage.total}`);
      }
      
      return {
        text: response.choices[0]?.message?.content || '',
        usage
      };
    } catch (err: any) {
      lastError = err;
      const isRateLimit = err.status === 429 || err.message?.includes('429') || err.message?.includes('rate_limit');
      
      if (isRateLimit) {
        console.warn(`[OpenAI] Rate Limit no attempt ${attempt}. Aguardando 30s antes de tentar novamente...`);
        if (attempt >= 3) throw new Error('RATE_LIMIT');
        await new Promise(resolve => setTimeout(resolve, 30000));
      } else {
        console.warn(`[OpenAI] Attempt ${attempt} failed: ${err.message}. Retrying in 3s...`);
        if (attempt >= 3) throw err;
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
  throw lastError;
}

export interface SimilarTicketContext {
  zendesk_id: number;
  subject: string;
  solution_comment: string;
  category?: string;
  product?: string;
  request_type?: string;
  recommended_procedure?: string;
  is_manually_corrected?: boolean;
}

async function findSimilarResolvedTickets(supabase: SupabaseClient, subject: string, excludeId: number): Promise<SimilarTicketContext[]> {
  try {
    const { data: similarTickets, error } = await supabase.rpc('find_similar_resolved_tickets_v2', {
      search_query: subject,
      current_ticket_id: excludeId
    });

    if (error) {
      console.error('Error calling RPC find_similar_resolved_tickets_v2:', error);
      return [];
    }

    return (similarTickets || []).map((st: any) => ({
      zendesk_id: st.zendesk_id,
      subject: st.subject,
      solution_comment: st.solution_comment,
      category: st.category,
      product: st.product,
      request_type: st.request_type,
      recommended_procedure: st.recommended_procedure,
      is_manually_corrected: st.is_manually_corrected
    }));
  } catch (err) {
    console.error('Error finding similar tickets:', err);
    return [];
  }
}

async function fetchActiveRules(supabase: SupabaseClient): Promise<any[]> {
  const { data } = await supabase.from('knowledge_rules').select('*').eq('is_active', true);
  return data || [];
}

async function fetchTaxonomy(supabase: SupabaseClient): Promise<{products: string[], categories: string[], activePatterns: string[]}> {
  try {
    const { data: pData } = await supabase.from('catalog_products').select('name').eq('is_active', true);
    const { data: cData } = await supabase.from('catalog_categories').select('name').eq('is_active', true);
    // Busca os padrões ativos
    const { data: patData } = await supabase.from('pattern_groups').select('name').eq('status', 'active');
    
    return {
      products: pData ? pData.map(p => p.name) : [],
      categories: cData ? cData.map(c => c.name) : [],
      activePatterns: patData ? patData.map(p => p.name) : []
    };
  } catch(e) {
    return { products: [], categories: [], activePatterns: [] };
  }
}

async function fetchAgentExpertise(supabase: SupabaseClient): Promise<any[]> {
  try {
    const { data: ranking } = await supabase.from('agent_expertise_ranking')
      .select('*')
      .order('tickets_resolved', { ascending: false });
    const { data: agents } = await supabase.from('zendesk_agents').select('id, cargo');
    
    if (!ranking) return [];
    
    return ranking.map(r => {
      const agent = agents?.find(a => a.id === r.assignee_id);
      return {
        ...r,
        cargo: agent?.cargo || 'Não especificado'
      };
    });
  } catch (err) {
    console.error('Error fetching agent expertise:', err);
    return [];
  }
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

function buildAnalysisPrompt(
  ticket: TicketForAnalysis, 
  similarTickets?: SimilarTicketContext[], 
  knowledgeRules?: any[],
  agentExpertise?: any[],
  existingAnalysis?: any,
  taxonomy?: {products: string[], categories: string[]},
  activePatterns?: string[]
): string {
  // 1. Filtragem de Comentários (Otimização)
  const allComments = ticket.comments || [];
  let selectedComments = new Set<any>();
  
  if (allComments.length > 0) {
    // Últimos 5 comentários
    allComments.slice(-5).forEach(c => selectedComments.add(c));
    // Último comentário público
    const lastPublic = [...allComments].reverse().find(c => c.is_public);
    if (lastPublic) selectedComments.add(lastPublic);
    // Último comentário do cliente (que geralmente é o requester_name)
    const lastClient = [...allComments].reverse().find(c => c.author_name === ticket.requester_name);
    if (lastClient) selectedComments.add(lastClient);
  }

  const finalComments = Array.from(selectedComments).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const commentsText = finalComments
    .map(c => {
      const visibility = c.is_public ? 'Público' : 'Interno';
      return `[${visibility}] ${c.author_name} (${c.created_at}):\n${c.body}`;
    })
    .join('\n\n---\n\n');

  let tags: string[];
  try {
    tags = JSON.parse(ticket.tags || '[]');
  } catch {
    tags = [];
  }

  // 2. Histórico de Casos Similares (Otimização)
  let similarContextText = '';
  let filteredSimilar = (similarTickets || []).slice(0, 5); // Max 5
  if (filteredSimilar.length > 0) {
    similarContextText = `
## Histórico de Casos Similares Resolvidos pela Equipe
Abaixo estão exemplos de como a nossa equipe resolveu tickets parecidos no passado. **Use esses exemplos para guiar o seu "suggested_response" e entender os procedimentos internos (recommended_procedure).** Tente imitar o tom, as palavras e as soluções dadas nestes exemplos.

IMPORTANTE: Se algum exemplo abaixo estiver marcado com "[CORRIGIDO MANUALMENTE PELA COORDENAÇÃO]", isso significa que um humano revisou a classificação da IA e definiu o GABARITO OFICIAL. Você DEVE seguir a mesma Categoria, Produto e Procedimento Recomendado deste gabarito para este novo ticket se os assuntos forem idênticos.

${filteredSimilar.map((st, i) => {
  let sol = st.solution_comment || '';
  if (sol.length > 300) sol = sol.substring(0, 300) + '...';
  return `--- Exemplo ${i + 1} ---\nTicket ID: ${st.zendesk_id}\nAssunto Original: ${st.subject}\n${st.is_manually_corrected ? '⚠️ [CORRIGIDO MANUALMENTE PELA COORDENAÇÃO - GABARITO OFICIAL]\n' : ''}Categoria Histórica: ${st.category || 'N/A'}\nProduto Histórico: ${st.product || 'N/A'}\nProcedimento Recomendado Histórico: ${st.recommended_procedure || 'N/A'}\nResposta Final da Equipe (Resumida): ${sol}`
}).join('\n\n')}
`;
  }

  // 3. Base de Conhecimento e Regras (Otimização)
  let knowledgeText = '';
  let filteredRules = knowledgeRules || [];
  
  if (filteredRules.length > 0) {
    const ticketKeywords = (ticket.subject + " " + ticket.description).toLowerCase();
    filteredRules = filteredRules.filter(r => {
      const titleLower = r.title.toLowerCase();
      const catLower = r.category.toLowerCase();
      
      const isCritical = r.priority?.toLowerCase() === 'urgente' || 
                         titleLower.includes('lgpd') || titleLower.includes('ofício') || 
                         titleLower.includes('mpx') || titleLower.includes('renan') ||
                         catLower.includes('atendimento') || catLower.includes('segurança') ||
                         catLower.includes('lgpd') || catLower.includes('escalonamento') ||
                         catLower.includes('ofício') || catLower.includes('mpx') ||
                         catLower.includes('resposta padrão');
      
      if (isCritical) return true;
      
      // If we have fewer than 30 rules total, just include all of them so the AI has context.
      if (knowledgeRules.length <= 30) return true;

      // Otherwise do basic semantic match
      const ruleKeywords = catLower.split(' ').filter((w: string) => w.length > 4);
      return ruleKeywords.some((w: string) => ticketKeywords.includes(w));
    });

    knowledgeText = `
## Base de Conhecimento e Regras de Ouro
Abaixo estão regras estritas e procedimentos internos que você DEVE seguir ao analisar o ticket e sugerir a resposta ou o procedimento. Em caso de conflito, dê preferência às regras de maior Prioridade.

${filteredRules.map((kr, i) => `--- Regra ID: ${kr.id} ---
Tópico: ${kr.title}
Categoria: ${kr.category}
Prioridade: ${kr.priority}
Descricao da Regra: ${kr.description}
${kr.examples_data && kr.examples_data.length > 0 ? `\nCasos Práticos (Exemplos Curtos):\n${kr.examples_data.map((ex: any, idx: number) => `  [Exemplo ${idx+1}] Assunto: ${ex.subject}\n  Categoria: ${ex.category}\n  Solução: ${ex.solution}`).join('\n\n')}` : ''}`).join('\n\n')}
`;
  }

  let manualCorrectionText = '';
  if (existingAnalysis && existingAnalysis.is_manually_corrected) {
    manualCorrectionText = `
## ⚠️ ATENÇÃO: GABARITO MANUAL APLICADO
Este ticket já foi revisado por um humano (Coordenador) que aplicou correções manuais em alguns campos. 
Você DEVE OBRIGATORIAMENTE manter os exatos valores abaixo no seu JSON de saída para esses campos, e adaptar a sua reavaliação (suggested_response, problem_summary, missing_info, etc) para fazer sentido com as correções feitas pelo humano.

IMPORTANTE: NUNCA mencione na sua justificativa (expert_reasoning, problem_summary, etc) que esses campos foram definidos por um "humano", "coordenador" ou "gabarito manual". Aja e justifique as escolhas de forma técnica e natural, como se fosse VOCÊ (a IA) que tivesse deduzido esses valores perfeitamente!

Campos já definidos pelo humano que você NÃO PODE alterar:
- category: "${existingAnalysis.category || ''}"
- product: "${existingAnalysis.product || ''}"
- request_type: "${existingAnalysis.request_type || ''}"
- recommended_procedure: "${existingAnalysis.recommended_procedure || ''}"
- recommended_expert: "${existingAnalysis.recommended_expert || ''}"
- suggested_response: "${existingAnalysis.suggested_response || ''}"
- needs_internal_routing: "${existingAnalysis.needs_internal_routing || ''}"
`;
  }

  let operationalLockText = '';
  if (existingAnalysis && existingAnalysis.operational_effort) {
    operationalLockText = `
## 🔒 DADOS OPERACIONAIS JÁ DEFINIDOS (ONE-SHOT)
Este ticket já teve sua Carga Operacional calculada anteriormente. Para não corromper o dashboard histórico e manter estabilidade métrica, você DEVE OBRIGATORIAMENTE REPETIR os exatos valores abaixo no seu JSON final para os seguintes campos, SEM QUESTIONAR:
- operational_effort: "${existingAnalysis.operational_effort}"
- criticality: "${existingAnalysis.criticality}"
- expected_completion_effort: "${existingAnalysis.expected_completion_effort}"
- effort_reason: "${existingAnalysis.effort_reason}"
`;
  }

  let agentText = '';
  let filteredAgents: any[] = [];
  let discardedAgents: any[] = [];
  if (agentExpertise && agentExpertise.length > 0) {
    const ticketKeywords = (ticket.subject + " " + ticket.description).toLowerCase();
    agentExpertise.forEach(agent => {
      if (filteredAgents.length < 5 && (ticketKeywords.includes(agent.category.toLowerCase()) || filteredAgents.length < 2)) {
        filteredAgents.push(agent);
      } else {
        discardedAgents.push(agent);
      }
    });

    if (filteredAgents.length > 0) {
      agentText = `
## Base de Especialistas (Histórico Real de Atendimento)
Aqui está o ranking atual dos agentes que mais resolveram tickets, agrupado por categoria.
Baseie a sua recomendação EXCLUSIVAMENTE nesta lista para sugerir o especialista mais adequado.
Justifique a sua escolha citando as métricas apresentadas abaixo (quantidade, taxa de resolução, tempo médio, etc).

${filteredAgents.map(e => `- Agente: ${e.assignee_name} (${e.cargo}) | Categoria: ${e.category} | Resolvidos: ${e.tickets_resolved} | Taxa de Resolução: ${Number(e.resolution_rate).toFixed(1)}% | Tempo Médio: ${Number(e.avg_resolution_time).toFixed(1)}h | Reaberturas: ${Number(e.reopen_rate).toFixed(1)}%`).join('\n')}
`;
    }
  }

  let promptBody = `Você é um analista de suporte técnico especializado. Analise o ticket de atendimento abaixo e forneça uma classificação detalhada.

## Dados do Ticket

**Assunto:** ${ticket.subject}
**Status:** ${ticket.status}
**Prioridade atual:** ${ticket.priority || 'Não definida'}
**Solicitante:** ${ticket.requester_name}
**Organização:** ${ticket.organization_name || 'Não informada'}
**Responsável:** ${ticket.assignee_name || 'Não atribuído'}
**Grupo:** ${ticket.group_name || 'Não definido'}
**Tags:** ${tags.join(', ') || 'Nenhuma'}
**Data de criação:** ${ticket.created_at}

## Descrição / Primeira Mensagem do Cliente
${ticket.description || 'Sem descrição'}

## Histórico de Comentários
${commentsText || 'Sem comentários'}

${manualCorrectionText}
${operationalLockText}
${similarContextText}
${knowledgeText}
${agentText}
---

## Instruções de Análise

Com base em TODAS as informações acima (assunto, descrição, comentários públicos, comentários internos, tags, grupo, organização, status e histórico), identifique:

1. **product**: O produto ou sistema principal relacionado ao ticket.
   VOCÊ DEVE ESCOLHER EXCLUSIVAMENTE DA SEGUINTE LISTA OFICIAL:
   ${taxonomy?.products && taxonomy.products.length > 0 ? taxonomy.products.map(p => `- "${p}"`).join('\n   ') : 'Nenhuma lista fornecida, deduza com cautela.'}
   Se nenhum se encaixar perfeitamente, classifique no que for mais provável ou use "Outros". NÃO INVENTE nomes novos.
2. **request_type**: O tipo de solicitação (ex: "Bug Report", "Alteração de Conteúdo", "Criação de Usuário", "Dúvida", "Melhoria", "Configuração", etc.)
3. **category**: A categoria técnica ESPECÍFICA do trabalho executado.
   VOCÊ DEVE ESCOLHER EXCLUSIVAMENTE DA SEGUINTE LISTA OFICIAL:
   ${taxonomy?.categories && taxonomy.categories.length > 0 ? taxonomy.categories.map(c => `- "${c}"`).join('\n   ') : 'Nenhuma lista fornecida, deduza com cautela.'}
   NUNCA crie plural, singular ou variações de nomenclatura. NUNCA crie categoria contendo o nome do produto (ex: errado: "Gestão de Conteúdo do Site", certo: Produto "Site", Categoria "Gestão de Conteúdo"). IMPORTANTE: Se o ticket envolver mais de uma área, retorne TODAS as categorias aplicáveis da lista separadas por " | ". Ex: "Gestão de Conteúdo | Configuração".
4. **client_intent**: O que o cliente realmente quer/precisa em uma frase curta
5. **problem_summary**: Resumo claro do problema em 1-2 frases
6. **detailed_requirements**: Liste detalhadamente e minuciosamente TODOS os requisitos, solicitações e detalhes técnicos que o cliente mencionou nas mensagens dele. Use bullet points se necessário. Este campo serve para que o programador/especialista saiba EXATAMENTE tudo o que precisa ser feito sem precisar ler o ticket original inteiro.
7. **identified_pattern**: Nome do padrão operacional que este ticket representa (ex: "Erro Portal Transparência - Licitações", "Reset de Senha - Portal", etc.)
8. **suggested_response**: Uma resposta padrão profissional e empática que poderia ser enviada ao cliente. IMPORTANTE: Se houver "Histórico de Casos Similares" ou "Regras de Base de Conhecimento" abaixo, você DEVE seguir as diretrizes delas para escrever a resposta. NUNCA adicione sua própria assinatura, pois o Zendesk assina automaticamente.
9. **missing_info**: Informações que ainda precisam ser solicitadas ao cliente para resolver o problema (ex: "URL do erro, navegador utilizado, print da tela")
10. **recommended_procedure**: Procedimento interno recomendado para a equipe resolver o ticket. Se houver casos similares, baseie-se neles.
11. **suggested_priority**: Prioridade sugerida (urgente, alta, normal, baixa)
12. **confidence_level**: Seu nível de confiança nesta análise de 0.0 a 1.0
13. **pattern_group**: O nome do padrão de problema ao qual este ticket pertence.
    VOCÊ DEVE TENTAR ENCAIXÁ-LO EM UM DESTES PADRÕES ATIVOS:
    ${activePatterns && activePatterns.length > 0 ? activePatterns.map(p => `- "${p}"`).join('\n    ') : 'Nenhum padrão existente.'}
    REGRA VITAL: Só crie um nome novo se o problema for uma anomalia sistêmica clara (ex: sistema inteiro caiu). Caso contrário, e se não encaixar perfeitamente em nenhum padrão da lista, retorne estritamente null. NUNCA crie padrões com 1 ou 2 tickets apenas.
14. **needs_internal_routing**: Se precisa de trâmite interno, indicar qual equipe ou pessoa (ex: "Equipe de Desenvolvimento", "Equipe de Infraestrutura", "Nenhum")
15. **solution_applied**: Se o ticket já foi resolvido baseado nos comentários, descreva brevemente a solução aplicada. Se não, escreva "Pendente".
16. **new_learned_rule**: Se você perceber, lendo os comentários da equipe de suporte, que eles utilizaram um procedimento interno ou regra padrão que não existe na "Base de Conhecimento", extraia e formule essa nova regra de forma clara. IMPORTANTE: Antes de criar uma nova regra, leia atentamente todas as regras da "Base de Conhecimento" já existentes. Se a regra que você pensou já existir (mesmo que com outras palavras) ou for muito similar a uma existente, NÃO a crie. Só retorne uma regra se ela for genuinamente inédita. Caso contrário, retorne null.
17. **applied_rules**: Uma lista (array de strings) com os Títulos das regras da Base de Conhecimento que você efetivamente utilizou para tomar sua decisão neste ticket. Se nenhuma regra for utilizada, retorne um array vazio [].
18. **recommended_expert**: O nome exato dos **DOIS** agentes mais recomendados (1º e 2º), com base na tabela de Especialistas. IMPORTANTE: Este campo é EXCLUSIVO para o executor técnico que vai colocar a mão na massa e resolver o problema. Se a Base de Conhecimento disser que uma pessoa (ex: Chefe/Diretor) deve apenas 'aprovar' a demanda, ELA NÃO DEVE APARECER AQUI. Ignore aprovadores para este campo e indique-os apenas em 'needs_internal_routing'. Ex: "1º Bruno | 2º Gabriela". Se não houver dados, retorne null.
19. **expert_reasoning**: Justificativa detalhada citando os indicadores numéricos (taxa, tempo, etc) que te levaram a escolher esses dois especialistas.
20. **rule_particularities**: Se o ticket utiliza uma regra existente mas apresenta uma particularidade, exceção ou nuance importante observada nos comentários, descreva-a de forma sucinta aqui. Se não houver particularidade, retorne null.
21. **predicted_resolution_time_hours**: Estimativa numérica (em horas) de quanto tempo este ticket levará para ser resolvido (da abertura até a solução), considerando a complexidade e casos similares. Ex: 2.5 (2 horas e meia), 48 (2 dias). Se não tiver como prever, retorne null.
22. **operational_effort**: Mensure o esforço ESPECÍFICO até a conclusão final da demanda (incluindo desenvolvimento, homologação, acompanhamento, etc) e não apenas a execução de uma configuração. Opções OBRIGATÓRIAS: "Crítico" (Risco alto/Parada), "Alto" (Dev grande/investigação extensa), "Médio" (Análise/implementação moderada), ou "Baixo" (Ajuste simples/Tarefa rápida).
23. **criticality**: O grau de impacto no negócio do cliente, INDEPENDENTE do esforço. Um ticket pode ser "Crítica" (ex: site fora do ar) mas levar apenas 5 min (Esforço "Baixo"). Opções OBRIGATÓRIAS: "Crítica", "Alta", "Normal", "Baixa".
24. **expected_completion_effort**: Uma janela de esforço estimado para a conclusão. ISSO NÃO É SLA DE CONTRATO. Opções OBRIGATÓRIAS: "Mesmo dia", "Até 2 dias úteis", "Até 5 dias úteis", "Mais de 5 dias úteis".
25. **effort_reason**: A raiz do porquê esse ticket demanda esse esforço. Opções OBRIGATÓRIAS: "Desenvolvimento", "Investigação", "Dependência externa", "Correção crítica", "Homologação", "Infraestrutura", "Integração", ou "Outro".

Responda APENAS com um JSON válido contendo exatamente esses campos. Não inclua explicações extras.`;

  // ──────────────────────────────────────────────────────
  // TRUNCAMENTO DE EMERGÊNCIA
  // ──────────────────────────────────────────────────────
  let totalTokens = estimateTokens(promptBody);
  
  if (totalTokens > 10000) {
    const limitBody = (text: string, maxLen: number) => text.length > maxLen ? text.substring(0, maxLen) + '\n[...truncado por limite de tokens...]' : text;
    // ALWAYS truncate comments and description FIRST to preserve rules and context
    if (estimateTokens(promptBody) > 10000) promptBody = promptBody.replace(commentsText, limitBody(commentsText, 2000));
    if (estimateTokens(promptBody) > 10000) promptBody = promptBody.replace(ticket.description || '', limitBody(ticket.description || '', 2000));
    
    // Then truncate similar cases if still too large
    if (estimateTokens(promptBody) > 10000) promptBody = promptBody.replace(similarContextText, limitBody(similarContextText, 1000));
    
    // As a very last resort, truncate knowledge rules
    if (estimateTokens(promptBody) > 10000) promptBody = promptBody.replace(knowledgeText, limitBody(knowledgeText, 3000));
    
    totalTokens = estimateTokens(promptBody);
  }

  // ──────────────────────────────────────────────────────
  // DIAGNÓSTICO EXATO — CONTABILIZAÇÃO SEÇÃO POR SEÇÃO
  // ──────────────────────────────────────────────────────
  
  // Definir cada seção exata do prompt montado
  const systemPromptText = `Você é um analista de suporte técnico especializado. Analise o ticket de atendimento abaixo e forneça uma classificação detalhada.`;
  
  const ticketMetadataText = `## Dados do Ticket\n\n**Assunto:** ${ticket.subject}\n**Status:** ${ticket.status}\n**Prioridade atual:** ${ticket.priority || 'Não definida'}\n**Solicitante:** ${ticket.requester_name}\n**Organização:** ${ticket.organization_name || 'Não informada'}\n**Responsável:** ${ticket.assignee_name || 'Não atribuído'}\n**Grupo:** ${ticket.group_name || 'Não definido'}\n**Tags:** ${tags.join(', ') || 'Nenhuma'}\n**Data de criação:** ${ticket.created_at}`;
  
  const descriptionText = `## Descrição / Primeira Mensagem do Cliente\n${ticket.description || 'Sem descrição'}`;
  
  const commentsSection = `## Histórico de Comentários\n${commentsText || 'Sem comentários'}`;
  
  const instructionsText = promptBody.substring(promptBody.indexOf('## Instruções de Análise'));
  
  // Seções completas com suas medições
  const sections: { name: string; chars: number; tokens: number }[] = [
    { name: 'System Prompt', chars: systemPromptText.length, tokens: estimateTokens(systemPromptText) },
    { name: 'Metadados do Ticket', chars: ticketMetadataText.length, tokens: estimateTokens(ticketMetadataText) },
    { name: 'Descrição Original', chars: (ticket.description || '').length, tokens: estimateTokens(ticket.description || '') },
    { name: 'Comentários', chars: commentsText.length, tokens: estimateTokens(commentsText) },
    { name: 'Correção Manual', chars: manualCorrectionText.length, tokens: estimateTokens(manualCorrectionText) },
    { name: 'Tickets Semelhantes', chars: similarContextText.length, tokens: estimateTokens(similarContextText) },
    { name: 'Base de Conhecimento', chars: knowledgeText.length, tokens: estimateTokens(knowledgeText) },
    { name: 'Especialistas', chars: agentText.length, tokens: estimateTokens(agentText) },
    { name: 'Instruções + JSON Schema', chars: instructionsText.length, tokens: estimateTokens(instructionsText) },
  ];
  
  const totalEstimado = estimateTokens(promptBody);
  const somaSecoes = sections.reduce((sum, s) => sum + s.tokens, 0);
  
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  DIAGNÓSTICO EXATO — Ticket #${ticket.zendesk_id}`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  
  console.log('───── SEÇÕES DO PROMPT ─────\n');
  sections.forEach(s => {
    if (s.chars === 0) return;
    const pct = totalEstimado > 0 ? ((s.tokens / totalEstimado) * 100).toFixed(1) : '0.0';
    console.log(`${s.name}`);
    console.log(`  Caracteres: ${s.chars.toLocaleString()}`);
    console.log(`  Tokens:     ~${s.tokens.toLocaleString()}`);
    console.log(`  % Prompt:   ${pct}%`);
    console.log('');
  });
  
  console.log('───── COMENTÁRIOS INDIVIDUAIS ─────\n');
  finalComments.forEach((c, idx) => {
    const visibility = c.is_public ? 'Público' : 'Interno';
    const commentStr = `[${visibility}] ${c.author_name} (${c.created_at}):\n${c.body}`;
    const cTokens = estimateTokens(commentStr);
    const cChars = commentStr.length;
    
    // Detectar lixo
    const warnings: string[] = [];
    if (/<[a-z][\s\S]*>/i.test(c.body)) warnings.push('HTML bruto');
    if (/data:image\/[a-z]+;base64/i.test(c.body)) warnings.push('Base64 imagem');
    if (/[-_]{10,}/.test(c.body) || /^(--\s*$|Enviado|De:|From:|Sent:|Em\s+\d)/m.test(c.body)) warnings.push('Assinatura/Citação');
    if (/<style[\s\S]*?<\/style>/i.test(c.body)) warnings.push('CSS inline');
    if (c.body.length > 3000) warnings.push('Comentário longo (>3k chars)');
    
    console.log(`Comentário ${idx + 1} (${visibility}) — ${c.author_name}`);
    console.log(`  Chars: ${cChars.toLocaleString()} | Tokens: ~${cTokens}`);
    if (warnings.length > 0) console.log(`  ⚠️  ALERTA: ${warnings.join(', ')}`);
    console.log('');
  });
  
  console.log('───── VERIFICAÇÃO DE DUPLICIDADES ─────\n');
  // Verificar descrição duplicada nos comentários
  const descInComments = commentsText.includes(ticket.description?.substring(0, 100) || '___NOMATCH___');
  if (descInComments && ticket.description && ticket.description.length > 50) {
    console.log('⚠️  DUPLICIDADE: Descrição original aparece dentro dos comentários');
  }
  // Verificar comentários duplicados
  const commentBodies = finalComments.map(c => c.body.substring(0, 200));
  const dupes = commentBodies.filter((item, index) => commentBodies.indexOf(item) !== index);
  if (dupes.length > 0) {
    console.log(`⚠️  DUPLICIDADE: ${dupes.length} comentário(s) duplicado(s) detectado(s)`);
  }
  // Verificar regras duplicadas
  const ruleNames = filteredRules.map(r => r.title);
  const dupeRules = ruleNames.filter((item, index) => ruleNames.indexOf(item) !== index);
  if (dupeRules.length > 0) {
    console.log(`⚠️  DUPLICIDADE: Regras duplicadas: ${dupeRules.join(', ')}`);
  }
  // Verificar tickets semelhantes duplicados
  const simIds = (similarTickets || []).slice(0, 5).map(s => s.zendesk_id);
  const dupeSimIds = simIds.filter((item, index) => simIds.indexOf(item) !== index);
  if (dupeSimIds.length > 0) {
    console.log(`⚠️  DUPLICIDADE: Tickets semelhantes duplicados: ${dupeSimIds.join(', ')}`);
  }
  if (!descInComments && dupes.length === 0 && dupeRules.length === 0 && dupeSimIds.length === 0) {
    console.log('✅ Nenhuma duplicidade detectada.');
  }
  
  console.log('\n───── RESUMO FINAL ─────\n');
  console.log(`Soma das seções:     ~${somaSecoes.toLocaleString()} tokens`);
  console.log(`Prompt completo:     ~${totalEstimado.toLocaleString()} tokens`);
  console.log(`Diferença (overhead): ~${Math.abs(totalEstimado - somaSecoes).toLocaleString()} tokens`);
  console.log(`Caracteres totais:    ${promptBody.length.toLocaleString()}`);
  console.log('');

  // ──── KNOWLEDGE BASE (Regras avaliadas) ────
  console.log('───── REGRAS AVALIADAS ─────\n');
  (knowledgeRules || []).forEach(r => {
    const titleLower = r.title.toLowerCase();
    const catLower = r.category.toLowerCase();
    const isCritical = r.priority?.toLowerCase() === 'urgente' || 
                       titleLower.includes('lgpd') || titleLower.includes('ofício') || 
                       titleLower.includes('mpx') || titleLower.includes('renan') ||
                       catLower.includes('atendimento') || catLower.includes('segurança') ||
                       catLower.includes('lgpd') || catLower.includes('escalonamento') ||
                       catLower.includes('ofício') || catLower.includes('mpx') ||
                       catLower.includes('resposta padrão');
    
    let isSent = false;
    let reason = '';
    
    if (isCritical) {
      isSent = true;
      reason = 'Regra crítica fixa';
    } else {
      const ticketKeywords = (ticket.subject + " " + ticket.description).toLowerCase();
      const ruleKeywords = catLower.split(' ').filter((w: string) => w.length > 4);
      if (ruleKeywords.some((w: string) => ticketKeywords.includes(w))) {
        isSent = true;
        reason = 'Categoria relacionada semanticamente';
      } else if ((knowledgeRules || []).length <= 15) {
        isSent = true;
        reason = 'Base pequena (Forçado)';
      } else {
        reason = 'Sem relação com o ticket';
      }
    }
    
    console.log(`${isSent ? '✅' : '❌'} ${r.title} — ${reason}${isSent ? ' (~' + estimateTokens(r.description || '') + ' tokens)' : ''}`);
  });

  // ──── ESPECIALISTAS ────
  console.log('\n───── ESPECIALISTAS ─────\n');
  filteredAgents.forEach(a => {
    console.log(`✅ ${a.assignee_name} (${a.category}) — Top 5`);
  });
  discardedAgents.slice(0, 3).forEach(a => {
    console.log(`❌ ${a.assignee_name} — Descartado`);
  });
  if (discardedAgents.length > 3) console.log(`   ... e mais ${discardedAgents.length - 3} descartados.`);

  // ──── TICKETS SEMELHANTES ────
  console.log('\n───── TICKETS SEMELHANTES ─────\n');
  (similarTickets || []).forEach((st, i) => {
    if (i < 5) {
      console.log(`✅ #${st.zendesk_id} — ~${estimateTokens(st.solution_comment || '')} tokens`);
    } else {
      console.log(`❌ #${st.zendesk_id} — Descartado (fora do top 5)`);
    }
  });

  console.log(`\nTotal enviados: ${allComments.length} total, ${finalComments.length} enviados, ${allComments.length - finalComments.length} descartados`);
  
  // ──── MODO DEBUG: Salvar prompt completo ────
  if (process.env.DEBUG_PROMPT === 'true') {
    const fs = require('fs');
    const debugPath = `/tmp/prompt_debug_${ticket.zendesk_id}_${Date.now()}.txt`;
    try {
      fs.writeFileSync(debugPath, promptBody, 'utf8');
      console.log(`\n🔍 DEBUG: Prompt completo salvo em ${debugPath}`);
    } catch (e) {
      console.log('\n🔍 DEBUG: Não foi possível salvar o prompt (verifique permissões de escrita).');
    }
  }
  
  console.log('\n══════════════════════════════════════════════════════════\n');

  return promptBody;
}

export async function startAnalysis(apiKey: string, supabase: SupabaseClient): Promise<void> {
  if (analysisProgress.status === 'running') {
    throw new Error('Análise já em andamento');
  }

  isAnalysisPaused = false;
  
  analysisProgress = {
    status: 'running',
    phase: 'Identificando tickets para análise...',
    ticketsAnalyzed: 0,
    ticketsTotal: 0,
  };

  try {
    let globalSuccessCount = 0;
    let batchInputTokens = 0;
    let batchOutputTokens = 0;
    let batchApiCalls = 0;
    let batchCost = 0;
    let batchErrors = 0;
    let keepRunning = true;
    let initialCountSet = false;
    const failedTicketIds = new Set<number>();

    while (keepRunning) {
      if (isAnalysisPaused) {
        analysisProgress.status = 'idle';
        analysisProgress.phase = `Análise pausada pelo usuário. ${globalSuccessCount} tickets analisados nesta sessão.`;
        return;
      }

      let allTickets: any[] = [];
      let page = 0;
      let hasMore = true;
      while (hasMore) {
        const { data: ticketsData, error: ticketsError } = await supabase
          .from('tickets')
          .select('*, ticket_analysis(id, operational_effort)')
          .order('created_at', { ascending: false })
          .range(page * 1000, (page + 1) * 1000 - 1);
          
        if (ticketsError) throw ticketsError;
        
        if (!ticketsData || ticketsData.length === 0) {
          hasMore = false;
        } else {
          allTickets = allTickets.concat(ticketsData);
          page++;
        }
      }

      const unanalyzedTickets = allTickets.filter(t => {
        const ta = Array.isArray(t.ticket_analysis) ? t.ticket_analysis[0] : t.ticket_analysis;
        return (!ta || !ta.operational_effort) && !failedTicketIds.has(t.zendesk_id);
      });

      if (!initialCountSet) {
        analysisProgress.ticketsTotal = unanalyzedTickets.length;
        initialCountSet = true;
      } else {
        analysisProgress.ticketsTotal += unanalyzedTickets.length;
      }

      analysisProgress.phase = `${unanalyzedTickets.length} tickets pendentes no lote atual...`;

      if (unanalyzedTickets.length === 0) {
        analysisProgress.status = 'completed';
        analysisProgress.phase = `Análise totalmente concluída! ${globalSuccessCount} tickets processados nesta sessão.`;
        keepRunning = false;
        break;
      }

      const knowledgeRules = await fetchActiveRules(supabase);
      const agentExpertise = await fetchAgentExpertise(supabase);
      const taxonomy = await fetchTaxonomy(supabase);

      const { data: settings } = await supabase.from('system_settings').select('*').eq('id', 1).single();
      const provider = settings?.ai_provider || 'gemini';
      const model = settings?.ai_model || 'gemini-2.5-flash';

      const batchSize = 5;
      


      for (let i = 0; i < unanalyzedTickets.length; i += batchSize) {
        if (isAnalysisPaused) {
          analysisProgress.status = 'idle';
          analysisProgress.phase = `Análise pausada pelo usuário. ${globalSuccessCount} tickets analisados nesta sessão.`;
          keepRunning = false;
          break;
        }

        const batch = unanalyzedTickets.slice(i, i + batchSize);
        try {
          await Promise.all(batch.map(async (ticket) => {
          const { data: comments } = await supabase
            .from('ticket_comments')
            .select('author_name, body, is_public, created_at')
            .eq('ticket_zendesk_id', ticket.zendesk_id)
            .order('created_at', { ascending: true });

          const ticketData: TicketForAnalysis = { ...ticket, comments: comments || [] };
          try {
            const similarContext = await findSimilarResolvedTickets(supabase, ticketData.subject, ticketData.zendesk_id);
            const prompt = buildAnalysisPrompt(ticketData, similarContext, knowledgeRules, agentExpertise, undefined, taxonomy, taxonomy.activePatterns);

            let responseObj: AIResponse;
            if (provider === 'openai') {
              const openaiKey = process.env.OPENAI_API_KEY;
              if (!openaiKey) throw new Error('Chave da API da OpenAI não configurada nas variáveis de ambiente');
              responseObj = await callOpenAI(openaiKey, prompt, model);
            } else {
              const geminiKey = process.env.GEMINI_API_KEY || apiKey;
              responseObj = await callGemini(geminiKey, prompt, model);
            }
            
            batchApiCalls++;
            batchInputTokens += responseObj.usage.prompt;
            batchOutputTokens += responseObj.usage.completion;
            batchCost += calculateCost(provider, model, responseObj.usage);
            
            let cleanText = responseObj.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed: AnalysisResult = JSON.parse(cleanText);

            applyDeterministicLogic(parsed, ticketData, undefined); // Batch não usa existingAnalysis pois são tickets não analisados

            let patternGroupId = null;
            if (parsed.pattern_group) {
              const { data: pg, error: pgErr } = await supabase.from('pattern_groups').upsert(
                { name: parsed.pattern_group },
                { onConflict: 'name' }
              ).select('id').single();
              
              if (!pgErr && pg) patternGroupId = pg.id;
            }

            // Calcular Tempo Bruto e Líquido
            const created = new Date(ticket.created_at).getTime();
            const updated = new Date(ticket.updated_at).getTime();
            let grossTimeHours = (updated - created) / (1000 * 60 * 60);
            if (grossTimeHours < 0) grossTimeHours = 0;
            
            let netTimeHours = grossTimeHours;
            if (ticket.assignee_id && grossTimeHours > 0) {
              const { data: overlappingTickets } = await supabase
                .from('tickets')
                .select('id')
                .eq('assignee_id', ticket.assignee_id)
                .lt('created_at', ticket.updated_at)
                .gt('updated_at', ticket.created_at);
                
              const concurrentCount = overlappingTickets ? overlappingTickets.length : 1;
              if (concurrentCount > 0) {
                netTimeHours = grossTimeHours / concurrentCount;
              }
            }

            const { error: analysisError } = await supabase.from('ticket_analysis').upsert({
              ticket_zendesk_id: ticket.zendesk_id,
              product: parsed.product || '',
              request_type: parsed.request_type || '',
              category: parsed.category || '',
              client_intent: parsed.client_intent || '',
              problem_summary: parsed.problem_summary || '',
              identified_pattern: parsed.identified_pattern || '',
              suggested_response: parsed.suggested_response || '',
              recommended_expert: parsed.recommended_expert || null,
              expert_reasoning: parsed.expert_reasoning || null,
              rule_particularities: parsed.rule_particularities || null,
              similar_tickets_ids: similarContext.map((t: any) => t.zendesk_id),
              missing_info: parsed.missing_info || '',
              recommended_procedure: parsed.recommended_procedure || '',
              suggested_priority: parsed.suggested_priority || 'normal',
              confidence_level: parsed.confidence_level || 0,
              pattern_group_id: patternGroupId,
              needs_internal_routing: parsed.needs_internal_routing || '',
              solution_applied: parsed.solution_applied || '',
              applied_rules: parsed.applied_rules || [],
              resolution_time_hours: netTimeHours,
              gross_resolution_time_hours: grossTimeHours,
              operational_effort: parsed.operational_effort || null,
              criticality: parsed.criticality || null,
              expected_completion_effort: parsed.expected_completion_effort || null,
              effort_reason: parsed.effort_reason || null,
              analyzed_at: new Date().toISOString()
            }, { onConflict: 'ticket_zendesk_id' });

            if (analysisError) throw analysisError;

            if (parsed.new_learned_rule && parsed.new_learned_rule.trim() !== '') {
              await supabase.from('ai_knowledge_base').insert({
                title: `Regra Automática: ${parsed.category || 'Geral'}`,
                description: parsed.new_learned_rule,
                category: parsed.category || 'Geral',
                is_active: true
              });
            }

            if (parsed.pattern_group && patternGroupId) {
              const { count } = await supabase.from('ticket_analysis').select('*', { count: 'exact', head: true }).eq('pattern_group_id', patternGroupId);
              await supabase.from('pattern_groups').update({ ticket_count: count || 0, updated_at: new Date().toISOString() }).eq('id', patternGroupId);
            }
            
            globalSuccessCount++;

            // Registrar log de auditoria por ticket analisado
            try {
              await supabase.from('audit_logs').insert({
                user_id: null,
                user_email: 'sistema',
                user_name: 'Sistema (IA)',
                action: 'ai_analysis',
                target_type: 'ticket',
                target_id: String(ticket.zendesk_id),
                details: {
                  message: `Análise IA concluída para ticket #${ticket.zendesk_id} - ${ticket.subject?.substring(0, 80)}`,
                  metrics: {
                    provider: provider,
                    model: model,
                    api_calls: 1,
                    input_tokens: responseObj.usage.prompt,
                    output_tokens: responseObj.usage.completion,
                    total_tokens: responseObj.usage.total,
                    estimated_cost: calculateCost(provider, model, responseObj.usage),
                    error_429: 0,
                    category: parsed.category || '',
                    product: parsed.product || '',
                    confidence: parsed.confidence_level || 0
                  }
                }
              });
            } catch (logErr) {
              console.error('Erro ao salvar audit log individual:', logErr);
            }
          } catch (err: any) {
            console.error(`Error analyzing ticket ${ticket.zendesk_id}:`, err.message);
            if (err.message.includes('429') || err.message.includes('Quota') || err.message.includes('RESOURCE_EXHAUSTED') || err.message.includes('rate limit') || err.message.includes('Too Many Requests') || err.message === 'RATE_LIMIT') {
              batchErrors++;
              console.warn('[AI] Limite de API atingido. Interrompendo lote atual para aguardar recarga.');
              throw new Error('RATE_LIMIT');
            }
            failedTicketIds.add(ticket.zendesk_id);
          }
        }));
      } catch (batchErr: any) {
        if (batchErr.message === 'RATE_LIMIT') {
          analysisProgress.phase = `Limite da API atingido. Aguardando 15 segundos para retomar...`;
          await new Promise(resolve => setTimeout(resolve, 15000));
          break; // Break the for loop, outer while loop restarts
        } else {
          throw batchErr;
        }
      }

      analysisProgress.ticketsAnalyzed = Math.min(globalSuccessCount, analysisProgress.ticketsTotal);
      analysisProgress.phase = `Analisados ${analysisProgress.ticketsAnalyzed} de ${analysisProgress.ticketsTotal} (Lote: ${i + batchSize}/${unanalyzedTickets.length})...`;

      const requiredDelayMs = provider === 'openai' ? 200 : 4100;
      if (i + batchSize < unanalyzedTickets.length) {
        let waitTime = 0;
        while (waitTime < requiredDelayMs) {
          if (isAnalysisPaused) break;
          await new Promise(resolve => setTimeout(resolve, 100));
          waitTime += 100;
        }
      }
    }
    
    // Atraso extra entre lotes para segurança contra rate limits da IA ou Supabase
    if (keepRunning) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } // Fim do while(keepRunning)

  if (globalSuccessCount > 0 || batchErrors > 0) {
    try {
      await supabase.from('audit_logs').insert({
        user_id: null,
        user_email: 'sistema',
        user_name: 'Sistema (Análise em Massa)',
        action: 'analyze_end',
        target_type: 'system',
        target_id: '',
        details: {
          message: `Análise em massa concluída. ${globalSuccessCount} tickets processados.`,
          metrics: {
            api_calls: batchApiCalls,
            input_tokens: batchInputTokens,
            output_tokens: batchOutputTokens,
            total_tokens: batchInputTokens + batchOutputTokens,
            estimated_cost: batchCost,
            error_429: batchErrors,
            provider: 'configurado', // fallback
            model: 'configurado' // fallback
          }
        }
      });
    } catch (logErr) {
      console.error('Erro ao salvar métricas finais de análise:', logErr);
    }
  }

  } catch (err: any) {
     console.error('Erro no analisador de IA:', err);
    analysisProgress.status = 'error';
    analysisProgress.phase = err.message || 'Erro desconhecido na análise.';
  }
}

function calculateCost(provider: string, model: string, usage: { prompt: number, completion: number, total: number }): number {
  let promptPricePerM = 0;
  let completionPricePerM = 0;

  if (provider === 'gemini') {
    if (model.includes('flash')) {
      promptPricePerM = 0.075;
      completionPricePerM = 0.30;
    } else if (model.includes('pro')) {
      promptPricePerM = 3.50;
      completionPricePerM = 10.50;
    }
  } else if (provider === 'openai') {
    if (model.includes('gpt-4o-mini')) {
      promptPricePerM = 0.15;
      completionPricePerM = 0.60;
    } else if (model.includes('gpt-4o')) {
      promptPricePerM = 5.00;
      completionPricePerM = 15.00;
    } else if (model.includes('gpt-3.5')) {
      promptPricePerM = 0.50;
      completionPricePerM = 1.50;
    }
  }

  const cost = (usage.prompt / 1000000) * promptPricePerM + (usage.completion / 1000000) * completionPricePerM;
  return cost;
}

export async function analyzeSingleTicket(apiKey: string, supabase: SupabaseClient, zendeskId: number): Promise<any> {
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('*')
    .eq('zendesk_id', zendeskId)
    .single();

  if (ticketError || !ticket) {
    throw new Error(`Ticket ${zendeskId} não encontrado no banco de dados.`);
  }

  const knowledgeRules = await fetchActiveRules(supabase);
  const agentExpertise = await fetchAgentExpertise(supabase);
  const taxonomy = await fetchTaxonomy(supabase);

  const { data: comments } = await supabase
    .from('ticket_comments')
    .select('author_name, body, is_public, created_at')
    .eq('ticket_zendesk_id', zendeskId)
    .order('created_at', { ascending: true });

  const { data: existingAnalysis } = await supabase
    .from('ticket_analysis')
    .select('*')
    .eq('ticket_zendesk_id', zendeskId)
    .single();

  const ticketData: TicketForAnalysis = { ...ticket, comments: comments || [] };
  let similarContext = await findSimilarResolvedTickets(supabase, ticketData.subject, ticketData.zendesk_id);
  
  if (existingAnalysis) {
    if (existingAnalysis.rejected_similar_tickets && existingAnalysis.rejected_similar_tickets.length > 0) {
      similarContext = similarContext.filter((st: any) => !existingAnalysis.rejected_similar_tickets.includes(st.zendesk_id));
    }
    if (existingAnalysis.added_similar_tickets && existingAnalysis.added_similar_tickets.length > 0) {
      const addedIds = existingAnalysis.added_similar_tickets.filter((id: number) => !similarContext.find((st: any) => st.zendesk_id === id));
      if (addedIds.length > 0) {
        const { data: addedTickets } = await supabase.from('tickets').select('*').in('zendesk_id', addedIds);
        if (addedTickets) {
          for (const at of addedTickets) {
             const { data: atAnalysis } = await supabase.from('ticket_analysis').select('*').eq('ticket_zendesk_id', at.zendesk_id).single();
             similarContext.push({
               zendesk_id: at.zendesk_id,
               subject: at.subject,
               solution_comment: atAnalysis?.suggested_response || 'Resolução não encontrada',
               category: atAnalysis?.category,
               product: atAnalysis?.product,
               request_type: atAnalysis?.request_type,
               recommended_procedure: atAnalysis?.recommended_procedure,
               is_manually_corrected: atAnalysis?.is_manually_corrected || false
             });
          }
        }
      }
    }
  }

  const { data: settings } = await supabase.from('system_settings').select('*').eq('id', 1).single();
  const provider = settings?.ai_provider || 'gemini';
  const model = settings?.ai_model || 'gemini-2.5-flash';

  const prompt = buildAnalysisPrompt(ticketData, similarContext, knowledgeRules, agentExpertise, existingAnalysis, taxonomy, taxonomy.activePatterns);

  let responseObj: AIResponse;

  if (provider === 'openai') {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) throw new Error('Chave da API da OpenAI não configurada nas variáveis de ambiente');
    responseObj = await callOpenAI(openaiKey, prompt, model);
  } else {
    const geminiKey = process.env.GEMINI_API_KEY || apiKey;
    responseObj = await callGemini(geminiKey, prompt, model);
  }
  
  let parsed: AnalysisResult;
  try {
    let cleanText = responseObj.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(cleanText);
    applyDeterministicLogic(parsed, ticketData, existingAnalysis);
  } catch (e: any) {
    throw new Error(`JSON parse error: ${e.message} in response: ${responseObj.text}`);
  }
  
  const estimatedCost = calculateCost(provider, model, responseObj.usage);

  let patternGroupId = null;
  if (parsed.pattern_group) {
    const { data: pg, error: pgErr } = await supabase.from('pattern_groups').upsert(
      { name: parsed.pattern_group },
      { onConflict: 'name' }
    ).select('id').single();
    
    if (!pgErr && pg) patternGroupId = pg.id;
  }

  if (parsed.new_learned_rule && parsed.new_learned_rule.trim().length > 10) {
    try {
      await supabase.from('ai_knowledge_base').insert({
        title: `Regra aprendida via Ticket #${ticket.zendesk_id}`,
        description: parsed.new_learned_rule.trim(),
        category: parsed.category || 'Geral',
        priority: 'Normal',
        is_active: true
      });
    } catch (e) {
      console.warn("Failed to insert learned rule:", e);
    }
  }

  const resolutionHours = ticket.status === 'solved' || ticket.status === 'closed' 
    ? Math.max(0, (new Date(ticket.updated_at).getTime() - new Date(ticket.created_at).getTime()) / (1000 * 60 * 60))
    : 0;

  const { data: analysisResult, error: analysisError } = await supabase.from('ticket_analysis').upsert({
    ticket_zendesk_id: ticket.zendesk_id,
    product: parsed.product || '',
    request_type: parsed.request_type || '',
    category: parsed.category || '',
    client_intent: parsed.client_intent || '',
    problem_summary: parsed.problem_summary || '',
    detailed_requirements: parsed.detailed_requirements || '',
    identified_pattern: parsed.identified_pattern || '',
    suggested_response: parsed.suggested_response || '',
    recommended_expert: parsed.recommended_expert || null,
    expert_reasoning: parsed.expert_reasoning || null,
    rule_particularities: parsed.rule_particularities || null,
    similar_tickets_ids: similarContext.map((t: any) => t.zendesk_id),
    missing_info: parsed.missing_info || '',
    recommended_procedure: parsed.recommended_procedure || '',
    suggested_priority: parsed.suggested_priority || 'normal',
    confidence_level: parsed.confidence_level || 0.5,
    pattern_group_id: patternGroupId,
    needs_internal_routing: parsed.needs_internal_routing || 'Nenhum',
    solution_applied: parsed.solution_applied || 'Pendente',
    was_reopened: ticket.tags?.includes('reopened') || false,
    resolution_time_hours: resolutionHours,
    predicted_resolution_time_hours: parsed.predicted_resolution_time_hours || null,
    applied_rules: parsed.applied_rules || [],
    operational_effort: parsed.operational_effort || null,
    criticality: parsed.criticality || null,
    expected_completion_effort: parsed.expected_completion_effort || null,
    effort_reason: parsed.effort_reason || null,
    analyzed_at: new Date().toISOString()
  }, { onConflict: 'ticket_zendesk_id' }).select().single();

  if (analysisError) throw analysisError;

  return {
    analysisResult,
    usage: responseObj.usage,
    cost: estimatedCost,
    provider,
    model
  };
}

export async function generateRadarInsights(apiKey: string, supabase: SupabaseClient): Promise<any> {
  const provider = 'gemini';
  
  // 1. Fetch aggregated stats from db to send to AI
  const { data: tickets } = await supabase.from('tickets').select('status, priority, created_at, updated_at, requester_name');
  const { data: analysis } = await supabase.from('ticket_analysis').select('category, product, was_reopened, needs_internal_routing, confidence_level');
  
  // Summarize
  const summary = {
    total_tickets: tickets?.length || 0,
    categories: {} as Record<string, number>,
    products: {} as Record<string, number>,
    priorities: {} as Record<string, number>,
    reopened_count: 0
  };
  
  analysis?.forEach(a => {
    if (a.category) summary.categories[a.category] = (summary.categories[a.category] || 0) + 1;
    if (a.product) summary.products[a.product] = (summary.products[a.product] || 0) + 1;
    if (a.was_reopened) summary.reopened_count++;
  });
  
  tickets?.forEach(t => {
    if (t.priority) summary.priorities[t.priority] = (summary.priorities[t.priority] || 0) + 1;
  });

  const prompt = `Você é um analista de operações do Zendesk. 
Analise os seguintes dados agregados da operação e identifique 3 a 5 insights críticos (anomalias, gargalos, aumento incomum de chamados, etc).
Dados: ${JSON.stringify(summary)}

Responda APENAS um array JSON de objetos com este formato estrito:
[
  {
    "type": "anomaly" | "trend" | "suggestion",
    "title": "Título Curto (Ex: Pico de chamados no Produto X)",
    "description": "Explicação breve do que está acontecendo e impacto.",
    "level": "critical" | "high" | "medium" | "low"
  }
]
Não use formatação markdown, apenas o JSON array puro.`;

  let responseText = '';
  if (provider === 'openai') {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) throw new Error('Chave da API da OpenAI não configurada no .env');
    responseText = await callOpenAI(openaiKey, prompt);
  } else {
    responseText = await callGemini(apiKey, prompt);
  }
  
  const parsedInsights = JSON.parse(responseText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim());
  
  // Inactivate old insights
  await supabase.from('radar_insights').update({ is_active: false }).eq('is_active', true);
  
  // Insert new ones
  for (const ins of parsedInsights) {
    await supabase.from('radar_insights').insert({
      type: ins.type || 'trend',
      title: ins.title || 'Insight Gerado',
      description: ins.description || '',
      level: ins.level || 'medium',
      is_active: true
    });
  }
  
  return parsedInsights;
}
