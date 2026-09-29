-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Migração v11
--   Questionamentos dos investidores sobre lançamentos do extrato
--   + notificação aos gestores (por leitura / não leitura)
--
-- Correr no SQL Editor do Supabase. É idempotente: podes correr duas vezes.
-- Depende da migração v2 (funções meu_role / minhas_empresas / pode_ver_empresa).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS questionamentos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lançamento questionado (guardamos também uma cópia dos dados do movimento:
  -- se o movimento for reimportado ou corrigido, a pergunta continua a fazer
  -- sentido para quem a lê meses depois)
  movimento_id   uuid REFERENCES movimentos(id) ON DELETE SET NULL,
  conta_id       text,
  empresa        text NOT NULL,
  banco          text,
  mov_data       date,
  mov_descricao  text,
  mov_valor      numeric,

  -- Quem perguntou
  autor_id       uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  autor_nome     text,
  autor_email    text,

  texto          text NOT NULL,
  status         text NOT NULL DEFAULT 'aberto',   -- aberto | respondido | fechado

  -- Resposta do gestor
  resposta       text,
  respondido_por text,
  respondido_em  timestamptz,

  -- Notificação: cada gestor que abre a questão fica registado aqui.
  -- O contador de "por ler" no topo do ERP é simplesmente o nº de questões
  -- em que o id do gestor ainda não consta nesta lista.
  lido_por       uuid[] NOT NULL DEFAULT '{}',

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quest_empresa ON questionamentos(empresa);
CREATE INDEX IF NOT EXISTS idx_quest_autor   ON questionamentos(autor_id);
CREATE INDEX IF NOT EXISTS idx_quest_mov     ON questionamentos(movimento_id);
CREATE INDEX IF NOT EXISTS idx_quest_criado  ON questionamentos(created_at DESC);

-- Colunas acrescentadas depois da primeira versão desta migração
ALTER TABLE questionamentos ADD COLUMN IF NOT EXISTS banco text;
ALTER TABLE questionamentos ADD COLUMN IF NOT EXISTS lido_por uuid[] NOT NULL DEFAULT '{}';

-- As permissões de tabela são dadas explicitamente; quem manda mesmo é o RLS
-- logo a seguir (sem uma política que autorize, estes GRANTs não abrem nada).
GRANT SELECT, INSERT, UPDATE, DELETE ON questionamentos TO authenticated;

ALTER TABLE questionamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE questionamentos REPLICA IDENTITY FULL;

-- Realtime: é isto que faz o sino aparecer ao gestor sem ter de recarregar
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE questionamentos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at automático
CREATE OR REPLACE FUNCTION public.toca_questionamento()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_quest_updated ON questionamentos;
CREATE TRIGGER trg_quest_updated BEFORE UPDATE ON questionamentos
  FOR EACH ROW EXECUTE FUNCTION public.toca_questionamento();

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
--   · o investidor cria questões só em nome próprio e só sobre empresas suas;
--   · o investidor lê e edita apenas as suas;
--   · admin e gestor leem tudo e respondem;
--   · ninguém apaga questões de outros.
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "quest_ver"      ON questionamentos;
DROP POLICY IF EXISTS "quest_criar"    ON questionamentos;
DROP POLICY IF EXISTS "quest_alterar"  ON questionamentos;
DROP POLICY IF EXISTS "quest_apagar"   ON questionamentos;

CREATE POLICY "quest_ver" ON questionamentos FOR SELECT TO authenticated
  USING (
    public.meu_role() IN ('admin','gestor')
    OR autor_id = auth.uid()
  );

CREATE POLICY "quest_criar" ON questionamentos FOR INSERT TO authenticated
  WITH CHECK (
    autor_id = auth.uid()
    AND public.pode_ver_empresa(empresa)
    AND length(btrim(texto)) > 0
  );

-- O gestor responde; o autor pode corrigir o texto da sua pergunta.
CREATE POLICY "quest_alterar" ON questionamentos FOR UPDATE TO authenticated
  USING (public.meu_role() IN ('admin','gestor') OR autor_id = auth.uid())
  WITH CHECK (public.meu_role() IN ('admin','gestor') OR autor_id = auth.uid());

CREATE POLICY "quest_apagar" ON questionamentos FOR DELETE TO authenticated
  USING (public.meu_role() IN ('admin','gestor') OR autor_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'tabela criada' AS passo,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_name = 'questionamentos') AS colunas;

SELECT policyname, cmd FROM pg_policies
 WHERE tablename = 'questionamentos' ORDER BY policyname;

-- Quem vai receber as notificações (admin + gestor):
SELECT nome, email, role FROM profiles
 WHERE role IN ('admin','gestor') ORDER BY role, nome;
