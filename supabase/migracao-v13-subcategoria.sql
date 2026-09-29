-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Migração v13
--   Subcategoria nos movimentos (plano de contas dos projetos HDG)
--
--   Os projetos do grupo HDG — Admirable Sequence (Cinq Etoiles),
--   Infinite Change (Paço D'arcos) e Traços e Angulos — passam a classificar
--   o extrato em Categoria | Subcategoria | Observações, conforme a folha
--   "Menu1" do cat_subcat.xlsx. As empresas do grupo LPX ficam como estão.
--
--   As categorias JÁ GRAVADAS não são tocadas: ficam como estão para serem
--   revistas à mão. O ecrã mostra qualquer valor fora do plano novo com a
--   menção "(fora do plano)", em vez de o apagar.
--
-- Correr no SQL Editor do Supabase. É idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE movimentos ADD COLUMN IF NOT EXISTS subcategoria text DEFAULT '';

-- Índice só para o que interessa: as linhas já subcategorizadas
CREATE INDEX IF NOT EXISTS idx_mov_subcategoria
  ON movimentos(empresa_id, subcategoria)
  WHERE subcategoria IS NOT NULL AND subcategoria <> '';

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════════════════════
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'movimentos' AND column_name IN ('categoria','subcategoria')
 ORDER BY column_name;

-- Como estão hoje classificados os movimentos dos projetos HDG
-- (é esta lista que vais rever à mão no ecrã dos Extratos):
SELECT empresa_id,
       COALESCE(NULLIF(categoria,''), '— sem categoria —') AS categoria,
       count(*) AS movimentos,
       sum(valor) AS total
  FROM movimentos
 WHERE empresa_id IN ('adseq','infinite','tracos')
 GROUP BY empresa_id, 2
 ORDER BY empresa_id, movimentos DESC;
