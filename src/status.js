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
  "Pagamento bloqueado": { bg: "#fdf4ff", text: "#5A4A7A", border: "#e9d5ff" },
  "Pendente atrasado":   { bg: "#FBEDEB", text: "#A93226", border: "#EFCFC9" },
  "Pendente em dia":     { bg: "#FBF6EC", text: "#A8762F", border: "#E3CE9F" },
  "Lançado no banco":    { bg: "#EDF1F5", text: "#1F3A52", border: "#CBDAE5" },
  "Pago":                { bg: "#EFF5F1", text: "#1F7A54", border: "#C9E3D5" },
};

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Estado a mostrar: traduz o legado e marca como atrasado o que passou da data.
// A fatura guardada não é alterada — só a leitura.
// Normaliza para comparar: sem espaços extra, sem acentos, minúsculas.
// Protege contra "PAGO", "pago ", "Pagas" e variantes vindas de importações.
const chave = (t) => String(t || "")
  .trim()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const POR_CHAVE = {};
STATUS_FATURA.forEach(s => { POR_CHAVE[chave(s)] = s; });
Object.entries(LEGADO).forEach(([antigo, novo]) => { POR_CHAVE[chave(antigo)] = novo; });
// Variantes soltas que aparecem em ficheiros importados
Object.assign(POR_CHAVE, {
  "pagas": "Pago", "pagos": "Pago", "liquidado": "Pago", "liquidada": "Pago",
  "pendentes": "Pendente em dia", "por pagar": "Pendente em dia",
  "cancelado": "Pagamento bloqueado", "cancelada": "Pagamento bloqueado",
});

export function statusFatura(f) {
  if (!f) return "Pendente em dia";
  const s = POR_CHAVE[chave(f.status)] || "Pendente em dia";
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
