-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · O que está mesmo gravado nas categorias dos HDG
--
-- Serve para apanhar diferenças invisíveis a olho nu: um espaço a mais, um
-- underscore em vez de espaço, um acento diferente. A coluna `entre_parentesis`
-- mostra o valor delimitado, e `caracteres` denuncia o espaço escondido.
-- Não altera nada.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '[' || COALESCE(categoria, '«nulo»') || ']' AS entre_parentesis,
       length(categoria)                           AS caracteres,
       '[' || COALESCE(subcategoria, '«nulo»') || ']' AS subcategoria,
       count(*)                                    AS movimentos
  FROM movimentos
 WHERE conta_id IN ('adseq_bcp','adseq_red','infinite_bcp','infinite_red')
 GROUP BY 1, 2, 3
 ORDER BY 4 DESC;
