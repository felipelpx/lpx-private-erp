// Os quatro cartões do topo do slide da semana.
//
// Antes eram três, e o que ENTROU ia como legenda de 9,5 pt cinzenta por
// baixo do que SAIU, que ia a 21 pt a vermelho. Numa semana em que entraram
// 17.052 € e saíram 17.241 € o slide parecia uma sangria, quando a casa tinha
// praticamente empatado. O peso tipográfico estava a dizer o que os números
// não diziam.
//
// Este teste mede a disposição — tamanhos, cores, posições — em vez de olhar
// para o ficheiro e achar que está bem.
//   node teste-cartoes-semana.mjs
import { construirReportCaixa } from "./src/reportCaixa.js";
import { gerarReportCaixaPptx } from "./src/reportCaixaPptx.js";
import { LARGURAS } from "./src/larguras.js";

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };

// Os números do print do Felipe: 17.241,48 € de saídas contra 17.052,22 € de
// entradas. É o caso que motivou a alteração, por isso é o caso do teste.
const r = construirReportCaixa({
  nomeEmpresa: "Infinite Change (Paço D'arcos)", hoje: "2026-11-16",
  saldoAtual: 40516.02, saldoAnterior: 40705.28, vencido: 0,
  movimentos: [
    { data: "2026-11-12", valor: -17241.48, movimento: "Auto 7", conta: "a", categoria: "Gastos com Obras" },
    { data: "2026-11-13", valor:  17052.22, movimento: "Funding", conta: "a", categoria: "Inflow - Obra" },
  ],
  nMeses: 6,
});
const g = gerarReportCaixaPptx(r);
const slide1 = g.slides[0];

// Um cartão é uma caixa com `paras`: rótulo, valor, e uma nota opcional.
const cartoes = slide1.filter(f => f.paras && f.fill === "FBF6EF" && f.y > 1.6 && f.y < 1.8)
                      .sort((a, b) => a.x - b.x);
const corrida = (c, i) => c.paras[i]?.runs?.[0] || c.paras[i]?.[0] || {};
const rotulo  = (c) => String(corrida(c, 0).t || "");
const valor   = (c) => corrida(c, 1);
const nota    = (c) => String(corrida(c, 2).t || "");

console.log("Há quatro cartões, pela ordem pedida:");
ok(cartoes.length === 4, `são ${cartoes.length}`);
const rots = cartoes.map(rotulo);
console.log("    " + rots.join("  |  "));
ok(/CAIXA A 09\/11/.test(rots[0]), "1.º — o saldo de abertura");
ok(/CAIXA HOJE/.test(rots[1]),     "2.º — o saldo de hoje, ao lado do de abertura");
ok(/ENTROU/.test(rots[2]),         "3.º — o que entrou");
ok(/SAIU/.test(rots[3]),           "4.º — o que saiu");

console.log("\nOs dois saldos ficam mesmo encostados um ao outro:");
{
  const folga = cartoes[1].x - (cartoes[0].x + cartoes[0].cx);
  ok(Math.abs(folga - 0.21) < 0.001,
     `${folga.toFixed(3)} pol entre eles — a mesma goteira do resto da grelha`);
}

console.log("\nENTRADA e SAÍDA têm exactamente o mesmo peso:");
{
  const e = valor(cartoes[2]), s = valor(cartoes[3]);
  ok(e.sz === s.sz, `o mesmo corpo: ${e.sz} pt e ${s.sz} pt`);
  ok(e.sz === 21, "que é o corpo grande dos cartões, não o das legendas");
  ok(!!e.b === !!s.b && !!e.b, "ambos a negrito");
  ok(e.fonte === s.fonte, `a mesma fonte (${e.fonte})`);
  ok(cartoes[2].cx === cartoes[3].cx, "e os cartões têm a mesma largura");
  ok(cartoes[2].cy === cartoes[3].cy, "e a mesma altura");
}

console.log("\nE os valores são os certos, cada um no seu cartão:");
{
  ok(valor(cartoes[2]).t === "17.052,22 €", `entrou: ${valor(cartoes[2]).t}`);
  ok(valor(cartoes[3]).t === "17.241,48 €", `saiu: ${valor(cartoes[3]).t}`);
  ok(valor(cartoes[0]).t === "40.705,28 €", `abertura: ${valor(cartoes[0]).t}`);
  ok(valor(cartoes[1]).t === "40.516,02 €", `hoje: ${valor(cartoes[1]).t}`);
}

console.log("\nA entrada deixou de ser um rodapé do cartão da saída:");
{
  const notaSaida = nota(cartoes[3]);
  ok(!/\d/.test(notaSaida) || !/entraram/.test(notaSaida),
     `a nota do cartão da saída já não traz o número da entrada: "${notaSaida}"`);
  const todasRuns = (f) => {
    const ps = Array.isArray(f.paras) ? f.paras : (f.paras ? [f.paras] : []);
    return ps.flatMap(p => (Array.isArray(p?.runs) ? p.runs
                          : Array.isArray(p) ? p : p ? [p] : []));
  };
  ok(!slide1.some(f => todasRuns(f).some(x => /entraram/.test(String(x?.t || "")))),
     "e a palavra \"entraram\" desapareceu do slide");
}

console.log("\nAs cores dizem o sinal, e dão contraste sobre o creme do cartão:");
{
  // Isto já custou caro uma vez: texto creme sobre fundo creme, invisível.
  const lum = (hex) => { const n = parseInt(hex, 16);
    const [R, G, B] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * R + 0.7152 * G + 0.0722 * B; };
  const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05); };
  ok(valor(cartoes[2]).cor === "1F7A54", "a entrada em verde");
  ok(valor(cartoes[3]).cor === "A93226", "a saída em vermelho");
  for (const [i, nome] of [[0, "abertura"], [1, "hoje"], [2, "entrou"], [3, "saiu"]]) {
    const c = contraste(valor(cartoes[i]).cor, "FBF6EF");
    ok(c >= 4.5, `"${nome}" lê-se sobre o cartão (contraste ${c.toFixed(1)}:1)`);
  }
}

console.log("\nNada transborda do cartão:");
{
  const larg = (s, f, sz) => [...s].reduce((a, ch) => a + (LARGURAS[f][ch] ?? 500), 0) / 1000 * sz;
  for (const c of cartoes) {
    const util = (c.cx - 2 * 0.18) * 72;
    const v = valor(c);
    const w = larg(v.t, "Times-Bold", v.sz);
    ok(w <= util, `"${v.t}" ocupa ${w.toFixed(0)} pt em ${util.toFixed(0)} pt`);
  }
  // E o maior número plausível também, para a alteração não rebentar no dia
  // em que uma empresa tiver um milhão em caixa.
  const util = (cartoes[0].cx - 2 * 0.18) * 72;
  ok(larg("1.234.567,89 €", "Times-Bold", 21) <= util,
     "e um milhão continuaria a caber");
}

console.log("\nOs quatro cabem na folha e não se sobrepõem:");
{
  const X0 = 0.70, X1 = 12.63;
  ok(cartoes[0].x >= X0 - 0.001, "o primeiro arranca na margem");
  const fim = cartoes[3].x + cartoes[3].cx;
  ok(fim <= X1 + 0.001, `o último acaba em ${fim.toFixed(2)} (margem ${X1})`);
  let sobrepoe = 0;
  for (let i = 1; i < cartoes.length; i++)
    if (cartoes[i].x < cartoes[i - 1].x + cartoes[i - 1].cx - 0.001) sobrepoe++;
  ok(sobrepoe === 0, "e nenhum monta em cima do anterior");
}

console.log("\nO caso sem entradas continua a dizer-se:");
{
  const r2 = construirReportCaixa({
    nomeEmpresa: "X", hoje: "2026-11-16", saldoAtual: 100, saldoAnterior: 200, vencido: 0,
    movimentos: [{ data: "2026-11-12", valor: -100, movimento: "a", conta: "a" }],
    nMeses: 6,
  });
  const c2 = gerarReportCaixaPptx(r2).slides[0]
    .filter(f => f.paras && f.fill === "FBF6EF" && f.y > 1.6 && f.y < 1.8)
    .sort((a, b) => a.x - b.x);
  ok(/sem entradas/.test(String(c2[2].paras[2]?.runs?.[0]?.t || c2[2].paras[2]?.[0]?.t || "")),
     "o cartão diz \"sem entradas no período\" em vez de ficar mudo");
  ok((c2[2].paras[1]?.runs?.[0] || c2[2].paras[1]?.[0]).t === "0,00 €",
     "e o valor é 0,00 €, não um espaço em branco");
}

console.log("\nO PDF e o .pptx saem os dois:");
ok(g.pdf?.length > 20000, `PDF com ${Math.round((g.pdf?.length || 0) / 1024)} KB`);
ok(g.dados?.length > 10000, `pptx com ${Math.round((g.dados?.length || 0) / 1024)} KB`);

console.log(mau === 0 ? "\n✅ Cartões da semana OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
