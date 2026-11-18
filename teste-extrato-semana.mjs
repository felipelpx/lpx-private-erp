// As duas tabelas do extrato no slide 1: maiores saídas e maiores entradas.
//
// Antes só havia as saídas, e o total delas dizia "5 mov." contando TODOS os
// movimentos da semana — entradas incluídas — debaixo do rótulo "total das
// saídas". Agora cada tabela conta os seus.
//
// O risco desta disposição é o encaixe vertical: a altura a que as tabelas
// começam depende de avisos que aparecem ou não (transferências intra-grupo,
// extrato que não fecha), por isso o número de linhas tem de se adaptar. Uma
// tabela a passar por cima da régua do rodapé é o género de coisa que só se
// dá por ela no PDF já enviado — daí medir-se aqui, em vários cenários.
//   node teste-extrato-semana.mjs
import { construirReportCaixa } from "./src/reportCaixa.js";
import { gerarReportCaixaPptx } from "./src/reportCaixaPptx.js";

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };

const mov = (d, v, t) => ({ data: d, valor: v, movimento: t, conta: "a" });
const REGUA = 6.95;     // a régua do rodapé: nada pode passar daqui
const FUNDO = 6.78;     // o limite de trabalho da área de conteúdo

function montar({ movimentos = [], saldoAnterior = 40000, saldoAtual = null,
                  faturas = [], vencido = 0 } = {}) {
  const soma = movimentos.reduce((s, m) => s + m.valor, 0);
  const r = construirReportCaixa({
    nomeEmpresa: "Infinite Change", hoje: "2026-11-16",
    saldoAnterior, saldoAtual: saldoAtual ?? saldoAnterior + soma,
    movimentos, faturas, empresa: "ic", vencido, meses: [], nMeses: 6,
  });
  return { r, slide: gerarReportCaixaPptx(r).slides[0] };
}
const titulos = (slide) => slide
  .filter(f => f.paras && !f.linhas && !f.fill)
  .flatMap(f => (Array.isArray(f.paras) ? f.paras : [f.paras]))
  .flatMap(p => (Array.isArray(p?.runs) ? p.runs : Array.isArray(p) ? p : p ? [p] : []))
  .map(x => String(x?.t || ""));
const tabelas = (slide) => slide.filter(f => Array.isArray(f.linhas))
  .map(t => ({ ...t, fim: t.y + t.linhas.reduce((s, l) => s + l.altura, 0) }));
const texto = (cel) => String(cel?.t ?? "");

const SAIDAS = [
  mov("2026-11-10", -17052.22, "TRF P/ COMPLAI CONSTRUCAO SA"),
  mov("2026-11-10",   -104.00, "COMISS GESTAO UTILIZACAO 21594"),
  mov("2026-11-10",    -85.26, "IMP ABERT CRED EMPRES NR 21594"),
  mov("2026-11-12",   -312.00, "AVENCA CONTABILIDADE"),
  mov("2026-11-13",  -1200.00, "FISCALIZACAO OBRA"),
];
// Um par intra-grupo a sério: o motor só o reconhece pela categoria de
// transferência, e as contas distinguem-se por conta_id (não por "conta").
const INTRA = [
  { data: "2026-11-11", valor: -5000, movimento: "TRANSFERENCIA INTERNA",
    conta_id: "bcp", categoria: "Transferência entre contas" },
  { data: "2026-11-11", valor:  5000, movimento: "TRANSFERENCIA INTERNA",
    conta_id: "cgd", categoria: "Transferência entre contas" },
];
const ENTRADAS = [
  mov("2026-11-10", 17052.22, "DESEMBOLSO FINANCIAMENTO BCP"),
  mov("2026-11-11",  4500.00, "SINAL CPCV FRACAO B"),
  mov("2026-11-12",   980.00, "REEMBOLSO IVA AT"),
];

console.log("As duas tabelas estão no slide:");
{
  const { slide } = montar({ movimentos: [...SAIDAS, ...ENTRADAS] });
  const ts = titulos(slide);
  ok(ts.some(t => /Maiores saídas da semana/.test(t)), "há \"Maiores saídas da semana\"");
  ok(ts.some(t => /Maiores entradas da semana/.test(t)), "e \"Maiores entradas da semana\"");
  const tt = tabelas(slide).filter(t => t.x < 6.5).sort((a, b) => a.y - b.y);
  ok(tt.length === 2, `duas tabelas na coluna esquerda (${tt.length})`);
  ok(tt[0].y < tt[1].y, "as saídas em cima, as entradas por baixo");
  ok(tt[0].fim <= tt[1].y + 0.001,
     `não se tocam: a primeira acaba em ${tt[0].fim.toFixed(2)}, a segunda começa em ${tt[1].y.toFixed(2)}`);
  ok(Math.abs(tt[0].larguras?.reduce((a, b) => a + b, 0)
            - tt[1].larguras?.reduce((a, b) => a + b, 0)) < 0.001,
     "e têm a mesma grelha de colunas");
}

console.log("\nCada tabela conta os SEUS movimentos:");
{
  // Era isto que estava errado: "5 mov." na tabela das saídas quando havia
  // 5 saídas e 3 entradas dava a impressão de 5 saídas, mas o número era o
  // total dos 8 — e com outros dados teria sido 8.
  const { r, slide } = montar({ movimentos: [...SAIDAS, ...ENTRADAS] });
  ok(r.semana.nSaidas === 5 && r.semana.nEntradas === 3,
     `o motor separa: ${r.semana.nSaidas} saídas e ${r.semana.nEntradas} entradas`);
  ok(r.semana.nMovimentos === 8, "e o total continua a ser 8");
  const tt = tabelas(slide).filter(t => t.x < 6.5).sort((a, b) => a.y - b.y);
  const rodape = (t) => t.linhas[t.linhas.length - 1].celulas.map(texto);
  ok(rodape(tt[0])[0] === "5 mov.", `saídas: "${rodape(tt[0])[0]}"`);
  ok(rodape(tt[1])[0] === "3 mov.", `entradas: "${rodape(tt[1])[0]}"`);
  ok(/total das saídas/.test(rodape(tt[0])[1]), "com o rótulo certo em cada uma");
  ok(/total das entradas/.test(rodape(tt[1])[1]), "idem nas entradas");
  ok(rodape(tt[0])[2] === "18.753,48 €", `total das saídas: ${rodape(tt[0])[2]}`);
  ok(rodape(tt[1])[2] === "22.532,22 €", `total das entradas: ${rodape(tt[1])[2]}`);
}

console.log("\nAs cores separam os dois lados:");
{
  const { slide } = montar({ movimentos: [...SAIDAS, ...ENTRADAS] });
  const tt = tabelas(slide).filter(t => t.x < 6.5).sort((a, b) => a.y - b.y);
  const cores = (t) => t.linhas.slice(1, -1).map(l => l.celulas[2].cor);
  ok(cores(tt[0]).every(c => c === "A93226"), "as saídas todas a vermelho");
  ok(cores(tt[1]).every(c => c === "1F7A54"), "as entradas todas a verde");
  // E o valor sai positivo dos dois lados: a coluna já diz de que lado é.
  const vals = (t) => t.linhas.slice(1, -1).map(l => texto(l.celulas[2]));
  ok(!vals(tt[1]).some(v => /−|^-/.test(v)), `sem sinais nas entradas: ${vals(tt[1])[0]}`);
  ok(!vals(tt[0]).some(v => /−|^-/.test(v)), `nem nas saídas: ${vals(tt[0])[0]}`);
}

console.log("\nA ordem é por valor, do maior para o menor:");
{
  const { r } = montar({ movimentos: [...SAIDAS, ...ENTRADAS] });
  const dec = (l) => l.every((x, i) => i === 0 || l[i - 1].valor >= x.valor);
  ok(dec(r.semana.maiores), "saídas por ordem decrescente");
  ok(dec(r.semana.maioresEntradas), "entradas também");
  ok(r.semana.maioresEntradas[0].desc === "DESEMBOLSO FINANCIAMENTO BCP",
     `a maior entrada é o desembolso (${r.semana.maioresEntradas[0].valor} €)`);
}

console.log("\nNada passa por cima da régua, em nenhum cenário:");
{
  // Os cenários mudam a altura a que as tabelas podem começar: a nota das
  // transferências intra-grupo e o aviso do extrato que não fecha empurram
  // tudo para baixo. É aí que uma tabela de altura fixa sairia da folha.
  const muitas = (n, sinal) => Array.from({ length: n }, (_, i) =>
    mov("2026-11-1" + (i % 5), sinal * (1000 - i * 7), `MOVIMENTO NUMERO ${i + 1}`));
  const cenarios = [
    ["semana normal", { movimentos: [...SAIDAS, ...ENTRADAS] }],
    ["extrato não fecha", { movimentos: [...SAIDAS, ...ENTRADAS], saldoAtual: 99999 }],
    ["com transferência intra-grupo", { movimentos: [
      ...SAIDAS, ...ENTRADAS,
      ...INTRA,
    ] }],
    ["os dois avisos juntos", { saldoAtual: 12345, movimentos: [
      ...SAIDAS, ...ENTRADAS, ...INTRA,
    ] }],
    ["muitos movimentos dos dois lados", { movimentos: [...muitas(20, -1), ...muitas(20, +1)] }],
    ["só saídas", { movimentos: SAIDAS }],
    ["só entradas", { movimentos: ENTRADAS }],
    ["semana sem movimentos", { movimentos: [] }],
    ["uma saída e uma entrada", { movimentos: [SAIDAS[0], ENTRADAS[0]] }],
  ];
  for (const [nome, cfg] of cenarios) {
    const { slide } = montar(cfg);
    const fora = [];
    for (const t of tabelas(slide)) if (t.fim > REGUA - 0.01) fora.push(`tabela→${t.fim.toFixed(2)}`);
    for (const f of slide) {
      // O rodapé (lpxprivate.com e o número) está abaixo da régua de
      // propósito — só interessa o que é conteúdo.
      if ((f.y ?? 0) >= REGUA) continue;
      const base = (f.y ?? 0) + (f.cy ?? 0);
      if (f.paras && base > REGUA - 0.01) fora.push(`texto→${base.toFixed(2)}`);
    }
    const maisBaixo = Math.max(0, ...tabelas(slide).map(t => t.fim));
    ok(fora.length === 0,
       `${nome.padEnd(32)} mais baixo em ${maisBaixo.toFixed(2)} (régua ${REGUA})`
       + (fora.length ? ` — FORA: ${fora.join(", ")}` : ""));
  }
}

console.log("\nAs tabelas da esquerda nunca se sobrepõem:");
{
  const casos = [
    ["normal", [...SAIDAS, ...ENTRADAS]],
    ["com aviso", [...SAIDAS, ...ENTRADAS]],
    ["só uma de cada", [SAIDAS[0], ENTRADAS[0]]],
  ];
  for (const [nome, movimentos] of casos) {
    const { slide } = montar({ movimentos, saldoAtual: nome === "com aviso" ? 1 : null });
    const tt = tabelas(slide).filter(t => t.x < 6.5).sort((a, b) => a.y - b.y);
    const choca = tt.some((t, i) => i > 0 && t.y < tt[i - 1].fim - 0.001);
    ok(!choca, `${nome}: ${tt.map(t => `${t.y.toFixed(2)}–${t.fim.toFixed(2)}`).join(" e ")}`);
  }
}

console.log("\nCasos vazios dizem-se por palavras, não ficam em branco:");
{
  const { slide } = montar({ movimentos: SAIDAS });
  const ts = titulos(slide);
  ok(ts.some(t => /Sem entradas registadas/.test(t)),
     "sem entradas: \"Sem entradas registadas no período.\"");
  ok(ts.some(t => /Maiores entradas da semana/.test(t)),
     "e o título mantém-se, para não parecer que a secção desapareceu");

  const { slide: s2 } = montar({ movimentos: ENTRADAS });
  ok(titulos(s2).some(t => /Sem saídas registadas/.test(t)),
     "sem saídas: \"Sem saídas registadas no período.\"");

  const { slide: s3 } = montar({ movimentos: [] });
  const t3 = titulos(s3);
  ok(t3.some(t => /Sem saídas/.test(t)) && t3.some(t => /Sem entradas/.test(t)),
     "semana vazia: as duas frases");
}

console.log("\nAs transferências intra-grupo continuam de fora dos dois lados:");
{
  const { r } = montar({ movimentos: [...SAIDAS, ...ENTRADAS, ...INTRA] });
  ok(r.semana.intraGrupo.n > 0, `${r.semana.intraGrupo.n} par(es) posto(s) de lado`);
  ok(r.semana.entradas === 22532.22, `entradas sem os 5.000 €: ${r.semana.entradas}`);
  ok(r.semana.saidas === 18753.48, `saídas sem os 5.000 €: ${r.semana.saidas}`);
  ok(!r.semana.maioresEntradas.some(m => /TRANSFERENCIA INTERNA/.test(m.desc)),
     "e a transferência não aparece na tabela das entradas");
  ok(!r.semana.maiores.some(m => /TRANSFERENCIA INTERNA/.test(m.desc)),
     "nem na das saídas");
}

console.log("\nO PDF e o .pptx continuam a sair:");
{
  const r = construirReportCaixa({
    nomeEmpresa: "X", hoje: "2026-11-16", saldoAnterior: 40000, saldoAtual: 43778.74,
    movimentos: [...SAIDAS, ...ENTRADAS], meses: [], nMeses: 6,
  });
  const g = gerarReportCaixaPptx(r);
  ok(g.pdf?.length > 20000, `PDF com ${Math.round((g.pdf?.length || 0) / 1024)} KB`);
  ok(g.dados?.length > 10000, `pptx com ${Math.round((g.dados?.length || 0) / 1024)} KB`);
  const s = Buffer.from(g.pdf).toString("latin1");
  // O escritor de PDF posiciona palavra a palavra, por isso procura-se
  // cada uma, e não a frase inteira.
  ok(["DESEMBOLSO", "FINANCIAMENTO", "BCP"].every(p => s.includes(p)),
     "e a maior entrada está mesmo no PDF");
  ok(["Maiores", "entradas", "semana"].every(p => s.includes(p)),
     "com o título da secção");
  ok(s.includes("22.532,22"), "e o total das entradas");
}

console.log(mau === 0 ? "\n✅ Extrato da semana OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
