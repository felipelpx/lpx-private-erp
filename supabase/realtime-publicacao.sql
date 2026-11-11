-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · O tempo real das tabelas
--
-- ── Porque é que isto existe ────────────────────────────────────────────────
-- Até à v133, o ERP só refrescava uma lista quando o Supabase lhe mandava um
-- aviso de que a tabela tinha mudado. Se esse aviso não chegasse, nada mudava
-- no ecrã até um F5.
--
-- Na v134 isso deixou de ser verdade: cada gravação já aplica a linha à lista
-- por sua conta, e o aviso do Supabase passou a ser um extra. Portanto já não
-- precisas de correr isto para o ERP funcionar.
--
-- Vale a pena correr por outra razão: com o tempo real ligado, se o Pedro
-- lançar uma fatura no portátil dele, ela aparece no teu ecrã sem tocares em
-- nada. Sem tempo real, aparece quando mudares de página. Uma coisa é um bug,
-- a outra é uma comodidade — esta é a comodidade.
--
-- Correr no SQL Editor do Supabase. É idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1 — O DIAGNÓSTICO (só lê)
--
-- Que tabelas é que estão na publicação do tempo real. As que faltarem são
-- exactamente aquelas em que o F5 era obrigatório.
-- ───────────────────────────────────────────────────────────────────────────
SELECT t.tabela,
       CASE WHEN p.tablename IS NULL THEN '— em falta' ELSE 'ok' END AS tempo_real
  FROM (VALUES
          ('faturas'), ('pagamentos_extras'), ('movimentos'), ('contas'),
          ('orcamento'), ('obra_planos'), ('despesas_recorrentes'),
          ('recebiveis'), ('vendas'), ('fracoes'), ('mapas_pagamento'),
          ('iva_pagamentos'), ('questionamentos'), ('profiles')
       ) AS t(tabela)
  LEFT JOIN pg_publication_tables p
         ON p.pubname = 'supabase_realtime'
        AND p.schemaname = 'public'
        AND p.tablename = t.tabela
 ORDER BY tempo_real, t.tabela;

-- 1.2 E ao contrário: o que está lá dentro, incluindo tabelas que já não uses.
SELECT schemaname AS esquema, tablename AS tabela
  FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime'
 ORDER BY schemaname, tablename;

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2 — LIGAR O TEMPO REAL ÀS QUE FALTAM
--
-- Acrescenta à publicação só as que existem e ainda não lá estão. Uma tabela
-- que não exista é ignorada em silêncio, e correr isto duas vezes não faz mal.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  alvos text[] := ARRAY[
    'faturas', 'pagamentos_extras', 'movimentos', 'contas',
    'orcamento', 'obra_planos', 'despesas_recorrentes',
    'recebiveis', 'vendas', 'fracoes', 'mapas_pagamento',
    'iva_pagamentos', 'questionamentos'
  ];
BEGIN
  -- Se a publicação não existir (base nova), cria-se vazia.
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
    RAISE NOTICE 'publicação supabase_realtime criada';
  END IF;

  FOREACH t IN ARRAY alvos LOOP
    -- A tabela existe?
    IF NOT EXISTS (SELECT 1 FROM pg_tables
                    WHERE schemaname = 'public' AND tablename = t) THEN
      RAISE NOTICE 'ignorada (não existe): %', t;
      CONTINUE;
    END IF;
    -- Já está na publicação?
    IF EXISTS (SELECT 1 FROM pg_publication_tables
                WHERE pubname = 'supabase_realtime'
                  AND schemaname = 'public' AND tablename = t) THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    RAISE NOTICE 'tempo real ligado: %', t;
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 3 — O QUE O AVISO LEVA
--
-- Por omissão, o aviso de um UPDATE ou de um DELETE só traz a chave primária.
-- Para o ERP isso basta — ele vai buscar a linha. Mas num DELETE, trazer a
-- linha inteira permite-lhe tirá-la da lista sem ir à base.
--
-- REPLICA IDENTITY FULL tem um custo: cada UPDATE passa a escrever a linha
-- antiga toda no WAL. Nas tabelas do ERP (milhares de linhas, não milhões) é
-- irrelevante. Deixo ligado só nas duas que mais mexem.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['faturas', 'pagamentos_extras'] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables
                WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    END IF;
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 4 — CONFERIR
-- ───────────────────────────────────────────────────────────────────────────
SELECT t.tabela,
       CASE WHEN p.tablename IS NULL THEN '— AINDA EM FALTA' ELSE 'ok' END AS tempo_real
  FROM (VALUES
          ('faturas'), ('pagamentos_extras'), ('movimentos'), ('contas'),
          ('orcamento'), ('obra_planos'), ('despesas_recorrentes'),
          ('recebiveis'), ('vendas'), ('fracoes'), ('mapas_pagamento'),
          ('iva_pagamentos'), ('questionamentos')
       ) AS t(tabela)
  LEFT JOIN pg_publication_tables p
         ON p.pubname = 'supabase_realtime'
        AND p.schemaname = 'public'
        AND p.tablename = t.tabela
 ORDER BY tempo_real, t.tabela;
-- Se alguma ficar "AINDA EM FALTA", é porque a tabela não existe com esse
-- nome nesta base — diz-me qual e eu confirmo o nome certo.
--
-- Nota: o tempo real respeita o RLS. Um investidor só recebe avisos das
-- linhas que pode ler, o que é o que se quer.
