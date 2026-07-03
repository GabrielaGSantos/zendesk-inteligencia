import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

async function insertRules() {
  const rules = [
    {
      title: "Roteamento e Especialidade do Renan (Chefe)",
      description: "O Renan é o chefe. Para tickets sobre 'aprovações de novas funcionalidades', ele precisa ser avisado e aprovar, mas NÃO deve ser recomendado como especialista para executar a tarefa. O Renan só deve ser apontado como especialista/executor quando o ticket for sobre infraestrutura pesada: servidor fora do ar, configuração de DNS, criação de subdomínio com mascaramento, etc.",
      category: "Roteamento",
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
