// O Caixa Único num browser a sério: as caixas de várias escolhas abertas, e
// as listas a encolherem quando se escolhe uma empresa.
//   node teste-caixa-ecra.mjs
import { build } from "esbuild";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright";

const dir = mkdtempSync(join(process.cwd(), "node_modules", ".lpx-caixa-ecra-"));
const SRC = pathToFileURL(join(process.cwd(), "src")).pathname + "/";

writeFileSync(join(dir, "stub-supabase.js"), `
const r = { data: [], error: null };
const q = { select:()=>q, insert:()=>q, update:()=>q, upsert:()=>q, delete:()=>q, eq:()=>q,
            in:()=>q, order:()=>q, range:()=>q, then:(f)=>Promise.resolve(r).then(f) };
export const supabase = { from:()=>q, channel:()=>({on(){return this},subscribe(){return this}}),
                          removeChannel:()=>{} };
export default supabase;`);

// Dois anos, meses variados e categorias distintas por empresa — é disso que
// as listas dos filtros se alimentam.
writeFileSync(join(dir, "stub-hooks.js"), `
export * from "${SRC}hooks.js";
const M = (id, empresa_id, banco, data, movimento, valor, categoria, subcategoria, detalhes) =>
  ({ id, conta_id: empresa_id + "_" + banco, empresa_id, banco, data, movimento, valor,
     saldo: 0, categoria, subcategoria, detalhes, seq: 1 });
const MOVS = [
  M("a1","favcloset","BCP","2026-10-05","TRF COSMIK BRIGADE",-15812.37,"Obra","","Auto 7"),
  M("a2","favcloset","RED","2026-09-30","ENTRADA FUNDING",15812.37,"Funding","",""),
  M("a3","favcloset","BCP","2025-03-12","IMPOSTO SELO",-120.5,"Impostos e Taxas","",""),
  M("b1","adseq","BCP","2026-09-07","TRF PRESTADOR",-2500,"Obras","Gastos com Obras","Empreitada"),
  M("b2","adseq","RED","2025-05-10","SUPRIMENTO SOCIO",48165.88,"Sócios","Suprimentos",""),
  M("c1","pearl","Revolut","2026-01-29","Comissão Revolut",-10,"Encargos financeiros","",""),
];
const RES = Object.freeze({ movimentos: MOVS, loading:false, error:null, reload:()=>{},
  atualizarMovimento: async () => ({ data:[{}], error:null }) });
export const useCaixaUnico = () => RES;
`);

writeFileSync(join(dir, "entrada.jsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import CaixaUnicoView from "SRC/CaixaUnicoView.jsx";
import { EMPRESAS } from "SRC/empresas.js";
const emp = EMPRESAS.filter(e => ["favcloset","adseq","pearl"].includes(e.id));
try { localStorage.removeItem("lpx_caixa_unico_filtros"); } catch {}
createRoot(document.getElementById("r")).render(
  React.createElement("div", { style: { fontFamily: "system-ui,-apple-system,sans-serif",
                                        background: "#F6F0E8", padding: 20, minHeight: "100vh" } },
    React.createElement(CaixaUnicoView, {
      currentUser: { nome: "Felipe", role: "admin" }, empresasVisiveis: emp })));
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
const p = await b.newPage({ viewportSize: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
p.on("pageerror", e => console.log("[pageerror]", e.message));
await p.goto(pathToFileURL(join(dir, "i.html")).href);
await p.waitForTimeout(500);

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };

// A caixa de um filtro, pelo seu rótulo
const caixa = (rot) => p.locator("div").filter({ has: p.locator(`text="${rot}"`) }).last();
// Idempotente: já aberta, deixa-a aberta. `fechar` é o contrário.
const abrir = async (rot, querAberta = true) => {
  await p.evaluate(([r, quer]) => {
    const d = [...document.querySelectorAll("div")].find(x =>
      x.children[0] && (x.children[0].textContent || "").trim().toLowerCase() === r.toLowerCase() &&
      x.querySelector("button"));
    if (!d) return;
    const aberta = !!d.querySelector("input[type=checkbox]");
    if (aberta !== quer) d.querySelector("button").click();
  }, [rot, querAberta]);
  await p.waitForTimeout(150);
};
const fechar = (rot) => abrir(rot, false);
const opcoes = (rot) => p.evaluate((r) => {
  const d = [...document.querySelectorAll("div")].find(x =>
    x.children[0] && (x.children[0].textContent || "").trim().toLowerCase() === r.toLowerCase() &&
    x.querySelector("input[type=checkbox]"));
  return d ? [...d.querySelectorAll("label")].map(l => l.textContent.trim()) : [];
}, rot);
const marcar = async (rot, rotulo) => {
  await p.evaluate(([r, alvo]) => {
    const d = [...document.querySelectorAll("div")].find(x =>
      x.children[0] && (x.children[0].textContent || "").trim().toLowerCase() === r.toLowerCase() &&
      x.querySelector("input[type=checkbox]"));
    const l = [...d.querySelectorAll("label")].find(x => x.textContent.trim() === alvo);
    l.querySelector("input[type=checkbox]").click();
  }, [rot, rotulo]);
  await p.waitForTimeout(150);
};
const nLinhas = () => p.evaluate(() =>
  [...document.querySelectorAll("tbody tr")].filter(tr => tr.querySelectorAll("td").length > 3).length);

console.log("Caixa Único (browser):");
ok(await nLinhas() === 6, `abre com os 6 lançamentos (deu ${await nLinhas()})`);

// ── A categoria com várias escolhas ────────────────────────────────────────
await abrir("Categoria");
const todas = await opcoes("Categoria");
ok(todas.length === 6, `com Todas as empresas, 6 categorias na lista (deu ${todas.length})`);
await marcar("Categoria", "Obra");
await marcar("Categoria", "Obras");
ok(await nLinhas() === 2, "duas categorias marcadas deixam 2 linhas");
await p.screenshot({ path: "/mnt/user-data/outputs/caixa-varios.png" });

await fechar("Categoria");
const resumo = await p.evaluate(() => {
  const d = [...document.querySelectorAll("div")].find(x =>
    x.children[0] && (x.children[0].textContent || "").trim() === "Categoria");
  return d.querySelector("button span").textContent.trim();
});
ok(resumo === "2 selecionados", `o botão resume: "${resumo}"`);

// ── As listas seguem a empresa ─────────────────────────────────────────────
await p.selectOption("select", { index: 0 });                    // Empresa = Todas
await p.waitForTimeout(150);
await p.locator("select").first().selectOption("adseq");
await p.waitForTimeout(250);
// A "Obras" sobrevive \u00e0 troca (a empresa tem-na), a "Obra" \u00e9 largada.
ok(await nLinhas() === 1, `escolher a Admirable Sequence guarda a categoria que ela tem (deu ${await nLinhas()})`);
await abrir("Categoria");
await marcar("Categoria", "Obras");                       // desmarcar
await fechar("Categoria");
ok(await nLinhas() === 2, "sem categoria marcada, as 2 linhas da empresa");

await abrir("Categoria");
const daAd = await opcoes("Categoria");
ok(daAd.length === 2, `e a lista de categorias passa a ter 2 (deu ${daAd.length}: ${daAd.join(", ")})`);
ok(daAd.includes("Obras") && daAd.includes("Sócios"), "as duas que a empresa tem");
ok(!daAd.includes("Obra") && !daAd.includes("Encargos financeiros"),
   "e nenhuma das outras empresas");
await p.screenshot({ path: "/mnt/user-data/outputs/caixa-ambito.png" });

await p.locator("select").first().selectOption("pearl");
await p.waitForTimeout(250);
await abrir("Categoria");
const daPearl = await opcoes("Categoria");
ok(daPearl.length === 1 && daPearl[0] === "Encargos financeiros",
   "a Pearl só oferece a categoria que tem");
await fechar("Categoria");
await abrir("Ano");
const anosPearl = await opcoes("Ano");
await fechar("Ano");
ok(anosPearl.length === 1 && anosPearl[0] === "2026", "e um ano só");

await p.locator("select").first().selectOption("");
await p.waitForTimeout(250);
await abrir("Categoria");
ok((await opcoes("Categoria")).length === 6, "voltar a Todas devolve as 6 categorias");

console.log(mau === 0 ? "\n✅ Caixa Único (ecrã) OK" : `\n❌ ${mau} falha(s)`);
await b.close();
rmSync(dir, { recursive: true, force: true });
process.exit(mau ? 1 : 0);
