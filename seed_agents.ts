import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function run() {
  console.log('Fetching distinct assignees from tickets...');
  const { data: tickets, error } = await supabase.from('tickets').select('assignee_id, assignee_name').not('assignee_id', 'is', null);
  
  if (error) {
    console.error('Error fetching tickets:', error);
    process.exit(1);
  }

  const agentsMap = new Map();
  for (const t of tickets) {
    if (t.assignee_id && t.assignee_name) {
      agentsMap.set(t.assignee_id, t.assignee_name);
    }
  }

  console.log(`Found ${agentsMap.size} unique agents. Inserting into zendesk_agents...`);
  
  for (const [id, name] of agentsMap.entries()) {
    const { error: upsertError } = await supabase.from('zendesk_agents').upsert({
      id,
      name,
      is_active: true
    }, { onConflict: 'id' });
    
    if (upsertError) {
      console.error(`Error inserting agent ${name}:`, upsertError);
    }
  }
  
  console.log('Done!');
}

run();
