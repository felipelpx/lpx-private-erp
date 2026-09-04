-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Migração v5
--   Contas Revolut para Pearl Syntax, Fluffy Rithm e BlessedLegion
--
-- Correr no SQL Editor do Supabase. Pode ser repetido sem duplicar.
-- Tem de coincidir com src/empresas.js (bancos: ["BCP", "Revolut"]).
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO contas (id, empresa_id, empresa_nome, banco, iban, saldo) VALUES
  ('pearl_revolut',   'pearl',   'Pearl Syntax (Aura Properties)', 'Revolut', '', 0),
  ('fluffy_revolut',  'fluffy',  'Fluffy Rithm (Tax SPV)',         'Revolut', '', 0),
  ('blessed_revolut', 'blessed', 'BlessedLegion (Developer 7M)',   'Revolut', '', 0)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA — devem passar a ser 19 contas, 3 delas Revolut
-- ═══════════════════════════════════════════════════════════════════════════
SELECT empresa_nome, banco, saldo
  FROM contas
 WHERE banco = 'Revolut'
 ORDER BY empresa_nome;

SELECT count(*) AS total_contas FROM contas;
