// ─────────────────────────────────────────────────────────────────────────────
// CRONOGRAMA VIVO
//
// O cronograma deixou de ser uma lista escrita à mão. Os marcos saem de onde
// a verdade já está:
//
//   OBRA            do plano de obra (datas de início e fim) e do que já foi
//                   gasto — a barra fica em risco quando a execução está
//                   atrás do tempo que já passou, não por alguém o ter dito.
//   COMERCIALIZAÇÃO das frações e das vendas: quantas estão colocadas e
//                   quando foram.
//   ESCRITURAS      do mesmo sítio de onde o fluxo as tira: o fim da obra
//                   mais os meses até à escritura que o plano define.
//
// O que não se consegue derivar — a aquisição e o licenciamento, que são
// anteriores ao sistema — continua a vir de src/cronogramas.js, tal como foi
// escrito a partir dos business plans. Esses marcos passam por aqui
// intactos.
//
// Assim, mudar o prazo da obra muda o cronograma, o fluxo e o Real × Orçado
// ao mesmo tempo. Era o que faltava: a timeline era a única coisa no ecrã que
// ainda discordava do resto.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const mes = (d) => {
  const s = String(d || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : "";
};
const mesesEntreInc = (a, b) => {
  if (!a || !b) return 0;
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
};
const somarMeses = (m, n) => {
  if (!m) return "";
  const [y, mm] = m.split("-").map(Number);
  const total = (y * 12 + (mm - 1)) + Math.round(num(n));
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
};

// Quanto do caminho já foi feito, entre 0 e 1. Serve para comparar o avanço
// da obra com o avanço do calendário.
const fracaoDoCaminho = (inicio, fim, hoje) => {
  const total = mesesEntreInc(inicio, fim);
  if (total <= 0) return hoje >= inicio ? 1 : 0;
  const feito = mesesEntreInc(inicio, hoje);
  return Math.min(1, Math.max(0, feito / total));
};

// Uma obra está "em risco" quando a execução está este tanto atrás do tempo.
// 15 pontos percentuais: menos do que isso é ruído de faturação, mais do que
// isso é um atraso que alguém tem de explicar numa reunião.
const MARGEM_DE_RISCO = 0.15;

const VENDIDA = /^(cpcv|escriturada|reservada)$/i;
const ESCRITURADA = /^escriturada$/i;

/**
 * Constrói os marcos do projeto a partir dos dados vivos.
 *
 * @param base        o cronograma escrito à mão (src/cronogramas.js), se houver
 * @param plano       a linha de `obra_planos` desta empresa
 * @param incorrido   o que já foi gasto em obra, com IVA (obraRealizada().jaIncorrido)
 * @param fracoes     as frações do projeto
 * @param vendas      as vendas do projeto
 * @param hoje        data de referência, injetável para os testes
 */
export function cronogramaVivo({ base = null, plano = null, incorrido = 0,
                                 fracoes = [], vendas = [],
                                 projeto = "", hoje = new Date().toISOString().slice(0, 10) } = {}) {
  const hm = mes(hoje);
  const marcos = [];
  const origens = [];

  // ── O que vem de trás: aquisição, licenciamento, demolições ──────────────
  // Tudo o que não seja obra, comercialização ou escrituras passa intacto.
  const herdados = (base?.marcos || []).filter(
    m => !/obra|comercializa|escritura/i.test(String(m?.fase || "")));
  marcos.push(...herdados);
  if (herdados.length) origens.push("business plan");

  // ── A obra ───────────────────────────────────────────────────────────────
  const inicioObra = mes(plano?.data_inicio);
  const fimObra = mes(plano?.data_fim);
  const budgetComIva = num(plano?.budget_obra) * (1 + num(plano?.taxa_iva_obra) / 100);
  const execucao = budgetComIva > 0.005
    ? Math.min(1, Math.max(0, num(incorrido) / budgetComIva)) : null;

  if (inicioObra && fimObra) {
    const doCalendario = fracaoDoCaminho(inicioObra, fimObra, hm);
    let estado;
    if (execucao !== null && execucao >= 0.995) estado = "concluido";
    else if (hm < inicioObra) estado = "previsto";
    else if (hm > fimObra) estado = "risco";
    else if (execucao !== null && execucao < doCalendario - MARGEM_DE_RISCO) estado = "risco";
    else estado = "curso";

    const pct = (v) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
    const nota = execucao === null
      ? "Sem budget no plano de obra — não dá para medir a execução"
      : estado === "concluido"
        ? `Execução ${pct(execucao)} do budget com IVA`
        : `Execução ${pct(execucao)} contra ${pct(doCalendario)} de calendário` +
          (estado === "risco" && hm > fimObra ? " — prazo ultrapassado" : "");

    marcos.push({
      fase: plano?.empreiteiro ? `Obra (${plano.empreiteiro})` : "Obra",
      inicio: inicioObra, fim: fimObra, estado, nota,
    });
    origens.push("plano de obra");
  } else {
    // Sem plano, fica o que estava escrito — melhor do que uma linha vazia.
    marcos.push(...(base?.marcos || []).filter(m => /obra/i.test(String(m?.fase || ""))));
  }

  // ── A comercialização ────────────────────────────────────────────────────
  const minhas = (fracoes || []).filter(f => !projeto || f?.projeto === projeto);
  const minhasVendas = (vendas || []).filter(v => !projeto || v?.projeto === projeto);
  if (minhas.length) {
    const colocadas = minhas.filter(f => VENDIDA.test(String(f?.status || "").trim()));
    const datas = minhasVendas
      .map(v => mes(v?.data_cpcv || v?.data))
      .filter(Boolean).sort();
    const baseCom = (base?.marcos || []).find(m => /comercializa/i.test(String(m?.fase || "")));
    const inicio = datas[0] || mes(baseCom?.inicio) || inicioObra;
    const fim = colocadas.length === minhas.length
      ? (datas[datas.length - 1] || mes(baseCom?.fim) || inicio)
      : (fimObra || mes(baseCom?.fim) || inicio);

    if (inicio) {
      marcos.push({
        fase: "Comercialização", inicio, fim,
        estado: colocadas.length === minhas.length ? "concluido"
              : colocadas.length > 0 ? "curso" : "previsto",
        nota: `${colocadas.length} de ${minhas.length} ` +
              `${minhas.length === 1 ? "fração colocada" : "frações colocadas"}`,
      });
      origens.push("tabela de vendas");
    }
  } else {
    marcos.push(...(base?.marcos || []).filter(m => /comercializa/i.test(String(m?.fase || ""))));
  }

  // ── As escrituras ────────────────────────────────────────────────────────
  // A mesma regra do fluxo: o fim da obra mais os meses que o plano define.
  const mesEscritura = fimObra ? somarMeses(fimObra, num(plano?.meses_ate_escritura)) : "";
  const previstas = minhasVendas.map(v => mes(v?.previsao_escritura)).filter(Boolean).sort();
  const baseEsc = (base?.marcos || []).find(m => /escritura/i.test(String(m?.fase || "")));
  const inicioEsc = mesEscritura || previstas[0] || mes(baseEsc?.inicio);
  if (inicioEsc) {
    const feitas = minhas.filter(f => ESCRITURADA.test(String(f?.status || "").trim()));
    const fimEsc = [mesEscritura, previstas[previstas.length - 1], mes(baseEsc?.fim)]
      .filter(Boolean).sort().pop();
    marcos.push({
      fase: "Escrituras", inicio: inicioEsc, fim: fimEsc !== inicioEsc ? fimEsc : undefined,
      estado: minhas.length && feitas.length === minhas.length ? "concluido"
            : feitas.length > 0 ? "curso" : "previsto",
      nota: mesEscritura
        ? `${num(plano?.meses_ate_escritura)} ${num(plano?.meses_ate_escritura) === 1 ? "mês" : "meses"} ` +
          `após o fim da obra, como no plano` +
          (feitas.length ? ` · ${feitas.length} já escrituradas` : "")
        : "Previsão das vendas",
    });
    if (mesEscritura) origens.push("plano de obra");
  }

  marcos.sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));

  return {
    projeto: base?.projeto || projeto || "",
    marcos,
    // De onde veio isto, para o ecrã poder dizê-lo em vez de o utilizador
    // ter de adivinhar se está a ver dados vivos ou uma lista antiga.
    origens: [...new Set(origens)],
    vivo: origens.some(o => o !== "business plan"),
  };
}

export default cronogramaVivo;
