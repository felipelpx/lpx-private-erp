-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · SCHEMA COMPLETO
--
-- Correr UMA VEZ, de uma só vez, no SQL Editor de um projeto Supabase NOVO
-- (Dashboard → SQL Editor → New query → colar tudo → Run).
--
-- Este script é idempotente: pode ser corrido novamente sem apagar dados.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. PROFILES — utilizadores da app (ligados ao Supabase Auth)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome             text,
  email            text,
  role             text    NOT NULL DEFAULT 'viewer',  -- admin | gestor | viewer
  approval_level   int     NOT NULL DEFAULT 0,         -- 0 nenhum | 1 nível 1 | 2 nível 2
  can_create_mapas boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Cria automaticamente o profile quando se regista um utilizador no Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, role)
  VALUES (NEW.id,
          COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
          NEW.email,
          'viewer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. CONTAS — contas bancárias por empresa
--    id segue a convenção <empresa_id>_<banco minúsculo sem espaços>
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contas (
  id           text PRIMARY KEY,
  empresa_id   text NOT NULL,
  empresa_nome text,
  banco        text NOT NULL,
  iban         text DEFAULT '',
  saldo        numeric NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contas_empresa ON contas(empresa_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. MOVIMENTOS — linhas de extrato bancário
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS movimentos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id   text NOT NULL,
  empresa_id text,
  banco      text,
  data       date NOT NULL,
  movimento  text,
  valor      numeric NOT NULL DEFAULT 0,
  saldo      numeric NOT NULL DEFAULT 0,
  categoria  text DEFAULT '',
  detalhes   text DEFAULT '',
  seq        int,                       -- preserva a ordem original do Excel
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mov_conta   ON movimentos(conta_id);
CREATE INDEX IF NOT EXISTS idx_mov_data    ON movimentos(data);
CREATE INDEX IF NOT EXISTS idx_mov_empresa ON movimentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_mov_ordem   ON movimentos(conta_id, seq DESC, data DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. FATURAS — contas a pagar
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS faturas (
  id           text PRIMARY KEY,
  empresa      text,          -- id da empresa (ver src/empresas.js)
  projeto      text DEFAULT '',
  fatura       text,          -- nº de fatura
  fornecedor   text,
  categoria    text,
  tipo_projeto text,
  valor        numeric NOT NULL DEFAULT 0,
  vencimento   date,
  status       text NOT NULL DEFAULT 'Pendente',
                              -- Pendente | Aprovada | Paga | Vencida | Em disputa | Rejeitada
  obs          text DEFAULT '',
  anexo_nome   text DEFAULT '',
  anexo_b64    text DEFAULT '',   -- PDF/imagem em base64 (data URL)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_faturas_status  ON faturas(status);
CREATE INDEX IF NOT EXISTS idx_faturas_empresa ON faturas(empresa);
CREATE INDEX IF NOT EXISTS idx_faturas_venc    ON faturas(vencimento);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. PAGAMENTOS_EXTRAS — saídas/entradas manuais do Fluxo Futuro
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagamentos_extras (
  id            text PRIMARY KEY,
  tipo          text NOT NULL DEFAULT 'saida',   -- saida | entrada
  descricao     text,
  empresa       text,
  categoria     text,
  valor         numeric NOT NULL DEFAULT 0,
  data_inicio   date,
  parcelas      int  NOT NULL DEFAULT 1,
  periodicidade text NOT NULL DEFAULT 'unica',   -- unica | mensal | trimestral | anual
  status        text NOT NULL DEFAULT 'Pendente',
  obs           text DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pe_status ON pagamentos_extras(status);
CREATE INDEX IF NOT EXISTS idx_pe_data   ON pagamentos_extras(data_inicio);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. MAPAS DE PAGAMENTO — aprovação em 2 níveis
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mapas_pagamento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          text,
  descricao       text,
  status          text NOT NULL DEFAULT 'pendente_nivel_1',
                  -- pendente_nivel_1 | pendente_nivel_2 | aprovado | recusado
  total_valor     numeric NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  aprovado_n1_por uuid REFERENCES profiles(id),
  aprovado_n1_em  timestamptz,
  aprovado_n2_por uuid REFERENCES profiles(id),
  aprovado_n2_em  timestamptz,
  recusado_por    uuid REFERENCES profiles(id),
  recusado_em     timestamptz,
  motivo_recusa   text
);

CREATE TABLE IF NOT EXISTS mapas_pagamento_itens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapa_id     uuid NOT NULL REFERENCES mapas_pagamento(id) ON DELETE CASCADE,
  tipo_origem text NOT NULL,   -- fatura | pagamento_extra | comissao_sinal |
                               -- comissao_escritura | recebivel_escritura
  origem_id   text NOT NULL,
  descricao   text NOT NULL,
  fornecedor  text,
  empresa     text,
  categoria   text,
  valor       numeric NOT NULL,
  vencimento  date,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mpi_mapa_id ON mapas_pagamento_itens(mapa_id);
CREATE INDEX IF NOT EXISTS idx_mp_status   ON mapas_pagamento(status);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. FRACOES — inventário comercial
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fracoes (
  id             text PRIMARY KEY,
  projeto        text,
  fracao         text,
  tipologia      text,
  area           numeric DEFAULT 0,
  preco_tabela   numeric DEFAULT 0,
  status         text DEFAULT 'Disponível',  -- Disponível | Reservada | CPCV | Escriturada
  piso           text,
  bloco          text,
  andar          text,
  estacionamento text,
  notas          text DEFAULT '',
  documentos     jsonb DEFAULT '[]'::jsonb,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fracoes_projeto ON fracoes(projeto);

-- ───────────────────────────────────────────────────────────────────────────
-- 8. VENDAS
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendas (
  id                          text PRIMARY KEY,
  fracao_id                   text,
  projeto                     text,
  fracao                      text,
  cliente                     text,
  nif                         text,
  email                       text,
  telefone                    text,
  valor_venda                 numeric DEFAULT 0,
  preco_tabela                numeric DEFAULT 0,
  desconto_pct                numeric DEFAULT 0,
  recebemos                   numeric DEFAULT 0,
  falta_receber               numeric DEFAULT 0,
  previsao_escritura          date,
  data                        date,
  parcelas                    jsonb DEFAULT '[]'::jsonb,
  mediador                    text,
  mediadores                  jsonb DEFAULT '[]'::jsonb,
  comissao_pct                numeric DEFAULT 0,
  comissao_valor              numeric DEFAULT 0,
  comissao_manual             boolean DEFAULT false,
  comissao_parcelas           jsonb DEFAULT '[]'::jsonb,
  comissao_paga_sinal         numeric DEFAULT 0,
  comissao_paga_escritura     numeric DEFAULT 0,
  comissao_pendente_sinal     numeric DEFAULT 0,
  comissao_pendente_escritura numeric DEFAULT 0,
  data_pagamento_sinal        date,
  data_pagamento_escritura    date,
  liquido_empresa             numeric DEFAULT 0,
  comissao_status             text,
  fatura_criada               boolean DEFAULT false,
  status                      text,
  documentos                  jsonb DEFAULT '[]'::jsonb,
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vendas_fracao ON vendas(fracao_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 9. ORCAMENTO — real × orçado por empresa/categoria
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orcamento (
  id         text PRIMARY KEY,
  empresa_id text,
  projeto    text,
  categoria  text,
  grupo      text,     -- receita | capex | obra | opex | resultado
  orcado     numeric DEFAULT 0,
  realizado  numeric DEFAULT 0,
  a_realizar numeric DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orc_empresa ON orcamento(empresa_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 10. ENTIDADES — fornecedores, clientes, mediadores
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entidades (
  id         text PRIMARY KEY,
  tipo       text,     -- Fornecedor | Cliente | Mediador | Outro
  nome       text NOT NULL,
  nif        text,
  iban       text,
  email      text,
  telefone   text,
  notas      text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entidades_tipo ON entidades(tipo);

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. RLS — acesso a utilizadores autenticados
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','contas','movimentos','faturas','pagamentos_extras',
    'mapas_pagamento','mapas_pagamento_itens','fracoes','vendas',
    'orcamento','entidades'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_full_access" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "auth_full_access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. REALTIME — sincronização em tempo real entre utilizadores
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','contas','movimentos','faturas','pagamentos_extras',
    'mapas_pagamento','mapas_pagamento_itens','fracoes','vendas',
    'orcamento','entidades'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. SEED — empresas e contas bancárias da LPX Private
--     Tem de coincidir com src/empresas.js
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO contas (id, empresa_id, empresa_nome, banco, iban, saldo) VALUES
  ('favcloset_bcp',     'favcloset', 'Favorite Closet',    'BCP',     '', 0),
  ('favcloset_red',     'favcloset', 'Favorite Closet',    'RED',     '', 0),
  ('simplify_bcp',      'simplify',  'Simplify Rubric',    'BCP',     '', 0),
  ('simplify_red',      'simplify',  'Simplify Rubric',    'RED',     '', 0),
  ('enchanted_bcp',     'enchanted', 'Enchanted Vortex',   'BCP',     '', 0),
  ('blessed_bcp',       'blessed',   'Blessed Legion',     'BCP',     '', 0),
  ('pearl_bcp',         'pearl',     'Pearl Syntax',       'BCP',     '', 0),
  ('genero_bcp',        'genero',    'Género Prudente',    'BCP',     '', 0),
  ('fluffy_bcp',        'fluffy',    'Fluffy Rithm',       'BCP',     '', 0),
  ('adseq_bcp',         'adseq',     'Admirable Sequence', 'BCP',     '', 0),
  ('adseq_red',         'adseq',     'Admirable Sequence', 'RED',     '', 0),
  ('infinite_bcp',      'infinite',  'Infinite Change',    'BCP',     '', 0),
  ('infinite_red',      'infinite',  'Infinite Change',    'RED',     '', 0),
  ('lpx_bcp',           'lpx',       'LPX Private',        'BCP',     '', 0),
  ('lpx_revolut',       'lpx',       'LPX Private',        'Revolut', '', 0),
  ('lpx_cgd',           'lpx',       'LPX Private',        'CGD',     '', 0)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIM. Passo seguinte: criar os utilizadores (ver /criar-utilizadores.html)
-- ═══════════════════════════════════════════════════════════════════════════
