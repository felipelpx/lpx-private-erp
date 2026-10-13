-- ----------------------------------------------------------
-- LPX PRIVATE - ERP - Plano de obra (migracao v16)
-- FICHEIRO 1 DE 2 - a tabela dos planos
--
-- Corre este inteiro e passa ao 2. Pode ser corrido duas
-- vezes sem fazer mal.
-- ----------------------------------------------------------

-- Um plano por projeto com obra: Favorite Closet, Simplify
-- Rubric, Genero Prudente, Admirable Sequence e Infinite
-- Change. Os inputs vivem aqui; as previsoes que saem deles
-- vao para pagamentos_extras, marcadas, no ficheiro 2.
--
-- Nenhum valor e cravado no codigo: o que o motor calcula sai
-- todo destes campos.
CREATE TABLE IF NOT EXISTS obra_planos (
  id                  text PRIMARY KEY,
  empresa             text NOT NULL UNIQUE,
  ativo               boolean NOT NULL DEFAULT true,

  -- O prazo. E daqui que tudo se move: esticar a data de fim
  -- carrega fiscalizacao, CSO e juros por mais meses.
  data_inicio         date,
  data_fim            date,

  -- O budget da empreitada, SEM IVA. O motor acrescenta o IVA
  -- a taxa abaixo, e a saida de caixa e base + IVA.
  budget_obra         numeric NOT NULL DEFAULT 0,
  taxa_iva_obra       numeric NOT NULL DEFAULT 23,

  -- Avencas mensais, enquanto a obra durar.
  fiscalizacao_mensal numeric NOT NULL DEFAULT 0,
  cso_mensal          numeric NOT NULL DEFAULT 0,

  -- Banco: uma libertacao por mes de obra, com a sua avaliacao.
  comissao_avaliacao  numeric NOT NULL DEFAULT 0,
  funding_pct         numeric NOT NULL DEFAULT 0,
  euribor             numeric NOT NULL DEFAULT 0,
  spread              numeric NOT NULL DEFAULT 0,
  -- Divida ja libertada hoje (o tranche do terreno, por
  -- exemplo). E sobre ela que comecam a contar os juros.
  divida_inicial      numeric NOT NULL DEFAULT 0,

  -- O IVA da obra e pago com a fatura e recuperado no
  -- apuramento do trimestre. Desligar isto trata-o como custo.
  recuperar_iva       boolean NOT NULL DEFAULT true,

  -- Memoria do ultimo recalculo. Serve para o ecra saber que o
  -- plano ficou desatualizado quando entra uma fatura de obra
  -- nova: compara-se o gasto de agora com o gasto da altura.
  calculado_em        timestamptz,
  gasto_no_calculo    numeric,

  obs                 text DEFAULT '',
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          text DEFAULT ''
);

-- Para uma tabela que ja exista de uma corrida anterior.
ALTER TABLE obra_planos ADD COLUMN IF NOT EXISTS calculado_em     timestamptz;
ALTER TABLE obra_planos ADD COLUMN IF NOT EXISTS gasto_no_calculo numeric;

-- Percentagens sao percentagens, e as taxas nao sao negativas.
DO $$ BEGIN
  ALTER TABLE obra_planos ADD CONSTRAINT obra_planos_pct_valida
    CHECK (funding_pct >= 0 AND funding_pct <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE obra_planos ADD CONSTRAINT obra_planos_taxas_validas
    CHECK (taxa_iva_obra >= 0 AND euribor >= -5 AND spread >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE obra_planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE obra_planos REPLICA IDENTITY FULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON obra_planos TO authenticated;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE obra_planos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ver segue as regras de sempre; mexer e so de admin e gestor.
-- Um investidor nunca altera o plano de obra de um projeto.
DROP POLICY IF EXISTS "ver_obra_planos"    ON obra_planos;
DROP POLICY IF EXISTS "editar_obra_planos" ON obra_planos;
CREATE POLICY "ver_obra_planos" ON obra_planos FOR SELECT TO authenticated
  USING (public.pode_ver_empresa(empresa));
CREATE POLICY "editar_obra_planos" ON obra_planos FOR ALL TO authenticated
  USING (public.meu_role() IN ('admin','gestor'))
  WITH CHECK (public.meu_role() IN ('admin','gestor'));

-- Conferencia: deve devolver zero linhas numa base nova.
SELECT count(*) AS planos_existentes FROM obra_planos;
