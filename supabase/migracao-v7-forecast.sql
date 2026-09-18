-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Migração v7
--   Forecast × custo real, estados de fatura e coluna Fatura no extrato
--   (alinha a LPX com o mecanismo do ERP da Rio Capital)
--
-- Correr no SQL Editor do Supabase. É idempotente — pode ser repetido.
-- NÃO apaga nem altera dados existentes: só acrescenta colunas e traduz
-- os estados antigos para os novos.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. FATURAS — data em que tencionamos pagar
--    É esta data (e não o vencimento) que passa a posicionar a fatura no
--    Fluxo Futuro. Se estiver vazia, o fluxo usa o vencimento.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE faturas ADD COLUMN IF NOT EXISTS previsao_pagamento date;

COMMENT ON COLUMN faturas.previsao_pagamento IS
  'Quando tencionamos pagar. Tem precedência sobre `vencimento` no Fluxo Futuro.';

CREATE INDEX IF NOT EXISTS idx_faturas_prev_pagto ON faturas(previsao_pagamento);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. FATURAS — novos estados
--    Antigos → novos:
--      Pendente   → Pendente em dia
--      Aprovada   → Pendente em dia
--      Vencida    → Pendente atrasado
--      Paga       → Pago
--      Em disputa → Pagamento bloqueado
--      Rejeitada  → Pagamento bloqueado
--
--    A app já traduz os estados antigos ao ler, por isso este UPDATE é
--    opcional — serve para normalizar os dados de uma vez.
-- ───────────────────────────────────────────────────────────────────────────
UPDATE faturas SET status = CASE status
  WHEN 'Pendente'   THEN 'Pendente em dia'
  WHEN 'Aprovada'   THEN 'Pendente em dia'
  WHEN 'Vencida'    THEN 'Pendente atrasado'
  WHEN 'Paga'       THEN 'Pago'
  WHEN 'Em disputa' THEN 'Pagamento bloqueado'
  WHEN 'Rejeitada'  THEN 'Pagamento bloqueado'
  ELSE status
END
WHERE status IN ('Pendente','Aprovada','Vencida','Paga','Em disputa','Rejeitada');

-- ───────────────────────────────────────────────────────────────────────────
-- 3. MOVIMENTOS — coluna Fatura no extrato
--    fatura_estado: 'ok' | 'pendente' | 'sem'  (marcação à mão)
--    fatura_ok:     coluna antiga, mantida para os registos já marcados
--    Sem marcação, a app procura sozinha a fatura no Contas a Pagar.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE movimentos ADD COLUMN IF NOT EXISTS fatura_estado text;
ALTER TABLE movimentos ADD COLUMN IF NOT EXISTS fatura_ok     boolean;

COMMENT ON COLUMN movimentos.fatura_estado IS
  'Marcação manual do documento: ok | pendente | sem. Vazio = deteção automática.';

CREATE INDEX IF NOT EXISTS idx_mov_fatura_estado ON movimentos(fatura_estado);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. PAGAMENTOS_EXTRAS — previsões convertidas em custo real
--    Quando chega a fatura de algo que estava previsto, a previsão passa a
--    'Convertida' e sai do fluxo — senão o mês ficava com o valor a dobrar.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE pagamentos_extras ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Pendente';

COMMENT ON COLUMN pagamentos_extras.status IS
  'Pendente | Paga | Convertida. "Convertida" = substituída por uma fatura real.';

CREATE INDEX IF NOT EXISTS idx_pe_status2 ON pagamentos_extras(status);

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════════════════════
SELECT status, count(*) AS faturas, sum(valor) AS total
  FROM faturas GROUP BY status ORDER BY status;

SELECT count(*) FILTER (WHERE previsao_pagamento IS NOT NULL) AS com_previsao,
       count(*) FILTER (WHERE previsao_pagamento IS NULL)     AS sem_previsao
  FROM faturas;

SELECT status, count(*) FROM pagamentos_extras GROUP BY status ORDER BY status;
