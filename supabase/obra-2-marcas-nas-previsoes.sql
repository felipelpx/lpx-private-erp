-- ----------------------------------------------------------
-- LPX PRIVATE - ERP - Plano de obra (migracao v16)
-- FICHEIRO 2 DE 2 - marcar as previsoes que o motor gera
--
-- Corre este inteiro DEPOIS do 1. Pode ser corrido duas vezes
-- sem fazer mal. Nenhuma previsao tua e tocada por este
-- ficheiro: so se acrescentam colunas, todas a NULL.
-- ----------------------------------------------------------

-- As previsoes geradas pelo motor vivem na mesma tabela das
-- tuas, para herdarem tudo o que ja funciona: o funding, a
-- edicao, o apagar, a conversao em fatura.
--
-- Estas duas colunas sao a unica diferenca:
--   plano_obra - a empresa cujo plano gerou a linha. Um
--                recalculo apaga so as linhas com esta marca,
--                nunca as tuas (que tem NULL).
--   plano_tipo - obra | fiscalizacao | cso | juros |
--                comissao | iva_obra
ALTER TABLE pagamentos_extras ADD COLUMN IF NOT EXISTS plano_obra text;
ALTER TABLE pagamentos_extras ADD COLUMN IF NOT EXISTS plano_tipo text;

-- Os projetos da HDG classificam em Categoria | Subcategoria.
-- As previsoes passam a poder levar a subcategoria tambem,
-- como ja levam os movimentos do extrato (migracao v13).
ALTER TABLE pagamentos_extras ADD COLUMN IF NOT EXISTS subcategoria text DEFAULT '';

-- Uma linha gerada tem sempre as duas marcas, ou nenhuma.
DO $$ BEGIN
  ALTER TABLE pagamentos_extras ADD CONSTRAINT pagamentos_extras_plano_coerente
    CHECK ((plano_obra IS NULL AND plano_tipo IS NULL)
        OR (plano_obra IS NOT NULL AND plano_tipo IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- O recalculo apaga por (plano_obra, data_inicio): e este o
-- indice que o serve.
CREATE INDEX IF NOT EXISTS idx_pe_plano
  ON pagamentos_extras(plano_obra, data_inicio)
  WHERE plano_obra IS NOT NULL;

-- Conferencia: todas as tuas previsoes continuam sem marca,
-- e nenhuma foi perdida.
SELECT count(*)                                      AS previsoes_totais,
       count(*) FILTER (WHERE plano_obra IS NULL)     AS tuas_sem_marca,
       count(*) FILTER (WHERE plano_obra IS NOT NULL) AS geradas_pelo_motor
  FROM pagamentos_extras;
