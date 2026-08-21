-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Migração v2
--   1. Nomes das empresas com o projeto entre parênteses
--   2. Tabela `fotos` + bucket de Storage
--   3. Perfil "investidor" com acesso limitado às empresas marcadas (RLS)
--
-- Correr de uma só vez no SQL Editor do Supabase. É idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. NOMES DAS EMPRESAS
--    Os ids das contas NÃO mudam, por isso os movimentos já importados
--    continuam ligados.
-- ───────────────────────────────────────────────────────────────────────────
UPDATE contas SET empresa_nome = 'Favorite Closet (Amadeu 07)'          WHERE empresa_id = 'favcloset';
UPDATE contas SET empresa_nome = 'Simplify Rubric (Alto dos 7 Moinhos)' WHERE empresa_id = 'simplify';
UPDATE contas SET empresa_nome = 'Enchanted Vortex (Developer A07)'     WHERE empresa_id = 'enchanted';
UPDATE contas SET empresa_nome = 'BlessedLegion (Developer 7M)'         WHERE empresa_id = 'blessed';
UPDATE contas SET empresa_nome = 'Pearl Syntax (Aura Properties)'       WHERE empresa_id = 'pearl';
UPDATE contas SET empresa_nome = 'Genero Prudente (Maria Pia)'          WHERE empresa_id = 'genero';
UPDATE contas SET empresa_nome = 'Fluffy Rithm (Tax SPV)'               WHERE empresa_id = 'fluffy';
UPDATE contas SET empresa_nome = 'Admirable Sequence (Cinq Etoiles)'    WHERE empresa_id = 'adseq';
UPDATE contas SET empresa_nome = 'Infinite Change (Paço D''arcos)'      WHERE empresa_id = 'infinite';
UPDATE contas SET empresa_nome = 'LPX Private (Holding)'                WHERE empresa_id = 'lpx';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. PERFIL INVESTIDOR
--    profiles.empresas guarda a lista de empresa_id a que o utilizador acede.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS empresas text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN profiles.empresas IS
  'Empresas visíveis para role=investidor. Vazio = não vê nada. Ignorado nos outros perfis.';

-- Funções auxiliares usadas pelas políticas de RLS.
-- SECURITY DEFINER para poderem ler `profiles` sem recursão de políticas.
CREATE OR REPLACE FUNCTION public.meu_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT role FROM profiles WHERE id = auth.uid()), 'viewer');
$$;

CREATE OR REPLACE FUNCTION public.minhas_empresas()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT empresas FROM profiles WHERE id = auth.uid()), '{}');
$$;

-- Um investidor vê a empresa X; toda a gente autenticada vê tudo.
CREATE OR REPLACE FUNCTION public.pode_ver_empresa(emp text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.meu_role() = 'investidor' THEN emp = ANY (public.minhas_empresas())
    ELSE true
  END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. TABELA DE FOTOS
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fotos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL,
  path       text NOT NULL UNIQUE,   -- caminho no bucket "fotos"
  legenda    text DEFAULT '',
  data       date NOT NULL DEFAULT CURRENT_DATE,
  tamanho    bigint,
  criado_por uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fotos_empresa ON fotos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fotos_data    ON fotos(data DESC);

ALTER TABLE fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE fotos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. RLS — isolamento por empresa
--    Substitui a política "tudo para autenticados" nas tabelas com empresa.
--    Investidores: leitura apenas; e só das suas empresas.
-- ───────────────────────────────────────────────────────────────────────────

-- 4.1 MOVIMENTOS (extratos)
DROP POLICY IF EXISTS "auth_full_access" ON movimentos;
DROP POLICY IF EXISTS "ver_movimentos"   ON movimentos;
DROP POLICY IF EXISTS "editar_movimentos" ON movimentos;
CREATE POLICY "ver_movimentos" ON movimentos FOR SELECT TO authenticated
  USING (public.pode_ver_empresa(empresa_id));
CREATE POLICY "editar_movimentos" ON movimentos FOR ALL TO authenticated
  USING (public.meu_role() <> 'investidor')
  WITH CHECK (public.meu_role() <> 'investidor');

-- 4.2 CONTAS (saldos)
DROP POLICY IF EXISTS "auth_full_access" ON contas;
DROP POLICY IF EXISTS "ver_contas"       ON contas;
DROP POLICY IF EXISTS "editar_contas"    ON contas;
CREATE POLICY "ver_contas" ON contas FOR SELECT TO authenticated
  USING (public.pode_ver_empresa(empresa_id));
CREATE POLICY "editar_contas" ON contas FOR ALL TO authenticated
  USING (public.meu_role() <> 'investidor')
  WITH CHECK (public.meu_role() <> 'investidor');

-- 4.3 FOTOS
DROP POLICY IF EXISTS "ver_fotos"    ON fotos;
DROP POLICY IF EXISTS "editar_fotos" ON fotos;
CREATE POLICY "ver_fotos" ON fotos FOR SELECT TO authenticated
  USING (public.pode_ver_empresa(empresa_id));
CREATE POLICY "editar_fotos" ON fotos FOR ALL TO authenticated
  USING (public.meu_role() IN ('admin','gestor'))
  WITH CHECK (public.meu_role() IN ('admin','gestor'));

-- 4.4 VENDAS e FRACOES (tabela comercial)
--     Ligam-se à empresa pelo nome do projeto, não por empresa_id.
DROP POLICY IF EXISTS "auth_full_access" ON vendas;
DROP POLICY IF EXISTS "ver_vendas"       ON vendas;
DROP POLICY IF EXISTS "editar_vendas"    ON vendas;
CREATE POLICY "ver_vendas" ON vendas FOR SELECT TO authenticated
  USING (
    public.meu_role() <> 'investidor'
    OR projeto IN (SELECT DISTINCT c.empresa_nome FROM contas c
                    WHERE c.empresa_id = ANY (public.minhas_empresas()))
    OR projeto = ANY (public.minhas_empresas())
  );
CREATE POLICY "editar_vendas" ON vendas FOR ALL TO authenticated
  USING (public.meu_role() <> 'investidor')
  WITH CHECK (public.meu_role() <> 'investidor');

DROP POLICY IF EXISTS "auth_full_access" ON fracoes;
DROP POLICY IF EXISTS "ver_fracoes"      ON fracoes;
DROP POLICY IF EXISTS "editar_fracoes"   ON fracoes;
CREATE POLICY "ver_fracoes" ON fracoes FOR SELECT TO authenticated
  USING (
    public.meu_role() <> 'investidor'
    OR projeto IN (SELECT DISTINCT c.empresa_nome FROM contas c
                    WHERE c.empresa_id = ANY (public.minhas_empresas()))
    OR projeto = ANY (public.minhas_empresas())
  );
CREATE POLICY "editar_fracoes" ON fracoes FOR ALL TO authenticated
  USING (public.meu_role() <> 'investidor')
  WITH CHECK (public.meu_role() <> 'investidor');

-- 4.5 Tabelas que o investidor NÃO pode ver de todo
--     (faturas, pagamentos, mapas, orçamento, entidades)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'faturas','pagamentos_extras','mapas_pagamento',
    'mapas_pagamento_itens','orcamento','entidades'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_full_access" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "sem_investidores" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "sem_investidores" ON %I FOR ALL TO authenticated
         USING (public.meu_role() <> ''investidor'')
         WITH CHECK (public.meu_role() <> ''investidor'')', t);
  END LOOP;
END $$;

-- 4.6 PROFILES — cada um vê o seu; admins veem e editam todos
DROP POLICY IF EXISTS "auth_full_access" ON profiles;
DROP POLICY IF EXISTS "ver_profiles"     ON profiles;
DROP POLICY IF EXISTS "editar_profiles"  ON profiles;
CREATE POLICY "ver_profiles" ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.meu_role() IN ('admin','gestor'));
CREATE POLICY "editar_profiles" ON profiles FOR ALL TO authenticated
  USING (public.meu_role() = 'admin')
  WITH CHECK (public.meu_role() = 'admin');

-- ───────────────────────────────────────────────────────────────────────────
-- 5. STORAGE — bucket privado das fotos
--    Os ficheiros são servidos por URL assinado; o caminho começa sempre
--    pelo empresa_id, que é o que as políticas usam para filtrar.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos', 'fotos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "fotos_ver"    ON storage.objects;
DROP POLICY IF EXISTS "fotos_enviar" ON storage.objects;
DROP POLICY IF EXISTS "fotos_apagar" ON storage.objects;

CREATE POLICY "fotos_ver" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'fotos'
    AND public.pode_ver_empresa(split_part(name, '/', 1))
  );

CREATE POLICY "fotos_enviar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fotos' AND public.meu_role() IN ('admin','gestor'));

CREATE POLICY "fotos_apagar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fotos' AND public.meu_role() IN ('admin','gestor'));

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════════════════════
SELECT DISTINCT empresa_id, empresa_nome FROM contas ORDER BY empresa_nome;
SELECT nome, email, role, empresas FROM profiles ORDER BY role, nome;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMO CRIAR UM INVESTIDOR
--   1. Authentication → Users → Add user (com Auto Confirm ligado)
--   2. Correr, trocando o email e as empresas:
--
--      UPDATE profiles
--         SET role = 'investidor',
--             nome = 'Nome do Investidor',
--             empresas = ARRAY['favcloset']     -- ids de src/empresas.js
--       WHERE email = 'investidor@exemplo.com';
--
--   Ou, mais simples: no ERP, separador Utilizadores, escolher o perfil
--   "Investidor" e marcar os projetos com as caixas de seleção.
--
--   ids disponíveis: favcloset, simplify, enchanted, blessed, pearl,
--                    genero, fluffy, adseq, infinite, lpx
-- ═══════════════════════════════════════════════════════════════════════════
