// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIAS E SUBCATEGORIAS — PROJETOS HDG
//
// Plano de contas dos projetos do grupo HDG (Admirable Sequence · Cinq Etoiles,
// Infinite Change · Paço D'arcos, Traços e Angulos). Duas fontes:
//
//   · cat_subcat.xlsx, folha "Menu1" — o plano como deve ser;
//   · Caixa_Unico_HDG_3.xlsm — o que está mesmo em uso nos extratos.
//
// A lista é a união das duas. Os nomes com underscore (Soft_Costs,
// Aquisição_de_Terreno, …) são os do business plan e os que o Real × Orçado
// já usa em src/modeloRealOrcado.js — mudá-los partiria esse cruzamento.
// Categorias como "Sócios" não constam do Menu1 mas têm dezenas de
// movimentos: ficam, porque a folha de controlo manda mais do que o menu.
//
// Subcategorias usadas uma única vez (texto livre do género "CSO Agosto
// (WH 371)") NÃO entram na lista, para a não encher de casos isolados — mas
// continuam gravadas no movimento e o ecrã mostra-as como "(fora do plano)",
// que é precisamente o sinal de que há ali algo a arrumar.
//
// As empresas do grupo LPX continuam com src/categorias.js: são planos de
// contas diferentes e não se misturam.
// ─────────────────────────────────────────────────────────────────────────────

export const CAT_SUB_HDG = {
  "Vendas": [
    "Residencial",
    "Comercial",
    "Outros",
  ],
  "Aquisição_de_Terreno": [
    "Aquisição Terreno",
    "IMT",
    "Imposto Selo",
    "Notário",
    "Registos",
    "Outros",
  ],
  "Licenças_e_Relacionados": [
    "Projetos de Loteamento",
    "Projetos de Arquitetura e Especialidades",
    "Taxas e emolumentos",
    "Advogados - Licenças",
    "Outros custos de Estruturação",
  ],
  "Obras": [
    "Demolição e Preparação",
    "Gastos com Obras",
    "Taxas (Obras)",
    "Seguros",
    "Fiscalização",
    "Buffer/Outros",
  ],
  "Soft_Costs": [
    "Taxas de estruturação",
    "Taxa de Gestão",
    "Seguros diversos",
    "Seguro de Obra",
    "Fiscalização",
    "TOC (Contabilidade)",
    "ROC (Auditoria)",
    "Marketing e propraganda",
    "Comissão s/Vendas",
    "Outros - Comissões Bancárias",
    "Setup Costs",
    "Outros - Diversos",
    "Outros - Diversos SC",
    "CSO",
  ],
  "Impostos e taxas": [
    "IVA",
    "IRC",
    "Encargos Financeiros",
  ],
  "Intra-Group (TRF)": [
    "Intra-Group (TRF)",
    "(Sem detalhe)",
  ],
  "Transferências": [],
  "Financiamento": [
    "Inflow - Obra",
    "Inflow - Terreno",
    "Outlow - Repagamento",
    "Outflow - Juros",
    "Outflow - Taxas e comissões",
  ],
  "Outros_Diversos": [
    "Não Classificado",
    "Outros - Diversos",
    "Adiantamentos",
  ],
  "Cartão_de_Crédito": [
    "Cartão por Classificar",
    "Outros - Diversos",
  ],
  "Sócios": [
    "Suprimentos",
    "Rui Lima Cabral Unip. Lda",
    "Vazio Arquitectura Lda",
    "Oráculo Sábio Lda",
    "Echanted Fields",
    "Ideias Viradas",
    "Optimist Lion Lda",
  ],
  "Encargos Financeiros": [
    "Encargos Financeiros",
  ],
  "Legais": [],
  "Mútuo": [
    "Mútuo Clausula Dominante",
  ],
  "Ajuste": [
    "Movimento entre contas do mesmo grupo",
  ],
  "Contabilidade": [],
};

export const CATEGORIAS_HDG = Object.keys(CAT_SUB_HDG);

// Todas as subcategorias, sem repetições — a rede de segurança de quem está a
// classificar um movimento cuja categoria o plano ainda não conhece.
export const TODAS_SUBCATEGORIAS_HDG = [...new Set(Object.values(CAT_SUB_HDG).flat())].sort(
  (a, b) => a.localeCompare(b, "pt"));

// A mesma categoria aparece escrita de duas maneiras nos dados: "Soft Costs"
// (menu) e "Soft_Costs" (business plan), e há sempre o espaço a mais vindo de
// um Excel. Comparar texto em cru deixava a célula da subcategoria morta sem
// explicação nenhuma, por isso a procura é feita sobre uma forma normalizada.
const chave = (t) => String(t || "").trim()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[_\s]+/g, " ").toLowerCase();

const POR_CHAVE = {};
Object.keys(CAT_SUB_HDG).forEach(c => { POR_CHAVE[chave(c)] = c; });

// Nome canónico da categoria, ou null se não pertencer de todo ao plano HDG.
export const categoriaCanonicaHDG = (cat) => POR_CHAVE[chave(cat)] || null;

// Pertence ao plano, escrita como estiver?
export const categoriaNoPlanoHDG = (cat) => categoriaCanonicaHDG(cat) !== null;

// Subcategorias de uma categoria. Categoria desconhecida devolve a lista toda,
// em vez de uma lista vazia: é preferível oferecer opções a mais do que deixar
// alguém sem conseguir classificar o movimento.
export function subcategoriasHDG(cat) {
  const canonica = categoriaCanonicaHDG(cat);
  if (!canonica) return TODAS_SUBCATEGORIAS_HDG;
  const subs = CAT_SUB_HDG[canonica];
  return subs.length ? subs : TODAS_SUBCATEGORIAS_HDG;
}

// A mesma subcategoria existe em várias categorias ("Fiscalização",
// "Outros - Diversos"), por isso a validação é sempre dentro da categoria.
export const subcategoriaValida = (cat, sub) => {
  if (!sub) return true;
  const canonica = categoriaCanonicaHDG(cat);
  if (!canonica) return true;                 // categoria fora do plano: não bloqueia
  const subs = CAT_SUB_HDG[canonica];
  return subs.length === 0 || subs.some(x => chave(x) === chave(sub));
};
