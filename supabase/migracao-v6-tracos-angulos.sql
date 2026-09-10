-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Migração v6
--   Nova empresa: Traços e Angulos, Lda (soc. Farmaceutica) — banco BCP
--
-- Correr no SQL Editor do Supabase. Pode ser repetido sem duplicar.
-- Tem de coincidir com src/empresas.js (id "tracos", grupo LPX).
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO contas (id, empresa_id, empresa_nome, banco, iban, saldo) VALUES
  ('tracos_bcp', 'tracos', 'Traços e Angulos, Lda (soc. Farmaceutica)', 'BCP', '', 0)
ON CONFLICT (id) DO UPDATE SET
  empresa_nome = EXCLUDED.empresa_nome,
  banco        = EXCLUDED.banco,
  updated_at   = now();

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA — devem passar a ser 20 contas em 11 empresas
-- ═══════════════════════════════════════════════════════════════════════════
SELECT empresa_id, empresa_nome, banco, saldo
  FROM contas
 WHERE empresa_id = 'tracos';

SELECT count(*) AS total_contas, count(DISTINCT empresa_id) AS total_empresas
  FROM contas;

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTA: a empresa entra no grupo LPX. Para a passar para o HDG, alterar o
-- campo `grupo` em src/empresas.js — não é preciso mexer na base de dados,
-- porque o grupo é definido apenas no código.
-- ═══════════════════════════════════════════════════════════════════════════
