-- 1. Cria a tabela de agentes
CREATE TABLE IF NOT EXISTS public.zendesk_agents (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Adiciona campos na análise
ALTER TABLE public.ticket_analysis
ADD COLUMN IF NOT EXISTS recommended_expert TEXT,
ADD COLUMN IF NOT EXISTS expert_reasoning TEXT,
ADD COLUMN IF NOT EXISTS resolution_time_hours NUMERIC,
ADD COLUMN IF NOT EXISTS gross_resolution_time_hours NUMERIC;

-- 3. Cria a View de expertise dos agentes
DROP VIEW IF EXISTS public.agent_expertise_ranking;
CREATE VIEW public.agent_expertise_ranking AS
SELECT 
    t.assignee_id,
    t.assignee_name,
    ta.category,
    COUNT(t.zendesk_id) as tickets_resolved,
    (COUNT(t.zendesk_id) * 100.0 / NULLIF((SELECT COUNT(*) FROM tickets t2 WHERE t2.assignee_id = t.assignee_id AND t2.status != 'deleted'), 0)) as resolution_rate,
    AVG(ta.resolution_time_hours) as avg_resolution_time,
    AVG(ta.gross_resolution_time_hours) as avg_gross_time,
    SUM(CASE WHEN ta.was_reopened THEN 1 ELSE 0 END) * 100.0 / COUNT(t.zendesk_id) as reopen_rate
FROM tickets t
JOIN ticket_analysis ta ON t.zendesk_id = ta.ticket_zendesk_id
JOIN zendesk_agents za ON t.assignee_id = za.id
WHERE t.status IN ('solved', 'closed') AND za.is_active = true
GROUP BY t.assignee_id, t.assignee_name, ta.category;

GRANT SELECT ON public.agent_expertise_ranking TO anon;
GRANT SELECT ON public.agent_expertise_ranking TO authenticated;
GRANT SELECT ON public.agent_expertise_ranking TO service_role;

-- 4. Adiciona campos de contexto avançado na análise da IA
ALTER TABLE public.ticket_analysis
ADD COLUMN IF NOT EXISTS rule_particularities TEXT,
ADD COLUMN IF NOT EXISTS similar_tickets_ids JSONB;

-- 5. Adiciona campo Cargo (Role) aos Agentes
ALTER TABLE public.zendesk_agents
ADD COLUMN IF NOT EXISTS cargo TEXT;

-- 6. Corrigir permissões para a tabela
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zendesk_agents TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zendesk_agents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zendesk_agents TO service_role;

-- Garantir acesso de leitura para a View de Especialistas
GRANT SELECT ON public.agent_expertise_ranking TO anon;
GRANT SELECT ON public.agent_expertise_ranking TO authenticated;
GRANT SELECT ON public.agent_expertise_ranking TO service_role;

-- 7. Alimentar tabela de Agentes a partir dos tickets
INSERT INTO public.zendesk_agents (id, name, is_active)
SELECT DISTINCT assignee_id, assignee_name, true
FROM public.tickets
WHERE assignee_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 8. Adicionar coluna para edição manual
ALTER TABLE public.ticket_analysis
ADD COLUMN IF NOT EXISTS is_manually_corrected BOOLEAN DEFAULT false;

-- 9. Criar RPC v2 para aprendizado de máquina local
CREATE OR REPLACE FUNCTION public.find_similar_resolved_tickets_v2(search_query text, current_ticket_id bigint)
RETURNS TABLE (
    zendesk_id bigint,
    subject text,
    solution_comment text,
    category text,
    product text,
    request_type text,
    recommended_procedure text,
    is_manually_corrected boolean,
    similarity real
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.zendesk_id,
        t.subject,
        COALESCE(
            (SELECT body FROM ticket_comments WHERE ticket_zendesk_id = t.zendesk_id AND is_public = true ORDER BY created_at DESC LIMIT 1),
            'Sem solução pública'
        ) as solution_comment,
        ta.category,
        ta.product,
        ta.request_type,
        ta.recommended_procedure,
        COALESCE(ta.is_manually_corrected, false),
        ts_rank(to_tsvector('portuguese', t.subject || ' ' || COALESCE(t.description, '')), plainto_tsquery('portuguese', search_query))::real as similarity
    FROM tickets t
    LEFT JOIN ticket_analysis ta ON t.zendesk_id = ta.ticket_zendesk_id
    WHERE t.status IN ('solved', 'closed')
      AND t.zendesk_id != current_ticket_id
      AND to_tsvector('portuguese', t.subject || ' ' || COALESCE(t.description, '')) @@ plainto_tsquery('portuguese', search_query)
    ORDER BY similarity DESC
    LIMIT 3;
END;
$$ LANGUAGE plpgsql;
