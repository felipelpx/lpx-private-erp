// ─────────────────────────────────────────────────────────────────────────────
// REPORT DE CAIXA — os números
//
// Quatro perguntas, por esta ordem:
//
//   1. o que aconteceu na última semana
//   2. como fecha o mês — e quanto disso já está faturado, não é palpite
//   3. os próximos seis meses e o resto do projeto, com o caixa mês a mês
//   4. o que é que isto obriga a decidir
//
// Aqui só se calcula. O desenho dos slides é noutro sítio (reportCaixaPptx),
// e o que entra aqui vem todo do Fluxo Futuro — os MESMOS meses, os mesmos
// lançamentos, o mesmo saldo. Recalcular por outro caminho seria arranjar
// mais uma versão da verdade, que é a avaria que mais vezes voltou neste
// sistema.
// ─────────────────────────────────────────────────────────────────────────────

import { construirMatriz } from "./matriz.js";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const arred2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const abs = (v) => Math.abs(num(v));

const MESES_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
                  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const CURTO = ["jan", "fev", "mar", "abr", "mai", "jun",
               "jul", "ago", "set", "out", "nov", "dez"];

export const mesKey = (iso) => String(iso || "").slice(0, 7);
export const rotuloMesCurto = (key) => {
  const [a, m] = String(key || "").split("-").map(Number);
  return m ? `${CURTO[m - 1]}/${String(a).slice(-2)}` : String(key || "");
};
export const rotuloMesLongo = (key) => {
  const [a, m] = String(key || "").split("-").map(Number);
  return m ? `${MESES_PT[m - 1]} de ${a}` : String(key || "");
};

/** AAAA-MM-DD de há N dias. */
export function hoje7DiasAntes(hojeISO, dias = 7) {
  const d = new Date(`${String(hojeISO).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

// ── O que é FACTO e o que é PALPITE ─────────────────────────────────────────
// Num report de caixa, essa é a distinção que interessa. Uma fatura já
// recebida do fornecedor é um compromisso: a data pode escorregar, o valor
// não. Uma previsão é uma estimativa de quem está a planear.
//
// No Fluxo Futuro a marca já existe — `natureza` —, e aqui só se traduz:
// "real" (faturas, recebíveis, vendas contratadas) é FATURADO; "previsto"
// (previsões manuais, plano de obra, recorrentes) é PREVISTO.
export const ehFaturado = (it) => String(it?.natureza || "previsto") === "real";

const somar = (itens, tipo) => arred2((itens || [])
  .filter(it => it?.tipo === tipo)
  .reduce((s, it) => s + abs(it?.valor), 0));

/**
 * SLIDE 1 — a semana que passou.
 *
 * @param saldoAtual     o que está na conta hoje
 * @param saldoAnterior  o que estava há 7 dias (lido do extrato, não deduzido)
 * @param movimentos     os movimentos do período, do extrato
 *
 * O saldo anterior vem do EXTRATO, não de uma subtração: se os dois não
 * fecharem com os movimentos do meio, há lançamentos por importar — e isso é
 * uma informação, não um erro a esconder.
 */
export function semanaQuePassou({ saldoAtual = 0, saldoAnterior = 0,
                                  movimentos = [], de = "", ate = "" } = {}) {
  const dentro = (movimentos || []).filter(m => {
    const d = String(m?.data || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    if (de && d < de) return false;
    if (ate && d > ate) return false;
    return true;
  });

  const entradas = arred2(dentro.filter(m => num(m.valor) > 0)
    .reduce((s, m) => s + num(m.valor), 0));
  const saidas = arred2(dentro.filter(m => num(m.valor) < 0)
    .reduce((s, m) => s + abs(m.valor), 0));

  // As maiores saídas, que é o que se quer ver num report de uma semana.
  const maiores = dentro.filter(m => num(m.valor) < 0)
    .sort((a, b) => abs(b.valor) - abs(a.valor))
    .slice(0, 6)
    .map(m => ({ data: String(m.data).slice(0, 10),
                 desc: String(m.movimento || m.detalhes || "(sem descrição)").slice(0, 60),
                 rubrica: m.subcategoria || m.categoria || "",
                 valor: abs(m.valor) }));

  const variacao = arred2(num(saldoAtual) - num(saldoAnterior));
  const explicada = arred2(entradas - saidas);
  // Se o extrato não fecha, diz-se quanto falta em vez de se calar.
  const porExplicar = arred2(variacao - explicada);

  return {
    de, ate,
    saldoAnterior: arred2(saldoAnterior), saldoAtual: arred2(saldoAtual),
    entradas, saidas, variacao, explicada, porExplicar,
    fecha: Math.abs(porExplicar) < 0.011,
    nMovimentos: dentro.length,
    maiores,
  };
}

/**
 * SLIDE 2 — como fecha o mês, separando o que já está faturado.
 *
 * @param mes  o mês do Fluxo Futuro: { key, label, items[], saldo_fim }
 * @param saldoAbertura  o caixa com que o mês abre
 */
export function mesCorrente({ mes = null, saldoAbertura = 0 } = {}) {
  const itens = (mes?.items || []).filter(Boolean);
  const faturado = itens.filter(ehFaturado);
  const previsto = itens.filter(it => !ehFaturado(it));

  const bloco = (lista) => ({
    entradas: somar(lista, "entrada"),
    saidas: somar(lista, "saida"),
    liquido: arred2(somar(lista, "entrada") - somar(lista, "saida")),
    n: lista.length,
  });

  const f = bloco(faturado), p = bloco(previsto);
  const total = { entradas: arred2(f.entradas + p.entradas),
                  saidas: arred2(f.saidas + p.saidas),
                  liquido: arred2(f.liquido + p.liquido),
                  n: itens.length };

  // As maiores saídas do mês, com a marca de cada uma: é o que se olha
  // primeiro quando o mês fecha mal.
  const maiores = itens.filter(it => it?.tipo === "saida")
    .sort((a, b) => abs(b.valor) - abs(a.valor))
    .slice(0, 7)
    .map(it => ({ desc: String(it.desc || "").slice(0, 52),
                  rubrica: it.cat || "",
                  valor: abs(it.valor),
                  faturado: ehFaturado(it) }));

  return {
    key: mes?.key || "", rotulo: rotuloMesLongo(mes?.key),
    saldoAbertura: arred2(saldoAbertura),
    faturado: f, previsto: p, total,
    saldoFim: arred2(num(saldoAbertura) + total.liquido),
    // Quanto do que falta sair já é compromisso firme. Um mês que fecha mal
    // com 90% faturado é outra conversa de um que fecha mal com 90% previsto.
    pesoFaturado: total.saidas > 0.005 ? arred2(f.saidas / total.saidas * 100) : 0,
    maiores,
  };
}

/**
 * SLIDE 3 — os próximos N meses e o resto do fluxo.
 *
 * @param meses   os meses do Fluxo Futuro, por ordem
 * @param saldoInicial  o caixa de hoje (o mesmo da matriz)
 * @param n       quantos meses detalhar
 */
export function proximosMeses({ meses = [], saldoInicial = 0, n = 6 } = {}) {
  const lista = (meses || []).filter(Boolean);
  let caixa = arred2(saldoInicial);
  const todos = lista.map(m => {
    const entradas = somar(m.items, "entrada");
    const saidas = somar(m.items, "saida");
    const liquido = arred2(entradas - saidas);
    caixa = arred2(caixa + liquido);
    return { key: m.key, rotulo: rotuloMesCurto(m.key),
             entradas, saidas, liquido, caixa };
  });

  const detalhe = todos.slice(0, Math.max(1, n));
  const resto = todos.slice(detalhe.length);

  const soma = (arr, campo) => arred2(arr.reduce((s, x) => s + x[campo], 0));

  // O mês em que o caixa fica negativo — a pergunta que um report de caixa
  // existe para responder.
  const primeiroNegativo = todos.find(m => m.caixa < -0.005) || null;
  const pior = todos.length
    ? todos.reduce((a, b) => (b.caixa < a.caixa ? b : a))
    : null;

  return {
    saldoInicial: arred2(saldoInicial),
    detalhe, nDetalhe: detalhe.length,
    resto: {
      nMeses: resto.length,
      entradas: soma(resto, "entradas"),
      saidas: soma(resto, "saidas"),
      liquido: soma(resto, "liquido"),
    },
    projeto: {
      nMeses: todos.length,
      entradas: soma(todos, "entradas"),
      saidas: soma(todos, "saidas"),
      liquido: soma(todos, "liquido"),
      caixaFim: todos.length ? todos[todos.length - 1].caixa : arred2(saldoInicial),
    },
    primeiroNegativo, pior,
    todos,
  };
}

/**
 * SLIDE 4 — o que isto obriga a decidir.
 *
 * Tudo o que sai daqui é DERIVADO dos números acima. Nenhuma frase é escrita
 * à mão sobre o projeto: um report que inventa conclusões é pior do que um
 * report sem conclusões nenhumas.
 */
export function conclusoes({ semana = null, mes = null, futuro = null,
                             vencido = 0, saldoAtual = 0 } = {}) {
  const out = [];
  // À portuguesa, com PONTO nos milhares — a mesma composição dos slides. O
  // Intl do browser usa um espaço estreito que, impresso, parece um erro.
  const eur = (v) => {
    const n = Math.round(num(v));
    const neg = n < 0;
    return (neg ? "−" : "")
      + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " €";
  };

  // 1. O caixa chega?
  if (futuro?.primeiroNegativo) {
    const m = futuro.primeiroNegativo;
    const p = futuro.pior;
    out.push({
      grau: "critico",
      titulo: `Caixa negativo a partir de ${m.rotulo}`,
      texto: `Ao ritmo previsto, o caixa passa a negativo em ${m.rotulo} `
           + `(${eur(m.caixa)})`
           + (p && p.key !== m.key ? `, com o pior ponto em ${p.rotulo} (${eur(p.caixa)}).` : ".")
           + ` É preciso reforço de tesouraria, libertação de funding ou adiamento de pagamentos antes dessa data.`,
    });
  } else if (futuro?.pior) {
    out.push({
      grau: "ok",
      titulo: "O caixa aguenta o horizonte projetado",
      texto: `O ponto mais baixo é ${eur(futuro.pior.caixa)} em ${futuro.pior.rotulo}. `
           + `Não há mês com caixa negativo no fluxo projetado.`,
    });
  }

  // 2. O que já está vencido
  if (abs(vencido) > 0.005) {
    const peso = num(saldoAtual) > 0.005
      ? ` — ${Math.round(abs(vencido) / num(saldoAtual) * 100)}% do caixa de hoje` : "";
    out.push({
      grau: abs(vencido) > abs(saldoAtual) ? "critico" : "atencao",
      titulo: `${eur(abs(vencido))} já vencido por pagar`,
      texto: `Há ${eur(abs(vencido))} com data de vencimento já passada${peso}. `
           + `Vale a pena separar o que é dívida mesmo do que são previsões antigas `
           + `por limpar: as segundas inflam o número sem corresponderem a compromisso nenhum.`,
    });
  }

  // 3. Quanto do mês é compromisso firme
  if (mes && mes.total.saidas > 0.005) {
    const firme = mes.pesoFaturado;
    out.push({
      grau: firme >= 70 ? "atencao" : "info",
      titulo: `${Math.round(firme)}% das saídas do mês já estão faturadas`,
      texto: `Das ${eur(mes.total.saidas)} a sair em ${mes.rotulo}, `
           + `${eur(mes.faturado.saidas)} vêm de faturas e compromissos firmes e `
           + `${eur(mes.previsto.saidas)} são previsão. `
           + (firme >= 70
              ? "A margem para adiar é pequena — quase tudo já está contratado."
              : "Há margem para reprogramar, porque boa parte ainda é estimativa."),
    });
  }

  // 4. A semana que passou, quando o extrato não fecha
  if (semana && !semana.fecha) {
    out.push({
      grau: "atencao",
      titulo: "O extrato da semana não fecha",
      texto: `A variação do saldo (${eur(semana.variacao)}) não bate com os movimentos `
           + `importados (${eur(semana.explicada)}): faltam ${eur(semana.porExplicar)} por explicar. `
           + `Provavelmente há extrato por importar.`,
    });
  }

  // 5. Concentração: uma rubrica que manda no mês
  if (mes?.maiores?.length) {
    const porRubrica = new Map();
    mes.maiores.forEach(x => {
      const k = x.rubrica || "(sem rubrica)";
      porRubrica.set(k, arred2((porRubrica.get(k) || 0) + x.valor));
    });
    const [top, valor] = [...porRubrica.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    if (top && mes.total.saidas > 0.005) {
      const pc = Math.round(valor / mes.total.saidas * 100);
      if (pc >= 40) out.push({
        grau: "info",
        titulo: `${top} é ${pc}% das saídas do mês`,
        texto: `${eur(valor)} de ${eur(mes.total.saidas)}. `
             + `Um atraso ou uma renegociação nesta rubrica muda o mês inteiro.`,
      });
    }
  }

  // 6. O resto do projeto
  if (futuro?.resto?.nMeses > 0) {
    out.push({
      grau: "info",
      titulo: `Depois destes ${futuro.nDetalhe} meses faltam mais ${futuro.resto.nMeses}`,
      texto: `Nesses, entram ${eur(futuro.resto.entradas)} e saem ${eur(futuro.resto.saidas)}, `
           + `com o caixa a fechar em ${eur(futuro.projeto.caixaFim)}.`,
    });
  }

  return out;
}

/** Tudo junto, que é o que o botão do ecrã chama. */
export function construirReportCaixa({
  nomeEmpresa = "", hoje = new Date().toISOString().slice(0, 10),
  saldoAtual = 0, saldoAnterior = 0, movimentos = [],
  meses = [], vencido = 0, dias = 7, nMeses = 6,
  // Em que rubrica cai cada lançamento. É a MESMA função que o Fluxo Futuro
  // usa para desenhar a matriz — por isso o slide sai com as mesmas linhas
  // que estão no ecrã, e não com uma arrumação paralela.
  rubricaDoItem = null,
} = {}) {
  const de = hoje7DiasAntes(hoje, dias);
  const semana = semanaQuePassou({ saldoAtual, saldoAnterior, movimentos, de, ate: hoje });

  // O caixa de onde o futuro parte: o de hoje menos o que já está vencido —
  // o mesmo ponto de partida da linha "Caixa acumulado" da matriz.
  const saldoInicial = arred2(num(saldoAtual) - num(vencido));

  const mesAtual = (meses || []).find(m => m.key === mesKey(hoje)) || (meses || [])[0] || null;
  const mes = mesCorrente({ mes: mesAtual, saldoAbertura: saldoInicial });
  const futuro = proximosMeses({ meses, saldoInicial, n: nMeses });

  // A matriz do Fluxo Futuro, com a janela do report. O slide dos próximos
  // meses é esta grelha: despesas em linha, meses em coluna, as três secções
  // (receitas, custos, funding) e o caixa acumulado em baixo.
  const matriz = construirMatriz({
    meses, maxMeses: nMeses, saldoInicial,
    ...(typeof rubricaDoItem === "function" ? { rubricaDoItem } : {}),
  });

  return {
    nomeEmpresa, hoje, dias, nMeses,
    saldoAtual: arred2(saldoAtual), vencido: arred2(vencido), saldoInicial,
    semana, mes, futuro, matriz,
    conclusoes: conclusoes({ semana, mes, futuro, vencido, saldoAtual }),
  };
}

export default construirReportCaixa;
