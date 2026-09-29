-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Migração v12
--   Funding bancário nas despesas
--
--   Há despesas que o banco financia: o empreiteiro é pago, mas o banco
--   liberta o mesmo montante (ou a percentagem contratada). Em caixa a
--   despesa fica neutralizada. Estas duas colunas guardam essa marcação
--   na própria despesa — previsão (pagamentos_extras) ou fatura (faturas) —
--   para andar com ela quando a previsão se converte em custo real.
--
-- Correr no SQL Editor do Supabase. É idempotente.
-- Nada é apagado nem recalculado: por defeito todas as despesas ficam
-- SEM funding, exatamente como estão hoje.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Previsões do Fluxo Futuro ─────────────────────────────────────────────
ALTER TABLE pagamentos_extras ADD COLUMN IF NOT EXISTS funding     boolean NOT NULL DEFAULT false;
ALTER TABLE pagamentos_extras ADD COLUMN IF NOT EXISTS funding_pct numeric NOT NULL DEFAULT 100;

-- ─── Faturas do Contas a Pagar ─────────────────────────────────────────────
ALTER TABLE faturas ADD COLUMN IF NOT EXISTS funding     boolean NOT NULL DEFAULT false;
ALTER TABLE faturas ADD COLUMN IF NOT EXISTS funding_pct numeric NOT NULL DEFAULT 100;

-- A percentagem é uma percentagem: 0 a 100, sem surpresas vindas de um
-- import ou de um dedo enganado.
DO $$ BEGIN
  ALTER TABLE pagamentos_extras
    ADD CONSTRAINT pagamentos_extras_funding_pct_valida CHECK (funding_pct >= 0 AND funding_pct <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE faturas
    ADD CONSTRAINT faturas_funding_pct_valida CHECK (funding_pct >= 0 AND funding_pct <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índices parciais: as despesas financiadas são a minoria, e é por elas que
-- se filtra quando se quer ver o que o banco cobre.
CREATE INDEX IF NOT EXISTS idx_pag_funding ON pagamentos_extras(empresa) WHERE funding;
CREATE INDEX IF NOT EXISTS idx_fat_funding ON faturas(empresa) WHERE funding;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA — as quatro colunas devem aparecer, e nenhuma despesa deve
-- estar marcada como financiada antes de o fazeres no ecrã.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT table_name, column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name IN ('pagamentos_extras','faturas')
   AND column_name IN ('funding','funding_pct')
 ORDER BY table_name, column_name;

SELECT 'previsões financiadas' AS o_que, count(*) AS quantas FROM pagamentos_extras WHERE funding
UNION ALL
SELECT 'faturas financiadas',            count(*)            FROM faturas           WHERE funding;
