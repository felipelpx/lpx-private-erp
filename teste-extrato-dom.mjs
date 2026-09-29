// Teste em DOM real (jsdom) do fluxo de questionamento no extrato:
//   investidor → abre a conta → clica em "?" na linha → escreve → envia.
//   gestor     → vê o balão "💬 n" na mesma linha.
//
//   node teste-extrato-dom.mjs
import { build } from "esbuild";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { JSDOM } from "jsdom";

const dir = mkdtempSync(join(process.cwd(), "node_modules", ".lpx-dom-"));

const MOVS = [
  { id: "m1", conta_id: "adseq_bcp", empresa_id: "adseq", banco: "BCP", data: "2026-09-01", movimento: "TRF PRESTADOR X", valor: -12500, saldo: 40000, categoria: "Obras", detalhes: "" },
  { id: "m2", conta_id: "adseq_bcp", empresa_id: "adseq", banco: "BCP", data: "2026-09-12", movimento: "ENTRADA SOCIO", valor: 50000, saldo: 90000, categoria: "Aportes", detalhes: "" },
];

writeFileSync(join(dir, "stub-supabase.js"), `
const resposta = { data: [], error: null };
const q = { select:()=>q, insert:()=>q, update:()=>q, delete:()=>q, upsert:()=>q, eq:()=>q, in:()=>q,
  gte:()=>q, lte:()=>q, neq:()=>q, order:()=>q, range:()=>q, limit:()=>q,
  single:()=>Promise.resolve(resposta), then:(r)=>Promise.resolve(resposta).then(r) };
export const supabase = { from:()=>q,
  channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel:()=>{},
  auth:{ getSession:()=>Promise.resolve({data:{session:null}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
  storage:{ from:()=>({ list:()=>Promise.resolve(resposta) }) } };
export default supabase;
`);

writeFileSync(join(dir, "stub-hooks.js"), `
const MOVS = ${JSON.stringify(MOVS)};
// Referências estáveis: um objeto novo a cada render faria os useEffect do
// componente disparar sem fim (é artefacto do teste, não do ERP).
const recarrega = () => {};
const RES_MOV = Object.freeze({ movimentos: MOVS, loading: false, reload: recarrega, total: MOVS.length,
  deleteMovimento: async()=>({}), updateMovimento: async()=>({}) });
const RES_SALDOS = Object.freeze({ saldos: Object.freeze({ adseq_bcp: 90000 }), reload: recarrega, loading: false });
export const useMovimentosByConta = () => RES_MOV;
export const useSaldosAtuais = () => RES_SALDOS;
export const MOVS_TESTE = MOVS;
`);

writeFileSync(join(dir, "entrada.jsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import ExtratosView from "SRC/ExtratosView.jsx";
import Questoes from "SRC/Questoes.jsx";
import { EMPRESAS } from "SRC/empresas.js";

const emp = EMPRESAS.filter(e => e.id === "adseq");
const investidor = { id:"u3", nome:"Mauricio", email:"m@lpxprivate.com", role:"investidor", approval_level:0, empresas:["adseq"] };
const gestor     = { id:"u1", nome:"Rodrigo",  email:"r@lpxprivate.com", role:"gestor",     approval_level:1, empresas:[] };

const QUESTOES = [{ id:"q1", movimento_id:"m1", empresa:"adseq", mov_data:"2026-09-01",
  mov_descricao:"TRF PRESTADOR X", mov_valor:-12500, autor_id:"u3", autor_nome:"Mauricio",
  texto:"A que obra corresponde?", status:"aberto", lido_por:[], created_at:"2026-09-02T10:00:00Z" }];

let mau = 0;
const ok = (c, m) => { console.log((c?"  ✓ ":"  ✗ ") + m); if (!mau && !c) mau = 1; if (!c) mau = 1; };
const txt = (el) => (el.textContent || "").trim();

async function monta(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(ExtratosView, props)); });
  // Abre a empresa e depois a conta: são os dois cliques que o utilizador dá.
  const clica = async (pred, oQue) => {
    const alvo = [...host.querySelectorAll("button,div,td,tr")].find(pred);
    if (!alvo) throw new Error("não encontrei " + oQue);
    await act(async () => { alvo.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
  };
  return { host, root, clica };
}

// autoOpenConta é a porta que o ERP já usa depois de uma importação: põe a
// vista diretamente no extrato da conta, sem depender de cliques na árvore.
const ABRE = { empresa: "adseq", contaId: "adseq_bcp", banco: "BCP" };
async function abreExtrato(props) {
  const { host } = await monta({ ...props, autoOpenConta: ABRE });
  return host;
}

// ── Investidor ─────────────────────────────────────────────────────────────
{
  let enviado = null;
  const host = await abreExtrato({
    EMPRESAS: emp, extrato: [], caixaUnico: {}, setCaixaUnico: ()=>{},
    currentUser: investidor, movCounts: {}, faturas: [], pagamentosExtras: [],
    questionamentos: [], addQuestionamento: async (q) => { enviado = q; return { error: null }; },
    onVerQuestoes: ()=>{},
  });
  const linhas = [...host.querySelectorAll("tbody tr")];
  ok(linhas.length >= 2, \`tabela do extrato desenhada (\${linhas.length} linhas)\`);

  const botoes = [...host.querySelectorAll("button")].filter(b => txt(b) === "?");
  ok(botoes.length === 2, \`botão "?" em cada linha (\${botoes.length})\`);

  await act(async () => { botoes[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
  const caixa = host.querySelector("textarea") || document.querySelector("textarea");
  ok(!!caixa, "abre a caixa de texto ao clicar no “?”");

  if (caixa) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    await act(async () => {
      setter.call(caixa, "Porque é que este valor subiu?");
      caixa.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    const enviar = [...document.querySelectorAll("button")].find(b => /Enviar questão/.test(txt(b)));
    ok(!!enviar, "existe o botão Enviar questão");
    await act(async () => { enviar.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
  }

  ok(!!enviado, "a questão é submetida");
  if (enviado) {
    ok(enviado.movimento_id === "m1", \`fica agarrada ao movimento certo (\${enviado.movimento_id})\`);
    ok(enviado.empresa === "adseq", \`guarda a empresa (\${enviado.empresa})\`);
    ok(enviado.banco === "BCP", \`guarda o banco (\${enviado.banco})\`);
    ok(Number(enviado.mov_valor) === -12500, \`copia o valor do lançamento (\${enviado.mov_valor})\`);
    ok(enviado.autor_id === "u3", "assina com o próprio id");
    ok(enviado.status === "aberto", "entra como aberta");
    ok(/valor subiu/.test(enviado.texto), "leva o texto escrito");
  }

  // Botão vazio não deve submeter
  const host2 = await abreExtrato({
    EMPRESAS: emp, extrato: [], caixaUnico: {}, setCaixaUnico: ()=>{},
    currentUser: investidor, movCounts: {}, faturas: [], pagamentosExtras: [],
    questionamentos: [], addQuestionamento: async () => { throw new Error("não devia enviar"); },
    onVerQuestoes: ()=>{},
  });
  const b = [...host2.querySelectorAll("button")].find(x => txt(x) === "?");
  await act(async () => { b.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
  const enviarVazio = [...document.querySelectorAll("button")].find(x => /Enviar questão/.test(txt(x)));
  let rebentou = false;
  try { await act(async () => { enviarVazio.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }); }
  catch { rebentou = true; }
  ok(!rebentou, "texto vazio não é submetido");
}

// ── Investidor com questão já colocada ─────────────────────────────────────
{
  const host = await abreExtrato({
    EMPRESAS: emp, extrato: [], caixaUnico: {}, setCaixaUnico: ()=>{},
    currentUser: investidor, movCounts: {}, faturas: [], pagamentosExtras: [],
    questionamentos: QUESTOES, addQuestionamento: async()=>({error:null}), onVerQuestoes: ()=>{},
  });
  const comContador = [...host.querySelectorAll("button")].filter(b => txt(b) === "? 1");
  ok(comContador.length === 1, "mostra o contador na linha já questionada");
}

// ── Gestor ─────────────────────────────────────────────────────────────────
{
  let foi = false;
  const host = await abreExtrato({
    EMPRESAS: emp, extrato: [], caixaUnico: {}, setCaixaUnico: ()=>{},
    currentUser: gestor, movCounts: {}, faturas: [], pagamentosExtras: [],
    questionamentos: QUESTOES, addQuestionamento: async()=>({error:null}),
    onVerQuestoes: () => { foi = true; },
  });
  const balao = [...host.querySelectorAll("button")].find(b => /💬\\s*1/.test(txt(b)));
  ok(!!balao, "o gestor vê o balão na linha questionada");
  ok(![...host.querySelectorAll("button")].some(b => txt(b) === "?"), "o gestor não tem botão de questionar");
  if (balao) {
    await act(async () => { balao.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    ok(foi, "clicar no balão leva ao separador Questões");
  }

  // Todas as linhas têm o mesmo nº de células do cabeçalho
  const cols = host.querySelectorAll("thead th").length;
  const desalinhadas = [...host.querySelectorAll("tbody tr")]
    .filter(tr => tr.querySelectorAll("td").length !== cols && !tr.querySelector("[colspan]"));
  ok(desalinhadas.length === 0, \`colunas alinhadas com o cabeçalho (\${cols} colunas)\`);
}

// ── Match: só faturas e previsões da empresa do extrato ────────────────────
{
  const FATURAS = [
    { id:"f-adseq", empresa:"adseq", fornecedor:"Clausula Dominante", valor:12500,
      vencimento:"2026-09-01", status:"Pendente em dia", categoria:"Obra" },
    { id:"f-pearl", empresa:"pearl", fornecedor:"Vertical Media", valor:12500,
      vencimento:"2026-09-02", status:"Pendente em dia", categoria:"Marketing" },
    { id:"f-sem",   empresa:null,    fornecedor:"Órfã sem empresa", valor:12500,
      vencimento:"2026-09-03", status:"Pendente em dia", categoria:"Outro" },
  ];
  const PAGS = [
    { id:"p-adseq", empresa:"adseq", tipo:"saida", descricao:"White Helmet (1/8)", valor:12500,
      data_inicio:"2026-09-04", status:"Pendente", categoria:"Obra" },
    { id:"p-infin", empresa:"infinite", tipo:"saida", descricao:"White Helmet (1/13)", valor:12500,
      data_inicio:"2026-09-04", status:"Pendente", categoria:"Obra" },
  ];
  const host = await abreExtrato({
    EMPRESAS: emp, extrato: [], caixaUnico: {}, setCaixaUnico: ()=>{},
    currentUser: gestor, movCounts: {}, faturas: FATURAS, pagamentosExtras: PAGS,
    questionamentos: [], addQuestionamento: async()=>({error:null}), onVerQuestoes: ()=>{},
  });
  // O botão de match só existe em saídas: m1 vale -12.500
  const btn = [...host.querySelectorAll("button")].find(b => txt(b) === "🔗");
  ok(!!btn, "a saída tem botão de match");
  await act(async () => { btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });

  const modal = [...document.querySelectorAll("div")].find(d => /Procurar match/.test(txt(d)));
  const linhas = modal ? [...modal.querySelectorAll("tbody tr")].map(txt) : [];
  ok(linhas.length > 0, "o modal lista candidatos (" + linhas.length + ")");
  ok(linhas.some(t => /Clausula Dominante/.test(t)), "inclui a fatura da própria empresa");
  ok(!linhas.some(t => /Vertical Media/.test(t)), "não inclui fatura da pearl");
  ok(!linhas.some(t => /Órfã sem empresa/.test(t)), "não inclui fatura sem empresa");
  ok(linhas.some(t => t.indexOf("(1/8)") >= 0), "inclui a previsão da própria empresa");
  ok(!linhas.some(t => t.indexOf("(1/13)") >= 0), "não inclui a previsão da infinite");
  ok(linhas.every(t => !/pearl|infinite/.test(t)), "nenhuma linha de outra empresa");
}

// ── Plano de contas: HDG tem subcategoria, LPX não ─────────────────────────
{
  const host = await abreExtrato({
    EMPRESAS: emp, extrato: [], caixaUnico: {}, setCaixaUnico: ()=>{},
    currentUser: gestor, movCounts: {}, faturas: [], pagamentosExtras: [],
    questionamentos: [], addQuestionamento: async()=>({error:null}), onVerQuestoes: ()=>{},
  });
  const cabec = [...host.querySelectorAll("thead th")].map(txt);
  ok(cabec.includes("Subcategoria"), \`HDG mostra a coluna Subcategoria (\${cabec.join("|")})\`);
  ok(cabec.includes("Observações"), "HDG chama Observações ao campo de texto");
  ok(!cabec.includes("Detalhes"), "HDG não mostra Detalhes");

  const selects = [...host.querySelectorAll("select")];
  const opcoes = selects.map(s => [...s.options].map(o => o.value));
  const catHDG = opcoes.find(o => o.includes("Soft_Costs"));
  ok(!!catHDG, "a categoria oferece o plano HDG (Soft_Costs)");
  ok(catHDG && catHDG.includes("Sócios"), "inclui as categorias em uso fora do Menu1 (Sócios)");
  ok(catHDG && !catHDG.includes("Ticket Refeição"), "não oferece o plano da LPX");
}

{
  const lpx = EMPRESAS.filter(e => e.id === "favcloset");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(ExtratosView, {
    EMPRESAS: lpx, extrato: [], caixaUnico: {}, setCaixaUnico: ()=>{},
    currentUser: gestor, movCounts: {}, faturas: [], pagamentosExtras: [],
    questionamentos: [], addQuestionamento: async()=>({error:null}), onVerQuestoes: ()=>{},
    autoOpenConta: { empresa: "favcloset", contaId: "adseq_bcp", banco: "BCP" },
  })); });
  const cabec = [...host.querySelectorAll("thead th")].map(txt);
  ok(!cabec.includes("Subcategoria"), "LPX continua sem coluna Subcategoria");
  ok(cabec.includes("Detalhes"), "LPX continua com Detalhes");
  const opcoes = [...host.querySelectorAll("select")].map(s => [...s.options].map(o => o.value));
  ok(opcoes.some(o => o.includes("Ticket Refeição")), "LPX mantém o seu plano de contas");
  ok(!opcoes.some(o => o.includes("Soft_Costs")), "LPX não recebe o plano HDG");
}

// ── Separador Questões: responder e marcar como lida ───────────────────────
{
  const lidas = [];
  let guardado = null;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Questoes, {
      currentUser: gestor, questionamentos: QUESTOES, loading: false, error: null,
      updateQuestionamento: async (id, u) => { guardado = { id, ...u }; return { error: null }; },
      deleteQuestionamento: async () => ({}),
      marcarLida: async (q, uid) => { lidas.push([q.id, uid]); },
      empresasVisiveis: emp,
    }));
  });

  ok(lidas.some(([id, uid]) => id === "q1" && uid === "u1"),
     "abrir o separador marca as questões como lidas pelo gestor");

  const responder = [...host.querySelectorAll("button")].find(b => txt(b) === "Responder");
  ok(!!responder, "existe o botão Responder");
  await act(async () => { responder.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });

  const caixa = host.querySelector("textarea");
  ok(!!caixa, "abre a caixa de resposta");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
  await act(async () => {
    setter.call(caixa, "É a empreitada do piso 2, fatura 2026/118.");
    caixa.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  const guardar = [...host.querySelectorAll("button")].find(b => /Guardar resposta/.test(txt(b)));
  await act(async () => { guardar.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });

  ok(guardado && guardado.id === "q1", "guarda na questão certa");
  ok(guardado && guardado.status === "respondido", "passa a estado respondido");
  ok(guardado && /piso 2/.test(guardado.resposta || ""), "guarda o texto da resposta");
  ok(guardado && guardado.respondido_por === "Rodrigo", "regista quem respondeu");
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://erp.test/", pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Event = dom.window.Event; global.MouseEvent = dom.window.MouseEvent;
global.Notification = undefined;
global.IS_REACT_ACT_ENVIRONMENT = true;
global.fetch = async () => ({ ok: true, json: async () => ({}) });

console.log("Questionamento no extrato (DOM):");
try {
  await import(pathToFileURL(join(dir, "saida.mjs")).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
