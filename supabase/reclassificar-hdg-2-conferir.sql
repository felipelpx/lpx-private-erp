-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Reclassificar os movimentos HDG · 2 de 2 · CONFERIR
--
-- Corre depois do ficheiro 1. Não altera nada — são só leituras.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1 · Quantos movimentos HDG ficaram classificados ─────────────────────
SELECT conta_id,
       count(*)                                                   AS movimentos,
       count(*) FILTER (WHERE categoria IN ('Vendas', 'Aquisição_de_Terreno', 'Licenças_e_Relacionados', 'Obras', 'Soft_Costs', 'Impostos e taxas', 'Intra-Group (TRF)', 'Transferências', 'Financiamento', 'Outros_Diversos', 'Cartão_de_Crédito', 'Sócios', 'Encargos Financeiros', 'Legais', 'Mútuo', 'Ajuste', 'Contabilidade'))             AS no_plano_hdg,
       count(*) FILTER (WHERE COALESCE(subcategoria,'') <> '')     AS com_subcategoria
  FROM movimentos
 WHERE conta_id IN ('adseq_bcp','adseq_red','infinite_bcp','infinite_red')
 GROUP BY conta_id
 ORDER BY conta_id;


-- ─── 2 · O plano de contas como ficou ─────────────────────────────────────
SELECT categoria,
       COALESCE(NULLIF(subcategoria, ''), '—') AS subcategoria,
       count(*)                                AS movimentos,
       round(sum(valor)::numeric, 2)           AS total
  FROM movimentos
 WHERE conta_id IN ('adseq_bcp','adseq_red','infinite_bcp','infinite_red')
 GROUP BY 1, 2
 ORDER BY 1, 2;


-- ─── 3 · Os que o Caixa Único não cobriu ──────────────────────────────────
-- Movimentos HDG que ficaram com uma categoria fora do plano novo: ou são
-- lançamentos posteriores ao ficheiro, ou o descritivo/valor diverge.
-- É esta a lista a rever à mão no ecrã dos Extratos.
SELECT conta_id, data, valor, left(movimento, 52) AS descritivo,
       COALESCE(NULLIF(categoria, ''), '— sem categoria —') AS categoria_atual
  FROM movimentos
 WHERE conta_id IN ('adseq_bcp','adseq_red','infinite_bcp','infinite_red')
   AND categoria NOT IN ('Vendas', 'Aquisição_de_Terreno', 'Licenças_e_Relacionados', 'Obras', 'Soft_Costs', 'Impostos e taxas', 'Intra-Group (TRF)', 'Transferências', 'Financiamento', 'Outros_Diversos', 'Cartão_de_Crédito', 'Sócios', 'Encargos Financeiros', 'Legais', 'Mútuo', 'Ajuste', 'Contabilidade')
 ORDER BY conta_id, data
 LIMIT 200;


-- ═══════════════════════════════════════════════════════════════════════════
-- REVERTER — repõe tudo como estava antes do ficheiro 1
-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE movimentos m
--    SET categoria = b.categoria, subcategoria = b.subcategoria, detalhes = b.detalhes
--   FROM hdg_classificacao_backup b
--  WHERE m.id = b.id;
-- DROP TABLE hdg_classificacao_backup;
