
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { getAdminDatabase } from './server/database.ts';
import { startAnalysis } from './server/ai-analyzer.ts';
async function run() {
  try {
    console.log('Iniciando análise em lote diretamente...');
    const db = getAdminDatabase();
    await startAnalysis(process.env.GEMINI_API_KEY, db);
    console.log('Análise concluída!');
  } catch (e) {
    console.error(e);
  }
}
run();

