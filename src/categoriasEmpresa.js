// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIAS POR EMPRESA
//
// Cada projeto tem o seu plano de contas. Vem do Categorias.xlsx que o Felipe
// mantém, e é o mesmo que está nos Fluxos Operacionais — por isso o que se
// escolhe aqui é exatamente o que aparece nas planilhas.
//
// Dois formatos, consoante o grupo:
//   LPX  — uma lista de categorias, sem subcategoria
//   HDG  — Categoria > Subcategoria (Admirable Sequence e Infinite Change)
//
// Gerado a partir de Categorias.xlsx e dos extratos dos FO (13/10/2026).
// Para mudar, mexe-se no Excel e volta-se a gerar — não se edita à mão.
// ─────────────────────────────────────────────────────────────────────────────

export const CATEGORIAS_POR_EMPRESA = {
  blessed: [
    "Lpx Private - Aporte/Resgate",
    "Morning Steps - Aporte/Resgate",
    "Big Mouse- Aporte/Resgate",
    "RHCS - Aporte/Resgate",
    "Mútuo investida",
    "Aporte / Resgate investida",
    "Mútuo Terceiros",
    "Amortização",
    "Funding",
    "Development Fee (Receitas)",
    "Development Fee @ Lpx Private",
    "Development Fee @ Morning Steps",
    "Development Fee @ Big Mouse",
    "Terreno",
    "Impostos e taxas",
    "IVA",
    "Encargos financeiros",
    "Legais",
    "Marketing",
    "Projetos",
    "Obra",
    "Administrativos",
    "Fiscalização",
    "Fee Gestão",
    "Juros",
    "Ajuste",
    "IVA de obra",
  ],
  enchanted: [
    "Lpx Private - Aporte/Resgate",
    "Efeito Impecável - Aporte/Resgate",
    "Morning Steps - Aporte/Resgate",
    "RHCS - Aporte/Resgate",
    "Big Mouse - Aporte/Resgate",
    "Mútuo investida",
    "Mútuo Terceiros",
    "Amortização",
    "Funding",
    "Development Fee (Receitas)",
    "Development Fee @ Efeito Impecável",
    "Development Fee @ Lpx Private",
    "Development Fee @ Morning Steps",
    "Development Fee @ Big Mouse",
    "Terreno",
    "Impostos e taxas",
    "IVA",
    "Encargos financeiros",
    "Legais",
    "Marketing",
    "Projetos",
    "Obra",
    "Administrativos",
    "Fiscalização",
    "Fee Gestão",
    "Juros",
    "Ajuste",
    "IVA de obra",
  ],
  favcloset: [
    "Aporte Ideias Vidradas",
    "Aporte Parcela Emergente",
    "Aporte Magic Biz",
    "Aporte Findmore",
    "Aporte Pompous Measures",
    "Aporte Morning Steps",
    "Aporte Efeito Impecável",
    "Aporte Big Mouse",
    "Aporte Enchanted",
    "Resgate Ideias Vidradas",
    "Resgate Parcela Emergente",
    "Resgate Magic Biz",
    "Resgate Findmore",
    "Resgate Pompous Measures",
    "Resgate Morning Steps",
    "Resgate Efeito Impecável",
    "Resgate Big Mouse",
    "Resgate Enchanted",
    "Mútuo Bombastic Gadget",
    "Mútuo Vanillapotential",
    "Mútuo Fatima Serra",
    "Mútuo Findmore",
    "Mútuo Rio Capital",
    "Amortização",
    "Funding",
    "Vendas",
    "Comissão",
    "Terreno",
    "Impostos e taxas",
    "Encargos financeiros",
    "Legais",
    "Marketing",
    "Projetos",
    "Obra",
    "Administrativos",
    "Fiscalização",
    "Fee Gestão",
    "Juros",
    "Ajuste",
    "IVA de obra",
    "Impostos e Taxas",
  ],
  genero: [
    "Lpx - Aporte/Resgate",
    "Parcela Emergente - Aporte/Resgate",
    "Mútuo Lpx",
    "Mútuo Big Mouse",
    "Amortização",
    "Funding",
    "Vendas",
    "Comissão",
    "Terreno",
    "Impostos e taxas",
    "Encargos financeiros",
    "Legais",
    "Marketing",
    "Projetos",
    "Obra",
    "Administrativos",
    "Fiscalização",
    "Fee Gestão",
    "Juros",
    "Ajuste",
    "IVA de obra",
    "Reservas",
  ],
  pearl: [
    "Lpx Private - Aporte/Resgate",
    "Aura Temperamental - Aporte/Resgate",
    "Mútuo Lpx",
    "Mútuo Big Mouse",
    "Amortização",
    "Funding",
    "Receitas de comissão",
    "Comissão Terceiros",
    "Comissão Interna @ Aura Temperamental",
    "Comissão Interna @ Lpx Private",
    "Comissão Interna @ XIZODIS",
    "Reservas",
    "Terreno",
    "Office",
    "Impostos e taxas",
    "Encargos financeiros",
    "Legais",
    "Google / Facebook Ads",
    "Vídeos / Fotos",
    "Marketing",
    "Novos Negócios",
    "Idealista",
    "Projetos",
    "Obra",
    "Administrativos",
    "Fiscalização",
    "Fee Gestão",
    "Juros",
    "Ajuste",
  ],
  simplify: [
    "Blessed - Aporte/Resgate",
    "Parcela Emergente - Aporte/Resgate",
    "Mútuo Lpx",
    "Mútuo Big Mouse",
    "Amortização",
    "Funding",
    "Vendas",
    "Comissão",
    "Terreno",
    "Impostos e taxas",
    "Encargos financeiros",
    "Legais",
    "Marketing",
    "Projetos",
    "Obra",
    "Administrativos",
    "Fiscalização",
    "Fee Gestão",
    "Juros",
    "Ajuste",
    "IVA de obra",
  ],
};

export const CAT_SUB_POR_EMPRESA = {
  adseq: {
    "Sócios": [
      "Suprimentos",
    ],
    "Vendas": [
      "Vendas",
    ],
    "Aquisição_de_Terreno": [
      "Aquisição Terreno",
      "IMT",
      "Imposto Selo",
      "Notário",
      "Outros",
    ],
    "Licenças_e_Relacionados": [
      "Advogados - Licenças",
      "Projetos de Arquitetura e Especialidades",
      "Taxas e emolumentos",
    ],
    "Obras": [
      "Buffer/Outros",
      "Demolição e Preparação",
      "Gastos com Obras",
      "Seguros",
      "Taxas (Obras)",
    ],
    "Soft_Costs": [
      "Fiscalização",
      "Marketing e propraganda",
      "Outros - Comissões Bancárias",
      "Outros - Diversos",
      "Outros - Diversos SC",
      "Seguro de Obra",
      "Seguros diversos",
      "Setup Costs",
      "TOC (Contabilidade)",
      "Taxa de Gestão",
    ],
    "Impostos": [],
    "Intra-Group (TRF)": [
      "Intra-Group (TRF)",
    ],
    "Cartão_de_Crédito": [
      "Cartão por Classificar",
      "Outros - Diversos SC",
    ],
    "Financiamento": [
      "Inflow - Obra",
      "Inflow - Terreno",
      "Outflow - Juros",
      "Outflow - Taxas e comissões",
      "Outlow - Repagamento",
    ],
    "Outros_Diversos": [
      "Adiantamentos",
      "Black Hawk",
      "Caroline Larson",
      "Comercial",
      "Comissão s/Vendas",
      "IRC",
      "IVA",
      "Ideias Vidradas",
      "Magicbiz",
      "Não Classificado",
      "Outros custos de Estruturação",
      "Palatine Lisboa",
      "Parcela Emergente",
      "Projetos - Outros",
      "Projetos de Loteamento",
      "ROC (Auditoria)",
      "Registos",
      "Residencial",
      "Rumo Decimal",
      "Taxas de estruturação",
    ],
  },
  infinite: {
    "Sócios": [
      "Suprimentos",
    ],
    "Vendas": [],
    "Aquisição_de_Terreno": [
      "Aquisição Terreno",
      "IMT",
      "Imposto Selo",
      "Notário",
      "Outros",
    ],
    "Licenças_e_Relacionados": [
      "Advogados - Licenças",
      "Projetos de Arquitetura e Especialidades",
      "Taxas e emolumentos",
    ],
    "Obras": [
      "Buffer/Outros",
      "Demolição e Preparação",
      "Gastos com Obras",
      "Seguros",
      "Taxas (Obras)",
    ],
    "Soft_Costs": [
      "Fiscalização",
      "Marketing e propraganda",
      "Outros - Comissões Bancárias",
      "Outros - Diversos",
      "Outros - Diversos PA",
      "Seguro de Obra",
      "Seguros diversos",
      "Setup Costs",
      "TOC (Contabilidade)",
      "Taxa de Gestão",
    ],
    "Impostos": [],
    "Intra-Group (TRF)": [],
    "Cartão_de_Crédito": [
      "Cartão por Classificar",
      "Outros - Diversos",
    ],
    "Financiamento": [
      "Inflow - Obra",
      "Inflow - Terreno",
      "Outflow - Juros",
      "Outflow - Taxas e comissões",
      "Outlow - Repagamento",
    ],
    "Outros_Diversos": [
      "Adiantamentos",
      "Comercial",
      "Comissão s/Vendas",
      "Echanted Fields",
      "ExisteNumero Invest. Imob. Lda",
      "IRC",
      "IVA",
      "Ideias Viradas",
      "Não Classificado",
      "Optimist Lion Lda",
      "Oráculo Sábio Lda",
      "Outros - Diversos",
      "Outros custos de Estruturação",
      "Projetos de Loteamento",
      "ROC (Auditoria)",
      "Registos",
      "Residencial",
      "Rui Lima Cabral Unip. Lda",
      "Taxas de estruturação",
      "Vazio Arquitectura Lda",
    ],
    "Transferências": [],
  },
};

// ─── Acesso ──────────────────────────────────────────────────────────────────
// As empresas que ainda não têm plano próprio (a holding, a Fluffy, a Traços)
// continuam com a lista geral de src/categorias.js. É por isso que estas
// funções devolvem null em vez de uma lista vazia: null quer dizer "não tenho
// plano próprio", e quem chama sabe que há-de usar o de sempre.

export const temPlanoProprio = (empresaId) =>
  !!(CATEGORIAS_POR_EMPRESA[empresaId] || CAT_SUB_POR_EMPRESA[empresaId]);

export const usaSubcategoria = (empresaId) => !!CAT_SUB_POR_EMPRESA[empresaId];

// As categorias de uma empresa, pela ordem do Excel. null = sem plano próprio.
export function categoriasDa(empresaId) {
  const sub = CAT_SUB_POR_EMPRESA[empresaId];
  if (sub) return Object.keys(sub);
  return CATEGORIAS_POR_EMPRESA[empresaId] || null;
}

// As subcategorias de uma categoria. Numa empresa sem subcategorias devolve
// uma lista vazia; numa categoria desconhecida devolve todas, para que uma
// célula nunca fique sem opções por causa de um nome fora do plano.
export function subcategoriasDa(empresaId, categoria) {
  const mapa = CAT_SUB_POR_EMPRESA[empresaId];
  if (!mapa) return [];
  const certas = mapa[categoria];
  if (certas && certas.length) return certas;
  return [...new Set(Object.values(mapa).flat())].sort();
}

// Um valor que já está gravado mas não pertence ao plano da empresa não é
// apagado nem escondido: é assinalado, para ser revisto à mão.
// A comparação ignora espaços a mais, acentos e maiúsculas: "Financiamento"
// com um espaço à frente, vindo de uma importação, é a mesma categoria — não
// é razão para a assinalar como estranha ao plano.
const chave = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().trim().replace(/[\s_]+/g, " ");

export function foraDoPlano(empresaId, categoria) {
  const cats = categoriasDa(empresaId);
  if (!cats || !categoria) return false;
  const k = chave(categoria);
  return !cats.some(c => chave(c) === k);
}

// Junta ao plano um valor que já esteja gravado, para a lista o poder mostrar
// sem o perder de vista.
export const comOValorAtual = (lista, atual) =>
  atual && !lista.includes(atual) ? [...lista, atual] : lista;
