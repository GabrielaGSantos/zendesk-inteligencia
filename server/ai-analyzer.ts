import { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ─────────────────────────────────────────────────────────────
// AI Analyzer — Google Gemini & OpenAI
// Analyzes tickets semantically and saves results in Supabase
// ─────────────────────────────────────────────────────────────

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
}

export interface AIResponse {
  text: string;
  usage: {
    prompt: number;
    completion: number;
    total: number;
  };
}

async function callGemini(apiKey: string, prompt: string, model: string = 'gemini-1.5-flash'): Promise<AIResponse> {
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

async function callOpenAI(apiKey: string, prompt: string, model: string = 'gpt-4o-mini'): Promise<AIResponse> {
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
  try {
    const { data } = await supabase.from('ai_knowledge_base').select('*').eq('is_active', true);
    if (!data) return [];
    
    const allExampleIds = new Set<number>();
    for (const rule of data) {
      if (rule.examples && Array.isArray(rule.examples)) {
        for (const id of rule.examples) allExampleIds.add(id);
      }
    }
    
    if (allExampleIds.size > 0) {
      const { data: ticketsData } = await supabase
        .from('tickets')
        .select('zendesk_id, subject')
        .in('zendesk_id', Array.from(allExampleIds));
        
      const { data: commentsData } = await supabase
        .from('ticket_comments')
        .select('ticket_zendesk_id, body')
        .in('ticket_zendesk_id', Array.from(allExampleIds))
        .eq('is_public', true)
        .order('created_at', { ascending: false });
        
      if (ticketsData) {
        const ticketMap = new Map();
        for (const t of ticketsData) {
          const solution = commentsData?.find(c => c.ticket_zendesk_id === t.zendesk_id)?.body || 'Sem resposta pública';
          ticketMap.set(t.zendesk_id, { subject: t.subject, solution });
        }
        
        for (const rule of data) {
          if (rule.examples && Array.isArray(rule.examples)) {
            rule.examples_data = rule.examples.map((id: number) => ticketMap.get(id)).filter(Boolean);
          }
        }
      }
    }
    
    return data;
  } catch (err) {
    console.error('Error fetching knowledge rules:', err);
    return [];
  }
}

async function fetchAgentExpertise(supabase: SupabaseClient): Promise<any[]> {
  try {
    const { data: ranking } = await supabase.from('agent_expertise_ranking').select('*');
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

function buildAnalysisPrompt(
  ticket: TicketForAnalysis, 
  similarTickets?: SimilarTicketContext[], 
  knowledgeRules?: any[],
  agentExpertise?: any[],
  existingAnalysis?: any
): string {
  const commentsText = ticket.comments
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

  let similarContextText = '';
  if (similarTickets && similarTickets.length > 0) {
    similarContextText = `
## Histórico de Casos Similares Resolvidos pela Equipe
Abaixo estão exemplos de como a nossa equipe resolveu tickets parecidos no passado. **Use esses exemplos para guiar o seu "suggested_response" e entender os procedimentos internos (recommended_procedure).** Tente imitar o tom, as palavras e as soluções dadas nestes exemplos.

IMPORTANTE: Se algum exemplo abaixo estiver marcado com "[CORRIGIDO MANUALMENTE PELA COORDENAÇÃO]", isso significa que um humano revisou a classificação da IA e definiu o GABARITO OFICIAL. Você DEVE seguir a mesma Categoria, Produto e Procedimento Recomendado deste gabarito para este novo ticket se os assuntos forem idênticos.

${similarTickets.map((st, i) => `--- Exemplo ${i + 1} ---
Assunto Original: ${st.subject}
${st.is_manually_corrected ? '⚠️ [CORRIGIDO MANUALMENTE PELA COORDENAÇÃO - GABARITO OFICIAL]\n' : ''}${st.ai_feedback ? `💡 INSTRUÇÃO DA COORDENAÇÃO: ${st.ai_feedback}\n` : ''}Categoria Histórica: ${st.category || 'N/A'}
Produto Histórico: ${st.product || 'N/A'}
Procedimento Recomendado Histórico: ${st.recommended_procedure || 'N/A'}
Resposta Final da Equipe: ${st.solution_comment}`).join('\n\n')}
`;
  }

  let knowledgeText = '';
  if (knowledgeRules && knowledgeRules.length > 0) {
    knowledgeText = `
## Base de Conhecimento e Regras de Ouro
Abaixo estão regras estritas e procedimentos internos que você DEVE seguir ao analisar o ticket e sugerir a resposta ou o procedimento. Em caso de conflito, dê preferência às regras de maior Prioridade.

${knowledgeRules.map((kr, i) => `--- Regra ID: ${kr.id} ---
Tópico: ${kr.title}
Categoria: ${kr.category}
Prioridade: ${kr.priority}
Descrição da Regra: ${kr.description}
${kr.examples_data && kr.examples_data.length > 0 ? `\nCasos Práticos de Exemplo para esta regra:\n${kr.examples_data.map((ex: any, i: number) => `  [Exemplo ${i+1}] Assunto: ${ex.subject}\n  Solução: ${ex.solution}`).join('\n\n')}` : ''}`).join('\n\n')}
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

  return `Você é um analista de suporte técnico especializado. Analise o ticket de atendimento abaixo e forneça uma classificação detalhada.

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

${similarContextText}

${knowledgeText}

${agentExpertise && agentExpertise.length > 0 ? `
## Base de Especialistas (Histórico Real de Atendimento)
Aqui está o ranking atual dos agentes que mais resolveram tickets, agrupado por categoria.
Baseie a sua recomendação EXCLUSIVAMENTE nesta lista para sugerir o especialista mais adequado.
Justifique a sua escolha citando as métricas apresentadas abaixo (quantidade, taxa de resolução, tempo médio, etc).

${agentExpertise.map(e => `- Agente: ${e.assignee_name} (${e.cargo}) | Categoria: ${e.category} | Resolvidos: ${e.tickets_resolved} | Taxa de Resolução: ${Number(e.resolution_rate).toFixed(1)}% | Tempo Médio: ${Number(e.avg_resolution_time).toFixed(1)}h | Reaberturas: ${Number(e.reopen_rate).toFixed(1)}%`).join('\n')}
` : ''}
---

## Instruções de Análise

Com base em TODAS as informações acima (assunto, descrição, comentários públicos, comentários internos, tags, grupo, organização, status e histórico), identifique:

1. **product**: O produto ou sistema principal relacionado ao ticket (ex: "Portal da Transparência", "Site Institucional", "E-mail", "DNS", "Hospedagem", "Ouvidoria", "LGPD", etc.)
2. **request_type**: O tipo de solicitação (ex: "Bug Report", "Alteração de Conteúdo", "Criação de Usuário", "Dúvida", "Melhoria", "Configuração", etc.)
3. **category**: A(s) categoria(s) técnica(s) ESPECÍFICA(S) E DETALHADA(S). Esta é a principal variável do sistema. NÃO use macro-categorias genéricas como "Gestão de Conteúdo". Você DEVE separar rigorosamente o que é "Operacional" (ex: cadastrar usuário, alterar texto, subir imagem no painel) do que é "Programação/Desenvolvimento" (ex: alterar código-fonte, criar script, editar banco de dados, configurar DNS). Use nomenclaturas que deixem clara a habilidade necessária (ex: "Desenvolvimento > Frontend", "Operacional > Edição via CMS", "Infraestrutura > Servidor", "Programação > Correção de Bug PHP"). IMPORTANTE: Se o ticket envolver mais de uma área de atuação, retorne TODAS as categorias relevantes separadas por " | " (pipe). Exemplo: "Operacional > Edição via CMS | Desenvolvimento > Frontend". Retorne no mínimo 1 e no máximo 3 categorias.
4. **client_intent**: O que o cliente realmente quer/precisa em uma frase curta
5. **problem_summary**: Resumo claro do problema em 1-2 frases
6. **detailed_requirements**: Liste detalhadamente e minuciosamente TODOS os requisitos, solicitações e detalhes técnicos que o cliente mencionou nas mensagens dele. Use bullet points se necessário. Este campo serve para que o programador/especialista saiba EXATAMENTE tudo o que precisa ser feito sem precisar ler o ticket original inteiro.
7. **identified_pattern**: Nome do padrão operacional que este ticket representa (ex: "Erro Portal Transparência - Licitações", "Reset de Senha - Portal", etc.)
8. **suggested_response**: Uma resposta padrão profissional e empática que poderia ser enviada ao cliente. IMPORTANTE: Se houver "Histórico de Casos Similares" ou "Regras de Base de Conhecimento" abaixo, você DEVE seguir as diretrizes delas para escrever a resposta. NUNCA adicione sua própria assinatura, pois o Zendesk assina automaticamente.
9. **missing_info**: Informações que ainda precisam ser solicitadas ao cliente para resolver o problema (ex: "URL do erro, navegador utilizado, print da tela")
10. **recommended_procedure**: Procedimento interno recomendado para a equipe resolver o ticket. Se houver casos similares, baseie-se neles.
11. **suggested_priority**: Prioridade sugerida (urgente, alta, normal, baixa)
12. **confidence_level**: Seu nível de confiança nesta análise de 0.0 a 1.0
13. **pattern_group**: Nome do grupo de padrão ao qual este ticket pertence (ex: "Problemas no Portal da Transparência", "Gestão de Acessos", etc.)
14. **needs_internal_routing**: Se precisa de trâmite interno, indicar qual equipe ou pessoa (ex: "Equipe de Desenvolvimento", "Equipe de Infraestrutura", "Nenhum")
15. **solution_applied**: Se o ticket já foi resolvido baseado nos comentários, descreva brevemente a solução aplicada. Se não, escreva "Pendente".
16. **new_learned_rule**: Se você perceber, lendo os comentários da equipe de suporte, que eles utilizaram um procedimento interno ou regra padrão que não existe na "Base de Conhecimento", extraia e formule essa nova regra de forma clara. IMPORTANTE: Antes de criar uma nova regra, leia atentamente todas as regras da "Base de Conhecimento" já existentes. Se a regra que você pensou já existir (mesmo que com outras palavras) ou for muito similar a uma existente, NÃO a crie. Só retorne uma regra se ela for genuinamente inédita. Caso contrário, retorne null.
17. **applied_rules**: Uma lista (array de strings) com os Títulos das regras da Base de Conhecimento que você efetivamente utilizou para tomar sua decisão neste ticket. Se nenhuma regra for utilizada, retorne um array vazio [].
18. **recommended_expert**: O nome exato dos **DOIS** agentes mais recomendados (1º e 2º), com base na tabela de Especialistas. IMPORTANTE: Este campo é EXCLUSIVO para o executor técnico que vai colocar a mão na massa e resolver o problema. Se a Base de Conhecimento disser que uma pessoa (ex: Chefe/Diretor) deve apenas 'aprovar' a demanda, ELA NÃO DEVE APARECER AQUI. Ignore aprovadores para este campo e indique-os apenas em 'needs_internal_routing'. Ex: "1º Bruno | 2º Gabriela". Se não houver dados, retorne null.
19. **expert_reasoning**: Justificativa detalhada citando os indicadores numéricos (taxa, tempo, etc) que te levaram a escolher esses dois especialistas.
20. **rule_particularities**: Se o ticket utiliza uma regra existente mas apresenta uma particularidade, exceção ou nuance importante observada nos comentários, descreva-a de forma sucinta aqui. Se não houver particularidade, retorne null.
21. **predicted_resolution_time_hours**: Estimativa numérica (em horas) de quanto tempo este ticket levará para ser resolvido (da abertura até a solução), considerando a complexidade e casos similares. Ex: 2.5 (2 horas e meia), 48 (2 dias). Se não tiver como prever, retorne null.cularidade, exceção ou nuance importante observada nos comentários, descreva-a de forma sucinta aqui. Se não houver particularidade, retorne null.
20. **predicted_resolution_time_hours**: Estimativa numérica (em horas) de quanto tempo este ticket levará para ser resolvido (da abertura até a solução), considerando a complexidade e casos similares. Ex: 2.5 (2 horas e meia), 48 (2 dias). Se não tiver como prever, retorne null.

Responda APENAS com um JSON válido contendo exatamente esses campos. Não inclua explicações extras.`;
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
          .select('*, ticket_analysis(id)')
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

      const unanalyzedTickets = allTickets.filter(t => (!t.ticket_analysis || t.ticket_analysis.length === 0) && !failedTicketIds.has(t.zendesk_id));

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

      const { data: settings } = await supabase.from('system_settings').select('*').eq('id', 1).single();
      const provider = settings?.ai_provider || 'gemini';
      const model = settings?.ai_model || 'gemini-1.5-flash';

      const batchSize = 5;
      
      let batchInputTokens = 0;
      let batchOutputTokens = 0;
      let batchApiCalls = 0;
      let batchCost = 0;
      let batchErrors = 0;

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
            const prompt = buildAnalysisPrompt(ticketData, similarContext, knowledgeRules, agentExpertise);

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
    if (model.includes('gemini-1.5-flash')) {
      promptPricePerM = 0.075;
      completionPricePerM = 0.30;
    } else if (model.includes('gemini-1.5-pro')) {
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
  const model = settings?.ai_model || 'gemini-1.5-flash';

  const prompt = buildAnalysisPrompt(ticketData, similarContext, knowledgeRules, agentExpertise, existingAnalysis);

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
    applied_rules: parsed.applied_rules || []
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
