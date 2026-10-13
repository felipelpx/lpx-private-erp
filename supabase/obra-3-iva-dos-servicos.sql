-- ----------------------------------------------------------
-- LPX PRIVATE - ERP - Plano de obra (migracao v17)
-- FICHEIRO 3 - IVA da fiscalizacao e do CSO
--
-- Corre este DEPOIS do obra-1 e do obra-2. Pode ser corrido
-- duas vezes sem fazer mal.
-- ----------------------------------------------------------

-- A empreitada e autoliquidada: a fatura do empreiteiro vem
-- sem IVA e o imposto sai no apuramento do trimestre.
--
-- A fiscalizacao e o CSO nao: sao servicos faturados COM IVA
-- e pagos com ele, no mes. A avenca que se introduz no plano
-- e sem IVA, e o sistema acrescenta-o a esta taxa.
ALTER TABLE obra_planos
  ADD COLUMN IF NOT EXISTS taxa_iva_servicos numeric NOT NULL DEFAULT 23;

DO $$ BEGIN
  ALTER TABLE obra_planos ADD CONSTRAINT obra_planos_iva_servicos_valido
    CHECK (taxa_iva_servicos >= 0 AND taxa_iva_servicos <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Conferencia: a coluna existe e os planos que ja existam
-- ficam a 23%.
SELECT empresa, taxa_iva_obra, taxa_iva_servicos
  FROM obra_planos ORDER BY empresa;
