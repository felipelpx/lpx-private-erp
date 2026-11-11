-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Eliminar faturas
--
-- O botão 🗑 do Contas a Pagar diz "Nenhuma fatura foi eliminada". O pedido
-- chega ao Supabase, não dá erro, e volta com zero linhas — que é como o
-- Postgres recusa um DELETE por RLS: em silêncio.
--
-- Este ficheiro faz três coisas, por esta ordem:
--   PARTE 1 — diz o que está lá (não altera nada)
--   PARTE 2 — apaga a fatura errada, agora, à mão
--   PARTE 3 — cria a política que falta, para o botão passar a funcionar
--
-- Correr no SQL Editor do Supabase, do projeto da LPX. É idempotente:
-- correr duas vezes não faz mal nenhum.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1 — O DIAGNÓSTICO (só lê)
-- ───────────────────────────────────────────────────────────────────────────

-- 1.1 As políticas que existem em 'faturas'. Olha à coluna `cmd`:
--     ALL cobre o DELETE. SELECT, INSERT e UPDATE não cobrem.
--     Se não aparecer nenhuma linha com cmd = 'ALL' ou cmd = 'DELETE',
--     está encontrado o problema.
SELECT policyname AS politica,
       cmd        AS comando,
       roles::text AS para_quem,
       qual       AS condicao_de_leitura,
       with_check AS condicao_de_escrita
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'faturas'
 ORDER BY cmd, policyname;

-- 1.2 O teu papel. A política de escrita decide por aqui.
--     Se aparecer 'viewer' ou vazio, o problema é o perfil, não a política.
SELECT id, email, role, approval_level, empresas
  FROM profiles
 ORDER BY role, email;

-- 1.3 Que outras tabelas têm o mesmo buraco: têm RLS ligado e políticas de
--     escrita, mas nenhuma que cubra o DELETE. Nessas, apagar pela app vai
--     falhar da mesma maneira silenciosa.
--     (Tabelas sem RLS nenhum não entram: nessas apaga-se à vontade.)
SELECT c.relname AS tabela,
       COUNT(p.policyname) AS n_politicas
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_policies p
         ON p.schemaname = n.nspname AND p.tablename = c.relname
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
 GROUP BY c.relname
HAVING COUNT(p.policyname) > 0
   AND NOT bool_or(p.cmd IN ('ALL', 'DELETE'))
 ORDER BY c.relname;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2 — APAGAR A FATURA ERRADA, AGORA
--
-- O SQL Editor corre como dono da base de dados e NÃO passa pelo RLS, por
-- isso isto funciona mesmo antes da Parte 3.
--
-- ⚠ Não há desfazer. Corre primeiro o 2.1, confirma que é mesmo aquela, e
--   só depois o 2.2.
-- ───────────────────────────────────────────────────────────────────────────

-- 2.1 Encontrar a fatura. Troca o texto por parte do nome do fornecedor,
--     do n.º da fatura ou da observação.
SELECT id, empresa, projeto, fatura, fornecedor, valor, vencimento,
       status, obs, created_at
  FROM faturas
 WHERE fornecedor ILIKE '%ESCREVE AQUI%'
    OR fatura     ILIKE '%ESCREVE AQUI%'
    OR obs        ILIKE '%ESCREVE AQUI%'
 ORDER BY created_at DESC;

-- 2.2 Antes de apagar: ver se a fatura está dentro de algum mapa de
--     pagamento. Os mapas guardam o id da fatura em texto, sem chave
--     estrangeira — ou seja, apagar a fatura NÃO limpa a linha do mapa,
--     que fica a apontar para o vazio.
SELECT mp.id AS mapa, mp.descricao, mp.status, mpi.descricao AS linha, mpi.valor
  FROM mapas_pagamento_itens mpi
  JOIN mapas_pagamento mp ON mp.id = mpi.mapa_id
 WHERE mpi.tipo_origem = 'fatura'
   AND mpi.origem_id = 'COLA-AQUI-O-ID';

-- 2.3 Apagar. Cola o id que veio do 2.1 — o id, não o n.º da fatura.
--     Devolve a linha apagada, para ficar registo do que saiu.
DELETE FROM faturas
 WHERE id = 'COLA-AQUI-O-ID'
RETURNING id, fornecedor, fatura, valor, vencimento, status;

-- 2.4 Só se o 2.2 tiver devolvido alguma coisa: tirar a linha órfã do mapa.
-- DELETE FROM mapas_pagamento_itens
--  WHERE tipo_origem = 'fatura' AND origem_id = 'COLA-AQUI-O-ID';


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 3 — A POLÍTICA QUE FALTA, PARA O BOTÃO PASSAR A FUNCIONAR
--
-- Quem pode apagar: admin e gestor. É de propósito mais apertado do que as
-- políticas de escrita que já lá estão (que só excluem o investidor): o
-- botão 🗑 só aparece a admin e gestor no ecrã, e apagar é a única acção
-- do ERP que não tem volta. O que a API permite passa a ser o mesmo que o
-- ecrã mostra, em vez de ser mais.
-- ───────────────────────────────────────────────────────────────────────────

-- A função já existe desde a migração v2. Vai recriada aqui para o caso de esta
-- base de dados nunca a ter visto. Devolve 'viewer' a quem não tem perfil.
CREATE OR REPLACE FUNCTION public.meu_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT role FROM profiles WHERE id = auth.uid()), 'viewer');
$$;

ALTER TABLE faturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apagar_faturas" ON faturas;
CREATE POLICY "apagar_faturas" ON faturas FOR DELETE TO authenticated
  USING (public.meu_role() IN ('admin', 'gestor'));

-- O PostgREST devolve a linha apagada através de um .select() a seguir ao
-- delete, e esse select ainda passa pela política de leitura. Se não houver
-- nenhuma, o delete acontece mas a app continua a ver zero linhas e a dizer
-- que não apagou nada. Esta garante que há.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'faturas'
                    AND cmd IN ('ALL', 'SELECT')) THEN
    EXECUTE 'CREATE POLICY "ver_faturas" ON faturas FOR SELECT TO authenticated
               USING (public.meu_role() <> ''investidor'')';
  END IF;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 4 — CONFERIR
-- ───────────────────────────────────────────────────────────────────────────
SELECT policyname AS politica, cmd AS comando, roles::text AS para_quem
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'faturas'
 ORDER BY cmd, policyname;
-- Tem de aparecer uma linha com cmd = 'DELETE' (ou 'ALL').
