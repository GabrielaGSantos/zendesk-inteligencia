require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('Criando tabela catalog_products...');
  const { error: e1 } = await supabase.rpc('execute_sql', { 
    sql_query: `
      CREATE TABLE IF NOT EXISTS catalog_products (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
      );
    `
  });
  if (e1 && !e1.message.includes('function "execute_sql" does not exist')) {
    console.error('Erro na criação:', e1);
  }

  // Se o RPC não existir, teremos que criar as tabelas via painel. Mas vamos tentar.
  // Na verdade, a maneira mais fácil de criar a tabela via API Supabase sem RPC é inserindo dados se a tabela existir, 
  // caso contrário ela falhará. Como não temos certeza se podemos rodar SQL arbitrário, vou checar se consigo criar.
}
run();
