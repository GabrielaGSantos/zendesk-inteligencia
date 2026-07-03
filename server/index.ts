import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { getDatabase, getAdminDatabase, initializeDatabase } from './database.js';
import { createRoutes } from './routes.js';

// Load environment variables from project root
dotenv.config({ path: path.join(process.cwd(), '.env'), override: true });

const app = express();
const PORT = parseInt(process.env.PORT || '3002', 10);

// Initialize database with service role to bypass RLS and act as a trusted backend
const db = getAdminDatabase();
initializeDatabase(db);
console.log('✅ Banco de dados Supabase inicializado');

// Seed default admin via Supabase Auth
(async () => {
  try {
    const adminAuth = getAdminDatabase().auth.admin;
    const { data: usersData, error: listError } = await adminAuth.listUsers();
    
    const adminEmail = 'gabriela@mpxbrasil.com.br';
    const exists = usersData?.users?.some(u => u.email === adminEmail);

    if (!exists && !listError) {
      const { data: authData, error: authError } = await adminAuth.createUser({
        email: adminEmail,
        password: 'mpxAdmin!2026@',
        email_confirm: true
      });

      if (!authError && authData.user) {
        await getAdminDatabase().from('users').upsert({
          id: authData.user.id,
          name: 'Gabriela (Admin)',
          email: adminEmail,
          role: 'admin'
        });
        console.log('✅ Usuário administrador (gabriela) criado no Supabase Auth com sucesso');
      }
    }
  } catch (err: any) {
    console.error('⚠️ Falha ao verificar/criar usuário admin no Auth:', err.message);
  }
})();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use(createRoutes(db));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    database: 'connected',
    timestamp: new Date().toISOString(),
  });
});

// Serve static frontend files in production
const distPath = path.join(process.cwd(), 'dist');
app.use(express.static(distPath));

// Fallback for React Router (catch-all)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(distPath, 'index.html'));
  } else {
    next();
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Servidor local rodando em http://localhost:${PORT}`);
  console.log(`📊 Central de Inteligência Zendesk — Backend pronto`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Encerrando servidor...');
  process.exit(0);
});
