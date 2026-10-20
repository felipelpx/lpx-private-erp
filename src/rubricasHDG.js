// ─────────────────────────────────────────────────────────────────────────────
// AS LINHAS DO FLUXO OPERACIONAL — PROJETOS HDG
//
// Os projetos do grupo HDG (Admirable Sequence · Cinq Etoiles, Infinite Change
// · Paço D'arcos, Traços e Angulos) não têm o mesmo plano de contas dos
// projetos LPX. As FO deles são hierárquicas: cinco grandes blocos
// (Licenças_e_Relacionados, Aquisição_de_Terreno, Obras, Soft_Costs,
// Financiamento) com as despesas por baixo. E é a DESPESA que é a linha do
// fluxo — "Gastos com Obras", "Taxa de Gestão", "TOC (Contabilidade)" —, não
// o bloco que a contém.
//
// O ERP mostrava os blocos. Isso dava cinco linhas onde a FO tem trinta, e
// nenhum investidor conseguia cruzar um ecrã com a sua folha. Aqui está a
// lista tal como está nas FO, pela mesma ordem, para que o Fluxo Futuro, a
// matriz, o Investor Relations e o Real × Orçado mostrem exatamente as linhas
// que o Felipe tem nos fluxos operacionais.
//
// O plano de contas do extrato NÃO muda: lá continua a classificar-se por
// categoria + subcategoria (Obras → Gastos com Obras). O que muda é o eixo
// dos ecrãs de fluxo, que passa a ser a subcategoria — a tal linha da FO.
//
// Fonte: folha «Fluxo Futuro» de Admirable_Sequence_30_09_v4 e de
// Infinite_Change_30.09v_3, linhas 5 a 45.
// ─────────────────────────────────────────────────────────────────────────────

// Os blocos da FO e as linhas de cada um, pela ordem da folha.
export const GRUPOS_FO_HDG = [
  { grupo: "Receitas", linhas: [
    "Vendas",
    "Comissão s/Vendas",
    "Outras Receitas (Devolução IMT)",
  ]},
  { grupo: "Licenças_e_Relacionados", linhas: [
    "Projetos de Loteamento",
    "Projetos de Arquitetura e Especialidades",
    "Taxas e emolumentos",
    "Advogados - Licenças",
    "Outros custos de Estruturação",
  ]},
  { grupo: "Aquisição_de_Terreno", linhas: [
    "Aquisição Terreno",
    "IMT",
    "Imposto Selo",
    "Notário",
    "Registos",
  ]},
  { grupo: "Obras", linhas: [
    "Demolição e Preparação",
    "Gastos com Obras",
    "Taxas (Obras)",
    "Buffer/Outros",
  ]},
  { grupo: "Soft_Costs", linhas: [
    "Taxas de estruturação",
    "Taxa de Gestão",
    "Seguros diversos",
    "Seguro de Obra",
    "Fiscalização",
    "CSO",
    "TOC (Contabilidade)",
    "ROC (Auditoria)",
    "Marketing e propraganda",
    "Outros - Comissões Bancárias",
    "Setup Costs",
    "Outros - Diversos",
    "Adiantamentos",
  ]},
  { grupo: "Financiamento", linhas: [
    "Inflow - Obra",
    "Inflow - Terreno",
    "Outlow - Repagamento",
    "Outflow - Juros",
    "Outflow - Taxas e comissões",
  ]},
  // Não estão na folha de fluxo, mas existem nos extratos e têm de ter onde
  // cair — senão um movimento real ficava sem linha.
  { grupo: "Fora do fluxo do projeto", linhas: [
    "IVA",
    "IRC",
    "Encargos Financeiros",
    "Suprimentos",
    "Intra-Group (TRF)",
    "Cartão por Classificar",
    "Não Classificado",
  ]},
];

export const LINHAS_FO_HDG = GRUPOS_FO_HDG.flatMap(g => g.linhas);

const chave = (t) => String(t || "").trim()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[_\s]+/g, " ").toLowerCase();

const POR_CHAVE = {};
LINHAS_FO_HDG.forEach(l => { POR_CHAVE[chave(l)] = l; });

export const GRUPO_DA_LINHA = {};
GRUPOS_FO_HDG.forEach(g => g.linhas.forEach(l => { GRUPO_DA_LINHA[chave(l)] = g.grupo; }));

// ─── O que já está lançado com o vocabulário LPX ─────────────────────────────
// Os planos de obra e as previsões lançadas à mão usaram os nomes das empresas
// LPX ("Obra", "Fee Gestão", "Contabilidade"). São a mesma despesa da FO com
// outro nome: traduzem-se aqui, em vez de se obrigar a reclassificar centenas
// de lançamentos. O que NÃO tiver tradução fica como está e aparece assinalado
// como fora do plano — que é o sinal de que há ali algo a arrumar.
export const EQUIVALENTES_HDG = {
  "obra": "Gastos com Obras",
  "obras": "Gastos com Obras",
  "construcao": "Gastos com Obras",
  "fee gestao": "Taxa de Gestão",
  "taxa de gestao": "Taxa de Gestão",
  "contabilidade": "TOC (Contabilidade)",
  "toc": "TOC (Contabilidade)",
  "legais": "Advogados - Licenças",
  "advogados": "Advogados - Licenças",
  "projetos": "Projetos de Arquitetura e Especialidades",
  "marketing": "Marketing e propraganda",
  "seguros": "Seguros diversos",
  "comissao": "Comissão s/Vendas",
  "comissao s/vendas": "Comissão s/Vendas",
  "receita": "Vendas",
  "recebiveis": "Vendas",
  "juros": "Outflow - Juros",
  "funding": "Inflow - Obra",
  "funding banco": "Inflow - Obra",
  "financiamento": "Inflow - Obra",
  "amortizacao": "Outlow - Repagamento",
  "outro": "Outros - Diversos",
  "outros": "Outros - Diversos",
  "outros diversos": "Outros - Diversos",
  "administrativos": "Outros - Diversos",
  "encargos financeiros": "Encargos Financeiros",
  "socios": "Suprimentos",
};

/**
 * A linha da FO de um lançamento HDG.
 * A subcategoria manda: é ela que é a despesa. Sem subcategoria, tenta-se a
 * categoria — que nas receitas ("Vendas") já é a própria linha. Devolve null
 * quando nada bate, e aí quem chama fica com o nome em cru.
 */
export function linhaDoFluxoHDG(categoria, subcategoria) {
  for (const t of [subcategoria, categoria]) {
    const k = chave(t);
    if (!k) continue;
    if (POR_CHAVE[k]) return POR_CHAVE[k];
    if (EQUIVALENTES_HDG[k]) return EQUIVALENTES_HDG[k];
  }
  return null;
}

export const linhaNoFluxoHDG = (linha) => !!POR_CHAVE[chave(linha)];

export default LINHAS_FO_HDG;
