-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Marcar as faturas de obra como financiadas pelo banco
--
--   Põe funding = true e funding_pct = 100 em todas as faturas de obra, de
--   todos os projetos. A partir daí, o Fluxo Futuro gera a entrada do banco
--   no mesmo mês e a despesa deixa de pesar no caixa do projeto.
--
-- DEPENDE da migração v12 (colunas funding / funding_pct). Corre-a primeiro.
-- Corre os passos POR ORDEM e lê o passo 1 antes de executar o passo 2.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 1 · O QUE VAI MUDAR (não altera nada — é só para veres)
--
-- A coluna "vai_marcar" diz o que acontece a cada categoria. Confere sobretudo
-- as linhas marcadas "decide tu": são categorias que falam de obra mas que
-- podem não ser custo de construção (seguros, taxas), e ficam de FORA.
-- ───────────────────────────────────────────────────────────────────────────
WITH norm AS (
  SELECT id, empresa, categoria, valor, fornecedor, status,
         lower(translate(btrim(coalesce(categoria,'')),
               'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
               'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) AS cat
    FROM faturas
)
SELECT coalesce(nullif(categoria,''), '— sem categoria —') AS categoria,
       count(*)   AS faturas,
       sum(valor) AS total,
       CASE
         WHEN cat IN ('obra','obras','gastos com obras') THEN 'SIM — vai ficar a 100%'
         WHEN cat LIKE '%obra%'                          THEN 'decide tu (fica de fora)'
         ELSE '—'
       END AS vai_marcar
  FROM norm
 GROUP BY categoria, cat
 ORDER BY vai_marcar, sum(valor) DESC;


-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 2 · APLICAR
--
-- Se no passo 1 aparecer alguma categoria em "decide tu" que também queiras
-- incluir, acrescenta-a à lista da linha do IN abaixo (em minúsculas e sem
-- acentos) antes de correr.
-- ───────────────────────────────────────────────────────────────────────────
BEGIN;

-- Guarda o estado anterior, para poder reverter mais tarde se for preciso
CREATE TABLE IF NOT EXISTS funding_obra_backup (
  id           text PRIMARY KEY,
  funding_ant  boolean,
  pct_ant      numeric,
  gravado_em   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO funding_obra_backup (id, funding_ant, pct_ant)
SELECT id, funding, funding_pct
  FROM faturas
 WHERE lower(translate(btrim(coalesce(categoria,'')),
             'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
             'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
       IN ('obra','obras','gastos com obras')
ON CONFLICT (id) DO NOTHING;

UPDATE faturas
   SET funding = true, funding_pct = 100
 WHERE lower(translate(btrim(coalesce(categoria,'')),
             'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
             'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
       IN ('obra','obras','gastos com obras')
   AND (funding IS DISTINCT FROM true OR funding_pct IS DISTINCT FROM 100);

COMMIT;


-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 3 · CONFERIR
-- ───────────────────────────────────────────────────────────────────────────
SELECT empresa,
       count(*)   AS faturas_financiadas,
       sum(valor) AS total_financiado
  FROM faturas
 WHERE funding
 GROUP BY empresa
 ORDER BY empresa;

SELECT count(*) AS total_faturas_financiadas, sum(valor) AS valor_total
  FROM faturas WHERE funding;


-- ───────────────────────────────────────────────────────────────────────────
-- REVERTER (só se te arrependeres — corre este bloco à parte)
-- ───────────────────────────────────────────────────────────────────────────
-- UPDATE faturas f
--    SET funding = b.funding_ant, funding_pct = b.pct_ant
--   FROM funding_obra_backup b
--  WHERE f.id = b.id;
-- DROP TABLE funding_obra_backup;
