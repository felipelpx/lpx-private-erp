-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Investidores dos projetos HDG
--   Dá a cada investidor o perfil "investidor" e o acesso ao seu projeto.
--
-- CORRER DEPOIS de criares os utilizadores no Supabase
-- (Authentication → Users → Add user, com "Auto Confirm User" ligado).
-- As passwords são definidas por ti nesse ecrã — não passam por aqui.
--
-- Um investidor só vê Extratos, Comercial, Fotos, Contas a Pagar e
-- Investor Relations, e apenas das empresas listadas em `empresas`.
-- Não edita nada: a base de dados recusa qualquer escrita (migração v2).
-- ═══════════════════════════════════════════════════════════════════════════

-- Garante que existe um perfil para cada utilizador já criado no Auth
INSERT INTO profiles (id, nome, email, role)
SELECT u.id, initcap(split_part(u.email,'@',1)), u.email, 'viewer'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;


-- PARCELA EMERGENTE – UNIPESSOAL LDA  (adseq 20%)
UPDATE profiles SET role='investidor', nome='Mauricio Cerginer', approval_level=0,
       can_create_mapas=false, empresas=ARRAY['adseq']
 WHERE email='parcelaemergente@lpxprivate.com';

-- PALATINE LISBOA – UNIPESSOAL LDA  (adseq 20%)
UPDATE profiles SET role='investidor', nome='Nadim Haider', approval_level=0,
       can_create_mapas=false, empresas=ARRAY['adseq']
 WHERE email='palatinelisboa@lpxprivate.com';

-- IDEIAS VIDRADAS LDA · Ideias Viradas  (adseq 20%, infinite 10%)
UPDATE profiles SET role='investidor', nome='Ventura Alonso Pires', approval_level=0,
       can_create_mapas=false, empresas=ARRAY['adseq', 'infinite']
 WHERE email='ideiasvidradas@lpxprivate.com';

-- RUMO DECIMAL LDA  (adseq 20%)
UPDATE profiles SET role='investidor', nome='Alexandre Mangabeira Albernaz', approval_level=0,
       can_create_mapas=false, empresas=ARRAY['adseq']
 WHERE email='rumodecimal@lpxprivate.com';

-- MAGICBIZ, UNIPESSOAL LDA  (adseq 10%)
UPDATE profiles SET role='investidor', nome='Felipe Benchouchan', approval_level=0,
       can_create_mapas=false, empresas=ARRAY['adseq']
 WHERE email='magicbizunipessoal@lpxprivate.com';

-- BLACK HAWK CAPITAL LDA  (adseq 10%)
UPDATE profiles SET role='investidor', nome='André Rotstein Schor', approval_level=0,
       can_create_mapas=false, empresas=ARRAY['adseq']
 WHERE email='blackhawk@lpxprivate.com';

-- Rui Lima Cabral Unip. Lda  (infinite 20%)
UPDATE profiles SET role='investidor', nome='Rui Lima Cabral', approval_level=0,
       can_create_mapas=false, empresas=ARRAY['infinite']
 WHERE email='ruilima@lpxprivate.com';

-- Vazio Arquitectura Lda  (infinite 10%)
UPDATE profiles SET role='investidor', nome='Carlos Moreira Teixeira', approval_level=0,
       can_create_mapas=false, empresas=ARRAY['infinite']
 WHERE email='vazioacquitectura@lpxprivate.com';

-- Optimist Lion Lda  (infinite 10%)
UPDATE profiles SET role='investidor', nome='Optimist Lion Lda', approval_level=0,
       can_create_mapas=false, empresas=ARRAY['infinite']
 WHERE email='optimistaclion@lpxprivate.com';

-- ExisteNumero Invest. Imob. Lda  (infinite 10%)
UPDATE profiles SET role='investidor', nome='ExisteNumero Invest. Imob. Lda', approval_level=0,
       can_create_mapas=false, empresas=ARRAY['infinite']
 WHERE email='existenumero@lpxprivate.com';

-- Oráculo Sábio Lda  (infinite 20%)
UPDATE profiles SET role='investidor', nome='Oráculo Sábio Lda', approval_level=0,
       can_create_mapas=false, empresas=ARRAY['infinite']
 WHERE email='oraculoacsabio@lpxprivate.com';

-- Echanted Fields  (infinite 20%)
UPDATE profiles SET role='investidor', nome='Echanted Fields', approval_level=0,
       can_create_mapas=false, empresas=ARRAY['infinite']
 WHERE email='echanteddfields@lpxprivate.com';

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA — devem aparecer 12 investidores com os projetos atribuídos
-- ═══════════════════════════════════════════════════════════════════════════
SELECT nome, email, role, empresas
  FROM profiles WHERE role='investidor' ORDER BY nome;

-- Quem ficou por configurar (criado no Auth mas ainda como viewer):
SELECT nome, email FROM profiles WHERE role='viewer' ORDER BY email;