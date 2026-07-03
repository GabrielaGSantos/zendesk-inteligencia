import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Atualizando categorias antigas...');
  const { data, error } = await supabase
    .from('ticket_analysis')
    .update({ category: 'Operacional > Edição via admin' })
    .eq('category', 'Operacional > Edição via CMS');

  if (error) {
    console.error('Erro ao atualizar tickets:', error);
  } else {
    console.log('Tickets atualizados com sucesso!');
  }

  console.log('Criando regra na base de conhecimento da IA...');
  const { error: ruleError } = await supabase
    .from('ai_knowledge_base')
    .insert({
      title: 'Categoria de Edição de Site/CMS',
      description: 'Sempre que o cliente solicitar alterações de conteúdo do site, banners, imagens, textos, criação de páginas ou qualquer edição feita através do painel, utilize EXATAMENTE a categoria "Operacional > Edição via admin". NUNCA utilize a categoria "Operacional > Edição via CMS".',
      category: 'Categorização',
      priority: 'high',
      is_active: true,
      is_favorite: true,
      history: []
    });

  if (ruleError) {
    console.error('Erro ao criar regra:', ruleError);
  } else {
    console.log('Regra criada com sucesso!');
  }
}

run();
