require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runQuarantine() {
  console.log('Iniciando quarentena de padrões com < 5 tickets...');

  // 1. Buscar todos os padrões e seus contadores (vamos recalcular o count real para garantir)
  const { data: patterns, error } = await supabase.from('pattern_groups').select('id, name');
  if (error || !patterns) {
    console.error('Erro ao buscar padrões:', error);
    return;
  }

  let kept = [];
  let archived = [];
  let affectedTickets = 0;

  console.log(`Encontrados ${patterns.length} padrões. Recalculando tickets e filtrando...`);

  for (const pattern of patterns) {
    // Contar tickets reais vinculados no momento
    const { count } = await supabase
      .from('ticket_analysis')
      .select('*', { count: 'exact', head: true })
      .eq('pattern_group_id', pattern.id);
      
    const realCount = count || 0;

    if (realCount < 5) {
      archived.push({ id: pattern.id, name: pattern.name, count: realCount });
      
      // Remover vínculo
      if (realCount > 0) {
        await supabase
          .from('ticket_analysis')
          .update({ pattern_group_id: null })
          .eq('pattern_group_id', pattern.id);
        affectedTickets += realCount;
      }

      // Marcar como arquivado (e zerar o contador)
      await supabase
        .from('pattern_groups')
        .update({ status: 'archived', ticket_count: 0 })
        .eq('id', pattern.id);

    } else {
      kept.push({ id: pattern.id, name: pattern.name, count: realCount });
      // Atualizar count real só pra garantir integridade
      await supabase
        .from('pattern_groups')
        .update({ ticket_count: realCount })
        .eq('id', pattern.id);
    }
  }

  // 2. Gerar o Relatório
  const reportPath = 'c:\\Users\\Gabriela\\.gemini\\antigravity-ide\\brain\\cd8cf0b6-4c40-4acc-bc1e-0b9c1b029b2e\\quarantine_report.md';
  
  let reportContent = `# Relatório de Quarentena de Padrões da IA\n\n`;
  reportContent += `Processamento concluído com sucesso.\n\n`;
  reportContent += `- **Padrões Mantidos:** ${kept.length}\n`;
  reportContent += `- **Padrões Arquivados:** ${archived.length}\n`;
  reportContent += `- **Tickets Afetados (desvinculados):** ${affectedTickets}\n\n`;
  
  reportContent += `## Padrões Sobreviventes (Mantidos)\n`;
  kept.sort((a,b) => b.count - a.count).forEach(p => {
    reportContent += `- **${p.name}** (${p.count} tickets)\n`;
  });
  if(kept.length === 0) reportContent += `- *Nenhum padrão sobreviveu à régua de 5 tickets.*\n`;

  reportContent += `\n## Exemplos de Padrões Arquivados\n`;
  archived.sort((a,b) => b.count - a.count).slice(0, 50).forEach(p => {
    reportContent += `- **${p.name}** (${p.count} tickets)\n`;
  });
  if(archived.length > 50) {
    reportContent += `- *(... e mais ${archived.length - 50} padrões menores)*\n`;
  }

  fs.writeFileSync(reportPath, reportContent, 'utf-8');
  console.log(`\n✅ Quarentena finalizada! Arquivados: ${archived.length}. Relatório gerado em quarantine_report.md.`);
}

runQuarantine();
