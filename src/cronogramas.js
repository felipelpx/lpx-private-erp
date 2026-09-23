// ─────────────────────────────────────────────────────────────────────────────
// CRONOGRAMAS DOS PROJETOS — alimentam a timeline do Investor Relations
//
// Os marcos vêm dos business plans e dos relatórios mensais de cada projeto.
// Cada projeto liga-se a uma empresa pelo `empresaId` (ver src/empresas.js).
//
// Campos de cada marco:
//   fase     nome do marco
//   inicio   "AAAA-MM" (obrigatório)
//   fim      "AAAA-MM" (opcional; se faltar, é um marco pontual)
//   estado   "concluido" | "curso" | "previsto" | "risco"
//   nota     texto curto mostrado ao passar o rato
//
// ⚠ CONFIRMAR: as datas abaixo foram retiradas dos business plans e dos
// relatórios mensais já produzidos. Onde não havia fonte, o projeto fica sem
// cronograma e a timeline diz isso em vez de inventar datas.
// ─────────────────────────────────────────────────────────────────────────────

export const CRONOGRAMAS = {
  // ── Favorite Closet · Amadeu 07 ──────────────────────────────────────────
  // Fonte: relatório mensal A07 + ATA nº 77 (RASA, 26/06/2026).
  // Empreiteiro Cosmik, contrato ~1,3 M€. Execução 41,9% contra 100% previsto.
  favcloset: {
    projeto: "Amadeu 07",
    marcos: [
      { fase: "Aquisição e licenciamento", inicio: "2024-01", fim: "2025-06", estado: "concluido" },
      { fase: "Obra (Cosmik)",             inicio: "2025-07", fim: "2026-12", estado: "risco",
        nota: "Execução 41,9% vs. 100% previsto — fiscalização duvida da conclusão em 2026" },
      { fase: "Comercialização",           inicio: "2025-09", fim: "2026-12", estado: "concluido",
        nota: "11 frações, todas com CPCV assinado" },
      { fase: "Escrituras",                inicio: "2027-01", fim: "2027-06", estado: "previsto",
        nota: "Data a rever em função do novo prazo de obra" },
    ],
  },

  // ── Simplify Rubric · Alto dos 7 Moinhos ─────────────────────────────────
  // Fonte: relatório mensal 7M + ATA nº 19.
  // Empreiteiro Complai, contrato 1.149.999,50 €.
  simplify: {
    projeto: "Alto dos 7 Moinhos",
    marcos: [
      { fase: "Aquisição e licenciamento", inicio: "2025-01", fim: "2026-06", estado: "concluido" },
      { fase: "Demolições",                inicio: "2026-06", fim: "2026-09", estado: "concluido" },
      { fase: "Obra (Complai)",            inicio: "2026-06", fim: "2027-12", estado: "curso",
        nota: "Início 22/06/2026 · conclusão contratual 21/12/2027" },
      { fase: "Comercialização",           inicio: "2026-01", fim: "2026-09", estado: "concluido",
        nota: "8 frações, todas com CPCV assinado · GDV 2.848.961 €" },
      { fase: "Escrituras",                inicio: "2028-01", fim: "2028-06", estado: "previsto" },
    ],
  },

  // ── Genero Prudente · Maria Pia 536 ──────────────────────────────────────
  // Fonte: teaser Maria Pia 536, folha "Project" do modelo (prazo 20,3 meses).
  genero: {
    projeto: "Maria Pia 536",
    marcos: [
      { fase: "Escritura de aquisição", inicio: "2026-07", estado: "concluido" },
      { fase: "Licenciamento",          inicio: "2026-07", fim: "2026-12", estado: "curso" },
      { fase: "Obra",                   inicio: "2027-01", fim: "2028-01", estado: "previsto" },
      { fase: "Conclusão",              inicio: "2028-03", estado: "previsto",
        nota: "Prazo total do business plan: 20,3 meses" },
      { fase: "Comercialização",        inicio: "2027-06", fim: "2028-06", estado: "previsto",
        nota: "11 frações · vendas previstas 4.015.000 €" },
    ],
  },

  // ── Admirable Sequence · Cinq Etoiles ────────────────────────────────────
  // Fonte: Admirable_Sequence_07_09.xlsx (Curva de Obra, Prev gastos, Inputs).
  // Obra dilatada em 2 meses face à base (input "Δ meses no prazo da obra").
  adseq: {
    projeto: "Cinq Etoiles",
    marcos: [
      { fase: "Aquisição de terreno", inicio: "2026-03", estado: "concluido",
        nota: "1.755.000 € — abaixo do orçado em 195.000 €" },
      { fase: "Licenciamento",        inicio: "2026-03", fim: "2026-07", estado: "concluido" },
      { fase: "Obra",                 inicio: "2026-08", fim: "2027-08", estado: "curso",
        nota: "Base de 11 meses dilatada para 13 · custo já 51% acima do orçado" },
      { fase: "Comercialização",      inicio: "2026-06", fim: "2027-06", estado: "curso",
        nota: "Vendas de 5.298.999 € contra 4.654.700 € orçados" },
      { fase: "Escrituras",           inicio: "2027-10", estado: "previsto",
        nota: "2 meses após a conclusão da obra (input de prazos)" },
    ],
  },

  // ── Infinite Change · Paço D'arcos ───────────────────────────────────────
  // Fonte: Infinite_Change_07_09.xlsx (Curva de Obra, Prev gastos).
  infinite: {
    projeto: "Paço D'arcos",
    marcos: [
      { fase: "Aquisição de terreno", inicio: "2026-01", estado: "concluido",
        nota: "2.089.787 € · IMT 136.500 €" },
      { fase: "Licenciamento",        inicio: "2026-01", fim: "2026-07", estado: "risco",
        nota: "154.406 € contra 49.200 € orçados — mais do triplo" },
      { fase: "Obra",                 inicio: "2026-08", fim: "2027-10", estado: "curso",
        nota: "15 meses · 4,64 M€ executados de 4,57 M€ orçados" },
      { fase: "Comercialização",      inicio: "2026-03", fim: "2027-09", estado: "curso",
        nota: "Vendas de 11.778.000 € contra 9.784.920 € orçados" },
      { fase: "Escrituras",           inicio: "2027-12", estado: "previsto" },
    ],
  },

  // Sem cronograma de origem confirmada — a timeline avisa em vez de inventar:
  // enchanted, blessed, pearl, fluffy, tracos, lpx.
};

// Estados e respetivas cores
export const ESTADO_MARCO = {
  concluido: { rotulo: "Concluído", cor: "#16a34a", fundo: "#dcfce7" },
  curso:     { rotulo: "Em curso",  cor: "#2563eb", fundo: "#dbeafe" },
  previsto:  { rotulo: "Previsto",  cor: "#6B7C93", fundo: "#eef1f5" },
  risco:     { rotulo: "Em risco",  cor: "#dc2626", fundo: "#fee2e2" },
};

export default CRONOGRAMAS;
