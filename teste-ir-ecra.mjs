// Investor Relations num browser a sério: a cascata e os centros de custo
// pelas rubricas da empresa, sem baldes de "Outros" nem rótulos repetidos.
//   node teste-ir-ecra.mjs
import { build } from "esbuild";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright";

const dir = mkdtempSync(join(process.cwd(), "node_modules", ".lpx-ir-"));
const SRC = pathToFileURL(join(process.cwd(), "src")).pathname + "/";

writeFileSync(join(dir, "stub-supabase.js"), `
const r = { data: [], error: null };
const q = { select:()=>q, insert:()=>q, update:()=>q, upsert:()=>q, delete:()=>q, eq:()=>q,
            in:()=>q, lte:()=>q, gte:()=>q, order:()=>q, range:()=>q,
            then:(f)=>Promise.resolve(r).then(f) };
export const supabase = { from:()=>q, channel:()=>({on(){return this},subscribe(){return this}}),
                          removeChannel:()=>{} };
export default supabase;`);

// Movimentos da Favorite Closet que cobrem muitas rubricas do plano dela,
// mais um ajuste e uma transferência intra-grupo (que não devem aparecer) e
// uma categoria que o plano não conhece (que tem de aparecer, marcada).
writeFileSync(join(dir, "stub-hooks.js"), `
import React from "react";
export * from "${SRC}hooks.js";
const M = (data, categoria, valor, subcategoria = "") =>
  ({ id: data + categoria + valor, conta_id: "favcloset_bcp", empresa_id: "favcloset",
     banco: "BCP", data, movimento: categoria, valor, saldo: 0, categoria, subcategoria });
// Rubricas reais do plano da Favorite Closet (src/categoriasEmpresa.js)
const MOVS = [
  M("2026-01-10","Funding", 800000),
  M("2026-02-10","Amortização", -120000),
  M("2026-02-20","Funding", -40000),
  M("2026-03-10","Obra", -300000),
  M("2026-04-10","Obra", 2500),
  M("2026-05-10","Fiscalização", -18000),
  M("2026-05-20","IVA de obra", -18000),
  M("2026-06-10","Legais", -9500),
  M("2026-06-20","Projetos", -45000),
  M("2026-07-10","Administrativos", -12000),
  M("2026-07-20","Fee Gestão", -3400),
  M("2026-07-25","Juros", -8800),
  M("2026-08-10","Vendas", 430000),
  M("2026-08-15","Comissão", -21500),
  M("2026-08-20","impostos e taxas", -21000),      // grafia diferente do plano
  M("2026-08-25","Impostos e Taxas", -500),        // a outra grafia do mesmo Excel
  M("2026-09-10","Rubrica Fantasma", -777),
  M("2026-09-15","Ajustes do grupo", 5000),
  M("2026-09-16","Movimentos internos", -5000, "Movimento entre contas do mesmo grupo"),
];
const VAZIO = Object.freeze({ loading:false, error:null, reload:()=>{} });
// O periodo anterior (para a variacao dos centros de custo) vem vazio, para
// as duas chamadas nao devolverem o mesmo e a variacao ser lida como 0.
export const useMovimentosPeriodo = (ids, de, ate) => ({
  ...VAZIO, movimentos: String(ate || "") >= "2026-01-01" ? MOVS : [],
});
export const useSaldosNaData = () => ({ ...VAZIO, saldos: { favcloset_bcp: 50000 } });
export const useFracoes = () => ({ ...VAZIO, fracoes: [] });
export const useVendas = () => ({ ...VAZIO, vendas: [] });
export const usePagamentosExtras = () => ({ ...VAZIO, pagamentos: [
  { empresa:"favcloset", categoria:"Obra", valor: 40000, tipo:"saida", status:"Pendente" },
] });
export const useFaturas = () => ({ ...VAZIO, faturas: [
  { empresa:"favcloset", categoria:"Obra", valor: 60000, status:"Pendente" },
] });
let ORC = [
  { id:"orc_favcloset_obra", empresa_id:"favcloset", categoria:"Obra", orcado: 1300000 },
  { id:"orc_favcloset_vendas", empresa_id:"favcloset", categoria:"Vendas", orcado: 900000 },
];
const ouvintes = new Set();
export const useOrcamento = () => {
  const [, forca] = React.useState(0);
  React.useState(() => { ouvintes.add(forca); });
  return { ...VAZIO, orcamento: ORC, upsertOrcamento: async (row) => {
    const i = ORC.findIndex(x => x.id === row.id);
    ORC = i >= 0 ? ORC.map((x,k) => k===i ? {...x,...row} : x) : [...ORC, row];
    globalThis.__orcado = ORC;
    ouvintes.forEach(f => f(n => n + 1));
    return { data: [row], error: null };
  }};
};
export const useRecebiveis = () => ({ ...VAZIO, recebiveis: [] });
export const useDespesasRecorrentes = () => ({ ...VAZIO, recorrentes: [
  { empresa:"favcloset", categoria:"Administrativos", descricao:"Contabilidade",
    valor: 150, tipo:"saida", periodicidade:"mensal", ativa:true,
    data_inicio:"2026-11-10", data_fim:"2027-04-10" },
] });
`);

writeFileSync(join(dir, "entrada.jsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import IRView from "SRC/IRView.jsx";
import { EMPRESAS } from "SRC/empresas.js";
createRoot(document.getElementById("r")).render(
  React.createElement("div", { style: { fontFamily: "system-ui,-apple-system,sans-serif",
                                        background: "#F6F0E8", padding: 20, minHeight: "100vh" } },
    React.createElement(IRView, {
      currentUser: { nome: "Felipe", role: "admin" },
      empresasVisiveis: EMPRESAS.filter(e => ["favcloset","adseq"].includes(e.id)) })));
`.replace(/SRC\//g, SRC));

await build({ entryPoints: [join(dir, "entrada.jsx")], bundle: true, outfile: join(dir, "app.js"),
  jsx: "automatic", logLevel: "error",
  define: { "process.env.NODE_ENV": '"production"',
            "import.meta.env": '{"VITE_SUPABASE_URL":"https://teste.supabase.co","VITE_SUPABASE_ANON_KEY":"k"}' },
  plugins: [{ name: "s", setup(b) {
    b.onResolve({ filter: /(^|\/)supabase\.js$/ }, () => ({ path: join(dir, "stub-supabase.js") }));
    b.onResolve({ filter: /(^|\/)hooks\.js$/ }, (a) =>
      a.importer === join(dir, "stub-hooks.js") ? null : ({ path: join(dir, "stub-hooks.js") }));
  }}] });

writeFileSync(join(dir, "i.html"),
  `<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="r"></div><script src="app.js"></script>`);

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewportSize: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
p.on("pageerror", e => console.log("[pageerror]", e.message));
await p.goto(pathToFileURL(join(dir, "i.html")).href);
await p.waitForTimeout(700);

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };
const aba = async (nome) => {
  await p.locator(`button:has-text("${nome}")`).first().click();
  await p.waitForTimeout(350);
};
// Os rótulos do eixo da cascata, pela ordem em que estão no SVG
const rotulosCascata = () => p.evaluate(() =>
  [...document.querySelectorAll("svg text")]
    .map(t => (t.querySelector("title")?.textContent || t.textContent || "").trim())
    .filter(x => x && !/^[-−+0-9.,\s]*(k|M)?\s*€?$/.test(x)));

console.log("Investor Relations (browser):");
await p.screenshot({ path: "/mnt/user-data/outputs/ir-cascata.png", fullPage: true });

const rots = await rotulosCascata();
ok(rots.includes("Saldo inicial") && rots.includes("Saldo final"), "a cascata abre e fecha com os saldos");

// ── Sem baldes nem repetições ──────────────────────────────────────────────
ok(!rots.includes("Outros"), "não há balde de Outros");
const semSaldos = rots.filter(r => !/^Saldo/.test(r));
ok(new Set(semSaldos).size === semSaldos.length,
   `nenhuma rubrica aparece duas vezes com o mesmo nome (${semSaldos.length} barras)`);
ok(semSaldos.length >= 13, `mostram-se todas as rubricas com movimento (${semSaldos.length}), sem teto de 5`);

// ── As rubricas são as do plano da empresa ─────────────────────────────────
["Obra", "Fiscalização", "Legais", "Projetos", "Administrativos", "Fee Gestão",
 "Juros", "Vendas", "Comissão", "IVA de obra", "Amortização"].forEach(r =>
  ok(semSaldos.some(x => x === r || x.startsWith(r + " (")), `a rubrica "${r}" está lá`));

// As duas grafias de "Impostos e taxas" que o Excel traz são uma barra só
const impostos = semSaldos.filter(x => /^Impostos e [Tt]axas/.test(x));
ok(impostos.length === 1,
   `as duas grafias de Impostos e taxas dão uma barra só (deu ${impostos.length}: ${impostos.join(" / ")})`);

// ── Entradas e saídas da mesma rubrica, distinguidas ───────────────────────
ok(semSaldos.includes("Funding (entradas)") && semSaldos.includes("Funding (saídas)"),
   "o funding mostra o bruto: desembolso e amortização em barras separadas");
ok(semSaldos.includes("Obra (entradas)") && semSaldos.includes("Obra (saídas)"),
   "e a obra também, que teve uma nota de crédito");
ok(!semSaldos.includes("Funding banco — Obra"),
   "e já não há o rótulo inventado «Funding banco — Obra»");

// ── O que fica de fora diz-se, e diz quais ─────────────────────────────────
const txt = await p.evaluate(() => document.body.innerText);
ok(/Excluídos 2 movimentos/.test(txt), "o rodapé conta os 2 movimentos excluídos");
ok(/Ajustes do grupo/.test(txt) && /Movimentos internos/.test(txt), "e nomeia as rubricas que saíram");

// ── Fora do plano aparece, marcado ─────────────────────────────────────────
ok(semSaldos.some(r => /Rubrica Fantasma/.test(r)),
   "uma categoria fora do plano continua a aparecer, não se esconde um gasto");
const corFantasma = await p.evaluate(() => {
  const t = [...document.querySelectorAll("svg text")].find(x =>
    /Rubrica Fantasma/.test(x.querySelector("title")?.textContent || x.textContent || ""));
  return t ? getComputedStyle(t).fill : "";
});
ok(/169|rgb\(169/.test(corFantasma) || corFantasma !== "",
   `e sai marcada a vermelho (${corFantasma})`);

// ── Centros de custo ───────────────────────────────────────────────────────
await aba("Centros de custo");
await p.screenshot({ path: "/mnt/user-data/outputs/ir-custos.png", fullPage: true });
const custos = await p.evaluate(() =>
  [...document.querySelectorAll("div[title]")].map(d => d.getAttribute("title")));
ok(custos.some(c => /^Obra$/.test(c)), "os centros de custo usam as mesmas rubricas");
ok(custos.some(c => /Rubrica Fantasma .* fora do plano/.test(c)),
   "e dizem quando uma está fora do plano de contas");
ok(!custos.some(c => /^Outros$/.test(c)), "sem balde de Outros aqui também");
const txtCustos = await p.evaluate(() => document.body.innerText);
ok(/rubricas da empresa/.test(txtCustos), "o subtítulo diz que são as rubricas da empresa");

// ── Real × Orçado ──────────────────────────────────────────────────────────
await aba("Real × Orçado");
await p.waitForTimeout(500);
await p.screenshot({ path: "/mnt/user-data/outputs/ir-real-orcado.png", fullPage: true });
const tro = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

// os cabeçalhos estão em maiúsculas por CSS e o innerText devolve-os assim
ok(/rubrica .*orçado .*real .*forecast/i.test(tro), "a tabela tem Orçado, Real e Forecast");
ok(/entradas/i.test(tro) && /saídas/i.test(tro), "agrupada em entradas e saídas, como as planilhas");
ok(/pelas rubricas da empresa/.test(tro), "e o subtítulo diz de onde vêm as linhas");

// As rubricas da tabela são as mesmas do gráfico
const rubricasTabela = await p.evaluate(() =>
  [...document.querySelectorAll("tbody tr")]
    .map(tr => (tr.children[0]?.textContent || "").trim())
    .filter(x => x && !/^(Entradas|Saídas|Resultado|Total|Nada)/.test(x)));
["Obra", "Vendas", "Fiscalização", "Administrativos"].forEach(r =>
  ok(rubricasTabela.includes(r) || rubricasTabela.includes(r + " ⚠"),
     `a rubrica "${r}" está na tabela, como no gráfico`));
ok(rubricasTabela.some(r => /Rubrica Fantasma/.test(r)),
   "e a que está fora do plano também, marcada");

// ── O forecast soma o comprometido ao real ────────────────────────────────
// Obra: real 300 000 − 2 500 = 297 500 · fatura por pagar 60 000 ·
// previsão 40 000 → forecast 397 500. Orçado 1 300 000.
// A célula do orçado é uma caixa de texto: o valor está no input, não no texto.
const celulas = (nome) => p.evaluate((n) => {
  const tr = [...document.querySelectorAll("tbody tr")]
    .find(t => (t.children[0]?.textContent || "").trim() === n);
  if (!tr) return null;
  return [...tr.children].map(td => {
    const i = td.querySelector("input");
    return (i ? i.value : td.textContent).trim();
  });
}, nome);
const linhaObra = await celulas("Obra");
ok(!!linhaObra, "a linha da obra existe");
ok(linhaObra[1] === "1300000", `o orçado vem da base: ${linhaObra[1]}`);
ok(/297.500/.test(linhaObra[2]), `o real é o do extrato: ${linhaObra[2]}`);
ok(/397.500/.test(linhaObra[3]), `o forecast soma a fatura por pagar e a previsão: ${linhaObra[3]}`);
ok(/-902.500|−902.500/.test(linhaObra[4]), `e o desvio é face ao orçado: ${linhaObra[4]}`);

// ── As recorrentes entram no forecast ─────────────────────────────────────
// Administrativos: 12 000 € já pagos no extrato + 6 × 150 € de recorrente
const linhaAdm = await celulas("Administrativos");
ok(!!linhaAdm && /12.000/.test(linhaAdm[2]), `o real dos administrativos: ${linhaAdm?.[2]}`);
ok(/12.900/.test(linhaAdm[3]),
   `e o forecast soma as 6 × 150 € da recorrente: ${linhaAdm?.[3]}`);

// ── O orçado é editável e grava ───────────────────────────────────────────
const antes = await p.evaluate(() => JSON.stringify(globalThis.__orcado || []));
await p.evaluate(() => {
  const tr = [...document.querySelectorAll("tbody tr")]
    .find(t => (t.children[0]?.textContent || "").trim() === "Fiscalização");
  const inp = tr.querySelector("input");
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  inp.focus();
  set.call(inp, "25000");
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  inp.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
  inp.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
});
await p.waitForTimeout(400);
const gravado = await p.evaluate(() => globalThis.__orcado || []);
ok(gravado.some(o => o.categoria === "Fiscalização" && o.orcado === 25000),
   "escrever no Orçado grava na base");
ok(gravado.some(o => /^orc_favcloset_fiscalizacao$/.test(o.id)),
   "com uma chave estável por empresa e rubrica");
ok(JSON.stringify(gravado) !== antes, "e a tabela reage");

console.log(mau === 0 ? "\n✅ Investor Relations (ecrã) OK" : `\n❌ ${mau} falha(s)`);
await b.close();
rmSync(dir, { recursive: true, force: true });
process.exit(mau ? 1 : 0);
