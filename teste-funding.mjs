// Aritmética do funding bancário: uma despesa financiada tem de ficar
// neutralizada no caixa — nem a mais, nem a menos.
//   node teste-funding.mjs
import { temFunding, pctFunding, valorFunding, valorLiquido, linhaFunding, faltamColunas, CATEGORIA_FUNDING } from "./src/funding.js";

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };
const perto = (a, b) => Math.abs(a - b) < 0.005;

console.log("Funding bancário:");

// ── Leitura da marcação ────────────────────────────────────────────────────
ok(temFunding({ funding: true }) === true, "reconhece funding ligado");
ok(temFunding({ funding: false }) === false, "reconhece funding desligado");
ok(temFunding({}) === false, "despesa sem coluna nenhuma não tem funding");
ok(temFunding(null) === false, "aguenta despesa inexistente");
ok(temFunding({ funding: "true" }) === true, "aceita o booleano vindo como texto");

ok(pctFunding({ funding: true }) === 100, "sem percentagem guardada assume 100%");
ok(pctFunding({ funding: true, funding_pct: 70 }) === 70, "lê a percentagem contratada");
ok(pctFunding({ funding: true, funding_pct: 140 }) === 100, "trava a percentagem em 100");
ok(pctFunding({ funding: true, funding_pct: -20 }) === 0, "trava a percentagem em 0");
ok(pctFunding({ funding: true, funding_pct: "abc" }) === 100, "percentagem ilegível → 100%");
ok(pctFunding({ funding: false, funding_pct: 70 }) === 0, "desligado não financia nada");

// ── Valores ────────────────────────────────────────────────────────────────
const total = { funding: true };
const parcial = { funding: true, funding_pct: 70 };
const nada = { funding: false };

ok(perto(valorFunding(total, -80000), 80000), "100%: o banco repõe o valor todo");
ok(perto(valorFunding(parcial, -80000), 56000), "70%: o banco repõe 56.000 de 80.000");
ok(valorFunding(nada, -80000) === 0, "sem funding o banco não entra");
ok(perto(valorFunding(total, 80000), 80000), "o sinal da despesa é indiferente");

ok(perto(valorLiquido(parcial, -80000), 24000), "sobram 24.000 a cargo do projeto");
ok(perto(valorLiquido(nada, -80000), 80000), "sem funding o projeto suporta tudo");

// ── Neutralização no caixa ─────────────────────────────────────────────────
{
  const despesas = [
    { desc: "Empreitada", valor: -80000, fonte: parcial },
    { desc: "Licença",    valor: -15000, fonte: nada },
    { desc: "Estrutura",  valor: -50000, fonte: total },
  ];
  let saidas = 0, entradas = 0;
  despesas.forEach(d => {
    saidas += Math.abs(d.valor);
    const l = linhaFunding(d.fonte, { desc: d.desc, valor: d.valor, natureza: "previsto" });
    if (l) entradas += l.valor;
  });
  // 80.000 + 15.000 + 50.000 = 145.000 de saídas
  // banco: 56.000 + 0 + 50.000 = 106.000
  // esforço do projeto: 39.000 (os 24.000 não financiados + a licença)
  ok(perto(saidas, 145000), `saídas totais 145.000 (${saidas})`);
  ok(perto(entradas, 106000), `entradas do banco 106.000 (${entradas})`);
  ok(perto(saidas - entradas, 39000), `esforço líquido do projeto 39.000 (${saidas - entradas})`);
}

// ── A linha gerada ─────────────────────────────────────────────────────────
{
  const saida = { desc: "Empreitada fase 2", valor: -80000, natureza: "real" };
  const l = linhaFunding(parcial, saida);
  ok(l && l.tipo === "entrada", "a linha do banco é uma entrada");
  ok(l && perto(l.valor, 56000), "com o valor financiado");
  ok(l && l.cat === CATEGORIA_FUNDING, "na categoria de funding");
  ok(l && /Empreitada fase 2/.test(l.desc), "identificando a despesa de origem");
  ok(l && l.natureza === "real", "herdando a natureza da despesa (real/previsto)");
  ok(l && l._funding === true, "marcada como linha de funding");
  ok(linhaFunding(nada, saida) === null, "sem funding não se gera linha nenhuma");
  ok(linhaFunding({ funding: true, funding_pct: 0 }, saida) === null, "0% não gera linha");
}

// ── Deteção de colunas em falta ────────────────────────────────────────────
ok(faltamColunas({ message: `column faturas.funding does not exist` }), "deteta coluna funding em falta");
ok(faltamColunas({ message: "Could not find the 'funding_pct' column of 'faturas' in the schema cache" }),
   "deteta o erro do PostgREST por cache de schema");
ok(!faltamColunas({ message: "network error" }), "não confunde outros erros");

console.log(mau === 0 ? "\n✅ Funding OK" : `\n❌ ${mau} verificação(ões) falharam`);
process.exit(mau ? 1 : 0);
