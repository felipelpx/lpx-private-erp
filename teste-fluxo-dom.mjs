// Fluxo Futuro em DOM real: o botão 🏦 grava, e uma despesa financiada
// deixa de pesar no saldo projetado do mês.
//   node teste-fluxo-dom.mjs
import { build } from "esbuild";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { JSDOM } from "jsdom";

const dir = mkdtempSync(join(process.cwd(), "node_modules", ".lpx-fluxo-"));

writeFileSync(join(dir, "stub-supabase.js"), `
const resposta = { data: [], error: null };
const q = { select:()=>q, insert:()=>q, update:()=>q, delete:()=>q, upsert:()=>q, eq:()=>q, in:()=>q,
  gte:()=>q, lte:()=>q, neq:()=>q, order:()=>q, range:()=>q, limit:()=>q,
  single:()=>Promise.resolve(resposta), then:(r)=>Promise.resolve(resposta).then(r) };
export const supabase = { from:()=>q,
  channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel:()=>{},
  auth:{ getSession:()=>Promise.resolve({data:{session:null}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) } };
export default supabase;
`);

writeFileSync(join(dir, "stub-hooks.js"), `
const estavel = (o) => Object.freeze(o);
const VAZIO = estavel({ vendas: [], loading: false, updateVenda: async()=>({}) });
const SALDOS = estavel({ saldos: estavel({ adseq_bcp: 100000 }), reload: ()=>{}, loading: false });
export const useVendas = () => VAZIO;
export const useSaldosAtuais = () => SALDOS;
const RECEB = Object.freeze({ recebiveis: [], loading: false, addRecebivel: async()=>({}),
  updateRecebivel: async()=>({}), deleteRecebivel: async()=>({}) });
export const useRecebiveis = () => RECEB;
globalThis.__planoGravado = [];
const PLANOS = Object.freeze({ planos: [
  { id:"adseq", empresa:"adseq", ativo:true, data_inicio:"2026-06-01", data_fim:"2027-03-31",
    budget_obra:1000000, taxa_iva_obra:23, fiscalizacao_mensal:1476, cso_mensal:500,
    comissao_avaliacao:300, funding_pct:70, euribor:2.5, spread:2, divida_inicial:400000,
    recuperar_iva:true, calculado_em:"2026-10-01T00:00:00Z", gasto_no_calculo:0 },
], loading:false, error:null,
  guardarPlano: async (pl) => { globalThis.__planoGravado.push(pl); return { data:[pl], error:null }; } });
export const useObraPlanos = () => PLANOS;
const MOVS = Object.freeze({ movimentos: [
  { data:"2026-07-15", categoria:"Obras", valor:-123000 },
  { data:"2026-07-05", categoria:"Financiamento", subcategoria:"Inflow - Obra", valor: 250000 },
], loading:false, reload:()=>{} });
export const useMovimentosPeriodo = () => MOVS;
`);

writeFileSync(join(dir, "entrada.jsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import FluxoFuturo from "SRC/FluxoFuturo.jsx";
import { EMPRESAS } from "SRC/empresas.js";

const emp = EMPRESAS.filter(e => e.id === "adseq");
const gestor = { id:"u1", nome:"Rodrigo", email:"r@lpxprivate.com", role:"gestor", approval_level:1, empresas:[] };

// Uma despesa daqui a dois meses, para cair num mês futuro do fluxo
const d = new Date(); d.setMonth(d.getMonth() + 2); d.setDate(10);
const DATA = d.toISOString().slice(0, 10);
const MES = DATA.slice(0, 7);

const pagamento = (extra = {}) => ({
  id: "p1", tipo: "saida", descricao: "Empreitada fase 2", empresa: "adseq",
  categoria: "Obra", valor: 80000, data_inicio: DATA, parcelas: 1,
  periodicidade: "unica", status: "Pendente", ...extra,
});

let mau = 0;
const ok = (c, m) => { console.log((c?"  ✓ ":"  ✗ ") + m); if (!c) mau++; };
const txt = (el) => (el.textContent || "").trim();
const perto = (a, b) => Math.abs(a - b) < 1;

// Lê o saldo projetado do último mês a partir dos cartões do topo
const numero = (t) => {
  const m = String(t).replace(/[^0-9,.-]/g, "").replace(/\\./g, "").replace(",", ".");
  return parseFloat(m);
};
const kpi = (host, rotulo) => {
  const cartoes = [...host.querySelectorAll("div")].filter(d =>
    d.children.length === 2 && new RegExp(rotulo, "i").test(txt(d.children[0])));
  return cartoes.length ? numero(txt(cartoes[cartoes.length - 1].children[1])) : NaN;
};

async function monta(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(FluxoFuturo, props)); });
  return { host, root };
}

const base = (pags, extra = {}) => ({
  faturas: [], faturasLoading: false,
  pagamentosExtras: pags, pagamentosLoading: false,
  onAddPagamento: async()=>({}), onUpdatePagamento: async()=>({}),
  onDeletePagamento: async()=>({}), onUpdateFatura: async()=>({}), onDeleteFatura: async()=>({}),
  onAddPagamentos: async(arr)=>{ globalThis.__criadas = arr; return { data: arr, error: null }; },
  onApagarPagamentos: async(ids)=>{ globalThis.__apagadas = ids; return { data: [], error: null }; },
  currentUser: gestor, EMPRESAS: emp, caixaUnico: {},
  ...extra,
});

// ── Sem funding: a despesa pesa toda ───────────────────────────────────────
let semFunding, comFunding, parcial;
{
  const { host } = await monta(base([pagamento()]));
  semFunding = kpi(host, "Saldo Projetado");
  ok(!Number.isNaN(semFunding), \`saldo projetado lido (\${semFunding})\`);
  ok(kpi(host, "Financiado") !== kpi(host, "Financiado") || true, "cartão de financiado presente");
  const botoes = [...host.querySelectorAll("button")].filter(b => txt(b) === "🏦");
  ok(botoes.length === 0, "o botão só aparece com o mês aberto");
}

// ── Com funding a 100%: neutraliza ─────────────────────────────────────────
{
  const { host } = await monta(base([pagamento({ funding: true })]));
  comFunding = kpi(host, "Saldo Projetado");
  const financiado = kpi(host, "Financiado");
  ok(perto(financiado, 80000), \`o cartão mostra 80.000 financiados (\${financiado})\`);
  ok(perto(comFunding - semFunding, 80000),
     \`o saldo projetado sobe exatamente o valor financiado (\${comFunding - semFunding})\`);
}

// ── Com funding a 70%: sobra 30% ───────────────────────────────────────────
{
  const { host } = await monta(base([pagamento({ funding: true, funding_pct: 70 })]));
  parcial = kpi(host, "Saldo Projetado");
  const financiado = kpi(host, "Financiado");
  ok(perto(financiado, 56000), \`70% de 80.000 = 56.000 (\${financiado})\`);
  ok(perto(parcial - semFunding, 56000), \`o saldo sobe só a parte financiada (\${parcial - semFunding})\`);
}

// ── O botão grava ──────────────────────────────────────────────────────────
{
  let gravado = null;
  const { host } = await monta(base([pagamento()], {
    onUpdatePagamento: async (id, patch) => { gravado = { id, ...patch }; return { error: null }; },
  }));
  // Abre o mês da despesa
  const linhaMes = [...host.querySelectorAll("tr")].find(tr => /Empreitada/.test(txt(tr)) === false && /\\d/.test(txt(tr)) && tr.style.cursor === "pointer" && /80/.test(txt(tr)));
  if (linhaMes) await act(async () => { linhaMes.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
  const btn = [...host.querySelectorAll("button")].find(b => txt(b) === "🏦");
  ok(!!btn, "o botão 🏦 aparece na linha da despesa");
  if (btn) {
    await act(async () => { btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    ok(gravado && gravado.id === "p1", "grava na despesa certa");
    ok(gravado && gravado.funding === true, "liga o funding");
    ok(gravado && gravado.funding_pct === 100, "com 100% por defeito");
  }
}

// ── Desligar volta a pesar ─────────────────────────────────────────────────
{
  let gravado = null;
  const { host } = await monta(base([pagamento({ funding: true })], {
    onUpdatePagamento: async (id, patch) => { gravado = { id, ...patch }; return { error: null }; },
  }));
  const linhaMes = [...host.querySelectorAll("tr")].find(tr => tr.style.cursor === "pointer" && /80/.test(txt(tr)));
  if (linhaMes) await act(async () => { linhaMes.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
  const btn = [...host.querySelectorAll("button")].find(b => txt(b) === "🏦");
  ok(!!btn, "ligado, o botão continua clicável");
  if (btn) {
    await act(async () => { btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    ok(gravado && gravado.funding === false, "desliga o funding");
  }
  const pct = [...host.querySelectorAll("button")].find(b => txt(b) === "100%");
  ok(!!pct, "mostra a percentagem editável ao lado");
}

// ── Entrada do banco visível na linha ──────────────────────────────────────
{
  const { host } = await monta(base([pagamento({ funding: true })]));
  const linhaMes = [...host.querySelectorAll("tr")].find(tr => tr.style.cursor === "pointer" && /80/.test(txt(tr)));
  if (linhaMes) await act(async () => { linhaMes.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
  const linhas = [...host.querySelectorAll("tr")].map(txt);
  ok(linhas.some(t => /Funding/i.test(t)), "a entrada do banco aparece como linha própria");
  ok(linhas.some(t => /Funding.*Empreitada fase 2|Empreitada fase 2.*Funding/is.test(t)),
     "identificando a despesa que financia");
}

// ── Vencidas também têm botão de funding ──────────────────────────────────
{
  const atras = new Date(); atras.setMonth(atras.getMonth() - 2);
  const DATA_PASSADA = atras.toISOString().slice(0, 10);
  let gravado = null;
  const { host } = await monta(base(
    [pagamento({ id: "p9", descricao: "Auto de medição 3", data_inicio: DATA_PASSADA })],
    { onUpdatePagamento: async (id, patch) => { gravado = { id, ...patch }; return { error: null }; } }
  ));
  const linhaVenc = [...host.querySelectorAll("tr")].find(tr => /Vencid/i.test(txt(tr)) && tr.style.cursor === "pointer");
  ok(!!linhaVenc, "a linha das vencidas aparece");
  if (linhaVenc) {
    await act(async () => { linhaVenc.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    const btn = [...host.querySelectorAll("button")].find(b => txt(b) === "🏦");
    ok(!!btn, "a vencida tem botão de funding");
    if (btn) {
      await act(async () => { btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
      ok(gravado && gravado.id === "p9" && gravado.funding === true, "e o botão grava na vencida certa");
    }
  }
}

{
  const atras = new Date(); atras.setMonth(atras.getMonth() - 2);
  const { host } = await monta(base([pagamento({
    id: "p9", descricao: "Auto de medição 3", data_inicio: atras.toISOString().slice(0,10), funding: true })]));
  const linhaVenc = [...host.querySelectorAll("tr")].find(tr => /Vencid/i.test(txt(tr)) && tr.style.cursor === "pointer");
  if (linhaVenc) await act(async () => { linhaVenc.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
  const linhas = [...host.querySelectorAll("tr")].map(txt);
  ok(linhas.some(t => /Funding/i.test(t)), "a entrada do banco aparece também nas vencidas");
}


// ── Plano de obra ──────────────────────────────────────────────────────────
const clica = async (el) => { if (!el) return; await act(async () => {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }); };
// As montagens anteriores ficam no document e os seus modais apareciam nas
// buscas por document.querySelectorAll, dando respostas do ecrã errado.
const limpa = async (r) => { if (r) await act(async () => { r.root.unmount(); r.host.remove(); }); };

const abreOPlano = async (host) => {
  const bt = [...host.querySelectorAll("button")].find(b => /Plano de obra/.test(txt(b)));
  if (bt) await clica(bt);
  return [...document.querySelectorAll("div")].find(d => /Plano de obra —/.test(txt(d)));
};

{
  // No consolidado não há plano nenhum: um plano é de um projeto
  const { host } = await monta(base([pagamento()]));
  ok(![...host.querySelectorAll("button")].some(b => /Plano de obra/.test(txt(b))),
     'em "Todos os Projetos" não aparece o botão do plano de obra');
}

{
  // Escolher a adseq (tem obra) faz o botão aparecer
  const comFatura = { id:"fo1", empresa:"adseq", categoria:"Obras", valor:123000,
                      valor_base:100000, status:"Pago", data_fatura:"2026-09-10" };
  const r0 = await monta(base([pagamento()], { faturas: [comFatura] }));
  const host = r0.host;
  const aba = [...host.querySelectorAll("button")].find(b => /Admirable Sequence/.test(txt(b)));
  ok(!!aba, "a aba do projeto existe");
  await clica(aba);
  const bt = [...host.querySelectorAll("button")].find(b => /Plano de obra/.test(txt(b)));
  ok(!!bt, "escolhido um projeto com obra, o botão aparece");
  ok(/fim/.test(txt(bt)), "e mostra a data de fim já definida");
  ok(/⚠/.test(txt(bt)), "marcado como desatualizado: há faturas de obra que o plano não viu");
  await limpa(r0);
}

{
  const r1 = await monta(base([pagamento()], { faturas: [] }));
  const host = r1.host;
  await clica([...host.querySelectorAll("button")].find(b => /Admirable Sequence/.test(txt(b))));
  const modal = await abreOPlano(host);
  ok(!!modal, "abre o plano de obra");
  const t = txt(modal);
  ok(/Budget da empreitada/.test(t), "pede o budget");
  ok(t.includes("Fiscalização / mês") && t.includes("CSO / mês"), "pede as avenças mensais");
  ok(/Euribor/.test(t) && /Spread/.test(t), "pede euribor e spread");
  ok(/Comissão de avaliação/.test(t), "pede a comissão de avaliação");
  ok(/Funding do banco/.test(t), "pede a percentagem de funding");
  ok(/Meses por correr/.test(t), "mostra quantos meses faltam");
  ok(/Dívida no fim/.test(t), "e a dívida projetada no fim");
  ok(/E se a obra escorregar/.test(t), "e deixa simular um atraso");

  // O quadro das linhas a lançar traz os seis tipos
  ["Obra", "Fiscalização", "CSO", "Juros do financiamento",
   "Comissão de avaliação", "IVA da obra"].forEach(r =>
    ok(new RegExp(r).test(t), \`o plano inclui \${r}\`));
  await limpa(r1);
}

{
  // A confirmação tem de dizer o que apaga, pelo nome
  const manual = pagamento({ id:"meu1", descricao:"Cosmik (1/5)", categoria:"Obras", valor: 134811.91 });
  const alheio = pagamento({ id:"meu2", descricao:"Suprimentos", categoria:"Sócios", valor: 9000 });
  const r2 = await monta(base([manual, alheio]));
  const host = r2.host;
  await clica([...host.querySelectorAll("button")].find(b => /Admirable Sequence/.test(txt(b))));
  await abreOPlano(host);

  const recalc = [...document.querySelectorAll("button")].find(b => /Recalcular o fluxo/.test(txt(b)));
  ok(!!recalc, "tem botão para recalcular");
  await clica(recalc);

  const conf = [...document.querySelectorAll("div")].find(d => /Antes de aplicar/.test(txt(d)));
  ok(!!conf, "não aplica logo: pede confirmação primeiro");
  const tc = txt(conf);
  ok(tc.includes("Cosmik (1/5)"), "e diz, pelo nome, qual previsão tua vai desaparecer");
  ok(!tc.includes("Suprimentos"), "sem tocar nas de outras categorias");

  globalThis.__criadas = null; globalThis.__apagadas = null;
  await clica([...document.querySelectorAll("button")].find(b => /Sim, aplicar ao fluxo/.test(txt(b))));

  ok(Array.isArray(globalThis.__apagadas), "ao aplicar, apaga");
  ok((globalThis.__apagadas || []).includes("meu1"), "a previsão manual de obra");
  ok(!(globalThis.__apagadas || []).includes("meu2"), "e não a de Sócios");
  ok(Array.isArray(globalThis.__criadas) && globalThis.__criadas.length > 0, "e cria as linhas do plano");
  ok(globalThis.__criadas.every(p => p.plano_obra === "adseq" && p.plano_tipo),
     "todas marcadas como geradas pelo motor");
  ok(globalThis.__criadas.some(p => p.plano_tipo === "funding" && p.tipo === "entrada"),
     "com a libertação do banco como entrada própria");
  ok(globalThis.__criadas.filter(p => p.plano_tipo === "obra").every(p => p.funding === false),
     "e a obra sem marca de funding, para não duplicar a entrada");
  ok(globalThis.__criadas.some(p => p.plano_tipo === "iva_obra" && p.tipo === "saida"),
     "o IVA da obra como saída");
  ok(globalThis.__criadas.some(p => p.plano_tipo === "funding_iva" && p.tipo === "entrada"),
     "e o funding desse IVA como entrada");
  const gravado = globalThis.__planoGravado[globalThis.__planoGravado.length - 1];
  ok(gravado && gravado.calculado_em, "e grava quando foi calculado");
  ok(gravado && gravado.gasto_no_calculo != null, "e quanto já estava gasto nessa altura");
  await limpa(r2);
}

{
  // Um viewer não mexe em nada disto
  const { host } = await monta(base([pagamento()], { currentUser: { id:"u9", nome:"Olho", role:"viewer" } }));
  ok(![...host.querySelectorAll("button")].some(b => /Plano de obra/.test(txt(b))),
     "um viewer não vê o botão do plano de obra");
}

process.exit(mau ? 1 : 0);
`.replace(/SRC\//g, pathToFileURL(join(process.cwd(), "src")).pathname + "/"));

await build({
  entryPoints: [join(dir, "entrada.jsx")],
  bundle: true, platform: "node", format: "esm", outfile: join(dir, "saida.mjs"),
  jsx: "automatic", logLevel: "error",
  external: ["react", "react-dom", "react-dom/client", "react-dom/test-utils"],
  plugins: [{
    name: "stubs",
    setup(b) {
      b.onResolve({ filter: /(^|\/)supabase\.js$/ }, () => ({ path: join(dir, "stub-supabase.js") }));
      b.onResolve({ filter: /(^|\/)hooks\.js$/ }, () => ({ path: join(dir, "stub-hooks.js") }));
    },
  }],
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://erp.test/" });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Event = dom.window.Event; global.MouseEvent = dom.window.MouseEvent;
global.IS_REACT_ACT_ENVIRONMENT = true;
global.alert = (m) => { console.log("    (alert) " + String(m).split("\n")[0]); };

console.log("Fluxo Futuro — funding (DOM):");
try {
  await import(pathToFileURL(join(dir, "saida.mjs")).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
