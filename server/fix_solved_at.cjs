require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const auth = 'Basic ' + Buffer.from(process.env.ZENDESK_EMAIL + '/token:' + process.env.ZENDESK_API_TOKEN).toString('base64');
const baseUrl = `https://${process.env.ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (res.status === 429) {
      const wait = parseInt(res.headers.get('retry-after') || '60', 10);
      console.log(`Rate limited, waiting ${wait}s...`);
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Zendesk error: ${res.statusText}`);
    return res.json();
  }
  throw new Error('Max retries reached');
}

async function run() {
  console.log('Buscando tickets corrompidos...');
  const { data: tickets, error } = await supabase.from('tickets').select('id, zendesk_id, updated_at, solved_at').eq('status', 'closed');
  if (error) {
    console.error(error);
    return;
  }
  
  const flawedTickets = tickets.filter(t => t.solved_at === t.updated_at);
  console.log(`Encontrados ${flawedTickets.length} tickets com data de resolução igual à data de fechamento.`);

  const zendeskIds = flawedTickets.map(t => t.zendesk_id);
  
  const chunkSize = 100;
  let fixedCount = 0;

  for (let i = 0; i < zendeskIds.length; i += chunkSize) {
    const chunk = zendeskIds.slice(i, i + chunkSize);
    console.log(`Processando lote ${i / chunkSize + 1} de ${Math.ceil(zendeskIds.length / chunkSize)}...`);
    try {
      const data = await fetchWithRetry(`${baseUrl}/tickets/show_many.json?ids=${chunk.join(',')}&include=metric_sets`);
      if (data && data.tickets) {
        for (const zTicket of data.tickets) {
          const realSolvedAt = zTicket.metric_set?.solved_at || zTicket.updated_at;
          await supabase.from('tickets').update({ solved_at: realSolvedAt }).eq('zendesk_id', zTicket.id);
          fixedCount++;
        }
      }
    } catch (e) {
      console.error('Erro no lote:', e.message);
    }
  }

  console.log(`Pronto! ${fixedCount} tickets atualizados com a data correta.`);
}

run();
