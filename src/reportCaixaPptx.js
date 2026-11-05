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

import { construirPptx, texto, caixa, regua, tabela, par } from "./pptx.js";
import { rotuloMesCurto } from "./reportCaixa.js";

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
  ];
}

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

// ═══ SLIDE 1 — a semana que passou ═══════════════════════════════════════════
function slideSemana(r, sub) {
  const s = r.semana;
  const f = [...moldura("Caixa — Últimos 7 Dias", sub, 1)];

  const cx = 3.84, gap = 0.21;
  f.push(cartao(X0, 1.70, cx, 1.55, `Caixa a ${s.de.slice(8, 10)}/${s.de.slice(5, 7)}`,
                eur(s.saldoAnterior), { nota: "saldo lido do extrato" }));
  f.push(cartao(X0 + cx + gap, 1.70, cx, 1.55, "Saiu nestes 7 dias",
                eur(s.saidas), { cor: C.vermelho,
                nota: s.entradas > 0.005 ? `entraram ${eur(s.entradas)}` : "sem entradas no período" }));
  f.push(cartao(X0 + 2 * (cx + gap), 1.70, cx, 1.55, "Caixa hoje",
                eur(s.saldoAtual), { cor: sinal(s.saldoAtual),
                nota: `variação de ${eur(s.variacao)}` }));

  // Quando o extrato não fecha, diz-se — e diz-se quanto falta.
  let y = 3.45;
  if (!s.fecha) {
    f.push(caixa(X0, y, LARGURA, 0.46, { fill: "FBF6EC", linha: C.alerta, raio: 0.05,
      paras: par([
        { t: "Atenção: ", sz: 10, b: true, cor: C.vermelho, fonte: K },
        { t: `a variação do saldo não bate com os movimentos importados — faltam `
           + `${eur(s.porExplicar)} por explicar. Provavelmente há extrato por importar.`,
          sz: 10, cor: "7A5A22", fonte: K },
      ]), opts: { anchor: "ctr", margem: 0.14 } }));
    y += 0.62;
  }

  f.push(texto(X0, y, 6.0, 0.3,
         par([{ t: "Maiores saídas da semana", sz: 13, b: true, cor: C.tinta, fonte: G }])));
  y += 0.42;

  if (s.maiores.length) {
    const linhas = [cabTab([["Data"], ["Movimento"], ["Rubrica"], ["Valor", "r"]])];
    s.maiores.forEach((m, i) => linhas.push(linhaTab([
      { t: `${m.data.slice(8, 10)}/${m.data.slice(5, 7)}`, cor: C.suave },
      { t: m.desc },
      { t: m.rubrica, cor: C.suave },
      { t: eur(m.valor), align: "r", b: true, cor: C.vermelho },
    ], { zebra: i % 2 === 1 })));
    linhas.push(linhaTab([
      { t: "" },
      { t: `${s.nMovimentos} movimento${s.nMovimentos === 1 ? "" : "s"} no período` },
      { t: "total das saídas", align: "r", cor: C.suave },
      { t: eur(s.saidas), align: "r" },
    ], { forte: true, altura: 0.33 }));
    f.push(tabela(X0, y, [1.1, 5.9, 2.73, 2.2], linhas));
  } else {
    f.push(texto(X0, y, LARGURA, 0.4,
           par([{ t: "Sem saídas registadas no período.", sz: 11, cor: C.suave, fonte: K }])));
  }
  return f;
}

// ═══ SLIDE 2 — como fecha o mês ══════════════════════════════════════════════
function slideMes(r, sub) {
  const m = r.mes;
  const f = [...moldura(`Caixa — ${capitalizar(m.rotulo)}`, sub, 2)];

  const cx = 3.84, gap = 0.21;
  f.push(cartao(X0, 1.70, cx, 1.55, "Já faturado por sair", eur(m.faturado.saidas),
                { cor: C.vermelho, nota: `${m.faturado.n} lançamento${m.faturado.n === 1 ? "" : "s"} · compromisso firme` }));
  f.push(cartao(X0 + cx + gap, 1.70, cx, 1.55, "Ainda previsto", eur(m.previsto.saidas),
                { cor: "7A5A22", nota: `${m.previsto.n} lançamento${m.previsto.n === 1 ? "" : "s"} · estimativa` }));
  f.push(cartao(X0 + 2 * (cx + gap), 1.70, cx, 1.55, "Caixa no fim do mês",
                eur(m.saldoFim), { cor: sinal(m.saldoFim),
                nota: `abre com ${eur(m.saldoAbertura)}` }));

  const linhas = [
    cabTab([[""], ["Entradas", "r"], ["Saídas", "r"], ["Líquido", "r"], ["Lançamentos", "r"]]),
    linhaTab([
      { t: "Já faturado / contratado", b: true },
      { t: eur(m.faturado.entradas), align: "r", cor: C.verde },
      { t: eur(m.faturado.saidas), align: "r", cor: C.vermelho },
      { t: eur(m.faturado.liquido), align: "r", b: true, cor: sinal(m.faturado.liquido) },
      { t: String(m.faturado.n), align: "r", cor: C.suave },
    ]),
    linhaTab([
      { t: "Previsto", b: true },
      { t: eur(m.previsto.entradas), align: "r", cor: C.verde },
      { t: eur(m.previsto.saidas), align: "r", cor: C.vermelho },
      { t: eur(m.previsto.liquido), align: "r", b: true, cor: sinal(m.previsto.liquido) },
      { t: String(m.previsto.n), align: "r", cor: C.suave },
    ], { zebra: true }),
    linhaTab([
      { t: "Total do mês" },
      { t: eur(m.total.entradas), align: "r" },
      { t: eur(m.total.saidas), align: "r" },
      { t: eur(m.total.liquido), align: "r", cor: sinal(m.total.liquido) },
      { t: String(m.total.n), align: "r" },
    ], { forte: true, altura: 0.32 }),
  ];
  f.push(tabela(X0, 3.45, [4.13, 2.0, 2.0, 2.0, 1.8], linhas));

  f.push(texto(X0, 4.80, 7.0, 0.3,
         par([{ t: "Maiores saídas do mês", sz: 13, b: true, cor: C.tinta, fonte: G }])));

  if (m.maiores.length) {
    const l2 = [cabTab([["Despesa"], ["Rubrica"], ["Estado"], ["Valor", "r"]])];
    m.maiores.slice(0, 4).forEach((x, i) => l2.push(linhaTab([
      { t: x.desc },
      { t: x.rubrica, cor: C.suave },
      { t: x.faturado ? "faturado" : "previsto",
        cor: x.faturado ? C.tinta : C.suave, b: x.faturado },
      { t: eur(x.valor), align: "r", b: true, cor: C.vermelho },
    ], { zebra: i % 2 === 1 })));
    f.push(tabela(X0, 5.20, [5.13, 2.9, 1.7, 2.2], l2));
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
  const partes = [
    { t: "Abre com ", sz: 9, cor: C.suave, fonte: K },
    { t: eur(m.caixaAbertura), sz: 9, b: true, cor: sinal(m.caixaAbertura), fonte: K },
    { t: "  ·  ", sz: 9, cor: C.suave, fonte: K },
  ];
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
    }),
    nome: `Report_Caixa_${nomeLimpo}_${String(r.hoje).slice(0, 10)}.pptx`,
  };
}

export default gerarReportCaixaPptx;
