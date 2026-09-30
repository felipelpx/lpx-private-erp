// ─────────────────────────────────────────────────────────────────────────────
// NOMENCLATURA DOS GRÁFICOS
//
// Os extratos têm dezenas de categorias, herdadas de dois planos de contas
// (LPX e HDG) e de anos de lançamentos. Num gráfico para investidor isso não
// se mostra em cru: agrupa-se pelo que a rubrica É, não pelo nome que levou.
//
//   · tudo o que é mútuo, aporte ou suprimento  → "Aporte sócios"
//   · devoluções de capital aos sócios           → "Resgate sócios"
//   · desembolsos do banco                       → "Funding banco"
//   · ajustes e transferências intra-grupo       → fora do gráfico
//
// O nome original fica intacto na base de dados e no extrato; isto é só a
// camada de apresentação. Uma única função, usada por todos os gráficos, para
// a cascata e os centros de custo não contarem histórias diferentes.
// ─────────────────────────────────────────────────────────────────────────────

const chave = (t) => String(t || "").trim()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/_/g, " ").replace(/\s+/g, " ").toLowerCase();

export const APORTE = "Aporte sócios";
export const RESGATE = "Resgate sócios";
export const FUNDING = "Funding banco";

// Rubricas que não são fluxo económico do projeto: movimento entre contas do
// mesmo grupo. Entram e saem pelo mesmo valor, por isso só sujam o gráfico.
export function ocultarNoGrafico(categoria, subcategoria) {
  const c = chave(categoria), s = chave(subcategoria);
  if (/^ajuste/.test(c)) return true;
  if (/movimento entre contas do mesmo grupo/.test(s)) return true;
  return false;
}

// Nome a mostrar nos gráficos. Devolve null quando a rubrica não deve aparecer.
export function rotuloGrafico(categoria, subcategoria) {
  if (ocultarNoGrafico(categoria, subcategoria)) return null;

  const c = chave(categoria), s = chave(subcategoria);

  // ── Capital dos sócios ───────────────────────────────────────────────────
  // Inclui a categoria "Sócios" do plano HDG, cujas subcategorias são
  // suprimentos e os nomes das sociedades investidoras.
  if (c === "socios") return /resgate|devolucao/.test(s) ? RESGATE : APORTE;
  if (/^resgate/.test(c)) return RESGATE;
  if (/^(aporte|mutuo|suprimento)/.test(c)) return APORTE;
  if (/- aporte\/resgate$/.test(c)) return APORTE;
  if (/^(aporte|mutuo|suprimento)/.test(s)) return APORTE;

  // ── Banco ────────────────────────────────────────────────────────────────
  // No plano HDG "Financiamento" cobre o desembolso e o seu custo: é a
  // subcategoria que distingue um do outro. Tratar tudo como funding poria
  // os juros a aparecer como dinheiro que entra.
  if (c === "financiamento" || c === "funding" || c === "funding banco" || c === "funding bancario") {
    if (/^inflow/.test(s)) return FUNDING;
    if (/juros/.test(s)) return "Juros e encargos";
    if (/taxas|comissoes/.test(s)) return "Encargos bancários";
    if (/repagamento|amortizacao/.test(s)) return "Amortização de dívida";
    return FUNDING;
  }
  if (/^(juros|encargos financeiros)/.test(c)) return "Juros e encargos";
  if (/^amortizacao/.test(c)) return "Amortização de dívida";

  return String(categoria || "").trim() || "Sem categoria";
}
