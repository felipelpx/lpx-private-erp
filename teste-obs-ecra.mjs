// A observação de uma fatura: cortada na coluna, inteira ao passar o rato.
//   node teste-obs-ecra.mjs
import { build } from "esbuild";
import { comCauda } from "./testes/stubHooks.mjs";
import { writeFileSync, mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright";

const SAIDA = existsSync("/mnt/user-data/outputs") ? "/mnt/user-data/outputs" : "/tmp";
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".shobs-"));

const OBS_LONGA = "Execução da empreitada — auto n.º 7, trabalhos de estrutura do piso -1, " +
  "com retenção de 5% nos termos do contrato. Confirmado pela fiscalização em 28/09.";

writeFileSync(join(dir, "stub-supabase.js"), `
const r = { data: [], error: null };
const q = { select:()=>q, insert:()=>q, update:()=>q, upsert:()=>q, delete:()=>q, eq:()=>q, in:()=>q,
  order:()=>q, limit:()=>q, single:()=>Promise.resolve(r), then:(f)=>Promise.resolve(r).then(f) };
export const supabase = { from:()=>q, channel:()=>({on(){return this},subscribe(){return this}}),
  removeChannel:()=>{},
  auth:{ getSession:()=>Promise.resolve({data:{session:null}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) } };
export default supabase;`);

writeFileSync(join(dir, "stub-hooks.js"), comCauda(`
export const useMapasPagamento = () => ({ mapas: [], loading:false, addMapa: async()=>({}),
  updateMapa: async()=>({}), deleteMapa: async()=>({}) });
export const useMapaItens = () => ({ itens: [], loading:false });
export const useFaturas = () => ({ faturas: [], loading:false });
`));

const faturas = [
  { id: "f1", fatura: "FT 2026/233", fornecedor: "COSMIK BRIGADE, LDA", empresa: "favcloset",
    categoria: "Obra", valor: 15812.37, vencimento: "2026-09-30", status: "Pendente",
    obs: OBS_LONGA },
  { id: "f2", fatura: "FT 2026/63", fornecedor: "CHIASSO, RODRIGUES", empresa: "favcloset",
    categoria: "Fiscalização", valor: 1476, vencimento: "2026-10-10", status: "Pago",
    obs: "Serviço de fiscalização de setembro" },
  { id: "f3", fatura: "FT 2026/99", fornecedor: "White Helmet", empresa: "favcloset",
    categoria: "Obra", valor: 430.50, vencimento: "2026-10-30", status: "Pago", obs: "" },
];

writeFileSync(join(dir, "entrada.jsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import { ContasPagar } from "SRC/App.jsx";
import { EMPRESAS } from "SRC/empresas.js";
createRoot(document.getElementById("r")).render(
  React.createElement("div", { style:{ fontFamily:"system-ui,-apple-system,sans-serif", padding:14 } },
    React.createElement(ContasPagar, {
      canEdit: true, EMPRESAS: EMPRESAS,
      faturas: ${JSON.stringify(faturas)},
      setFaturas: ()=>{}, addFatura: async()=>({}), updateFatura: async()=>({}),
      deleteFatura: async()=>({}),
    })));
`.replace(/SRC\//g, pathToFileURL(join(process.cwd(), "src")).pathname + "/"));

await build({
  entryPoints: [join(dir, "entrada.jsx")], bundle: true, outfile: join(dir, "app.js"),
  jsx: "automatic", logLevel: "error", define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "s", setup(b) {
    b.onResolve({ filter: /(^|\/)supabase\.js$/ }, () => ({ path: join(dir, "stub-supabase.js") }));
    b.onResolve({ filter: /(^|\/)hooks\.js$/ },    () => ({ path: join(dir, "stub-hooks.js") }));
  } }],
});
writeFileSync(join(dir, "i.html"),
  `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#FCF3EB"><div id="r"></div><script src="app.js"></script>`);

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewportSize: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
const erros = [];
p.on("pageerror", e => { erros.push(e.message); console.log("[pageerror]", e.message); });
await p.goto(pathToFileURL(join(dir, "i.html")).href);
await p.waitForTimeout(600);

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };
const corpo = () => p.evaluate(() => document.body.innerText);

console.log("A observação ao passar o rato (browser):");
ok(erros.length === 0, "o ecrã monta sem erros de consola");

// ── Cortada na tabela ───────────────────────────────────────────────────────
const celula = p.locator("tbody tr", { hasText: "COSMIK" }).first().locator("td").nth(11);
const cortada = await celula.evaluate(el => {
  const span = el.querySelector("span");
  return { largura: span.scrollWidth > span.clientWidth, overflow: getComputedStyle(span).textOverflow };
});
ok(cortada.overflow === "ellipsis", "na coluna a observação vem cortada com reticências");
ok(cortada.largura === true, "o texto é mesmo maior do que a célula");

// ── Inteira ao passar o rato ────────────────────────────────────────────────
const painel = () => p.evaluate(() => {
  const el = [...document.querySelectorAll("span")]
    .find(x => getComputedStyle(x).position === "fixed" && /auto n\.º 7/.test(x.textContent || ""));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { texto: el.textContent.trim(), x: r.left, y: r.top, largura: r.width, altura: r.height,
           quebra: cs.whiteSpace, vw: window.innerWidth, vh: window.innerHeight };
});
ok(await painel() === null, "sem o rato em cima, não há painel nenhum");

await celula.hover();
await p.waitForTimeout(300);
const pn = await painel();
ok(!!pn, "passar o rato abre o painel");
ok(pn && pn.texto.includes("retenção de 5%") && pn.texto.includes("28/09"),
   "com a observação toda, até ao fim");
ok(pn && pn.quebra === "pre-wrap", "e o texto quebra em linhas, em vez de voltar a ser cortado");
ok(pn && pn.altura > 30, `o painel tem mais do que uma linha (${Math.round(pn?.altura || 0)}px)`);
ok(pn && pn.x >= 0 && pn.x + pn.largura <= pn.vw + 1,
   `e cabe dentro do ecrã (${Math.round(pn?.x)}…${Math.round(pn?.x + pn?.largura)} de ${pn?.vw})`);
await p.screenshot({ path: join(SAIDA, "obs-hover.png") });

// a tabela não se mexe por causa do painel
const largura = async () => p.evaluate(() => document.querySelector("table").getBoundingClientRect().width);
const larguraComPainel = await largura();
await p.mouse.move(5, 5);
await p.waitForTimeout(300);
ok(await painel() === null, "tirar o rato fecha o painel");
ok(Math.abs(await largura() - larguraComPainel) < 1, "e a tabela nunca se mexe");

// ── Uma observação curta também se lê, e uma vazia não inventa painel ───────
const curta = p.locator("tbody tr", { hasText: "CHIASSO" }).first().locator("td").nth(11);
await curta.hover();
await p.waitForTimeout(300);
let t = await corpo();
ok((t.match(/fiscalização de setembro/gi) || []).length >= 1,
   "a observação curta também abre");

const vazia = p.locator("tbody tr", { hasText: "White Helmet" }).first().locator("td").nth(11);
ok((await vazia.innerText()).trim() === "—", "sem observação, fica um traço");
await vazia.hover();
await p.waitForTimeout(250);
const abriuVazio = await p.evaluate(() => [...document.querySelectorAll("span")]
  .filter(x => getComputedStyle(x).position === "fixed").length);
ok(abriuVazio === 0, "e passar o rato por cima não abre painel nenhum");

await b.close();
rmSync(dir, { recursive: true, force: true });
console.log(mau === 0 ? "✅ Observação (ecrã) OK" : `❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
