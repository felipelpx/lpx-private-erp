-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Migração v9
--   Tabela `recebiveis` (Contas a Receber) + carteira dos projetos HDG
--   Origem: linha "Vendas" da folha "Fluxo Futuro" dos ficheiros
--           Admirable_Sequence_07_09.xlsx e Infinite_Change_07_09.xlsx
--
-- Correr no SQL Editor do Supabase. É idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS recebiveis (
  id          text PRIMARY KEY,
  empresa     text NOT NULL,
  projeto     text,
  descricao   text,
  cliente     text,
  fracao      text,
  valor       numeric NOT NULL DEFAULT 0,
  data_prevista date,
  status      text NOT NULL DEFAULT 'Previsto',   -- Previsto | Recebido | Cancelado
  obs         text DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_receb_empresa ON recebiveis(empresa);
CREATE INDEX IF NOT EXISTS idx_receb_data    ON recebiveis(data_prevista);

ALTER TABLE recebiveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE recebiveis REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE recebiveis;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Investidores veem os recebíveis das suas empresas; só admin e gestor editam
DROP POLICY IF EXISTS "ver_recebiveis"    ON recebiveis;
DROP POLICY IF EXISTS "editar_recebiveis" ON recebiveis;
CREATE POLICY "ver_recebiveis" ON recebiveis FOR SELECT TO authenticated
  USING (public.pode_ver_empresa(empresa));
CREATE POLICY "editar_recebiveis" ON recebiveis FOR ALL TO authenticated
  USING (public.meu_role() IN ('admin','gestor'))
  WITH CHECK (public.meu_role() IN ('admin','gestor'));

BEGIN;
DELETE FROM recebiveis WHERE id LIKE 'rec\_%';


-- ─── Cinq Etoiles (9 meses · 5.298.999,00 €) ───
INSERT INTO recebiveis (id, empresa, projeto, descricao, valor, data_prevista, status) VALUES
  ('rec_adseq_01','adseq','Cinq Etoiles','Recebimentos de vendas — 2026-08',10000.0,'2026-08-01','Previsto'),
  ('rec_adseq_02','adseq','Cinq Etoiles','Recebimentos de vendas — 2026-09',84785.7,'2026-09-01','Previsto'),
  ('rec_adseq_03','adseq','Cinq Etoiles','Recebimentos de vendas — 2026-10',89185.7,'2026-10-01','Previsto'),
  ('rec_adseq_04','adseq','Cinq Etoiles','Recebimentos de vendas — 2026-11',69185.7,'2026-11-01','Previsto'),
  ('rec_adseq_05','adseq','Cinq Etoiles','Recebimentos de vendas — 2026-12',69185.7,'2026-12-01','Previsto'),
  ('rec_adseq_06','adseq','Cinq Etoiles','Recebimentos de vendas — 2027-01',69185.7,'2027-01-01','Previsto'),
  ('rec_adseq_07','adseq','Cinq Etoiles','Recebimentos de vendas — 2027-02',69185.7,'2027-02-01','Previsto'),
  ('rec_adseq_08','adseq','Cinq Etoiles','Recebimentos de vendas — 2027-03',69185.7,'2027-03-01','Previsto'),
  ('rec_adseq_09','adseq','Cinq Etoiles','Recebimentos de vendas — 2027-10',4769099.1,'2027-10-01','Previsto');

-- ─── Paço D'arcos (7 meses · 11.778.000,00 €) ───
INSERT INTO recebiveis (id, empresa, projeto, descricao, valor, data_prevista, status) VALUES
  ('rec_infinite_01','infinite','Paço D''arcos','Recebimentos de vendas — 2026-11',143300.0,'2026-11-01','Previsto'),
  ('rec_infinite_02','infinite','Paço D''arcos','Recebimentos de vendas — 2027-01',141000.0,'2027-01-01','Previsto'),
  ('rec_infinite_03','infinite','Paço D''arcos','Recebimentos de vendas — 2027-03',221300.0,'2027-03-01','Previsto'),
  ('rec_infinite_04','infinite','Paço D''arcos','Recebimentos de vendas — 2027-05',223000.0,'2027-05-01','Previsto'),
  ('rec_infinite_05','infinite','Paço D''arcos','Recebimentos de vendas — 2027-07',222600.0,'2027-07-01','Previsto'),
  ('rec_infinite_06','infinite','Paço D''arcos','Recebimentos de vendas — 2027-09',226600.0,'2027-09-01','Previsto'),
  ('rec_infinite_07','infinite','Paço D''arcos','Recebimentos de vendas — 2027-12',10600200.0,'2027-12-01','Previsto');

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA — Cinq Etoiles 5.298.999 € · Paço D'arcos 11.778.000 €
-- ═══════════════════════════════════════════════════════════════════════════
SELECT projeto, count(*) AS meses, sum(valor) AS total,
       min(data_prevista) AS primeiro, max(data_prevista) AS ultimo
  FROM recebiveis GROUP BY projeto ORDER BY projeto;