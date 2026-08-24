// Lista canónica de categorias do ERP. Usada em:
//  - ExtratosView (dropdown por movimento)
//  - ImportarExtrato (dropdown por linha importada)
//  - FluxoFuturo (form de novo pagamento/recebimento)
//  - ContasPagar / ImportarFatura (form de nova fatura)
//
// Ordenadas por agrupamento lógico (operacional, capital, fiscal, etc.) para
// facilitar a escolha do utilizador.

export const CATEGORIAS = [
  // ─── Operacional / despesas correntes ───
  "Administrativos",
  "Contabilidade",
  "ERP",
  "Sistema",
  "Marketing",
  "Despesa com Marketing Institucional",
  "Salários",
  "Ticket Refeição",
  "Imposto sobre folha",
  "Cartão de Crédito",
  "Carregamento de saldo",
  "Transporte",
  "Viagens",
  "Estornos e Reembolsos",

  // ─── Obra e projetos ───
  "Obra",
  "Projetos",
  "Projetos/Soft Costs",
  "Fiscalização",
  "Legais",
  "Aquisição",
  "Terreno",
  "IVA construção",
  "Novos Negócios",

  // ─── CSC (Centros de Serviços Compartilhados) ───
  "CSC",
  "CSC Madrid",
  "CSC Londres",
  "Novos Negócios Madrid",
  "Novos Negócios UK",
  "Transporte Madrid",
  "Transporte UK",

  // ─── Comissões e gestão ───
  "Comissão",
  "Despesa com Comissão",
  "Fee Gestão",

  // ─── Encargos financeiros ───
  "Encargos financeiros",
  "Impostos e taxas",
  "Juros",
  "Amortização",
  "Funding",
  "Mútuo",

  // ─── Aportes / Resgates / Capital ───
  "Aporte RC",
  "Aporte Investidores",
  "Aporte SPV",
  "Aporte de Capital HSP",
  "Resgate RC",
  "Resgate Investidores",
  "Resgate SPV",
  "Dividendos",

  // ─── Sócios (movimentos pessoais identificados) ───
  "Henrique",
  "Marcelo",
  "Márcia Coelho",

  // ─── Receitas ───
  "Receita Cambial",
  "Receita de Comissões",
  "Receita de Rendas",
  "Receita de Rendimentos Financeiros",
  "Receita de Venda de Projeto",
  "Receita de Venda de Unidades",
  "Receita de Operações",
  "Vendas",
  "Recebimento",

  // ─── Outros ───
  "Ajuste",
  "Ajuste Contábil",
  "Outro",

  // ─── LPX · aportes e resgates por entidade ───
  "Lpx Private - Aporte/Resgate",
  "Blessed - Aporte/Resgate",
  "Big Mouse - Aporte/Resgate",
  "Morning Steps - Aporte/Resgate",
  "Parcela Emergente - Aporte/Resgate",
  "Efeito Impecável - Aporte/Resgate",
  "Aura Temperamental - Aporte/Resgate",
  "RHCS - Aporte/Resgate",
  "Aporte / Resgate investida",
  "Aporte Big Mouse",
  "Aporte Efeito Impecável",
  "Aporte Enchanted",
  "Aporte Findmore",
  "Aporte Ideias Vidradas",
  "Aporte Magic Biz",
  "Aporte Morning Steps",
  "Aporte Parcela Emergente",
  "Aporte Pompous Measures",

  // ─── LPX · mútuos ───
  "Mútuo investida",
  "Mútuo Terceiros",
  "Mútuo Bombastic Gadget",
  "Mútuo Findmore",
  "Mútuo Fatima Serra",
  "Mútuo Vanillapotential",

  // ─── LPX · development fees e comissões ───
  "Development Fee (Receitas)",
  "Development Fee @ Lpx Private",
  "Development Fee @ Morning Steps",
  "Development Fee @ Efeito Impecável",
  "Development Fee @ Big Mouse",
  "Comissão Interna @ Lpx Private",
  "Comissão Interna @ Aura Temperamental",
  "Comissão Interna @ XIZODIS",
  "Comissão Terceiros",
  "Comissões",
  "Receitas de comissão",

  // ─── LPX · marketing e estrutura ───
  "Idealista",
  "Google / Facebook Ads",
  "Vídeos / Fotos",
  "Office",
  "Reservas",
];

// Subconjunto usado em faturas (Contas a Pagar) — não inclui aportes/resgates,
// que não fazem sentido para faturas de fornecedores.
export const CATEGORIAS_FATURA = CATEGORIAS.filter(c =>
  !["Aporte RC", "Aporte Investidores", "Aporte SPV", "Aporte de Capital HSP",
    "Resgate RC", "Resgate Investidores", "Resgate SPV", "Dividendos",
    "Henrique", "Marcelo", "Márcia Coelho",
    "Receita Cambial", "Receita de Comissões", "Receita de Rendas",
    "Receita de Rendimentos Financeiros", "Receita de Venda de Projeto",
    "Receita de Venda de Unidades", "Receita de Operações",
    "Vendas", "Recebimento",
    "Development Fee (Receitas)", "Receitas de comissão"].includes(c)
  && !/^(Aporte|Mútuo)\b/.test(c)
  && !/- Aporte\/Resgate$/.test(c)
);
