-- ═══════════════════════════════════════════════════════════════════════════
-- LPX PRIVATE — ERP · Migração v4
--   Faturas a pagar (Contas a Pagar)
--   Origem: Faturas_ERP_-_LPX.xlsm, folha "Controle de Faturas (a pagar)"
--
--   58 faturas · 170.160,37 € no total
--   Correr no SQL Editor do Supabase. Pode ser repetido sem duplicar.
-- ═══════════════════════════════════════════════════════════════════════════

-- Categoria usada pela folha que ainda não existia na lista do ERP
-- (a lista de categorias vive em src/categorias.js — já foi lá acrescentada)

BEGIN;

-- Remove apenas as faturas desta importação (id começa por 'lpx_')
DELETE FROM faturas WHERE id LIKE 'lpx\_%';


-- ─── Aura Properties (31 faturas · 10.485,45 €) ───
INSERT INTO faturas (id, empresa, projeto, fatura, fornecedor, categoria, valor, vencimento, status, obs) VALUES
  ('lpx_pearl_0006','pearl','Aura Properties','102','Vertical Media','Marketing',553.5,'2026-05-31','Paga','Video com IA e fotografias - Apartamento Arroios · IBAN PT50001800036704891802057'),
  ('lpx_pearl_0007','pearl','Aura Properties','122','Vertical Media','Marketing',738.0,'2026-05-31','Paga','Video com IA - Penthouse SP · IBAN PT50001800036704891802057'),
  ('lpx_pearl_0008','pearl','Aura Properties','0061171','Idealista','Marketing',197.17,'2026-07-22','Pendente','Mensalidade Idealista Julho · IBAN PT50 0035 0001 00036968 230 80'),
  ('lpx_pearl_0009','pearl','Aura Properties','0061170','Idealista','Marketing',60.27,'2026-07-22','Pendente','Market Navigator serviço de julho · IBAN PT50 0035 0001 00036968 230 80'),
  ('lpx_pearl_0010','pearl','Aura Properties','A faturar por 3','NOS','CSC',67.33,'2026-08-12','Paga','Pack internet'),
  ('lpx_pearl_0011','pearl','Aura Properties','A faturar por 3','Rodrigo','CSC',48.9,'2026-08-12','Paga','Reembolso produtos de limpeza'),
  ('lpx_pearl_0012','pearl','Aura Properties','A faturar por 3','Rodrigo','Marketing',344.4,'2026-08-12','Paga','Placas office'),
  ('lpx_pearl_0013','pearl','Aura Properties','','Rodrigo','CSC',116.48,'2026-08-12','Paga','Renovação domínio'),
  ('lpx_pearl_0014','pearl','Aura Properties','','Rodrigo','Marketing',52.28,'2026-08-12','Paga','Placa imobiliaria'),
  ('lpx_pearl_0015','pearl','Aura Properties','','Rodrigo','CSC',15.0,'2026-08-12','Paga','Pagamento Telemovel Joao'),
  ('lpx_pearl_0016','pearl','Aura Properties','','Rodrigo','Marketing',367.77,'2026-08-12','Paga','TRF Idealista Socieda'),
  ('lpx_pearl_0017','pearl','Aura Properties','A faturar por 3','Rodrigo','CSC',38.18,'2026-08-12','Paga','NOS COMUNICACOES SA'),
  ('lpx_pearl_0018','pearl','Aura Properties','A faturar por 3','Rodrigo','CSC',100.0,'2026-08-12','Paga','Limpeza Rosa'),
  ('lpx_pearl_0019','pearl','Aura Properties','','Rodrigo','CSC',130.86,'2026-08-12','Paga','MBWAY IFTHENPAY'),
  ('lpx_pearl_0027','pearl','Aura Properties','','David Moreira','CSC',119.4,'2026-08-12','Pendente','Produção chaves office'),
  ('lpx_pearl_0028','pearl','Aura Properties','','David Moreira','CSC',68.93,'2026-08-12','Pendente','Produtos office - cabos, extens~oes e equipamentos'),
  ('lpx_pearl_0030','pearl','Aura Properties','','LPX','Marketing',196.31,'2026-08-12','Paga','Google ads'),
  ('lpx_pearl_0031','pearl','Aura Properties','','LPX','Comissões',290.0,'2026-08-12','Paga','Adto Joao'),
  ('lpx_pearl_0032','pearl','Aura Properties','','LPX','Impostos e taxas',280.0,'2026-08-12','Paga','IRC'),
  ('lpx_pearl_0033','pearl','Aura Properties','','LPX','CSC',4390.07,'2026-08-12','Paga','Office e mobília'),
  ('lpx_pearl_0034','pearl','Aura Properties','','Aura Temperamental','Comissões',1476.0,'2026-08-12','Paga','Adto Joao 1200 + Iva'),
  ('lpx_pearl_0036','pearl','Aura Properties','G174122894','David Moreira','CSC',27.3,'2026-08-12','Pendente','Licenças office'),
  ('lpx_pearl_0037','pearl','Aura Properties','G174496617','David Moreira','CSC',12.74,'2026-08-12','Pendente','Licenças office'),
  ('lpx_pearl_0039','pearl','Aura Properties','','David Moreira','CSC',138.0,'2026-08-12','Pendente','Limpeza Julho'),
  ('lpx_pearl_0040','pearl','Aura Properties','','Rodrigo','CSC',15.0,'2026-08-30','Pendente','Pagamento Telemovel Joao 12/8'),
  ('lpx_pearl_0041','pearl','Aura Properties','G175541901','David Moreira','CSC',21.38,'2026-08-12','Pendente','Licenças office'),
  ('lpx_pearl_0042','pearl','Aura Properties','G175620175','David Moreira','CSC',10.27,'2026-08-12','Pendente','Licenças office'),
  ('lpx_pearl_0043','pearl','Aura Properties','G167692418','David Moreira','CSC',27.3,'2026-08-12','Pendente','Licenças office'),
  ('lpx_pearl_0044','pearl','Aura Properties','0061170','Idealista','Marketing',440.83,'2026-08-12','Pendente','Empreendimento Cinq Etoiles'),
  ('lpx_pearl_0052','pearl','Aura Properties','','AT','Impostos e taxas',80.0,'2026-08-20','Pendente','IES 2025'),
  ('lpx_pearl_0057','pearl','Aura Properties','A faturar por 3','NOS','CSC',61.78,'2026-09-12','Pendente','Pack internet - Débito direto')
ON CONFLICT (id) DO UPDATE SET
  empresa=EXCLUDED.empresa, projeto=EXCLUDED.projeto, fatura=EXCLUDED.fatura,
  fornecedor=EXCLUDED.fornecedor, categoria=EXCLUDED.categoria, valor=EXCLUDED.valor,
  vencimento=EXCLUDED.vencimento, status=EXCLUDED.status, obs=EXCLUDED.obs,
  updated_at=now();

-- ─── Blessed (1 faturas · 80,00 €) ───
INSERT INTO faturas (id, empresa, projeto, fatura, fornecedor, categoria, valor, vencimento, status, obs) VALUES
  ('lpx_blessed_0051','blessed','Developer 7M','','AT','Impostos e taxas',80.0,'2026-08-20','Pendente','IES 2025')
ON CONFLICT (id) DO UPDATE SET
  empresa=EXCLUDED.empresa, projeto=EXCLUDED.projeto, fatura=EXCLUDED.fatura,
  fornecedor=EXCLUDED.fornecedor, categoria=EXCLUDED.categoria, valor=EXCLUDED.valor,
  vencimento=EXCLUDED.vencimento, status=EXCLUDED.status, obs=EXCLUDED.obs,
  updated_at=now();

-- ─── Bombastic (1 faturas · 80,00 €) ───
INSERT INTO faturas (id, empresa, projeto, fatura, fornecedor, categoria, valor, vencimento, status, obs) VALUES
  ('lpx_na_0050','','','','AT','Impostos e taxas',80.0,'2026-08-20','Pendente','IES 2025')
ON CONFLICT (id) DO UPDATE SET
  empresa=EXCLUDED.empresa, projeto=EXCLUDED.projeto, fatura=EXCLUDED.fatura,
  fornecedor=EXCLUDED.fornecedor, categoria=EXCLUDED.categoria, valor=EXCLUDED.valor,
  vencimento=EXCLUDED.vencimento, status=EXCLUDED.status, obs=EXCLUDED.obs,
  updated_at=now();

-- ─── Enchanted (1 faturas · 80,00 €) ───
INSERT INTO faturas (id, empresa, projeto, fatura, fornecedor, categoria, valor, vencimento, status, obs) VALUES
  ('lpx_enchanted_0048','enchanted','Developer A07','','AT','Impostos e taxas',80.0,'2026-08-20','Pendente','IES 2025')
ON CONFLICT (id) DO UPDATE SET
  empresa=EXCLUDED.empresa, projeto=EXCLUDED.projeto, fatura=EXCLUDED.fatura,
  fornecedor=EXCLUDED.fornecedor, categoria=EXCLUDED.categoria, valor=EXCLUDED.valor,
  vencimento=EXCLUDED.vencimento, status=EXCLUDED.status, obs=EXCLUDED.obs,
  updated_at=now();

-- ─── Favorite Closet (5 faturas · 81.915,78 €) ───
INSERT INTO faturas (id, empresa, projeto, fatura, fornecedor, categoria, valor, vencimento, status, obs) VALUES
  ('lpx_favcloset_0004','favcloset','Amadeu 07','','AT','Impostos e taxas',333.44,'2026-08-30','Paga','2 prestação - IMI'),
  ('lpx_favcloset_0005','favcloset','Amadeu 07','297','White Helmet','Projetos',430.5,'2026-08-30','Paga','CSO 20/6 a 20/7'),
  ('lpx_favcloset_0020','favcloset','Amadeu 07','','Rodrigo','Impostos e taxas',188.16,'2026-08-12','Pendente','Renovação licença obra amadeus'),
  ('lpx_favcloset_0049','favcloset','Amadeu 07','','AT','Impostos e taxas',80.0,'2026-08-20','Pendente','IES 2025'),
  ('lpx_favcloset_0056','favcloset','Amadeu 07','195','COSMIK BRIGADE','Obra',80883.68,'2026-08-30','Pendente','Auto n20')
ON CONFLICT (id) DO UPDATE SET
  empresa=EXCLUDED.empresa, projeto=EXCLUDED.projeto, fatura=EXCLUDED.fatura,
  fornecedor=EXCLUDED.fornecedor, categoria=EXCLUDED.categoria, valor=EXCLUDED.valor,
  vencimento=EXCLUDED.vencimento, status=EXCLUDED.status, obs=EXCLUDED.obs,
  updated_at=now();

-- ─── Fluffy (1 faturas · 80,00 €) ───
INSERT INTO faturas (id, empresa, projeto, fatura, fornecedor, categoria, valor, vencimento, status, obs) VALUES
  ('lpx_fluffy_0047','fluffy','Tax SPV','','AT','Impostos e taxas',80.0,'2026-08-20','Pendente','IES 2025')
ON CONFLICT (id) DO UPDATE SET
  empresa=EXCLUDED.empresa, projeto=EXCLUDED.projeto, fatura=EXCLUDED.fatura,
  fornecedor=EXCLUDED.fornecedor, categoria=EXCLUDED.categoria, valor=EXCLUDED.valor,
  vencimento=EXCLUDED.vencimento, status=EXCLUDED.status, obs=EXCLUDED.obs,
  updated_at=now();

-- ─── Género Prudente (7 faturas · 15.127,58 €) ───
INSERT INTO faturas (id, empresa, projeto, fatura, fornecedor, categoria, valor, vencimento, status, obs) VALUES
  ('lpx_genero_0021','genero','Maria Pia','','Rodrigo','Administrativos',185.0,'2026-08-12','Pendente','renuncia gerencia'),
  ('lpx_genero_0022','genero','Maria Pia','','Rodrigo','Administrativos',531.88,'2026-08-12','Pendente','designacao, alteracao de sede ealteraçao estatutos'),
  ('lpx_genero_0024','genero','Maria Pia','','Rodrigo','Administrativos',85.0,'2026-08-12','Pendente','cessão de quota'),
  ('lpx_genero_0025','genero','Maria Pia','','Rodrigo','Administrativos',85.0,'2026-08-12','Pendente','cessão de quota'),
  ('lpx_genero_0026','genero','Maria Pia','','Rodrigo','Administrativos',170.0,'2026-08-12','Pendente','cessão de quota'),
  ('lpx_genero_0035','genero','Maria Pia','15','Alberto Vinagre','Projetos',13776.0,'2026-08-12','Pendente','20% Proj Arq (Adjudicação) + 20% Proj Arq (Entrega Estudo prévio) · IBAN PT50 0036 0077 99100076304 46'),
  ('lpx_genero_0036','genero','Maria Pia','','AT','Impostos e taxas',294.7,'2026-08-30','Pendente','Retenção notária - escritura · IBAN 156180688254110')
ON CONFLICT (id) DO UPDATE SET
  empresa=EXCLUDED.empresa, projeto=EXCLUDED.projeto, fatura=EXCLUDED.fatura,
  fornecedor=EXCLUDED.fornecedor, categoria=EXCLUDED.categoria, valor=EXCLUDED.valor,
  vencimento=EXCLUDED.vencimento, status=EXCLUDED.status, obs=EXCLUDED.obs,
  updated_at=now();

-- ─── LPX Private (2 faturas · 2.951,04 €) ───
INSERT INTO faturas (id, empresa, projeto, fatura, fornecedor, categoria, valor, vencimento, status, obs) VALUES
  ('lpx_lpx_0035','lpx','Holding','A faturar por 3','Rodrigo','CSC',51.04,'2026-08-12','Pendente','Eletricidade Office'),
  ('lpx_lpx_0038','lpx','Holding','A faturar por 3','Jardim das Amoreiras','CSC',2900.0,'2026-08-12','Paga','Renda office')
ON CONFLICT (id) DO UPDATE SET
  empresa=EXCLUDED.empresa, projeto=EXCLUDED.projeto, fatura=EXCLUDED.fatura,
  fornecedor=EXCLUDED.fornecedor, categoria=EXCLUDED.categoria, valor=EXCLUDED.valor,
  vencimento=EXCLUDED.vencimento, status=EXCLUDED.status, obs=EXCLUDED.obs,
  updated_at=now();

-- ─── Simplify Rubric (7 faturas · 59.255,52 €) ───
INSERT INTO faturas (id, empresa, projeto, fatura, fornecedor, categoria, valor, vencimento, status, obs) VALUES
  ('lpx_simplify_0001','simplify','Alto dos 7 Moinhos','73','Complai','Obra',18000.0,'2026-08-20','Paga','Auto n3'),
  ('lpx_simplify_0002','simplify','Alto dos 7 Moinhos','74','Complai','Obra',11706.98,'2026-08-20','Paga','Auto n3'),
  ('lpx_simplify_0003','simplify','Alto dos 7 Moinhos','','AT','Impostos e taxas',1108.93,'2026-08-30','Paga','2 prestação - IMI'),
  ('lpx_simplify_0029','simplify','Alto dos 7 Moinhos','11','Joaquim Faria','Projetos',500.0,'2026-08-12','Paga','Acompanhamento técnico de execução dos trabalhos de construção'),
  ('lpx_simplify_0053','simplify','Alto dos 7 Moinhos','910000488782','E-Redes','Administrativos',623.95,'2026-08-20','Pendente','Pedido de ligação elétrica'),
  ('lpx_simplify_0054','simplify','Alto dos 7 Moinhos','85','Complai','Obra',18000.0,'2026-08-20','Pendente','Auto n4'),
  ('lpx_simplify_0055','simplify','Alto dos 7 Moinhos','86','Complai','Obra',9315.66,'2026-08-20','Pendente','Auto n4')
ON CONFLICT (id) DO UPDATE SET
  empresa=EXCLUDED.empresa, projeto=EXCLUDED.projeto, fatura=EXCLUDED.fatura,
  fornecedor=EXCLUDED.fornecedor, categoria=EXCLUDED.categoria, valor=EXCLUDED.valor,
  vencimento=EXCLUDED.vencimento, status=EXCLUDED.status, obs=EXCLUDED.obs,
  updated_at=now();

-- ─── Turbulent Orange (1 faturas · 25,00 €) ───
INSERT INTO faturas (id, empresa, projeto, fatura, fornecedor, categoria, valor, vencimento, status, obs) VALUES
  ('lpx_na_0023','','','','Rodrigo','Impostos e taxas',25.0,'2026-08-12','Pendente','Renovaçao CP Turbulent')
ON CONFLICT (id) DO UPDATE SET
  empresa=EXCLUDED.empresa, projeto=EXCLUDED.projeto, fatura=EXCLUDED.fatura,
  fornecedor=EXCLUDED.fornecedor, categoria=EXCLUDED.categoria, valor=EXCLUDED.valor,
  vencimento=EXCLUDED.vencimento, status=EXCLUDED.status, obs=EXCLUDED.obs,
  updated_at=now();

-- ─── Vanilla (1 faturas · 80,00 €) ───
INSERT INTO faturas (id, empresa, projeto, fatura, fornecedor, categoria, valor, vencimento, status, obs) VALUES
  ('lpx_na_0046','','','','AT','Impostos e taxas',80.0,'2026-08-20','Pendente','IES 2025')
ON CONFLICT (id) DO UPDATE SET
  empresa=EXCLUDED.empresa, projeto=EXCLUDED.projeto, fatura=EXCLUDED.fatura,
  fornecedor=EXCLUDED.fornecedor, categoria=EXCLUDED.categoria, valor=EXCLUDED.valor,
  vencimento=EXCLUDED.vencimento, status=EXCLUDED.status, obs=EXCLUDED.obs,
  updated_at=now();

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════════════════════
SELECT COALESCE(NULLIF(empresa,''),'(por atribuir)') AS empresa,
       count(*) AS faturas,
       sum(valor) AS total,
       sum(valor) FILTER (WHERE status = 'Pendente') AS por_pagar,
       sum(valor) FILTER (WHERE status = 'Paga')     AS pago
  FROM faturas WHERE id LIKE 'lpx\_%'
 GROUP BY 1 ORDER BY 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- POR ATRIBUIR: três faturas cujo projeto não corresponde a nenhuma empresa
-- do ERP (Turbulent Orange, Vanilla, Bombastic). Ficaram sem empresa e são
-- visíveis para admin/gestor. Para as atribuir, por exemplo à Holding:
--
--   UPDATE faturas SET empresa='lpx', projeto='Holding'
--    WHERE id IN ('lpx_na_0023','lpx_na_0046','lpx_na_0050');
-- ═══════════════════════════════════════════════════════════════════════════