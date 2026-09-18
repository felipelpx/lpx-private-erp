// Estados de uma fatura no Contas a Pagar.
// Fonte única: o formulário, os filtros, o Fluxo Futuro e o BI leem daqui.
export const STATUS_FATURA = [
  "Pagamento bloqueado",
  "Pendente atrasado",
  "Pendente em dia",
  "Lançado no banco",
  "Pago",
];

// Estados usados antes desta lista. Continuam a aparecer nas faturas antigas —
// traduzem-se para o equivalente novo em vez de se perderem.
const LEGADO = {
  "Pendente": "Pendente em dia",
  "Aprovada": "Pendente em dia",
  "Vencida": "Pendente atrasado",
  "Paga": "Pago",
  "Em disputa": "Pagamento bloqueado",
  "Rejeitada": "Pagamento bloqueado",
};

export const STATUS_STYLES = {
  "Pagamento bloqueado": { bg: "#fdf4ff", text: "#9333ea", border: "#e9d5ff" },
  "Pendente atrasado":   { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
  "Pendente em dia":     { bg: "#fffbeb", text: "#d97706", border: "#fde68a" },
  "Lançado no banco":    { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe" },
  "Pago":                { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
};

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Estado a mostrar: traduz o legado e marca como atrasado o que passou da data.
// A fatura guardada não é alterada — só a leitura.
export function statusFatura(f) {
  if (!f) return "Pendente em dia";
  const bruto = f.status || "";
  const s = STATUS_FATURA.includes(bruto) ? bruto : (LEGADO[bruto] || "Pendente em dia");
  if (s === "Pendente em dia") {
    const venc = f.previsao_pagamento || f.vencimento;
    if (venc && String(venc).slice(0, 10) < hojeISO()) return "Pendente atrasado";
  }
  return s;
}

export const faturaPaga = (f) => statusFatura(f) === "Pago";

// Em aberto = ainda sai dinheiro por ela (inclui bloqueadas e já lançadas no banco)
export const faturaEmAberto = (f) => !faturaPaga(f);

export const faturaAtrasada = (f) => statusFatura(f) === "Pendente atrasado";

export const faturaBloqueada = (f) => statusFatura(f) === "Pagamento bloqueado";
