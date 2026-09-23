-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Migração v8 (final)
--   Real × Orçado dos projetos HDG — APENAS a coluna ORÇADO
--   Origem: folha "Real x Orçado" de Admirable_Sequence_07_09.xlsx
--           e Infinite_Change_07_09.xlsx
--
-- O `realizado` e o `a_realizar` NÃO são guardados: a app calcula-os em tempo
-- real a partir dos movimentos bancários e do Fluxo Futuro. Lançar uma despesa
-- no Fluxo Futuro atualiza o Real × Orçado de imediato.
--
-- NÃO toca em pagamentos_extras — as previsões já lá estão.
-- Correr no SQL Editor do Supabase. Pode ser repetido sem duplicar.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Caso uma versão anterior desta migração tenha inserido previsões (id 'hdg_')
DELETE FROM pagamentos_extras WHERE id LIKE 'hdg\_%';

DELETE FROM orcamento WHERE empresa_id IN ('adseq','infinite');


-- ─── Cinq Etoiles (15 categorias com orçamento) ───
INSERT INTO orcamento (id, empresa_id, projeto, categoria, grupo, orcado, realizado, a_realizar) VALUES
  ('orc_adseq_01','adseq','Cinq Etoiles','Vendas','receita',4654700.0,0,0),
  ('orc_adseq_02','adseq','Cinq Etoiles','Projetos de Arquitetura e Especialidades','opex',-24600.0,0,0),
  ('orc_adseq_03','adseq','Cinq Etoiles','Taxas e emolumentos','opex',-5000.0,0,0),
  ('orc_adseq_04','adseq','Cinq Etoiles','Advogados - Licenças','opex',-6150.0,0,0),
  ('orc_adseq_05','adseq','Cinq Etoiles','Aquisição Terreno','capex',-1950000.0,0,0),
  ('orc_adseq_06','adseq','Cinq Etoiles','Imposto Selo','capex',-15600.0,0,0),
  ('orc_adseq_07','adseq','Cinq Etoiles','Notário','capex',-3000.0,0,0),
  ('orc_adseq_08','adseq','Cinq Etoiles','Registos','capex',-1000.0,0,0),
  ('orc_adseq_09','adseq','Cinq Etoiles','Gastos com Obras','obra',-948323.7,0,0),
  ('orc_adseq_10','adseq','Cinq Etoiles','Buffer/Outros','obra',-47416.19,0,0),
  ('orc_adseq_11','adseq','Cinq Etoiles','Taxa de Gestão','opex',-121770.0,0,0),
  ('orc_adseq_12','adseq','Cinq Etoiles','TOC (Contabilidade)','opex',-5535.0,0,0),
  ('orc_adseq_13','adseq','Cinq Etoiles','Marketing e propraganda','opex',-11636.75,0,0),
  ('orc_adseq_14','adseq','Cinq Etoiles','Comissão s/Vendas','opex',-286264.05,0,0),
  ('orc_adseq_15','adseq','Cinq Etoiles','Outflow - Juros','opex',-18255.23,0,0);

-- ─── Paço D'arcos (14 categorias com orçamento) ───
INSERT INTO orcamento (id, empresa_id, projeto, categoria, grupo, orcado, realizado, a_realizar) VALUES
  ('orc_infinite_01','infinite','Paço D''arcos','Vendas','receita',9784920.0,0,0),
  ('orc_infinite_02','infinite','Paço D''arcos','Projetos de Arquitetura e Especialidades','opex',-36900.0,0,0),
  ('orc_infinite_03','infinite','Paço D''arcos','Taxas e emolumentos','opex',-12300.0,0,0),
  ('orc_infinite_04','infinite','Paço D''arcos','Aquisição Terreno','capex',-2100000.0,0,0),
  ('orc_infinite_05','infinite','Paço D''arcos','IMT','capex',-157500.0,0,0),
  ('orc_infinite_06','infinite','Paço D''arcos','Imposto Selo','capex',-16800.0,0,0),
  ('orc_infinite_07','infinite','Paço D''arcos','Notário','capex',-4000.0,0,0),
  ('orc_infinite_08','infinite','Paço D''arcos','Gastos com Obras','obra',-4356217.2,0,0),
  ('orc_infinite_09','infinite','Paço D''arcos','Buffer/Outros','obra',-217810.86,0,0),
  ('orc_infinite_10','infinite','Paço D''arcos','Taxa de Gestão','opex',-216480.0,0,0),
  ('orc_infinite_11','infinite','Paço D''arcos','TOC (Contabilidade)','opex',-7072.5,0,0),
  ('orc_infinite_12','infinite','Paço D''arcos','Marketing e propraganda','opex',-48924.6,0,0),
  ('orc_infinite_13','infinite','Paço D''arcos','Comissão s/Vendas','opex',-601772.58,0,0),
  ('orc_infinite_14','infinite','Paço D''arcos','Outflow - Juros','opex',-172279.24,0,0);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA — só o orçado; o resto é calculado pela app
-- ═══════════════════════════════════════════════════════════════════════════
SELECT projeto, count(*) AS categorias,
       sum(orcado) FILTER (WHERE grupo <> 'receita') AS orcado_custos,
       sum(orcado) FILTER (WHERE grupo =  'receita') AS vendas_orcado
  FROM orcamento WHERE empresa_id IN ('adseq','infinite')
 GROUP BY projeto ORDER BY projeto;

-- As previsões que já tinhas continuam intactas:
SELECT empresa, count(*) AS previsoes, sum(valor) AS total
  FROM pagamentos_extras WHERE empresa IN ('adseq','infinite')
 GROUP BY empresa ORDER BY empresa;