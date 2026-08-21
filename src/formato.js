// ─────────────────────────────────────────────────────────────────────────────
// FORMATAÇÃO DE NÚMEROS — padrão único de todo o ERP
//
//   Milhares com PONTO · decimais com VÍRGULA · sem espaços dentro do número
//   1234567.89  →  "1.234.567,89 €"
//
// Porquê um módulo próprio: o locale "pt-PT" do browser usa um espaço estreito
// (U+202F) como separador de milhares — dava "24 472,62 €". Aqui o agrupamento
// é normalizado para ponto, de forma determinística e igual em todo o lado.
//
// USAR SEMPRE ESTAS FUNÇÕES. Não chamar toLocaleString nem Intl.NumberFormat
// diretamente nos componentes, senão a formatação volta a divergir.
// ─────────────────────────────────────────────────────────────────────────────

// Formata a parte numérica, sem símbolo de moeda.
export function fmtNum(valor, decimais = 2) {
  const n = Number(valor);
  if (!isFinite(n)) return decimais > 0 ? "0," + "0".repeat(decimais) : "0";

  const negativo = n < 0;
  const fixo = Math.abs(n).toFixed(decimais);
  const [inteira, decimal] = fixo.split(".");

  // Agrupa a parte inteira de 3 em 3 com ponto
  const agrupada = inteira.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return (negativo ? "-" : "") + agrupada + (decimal ? "," + decimal : "");
}

// Valor monetário: "1.234.567,89 €"
export const fmtEUR = (valor, decimais = 2) => fmtNum(valor, decimais) + " €";

// Valor monetário sem cêntimos: "1.234.568 €"
export const fmtEUR0 = (valor) => fmtNum(valor, 0) + " €";

// Inteiro (contagens): "1.531"
export const fmtInt = (valor) => fmtNum(valor, 0);

// Percentagem: "12,5%"
export const fmtPct = (valor, decimais = 2) => fmtNum(valor, decimais) + "%";

// Percentagem com sinal explícito: "+12,5%" / "-3,2%"
export const fmtPctSinal = (valor, decimais = 2) =>
  (Number(valor) >= 0 ? "+" : "") + fmtNum(valor, decimais) + "%";

// Área: "82,60 m²"
export const fmtArea = (valor, decimais = 2) => fmtNum(valor, decimais) + " m²";

// Compacto para gráficos e cartões: "1,2M €" / "24k €"
export function fmtCompacto(valor) {
  const n = Number(valor) || 0;
  const abs = Math.abs(n);
  const sinal = n < 0 ? "-" : "";
  if (abs >= 1e6) return sinal + fmtNum(abs / 1e6, 2) + "M €";
  if (abs >= 1e3) return sinal + fmtNum(abs / 1e3, 0) + "k €";
  return sinal + fmtNum(abs, 0) + " €";
}

// Tamanho de ficheiro: "1,4 MB" / "320 KB"
export function fmtTamanho(bytes) {
  const b = Number(bytes) || 0;
  if (b >= 1048576) return fmtNum(b / 1048576, 1) + " MB";
  if (b >= 1024) return fmtNum(b / 1024, 0) + " KB";
  return fmtNum(b, 0) + " B";
}

// ─── Datas ───────────────────────────────────────────────────────────────────

// "2026-08-19" → "19/08/2026"
export function fmtData(iso) {
  if (!iso) return "";
  const base = String(iso).split("T")[0];
  const [a, m, d] = base.split("-");
  return d && m && a ? `${d}/${m}/${a}` : base;
}

// "2026-08-19" → "19/08"
export function fmtDataCurta(iso) {
  if (!iso) return "";
  const [, m, d] = String(iso).split("T")[0].split("-");
  return d && m ? `${d}/${m}` : "";
}

// Data e hora: "19/08/2026 14:30"
export function fmtDataHora(valor) {
  if (!valor) return "";
  const d = valor instanceof Date ? valor : new Date(valor);
  if (isNaN(d)) return "";
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default { fmtNum, fmtEUR, fmtEUR0, fmtInt, fmtPct, fmtPctSinal, fmtArea, fmtCompacto, fmtTamanho, fmtData, fmtDataCurta, fmtDataHora };
