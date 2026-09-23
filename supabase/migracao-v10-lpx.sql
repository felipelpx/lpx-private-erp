-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Migração v10
--   Real × Orçado e Contas a Receber dos projetos LPX
--   Origem: Favorite_Closet_FO_10_09.xlsx, Simplify_Rubric_FO_10_09.xlsx
--           e Genero_Prudente_FO_10_09.xlsx
--
-- As classificações são as da LPX (Obra, Projetos, Fee Gestão, Fiscalização,
-- Encargos financeiros, …) — diferentes das usadas no HDG. Ficam exatamente
-- como estão nas folhas, sem qualquer tradução.
--
-- Só o ORÇADO é guardado: o realizado e o a realizar são calculados em tempo
-- real pela app, a partir dos movimentos bancários e do Fluxo Futuro.
--
-- Autossuficiente: cria a tabela `recebiveis` se ainda não existir, por isso
-- não depende de a migração v9 ter sido corrida antes.
-- Correr no SQL Editor do Supabase. Pode ser repetido sem duplicar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 0. TABELA `recebiveis` — criada aqui caso a migração v9 ainda não tenha
--    sido corrida. Se já existir, nada disto tem efeito.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recebiveis (
  id            text PRIMARY KEY,
  empresa       text NOT NULL,
  projeto       text,
  descricao     text,
  cliente       text,
  fracao        text,
  valor         numeric NOT NULL DEFAULT 0,
  data_prevista date,
  status        text NOT NULL DEFAULT 'Previsto',   -- Previsto | Recebido | Cancelado
  obs           text DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_receb_empresa ON recebiveis(empresa);
CREATE INDEX IF NOT EXISTS idx_receb_data    ON recebiveis(data_prevista);

ALTER TABLE recebiveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE recebiveis REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE recebiveis;
EXCEPTION WHEN OTHERS THEN NULL;   -- já incluída, ou publicação inexistente
END $$;

-- Investidores veem os recebíveis das suas empresas; só admin e gestor editam.
-- (A função pode_ver_empresa vem da migração v2.)
DO $$ BEGIN
  DROP POLICY IF EXISTS "ver_recebiveis"    ON recebiveis;
  DROP POLICY IF EXISTS "editar_recebiveis" ON recebiveis;
  CREATE POLICY "ver_recebiveis" ON recebiveis FOR SELECT TO authenticated
    USING (public.pode_ver_empresa(empresa));
  CREATE POLICY "editar_recebiveis" ON recebiveis FOR ALL TO authenticated
    USING (public.meu_role() IN ('admin','gestor'))
    WITH CHECK (public.meu_role() IN ('admin','gestor'));
EXCEPTION WHEN undefined_function THEN
  -- Migração v2 ainda não corrida: deixa a tabela acessível a autenticados
  DROP POLICY IF EXISTS "auth_recebiveis" ON recebiveis;
  CREATE POLICY "auth_recebiveis" ON recebiveis FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
  RAISE NOTICE 'Funcoes de RLS da migracao v2 nao encontradas — politica simples aplicada.';
END $$;


BEGIN;

DELETE FROM orcamento  WHERE empresa_id IN ('favcloset','simplify','genero');
DELETE FROM recebiveis WHERE id LIKE 'rec\_favcloset\_%'
                          OR id LIKE 'rec\_simplify\_%'
                          OR id LIKE 'rec\_genero\_%';


-- ─── Amadeu 07 · orçamento (13 categorias) ───
INSERT INTO orcamento (id, empresa_id, projeto, categoria, grupo, orcado, realizado, a_realizar) VALUES
  ('orc_favcloset_01','favcloset','Amadeu 07','Vendas','receita',3636080.0,0,0),
  ('orc_favcloset_02','favcloset','Amadeu 07','Comissão','opex',-223618.92,0,0),
  ('orc_favcloset_03','favcloset','Amadeu 07','Terreno','capex',-993232.0,0,0),
  ('orc_favcloset_04','favcloset','Amadeu 07','Impostos e taxas','opex',-17000.0,0,0),
  ('orc_favcloset_05','favcloset','Amadeu 07','Encargos financeiros','opex',-16632.0,0,0),
  ('orc_favcloset_06','favcloset','Amadeu 07','Legais','opex',-6765.0,0,0),
  ('orc_favcloset_07','favcloset','Amadeu 07','Marketing','opex',-30750.0,0,0),
  ('orc_favcloset_08','favcloset','Amadeu 07','Projetos','opex',-30769.68,0,0),
  ('orc_favcloset_09','favcloset','Amadeu 07','Obra','obra',-1277293.96,0,0),
  ('orc_favcloset_10','favcloset','Amadeu 07','Administrativos','opex',-7692.42,0,0),
  ('orc_favcloset_11','favcloset','Amadeu 07','Fiscalização','opex',-46740.0,0,0),
  ('orc_favcloset_12','favcloset','Amadeu 07','Fee Gestão','opex',-125920.02,0,0),
  ('orc_favcloset_13','favcloset','Amadeu 07','Juros','opex',-92843.0,0,0);

-- ─── Alto dos 7 Moinhos · orçamento (12 categorias) ───
INSERT INTO orcamento (id, empresa_id, projeto, categoria, grupo, orcado, realizado, a_realizar) VALUES
  ('orc_simplify_01','simplify','Alto dos 7 Moinhos','Vendas','receita',2624000.0,0,0),
  ('orc_simplify_02','simplify','Alto dos 7 Moinhos','Comissão','opex',-161376.0,0,0),
  ('orc_simplify_03','simplify','Alto dos 7 Moinhos','Terreno','capex',-585500.0,0,0),
  ('orc_simplify_04','simplify','Alto dos 7 Moinhos','Impostos e taxas','opex',-64320.0,0,0),
  ('orc_simplify_05','simplify','Alto dos 7 Moinhos','Encargos financeiros','opex',-12248.0,0,0),
  ('orc_simplify_06','simplify','Alto dos 7 Moinhos','Legais','opex',-11070.0,0,0),
  ('orc_simplify_07','simplify','Alto dos 7 Moinhos','Marketing','opex',-9840.0,0,0),
  ('orc_simplify_08','simplify','Alto dos 7 Moinhos','Projetos','opex',-35625.72,0,0),
  ('orc_simplify_09','simplify','Alto dos 7 Moinhos','Obra','obra',-996148.78,0,0),
  ('orc_simplify_10','simplify','Alto dos 7 Moinhos','Fiscalização','opex',-19680.0,0,0),
  ('orc_simplify_11','simplify','Alto dos 7 Moinhos','Fee Gestão','opex',-79950.0,0,0),
  ('orc_simplify_12','simplify','Alto dos 7 Moinhos','Juros','opex',-43470.0,0,0);

-- ─── Maria Pia · orçamento (9 categorias) ───
INSERT INTO orcamento (id, empresa_id, projeto, categoria, grupo, orcado, realizado, a_realizar) VALUES
  ('orc_genero_01','genero','Maria Pia','Vendas','receita',4015000.0,0,0),
  ('orc_genero_02','genero','Maria Pia','Comissão','opex',-197538.0,0,0),
  ('orc_genero_03','genero','Maria Pia','Terreno','capex',-1450000.0,0,0),
  ('orc_genero_04','genero','Maria Pia','Impostos e taxas','opex',-22100.0,0,0),
  ('orc_genero_05','genero','Maria Pia','Encargos financeiros','opex',-13563.87,0,0),
  ('orc_genero_06','genero','Maria Pia','Marketing','opex',-12045.0,0,0),
  ('orc_genero_07','genero','Maria Pia','Projetos','opex',-29326.64,0,0),
  ('orc_genero_08','genero','Maria Pia','Obra','obra',-1043581.08,0,0),
  ('orc_genero_09','genero','Maria Pia','Juros','opex',-41468.11,0,0);

-- ─── Amadeu 07 · contas a receber (1 meses · linha "Recebíveis") ───
INSERT INTO recebiveis (id, empresa, projeto, descricao, valor, data_prevista, status) VALUES
  ('rec_favcloset_01','favcloset','Amadeu 07','Recebimentos de vendas — 2027-02',3551640.0,'2027-02-01','Previsto');

-- ─── Alto dos 7 Moinhos · contas a receber (1 meses · linha "Recebíveis") ───
INSERT INTO recebiveis (id, empresa, projeto, descricao, valor, data_prevista, status) VALUES
  ('rec_simplify_01','simplify','Alto dos 7 Moinhos','Recebimentos de vendas — 2027-10',2550996.39,'2027-10-01','Previsto');

-- ─── Maria Pia · contas a receber (2 meses · linha "Vendas") ───
INSERT INTO recebiveis (id, empresa, projeto, descricao, valor, data_prevista, status) VALUES
  ('rec_genero_01','genero','Maria Pia','Recebimentos de vendas — 2026-12',433500.0,'2026-12-01','Previsto'),
  ('rec_genero_02','genero','Maria Pia','Recebimentos de vendas — 2028-03',2788200.0,'2028-03-01','Previsto');

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════════════════════
SELECT projeto, count(*) AS categorias,
       sum(orcado) FILTER (WHERE grupo <> 'receita') AS orcado_custos,
       sum(orcado) FILTER (WHERE grupo =  'receita') AS vendas_orcado
  FROM orcamento GROUP BY projeto ORDER BY projeto;

SELECT projeto, count(*) AS meses, sum(valor) AS total
  FROM recebiveis GROUP BY projeto ORDER BY projeto;