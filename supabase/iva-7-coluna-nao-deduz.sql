-- ----------------------------------------------------------
-- LPX PRIVATE - ERP - Apuramento de IVA (migracao v15)
-- FICHEIRO 7 DE 8 - marcar faturas que NAO deduzem IVA
--
-- Corre este inteiro e passa ao 8. Pode ser corrido duas
-- vezes sem fazer mal.
-- ----------------------------------------------------------

-- Nem tudo o que se paga da direito a deduzir IVA: impostos e
-- taxas da AT, seguros, portagens, multas, capital de
-- emprestimos. Ate aqui essas faturas entravam no apuramento
-- como se deduzissem, porque nao havia maneira de dizer o
-- contrario.
--
-- true (por defeito) = conta para o apuramento, como ate aqui.
-- false              = fica na fatura e no Contas a Pagar, mas
--                      entra no apuramento com IVA zero.
--
-- Do lado dos recebiveis a mesma coluna quer dizer "esta
-- fatura liquida IVA": uma fatura isenta marca-se com false.
ALTER TABLE faturas
  ADD COLUMN IF NOT EXISTS iva_dedutivel boolean NOT NULL DEFAULT true;

ALTER TABLE recebiveis
  ADD COLUMN IF NOT EXISTS iva_dedutivel boolean NOT NULL DEFAULT true;

-- Conferencia: deve dar o total de faturas, todas a true.
SELECT count(*) FILTER (WHERE iva_dedutivel)     AS deduzem,
       count(*) FILTER (WHERE NOT iva_dedutivel) AS nao_deduzem
  FROM faturas;
