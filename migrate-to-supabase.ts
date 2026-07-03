import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY; 

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltam SUPABASE_URL ou SUPABASE_ANON_KEY no arquivo .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const DATA_DIR = path.join(process.cwd(), 'data');
const dbPath = path.join(DATA_DIR, 'zendesk.db');
const sqlite = new Database(dbPath);

async function migrateData() {
  console.log("Iniciando migração do SQLite para Supabase...");

  try {
    // 1. Migrar Tickets
    console.log("Lendo Tickets...");
    const tickets = sqlite.prepare('SELECT * FROM tickets').all() as any[];
    console.log(`Enviando ${tickets.length} tickets...`);
    
    const chunkSize = 100;
    for (let i = 0; i < tickets.length; i += chunkSize) {
      const chunk = tickets.slice(i, i + chunkSize);
      const { error } = await supabase.from('tickets').upsert(
        chunk.map(t => ({
          zendesk_id: t.zendesk_id,
          ticket_number: t.ticket_number,
          subject: t.subject,
          description: t.description,
          status: t.status,
          priority: t.priority,
          ticket_type: t.ticket_type,
          requester_id: t.requester_id,
          requester_name: t.requester_name,
          requester_email: t.requester_email,
          organization_id: t.organization_id,
          organization_name: t.organization_name,
          assignee_id: t.assignee_id,
          assignee_name: t.assignee_name,
          group_id: t.group_id,
          group_name: t.group_name,
          tags: t.tags,
          custom_fields: t.custom_fields,
          form_id: t.form_id,
          created_at: t.created_at,
          updated_at: t.updated_at,
          solved_at: t.solved_at,
          due_date: t.due_date,
          zendesk_url: t.zendesk_url,
          raw_json: t.raw_json,
          synced_at: t.synced_at
        })), { onConflict: 'zendesk_id' }
      );
      if (error) throw new Error(`Erro ao inserir tickets: ${error.message}`);
    }

    // 2. Migrar Comentários
    console.log("Lendo Comentários...");
    const comments = sqlite.prepare('SELECT * FROM ticket_comments').all() as any[];
    console.log(`Enviando ${comments.length} comentários...`);
    for (let i = 0; i < comments.length; i += chunkSize) {
      const chunk = comments.slice(i, i + chunkSize);
      const { error } = await supabase.from('ticket_comments').upsert(
        chunk.map(c => ({
          zendesk_comment_id: c.zendesk_comment_id,
          ticket_zendesk_id: c.ticket_zendesk_id,
          author_id: c.author_id,
          author_name: c.author_name,
          body: c.body,
          html_body: c.html_body,
          is_public: c.is_public === 1,
          created_at: c.created_at
        })), { onConflict: 'zendesk_comment_id' }
      );
      if (error) throw new Error(`Erro ao inserir comentários: ${error.message}`);
    }

    // 3. Migrar Pattern Groups
    console.log("Lendo Padrões (Pattern Groups)...");
    const patterns = sqlite.prepare('SELECT * FROM pattern_groups').all() as any[];
    console.log(`Enviando ${patterns.length} padrões...`);
    
    for (let i = 0; i < patterns.length; i += chunkSize) {
      const chunk = patterns.slice(i, i + chunkSize);
      const { error } = await supabase.from('pattern_groups').upsert(
        chunk.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          ticket_count: p.ticket_count,
          common_response: p.common_response,
          created_at: p.created_at,
          updated_at: p.updated_at
        }))
      );
      if (error) throw new Error(`Erro ao inserir padrões: ${error.message}`);
    }

    // 4. Migrar Análises
    console.log("Lendo Análises da IA...");
    const analyses = sqlite.prepare('SELECT * FROM ticket_analysis').all() as any[];
    console.log(`Enviando ${analyses.length} análises...`);
    for (let i = 0; i < analyses.length; i += chunkSize) {
      const chunk = analyses.slice(i, i + chunkSize);
      const { error } = await supabase.from('ticket_analysis').upsert(
        chunk.map(a => ({
          ticket_zendesk_id: a.ticket_zendesk_id,
          product: a.product,
          request_type: a.request_type,
          category: a.category,
          client_intent: a.client_intent,
          problem_summary: a.problem_summary,
          identified_pattern: a.identified_pattern,
          suggested_response: a.suggested_response,
          missing_info: a.missing_info,
          recommended_procedure: a.recommended_procedure,
          suggested_priority: a.suggested_priority,
          confidence_level: a.confidence_level,
          pattern_group_id: a.pattern_group_id,
          needs_internal_routing: a.needs_internal_routing,
          solution_applied: a.solution_applied,
          was_reopened: a.was_reopened === 1,
          resolution_time_hours: a.resolution_time_hours,
          analyzed_at: a.analyzed_at
        })), { onConflict: 'ticket_zendesk_id' }
      );
      if (error) throw new Error(`Erro ao inserir análises: ${error.message}`);
    }

    console.log("✅ Migração concluída com sucesso!");

  } catch (err: any) {
    console.error("❌ Falha na migração:", err.message);
  }
}

migrateData();
