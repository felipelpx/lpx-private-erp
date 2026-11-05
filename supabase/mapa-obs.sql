-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · A descrição do gasto fica GRAVADA no mapa
--
-- Um mapa de pagamento é um documento: autoriza pagamentos e vai ao banco.
-- Até agora as linhas do mapa só guardavam um apontador para a fatura
-- (`origem_id`), e a descrição do gasto era lida da fatura viva, no momento
-- de abrir o ecrã. Isso tem duas consequências más:
--
--   1. Com o filtro LPX/HDG do topo da app numa posição, as linhas do outro
--      grupo ficavam sem descrição e sem botão de ver a fatura — um "—".
--      (Isso já está corrigido no código, sem SQL nenhum.)
--   2. Apagada ou arquivada a fatura, o mapa perde para sempre o que
--      autorizou. Isso é o que este ficheiro resolve.
--
-- Correr no SQL Editor do Supabase. É idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 0. O que já lá está (só lê)
-- ───────────────────────────────────────────────────────────────────────────
SELECT column_name AS coluna, data_type AS tipo
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'mapas_pagamento_itens'
 ORDER BY ordinal_position;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A coluna
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE mapas_pagamento_itens
  ADD COLUMN IF NOT EXISTS obs text DEFAULT '';

COMMENT ON COLUMN mapas_pagamento_itens.obs IS
  'A descrição do gasto, copiada da fatura quando o mapa foi criado. '
  'Fica gravada de propósito: o mapa tem de continuar a dizer o que '
  'autorizou mesmo que a fatura de origem desapareça.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Preencher os mapas que já existem
--    Só onde a fatura de origem ainda está lá e tem observação. Onde não
--    estiver, fica vazio — e o ecrã mostra a linha sem descrição, que é a
--    verdade, em vez de inventar uma.
-- ───────────────────────────────────────────────────────────────────────────
UPDATE mapas_pagamento_itens mpi
   SET obs = f.obs
  FROM faturas f
 WHERE mpi.tipo_origem = 'fatura'
   AND mpi.origem_id = f.id
   AND COALESCE(mpi.obs, '') = ''
   AND COALESCE(f.obs, '') <> '';

-- Os itens que vieram de uma previsão do Fluxo Futuro.
UPDATE mapas_pagamento_itens mpi
   SET obs = p.descricao
  FROM pagamentos_extras p
 WHERE mpi.tipo_origem = 'pagamento_extra'
   AND mpi.origem_id = p.id
   AND COALESCE(mpi.obs, '') = ''
   AND COALESCE(p.descricao, '') <> ''
   AND p.descricao <> mpi.descricao;      -- não repetir o que já está na linha

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Conferir
-- ───────────────────────────────────────────────────────────────────────────
SELECT mp.descricao AS mapa,
       COUNT(*)                                        AS linhas,
       COUNT(*) FILTER (WHERE COALESCE(mpi.obs,'') <> '') AS com_descricao,
       COUNT(*) FILTER (WHERE COALESCE(mpi.obs,'') =  '') AS sem_descricao
  FROM mapas_pagamento_itens mpi
  JOIN mapas_pagamento mp ON mp.id = mpi.mapa_id
 GROUP BY mp.id, mp.descricao, mp.created_at
 ORDER BY mp.created_at DESC
 LIMIT 20;

-- As que ficaram sem descrição, e porquê: a fatura ainda existe?
SELECT mpi.empresa, mpi.fornecedor, mpi.descricao, mpi.valor,
       CASE WHEN f.id IS NULL THEN 'a fatura já não existe'
            WHEN COALESCE(f.obs,'') = '' THEN 'a fatura não tem observação'
            ELSE 'preenchida' END AS motivo
  FROM mapas_pagamento_itens mpi
  LEFT JOIN faturas f ON f.id = mpi.origem_id AND mpi.tipo_origem = 'fatura'
 WHERE COALESCE(mpi.obs, '') = ''
 ORDER BY mpi.empresa, mpi.fornecedor
 LIMIT 50;
