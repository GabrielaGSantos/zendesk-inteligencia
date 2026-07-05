require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PRODUCT_MAPPINGS = {
  // Site
  'Site': 'Site Institucional',
  'Portal Oficial': 'Site Institucional',
  'Portal da Prefeitura': 'Site Institucional',
  'Hotsite': 'Site Institucional',
  'Portal Hibrido': 'Site Institucional',
  'Portal Hybrido': 'Site Institucional',
  'Portal Híbrido': 'Site Institucional',

  // PNTP
  'PNTP': 'Portal da Transparência',
  'Portal Transparência': 'Portal da Transparência',

  // Inscrições
  'Sistema de Inscrição': 'Sistema de Inscrições',
  'Inscrições para Eventos': 'Sistema de Inscrições',
  'Plataforma de Inscrições': 'Sistema de Inscrições',
  'Portal de Inscrições': 'Sistema de Inscrições',
  'Portal de Inscrições da Pesca': 'Sistema de Inscrições',

  // E-mail
  'Webmail': 'E-mail Institucional',
  'E-mail': 'E-mail Institucional',

  // Ouvidoria
  'Portal da Ouvidoria': 'Ouvidoria',

  // Outros a serem migrados para "Outros"
  'Google Drive': 'Outros',
  'Google Meet': 'Outros',
  'Google Analytics': 'Outros',
  'Meet': 'Outros',
  'DNS': 'Outros',
  'Domínio': 'Outros',
  'SSL': 'Outros',
  'Outlook': 'Outros',
  'SMTP': 'Outros',
  'IMAP': 'Outros',
  'Spam': 'Outros',
  'SPAM': 'Outros',
  'Firewall': 'Outros',
  'PHP': 'Outros',
  'Banco de Dados': 'Outros'
};

const CATEGORY_MAPPINGS = {
  // Conteúdo
  'Operacional > Edição via CMS': 'Gestão de Conteúdo',
  'Publicação de site': 'Gestão de Conteúdo',
  'Alterações no Portal': 'Gestão de Conteúdo',
  'Publicação de Documentos': 'Gestão de Conteúdo',
  'Atualização de Conteúdo': 'Gestão de Conteúdo',
  'Criação de Conteúdo': 'Gestão de Conteúdo',
  'Edição de Documento': 'Gestão de Conteúdo',

  // Acessos
  'Operacional > Acesso Master': 'Gestão de Usuários e Permissões',
  'Operacional > Acesso de Usuário': 'Gestão de Usuários e Permissões',
  'Operacional > Acesso e Permissões': 'Gestão de Usuários e Permissões',
  'Operacional > Alteração de Senha': 'Gestão de Usuários e Permissões',
  'Operacional > Cadastrar Usuário': 'Gestão de Usuários e Permissões',
  'Operacional > Cadastrar/Excluir Usuário': 'Gestão de Usuários e Permissões',
  'Operacional > Cadastro de Usuário': 'Gestão de Usuários e Permissões',
  'Operacional > Criação de Acesso': 'Gestão de Usuários e Permissões',
  'Operacional > Criação de Usuário': 'Gestão de Usuários e Permissões',
  'Operacional > Desbloqueio de Acesso': 'Gestão de Usuários e Permissões',

  // E-mail
  'Operacional > Acesso a Conta de E-mail': 'Gestão de E-mails',
  'Operacional > Acesso a E-mail': 'Gestão de E-mails',
  'Operacional > Backup de E-mail': 'Gestão de E-mails',
  'Operacional > Configuração de E-mail': 'Gestão de E-mails',
  'Operacional > Criação de Acesso de E-mail': 'Gestão de E-mails',
  'Operacional > Criação de Conta de E-mail': 'Gestão de E-mails',
  'Operacional > Criação de E-mail': 'Gestão de E-mails',
  'Operacional > Criação de E-mail Institucional': 'Gestão de E-mails',
  'Operacional > Desbloqueio de Conta de E-mail': 'Gestão de E-mails',
  'Operacional > Desbloqueio de E-mail': 'Gestão de E-mails'
};

async function sanitizeDatabase() {
  console.log('Iniciando saneamento de produtos e categorias...');

  let hasMore = true;
  let page = 0;
  const pageSize = 1000;
  let updatedCount = 0;

  while (hasMore) {
    const { data: tickets, error } = await supabase
      .from('ticket_analysis')
      .select('ticket_zendesk_id, product, category')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Erro ao buscar tickets:', error);
      break;
    }

    if (!tickets || tickets.length === 0) {
      hasMore = false;
      break;
    }

    for (const ticket of tickets) {
      let needsUpdate = false;
      let newProduct = ticket.product;
      let newCategory = ticket.category;

      if (PRODUCT_MAPPINGS[newProduct]) {
        newProduct = PRODUCT_MAPPINGS[newProduct];
        needsUpdate = true;
      }

      if (CATEGORY_MAPPINGS[newCategory]) {
        newCategory = CATEGORY_MAPPINGS[newCategory];
        needsUpdate = true;
      }

      // Also clean up categories that contain ">" if we want to aggressively normalize them
      if (!needsUpdate && newCategory && newCategory.includes('>')) {
        const parts = newCategory.split('>');
        const tail = parts[parts.length - 1].trim();
        if (CATEGORY_MAPPINGS[tail]) {
          newCategory = CATEGORY_MAPPINGS[tail];
          needsUpdate = true;
        } else if (CATEGORY_MAPPINGS[newCategory]) {
          newCategory = CATEGORY_MAPPINGS[newCategory];
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await supabase
          .from('ticket_analysis')
          .update({ product: newProduct, category: newCategory })
          .eq('ticket_zendesk_id', ticket.ticket_zendesk_id);
        updatedCount++;
      }
    }

    page++;
    console.log(`Processados ${(page * pageSize)} tickets... Atualizados: ${updatedCount}`);
  }

  console.log(`\n✅ Saneamento concluído! Total de registros corrigidos: ${updatedCount}`);
}

sanitizeDatabase();
