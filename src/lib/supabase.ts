import { createClient } from '@supabase/supabase-js';

// No frontend, a URL e KEY do Supabase podem ser passadas pelo Vite ou estáticas.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nimekajvtjscdfizpxym.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_mlEkn8d7Ltnu7zWCB-2kVg_h3s51BAz';

export const supabase = createClient(supabaseUrl, supabaseKey);
