import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

async function insertRules() {
  const rules = [
    {
      title: "Respostas Curtas para Funcionalidades Novas",
      description: "Se o ticket for uma 'funcionalidade nova' ou requerer aprovação, a resposta deve ser APENAS algo na linha de 'Estamos analisando a solicitação' ou 'Sua solicitação foi colocada na fila'. Não invente resoluções.",
      category: "Procedimentos Internos",
      priority: "Alta",
      is_active: true
    },
    {
      title: "Proibição de Assinaturas (Sem Atenciosamente)",
      description: "NUNCA termine a mensagem com assinaturas como 'Atenciosamente, Equipe de Suporte', 'Abraços', etc. O sistema Zendesk já assina automaticamente os e-mails enviados aos clientes.",
      category: "Atendimento",
      priority: "Alta",
      is_active: true
    }
  ];

  for (const r of rules) {
    const { error } = await supabase.from('ai_knowledge_base').insert(r);
    if (error) console.error("Error inserting rule:", error.message);
    else console.log("Rule inserted:", r.title);
  }
}

insertRules();
