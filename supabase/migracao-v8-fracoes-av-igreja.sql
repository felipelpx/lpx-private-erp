-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Migração v8
--   As 19 frações da Av. da Igreja 68 na Spiral Treasure
--
-- Origem: Av_Igreja_17.11.xlsx, folhas "Rent Roll Atual" e "Sales table"
-- (ficheiro de 17/11/2026). Este SQL foi GERADO a partir dessas folhas, não
-- escrito à mão — são 19 frações com dez campos cada, e uma transcrição
-- manual erra sem dar sinal.
--
-- O que entra:
--   · a identificação, tipologia, piso e área de cada fração
--   · o preço de aquisição imputado (CPCV) e o preço de venda de tabela
--   · a renda mensal atual e o estado de desocupação
--
-- Confere com a folha:
--   aquisição    7,000,000.00 EUR   (= total da folha)
--   venda       13,271,200.00 EUR   (= total da folha)
--   renda/mês       16,821.80 EUR   (= total da folha)
--   área             2,485.00 m2    (a folha diz 2.277 — ver nota)
--
-- NOTA SOBRE A ÁREA. A célula de total da folha diz 2.277 m2, mas a soma das
-- frações uma a uma dá 2,485. A diferença são 208 m2, e a causa é a fórmula
-- do total: `=+SUM(E5:E21)+E3`, que salta a linha do B (89 m2) e a do T
-- (119 m2) — 89 + 119 = 208. As linhas de preço e de renda usam o intervalo
-- inteiro (D3:D22, G3:G22) e por isso batem certo; só a da área é que não.
-- A folha "Sales table" também soma 2,485 m2, o que confirma o valor.
--
-- Carrega-se o valor de cada fração, que está certo. Mas atenção ao modelo:
-- a célula do custo por m2 divide os 7 M EUR por 2.277, dando 3.074 EUR/m2
-- quando o real é 2,817 EUR/m2 — 9% a mais.
--   estados    15x Carta enviada, 2x Direito de preferência exercido, 1x Por comunicar, 1x Vazio
--
-- Correr no SQL Editor do Supabase. Pode ser repetido sem duplicar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1 — COLUNAS NOVAS NA TABELA DAS FRAÇÕES
--
-- A `fracoes` foi feita para venda nova: tem preço de tabela e estado
-- comercial, não tem nada sobre arrendamento. Este prédio compra-se COM
-- inquilinos e o negócio é esvaziá-lo, por isso a renda e o estado de
-- desocupação são informação de primeira linha, não uma nota de rodapé.
--
-- São colunas opcionais: os outros projetos ficam com elas a NULL e nada
-- muda para eles.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE fracoes ADD COLUMN IF NOT EXISTS preco_aquisicao numeric DEFAULT 0;
ALTER TABLE fracoes ADD COLUMN IF NOT EXISTS renda_mensal    numeric DEFAULT 0;
ALTER TABLE fracoes ADD COLUMN IF NOT EXISTS area_dep        numeric DEFAULT 0;
ALTER TABLE fracoes ADD COLUMN IF NOT EXISTS ocupacao        text    DEFAULT '';
-- A data em que a carta de oposição à renovação saiu. Coluna própria e não
-- colada ao texto do estado: assim ordena-se e compara-se com a data de hoje.
ALTER TABLE fracoes ADD COLUMN IF NOT EXISTS data_carta      date;
ALTER TABLE fracoes ADD COLUMN IF NOT EXISTS data_termo      date;
ALTER TABLE fracoes ADD COLUMN IF NOT EXISTS tipo_contrato   text    DEFAULT '';

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2 — ANTES (só lê)
-- ───────────────────────────────────────────────────────────────────────────
SELECT projeto, count(*) AS fracoes FROM fracoes GROUP BY projeto ORDER BY projeto;

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 3 — AS FRAÇÕES
--
-- O `status` é o estado COMERCIAL (Disponível / Reservada / CPCV /
-- Escriturada) e entra tudo a "Disponível": à data da folha não há nenhuma
-- vendida. O estado do INQUILINO vai na coluna `ocupacao`, que é outro eixo
-- — uma fração pode estar ocupada e disponível para venda ao mesmo tempo.
--
-- ATENÇÃO às frações G e H: os inquilinos exerceram o direito de preferência,
-- ou seja vão comprá-las. Ficam na mesma como "Disponível" porque ainda não
-- há CPCV; quando houver, passa-as a "CPCV" no ecrã Comercial.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO fracoes (
  id, projeto, fracao, tipologia, area, area_dep, preco_tabela,
  preco_aquisicao, renda_mensal, ocupacao, data_carta, data_termo, piso, tipo_contrato
) VALUES
  ('spiral-a', 'SPV Av Igreja', 'A - Restaurante', 'Restaurante', 292.0, 0.0, 1168000.0, 822535.21, 1424.32, 'Carta enviada', '2026-10-26', '2027-03-31', 'Loja', ''),
  ('spiral-b', 'SPV Av Igreja', 'B - R/C Direito', 'Apart. T2', 89.0, 2.0, 516200.0, 250704.23, 575.25, 'Carta enviada', '2026-10-26', '2027-03-31', 'R/C', ''),
  ('spiral-c', 'SPV Av Igreja', 'C - r/c. Esquerdo', 'Studio', 32.0, 0.0, 204800.0, 90140.86, 281.22, 'Carta enviada', '2026-10-26', '2027-03-01', 'R/C', '120 dias antes, Art 1097 CC'),
  ('spiral-d', 'SPV Av Igreja', 'D - Galeria/restaurante', 'Apart. T2', 89.0, 0.0, 516200.0, 250704.23, 470.07, 'Carta enviada', '2026-10-26', '2027-03-31', 'R/C', '120 dias antes, Art 1097 CC'),
  ('spiral-e', 'SPV Av Igreja', 'E - 1º Direito', 'Apart.T4', 158.0, 9.0, 821600.0, 445070.42, 1385.62, 'Carta enviada', '2026-10-26', '2028-12-31', '1', '120 dias antes, Art 1097 CC'),
  ('spiral-f', 'SPV Av Igreja', 'F - 1º Esquerdo', 'Apart. T3', 130.0, 10.0, 734500.0, 366197.18, 1560.09, 'Por comunicar', NULL, '2027-08-31', '1', '120 dias antes, Art 1097 CC'),
  ('spiral-g', 'SPV Av Igreja', 'G - 2º Direito', 'Apart. T4', 158.0, 6.0, 821600.0, 445070.42, 0.0, 'Direito de preferência exercido', NULL, NULL, '2', ''),
  ('spiral-h', 'SPV Av Igreja', 'H - 2º Esquerdo', 'Apart. T3', 130.0, 10.0, 734500.0, 366197.18, 0.0, 'Direito de preferência exercido', NULL, NULL, '2', ''),
  ('spiral-i', 'SPV Av Igreja', 'I - 3º Direito', 'Apart. T4', 158.0, 6.0, 821600.0, 445070.42, 655.5, 'Carta enviada', '2026-10-26', '2029-05-31', '3', 'NRAU inicio 01/06/2009, renova auto. Caso não seja denunciado'),
  ('spiral-j', 'SPV Av Igreja', 'J - 3º Esquerdo', 'Apart. T3', 130.0, 10.0, 734500.0, 366197.18, 0.0, 'Vazio', NULL, '2027-01-01', '3', ''),
  ('spiral-l', 'SPV Av Igreja', 'L - 4º Direito', 'Apart. T4', 158.0, 6.0, 821600.0, 445070.42, 806.52, 'Carta enviada', '2026-10-26', '2027-02-01', '4', 'NRAU inicio 01/06/2005, renova auto. Caso não seja denunciado
Regime de Renda Livre'),
  ('spiral-m', 'SPV Av Igreja', 'M - 4º Esquerdo', 'Apart. T3', 130.0, 10.0, 734500.0, 366197.18, 977.94, 'Carta enviada', '2026-10-26', '2028-02-29', '4', 'NRAU lei 6/2006 inicio 01/03/2008, renova auto. Caso não seja denunciado
Regime de Renda Livre'),
  ('spiral-n', 'SPV Av Igreja', 'N - 5º Direito', 'Apart. T3', 158.0, 29.0, 892700.0, 445070.42, 720.0, 'Carta enviada', '2026-10-26', '2030-05-31', '5', 'NRAU lei 6/2006 inicio 01/03/2010, renova auto. Caso não seja denunciado
Regime de Renda Livre'),
  ('spiral-o', 'SPV Av Igreja', 'O - 5º Esquerdo', 'Apart. T3', 130.0, 20.0, 734500.0, 366197.18, 1838.88, 'Carta enviada', '2026-10-26', '2027-02-01', '5', '120 dias antes, Art 1097 CC'),
  ('spiral-p', 'SPV Av Igreja', 'P - 6º Direito', 'Apart. T3', 106.0, 6.0, 598900.0, 298591.55, 599.0, 'Carta enviada', '2026-10-26', '2029-02-03', '6', 'NRAU lei 6/2006 inicio 01/02/1998, renova auto. Caso não seja denunciado
Regime de Renda Livre'),
  ('spiral-q', 'SPV Av Igreja', 'Q - 6º Esquerdo', 'Apart. T3', 106.0, 14.0, 598900.0, 298591.55, 1430.24, 'Carta enviada', '2026-10-26', '2027-08-01', '6', '120 dias antes, Art 1097 CC'),
  ('spiral-r', 'SPV Av Igreja', 'R - 7º Direito', 'Apart. T3', 106.0, 6.0, 598900.0, 298591.55, 764.75, 'Carta enviada', '2026-10-26', '2030-05-31', '7', 'Regime de renda livre 25/05/2005'),
  ('spiral-s', 'SPV Av Igreja', 'S - 7º Esquerdo', 'Apart. T3', 106.0, 14.0, 598900.0, 298591.55, 1532.4, 'Carta enviada', '2026-10-26', '2027-08-01', '7', '120 dias antes, Art 1097 CC'),
  ('spiral-t', 'SPV Av Igreja', 'T - 8º Andar', 'Apart. T4', 119.0, 14.0, 618800.0, 335211.27, 1800.0, 'Carta enviada', '2026-10-26', '2028-03-01', '8', '120 dias antes, Art 1097 CC')
ON CONFLICT (id) DO UPDATE SET
  projeto         = EXCLUDED.projeto,
  fracao          = EXCLUDED.fracao,
  tipologia       = EXCLUDED.tipologia,
  area            = EXCLUDED.area,
  area_dep        = EXCLUDED.area_dep,
  preco_tabela    = EXCLUDED.preco_tabela,
  preco_aquisicao = EXCLUDED.preco_aquisicao,
  renda_mensal    = EXCLUDED.renda_mensal,
  ocupacao        = EXCLUDED.ocupacao,
  data_carta      = EXCLUDED.data_carta,
  data_termo      = EXCLUDED.data_termo,
  piso            = EXCLUDED.piso,
  tipo_contrato   = EXCLUDED.tipo_contrato,
  updated_at      = now();

-- As que já lá estavam com "Disponível" por omissão mantêm-se; só se mexe
-- no estado comercial pelo ecrã, nunca por aqui.
UPDATE fracoes SET status = 'Disponível'
 WHERE projeto = 'SPV Av Igreja' AND (status IS NULL OR status = '');

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 4 — CONFERIR CONTRA A FOLHA
-- ───────────────────────────────────────────────────────────────────────────
SELECT count(*)                       AS fracoes,
       round(sum(preco_aquisicao), 2) AS aquisicao,
       round(sum(preco_tabela), 2)    AS venda,
       round(sum(area), 2)            AS area_m2,
       round(sum(renda_mensal), 2)    AS renda_mes
  FROM fracoes WHERE projeto = 'SPV Av Igreja';
-- Tem de dar: 19 | 7000000.00 | 13271200.00 | 2485.00 | 16821.80

SELECT ocupacao, max(data_carta) AS carta, count(*) AS n,
       round(sum(renda_mensal), 2) AS renda
  FROM fracoes WHERE projeto = 'SPV Av Igreja'
 GROUP BY ocupacao ORDER BY n DESC;
