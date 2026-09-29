// ─────────────────────────────────────────────────────────────────────────────
// FUNDING BANCÁRIO
//
// Há despesas que o banco financia: o empreiteiro é pago, mas o banco liberta
// o mesmo montante (ou a percentagem contratada). Em caixa a despesa fica
// neutralizada — o que pesa mesmo no projeto é só a parte não financiada.
//
// A marcação vive na própria despesa (`funding` + `funding_pct`), para andar
// com ela quando a previsão se converte em fatura; o fluxo gera a entrada
// correspondente a partir daqui. Esta é a fonte única: o Fluxo Futuro, o
// Contas a Pagar e os gráficos do Investor Relations usam todos estas funções.
// ─────────────────────────────────────────────────────────────────────────────

export const CATEGORIA_FUNDING = "Funding bancário";
export const ORIGEM_FUNDING = "Funding bancário";

export const temFunding = (x) => x?.funding === true || x?.funding === "true";

// Percentagem financiada, limitada a 0–100. Sem valor guardado assume-se 100%,
// que é o caso corrente: o banco liberta exatamente o que foi pago.
export function pctFunding(x) {
  if (!temFunding(x)) return 0;
  const p = Number(x?.funding_pct);
  if (!isFinite(p)) return 100;
  return Math.min(100, Math.max(0, p));
}

// Entrada do banco correspondente a uma saída de `valor`
export function valorFunding(fonte, valor) {
  const p = pctFunding(fonte);
  if (!p) return 0;
  return Math.abs(Number(valor) || 0) * p / 100;
}

// Parte que fica mesmo a cargo do projeto
export function valorLiquido(fonte, valor) {
  return Math.abs(Number(valor) || 0) - valorFunding(fonte, valor);
}

export const descFunding = (desc) => `Funding — ${String(desc || "despesa")}`;

// Linha de entrada a acrescentar ao fluxo por causa de uma saída financiada.
// Devolve null quando a despesa não tem funding.
export function linhaFunding(fonte, saida) {
  const valor = valorFunding(fonte, saida?.valor);
  if (!valor) return null;
  return {
    tipo: "entrada",
    desc: descFunding(saida?.desc),
    valor,
    cat: CATEGORIA_FUNDING,
    origem: ORIGEM_FUNDING,
    natureza: saida?.natureza || "previsto",
    funding_de: saida?.desc || "",
    _funding: true,
  };
}

// Mensagem única para quando as colunas ainda não existem na base de dados
export const ERRO_SEM_COLUNAS =
  "As colunas de funding ainda não existem na base de dados.\n\n" +
  "Corre supabase/migracao-v12-funding.sql no SQL Editor do Supabase e volta a tentar.";

export const faltamColunas = (erro) =>
  /funding/i.test((erro?.message || "") + " " + (erro?.details || "") + " " + (erro?.hint || ""));
