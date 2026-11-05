// ─────────────────────────────────────────────────────────────────────────────
// REPORT DE CAIXA — os slides
//
// A grelha, as cores e os tipos de letra vêm do 7M_Report: título em Georgia
// 28 no canto superior esquerdo, o traço dourado por baixo, as duas réguas a
// fechar a página, "lpxprivate.com" em baixo à esquerda e o número à direita.
// As medidas foram lidas do próprio ficheiro, não estimadas de olho.
//
// Os números vêm todos de src/reportCaixa.js. Aqui não se calcula nada: se
// este ficheiro fizesse uma conta, passaria a haver duas versões dela.
// ─────────────────────────────────────────────────────────────────────────────

import { construirPptx, texto, caixa, regua, tabela, par, imagem } from "./pptx.js";
import { logoPngBytes, LOGO_LARGURA, LOGO_ALTURA } from "./logoPng.js";
import { rotuloMesCurto, repartirPorNatureza } from "./reportCaixa.js";

// ─── O sistema do deck ──────────────────────────────────────────────────────
const C = {
  tinta:    "14212B",   // navy dos títulos e dos números que contam
  texto:    "1A1A1A",
  suave:    "8C8275",   // cinzento quente das legendas
  ouro:     "B3A082",   // o traço por baixo do título
  ouroEsc:  "8C6E43",   // rótulos dos cartões
  reguaTop: "D9CFC0",
  reguaBot: "C7BBA8",
  cartao:   "FBF6EF",
  cartaoLn: "D8CCB8",
  cabTab:   "F2E8D8",
  zebra:    "F6ECDF",
  verde:    "1F7A54",
  vermelho: "A93226",
  alerta:   "E3CE9F",
};
const G = "Georgia", K = "Calibri";

const LARG = 13.333, ALT = 7.5;
const X0 = 0.70, X1 = 12.63;          // margens, como no deck
const LARGURA = X1 - X0;              // 11.93

const n2 = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// À portuguesa, com PONTO nos milhares — como o deck de referência e como o
// resto do ERP. O Intl do browser usa um espaço estreito que, impresso, fica
// a parecer um erro de composição.
function eur(v, casas = 2) {
  const n = n2(v);
  const neg = n < 0;
  const fixo = Math.abs(n).toFixed(casas);
  const [inteiro, dec] = fixo.split(".");
  const comPontos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "−" : ""}${comPontos}${dec ? "," + dec : ""} €`;
}
const eur0 = (v) => eur(v, 0);
const sinal = (v) => (n2(v) >= 0 ? C.verde : C.vermelho);

/** O cabeçalho e o rodapé, iguais em todos os slides. */
function moldura(titulo, subtitulo, numero) {
  return [
    texto(X0, 0.42, 9.4, 0.6, par([{ t: titulo, sz: 28, cor: C.tinta, fonte: G }])),
    caixa(0.72, 1.12, 0.26, 0.12, { fill: C.ouro }),
    texto(1.06, 1.00, 6.0, 0.32, par([{ t: subtitulo, sz: 12, cor: C.suave, fonte: K }])),
    regua(X0, 1.44, LARGURA, C.reguaTop),
    regua(X0, 6.95, LARGURA, C.reguaBot),
    texto(X0, 7.00, 3.0, 0.3, par([{ t: "lpxprivate.com", sz: 9, cor: C.suave, fonte: K }])),
    texto(11.43, 7.00, 1.2, 0.3,
          par([{ t: `${String(numero).padStart(2, "0")}.`, sz: 9, cor: C.suave, fonte: K }],
              { align: "r" })),
    // O logótipo, no canto superior direito — onde o 7M_Report o tem.
    imagem(X1 - LOGO_CX, 0.40, LOGO_CX, LOGO_CY),
  ];
}

// 1,95 polegadas de largura, com a proporção do PNG. Pô-lo com uma proporção
// à sorte esticava o leão, que é a única coisa pior do que não ter logótipo.
const LOGO_CX = 1.95;
const LOGO_CY = Math.round(LOGO_CX * (LOGO_ALTURA / LOGO_LARGURA) * 1000) / 1000;

/** Um cartão com rótulo em cima e número grande por baixo. */
function cartao(x, y, cx, cy, rotulo, valor, { cor = C.tinta, nota = null, szValor = 24 } = {}) {
  const paras = [
    par([{ t: rotulo.toUpperCase(), sz: 9.5, b: true, cor: C.ouroEsc, fonte: K, esp: 1.2 }]),
    par([{ t: valor, sz: szValor, b: true, cor, fonte: G }], { espacoAntes: 6 }),
  ];
  if (nota) paras.push(par([{ t: nota, sz: 9.5, cor: C.suave, fonte: K }], { espacoAntes: 4 }));
  return caixa(x, y, cx, cy, { fill: C.cartao, linha: C.cartaoLn, raio: 0.05,
                               paras, opts: { anchor: "ctr", margem: 0.18 } });
}

const cabTab = (ts) => ({
  altura: 0.32,
  celulas: ts.map(([t, align]) => ({ t, b: true, sz: 9.5, cor: C.tinta,
                                     fonte: K, align: align || "l", fill: C.cabTab })),
});
const linhaTab = (ts, { zebra = false, forte = false, altura = 0.30 } = {}) => ({
  altura,
  celulas: ts.map(c => ({
    t: c.t, align: c.align || "l", sz: c.sz ?? 9.5, b: forte || c.b,
    cor: c.cor || (forte ? C.tinta : C.texto), fonte: K,
    fill: c.fill || (zebra ? C.zebra : null),
  })),
});

// ═══ SLIDE 1 — a semana que passou ══════════════════════════════════════════
function slideSemana(r, sub) {
  const s = r.semana;
  const pp = r.porPagar || { n: 0, total: 0, estados: [], maiores: [] };
  const f = [...moldura("Caixa — Últimos 7 Dias", sub, 1)];

  const cx = 3.84, gap = 0.21;
  f.push(cartao(X0, 1.66, cx, 1.40, `Caixa a ${s.de.slice(8, 10)}/${s.de.slice(5, 7)}`,
                eur(s.saldoAnterior), { nota: "saldo lido do extrato", szValor: 21 }));
  f.push(cartao(X0 + cx + gap, 1.66, cx, 1.40, "Saiu nestes 7 dias",
                eur(s.saidas), { cor: C.vermelho, szValor: 21,
                nota: s.entradas > 0.005 ? `entraram ${eur(s.entradas)}` : "sem entradas no período" }));
  f.push(cartao(X0 + 2 * (cx + gap), 1.66, cx, 1.40, "Caixa hoje",
                eur(s.saldoAtual), { cor: sinal(s.saldoAtual), szValor: 21,
                nota: `variação de ${eur(s.variacao)}` }));

  let y = 3.22;
  if (!s.fecha) {
    f.push(caixa(X0, y, LARGURA, 0.40, { fill: "FBF6EC", linha: C.alerta, raio: 0.04,
      paras: par([
        { t: "Atenção: ", sz: 9.5, b: true, cor: C.vermelho, fonte: K },
        { t: `a variação do saldo não bate com os movimentos importados — faltam `
           + `${eur(s.porExplicar)} por explicar. Provavelmente há extrato por importar.`,
          sz: 9.5, cor: "7A5A22", fonte: K },
      ]), opts: { anchor: "ctr", margem: 0.14 } }));
    y += 0.52;
  }

  // ── Duas colunas: o que saiu, e o que está à espera de sair ─────────────
  const colL = 5.82, colR = LARGURA - colL - 0.29;
  const xR = X0 + colL + 0.29;

  f.push(texto(X0, y, colL, 0.3,
         par([{ t: "Maiores saídas da semana", sz: 12.5, b: true, cor: C.tinta, fonte: G }])));
  f.push(texto(xR, y, colR, 0.3,
         par([{ t: "Faturas por pagar", sz: 12.5, b: true, cor: C.tinta, fonte: G }])));
  const yT = y + 0.38;

  // Esquerda: o extrato da semana.
  if (s.maiores.length) {
    const l = [{ altura: 0.26, celulas: [
      { t: "Data", b: true, sz: 8.5, cor: C.tinta, fonte: K, fill: C.cabTab },
      { t: "Movimento", b: true, sz: 8.5, cor: C.tinta, fonte: K, fill: C.cabTab },
      { t: "Valor", b: true, sz: 8.5, cor: C.tinta, fonte: K, align: "r", fill: C.cabTab },
    ]}];
    s.maiores.slice(0, 5).forEach((m, i) => l.push({ altura: 0.24, celulas: [
      { t: `${m.data.slice(8, 10)}/${m.data.slice(5, 7)}`, sz: 8.5, cor: C.suave, fonte: K,
        fill: i % 2 ? C.zebra : null },
      { t: m.desc.slice(0, 38), sz: 8.5, cor: C.texto, fonte: K, fill: i % 2 ? C.zebra : null },
      { t: eur(m.valor), sz: 8.5, b: true, cor: C.vermelho, fonte: K, align: "r",
        fill: i % 2 ? C.zebra : null },
    ]}));
    l.push({ altura: 0.27, celulas: [
      { t: `${s.nMovimentos} mov.`, b: true, sz: 8.5, cor: C.tinta, fonte: K },
      { t: "total das saídas", sz: 8.5, cor: C.suave, fonte: K, align: "r" },
      { t: eur(s.saidas), b: true, sz: 8.5, cor: C.tinta, fonte: K, align: "r" },
    ]});
    f.push(tabela(X0, yT, [0.76, 3.3, 1.76], l));
  } else {
    f.push(texto(X0, yT, colL, 0.4,
           par([{ t: "Sem saídas registadas no período.", sz: 10, cor: C.suave, fonte: K }])));
  }

  // Direita: o Contas a Pagar em aberto, por estado e depois as maiores.
  if (pp.n > 0) {
    const COR_ESTADO = (e) => /bloquead/i.test(e) ? C.vermelho
                            : /atrasad/i.test(e) ? "A8762F" : C.texto;
    const l = [{ altura: 0.26, celulas: [
      { t: "Estado", b: true, sz: 8.5, cor: C.tinta, fonte: K, fill: C.cabTab },
      { t: "N.º", b: true, sz: 8.5, cor: C.tinta, fonte: K, align: "r", fill: C.cabTab },
      { t: "Valor", b: true, sz: 8.5, cor: C.tinta, fonte: K, align: "r", fill: C.cabTab },
    ]}];
    pp.estados.slice(0, 3).forEach((e, i) => l.push({ altura: 0.24, celulas: [
      { t: e.estado, sz: 8.5, b: /bloquead|atrasad/i.test(e.estado), cor: COR_ESTADO(e.estado),
        fonte: K, fill: i % 2 ? C.zebra : null },
      { t: String(e.n), sz: 8.5, cor: C.suave, fonte: K, align: "r", fill: i % 2 ? C.zebra : null },
      { t: eur(e.valor), sz: 8.5, b: true, cor: COR_ESTADO(e.estado), fonte: K, align: "r",
        fill: i % 2 ? C.zebra : null },
    ]}));
    l.push({ altura: 0.27, celulas: [
      { t: "Total por pagar", b: true, sz: 8.5, cor: C.tinta, fonte: K },
      { t: String(pp.n), b: true, sz: 8.5, cor: C.tinta, fonte: K, align: "r" },
      { t: eur(pp.total), b: true, sz: 8.5, cor: C.tinta, fonte: K, align: "r" },
    ]});
    f.push(tabela(xR, yT, [2.9, 0.7, 2.22], l));

    // As maiores, com fornecedor e vencimento — é por aqui que se decide.
    const yM = yT + 0.26 + pp.estados.slice(0, 3).length * 0.24 + 0.27 + 0.16;
    const quantas = Math.max(0, Math.min(4, Math.floor((6.78 - yM - 0.26) / 0.24)));
    if (quantas > 0) {
      const l2 = [{ altura: 0.26, celulas: [
        { t: "Maiores em aberto", b: true, sz: 8.5, cor: C.tinta, fonte: K, fill: C.cabTab },
        { t: "Vence", b: true, sz: 8.5, cor: C.tinta, fonte: K, align: "r", fill: C.cabTab },
        { t: "Valor", b: true, sz: 8.5, cor: C.tinta, fonte: K, align: "r", fill: C.cabTab },
      ]}];
      pp.maiores.slice(0, quantas).forEach((x, i) => l2.push({ altura: 0.24, celulas: [
        { t: (x.bloqueada ? "B· " : x.atrasada ? "!  " : "") + x.fornecedor.slice(0, 29),
          sz: 8.5, cor: C.texto, fonte: K, fill: i % 2 ? C.zebra : null },
        { t: x.vencimento ? `${x.vencimento.slice(8, 10)}/${x.vencimento.slice(5, 7)}` : "—",
          sz: 8.5, cor: x.atrasada || x.bloqueada ? C.vermelho : C.suave, fonte: K,
          align: "r", fill: i % 2 ? C.zebra : null },
        { t: eur(x.valor), sz: 8.5, b: true, cor: C.vermelho, fonte: K, align: "r",
          fill: i % 2 ? C.zebra : null },
      ]}));
      f.push(tabela(xR, yM, [2.9, 0.7, 2.22], l2));
      f.push(texto(xR, Math.min(yM + 0.26 + quantas * 0.24 + 0.04, 6.74), colR, 0.24,
             par([{ t: "!  atrasada      B·  pagamento bloqueado", sz: 7.5, cor: C.suave, fonte: K }])));
    }
  } else {
    f.push(texto(xR, yT, colR, 0.4,
           par([{ t: "Nada por pagar no Contas a Pagar.", sz: 10, cor: C.suave, fonte: K }])));
  }
  return f;
}

// ═══ SLIDE 2 — o mês, na grelha do Fluxo Futuro ══════════════════════════════
// As mesmas rubricas e as mesmas secções do slide seguinte, mas de um mês só,
// com as colunas que interessam a quem decide: o que JÁ ESTÁ FATURADO, o que
// ainda é PREVISÃO, e o total. Em cima o caixa de hoje, em baixo o caixa com
// que o mês fecha.
function slideMes(r, sub) {
  const mm = r.mes;
  const mz = r.matrizMes;
  const f = [...moldura(`Fluxo Futuro — ${capitalizar(mm.rotulo)}`, sub, 2)];

  if (!mz || !mz.chaves.length) {
    f.push(texto(X0, 2.4, LARGURA, 0.6,
           par([{ t: "Sem lançamentos no mês corrente.", sz: 13, cor: C.suave, fonte: K }])));
    return f;
  }

  const chave = mz.chaves[0];
  const larguras = [4.73, 2.4, 2.4, 2.4];       // soma 11,93
  const linhas = [];

  // ── De onde o mês parte, em duas linhas ────────────────────────────────
  // O CAIXA DE HOJE é o que está mesmo no banco. Por baixo, o que já está
  // vencido por pagar — que não aparece nas colunas do mês (vive no balde
  // das vencidas) e por isso tem de abater aqui, senão o caixa do fim sai
  // otimista por esse valor. Antes era um número só, e "abre com −9.235 €"
  // parecia um erro a quem sabe que o banco tem dinheiro lá dentro.
  linhas.push({ altura: 0.30, celulas: [
    { t: "Caixa de hoje (no banco)", b: true, sz: 9, cor: C.tinta, fonte: K, fill: "F3F0EA" },
    { t: "", fill: "F3F0EA" }, { t: "", fill: "F3F0EA" },
    { t: eur(r.saldoAtual), b: true, sz: 9, align: "r",
      cor: sinal(r.saldoAtual), fonte: K, fill: "F3F0EA" },
  ]});
  if (Math.abs(n2(r.vencido)) > 0.005) {
    linhas.push({ altura: 0.26, celulas: [
      { t: "Já vencido por pagar, de meses anteriores", sz: 8.5, cor: C.vermelho, fonte: K },
      { t: "", sz: 8.5 }, { t: "", sz: 8.5 },
      { t: eur(-n2(r.vencido)), b: true, sz: 8.5, align: "r", cor: C.vermelho, fonte: K },
    ]});
  }

  linhas.push({ altura: 0.28, celulas: [
    { t: "Despesa", b: true, sz: 9, cor: C.tinta, fonte: K, fill: C.cabTab },
    { t: "Já faturado", b: true, sz: 9, cor: C.tinta, fonte: K, align: "r", fill: C.cabTab },
    { t: "Previsto", b: true, sz: 9, cor: C.tinta, fonte: K, align: "r", fill: C.cabTab },
    { t: "Total do mês", b: true, sz: 9, cor: C.tinta, fonte: K, align: "r", fill: C.cabTab },
  ]});

  const h = 0.235;
  const fixas = 3 /*caixa, vencido e cabeçalho*/ + 3 /*secções*/ + 2 /*líquido + caixa fim*/;
  const cabem = Math.max(6, Math.floor((6.50 - 1.62) / h) - fixas);
  const seccoes = rubricasQueCabem(mz.seccoes, cabem);

  const cel = (t, { align = "r", cor = C.texto, b = false, fill = null, sz = 8.5 } = {}) =>
    ({ t, align, cor, b, fill, sz, fonte: K });
  const val = (v, cor) => cel(Math.abs(n2(v)) > 0.005 ? eur(v) : "—",
                              { cor: Math.abs(n2(v)) > 0.005 ? cor : C.suave });

  let totF = 0, totP = 0;

  seccoes.forEach(sec => {
    if (!sec.mostra.length && !sec.juntas.length) return;
    const titulo = sec.tipo === "funding" ? "FUNDING — BANCO" : sec.titulo.toUpperCase();
    const cor = sec.tipo === "entrada" ? C.verde : sec.tipo === "saida" ? C.vermelho : C.tinta;

    const soma = (lista) => lista.reduce((acc, g) => {
      const x = repartirPorNatureza(g, chave, sec.assinado);
      return { faturado: acc.faturado + x.faturado, previsto: acc.previsto + x.previsto };
    }, { faturado: 0, previsto: 0 });
    const sSec = soma([...sec.mostra, ...sec.juntas]);
    // O LÍQUIDO leva o sinal da secção: os custos saem, por isso abatem. A do
    // funding já vem assinada de dentro (o desembolso soma, a amortização
    // abate), por isso aqui não se lhe toca. Sem isto, a linha do líquido
    // somava os custos como se fossem receita e dava sempre positivo.
    const sgn = sec.tipo === "saida" ? -1 : 1;
    totF += sgn * sSec.faturado; totP += sgn * sSec.previsto;

    linhas.push({ altura: 0.26, celulas: [
      cel(titulo, { align: "l", cor, b: true, sz: 9, fill: C.zebra }),
      { ...val(sSec.faturado, cor), b: true, fill: C.zebra },
      { ...val(sSec.previsto, cor), b: true, fill: C.zebra },
      cel(eur(sec.valores[chave]), { cor, b: true, fill: C.zebra }),
    ]});

    sec.mostra.forEach(g => {
      const x = repartirPorNatureza(g, chave, sec.assinado);
      linhas.push({ altura: h, celulas: [
        cel(g.categoria, { align: "l" }),
        val(x.faturado, cor), val(x.previsto, cor),
        cel(eur(g.valores[chave]), { cor, b: true }),
      ]});
    });

    if (sec.juntas.length) {
      const x = soma(sec.juntas);
      linhas.push({ altura: h, celulas: [
        cel(`Outras ${sec.juntas.length} rubricas`, { align: "l", cor: C.suave }),
        val(x.faturado, C.suave), val(x.previsto, C.suave),
        cel(eur(sec.juntas.reduce((a, g) => a + n2(g.valores[chave]), 0)), { cor: C.suave }),
      ]});
    }
  });

  linhas.push({ altura: 0.27, celulas: [
    cel("Líquido do mês", { align: "l", cor: C.tinta, b: true, sz: 9, fill: C.cabTab }),
    cel(eur(totF), { cor: sinal(totF), b: true, fill: C.cabTab }),
    cel(eur(totP), { cor: sinal(totP), b: true, fill: C.cabTab }),
    cel(eur(mz.liquido[chave]), { cor: sinal(mz.liquido[chave]), b: true, fill: C.cabTab }),
  ]});
  linhas.push({ altura: 0.32, celulas: [
    cel("Caixa no fim do mês", { align: "l", cor: C.tinta, b: true, sz: 9.5, fill: "F3F0EA" }),
    cel("", { fill: "F3F0EA" }), cel("", { fill: "F3F0EA" }),
    cel(eur(mz.caixa?.[chave]), { cor: sinal(mz.caixa?.[chave]), b: true, sz: 9.5, fill: "F3F0EA" }),
  ]});

  f.push(tabela(X0, 1.62, larguras, linhas));

  const alturaTab = linhas.reduce((a, l) => a + l.altura, 0);
  const y = Math.min(1.62 + alturaTab + 0.16, 6.46);

  const firme = Math.round(mm.pesoFaturado);
  f.push(caixa(X0, y, LARGURA, 0.34, { fill: C.cartao, linha: C.cartaoLn, raio: 0.04,
    paras: par([
      { t: `${firme}% das saídas do mês já estão faturadas`, sz: 9, b: true, cor: C.tinta, fonte: K },
      { t: firme >= 70
          ? "  ·  a margem para adiar é pequena, quase tudo já está contratado."
          : "  ·  há margem para reprogramar, boa parte ainda é estimativa.",
        sz: 9, cor: C.suave, fonte: K },
    ]), opts: { anchor: "ctr", margem: 0.14 } }));

  const juntas = seccoes.reduce((a, x) => a + x.juntas.length, 0);
  if (juntas > 0) {
    f.push(texto(X0, y + 0.38, LARGURA, 0.26, par([{
      t: `${juntas} rubricas mais pequenas foram agrupadas para caberem na página.`,
      sz: 8, cor: C.suave, fonte: K }])));
  }
  return f;
}

// ═══ SLIDE 3 — a matriz do Fluxo Futuro ═════════════════════════════════════
// A mesma grelha do ecrã: despesas em linha, meses em coluna, as três secções
// (receitas, custos e o funding do banco por baixo) e o caixa acumulado no
// fim. Vem da MESMA função que desenha a matriz no ERP — se este slide
// agrupasse por outro caminho, a reunião tinha dois quadros a discordar.

/**
 * As rubricas que cabem na página. Quando há mais do que as que cabem,
 * juntam-se as mais pequenas numa linha só — e DIZ-SE quantas são, em vez de
 * as deixar cair sem aviso.
 */
function rubricasQueCabem(seccoes, maximo) {
  const total = seccoes.reduce((s, x) => s + x.grupos.length, 0);
  if (total <= maximo) return seccoes.map(x => ({ ...x, mostra: x.grupos, juntas: [] }));

  // Reparte o orçamento de linhas pelas secções, à proporção do que têm, mas
  // nunca menos de duas por secção que tenha alguma coisa.
  return seccoes.map(sec => {
    if (!sec.grupos.length) return { ...sec, mostra: [], juntas: [] };
    const quota = Math.max(2, Math.round(maximo * sec.grupos.length / total));
    if (sec.grupos.length <= quota) return { ...sec, mostra: sec.grupos, juntas: [] };
    // Os grupos já vêm ordenados por peso; ficam os maiores.
    return { ...sec, mostra: sec.grupos.slice(0, quota - 1),
             juntas: sec.grupos.slice(quota - 1) };
  });
}

function slideFuturo(r, sub) {
  const m = r.matriz;
  const fu = r.futuro;
  const f = [...moldura(`Fluxo Futuro — Próximos ${m.colunas.length} Meses`, sub, 3)];

  const chaves = m.chaves;
  const nCol = chaves.length;
  const larguraRub = 2.75, larguraTotal = 1.80;
  const larguraMes = (LARGURA - larguraRub - larguraTotal) / Math.max(1, nCol);
  const larguras = [larguraRub, ...chaves.map(() => larguraMes), larguraTotal];

  const h = 0.215;                       // altura de uma linha de rubrica
  const topo = 1.62, fundo = 6.62;
  const fixas = 1 /*cabeçalho*/ + 3 /*títulos de secção*/ + 2 /*líquido e caixa*/;
  const cabem = Math.max(6, Math.floor((fundo - topo) / h) - fixas - 1);
  const seccoes = rubricasQueCabem(m.seccoes, cabem);

  const linhas = [];

  // Cabeçalho: a rubrica e os meses.
  linhas.push({ altura: 0.26, celulas: [
    { t: "Despesa", b: true, sz: 8.5, cor: C.tinta, fonte: K, fill: C.cabTab },
    // O mês escreve-se a partir da CHAVE, não do `label`: o label do fluxo é
    // "dez. de 2026" e não cabe numa coluna de 1,2 polegadas. "dez/26" é o
    // que está no cabeçalho da matriz do ecrã.
    ...m.colunas.map(c => ({ t: rotuloMesCurto(c.key), b: true, sz: 8.5, cor: C.tinta,
                             fonte: K, align: "r", fill: C.cabTab })),
    { t: "Total", b: true, sz: 8.5, cor: C.tinta, fonte: K, align: "r", fill: C.cabTab },
  ]});

  const cel = (t, { align = "r", cor = C.texto, b = false, fill = null } = {}) =>
    ({ t, align, cor, b, fill, sz: 8, fonte: K });

  const nada = "—";
  const valor = (v, { cor = null, b = false, fill = null } = {}) =>
    cel(Math.abs(n2(v)) > 0.005 ? eur(v) : nada,
        { cor: Math.abs(n2(v)) > 0.005 ? (cor || C.texto) : C.suave, b, fill });

  seccoes.forEach(sec => {
    if (!sec.mostra.length && !sec.juntas.length) return;

    // O título da secção. O funding leva o nome por extenso: a pergunta que
    // isto responde é "estas entradas são vendas ou é o banco?".
    const titulo = sec.tipo === "funding" ? "FUNDING — BANCO"
                 : sec.titulo.toUpperCase();
    const corSec = sec.tipo === "entrada" ? C.verde
                 : sec.tipo === "saida" ? C.vermelho : C.tinta;
    linhas.push({ altura: 0.24, celulas: [
      { t: titulo, b: true, sz: 8.5, cor: corSec, fonte: K, fill: C.zebra },
      ...chaves.map(c => ({ t: eur(sec.valores[c]), b: true, sz: 8, cor: corSec,
                            fonte: K, align: "r", fill: C.zebra })),
      { t: eur(sec.total), b: true, sz: 8, cor: corSec, fonte: K, align: "r", fill: C.zebra },
    ]});

    sec.mostra.forEach(g => linhas.push({ altura: h, celulas: [
      cel(g.categoria, { align: "l", cor: C.texto }),
      ...chaves.map(c => valor(g.valores[c], { cor: corSec })),
      valor(g.total, { cor: corSec, b: true }),
    ]}));

    if (sec.juntas.length) {
      const soma = (c) => sec.juntas.reduce((s, g) => s + n2(g.valores[c]), 0);
      linhas.push({ altura: h, celulas: [
        cel(`Outras ${sec.juntas.length} rubricas`, { align: "l", cor: C.suave }),
        ...chaves.map(c => valor(soma(c), { cor: C.suave })),
        valor(sec.juntas.reduce((s, g) => s + n2(g.total), 0), { cor: C.suave }),
      ]});
    }
  });

  // O líquido e o caixa, como no rodapé da matriz do ecrã.
  linhas.push({ altura: 0.25, celulas: [
    { t: "Líquido do mês", b: true, sz: 8.5, cor: C.tinta, fonte: K, fill: C.cabTab },
    ...chaves.map(c => ({ t: eur(m.liquido[c]), b: true, sz: 8, fonte: K, align: "r",
                          cor: sinal(m.liquido[c]), fill: C.cabTab })),
    { t: eur(m.totalLiquido), b: true, sz: 8, fonte: K, align: "r",
      cor: sinal(m.totalLiquido), fill: C.cabTab },
  ]});
  linhas.push({ altura: 0.28, celulas: [
    { t: "Caixa acumulado", b: true, sz: 8.5, cor: C.tinta, fonte: K, fill: "F3F0EA" },
    ...chaves.map(c => ({ t: eur(m.caixa?.[c]), b: true, sz: 8, fonte: K, align: "r",
                          cor: sinal(m.caixa?.[c]), fill: "F3F0EA" })),
    { t: eur(m.caixaFim), b: true, sz: 8, fonte: K, align: "r",
      cor: sinal(m.caixaFim), fill: "F3F0EA" },
  ]});

  f.push(tabela(X0, topo, larguras, linhas));

  const alturaTab = linhas.reduce((s, l) => s + l.altura, 0);
  const y = Math.min(topo + alturaTab + 0.14, 6.46);

  // Uma linha a fechar: de onde parte o caixa, quando vira, e onde acaba.
  // De onde parte, repartido — como no slide 2, e pela mesma razão: o número
  // sozinho não se explica.
  const partes = [
    { t: "Parte do caixa de hoje ", sz: 9, cor: C.suave, fonte: K },
    { t: eur(r.saldoAtual), sz: 9, b: true, cor: sinal(r.saldoAtual), fonte: K },
  ];
  if (Math.abs(n2(r.vencido)) > 0.005) {
    partes.push({ t: " menos ", sz: 9, cor: C.suave, fonte: K });
    partes.push({ t: eur(r.vencido), sz: 9, b: true, cor: C.vermelho, fonte: K });
    partes.push({ t: " já vencido = ", sz: 9, cor: C.suave, fonte: K });
    partes.push({ t: eur(m.caixaAbertura), sz: 9, b: true,
                  cor: sinal(m.caixaAbertura), fonte: K });
  }
  partes.push({ t: "  ·  ", sz: 9, cor: C.suave, fonte: K });
  if (fu.primeiroNegativo) {
    partes.push({ t: "caixa negativo a partir de ", sz: 9, cor: C.suave, fonte: K });
    partes.push({ t: `${fu.primeiroNegativo.rotulo} (${eur0(fu.primeiroNegativo.caixa)})`,
                  sz: 9, b: true, cor: C.vermelho, fonte: K });
  } else {
    partes.push({ t: "nunca fica negativo · ponto mais baixo ", sz: 9, cor: C.suave, fonte: K });
    partes.push({ t: fu.pior ? `${eur0(fu.pior.caixa)} em ${fu.pior.rotulo}` : "—",
                  sz: 9, b: true, cor: C.verde, fonte: K });
  }
  partes.push({ t: "  ·  caixa no fim do projeto ", sz: 9, cor: C.suave, fonte: K });
  partes.push({ t: eur0(fu.projeto.caixaFim), sz: 9, b: true,
                cor: sinal(fu.projeto.caixaFim), fonte: K });
  f.push(caixa(X0, y, LARGURA, 0.34, { fill: C.cartao, linha: C.cartaoLn, raio: 0.04,
    paras: par(partes), opts: { anchor: "ctr", margem: 0.14 } }));

  // O que fica para lá da janela — senão lê-se o Total como se fosse a soma
  // dos seis meses, e não é.
  const notas = [];
  if (m.mesesForaDaJanela > 0) {
    notas.push(`A coluna Total é do fluxo inteiro: inclui mais `
             + `${m.mesesForaDaJanela} ${m.mesesForaDaJanela === 1 ? "mês" : "meses"} `
             + `para lá dos que estão na grelha.`);
    // Há rubricas que só existem para lá da janela — a venda na escritura, a
    // amortização do banco. Sem isto, o total de uma secção não bate com as
    // linhas que se veem e parece um erro de soma.
    const soLaFora = [m.entradas, m.saidas, m.funding]
      .filter(sec => sec && sec.nLinhasForaDaJanela > 0)
      .map(sec => sec.tipo === "funding" ? "funding" : sec.titulo.toLowerCase());
    if (soLaFora.length) {
      notas.push(`Por isso o total de ${soLaFora.join(" e de ")} não bate com as linhas `
               + `à vista: há rubricas (a venda na escritura, a amortização) que só `
               + `acontecem depois destes meses.`);
    }
  }
  const juntas = seccoes.reduce((s, x) => s + x.juntas.length, 0);
  if (juntas > 0) notas.push(`${juntas} rubricas mais pequenas foram agrupadas para caberem na página.`);
  if (notas.length) {
    f.push(texto(X0, y + 0.38, LARGURA, 0.28,
           par([{ t: notas.join(" "), sz: 8, cor: C.suave, fonte: K }])));
  }
  return f;
}

// ═══ SLIDE 4 — o que isto obriga a decidir ═══════════════════════════════════
const COR_GRAU = {
  critico:  { barra: C.vermelho, fundo: "FDF1EF", linha: "E8C4BC" },
  atencao:  { barra: "A8762F",   fundo: "FBF6EC", linha: C.alerta },
  ok:       { barra: C.verde,    fundo: "F1F7F3", linha: "C9E3D5" },
  info:     { barra: C.suave,    fundo: C.cartao, linha: C.cartaoLn },
};

function slideConclusoes(r, sub) {
  const f = [...moldura("Pontos de Atenção para a Gestão", sub, 4)];
  const lista = (r.conclusoes || []).slice(0, 5);

  if (!lista.length) {
    f.push(texto(X0, 2.4, LARGURA, 0.6,
           par([{ t: "Sem pontos de atenção a assinalar neste período.",
                  sz: 13, cor: C.suave, fonte: K }])));
    return f;
  }

  // A altura reparte-se pelo que há, para 2 conclusões não deixarem a página
  // vazia nem 5 a transbordarem.
  const topo = 1.70, fundo = 6.48;
  const gap = 0.16;
  const h = Math.min(1.22, (fundo - topo - gap * (lista.length - 1)) / lista.length);

  lista.forEach((c, i) => {
    const y = topo + i * (h + gap);
    const g = COR_GRAU[c.grau] || COR_GRAU.info;
    f.push(caixa(X0, y, LARGURA, h, { fill: g.fundo, linha: g.linha, raio: 0.04 }));
    f.push(caixa(X0, y, 0.055, h, { fill: g.barra }));
    f.push(texto(X0 + 0.25, y + 0.08, LARGURA - 0.55, 0.3,
           par([{ t: c.titulo, sz: 12.5, b: true, cor: C.tinta, fonte: G }])));
    f.push(texto(X0 + 0.25, y + 0.40, LARGURA - 0.55, h - 0.46,
           par([{ t: c.texto, sz: 10, cor: C.texto, fonte: K }], { entreLinhas: 1.18 })));
  });

  f.push(texto(X0, 6.60, LARGURA, 0.3, par([{
    t: "Conclusões derivadas dos números do fluxo — nenhuma foi escrita à mão.",
    sz: 8.5, cor: C.suave, fonte: K }])));
  return f;
}

const capitalizar = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

/**
 * O ficheiro inteiro.
 * @param r  o que construirReportCaixa devolveu
 * @returns { dados: Uint8Array, nome: string }
 */
export function gerarReportCaixaPptx(r) {
  const d = new Date(`${String(r.hoje).slice(0, 10)}T00:00:00Z`);
  const dataPt = `${String(d.getUTCDate()).padStart(2, "0")}/`
               + `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  const sub = `${r.nomeEmpresa || "—"} · posição em ${dataPt}`;

  const slides = [
    slideSemana(r, sub),
    slideMes(r, sub),
    slideFuturo(r, sub),
    slideConclusoes(r, sub),
  ];

  const nomeLimpo = String(r.nomeEmpresa || "projeto")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

  return {
    dados: construirPptx(slides, {
      titulo: `Report de Caixa — ${r.nomeEmpresa || ""}`.trim(),
      autor: "LPX Private",
      media: [{ ext: "png", dados: logoPngBytes() }],
    }),
    nome: `Report_Caixa_${nomeLimpo}_${String(r.hoje).slice(0, 10)}.pptx`,
  };
}

export default gerarReportCaixaPptx;
