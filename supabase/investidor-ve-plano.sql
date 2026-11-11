-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · O investidor vê o fluxo futuro do seu projeto
--
-- ── O que está a acontecer ─────────────────────────────────────────────────
-- No ecrã de Investor Relations, o Fluxo Futuro de um projeto mostra duas ou
-- três colunas em vez das nove, e um punhado de linhas em vez de todas. Não
-- é o ecrã: é a base de dados a esconder as linhas.
--
-- A migração v2 pôs a tabela `pagamentos_extras` na lista das que o
-- investidor "não pode ver de todo":
--
--     CREATE POLICY "sem_investidores" ON pagamentos_extras FOR ALL
--       USING (public.meu_role() <> 'investidor')
--
-- E é nessa tabela que o plano de obra vive INTEIRO: a obra mês a mês, o IVA,
-- os juros, a fiscalização, o CSO, as avenças, o funding do banco, a venda na
-- escritura. O que sobra para o investidor são as faturas já lançadas — por
-- isso o fluxo dele tinha 13 linhas onde a equipa vê 26, e parava no mês
-- seguinte.
--
-- ── O que isto muda ────────────────────────────────────────────────────────
-- Passa a haver uma política de LEITURA sobre `pagamentos_extras`, limitada
-- às empresas a que cada investidor tem acesso (a mesma função que já governa
-- as faturas e os movimentos). Escrever continua vedado.
--
-- Em concreto, um investidor passa a poder ler, das SUAS empresas: a
-- descrição de cada previsão, o valor, a data, a categoria e o estado. Se
-- alguma dessas descrições disser coisas que não queres que ele leia, diz —
-- há uma alternativa mais estreita (uma vista com menos colunas), mas obriga
-- a mexer no ecrã e não a faço sem tu quereres.
--
-- Correr no SQL Editor do Supabase. É idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1 — O DIAGNÓSTICO (só lê)
-- ───────────────────────────────────────────────────────────────────────────

-- 1.1 As políticas de `pagamentos_extras`. Se só aparecer "sem_investidores"
--     com cmd = ALL, está encontrado.
SELECT policyname AS politica, cmd AS comando, qual AS condicao
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'pagamentos_extras'
 ORDER BY cmd, policyname;

-- 1.2 Quanto é que o investidor está a perder, por empresa: as linhas do
--     plano de obra que existem e que ele não consegue ler.
SELECT empresa,
       COUNT(*) FILTER (WHERE plano_tipo IS NOT NULL) AS linhas_do_plano,
       COUNT(*) AS previsoes,
       MIN(data_inicio) AS da,
       MAX(data_inicio) AS ate
  FROM pagamentos_extras
 WHERE status IS DISTINCT FROM 'Convertida'
 GROUP BY empresa
 ORDER BY empresa;

-- 1.3 E que empresas é que cada investidor pode ver.
SELECT email, role, empresas
  FROM profiles
 WHERE role = 'investidor'
 ORDER BY email;

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2 — A POLÍTICA DE LEITURA
--
-- Mesma forma que já existe nas faturas (migracao-v3) e nos movimentos
-- (migracao-v2): quem não é investidor vê tudo; o investidor vê as empresas
-- que tem no perfil. Escrever fica como estava — vedado ao investidor.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE pagamentos_extras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sem_investidores"        ON pagamentos_extras;
DROP POLICY IF EXISTS "ver_pagamentos_extras"   ON pagamentos_extras;
DROP POLICY IF EXISTS "editar_pagamentos_extras" ON pagamentos_extras;

CREATE POLICY "ver_pagamentos_extras" ON pagamentos_extras FOR SELECT TO authenticated
  USING (public.pode_ver_empresa(empresa));

CREATE POLICY "editar_pagamentos_extras" ON pagamentos_extras FOR ALL TO authenticated
  USING (public.meu_role() <> 'investidor')
  WITH CHECK (public.meu_role() <> 'investidor');

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 3 — AS FATURAS, SE AINDA NÃO FOI CORRIDO
--
-- A migracao-v3 já faz isto às faturas. Se ela ainda não foi corrida nesta
-- base, o investidor também não vê fatura nenhuma — e metade do fluxo dele
-- continua em falta. Isto repõe o mesmo, sem mal nenhum se já lá estiver.
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sem_investidores" ON faturas;
DROP POLICY IF EXISTS "ver_faturas"      ON faturas;

CREATE POLICY "ver_faturas" ON faturas FOR SELECT TO authenticated
  USING (public.pode_ver_empresa(empresa));

-- A de escrita e a de apagar ficam como estão (ver faturas-delete-rls.sql).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'faturas'
                    AND policyname = 'editar_faturas') THEN
    EXECUTE 'CREATE POLICY "editar_faturas" ON faturas FOR ALL TO authenticated
               USING (public.meu_role() <> ''investidor'')
               WITH CHECK (public.meu_role() <> ''investidor'')';
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 4 — O ORÇAMENTO (OPCIONAL, decide tu)
--
-- O separador "Real × Orçado" está à vista do investidor no mesmo ecrã, e a
-- tabela `orcamento` está na mesma lista de vedadas. Para ele, esse separador
-- mostra o real sem o orçado — as colunas de desvio aparecem todas contra
-- zero, o que é pior do que não aparecerem.
--
-- Abrir isto é mostrar-lhe o ORÇAMENTO do projeto, rubrica a rubrica. É uma
-- decisão tua, não minha: por isso vai comentado. Tira os "--" se quiseres.
--
-- DROP POLICY IF EXISTS "sem_investidores"  ON orcamento;
-- DROP POLICY IF EXISTS "ver_orcamento"     ON orcamento;
-- DROP POLICY IF EXISTS "editar_orcamento"  ON orcamento;
-- CREATE POLICY "ver_orcamento" ON orcamento FOR SELECT TO authenticated
--   USING (public.pode_ver_empresa(empresa));
-- CREATE POLICY "editar_orcamento" ON orcamento FOR ALL TO authenticated
--   USING (public.meu_role() <> 'investidor')
--   WITH CHECK (public.meu_role() <> 'investidor');

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 5 — CONFERIR
-- ───────────────────────────────────────────────────────────────────────────
SELECT tablename AS tabela, policyname AS politica, cmd AS comando
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('pagamentos_extras', 'faturas', 'orcamento')
 ORDER BY tablename, cmd, policyname;
-- Em `pagamentos_extras` e em `faturas` tem de aparecer uma linha SELECT.
-- Se `orcamento` continuar só com "sem_investidores", é porque deixaste a
-- parte 4 comentada — e isso é uma escolha, não um esquecimento.
