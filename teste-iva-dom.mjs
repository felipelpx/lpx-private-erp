// A aba IVA em DOM real: os filtros, a expansão até às faturas, as somas que
// têm de bater, e o que não pode acontecer (marcar pago em "Todas").
//   node teste-iva-dom.mjs
import { build } from "esbuild";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { JSDOM } from "jsdom";

const dir = mkdtempSync(join(process.cwd(), "node_modules", ".lpx-iva-"));

writeFileSync(join(dir, "stub-supabase.js"), `
const r = { data: [], error: null };
const q = { select:()=>q, insert:()=>q, update:()=>q, upsert:()=>q, delete:()=>q, eq:()=>q,
  order:()=>q, then:(f)=>Promise.resolve(r).then(f) };
export const supabase = { from:()=>q, channel:()=>({on(){return this},subscribe(){return this}}), removeChannel:()=>{} };
export default supabase;
`);

// Setembro de 2026, o exemplo do enunciado, mais um trimestre anterior e outra empresa
writeFileSync(join(dir, "stub-hooks.js"), `
const DOCS = [
  { tipo:"fornecedor", id:"f1", empresa:"adseq", documento:"FT 2026/1", entidade:"Construtora Alfa",
    data_fatura:"2026-09-28", valor_base:1000, valor_iva:230, valor_total:1230, taxa_iva:23, iva_estimado:false, iva_dedutivel:true, estado:"Pendente em dia" },
  { tipo:"cliente", id:"r1", empresa:"adseq", documento:"FR 2026/1", entidade:"Cliente Beta",
    data_fatura:"2026-09-20", valor_base:3000, valor_iva:690, valor_total:3690, taxa_iva:23, iva_estimado:false, iva_dedutivel:true, estado:"Previsto" },
  { tipo:"fornecedor", id:"f2", empresa:"adseq", documento:"FT 2026/7", entidade:"Velha SA",
    data_fatura:"2026-05-10", valor_base:813.01, valor_iva:186.99, valor_total:1000, taxa_iva:23, iva_estimado:true, iva_dedutivel:true, estado:"Pago" },
  { tipo:"fornecedor", id:"f3", empresa:"adseq", documento:"IMI 2026", entidade:"Autoridade Tributaria",
    data_fatura:"2026-09-11", valor_base:81.30, valor_iva:18.70, valor_total:100, taxa_iva:23, iva_estimado:true, iva_dedutivel:false, estado:"Pago" },
  { tipo:"fornecedor", id:"f9", empresa:"infinite", documento:"FT 2026/88", entidade:"Outra Empresa",
    data_fatura:"2026-09-15", valor_base:5000, valor_iva:1150, valor_total:6150, taxa_iva:23, iva_estimado:false, iva_dedutivel:true, estado:"Pago" },
];
globalThis.__gravados = [];
const RES = Object.freeze({ documentos: DOCS, loading:false, error:null, reload:()=>{},
  guardarDocumento: async (doc, campos) => {
    globalThis.__gravados.push({ id: doc.id, tipo: doc.tipo, campos });
    return { data: [{}], error: null };
  } });
const PAG = Object.freeze({ pagamentos: [], loading:false, error:null, reload:()=>{},
  marcarPago: async()=>({error:null}), anularPagamento: async()=>({error:null}) });
export const useIvaDocumentos = () => RES;
export const useIvaPagamentos = () => PAG;
export const DOCS_TESTE = DOCS;
`);

writeFileSync(join(dir, "entrada.jsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import IVAView from "SRC/IVAView.jsx";
import { EMPRESAS } from "SRC/empresas.js";

const emp = EMPRESAS.filter(e => ["adseq","infinite"].includes(e.id));
const gestor = { id:"u1", nome:"Rodrigo", role:"gestor" };
const viewer = { id:"u2", nome:"Olho", role:"viewer" };

let mau = 0;
const ok = (c, m) => { console.log((c?"  ✓ ":"  ✗ ")+m); if(!c) mau++; };
const txt = (el) => (el.textContent || "").trim();
const numero = (t) => {
  const m = String(t).replace(/[^0-9,.-]/g,"").replace(/\\./g,"").replace(",",".");
  return parseFloat(m);
};

async function monta(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(IVAView, props)); });
  return host;
}
const clica = async (el) => { await act(async () => {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }); };
const muda = async (sel, v) => { await act(async () => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  setter.call(sel, v); sel.dispatchEvent(new window.Event("change", { bubbles: true })); }); };

const base = { currentUser: gestor, empresasVisiveis: emp };

// ── Cartões de resumo ──────────────────────────────────────────────────────
{
  const host = await monta(base);
  const t = txt(host);
  ok(/IVA a pagar/.test(t) && /IVA a abater/.test(t), "os cartões de resumo aparecem");
  ok(/Pr.xima data limite/.test(t), "e a próxima data limite");
  // "Todas" + ano 2026: a pagar 690; a abater 230 + 186,99 + 1150 = 1566,99
  ok(/690,00/.test(t), "IVA a pagar 690,00 € (soma das faturas a clientes)");
  ok(/1\\.566,99/.test(t), "IVA a abater 1.566,99 € (soma das faturas de fornecedores)");
  ok(/25\\/11\\/2026/.test(t), "a data limite do 3T26 é 25/11/2026");
  ok(/calculado|calc\\./.test(t), "a fatura com IVA deduzido vem assinalada");
}

// ── Filtro por empresa ─────────────────────────────────────────────────────
{
  const host = await monta(base);
  const selEmp = host.querySelector("select");
  await muda(selEmp, "adseq");
  const t = txt(host);
  ok(!/Outra Empresa/.test(t), "ao filtrar pela adseq, nada da infinite aparece");
  ok(/416,99/.test(t), "IVA a abater da adseq = 230 + 186,99 = 416,99 €");

  await muda(selEmp, "infinite");
  const t2 = txt(host);
  ok(!/Construtora Alfa/.test(t2), "e ao filtrar pela infinite, nada da adseq");
  ok(/1\\.150,00/.test(t2), "IVA a abater da infinite = 1.150,00 €");
}

// ── Trimestres, meses e faturas ────────────────────────────────────────────
{
  const host = await monta(base);
  await muda(host.querySelector("select"), "adseq");

  const linhasTri = [...host.querySelectorAll("tbody tr")].filter(tr => /^▶ \\dT26/.test(txt(tr)));
  ok(linhasTri.length === 2, \`dois trimestres com faturas (\${linhasTri.length})\`);

  const t3 = linhasTri.find(tr => /3T26/.test(txt(tr)));
  ok(!!t3, "o 3T26 está na tabela");
  const cels = [...t3.querySelectorAll("td")].map(txt);
  ok(numero(cels[1]) === 690, "3T26 · IVA a pagar 690");
  ok(numero(cels[2]) === 230, "3T26 · IVA a abater 230");
  ok(numero(cels[3]) === 460, "3T26 · saldo 460 (o exemplo do enunciado)");
  ok(/25\\/11\\/2026/.test(cels[4]), "3T26 · data limite 25/11/2026");

  await clica(t3);
  const apos = [...host.querySelectorAll("tbody tr")].map(txt);
  ok(apos.some(l => /julho/.test(l)), "abrir o trimestre mostra julho");
  ok(apos.some(l => /agosto/.test(l)), "mostra agosto");
  ok(apos.some(l => /setembro/.test(l)), "mostra setembro");
  ok(apos.filter(l => /Sem faturas/.test(l)).length === 2,
     "julho e agosto aparecem vazios e assinalados como sem faturas");

  const linhaSet = [...host.querySelectorAll("tbody tr")].find(tr => /setembro/.test(txt(tr)));
  await clica(linhaSet);
  const detalhe = txt(host);
  ok(/Construtora Alfa/.test(detalhe), "abrir o mês mostra a fatura do fornecedor");
  ok(/Cliente Beta/.test(detalhe), "e a fatura ao cliente");
  ok(/Faturas emitidas a clientes/.test(detalhe) && /Faturas de fornecedores/.test(detalhe),
     "separadas nos dois blocos");
  ok(/Subtotal 3T26/.test(detalhe), "com subtotal do trimestre");
}

// ── Vista por mês ──────────────────────────────────────────────────────────
{
  const host = await monta(base);
  const botao = [...host.querySelectorAll("button")].find(b => txt(b) === "Por mês");
  ok(!!botao, "existe o botão da vista por mês");
  await clica(botao);
  const linhas = [...host.querySelectorAll("tbody tr")].map(txt);
  const meses = ["janeiro","fevereiro","março","abril","maio","junho",
                 "julho","agosto","setembro","outubro","novembro","dezembro"];
  ok(meses.every(m => linhas.some(l => l.indexOf(m) === 0 || l.indexOf("  " + m) >= 0 || l.includes(m))),
     "aparecem os 12 meses do ano");
}

// ── Filtro de trimestre ────────────────────────────────────────────────────
{
  const host = await monta(base);
  await muda(host.querySelector("select"), "adseq");
  const b2T = [...host.querySelectorAll("button")].find(b => txt(b) === "2T");
  await clica(b2T);
  const t = txt(host);
  ok(!/Construtora Alfa/.test(t), "filtrar pelo 2T esconde as faturas do 3T");
  ok(/Velha SA/.test(t), "e mantém as do 2T");
}

// ── Detalhe por fatura ─────────────────────────────────────────────────────
{
  const host = await monta(base);
  const bFornec = [...host.querySelectorAll("button")].find(b => txt(b) === "Fornecedores");
  ok(!!bFornec, "o detalhe por fatura tem filtro por tipo");
  await clica(bFornec);
  const tabelas = [...host.querySelectorAll("table")];
  const ultima = tabelas[tabelas.length - 1];
  const linhas = [...ultima.querySelectorAll("tbody tr")].map(txt);
  ok(linhas.length === 4, \`as 4 faturas de fornecedor, a não dedutível incluída (\${linhas.length})\`);
  ok(!linhas.some(l => /Cliente Beta/.test(l)), "nenhuma fatura a cliente");
}

// ── Marcar como pago ───────────────────────────────────────────────────────
{
  const host = await monta(base);
  const bPagoTodas = [...host.querySelectorAll("button")].find(b => /marcar pago/.test(txt(b)));
  ok(bPagoTodas && bPagoTodas.disabled, 'em "Todas" não deixa marcar pago (o IVA paga-se por NIF)');

  await muda(host.querySelector("select"), "adseq");
  const bPago = [...host.querySelectorAll("button")].find(b => /marcar pago/.test(txt(b)));
  ok(bPago && !bPago.disabled, "com uma empresa escolhida, já deixa");
  await clica(bPago);
  const modal = [...document.querySelectorAll("div")].find(d => /Registar pagamento do IVA/.test(txt(d)));
  ok(!!modal, "abre a caixa de registo do pagamento");
  const campos = modal ? [...modal.querySelectorAll("input")] : [];
  ok(campos.length >= 2, "com valor e data");
  ok(campos[0] && numero(campos[0].value) > 0, "o valor vem preenchido com o apurado");
}

// ── Faturas que não deduzem IVA ────────────────────────────────────────────
{
  const host = await monta(base);
  const t = txt(host);
  // A fatura da AT (18,70 € de IVA) está na lista mas NÃO entra no abater:
  // 230 + 186,99 + 1 150 = 1 566,99, sem os 18,70.
  ok(/1\.566,99/.test(t), "a fatura não dedutível não entra no IVA a abater");
  ok(/Autoridade Tributaria/.test(t), "mas continua visível na lista");
  ok(/não deduz/.test(t), "com a marca 'não deduz'");
  ok(/fora do apuramento/.test(t), "e um aviso a dizer quanto IVA ficou de fora");
  ok(/18,70/.test(t), "com o valor do IVA não deduzido");

  // O aviso de IVA calculado conta a f2 estimada, mas não a não dedutível
  ok(/1 documento com IVA calculado/.test(t),
     "o aviso de IVA calculado ignora as não dedutíveis");

  const repor = [...host.querySelectorAll("button")].filter(b => txt(b) === "repor");
  ok(repor.length >= 1, "a linha não dedutível oferece 'repor'");
  globalThis.__gravados.length = 0;
  await clica(repor[0]);
  ok(globalThis.__gravados.length === 1, "repor grava uma alteração");
  ok(globalThis.__gravados[0].id === "f3", "na fatura certa");
  ok(globalThis.__gravados[0].campos.iva_dedutivel === true, "a repor a dedução");
}

// ── Tirar uma fatura do apuramento ─────────────────────────────────────────
{
  const host = await monta(base);
  const bts = [...host.querySelectorAll("button")].filter(b => txt(b) === "não deduz");
  ok(bts.length >= 3, "as faturas de fornecedor oferecem 'não deduz'");\n  const semIva = [...host.querySelectorAll("button")].filter(b => txt(b) === "sem IVA");\n  ok(semIva.length >= 1, "a fatura a cliente diz 'sem IVA', não 'não deduz'");
  globalThis.__gravados.length = 0;
  await clica(bts[0]);
  ok(globalThis.__gravados.length === 1, "grava uma alteração");
  ok(globalThis.__gravados[0].campos.iva_dedutivel === false, "a tirar do apuramento");
  ok(!("valor_iva" in globalThis.__gravados[0].campos),
     "sem mexer no IVA da fatura — para se poder repor");
}

// ── Corrigir a taxa ────────────────────────────────────────────────────────
{
  const host = await monta(base);
  const bts = [...host.querySelectorAll("button")].filter(b => txt(b) === "taxa");
  ok(bts.length >= 4, "todas as linhas oferecem corrigir a taxa");

  // A f2 (Velha SA) tem total 1 000 e IVA estimado a 23%
  const detalhe = [...host.querySelectorAll("tr")].find(tr => /Velha SA/.test(txt(tr)));
  const btTaxa = detalhe ? [...detalhe.querySelectorAll("button")].find(b => txt(b) === "taxa") : null;
  ok(!!btTaxa, "encontra o botão na linha da Velha SA");
  await clica(btTaxa);

  const modal = [...document.querySelectorAll("div")].find(d => /Taxa de IVA/.test(txt(d)));
  ok(!!modal, "abre a caixa da taxa");
  const tm = txt(modal);
  ok(/1\.000,00/.test(tm), "mostra o total do documento (1 000 €)");
  ok(/23%/.test(tm) && /13%/.test(tm) && /6%/.test(tm) && /0%/.test(tm), "oferece as quatro taxas");
  ok(/813,01/.test(tm) && /186,99/.test(tm), "pré-visualiza a decomposição à taxa atual");

  const b6 = [...modal.querySelectorAll("button")].find(b => /^6%/.test(txt(b)));
  ok(!!b6, "tem o botão dos 6%");
  await clica(b6);
  const tm6 = txt([...document.querySelectorAll("div")].find(d => /Taxa de IVA/.test(txt(d))));
  ok(/943,40/.test(tm6), "a 6%, a base passa a 943,40 €");
  ok(/56,60/.test(tm6), "e o IVA a 56,60 €");

  globalThis.__gravados.length = 0;
  const guardar = [...document.querySelectorAll("button")].find(b => /Guardar taxa/.test(txt(b)));
  ok(!!guardar, "tem botão de guardar");
  await clica(guardar);
  const g = globalThis.__gravados[0];
  ok(globalThis.__gravados.length === 1, "grava uma vez");
  ok(g && g.id === "f2", "na fatura certa");
  ok(g && g.campos.taxa_iva === 6, "com a taxa escolhida");
  ok(g && Math.abs(g.campos.valor_base - 943.40) < 0.005, "base recalculada do total");
  ok(g && Math.abs(g.campos.valor_iva - 56.60) < 0.005, "IVA recalculado do total");
  ok(g && g.campos.iva_estimado === false, "deixa de ser estimativa: alguém confirmou");
  ok(Math.abs(g.campos.valor_base + g.campos.valor_iva - 1000) < 0.005,
     "base + IVA continua a dar o total do documento");
}

// ── O viewer não corrige nada ──────────────────────────────────────────────
{
  const host = await monta({ ...base, currentUser: viewer });
  const bts = [...host.querySelectorAll("button")].map(txt);
  ok(!bts.includes("taxa"), "o viewer não pode corrigir a taxa");
  ok(!bts.includes("não deduz"), "nem tirar faturas do apuramento");
  ok(/Autoridade Tributaria/.test(txt(host)), "mas vê a lista toda à mesma");
}

// ── Um viewer não regista pagamentos ───────────────────────────────────────
{
  const host = await monta({ ...base, currentUser: viewer });
  ok(![...host.querySelectorAll("button")].some(b => /marcar pago/.test(txt(b))),
     "o viewer vê o apuramento mas não marca pagamentos");
}

process.exit(mau ? 1 : 0);
`.replace(/SRC\//g, pathToFileURL(join(process.cwd(), "src")).pathname + "/"));

await build({
  entryPoints: [join(dir, "entrada.jsx")],
  bundle: true, platform: "node", format: "esm", outfile: join(dir, "saida.mjs"),
  jsx: "automatic", logLevel: "error",
  external: ["react", "react-dom", "react-dom/client", "react-dom/test-utils"],
  plugins: [{ name: "stubs", setup(b) {
    b.onResolve({ filter: /(^|\/)supabase\.js$/ }, () => ({ path: join(dir, "stub-supabase.js") }));
    b.onResolve({ filter: /(^|\/)hooks\.js$/ }, () => ({ path: join(dir, "stub-hooks.js") }));
  }}],
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://erp.test/" });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Event = dom.window.Event; global.MouseEvent = dom.window.MouseEvent;
global.IS_REACT_ACT_ENVIRONMENT = true;
global.alert = (m) => console.log("    (alert) " + String(m).split("\n")[0]);
global.confirm = () => true;

console.log("Aba IVA (DOM):");
try { await import(pathToFileURL(join(dir, "saida.mjs")).href); }
finally { rmSync(dir, { recursive: true, force: true }); }
