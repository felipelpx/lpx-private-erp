-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Migração v14
--   Apuramento trimestral de IVA
--
--   O ERP já lia o valor base, o IVA e a taxa de cada fatura (o leitor por IA
--   extrai-os), mas deitava-os fora antes de gravar. Esta migração dá-lhes
--   sítio, e cria a view que o ecrã do IVA consome.
--
--   Dois lados, de duas tabelas:
--     · IVA a abater  — faturas de fornecedores  (tabela `faturas`)
--     · IVA a pagar   — faturas emitidas a clientes (tabela `recebiveis`,
--                        as linhas que têm número e data de fatura)
--
--   O que conta é a DATA DE EMISSÃO, não o pagamento. Uma fatura entra no
--   apuramento assim que está registada, paga ou não.
--
-- Correr no SQL Editor do Supabase. É idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1 · Faturas de fornecedores
-- ───────────────────────────────────────────────────────────────────────────
-- data_fatura é a data de emissão. Até aqui só existia `vencimento`, que é
-- outra coisa: uma fatura emitida a 28/09 e a vencer a 15/10 é IVA de setembro.
ALTER TABLE faturas ADD COLUMN IF NOT EXISTS data_fatura   date;
ALTER TABLE faturas ADD COLUMN IF NOT EXISTS valor_base    numeric;
ALTER TABLE faturas ADD COLUMN IF NOT EXISTS valor_iva     numeric;
ALTER TABLE faturas ADD COLUMN IF NOT EXISTS taxa_iva      numeric;
-- true = o IVA não foi lido da fatura, foi deduzido. Serve para separar o que
-- é documento do que é estimativa.
ALTER TABLE faturas ADD COLUMN IF NOT EXISTS iva_estimado  boolean NOT NULL DEFAULT false;
ALTER TABLE faturas ADD COLUMN IF NOT EXISTS fornecedor_nif text;

-- ───────────────────────────────────────────────────────────────────────────
-- 2 · Faturas emitidas a clientes (dentro do Contas a Receber)
-- ───────────────────────────────────────────────────────────────────────────
-- Um recebível é uma PREVISÃO de entrada. Passa a poder ser também uma fatura
-- emitida: é o que tem numero_fatura e data_fatura preenchidos — e só essas
-- contam para o IVA. As previsões continuam a ser só previsões.
ALTER TABLE recebiveis ADD COLUMN IF NOT EXISTS numero_fatura text;
ALTER TABLE recebiveis ADD COLUMN IF NOT EXISTS data_fatura   date;
ALTER TABLE recebiveis ADD COLUMN IF NOT EXISTS nif           text;
ALTER TABLE recebiveis ADD COLUMN IF NOT EXISTS valor_base    numeric;
ALTER TABLE recebiveis ADD COLUMN IF NOT EXISTS valor_iva     numeric;
ALTER TABLE recebiveis ADD COLUMN IF NOT EXISTS taxa_iva      numeric;
ALTER TABLE recebiveis ADD COLUMN IF NOT EXISTS iva_estimado  boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_faturas_data_fatura ON faturas(data_fatura);
CREATE INDEX IF NOT EXISTS idx_receb_data_fatura   ON recebiveis(data_fatura)
  WHERE data_fatura IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 3 · Histórico: deduzir o IVA a 23% do valor total
-- ───────────────────────────────────────────────────────────────────────────
-- As faturas que já estavam no ERP não trazem IVA nenhum, porque o campo não
-- existia. Deduz-se de trás para a frente a partir do total, à taxa normal:
--     base = total / 1,23      IVA = total − base
-- Ficam marcadas com iva_estimado = true. Onde a taxa real não for 23%
-- (isentos, 6%, 13%), o valor está errado — é por isso que a marca existe e é
-- visível no ecrã. Corrigir uma fatura à mão limpa a marca.
--
-- Só toca em faturas sem IVA registado: correr de novo não estraga o que
-- entretanto tiver sido corrigido.
UPDATE faturas
   SET valor_base   = round((valor / 1.23)::numeric, 2),
       valor_iva    = round((valor - valor / 1.23)::numeric, 2),
       taxa_iva     = 23,
       iva_estimado = true
 WHERE valor_iva IS NULL
   AND valor IS NOT NULL
   AND valor <> 0;

-- A data de emissão em falta assume-se igual ao vencimento — é a melhor
-- aproximação que há, e fica visível no ecrã para ser corrigida.
UPDATE faturas SET data_fatura = vencimento
 WHERE data_fatura IS NULL AND vencimento IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 4 · Pagamentos do IVA ao Estado
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iva_pagamentos (
  id             text PRIMARY KEY,
  empresa        text NOT NULL,
  ano            int  NOT NULL,
  trimestre      int  NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  valor_pago     numeric NOT NULL DEFAULT 0,
  data_pagamento date,
  pago_por       text,
  obs            text DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa, ano, trimestre)
);

ALTER TABLE iva_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE iva_pagamentos REPLICA IDENTITY FULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON iva_pagamentos TO authenticated;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE iva_pagamentos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "ver_iva_pagamentos"    ON iva_pagamentos;
DROP POLICY IF EXISTS "editar_iva_pagamentos" ON iva_pagamentos;
CREATE POLICY "ver_iva_pagamentos" ON iva_pagamentos FOR SELECT TO authenticated
  USING (public.pode_ver_empresa(empresa));
CREATE POLICY "editar_iva_pagamentos" ON iva_pagamentos FOR ALL TO authenticated
  USING (public.meu_role() IN ('admin','gestor'))
  WITH CHECK (public.meu_role() IN ('admin','gestor'));

-- ───────────────────────────────────────────────────────────────────────────
-- 5 · View de apuramento
-- ───────────────────────────────────────────────────────────────────────────
-- Uma linha por documento, dos dois lados, já com mês e trimestre calculados.
-- É esta a fonte do ecrã: qualquer fatura que entre por importação, por script
-- ou à mão aparece aqui sem mais nada ser preciso.
--
-- Fora do apuramento: documentos anulados, e recebíveis que são só previsão
-- (sem número nem data de fatura não há documento fiscal nenhum).
CREATE OR REPLACE VIEW vw_iva_documentos AS
WITH base AS (
  SELECT
    'fornecedor'::text                         AS tipo,
    f.id,
    f.empresa,
    COALESCE(NULLIF(f.fatura, ''), f.id)       AS documento,
    COALESCE(NULLIF(f.fornecedor, ''), '—')    AS entidade,
    f.fornecedor_nif                           AS nif,
    COALESCE(f.data_fatura, f.vencimento)      AS data_fatura,
    COALESCE(f.valor_base, 0)                  AS valor_base,
    COALESCE(f.valor_iva, 0)                   AS valor_iva,
    f.taxa_iva,
    f.iva_estimado,
    f.status                                   AS estado,
    f.categoria,
    f.projeto
  FROM faturas f
  WHERE lower(btrim(COALESCE(f.status, ''))) NOT IN ('anulada','cancelada','rejeitada')

  UNION ALL

  SELECT
    'cliente'::text,
    r.id,
    r.empresa,
    COALESCE(NULLIF(r.numero_fatura, ''), r.id),
    COALESCE(NULLIF(r.cliente, ''), NULLIF(r.descricao, ''), '—'),
    r.nif,
    r.data_fatura,
    COALESCE(r.valor_base, 0),
    COALESCE(r.valor_iva, 0),
    r.taxa_iva,
    r.iva_estimado,
    r.status,
    NULL,
    r.projeto
  FROM recebiveis r
  WHERE r.data_fatura IS NOT NULL
    AND lower(btrim(COALESCE(r.status, ''))) NOT IN ('anulada','cancelada','cancelado')
)
SELECT
  tipo, id, empresa, documento, entidade, nif, data_fatura,
  valor_base, valor_iva, taxa_iva, iva_estimado, estado, categoria, projeto,
  EXTRACT(YEAR  FROM data_fatura)::int                  AS ano,
  EXTRACT(MONTH FROM data_fatura)::int                  AS mes,
  (FLOOR((EXTRACT(MONTH FROM data_fatura)::int - 1) / 3) + 1)::int AS trimestre
FROM base
WHERE data_fatura IS NOT NULL;

GRANT SELECT ON vw_iva_documentos TO authenticated;

-- A view herda o RLS das tabelas de origem (security invoker), por isso um
-- investidor continua a ver só o que já via.
DO $$ BEGIN
  EXECUTE 'ALTER VIEW vw_iva_documentos SET (security_invoker = true)';
EXCEPTION WHEN OTHERS THEN NULL;   -- Postgres < 15 não tem a opção
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════════════════════
SELECT tipo, count(*) AS documentos,
       round(sum(valor_base)::numeric, 2) AS base,
       round(sum(valor_iva)::numeric, 2)  AS iva,
       count(*) FILTER (WHERE iva_estimado) AS com_iva_estimado
  FROM vw_iva_documentos
 GROUP BY tipo ORDER BY tipo;

SELECT empresa, ano, trimestre,
       round(sum(valor_iva) FILTER (WHERE tipo = 'cliente')::numeric, 2)    AS iva_a_pagar,
       round(sum(valor_iva) FILTER (WHERE tipo = 'fornecedor')::numeric, 2) AS iva_a_abater,
       round((COALESCE(sum(valor_iva) FILTER (WHERE tipo = 'cliente'), 0)
            - COALESCE(sum(valor_iva) FILTER (WHERE tipo = 'fornecedor'), 0))::numeric, 2) AS saldo
  FROM vw_iva_documentos
 GROUP BY empresa, ano, trimestre
 ORDER BY ano DESC, trimestre DESC, empresa;
