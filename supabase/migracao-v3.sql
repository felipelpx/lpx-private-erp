-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Migração v3
--   1. Investidor passa a ver as faturas (Contas a Pagar) das suas empresas
--   2. Tabelas de venda dos 4 projetos (38 frações)
--
-- Correr no SQL Editor do Supabase, depois da migração v2. É idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. FATURAS — leitura para o investidor, limitada às suas empresas
--    Continua sem poder criar, alterar ou apagar seja o que for.
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sem_investidores" ON faturas;
DROP POLICY IF EXISTS "ver_faturas"      ON faturas;
DROP POLICY IF EXISTS "editar_faturas"   ON faturas;

CREATE POLICY "ver_faturas" ON faturas FOR SELECT TO authenticated
  USING (public.pode_ver_empresa(empresa));

CREATE POLICY "editar_faturas" ON faturas FOR ALL TO authenticated
  USING (public.meu_role() <> 'investidor')
  WITH CHECK (public.meu_role() <> 'investidor');

-- ───────────────────────────────────────────────────────────────────────────
-- 2. TABELAS DE VENDA — inventário de frações
--    Origem: tabelas_de_venda.xlsx
--    Reposição limpa dos 4 projetos abrangidos; nada mais é tocado.
-- ───────────────────────────────────────────────────────────────────────────
BEGIN;

DELETE FROM fracoes WHERE projeto IN (
  'Genero Prudente (Maria Pia)',
  'Simplify Rubric (Alto dos 7 Moinhos)',
  'Favorite Closet (Amadeu 07)',
  'Admirable Sequence (Cinq Etoiles)'
);


-- ─── Genero Prudente (Maria Pia) (11 frações) ───
INSERT INTO fracoes (id, projeto, fracao, tipologia, area, preco_tabela, status, piso, andar, notas) VALUES
  ('genero_a','Genero Prudente (Maria Pia)','A','T1',61.0,369000.0,'Disponível','-1','Cave',''),
  ('genero_b','Genero Prudente (Maria Pia)','B','T1',64.25,379000.0,'Disponível','-1','Cave',''),
  ('genero_c','Genero Prudente (Maria Pia)','C','T1',51.2,379000.0,'Disponível','R/C','RC',''),
  ('genero_d','Genero Prudente (Maria Pia)','D','T1',49.78,379000.0,'Disponível','R/C','RC',''),
  ('genero_e','Genero Prudente (Maria Pia)','E','T1',56.04,398000.0,'Disponível','1','1º',''),
  ('genero_f','Genero Prudente (Maria Pia)','F','T1',65.6,398000.0,'CPCV','1','1º',''),
  ('genero_g','Genero Prudente (Maria Pia)','G','T1',56.04,398000.0,'CPCV','2','2º',''),
  ('genero_h','Genero Prudente (Maria Pia)','H','T1',65.6,398000.0,'Disponível','2','2º',''),
  ('genero_i','Genero Prudente (Maria Pia)','I','T1',56.04,379000.0,'Reservada','3','3º',''),
  ('genero_j','Genero Prudente (Maria Pia)','J','T2',89.54,498000.0,'Reservada','4','3º Duplex',''),
  ('genero_l','Genero Prudente (Maria Pia)','L','T1',53.4,369000.0,'Disponível','4','4º','')
ON CONFLICT (id) DO UPDATE SET
  projeto=EXCLUDED.projeto, fracao=EXCLUDED.fracao, tipologia=EXCLUDED.tipologia,
  area=EXCLUDED.area, preco_tabela=EXCLUDED.preco_tabela, status=EXCLUDED.status,
  piso=EXCLUDED.piso, andar=EXCLUDED.andar, notas=EXCLUDED.notas;

-- ─── Simplify Rubric (Alto dos 7 Moinhos) (8 frações) ───
INSERT INTO fracoes (id, projeto, fracao, tipologia, area, preco_tabela, status, piso, andar, notas) VALUES
  ('simplify_g','Simplify Rubric (Alto dos 7 Moinhos)','G','T2',37.0,419000.0,'CPCV','-1','-1','ABP 37 m² · terraço 0 m² · 5000 €/m²'),
  ('simplify_h','Simplify Rubric (Alto dos 7 Moinhos)','H','T2',86.2,419000.0,'CPCV','-1','-1','ABP 86.2 m² · terraço 0 m² · 3750 €/m²'),
  ('simplify_a','Simplify Rubric (Alto dos 7 Moinhos)','A','T2',52.0,349548.5,'CPCV','','','ABP 52 m² · terraço 0 m² · 4500 €/m²'),
  ('simplify_b','Simplify Rubric (Alto dos 7 Moinhos)','B','T1',34.2,349000.0,'CPCV','','','ABP 34.2 m² · terraço 0 m² · 6000 €/m²'),
  ('simplify_c','Simplify Rubric (Alto dos 7 Moinhos)','C','T2',54.4,347167.3,'CPCV','1','1','ABP 54.4 m² · terraço 0 m² · 5000 €/m²'),
  ('simplify_d','Simplify Rubric (Alto dos 7 Moinhos)','D','T1',36.4,349036.1,'CPCV','1','1','ABP 36.4 m² · terraço 0 m² · 7000 €/m²'),
  ('simplify_e','Simplify Rubric (Alto dos 7 Moinhos)','E','T1',48.2,299000.0,'CPCV','2','2','ABP 48.2 m² · terraço 0 m² · 6500 €/m²'),
  ('simplify_f','Simplify Rubric (Alto dos 7 Moinhos)','F','T1',57.4,317209.1,'CPCV','2','2','ABP 57.4 m² · terraço 0 m² · 6000 €/m²')
ON CONFLICT (id) DO UPDATE SET
  projeto=EXCLUDED.projeto, fracao=EXCLUDED.fracao, tipologia=EXCLUDED.tipologia,
  area=EXCLUDED.area, preco_tabela=EXCLUDED.preco_tabela, status=EXCLUDED.status,
  piso=EXCLUDED.piso, andar=EXCLUDED.andar, notas=EXCLUDED.notas;

-- ─── Favorite Closet (Amadeu 07) (11 frações) ───
INSERT INTO fracoes (id, projeto, fracao, tipologia, area, preco_tabela, status, piso, andar, notas) VALUES
  ('favcloset_a','Favorite Closet (Amadeu 07)','A','T0 Duplex',37.0,225000.0,'CPCV','-1','-1','ABP 37 m² · terraço 0 m² · 5000 €/m²'),
  ('favcloset_b','Favorite Closet (Amadeu 07)','B','T2 Duplex',86.2,410000.0,'CPCV','-1','-1','ABP 86.2 m² · terraço 0 m² · 3750 €/m²'),
  ('favcloset_c','Favorite Closet (Amadeu 07)','C','T0',52.0,300000.0,'CPCV','-1','-1','ABP 52 m² · terraço 0 m² · 4500 €/m²'),
  ('favcloset_d','Favorite Closet (Amadeu 07)','D','T0',34.2,270000.0,'CPCV','-1','-1','ABP 34.2 m² · terraço 0 m² · 6000 €/m²'),
  ('favcloset_e','Favorite Closet (Amadeu 07)','E','T1',54.4,330000.0,'CPCV','RC','RC','ABP 54.4 m² · terraço 0 m² · 5000 €/m²'),
  ('favcloset_f','Favorite Closet (Amadeu 07)','F','T0',36.4,295000.0,'CPCV','1','1','ABP 36.4 m² · terraço 0 m² · 7000 €/m²'),
  ('favcloset_g','Favorite Closet (Amadeu 07)','G','T1',48.2,330000.0,'CPCV','1','1','ABP 48.2 m² · terraço 0 m² · 6500 €/m²'),
  ('favcloset_h','Favorite Closet (Amadeu 07)','H','T1',57.4,354600.0,'CPCV','1','1','ABP 57.4 m² · terraço 0 m² · 6000 €/m²'),
  ('favcloset_i','Favorite Closet (Amadeu 07)','I','T1',44.4,335000.0,'CPCV','2','2','ABP 44.4 m² · terraço 0 m² · 7500 €/m²'),
  ('favcloset_j','Favorite Closet (Amadeu 07)','J','T2',78.8,565000.0,'CPCV','2','2','ABP 78.8 m² · terraço 22 m² · 6500 €/m²'),
  ('favcloset_k','Favorite Closet (Amadeu 07)','K','T2 Duplex',88.6,580000.0,'CPCV','2','2','ABP 88.6 m² · terraço 15.4 m² · 6100 €/m²')
ON CONFLICT (id) DO UPDATE SET
  projeto=EXCLUDED.projeto, fracao=EXCLUDED.fracao, tipologia=EXCLUDED.tipologia,
  area=EXCLUDED.area, preco_tabela=EXCLUDED.preco_tabela, status=EXCLUDED.status,
  piso=EXCLUDED.piso, andar=EXCLUDED.andar, notas=EXCLUDED.notas;

-- ─── Admirable Sequence (Cinq Etoiles) (8 frações) ───
INSERT INTO fracoes (id, projeto, fracao, tipologia, area, preco_tabela, status, piso, andar, notas) VALUES
  ('adseq_1a','Admirable Sequence (Cinq Etoiles)','1A','T1',82.6,659000.0,'Disponível','R/C Dto','R/C Dto','7.978 €/m²'),
  ('adseq_1b','Admirable Sequence (Cinq Etoiles)','1B','T2',93.1,743600.0,'Disponível','R/C Esq','R/C Esq','7.987 €/m²'),
  ('adseq_2a','Admirable Sequence (Cinq Etoiles)','2A','T2',74.7,716400.0,'Disponível','1º Dto','1º Dto','9.590 €/m²'),
  ('adseq_2b','Admirable Sequence (Cinq Etoiles)','2B','T2',76.0,721600.0,'Disponível','1º Esq','1º Esq','9.495 €/m²'),
  ('adseq_3a','Admirable Sequence (Cinq Etoiles)','3A','T2',74.7,726800.0,'Disponível','2º Dto','2º Dto','9.730 €/m²'),
  ('adseq_3b','Admirable Sequence (Cinq Etoiles)','3B','T2',76.0,731960.0,'Disponível','2º Esq','2º Esq','9.631 €/m²'),
  ('adseq_4a','Admirable Sequence (Cinq Etoiles)','4A','T1',56.9,566000.0,'Disponível','3º Dto','3º Dto','9.947 €/m²'),
  ('adseq_4b','Admirable Sequence (Cinq Etoiles)','4B','T1',0.0,0.0,'Escriturada','3º Esq','3º Esq','')
ON CONFLICT (id) DO UPDATE SET
  projeto=EXCLUDED.projeto, fracao=EXCLUDED.fracao, tipologia=EXCLUDED.tipologia,
  area=EXCLUDED.area, preco_tabela=EXCLUDED.preco_tabela, status=EXCLUDED.status,
  piso=EXCLUDED.piso, andar=EXCLUDED.andar, notas=EXCLUDED.notas;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA — devem ser 38 frações e 16.052.921 € de VGV
-- ═══════════════════════════════════════════════════════════════════════════
SELECT projeto,
       count(*)                                   AS fracoes,
       sum(preco_tabela)                          AS vgv,
       count(*) FILTER (WHERE status = 'CPCV')    AS cpcv,
       count(*) FILTER (WHERE status = 'Disponível') AS disponiveis
  FROM fracoes GROUP BY projeto ORDER BY projeto;