require('dotenv').config(); 
const { createClient } = require('@supabase/supabase-js'); 
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); 
async function run() { 
  const {data, error} = await supabase.from('tickets').select('id, created_at, solved_at, assignee_name').eq('assignee_name', 'Bruno Takagi').in('status', ['solved','closed']); 
  if (data) { 
    data.forEach(t => { 
      if (t.solved_at) { 
        const hrs = (new Date(t.solved_at).getTime() - new Date(t.created_at).getTime()) / 3600000; 
        console.log('Ticket ' + t.id + ': ' + hrs.toFixed(1) + 'h'); 
      } 
    }); 
  } 
} 
run();
