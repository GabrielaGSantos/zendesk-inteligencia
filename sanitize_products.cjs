require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function sanitizeProducts() {
  console.log('Iniciando saneamento de Produtos...');

  const { data: officialProdData } = await supabase.from('catalog_products').select('name').eq('is_active', true);
  const officialProds = officialProdData ? officialProdData.map(c => c.name) : [];

  let hasMore = true;
  let page = 0;
  const pageSize = 1000;
  let updatedCount = 0;

  while (hasMore) {
    const { data: tickets, error } = await supabase
      .from('ticket_analysis')
      .select('ticket_zendesk_id, product')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !tickets || tickets.length === 0) {
      hasMore = false;
      break;
    }

    for (const ticket of tickets) {
      let prod = ticket.product || '';
      let newProd = prod;

      if (officialProds.includes(prod) || !prod) continue;

      const lowerProd = prod.toLowerCase();

      // Regras de negócio
      if (lowerProd.includes('inscriç')) {
        newProd = 'Sistema de Inscrições';
      } else if (lowerProd.includes('site') || lowerProd.includes('portal da prefeitura') || lowerProd.includes('cidade on-line') || lowerProd.includes('cidade online')) {
        newProd = 'Site Institucional';
      } else if (lowerProd.includes('transparência')) {
        newProd = 'Portal da Transparência';
      } else if (lowerProd.includes('ouvidoria') || lowerProd.includes('e-sic')) {
        newProd = 'Ouvidoria';
      } else if (lowerProd.includes('serviços')) {
        newProd = 'Carta de Serviços';
      } else if (lowerProd.includes('e-mail') || lowerProd.includes('email') || lowerProd.includes('webmail')) {
        newProd = 'E-mail Institucional';
      } else if (lowerProd.includes('hospedagem') || lowerProd.includes('backup') || lowerProd.includes('dns') || lowerProd.includes('ssl')) {
        newProd = 'Hospedagem';
      } else if (lowerProd.includes('lgpd')) {
        newProd = 'Página LGPD';
      } else if (lowerProd.includes('diário')) {
        newProd = 'Diário Oficial';
      } else if (lowerProd.includes('chatbot') || lowerProd.includes('ia')) {
        newProd = 'Chatbot IA';
      } else if (lowerProd.includes('participação')) {
        newProd = 'Participação Social Eletrônica';
      } else if (lowerProd.includes('emprego')) {
        newProd = 'Balcão de Empregos';
      } else {
        newProd = 'Outros';
      }

      if (newProd !== prod) {
        await supabase
          .from('ticket_analysis')
          .update({ product: newProd })
          .eq('ticket_zendesk_id', ticket.ticket_zendesk_id);
        updatedCount++;
      }
    }
    page++;
    console.log(`Processados ${(page * pageSize)} tickets... Atualizados (Produtos): ${updatedCount}`);
  }

  console.log(`\n✅ Saneamento de Produtos concluído! Registros corrigidos: ${updatedCount}`);
}

sanitizeProducts();
