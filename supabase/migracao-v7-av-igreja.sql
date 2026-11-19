-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Migração v7
--   Duas empresas novas do projeto da Av. da Igreja 68:
--     · Meridiano Radioso (Holding Av Igreja)  — id "meridiano", banco BCP
--     · Spiral Treasure   (SPV Av Igreja)      — id "spiral",    banco BCP
--
-- A Meridiano é a holding; a Spiral Treasure é a SPV que adquire o imóvel.
--
-- Tem de coincidir com src/empresas.js (ambas no grupo LPX). Se correres este
-- SQL sem subir o empresas.js novo, as contas ficam na base de dados mas não
-- aparecem em lado nenhum da aplicação — e ao contrário, se subires o código
-- sem correr isto, as empresas aparecem nos menus mas sem conta bancária para
-- lhes importar o extrato. Faz as duas coisas.
--
-- Correr no SQL Editor do Supabase. Pode ser repetido sem duplicar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1 — ANTES (só lê)
-- ───────────────────────────────────────────────────────────────────────────
SELECT count(*) AS contas_antes, count(DISTINCT empresa_id) AS empresas_antes
  FROM contas;

-- Se alguma destas já existir, o INSERT abaixo só lhe actualiza o nome.
SELECT id, empresa_id, empresa_nome, banco, saldo
  FROM contas
 WHERE empresa_id IN ('meridiano', 'spiral');

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2 — AS CONTAS
--
-- O id da conta segue a convenção do empresas.js: <id da empresa>_<banco em
-- minúsculas>. O saldo entra a zero: a aplicação passa a lê-lo do último
-- movimento importado, por isso não vale a pena pôr aqui um número que fica
-- desactualizado no dia seguinte.
--
-- O IBAN fica vazio de propósito — preenche-o no ecrã das contas quando o
-- tiveres, para não andar um número de conta em texto num ficheiro de SQL.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO contas (id, empresa_id, empresa_nome, banco, iban, saldo) VALUES
  ('meridiano_bcp', 'meridiano', 'Meridiano Radioso (Holding Av Igreja)', 'BCP', '', 0),
  ('spiral_bcp',    'spiral',    'Spiral Treasure (SPV Av Igreja)',      'BCP', '', 0)
ON CONFLICT (id) DO UPDATE SET
  empresa_nome = EXCLUDED.empresa_nome,
  banco        = EXCLUDED.banco,
  updated_at   = now();

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 3 — CONFERIR
-- ───────────────────────────────────────────────────────────────────────────
SELECT id, empresa_id, empresa_nome, banco, saldo
  FROM contas
 WHERE empresa_id IN ('meridiano', 'spiral')
 ORDER BY empresa_id;
-- Têm de aparecer duas linhas.

SELECT count(*) AS contas_depois, count(DISTINCT empresa_id) AS empresas_depois
  FROM contas;
-- Duas contas e duas empresas a mais do que na Parte 1.

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTAS
--
-- 1. O GRUPO (LPX ou HDG) vive só no código, em src/empresas.js. Para passar
--    qualquer uma delas para o HDG, altera lá o campo `grupo` — não é preciso
--    mexer na base de dados.
--
-- 2. ACESSO DOS UTILIZADORES. O RLS do ERP dá acesso por empresa: cada perfil
--    tem a lista das empresas que pode ver, na coluna `empresas` da tabela
--    `profiles`. Uma empresa nova não entra sozinha na lista de ninguém — nem
--    sequer na tua. Quem tem role 'admin' vê tudo; os restantes não vêem estas
--    duas até serem acrescentadas.
--
--    Para ver quem precisa:
--        SELECT email, role, empresas FROM profiles ORDER BY role, email;
--
--    Para dar acesso a alguém (troca o email), sem lhe tirar o que já tinha:
--        UPDATE profiles
--           SET empresas = (SELECT array_agg(DISTINCT e)
--                             FROM unnest(empresas || ARRAY['meridiano','spiral']) AS e)
--         WHERE email = 'quem@exemplo.pt';
--
--    Deixo isto por correr de propósito: dar acesso a um projeto é uma decisão
--    tua, e sobretudo neste, em que há sócios de fora (EMPRESAR, Alvorada
--    Resiliente, Manga).
--
-- 3. UM SEGUNDO BANCO. Se alguma delas abrir outra conta, acrescenta o banco
--    em src/empresas.js e corre o INSERT com o id novo — por exemplo
--    ('spiral_revolut', 'spiral', '…', 'Revolut', '', 0).
-- ═══════════════════════════════════════════════════════════════════════════
