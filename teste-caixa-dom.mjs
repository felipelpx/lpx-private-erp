// O Caixa Único em DOM real: os filtros, os totais, a edição que grava no
// extrato e o que um viewer não pode fazer.
//   node teste-caixa-dom.mjs
import { build } from "esbuild";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { JSDOM } from "jsdom";

const SRC = pathToFileURL(join(process.cwd(), "src")).pathname + "/";
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".lpx-caixa-"));

writeFileSync(join(dir, "stub-supabase.js"), `
const r = { data: [], error: null };
const q = { select:()=>q, insert:()=>q, update:()=>q, upsert:()=>q, delete:()=>q, eq:()=>q,
  in:()=>q, order:()=>q, range:()=>q, then:(f)=>Promise.resolve(r).then(f) };
export const supabase = { from:()=>q, channel:()=>({on(){return this},subscribe(){return this}}), removeChannel:()=>{} };
export default supabase;
`);

writeFileSync(join(dir, "stub-hooks.js"), `
export * from "${SRC}hooks.js";
globalThis.__gravados = [];
const MOVS = [
  { id:"a1", conta_id:"favcloset_bcp", empresa_id:"favcloset", banco:"BCP", data:"2026-10-05",
    movimento:"TRF COSMIK BRIGADE", valor:-15812.37, saldo:716.96, categoria:"Obra", subcategoria:"", detalhes:"Auto 7", seq:723 },
  { id:"a2", conta_id:"favcloset_red", empresa_id:"favcloset", banco:"RED", data:"2026-09-30",
    movimento:"ENTRADA FUNDING", valor:15812.37, saldo:10314.84, categoria:"Funding", subcategoria:"", detalhes:"", seq:700 },
  { id:"b1", conta_id:"adseq_bcp", empresa_id:"adseq", banco:"BCP", data:"2026-09-07",
    movimento:"TRF PRESTADOR", valor:-2500, saldo:30.20, categoria:"Obras", subcategoria:"Gastos com Obras", detalhes:"Empreitada", seq:338 },
  { id:"b2", conta_id:"adseq_red", empresa_id:"adseq", banco:"RED", data:"2025-05-10",
    movimento:"SUPRIMENTO SOCIO", valor:48165.88, saldo:12209.02, categoria:"Sócios", subcategoria:"Suprimentos", detalhes:"", seq:120 },
  { id:"c1", conta_id:"pearl_revolut", empresa_id:"pearl", banco:"Revolut", data:"2026-01-29",
    movimento:"Comissão da Revolut Business", valor:-10, saldo:-8, categoria:"Encargos financeiros", subcategoria:"", detalhes:"", seq:180 },
];
const RES = Object.freeze({ movimentos: MOVS, loading:false, error:null, reload:()=>{},
  atualizarMovimento: async (id, campos) => { globalThis.__gravados.push({ id, campos }); return { data:[{}], error:null }; } });
export const useCaixaUnico = () => RES;
`);

writeFileSync(join(dir, "entrada.jsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import CaixaUnicoView from "SRC/CaixaUnicoView.jsx";
import { EMPRESAS } from "SRC/empresas.js";

const emp = EMPRESAS.filter(e => ["favcloset","adseq","pearl"].includes(e.id));
const gestor = { id:"u1", nome:"Felipe", role:"gestor" };
const viewer = { id:"u2", nome:"Olho", role:"viewer" };

let mau = 0;
const ok = (c, m) => { console.log((c?"  \\u2713 ":"  \\u2717 ")+m); if(!c) mau++; };
const txt = (el) => (el.textContent || "").trim();

async function monta(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(CaixaUnicoView, props)); });
  return { host, root };
}
const limpa = async (r) => { if (r) await act(async () => { r.root.unmount(); r.host.remove(); }); };
const muda = async (el, v) => { await act(async () => {
  const proto = el.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  el.dispatchEvent(new window.Event("change", { bubbles: true }));
  el.dispatchEvent(new window.Event("input", { bubbles: true })); }); };
const linhas = (host) => [...host.querySelectorAll("tbody tr")].filter(tr => tr.querySelectorAll("td").length > 3);
const caixaFiltro = (host, rot) => [...host.querySelectorAll("div")].find(x =>
  x.children[0] && txt(x.children[0]).toLowerCase() === rot.toLowerCase() &&
  x.querySelector("select, input, button"));
const filtro = (host, rot) => {
  const d = caixaFiltro(host, rot);
  return d ? d.querySelector("select, input") : null;
};
// Categoria, subcategoria, ano e mes sao caixas de varias escolhas: um botao
// que abre uma lista de vistos. Estes ajudantes abrem-na e marcam/desmarcam.
const clicar = async (el) => { await act(async () => {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }); };
const abrirVarios = async (host, rot) => {
  const d = caixaFiltro(host, rot);
  if (!d) throw new Error("sem caixa de filtro: " + rot);
  if (!d.querySelector('input[type=checkbox]')) await clicar(d.querySelector("button"));
  return caixaFiltro(host, rot);
};
const opcoesVarios = async (host, rot) =>
  [...(await abrirVarios(host, rot)).querySelectorAll("label")].map(l => txt(l));
const marcar = async (host, rot, ...rotulos) => {
  for (const r of rotulos) {
    const d = await abrirVarios(host, rot);
    const l = [...d.querySelectorAll("label")].find(x => txt(x) === r);
    if (!l) throw new Error('sem opcao "' + r + '" em ' + rot);
    // .click() nativo: o React 18 ouve o clique nas caixas de visto, e assim
    // o seu rastreador de valor nao fica a dizer que nada mudou.
    const cx = l.querySelector("input[type=checkbox]");
    await act(async () => { cx.click(); });
  }
};
const botaoVarios = async (host, rot, nome) => {
  const d = await abrirVarios(host, rot);
  const b = [...d.querySelectorAll("button")].find(x => txt(x) === nome);
  if (b) await clicar(b);
};
const limparVarios = (host, rot) => botaoVarios(host, rot, "Limpar");
// O resumo \u00e9 o primeiro <span> do bot\u00e3o; o segundo \u00e9 a setinha.
const resumoVarios = (host, rot) =>
  txt(caixaFiltro(host, rot).querySelector("button span"));
// O texto da tabela, sem o das caixas de filtro (que listam todas as empresas).
const corpo = (host) => linhas(host).map(txt).join(" | ");

const base = { currentUser: gestor, empresasVisiveis: emp };

// ── Tudo junto ─────────────────────────────────────────────────────────────
{
  const r = await monta(base);
  const t = txt(r.host);
  ok(/Caixa \\u00danico/.test(t), "o ecr\\u00e3 abre");
  ok(linhas(r.host).length === 5, \`mostra os 5 lan\\u00e7amentos de todas as empresas (deu \${linhas(r.host).length})\`);
  ok(/Favorite Closet/.test(t) && /Admirable Sequence/.test(t) && /Pearl Syntax/.test(t),
     "de tr\\u00eas empresas diferentes, lado a lado");
  ok(/BCP/.test(t) && /RED/.test(t) && /Revolut/.test(t), "e de bancos diferentes");
  // entradas 15 812,37 + 48 165,88 = 63 978,25 ; saídas -18 322,37
  ok(/63\\.978,25/.test(t), "soma as entradas");
  ok(/18\\.322,37/.test(t), "soma as sa\\u00eddas");
  ok(/45\\.655,88/.test(t), "e d\\u00e1 o l\\u00edquido");
  await limpa(r);
}

// ── Filtros ────────────────────────────────────────────────────────────────
{
  const r = await monta(base);
  const sel = filtro(r.host, "Empresa");
  ok(!!sel, "tem filtro de empresa");
  await muda(sel, "adseq");
  ok(linhas(r.host).length === 2, "filtrar por empresa deixa 2 linhas");
  ok(!/Favorite Closet/.test(corpo(r.host)), "e tira as das outras");
  await muda(sel, "");

  const banco = filtro(r.host, "Banco");
  await muda(banco, "Revolut");
  ok(linhas(r.host).length === 1, "filtrar por banco deixa 1");
  await muda(banco, "");

  await marcar(r.host, "Ano", "2025");
  ok(linhas(r.host).length === 1, "filtrar por ano deixa 1");
  await limparVarios(r.host, "Ano");
  ok(linhas(r.host).length === 5, "e limpar devolve as 5");

  await marcar(r.host, "M\u00eas", "setembro");
  ok(linhas(r.host).length === 2, "filtrar por m\u00eas (setembro) deixa 2");
  await limparVarios(r.host, "M\u00eas");

  await marcar(r.host, "Categoria", "Obras");
  ok(linhas(r.host).length === 1, "filtrar por categoria deixa 1");
  await limparVarios(r.host, "Categoria");

  const proc = filtro(r.host, "Procurar na descri\\u00e7\\u00e3o");
  await muda(proc, "cosmik");
  ok(linhas(r.host).length === 1, "procurar na descri\\u00e7\\u00e3o encontra 1");
  await muda(proc, "EMPREITADA");
  ok(linhas(r.host).length === 1, "e procura tamb\\u00e9m na observa\\u00e7\\u00e3o, sem ligar a mai\\u00fasculas");
  await muda(proc, "sucess\\u00e3o");
  ok(linhas(r.host).length === 0, "sem resultados mostra a lista vazia");
  ok(/Nenhum lan\\u00e7amento com estes filtros/.test(txt(r.host)), "e di-lo por palavras");
  await muda(proc, "");

  const bts = [...r.host.querySelectorAll("button")].map(txt);
  ok(bts.includes("Entradas") && bts.includes("Sa\\u00eddas"), "d\\u00e1 para ver s\\u00f3 entradas ou s\\u00f3 sa\\u00eddas");
  const btSaidas = [...r.host.querySelectorAll("button")].find(b => txt(b) === "Sa\\u00eddas");
  await act(async () => { btSaidas.dispatchEvent(new window.MouseEvent("click", { bubbles:true })); });
  ok(linhas(r.host).length === 3, "s\\u00f3 sa\\u00eddas: 3 linhas");
  await limpa(r);
}

// \u2500\u2500 Varias escolhas no mesmo filtro \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
{
  const r = await monta(base);

  // Categoria: duas de uma vez
  await marcar(r.host, "Categoria", "Obra", "Obras");
  ok(linhas(r.host).length === 2, "duas categorias marcadas deixam as duas linhas");
  ok(/2 selecionados/.test(resumoVarios(r.host, "Categoria")), "e o bot\u00e3o di-lo: 2 selecionados");
  await marcar(r.host, "Categoria", "Funding");
  ok(linhas(r.host).length === 3, "uma terceira categoria soma, n\u00e3o substitui");
  await marcar(r.host, "Categoria", "Obras");
  ok(linhas(r.host).length === 2, "desmarcar uma tira s\u00f3 essa");
  await limparVarios(r.host, "Categoria");
  ok(linhas(r.host).length === 5, "limpar devolve tudo");
  ok(resumoVarios(r.host, "Categoria") === "Todas", "e o bot\u00e3o volta a Todas");

  // Ano: 2025 e 2026 juntos
  await marcar(r.host, "Ano", "2025", "2026");
  ok(linhas(r.host).length === 5, "os dois anos cobrem tudo");
  await marcar(r.host, "Ano", "2026");
  ok(linhas(r.host).length === 1, "s\u00f3 2025 deixa 1");
  await limparVarios(r.host, "Ano");

  // M\u00eas: setembro e outubro
  await marcar(r.host, "M\u00eas", "setembro", "outubro");
  ok(linhas(r.host).length === 3, "setembro + outubro d\u00e3o 3");
  ok(/2 selecionados/.test(resumoVarios(r.host, "M\u00eas")), "o resumo do m\u00eas conta as duas");
  await limparVarios(r.host, "M\u00eas");

  // Cruzar os tr\u00eas
  await marcar(r.host, "Ano", "2026");
  await marcar(r.host, "M\u00eas", "setembro", "outubro");
  await marcar(r.host, "Categoria", "Obra", "Obras");
  ok(linhas(r.host).length === 2, "ano + dois meses + duas categorias cruzam-se bem");

  // O bot\u00e3o "Todos" dentro da caixa marca tudo
  await botaoVarios(r.host, "Categoria", "Todos");
  ok(linhas(r.host).length === 3, "o bot\u00e3o Todos marca a lista toda");
  await limpa(r);
}

// \u2500\u2500 As listas seguem a empresa escolhida \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
{
  const r = await monta(base);
  const todasCats = await opcoesVarios(r.host, "Categoria");
  ok(todasCats.includes("Obra") && todasCats.includes("Obras") && todasCats.includes("S\u00f3cios"),
     "em Todas as empresas, a lista de categorias traz as de todas");

  const emp = filtro(r.host, "Empresa");
  await muda(emp, "adseq");
  const catsAd = await opcoesVarios(r.host, "Categoria");
  ok(catsAd.includes("Obras") && catsAd.includes("S\u00f3cios"), "filtrada a Admirable Sequence, ficam as dela");
  ok(!catsAd.includes("Obra"), "e sai a Obra, que \u00e9 da Favorite Closet");
  ok(!catsAd.includes("Encargos financeiros"), "e sai a da Pearl");

  const anosAd = await opcoesVarios(r.host, "Ano");
  ok(anosAd.includes("2025") && anosAd.includes("2026"), "os anos da Admirable Sequence s\u00e3o os dois");
  const subAd = await opcoesVarios(r.host, "Subcategoria");
  ok(subAd.includes("Gastos com Obras") && subAd.includes("Suprimentos"), "e as subcategorias dela");

  await muda(emp, "pearl");
  const catsPearl = await opcoesVarios(r.host, "Categoria");
  ok(catsPearl.length === 1 && catsPearl[0] === "Encargos financeiros",
     "a Pearl s\u00f3 tem uma categoria, e \u00e9 s\u00f3 essa que aparece");
  const anosPearl = await opcoesVarios(r.host, "Ano");
  ok(anosPearl.length === 1 && anosPearl[0] === "2026", "e um ano s\u00f3");

  await muda(emp, "");
  const outraVez = await opcoesVarios(r.host, "Categoria");
  ok(outraVez.length === todasCats.length, "voltar a Todas devolve a lista inteira");
  await limpa(r);
}

// \u2500\u2500 Trocar de empresa larga os filtros que j\u00e1 n\u00e3o existem \u2500\u2500\u2500\u2500\u2500\u2500\u2500
{
  const r = await monta(base);
  await marcar(r.host, "Categoria", "Obra");
  ok(linhas(r.host).length === 1, "marcada a Obra, fica 1 linha");
  const emp = filtro(r.host, "Empresa");
  await muda(emp, "adseq");
  ok(resumoVarios(r.host, "Categoria") === "Todas",
     "mudar para uma empresa sem essa categoria larga o filtro");
  ok(linhas(r.host).length === 2, "e mostram-se as 2 linhas da empresa nova, n\u00e3o uma lista vazia");
  await limpa(r);
}

// ── O plano de contas segue a empresa da linha ─────────────────────────────
{
  const r = await monta(base);
  const porMov = (m) => linhas(r.host).find(tr => new RegExp(m).test(txt(tr)));
  const fc = porMov("COSMIK");
  const ad = porMov("PRESTADOR");
  const opts = (tr, i) => [...tr.querySelectorAll("select")[i].options].map(o => o.value);
  ok(opts(fc,0).includes("Obra") && !opts(fc,0).includes("Aquisi\\u00e7\\u00e3o_de_Terreno"),
     "a linha da Favorite Closet recebe o plano dela");
  ok(opts(ad,0).includes("Obras") && opts(ad,0).includes("Soft_Costs"),
     "a da Admirable Sequence recebe o plano HDG");
  ok(ad.querySelectorAll("select").length === 2, "e tem caixa de subcategoria");
  ok(fc.querySelectorAll("select").length === 1, "a da LPX n\\u00e3o tem");
  ok(opts(ad,1).includes("Gastos com Obras"), "com as subcategorias certas");
  await limpa(r);
}

// ── Gravar altera o extrato ────────────────────────────────────────────────
{
  const r = await monta(base);
  globalThis.__gravados.length = 0;
  const tr = linhas(r.host).find(x => /COSMIK/.test(txt(x)));
  await muda(tr.querySelectorAll("select")[0], "Terreno");
  ok(globalThis.__gravados.length === 1, "mudar a categoria grava");
  ok(globalThis.__gravados[0].id === "a1", "no movimento certo");
  ok(globalThis.__gravados[0].campos.categoria === "Terreno", "com o valor novo");

  globalThis.__gravados.length = 0;
  const obs = tr.querySelector("input[type=text], input:not([type])");
  if (obs) {
    await muda(obs, "Auto de medi\\u00e7\\u00e3o 8");
    await act(async () => { obs.dispatchEvent(new window.FocusEvent("focusout", { bubbles:true })); });
  }
  ok(globalThis.__gravados.length === 1, "escrever a observa\\u00e7\\u00e3o grava ao sair do campo");
  ok(globalThis.__gravados[0].campos.detalhes === "Auto de medi\\u00e7\\u00e3o 8", "com o texto escrito");

  // Mudar a categoria numa empresa com subcategoria limpa a subcategoria
  // quando ela deixa de pertencer à categoria nova.
  globalThis.__gravados.length = 0;
  const trH = linhas(r.host).find(x => /PRESTADOR/.test(txt(x)));
  await muda(trH.querySelectorAll("select")[0], "S\\u00f3cios");
  ok(globalThis.__gravados[0].campos.subcategoria === "",
     "mudar de categoria limpa uma subcategoria que j\\u00e1 n\\u00e3o encaixa");
  await limpa(r);
}

// ── Um viewer vê mas não mexe ──────────────────────────────────────────────
{
  const r = await monta({ ...base, currentUser: viewer });
  ok(linhas(r.host).length === 5, "o viewer v\\u00ea tudo");
  ok(/modo de leitura/.test(txt(r.host)), "e \\u00e9 avisado de que n\\u00e3o pode classificar");
  globalThis.__gravados.length = 0;
  const tr = linhas(r.host).find(x => /COSMIK/.test(txt(x)));
  await muda(tr.querySelectorAll("select")[0], "Terreno");
  ok(globalThis.__gravados.length === 0, "e mexer n\\u00e3o grava nada");
  await limpa(r);
}

process.exit(mau ? 1 : 0);
`.replace(/SRC\//g, SRC));

await build({
  entryPoints: [join(dir, "entrada.jsx")],
  bundle: true, platform: "node", format: "esm", outfile: join(dir, "saida.mjs"),
  jsx: "automatic", logLevel: "error",
  define: { "import.meta.env": '{"VITE_SUPABASE_URL":"https://teste.supabase.co","VITE_SUPABASE_ANON_KEY":"k"}' },
  external: ["react", "react-dom", "react-dom/client", "react-dom/test-utils"],
  plugins: [{ name: "stubs", setup(b) {
    b.onResolve({ filter: /(^|\/)supabase\.js$/ }, () => ({ path: join(dir, "stub-supabase.js") }));
    b.onResolve({ filter: /(^|\/)hooks\.js$/ }, (a) =>
      a.importer === join(dir, "stub-hooks.js") ? null : ({ path: join(dir, "stub-hooks.js") }));
  }}],
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://erp.test/" });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Event = dom.window.Event; global.MouseEvent = dom.window.MouseEvent;
global.FocusEvent = dom.window.FocusEvent;
global.IS_REACT_ACT_ENVIRONMENT = true;
global.alert = (m) => console.log("    (alert) " + String(m).split("\n")[0]);
global.confirm = () => true;

console.log("Caixa Único (DOM):");
try { await import(pathToFileURL(join(dir, "saida.mjs")).href); }
finally { rmSync(dir, { recursive: true, force: true }); }
