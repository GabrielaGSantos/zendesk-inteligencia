-- SQL Editor no Supabase

-- 1. Colunas de Carga Operacional na Tabela de Análise da IA
ALTER TABLE ticket_analysis 
ADD COLUMN IF NOT EXISTS operational_effort TEXT,
ADD COLUMN IF NOT EXISTS criticality TEXT,
ADD COLUMN IF NOT EXISTS expected_completion_effort TEXT,
ADD COLUMN IF NOT EXISTS effort_reason TEXT;

-- 2. Coluna de Configuração na Tabela Existente (system_settings)
ALTER TABLE system_settings 
ADD COLUMN IF NOT EXISTS workload_config JSONB;

-- 3. Atualizar a Linha Única de Configuração (ID = 1) com os Parâmetros da Fila
UPDATE system_settings
SET workload_config = '{
  "capacity": {
    "total_hours_available": 320
  },
  "points": {
    "Crítico": 5,
    "Alto": 4,
    "Médio": 2,
    "Baixo": 1
  },
  "hours": {
    "Crítico": 8,
    "Alto": 12,
    "Médio": 4,
    "Baixo": 1
  }
}'::jsonb
WHERE id = 1;
