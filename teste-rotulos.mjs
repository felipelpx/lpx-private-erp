// Teste de geometria dos rótulos dos gráficos do Investor Relations.
//   node teste-rotulos.mjs
// Reproduz a matemática de cada gráfico e verifica que:
//   · nenhum par de rótulos colocados se sobrepõe;
//   · nenhum rótulo sai fora do viewBox;
//   · a percentagem de valores mostrados é aceitável.
import { larguraGrafico, colocarRotulos, cortaSegmento } from "./src/rotulos.js";

const fmtC = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(2).replace(".", ",") + "M €";
  if (a >= 1e3) return Math.round(v / 1e3) + "k €";
  return Math.round(v) + " €";
};

let falhas = 0;
const ok = (cond, msg) => { if (!cond) { falhas++; console.log("  ✗ " + msg); } };

function verifica(nome, postos, total, { L, A }) {
  // Sobreposições
  let pares = 0;
  for (let i = 0; i < postos.length; i++)
    for (let j = i + 1; j < postos.length; j++) {
      const a = postos[i], b = postos[j];
      if (Math.abs(a.cx - b.cx) * 2 < a.w + b.w && Math.abs(a.cy - b.cy) * 2 < a.h + b.h) {
        pares++;
        if (pares <= 3) console.log(`    ↳ "${a.texto}" × "${b.texto}"`);
      }
    }
  // Fora do viewBox
  const fora = postos.filter(p =>
    p.cx - p.w / 2 < -1 || p.cx + p.w / 2 > L + 1 || p.cy - p.h / 2 < -1 || p.cy + p.h / 2 > A + 1);

  const pct = Math.round(postos.length / total * 100);
  console.log(`${nome}: ${postos.length}/${total} rótulos (${pct}%) · viewBox ${L}×${A}`);
  ok(pares === 0, `${nome}: ${pares} par(es) sobrepostos`);
  ok(fora.length === 0, `${nome}: ${fora.length} rótulo(s) fora do viewBox (${fora.map(f => f.texto).join(", ")})`);
  ok(pct >= 85, `${nome}: só ${pct}% dos valores são mostrados`);
}

// ─── 1. Fluxo futuro: 14 meses, entradas, saídas e saldo projetado ──────────
{
  const meses = [];
  for (let i = 0; i < 14; i++) {
    meses.push({
      rotulo: `${String((i % 12) + 1).padStart(2, "0")}/${2026 + Math.floor(i / 12)}`,
      entradas: i === 8 ? 3550000 : i % 3 === 0 ? 120000 : 0,
      saidas: -(40000 + i * 9000),
    });
  }
  const L = larguraGrafico(meses.length, 84, 940), A = 390;
  const mX = 58, mTopo = 62, mBase = 58, base = A - mTopo - mBase;
  const max = Math.max(...meses.flatMap(m => [m.entradas, Math.abs(m.saidas)]), 1);
  const passo = (L - mX - 16) / meses.length;
  const lb = Math.min(18, passo / 3);
  const zero = mTopo + base / 2;
  const h = (v) => (Math.abs(v) / max) * (base / 2);
  let acc = -200000;
  const saldos = meses.map(m => { acc += m.entradas + m.saidas; return acc; });
  const maxS = Math.max(...saldos.map(Math.abs), 1);
  const yS = (v) => zero - (v / maxS) * (base / 2) * 0.9;

  const cands = [
    ...saldos.map((v, i) => ({
      x: mX + passo * i + passo / 2, y: yS(v), texto: fmtC(v), fontSize: 10,
      cor: "#1a1a2e", alternativas: [-12, 19, -26, 33, -40, 47],
    })),
    ...meses.map((m, i) => (m.entradas > 0 ? {
      x: mX + passo * i + passo / 2 - lb / 2 - 1, y: zero - h(m.entradas) - 6,
      texto: fmtC(m.entradas), fontSize: 10, cor: "#16a34a",
      rot: -90, ancora: "start", alternativas: [0, -9],
    } : null)),
    ...meses.map((m, i) => (Math.abs(m.saidas) > 0 ? {
      x: mX + passo * i + passo / 2 + lb / 2 + 1, y: zero + h(m.saidas) + 6,
      texto: fmtC(m.saidas), fontSize: 10, cor: "#dc2626",
      rot: -90, ancora: "end", alternativas: [0, 9],
    } : null)),
  ];
  const linha = saldos.map((v, i) => ({ x: mX + passo * i + passo / 2, y: yS(v) }));
  const postos = colocarRotulos(cands, { margemX: 1.5, margemY: 2, linhas: [linha], limites: { x0: mX - 6, y0: 2, x1: L - 2, y1: A - 22 } });
  verifica("Fluxo futuro (14 meses)", postos, cands.filter(Boolean).length, { L, A });

  // Quantos rótulos do saldo acabam por cruzar a linha (o contorno branco
  // resolve a legibilidade, mas convém serem poucos)
  const segs = [];
  for (let i = 1; i < linha.length; i++) segs.push([linha[i - 1], linha[i]]);
  const cruzam = postos.filter(p => segs.some(s => cortaSegmento(p, s))).length;
  console.log(`  · ${cruzam} rótulo(s) sobre a linha do saldo (com contorno branco)`);
  ok(cruzam <= 2, `Fluxo futuro: ${cruzam} rótulos por cima da linha do saldo`);
}

// ─── 2. Fluxo futuro denso: 24 meses ────────────────────────────────────────
{
  const meses = Array.from({ length: 24 }, (_, i) => ({
    rotulo: `m${i}`, entradas: i % 4 === 0 ? 900000 : 0, saidas: -(150000 + i * 4000),
  }));
  const L = larguraGrafico(meses.length, 84, 940), A = 390;
  const mX = 58, mTopo = 62, mBase = 58, base = A - mTopo - mBase;
  const max = Math.max(...meses.flatMap(m => [m.entradas, Math.abs(m.saidas)]), 1);
  const passo = (L - mX - 16) / meses.length;
  const lb = Math.min(18, passo / 3);
  const zero = mTopo + base / 2;
  const h = (v) => (Math.abs(v) / max) * (base / 2);
  let acc = 0;
  const saldos = meses.map(m => { acc += m.entradas + m.saidas; return acc; });
  const maxS = Math.max(...saldos.map(Math.abs), 1);
  const yS = (v) => zero - (v / maxS) * (base / 2) * 0.9;
  const cands = [
    ...saldos.map((v, i) => ({ x: mX + passo * i + passo / 2, y: yS(v), texto: fmtC(v), fontSize: 10, cor: "#1a1a2e", alternativas: [-12, 19, -26, 33, -40, 47] })),
    ...meses.map((m, i) => (m.entradas > 0 ? { x: mX + passo * i + passo / 2 - lb / 2 - 1, y: zero - h(m.entradas) - 6, texto: fmtC(m.entradas), fontSize: 10, cor: "#16a34a", rot: -90, ancora: "start", alternativas: [0, -9] } : null)),
    ...meses.map((m, i) => (Math.abs(m.saidas) > 0 ? { x: mX + passo * i + passo / 2 + lb / 2 + 1, y: zero + h(m.saidas) + 6, texto: fmtC(m.saidas), fontSize: 10, cor: "#dc2626", rot: -90, ancora: "end", alternativas: [0, 9] } : null)),
  ];
  const linha = saldos.map((v, i) => ({ x: mX + passo * i + passo / 2, y: yS(v) }));
  const postos = colocarRotulos(cands, { margemX: 1.5, margemY: 2, linhas: [linha], limites: { x0: mX - 6, y0: 2, x1: L - 2, y1: A - 22 } });
  verifica("Fluxo futuro (24 meses)", postos, cands.filter(Boolean).length, { L, A });
}

// ─── 3. Evolução do saldo: 18 pontos ────────────────────────────────────────
{
  const serie = Array.from({ length: 18 }, (_, i) => ({
    rotulo: `m${i}`, saldo: 400000 - i * 55000 + (i % 3) * 30000,
  }));
  const L = Math.max(900, Math.round(70 + serie.length * 78)), A = 330;
  const mX = 58, mTopo = 34, mBase = 52;
  const max = Math.max(...serie.map(p => p.saldo), 0), min = Math.min(...serie.map(p => p.saldo), 0);
  const amp = (max - min) || 1;
  const x = (i) => mX + i / (serie.length - 1) * (L - mX - 22);
  const y = (v) => mTopo + (max - v) / amp * (A - mTopo - mBase);
  const cands = serie.map((p, i) => ({
    x: x(i), y: y(p.saldo), texto: fmtC(p.saldo), fontSize: 11,
    cor: "#4a6fa5", alternativas: [-13, 20, -27, 34, -41],
  }));
  const postos = colocarRotulos(cands, {
    margemX: 4, margemY: 3, linhas: [serie.map((p, i) => ({ x: x(i), y: y(p.saldo) }))],
    limites: { x0: mX - 6, y0: 2, x1: L - 2, y1: A - 24 },
  });
  verifica("Evolução do saldo (18 pontos)", postos, cands.length, { L, A });
}

// ─── 4. Recebíveis: 12 meses, duas barras por mês ───────────────────────────
{
  const meses = Array.from({ length: 12 }, (_, i) => ({
    rotulo: `m${i}`, real: i < 6 ? 80000 + i * 12000 : 0, projetado: 95000 + i * 15000,
  }));
  const L = larguraGrafico(meses.length, 76, 900), A = 310;
  const mX = 54, mTopo = 64, mBase = 32;
  const max = Math.max(...meses.flatMap(m => [m.real, m.projetado]), 1);
  const passo = (L - mX - 16) / meses.length;
  const lb = Math.min(20, passo / 2.8);
  const y = (v) => mTopo + (1 - v / max) * (A - mTopo - mBase);
  const cands = [
    ...meses.map((m, i) => (m.real > 0 ? { x: mX + passo * i + passo / 2 - lb / 2 - 2, y: y(m.real) - 5, texto: fmtC(m.real), fontSize: 10, cor: "#16a34a", rot: -90, ancora: "start", alternativas: [0, -9] } : null)),
    ...meses.map((m, i) => (m.projetado > 0 ? { x: mX + passo * i + passo / 2 + lb / 2 + 2, y: y(m.projetado) - 5, texto: fmtC(m.projetado), fontSize: 10, cor: "#4a6fa5", rot: -90, ancora: "start", alternativas: [0, -9] } : null)),
  ];
  const postos = colocarRotulos(cands, { margemX: 1.5, margemY: 2, limites: { x0: mX - 6, y0: 2, x1: L - 2, y1: A - 22 } });
  verifica("Recebíveis (12 meses)", postos, cands.filter(Boolean).length, { L, A });
}

// ─── 5. Cascata: saldo inicial + 5 entradas + 6 saídas + final ──────────────
{
  const entradas = Array.from({ length: 5 }, (_, i) => ({ nome: `E${i}`, valor: 300000 - i * 40000 }));
  const saidas = Array.from({ length: 6 }, (_, i) => ({ nome: `S${i}`, valor: -(180000 - i * 20000) }));
  const largura = larguraGrafico(entradas.length + saidas.length + 2, 88, 900);
  const altura = 300, margemY = 40, margemX = 10;
  const passos = [{ valor: 250000, tipo: "total" }, ...entradas.map(e => ({ valor: e.valor, tipo: "entrada" })),
                  ...saidas.map(e => ({ valor: -Math.abs(e.valor), tipo: "saida" })), { valor: 900000, tipo: "total" }];
  let acc = 0;
  const barras = passos.map(p => {
    if (p.tipo === "total") { const b = { ...p, base: 0, topo: p.valor }; acc = p.valor; return b; }
    const base = acc; acc += p.valor; return { ...p, base, topo: acc };
  });
  const vals = barras.flatMap(b => [b.base, b.topo]).concat([0]);
  const max = Math.max(...vals), min = Math.min(...vals), amp = (max - min) || 1;
  const y = (v) => margemY + (max - v) / amp * (altura - margemY * 2);
  const passo = (largura - margemX * 2) / barras.length;
  const cands = barras.map((b, i) => ({
    x: margemX + passo * i + passo / 2, y: y(Math.max(b.base, b.topo)) - 7,
    texto: fmtC(b.valor), fontSize: 10.5, cor: "#4a6fa5", alternativas: [0, -14, -28, -42],
  }));
  const postos = colocarRotulos(cands, { margemX: 3, margemY: 2, limites: { x0: 2, y0: 2, x1: largura - 2, y1: altura - 34 } });
  verifica("Cascata (13 barras)", postos, cands.length, { L: largura, A: altura });
}

console.log(falhas === 0 ? "\n✅ Geometria dos rótulos OK" : `\n❌ ${falhas} verificação(ões) falharam`);
process.exit(falhas === 0 ? 0 : 1);
