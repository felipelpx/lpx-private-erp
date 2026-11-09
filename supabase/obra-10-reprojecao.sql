-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · O mês a partir do qual se reprograma a obra
--
-- O plano de obra reparte o saldo residual pelos meses que faltam, a contar
-- do mês corrente. Mas o mês corrente nem sempre está por fazer: quando o
-- auto de novembro já chegou — ou já foi pago —, reprogramar a partir de
-- novembro põe uma previsão do motor por cima de uma obra que já tem
-- documento, e o mês fica com dois pagamentos.
--
-- Quem reprograma é que sabe se o auto deste mês já saiu, por isso passam a
-- haver campos para o dizer: reprogramar a partir deste mês, ou do seguinte.
--
-- São DOIS, porque o auto da obra e a avença do mesmo mês não chegam ao mesmo
-- tempo: pode já haver fatura do empreiteiro e ainda não haver taxa de gestão,
-- ou ao contrário.
--
--   mes_reprojecao          → obra, IVA da obra e o funding dos dois
--   mes_reprojecao_avencas  → fiscalização, CSO, outras avenças e o funding
--
-- Sem esta coluna a app continua a funcionar — a escrita do plano ignora os
-- campos que a base não conhece —, mas a escolha não fica gravada e volta ao
-- mês corrente da próxima vez que se abrir o plano.
--
-- Correr no SQL Editor do Supabase. É idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 0. O que já lá está (só lê)
-- ───────────────────────────────────────────────────────────────────────────
SELECT column_name AS coluna, data_type AS tipo, column_default AS por_omissao
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'obra_planos'
 ORDER BY ordinal_position;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A coluna
--    Fica em texto "AAAA-MM", e não em data, porque é mesmo um mês: o dia
--    não quer dizer nada aqui e guardá-lo convidava a comparações erradas.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE obra_planos
  ADD COLUMN IF NOT EXISTS mes_reprojecao text DEFAULT '';
ALTER TABLE obra_planos
  ADD COLUMN IF NOT EXISTS mes_reprojecao_avencas text DEFAULT '';

COMMENT ON COLUMN obra_planos.mes_reprojecao IS
  'Mês "AAAA-MM" a partir do qual se reparte o saldo residual da OBRA (e do '
  'IVA da obra e do funding dos dois). Vazio = a partir do mês corrente. '
  'Serve para o mês que já tem auto do empreiteiro não levar também uma '
  'previsão do motor.';
COMMENT ON COLUMN obra_planos.mes_reprojecao_avencas IS
  'O mesmo, para as AVENÇAS mensais: fiscalização, CSO, as outras avenças e '
  'o funding delas. Separado da obra porque as faturas não chegam ao mesmo '
  'tempo.';

-- O formato tem de ser mesmo "AAAA-MM": o motor ignora o que não bata certo,
-- mas é melhor a base recusar já do que ficar um valor morto lá dentro.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'obra_planos_mes_reprojecao_formato') THEN
    ALTER TABLE obra_planos
      ADD CONSTRAINT obra_planos_mes_reprojecao_formato
      CHECK (mes_reprojecao IS NULL OR mes_reprojecao = ''
             OR mes_reprojecao ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'obra_planos_mes_reprojecao_avencas_formato') THEN
    ALTER TABLE obra_planos
      ADD CONSTRAINT obra_planos_mes_reprojecao_avencas_formato
      CHECK (mes_reprojecao_avencas IS NULL OR mes_reprojecao_avencas = ''
             OR mes_reprojecao_avencas ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Conferir
-- ───────────────────────────────────────────────────────────────────────────
SELECT empresa, data_inicio, data_fim,
       COALESCE(NULLIF(mes_reprojecao, ''),         '(mês corrente)') AS obra_a_partir_de,
       COALESCE(NULLIF(mes_reprojecao_avencas, ''), '(mês corrente)') AS avencas_a_partir_de
  FROM obra_planos
 ORDER BY empresa;
