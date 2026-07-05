require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function sanitizeAggressively() {
  console.log('Iniciando saneamento agressivo...');

  // Buscar categorias oficiais
  const { data: officialCatsData } = await supabase.from('catalog_categories').select('name').eq('is_active', true);
  const officialCats = officialCatsData ? officialCatsData.map(c => c.name) : [];

  let hasMore = true;
  let page = 0;
  const pageSize = 1000;
  let updatedCount = 0;

  while (hasMore) {
    const { data: tickets, error } = await supabase
      .from('ticket_analysis')
      .select('ticket_zendesk_id, category')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !tickets || tickets.length === 0) {
      hasMore = false;
      break;
    }

    for (const ticket of tickets) {
      let cat = ticket.category || '';
      let newCat = cat;

      // Se já está na oficial (ou se for vazia), pula
      if (officialCats.includes(cat) || !cat) continue;

      const lowerCat = cat.toLowerCase();

      // Mapeamento por palavras-chave
      if (lowerCat.includes('senha') || lowerCat.includes('acesso') || lowerCat.includes('usuário') || lowerCat.includes('permissão') || lowerCat.includes('cadastro')) {
        newCat = 'Gestão de Usuários e Permissões';
      } else if (lowerCat.includes('e-mail') || lowerCat.includes('email') || lowerCat.includes('webmail') || lowerCat.includes('outlook')) {
        newCat = 'Gestão de E-mails';
      } else if (lowerCat.includes('conteúdo') || lowerCat.includes('página') || lowerCat.includes('documento') || lowerCat.includes('site') || lowerCat.includes('portal') || lowerCat.includes('cms')) {
        newCat = 'Gestão de Conteúdo';
      } else if (lowerCat.includes('desenvolvimento') || lowerCat.includes('bug') || lowerCat.includes('código') || lowerCat.includes('php') || lowerCat.includes('frontend')) {
        newCat = 'Desenvolvimento';
      } else if (lowerCat.includes('infraestrutura') || lowerCat.includes('dns') || lowerCat.includes('servidor') || lowerCat.includes('ssl') || lowerCat.includes('segurança')) {
        newCat = 'Infraestrutura';
      } else if (lowerCat.includes('comercial') || lowerCat.includes('contrato') || lowerCat.includes('venda')) {
        newCat = 'Comercial';
      } else if (lowerCat.includes('atendimento') || lowerCat.includes('suporte')) {
        newCat = 'Atendimento';
      } else {
        newCat = 'Outros'; // Fallback
      }

      if (newCat !== cat) {
        await supabase
          .from('ticket_analysis')
          .update({ category: newCat })
          .eq('ticket_zendesk_id', ticket.ticket_zendesk_id);
        updatedCount++;
      }
    }

    page++;
    console.log(`Processados ${(page * pageSize)} tickets... Atualizados: ${updatedCount}`);
  }

  // E o `agent_expertise_ranking`? Se for uma view Materializada, precisa de refresh.
  // Vamos tentar dar um refresh se possível (geralmente via RPC, mas vamos checar).
  try {
     // Tentativa de invocar RPC caso exista
     await supabase.rpc('refresh_agent_expertise_ranking');
     console.log('Tentativa de refresh na View via RPC concluída.');
  } catch(e) {}

  console.log(`\n✅ Saneamento AGRESSIVO concluído! Registros corrigidos: ${updatedCount}`);
}

sanitizeAggressively();
