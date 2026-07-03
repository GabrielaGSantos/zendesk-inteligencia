import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

let supabaseInstance: SupabaseClient | null = null;
let supabaseAdminInstance: SupabaseClient | null = null;

export function getDatabase(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Faltam variáveis de ambiente SUPABASE_URL ou SUPABASE_ANON_KEY');
  }

  supabaseInstance = createClient(supabaseUrl, supabaseKey);
  return supabaseInstance;
}

export function getAdminDatabase(): SupabaseClient {
  if (supabaseAdminInstance) return supabaseAdminInstance;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Faltam variáveis de ambiente SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY');
  }

  supabaseAdminInstance = createClient(supabaseUrl, supabaseServiceKey);
  return supabaseAdminInstance;
}

// In Supabase, the schema is managed via the console, so initialization is just a no-op here for compatibility.
export function initializeDatabase(db: SupabaseClient): void {
  console.log('✅ Conexão com Supabase estabelecida');
}
