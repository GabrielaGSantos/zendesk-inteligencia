import Database from 'better-sqlite3';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const dbPath = path.join(DATA_DIR, 'zendesk.db');

const db = new Database(dbPath);

console.log('Iniciando migração FTS5...');

// Primeiro, garantir que a tabela FTS5 e os triggers existam
import { initializeDatabase } from './server/database';
db.exec('DROP TABLE IF EXISTS ticket_fts');
initializeDatabase(db);

// Deletar qualquer dado existente no FTS para evitar duplicatas
// Reconstruir a tabela a partir da tabela content original ('tickets')
db.exec("INSERT INTO ticket_fts(ticket_fts) VALUES('rebuild')");

console.log('Tabela FTS reconstruída com sucesso.');
db.close();
