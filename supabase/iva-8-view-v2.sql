-- ----------------------------------------------------------
-- LPX PRIVATE - ERP - Apuramento de IVA (migracao v15)
-- FICHEIRO 8 DE 8 - view com o total e a marca de deducao
--
-- Corre este inteiro DEPOIS do 7. Pode ser corrido duas vezes
-- sem fazer mal. Substitui a view criada no ficheiro 5.
-- ----------------------------------------------------------

-- Duas colunas novas em relacao ao ficheiro 5:
--   valor_total   - o total do documento, com IVA. E preciso
--                   para recalcular base e IVA quando se muda
--                   a taxa no ecra: so se conhece o total.
--   iva_dedutivel - a marca do ficheiro 7.
--
-- As faturas nao dedutiveis NAO sao filtradas aqui de
-- proposito: tem de continuar a aparecer na lista, com a
-- marca visivel, para se poder repor a deducao. E o ecra que
-- as soma com IVA zero.
DROP VIEW IF EXISTS vw_iva_documentos;
CREATE VIEW vw_iva_documentos AS
WITH base AS (
  SELECT
    'fornecedor'::text                         AS tipo,
    f.id,
    f.empresa,
    COALESCE(NULLIF(f.fatura, ''), f.id)       AS documento,
    COALESCE(NULLIF(f.fornecedor, ''), '-')    AS entidade,
    f.fornecedor_nif                           AS nif,
    COALESCE(f.data_fatura, f.vencimento)      AS data_fatura,
    COALESCE(f.valor_base, 0)                  AS valor_base,
    COALESCE(f.valor_iva, 0)                   AS valor_iva,
    COALESCE(f.valor, 0)                       AS valor_total,
    f.taxa_iva,
    f.iva_estimado,
    f.iva_dedutivel,
    f.status                                   AS estado,
    f.categoria,
    f.projeto
  FROM faturas f
  WHERE lower(btrim(COALESCE(f.status, '')))
        NOT IN ('anulada','cancelada','rejeitada')

  UNION ALL

  SELECT
    'cliente'::text,
    r.id,
    r.empresa,
    COALESCE(NULLIF(r.numero_fatura, ''), r.id),
    COALESCE(NULLIF(r.cliente, ''), NULLIF(r.descricao, ''), '-'),
    r.nif,
    r.data_fatura,
    COALESCE(r.valor_base, 0),
    COALESCE(r.valor_iva, 0),
    COALESCE(r.valor, 0),
    r.taxa_iva,
    r.iva_estimado,
    r.iva_dedutivel,
    r.status,
    NULL,
    r.projeto
  FROM recebiveis r
  WHERE r.data_fatura IS NOT NULL
    AND lower(btrim(COALESCE(r.status, '')))
        NOT IN ('anulada','cancelada','cancelado')
)
SELECT
  tipo, id, empresa, documento, entidade, nif, data_fatura,
  valor_base, valor_iva, valor_total, taxa_iva,
  iva_estimado, iva_dedutivel, estado, categoria, projeto,
  EXTRACT(YEAR  FROM data_fatura)::int AS ano,
  EXTRACT(MONTH FROM data_fatura)::int AS mes,
  (FLOOR((EXTRACT(MONTH FROM data_fatura)::int - 1) / 3) + 1)::int AS trimestre
FROM base
WHERE data_fatura IS NOT NULL;

GRANT SELECT ON vw_iva_documentos TO authenticated;

-- A view herda o RLS das tabelas de origem (security invoker),
-- por isso um investidor continua a ver so o que ja via.
DO $$ BEGIN
  EXECUTE 'ALTER VIEW vw_iva_documentos SET (security_invoker = true)';
EXCEPTION WHEN OTHERS THEN NULL;   -- Postgres < 15 nao tem a opcao
END $$;

-- Conferencia: o IVA a abater ja sem as faturas nao dedutiveis.
SELECT tipo,
       count(*)                                    AS documentos,
       count(*) FILTER (WHERE NOT iva_dedutivel)   AS fora_do_apuramento,
       round(sum(valor_iva) FILTER (WHERE iva_dedutivel)::numeric, 2) AS iva_que_conta
  FROM vw_iva_documentos
 GROUP BY tipo ORDER BY tipo;
