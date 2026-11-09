-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Repartir uma fatura por várias categorias
--
-- Uma fatura do empreiteiro traz obra e trabalhos a mais; uma da Autoridade
-- Tributária traz IMI e imposto de selo. Classificá-la toda numa categoria só
-- obriga a escolher a que pesa mais e a mentir no resto — e é no resto que
-- depois ninguém encontra o dinheiro.
--
-- A repartição fica numa coluna `rateio`, uma lista em JSON. Cada linha é um
-- valor OU uma percentagem do total da fatura:
--
--   [{"categoria":"Obras","subcategoria":"Gastos com Obras","valor":15000},
--    {"categoria":"Soft_Costs","subcategoria":"Projetos","pct":25}]
--
-- Guarda-se COMO foi definido — percentagem ou euro. Converter a % em euros
-- ao gravar fazia a repartição deixar de acompanhar uma correção do valor da
-- fatura, que é metade da razão para usar percentagens.
--
-- Sem esta coluna a app continua a funcionar: a escrita das faturas ignora os
-- campos que a base não conhece. Mas a repartição não fica gravada.
--
-- Correr no SQL Editor do Supabase. É idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 0. O que já lá está (só lê)
-- ───────────────────────────────────────────────────────────────────────────
SELECT column_name AS coluna, data_type AS tipo, column_default AS por_omissao
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'faturas'
 ORDER BY ordinal_position;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A coluna
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE faturas
  ADD COLUMN IF NOT EXISTS rateio jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN faturas.rateio IS
  'Repartição da fatura por categorias: lista de {categoria, subcategoria, '
  'valor | pct}. Vazia = a fatura é classificada pelos campos categoria/'
  'subcategoria normais. Quando preenchida, é ela que decide por que rubricas '
  'a fatura passa no Fluxo Futuro e no Real x Orcado.';

-- Tem de ser mesmo uma LISTA. Um objeto solto ou um número aqui dentro
-- punha o ecrã a ler o que não esperava, e a app trata disso em silêncio —
-- melhor a base recusar já.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'faturas_rateio_e_lista') THEN
    ALTER TABLE faturas
      ADD CONSTRAINT faturas_rateio_e_lista
      CHECK (jsonb_typeof(rateio) = 'array');
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Conferir
--    As faturas repartidas, com a soma das partes ao lado do total. A soma
--    tem de bater — o ecrã não deixa gravar de outra maneira, e o motor
--    fecha a conta à força, mas se alguma linha vier de outro sítio é aqui
--    que se vê.
-- ───────────────────────────────────────────────────────────────────────────
WITH partes AS (
  SELECT f.id, f.fornecedor, f.fatura, f.empresa, ABS(f.valor) AS total,
         SUM(COALESCE((p->>'valor')::numeric,
                      ABS(f.valor) * COALESCE((p->>'pct')::numeric, 0) / 100)) AS soma,
         COUNT(*) AS n_partes
    FROM faturas f, LATERAL jsonb_array_elements(f.rateio) p
   GROUP BY f.id, f.fornecedor, f.fatura, f.empresa, f.valor
)
SELECT empresa, fornecedor, fatura, n_partes,
       ROUND(total, 2) AS total,
       ROUND(soma, 2)  AS soma_das_partes,
       ROUND(total - soma, 2) AS diferenca,
       CASE WHEN ABS(total - soma) < 0.005 THEN 'fecha' ELSE 'NÃO FECHA' END AS estado
  FROM partes
 ORDER BY ABS(total - soma) DESC, empresa, fornecedor;

-- Quantas faturas estão repartidas, por empresa.
SELECT empresa,
       COUNT(*) FILTER (WHERE jsonb_array_length(rateio) > 0) AS repartidas,
       COUNT(*) AS total_faturas
  FROM faturas
 GROUP BY empresa
 ORDER BY empresa;
