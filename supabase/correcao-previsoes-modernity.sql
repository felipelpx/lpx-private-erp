-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Correção de previsões gravadas na empresa errada
--
-- O formulário do Fluxo Futuro (portado do ERP da Rio Capital) repunha a
-- empresa para "modernity" depois de cada gravação. O dropdown continuava a
-- MOSTRAR "Favorite Closet", mas as previsões seguintes eram GRAVADAS em
-- "modernity" — uma empresa que não existe na LPX, e que por isso não
-- aparecia ao filtrar pela Favorite.
--
-- Correr por passos no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 1 — VER o que está afetado (não altera nada)
-- Lista todas as previsões cuja empresa não é uma empresa da LPX.
-- Confirma que são todas da Favorite Closet antes de avançar.
-- ───────────────────────────────────────────────────────────────────────────
SELECT id, empresa, descricao, categoria, valor, data_inicio, status
  FROM pagamentos_extras
 WHERE empresa NOT IN (
   'favcloset','simplify','enchanted','blessed','pearl','genero',
   'fluffy','adseq','infinite','tracos','lpx'
 )
    OR empresa IS NULL OR empresa = ''
 ORDER BY data_inicio;


-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 2 — CORRIGIR
-- Se o passo 1 mostrar apenas previsões da Favorite Closet, corre isto.
-- Se houver previsões de outras empresas no meio, NÃO corras — diz-me quais
-- são e preparo um UPDATE à medida, linha a linha.
-- ───────────────────────────────────────────────────────────────────────────
UPDATE pagamentos_extras
   SET empresa = 'favcloset'
 WHERE empresa = 'modernity';


-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 3 — CONFERIR
-- Deve devolver zero linhas.
-- ───────────────────────────────────────────────────────────────────────────
SELECT count(*) AS ainda_em_empresa_invalida
  FROM pagamentos_extras
 WHERE empresa NOT IN (
   'favcloset','simplify','enchanted','blessed','pearl','genero',
   'fluffy','adseq','infinite','tracos','lpx'
 );

-- Previsões da Favorite Closet depois da correção
SELECT descricao, valor, data_inicio, status
  FROM pagamentos_extras
 WHERE empresa = 'favcloset'
 ORDER BY data_inicio;
