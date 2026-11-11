// A matriz do Fluxo Futuro num browser a sério: uma linha por despesa, uma
// coluna por mês, e as ações a abrirem ao clicar no valor.
//   node teste-matriz-ecra.mjs
import { build } from "esbuild";
import { comCauda } from "./testes/stubHooks.mjs";
import { writeFileSync, mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright";

const SAIDA = existsSync("/mnt/user-data/outputs") ? "/mnt/user-data/outputs" : "/tmp";
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".shmat-"));

// Três meses à frente de hoje, para as despesas caírem no futuro do fluxo
const mesMais = (n, dia = 10) => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(dia);
  return d.toISOString().slice(0, 10);
};
const M = [1, 2, 3].map(n => mesMais(n));
// O rótulo do mês tal como o plano de obra o escreve ("out/26"): é esta forma
// que partia a mesma despesa em várias linhas, por isso é esta que se testa.
const CURTO = ["jan", "fev", "mar", "abr", "mai", "jun",
               "jul", "ago", "set", "out", "nov", "dez"];
const rot = (iso) => `${CURTO[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;

writeFileSync(join(dir, "stub-supabase.js"), `
const r = { data: [], error: null };
const q = { select:()=>q, insert:()=>q, update:()=>q, upsert:()=>q, delete:()=>q, eq:()=>q, in:()=>q,
  gte:()=>q, lte:()=>q, neq:()=>q, order:()=>q, range:()=>q, limit:()=>q,
  single:()=>Promise.resolve(r), then:(f)=>Promise.resolve(r).then(f) };
export const supabase = { from:()=>q, channel:()=>({on(){return this},subscribe(){return this}}),
  removeChannel:()=>{},
  auth:{ getSession:()=>Promise.resolve({data:{session:null}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) } };
export default supabase;`);

writeFileSync(join(dir, "stub-hooks.js"), comCauda(`
const V = Object.freeze({ vendas: [], loading:false, updateVenda: async()=>({}) });
export const useVendas = () => V;
export const useSaldosAtuais = () => Object.freeze({ saldos: Object.freeze({ adseq_bcp: 100000 }), reload:()=>{}, loading:false });
export const useRecebiveis = () => Object.freeze({ recebiveis: [], loading:false,
  addRecebivel: async()=>({}), updateRecebivel: async()=>({}), deleteRecebivel: async()=>({}) });
export const useObraPlanos = () => Object.freeze({ planos: [], loading:false, error:null,
  guardarPlano: async()=>({ data:[], error:null }) });
export const useDespesasRecorrentes = () => Object.freeze({ recorrentes: [], loading:false, error:null,
  guardarRecorrente: async()=>({}), apagarRecorrente: async()=>({}), pararRecorrente: async()=>({}) });
export const useFracoes = () => Object.freeze({ fracoes: [], loading:false,
  upsertFracao: async()=>({}), deleteFracao: async()=>({}) });
export const useMovimentosPeriodo = () => Object.freeze({ movimentos: [], loading:false, reload:()=>{} });
`));

// A contabilidade em três parcelas (uma por mês) e o arquiteto em duas: na
// vista mensal são cinco linhas soltas; na matriz têm de ser duas.
const pags = [
  ...[0, 1, 2].map(i => ({
    id: `c${i}`, tipo: "saida", empresa: "adseq", categoria: "Accounting",
    descricao: `Contabilidade (Ingtrust) (${i + 1}/3) · Avença mensal - mês ${i + 1}`,
    valor: 307.50, data_inicio: M[i], parcelas: 1, periodicidade: "unica", status: "Pendente",
  })),
  ...[0, 1].map(i => ({
    id: `a${i}`, tipo: "saida", empresa: "adseq", categoria: "Architect",
    descricao: `Júlia Azevedo - Honorários (${i + 1}/2) · Honorários mês ${i + 1}`,
    valor: 369, data_inicio: M[i], parcelas: 1, periodicidade: "unica", status: "Pendente",
  })),
  { id: "imi", tipo: "saida", empresa: "adseq", categoria: "Impostos e taxas",
    descricao: "IMI 2025 - 3.ª prestação", valor: 516.28, data_inicio: M[1],
    parcelas: 1, periodicidade: "unica", status: "Pendente" },
  { id: "esc", tipo: "entrada", empresa: "adseq", categoria: "Vendas",
    descricao: "Escritura Loja Arroios", valor: 150000, data_inicio: M[1],
    parcelas: 1, periodicidade: "unica", status: "Pendente" },
  // A Admirable Sequence é um projeto HDG: estas duas foram lançadas com o
  // vocabulário LPX e têm de aparecer na grelha com o nome da FO.
  { id: "ob", tipo: "saida", empresa: "adseq", categoria: "Obra",
    descricao: "Complai", valor: 77953.17, data_inicio: M[0],
    parcelas: 1, periodicidade: "unica", status: "Pendente" },
  { id: "fg", tipo: "saida", empresa: "adseq", categoria: "Fee Gestão",
    descricao: "Cláusula Dominante", valor: 6765, data_inicio: M[0],
    parcelas: 1, periodicidade: "unica", status: "Pendente" },
];

writeFileSync(join(dir, "entrada.jsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import FluxoFuturo from "SRC/FluxoFuturo.jsx";
import { EMPRESAS } from "SRC/empresas.js";
window.__apagados = [];
createRoot(document.getElementById("r")).render(
  React.createElement("div", { style:{ fontFamily:"system-ui,-apple-system,sans-serif", padding:14 } },
    React.createElement(FluxoFuturo, {
      faturas: [], faturasLoading: false,
      pagamentosExtras: ${JSON.stringify(pags)}, pagamentosLoading: false,
      onAddPagamento: async()=>({}), onUpdatePagamento: async(id,u)=>{ window.__atualizado = [id,u]; return {data:[{}],error:null}; },
      onDeletePagamento: async(id)=>{ window.__apagados.push(id); return {data:[{}],error:null}; },
      onUpdateFatura: async()=>({}), onDeleteFatura: async()=>({}),
      onAddPagamentos: async()=>({}), onApagarPagamentos: async()=>({}),
      currentUser: { id:"u1", nome:"Felipe", email:"felipe@lpxprivate.com", role:"admin", approval_level:2, empresas:[] },
      EMPRESAS: EMPRESAS.filter(e => e.id === "adseq"), caixaUnico: {},
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
const p = await b.newPage({ viewportSize: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
const erros = [];
p.on("pageerror", e => { erros.push(e.message); console.log("[pageerror]", e.message); });
await p.goto(pathToFileURL(join(dir, "i.html")).href);
await p.waitForTimeout(700);

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };
const corpo = () => p.evaluate(() => document.body.innerText);

console.log("Matriz do Fluxo Futuro (browser):");
ok(erros.length === 0, "o ecrã monta sem erros de consola");

// ── A matriz é o que abre por omissão ───────────────────────────────────────
let t = await corpo();
ok(/Despesas × meses/.test(t), "o Fluxo Futuro abre logo na matriz, sem ser preciso clicar");
ok(!/Fluxo de Caixa —/.test(t), "e a vista mensal não aparece ao mesmo tempo");

// ── Abre agrupado, e os grupos abrem-se um a um ─────────────────────────────
const visiveis = () => p.evaluate(() => [...document.querySelectorAll("tbody tr")]
  .map(tr => (tr.querySelector("td")?.innerText || "").trim()).filter(Boolean));
let linhasIniciais = await visiveis();
ok(!linhasIniciais.some(x => /Contabilidade/.test(x)),
   "ao abrir, está tudo agrupado: o detalhe não aparece");
ok(linhasIniciais.some(x => /Accounting/.test(x)), "mas os grupos estão lá");
ok(linhasIniciais.some(x => /▶/.test(x)), "com a seta a dizer que abrem");
await p.screenshot({ path: join(SAIDA, "fluxo-matriz-agrupado.png") });

await p.locator("tbody tr", { hasText: "Accounting" }).first().click();
await p.waitForTimeout(300);
let agora = await visiveis();
ok(agora.some(x => /Contabilidade/.test(x)), "clicar no grupo abre o detalhe");
ok(!agora.some(x => /Júlia/.test(x)), "e só esse: os outros ficam como estavam");

// abrir um segundo não fecha o primeiro — era isto que tinha de ficar garantido
await p.locator("tbody tr", { hasText: "Architect" }).first().click();
await p.waitForTimeout(300);
agora = await visiveis();
ok(agora.some(x => /Júlia/.test(x)) && agora.some(x => /Contabilidade/.test(x)),
   "abrir um segundo grupo não recolhe o primeiro");

// e fecha-se só o que se clica
await p.locator("tbody tr", { hasText: "Architect" }).first().click();
await p.waitForTimeout(300);
agora = await visiveis();
ok(!agora.some(x => /Júlia/.test(x)) && agora.some(x => /Contabilidade/.test(x)),
   "fechar um deixa o outro aberto");

// os dois botões de atalho
await p.locator('button:has-text("Expandir tudo")').click();
await p.waitForTimeout(350);
agora = await visiveis();
ok(agora.some(x => /Júlia/.test(x)) && agora.some(x => /IMI/.test(x)) &&
   agora.some(x => /Escritura/.test(x)), "«Expandir tudo» abre todos os grupos");
await p.locator('button:has-text("Recolher tudo")').click();
await p.waitForTimeout(350);
agora = await visiveis();
ok(!agora.some(x => /Contabilidade/.test(x)), "«Recolher tudo» volta a agrupar");

// mexer nas colunas não fecha o que estava aberto
await p.locator("tbody tr", { hasText: "Accounting" }).first().click();
await p.waitForTimeout(250);
await p.locator('button:has-text("12")').first().click();
await p.waitForTimeout(350);
ok((await visiveis()).some(x => /Contabilidade/.test(x)),
   "mudar o número de meses não fecha os grupos abertos");
await p.locator('button:has-text("6")').first().click();
await p.waitForTimeout(300);

// daqui para a frente o teste precisa de ver as linhas
await p.locator('button:has-text("Expandir tudo")').click();
await p.waitForTimeout(350);

// ── As parcelas da mesma despesa são UMA linha ──────────────────────────────
const linhas = await p.evaluate(() => [...document.querySelectorAll("tbody tr")]
  .map(tr => (tr.querySelector("td")?.innerText || "").trim()).filter(Boolean));
const contabilidade = linhas.filter(x => /Contabilidade/.test(x));
ok(contabilidade.length === 1,
   `as três parcelas da contabilidade são uma linha só (deu ${contabilidade.length})`);
ok(!/\(1\/3\)/.test(contabilidade[0] || ""), "e o número da parcela saiu do nome");
ok(linhas.filter(x => /Júlia/.test(x)).length === 1, "o arquiteto também vem numa linha");

// ── Uma coluna por mês, e os valores no sítio certo ─────────────────────────
const cabecalhos = await p.evaluate(() =>
  [...document.querySelectorAll("thead th")].map(th => th.innerText.trim()));
ok(/^despesa$/i.test(cabecalhos[0]), `a primeira coluna é a despesa (${cabecalhos[0]})`);
ok(/^total$/i.test(cabecalhos[cabecalhos.length - 1]), "e a última o total da linha");
ok(cabecalhos.length >= 5, `há uma coluna por mês (${cabecalhos.slice(1, -1).join(", ")})`);
ok(cabecalhos.slice(1, -1).every(h => /^[a-z]{3}\/\d{2}$/i.test(h)),
   `e os meses leem-se como nas folhas: ${cabecalhos.slice(1, -1).join(", ")}`);

const celulasContab = await p.evaluate(() => {
  const tr = [...document.querySelectorAll("tbody tr")]
    .find(x => /Contabilidade/.test(x.querySelector("td")?.innerText || ""));
  return [...tr.querySelectorAll("td")].map(td => td.innerText.trim());
});
ok(celulasContab.filter(x => /307/.test(x)).length === 3,
   "os 307,50 € aparecem nos três meses, cada um na sua coluna");
ok(/922/.test(celulasContab[celulasContab.length - 1]),
   `e o total da linha é 922,50 € (${celulasContab[celulasContab.length - 1]})`);

// Entradas e saídas separadas, com o líquido do mês em baixo
ok(/ENTRADAS/i.test(t) && /SA[IÍ]DAS/i.test(t), "entradas e saídas em secções próprias");
ok(/Líquido do mês/i.test(t), "e o líquido do mês no rodapé");
await p.screenshot({ path: join(SAIDA, "fluxo-matriz.png") });

// ── Um projeto HDG mostra as linhas da sua FO ───────────────────────────────
// A Admirable Sequence é HDG: o que foi lançado como «Obra» e «Fee Gestão»
// tem de aparecer na grelha como «Gastos com Obras» e «Taxa de Gestão», que
// são as linhas do fluxo operacional dela.
const grupos = await p.evaluate(() => [...document.querySelectorAll("tbody tr")]
  .map(tr => (tr.querySelector("td")?.innerText || "").replace(/[▶▼]/g, "").trim())
  .filter(Boolean));
ok(grupos.some(x => /Gastos com Obras/.test(x)),
   `«Obra» aparece como «Gastos com Obras» (${grupos.filter(x=>/Obra/.test(x)).join(" · ")})`);
ok(grupos.some(x => /Taxa de Gestão/.test(x)), "e «Fee Gestão» como «Taxa de Gestão»");
ok(!grupos.some(x => /^Fee Gestão/.test(x)), "o nome LPX já não aparece");
ok(!grupos.some(x => /^Soft_Costs|^Obras \(/.test(x)),
   "e os blocos do plano de contas também não: a linha é a despesa");
await p.screenshot({ path: join(SAIDA, "matriz-hdg.png") });

// ── Clicar no valor abre as ações daquele lançamento ────────────────────────
ok(!/→ fatura/.test(t), "os botões não ocupam espaço na grelha");
const celula = p.locator("tbody tr", { hasText: "Contabilidade" }).first().locator("td").nth(1);
await celula.click();
await p.waitForTimeout(350);
t = await corpo();
ok(/lançamento/.test(t), "clicar no valor abre o que está dentro da célula");
ok(/→ fatura/.test(t), "com o botão de converter em fatura");
ok(/✓/.test(t), "o de marcar como pago");
ok(/✎/.test(t), "e o de editar");
await p.screenshot({ path: join(SAIDA, "fluxo-matriz-celula.png") });

// uma célula vazia não abre nada
const painelAberto = async () => await p.locator('button[title="Editar pagamento"]').count();
await p.keyboard.press("Escape");
await p.waitForTimeout(250);
ok(await painelAberto() === 0, "Escape fecha o painel");
// o IMI só tem valor no 2.º mês: a célula do 1.º está vazia
const vazia = p.locator("tbody tr", { hasText: "IMI" }).first().locator("td").nth(1);
ok((await vazia.innerText()).trim() === "—", "a célula escolhida está mesmo vazia");
await vazia.click();
await p.waitForTimeout(250);
ok(await painelAberto() === 0, "uma célula sem valor não abre nada");

// ── Apagar a partir da matriz chega à base ──────────────────────────────────
await celula.click();
await p.waitForTimeout(300);
p.once("dialog", d => d.accept());
await p.locator('button[title="Eliminar pagamento"]').first().click();
await p.waitForTimeout(400);
const apagados = await p.evaluate(() => window.__apagados || []);
ok(apagados.length === 1, `apagar na matriz chega à base (${apagados.join()})`);

// ── O utilizador manda nas colunas ──────────────────────────────────────────
await p.keyboard.press("Escape");
await p.waitForTimeout(200);
const nCols = async () => (await p.evaluate(() =>
  document.querySelectorAll("thead th").length)) - 2;
const antes = await nCols();
await p.locator('button[title="Menos um mês"]').click();
await p.waitForTimeout(300);
ok(await nCols() === antes - 1, "o botão − tira um mês");
await p.locator('button:has-text("3")').first().click();
await p.waitForTimeout(300);
ok(await nCols() === 3, "e os atalhos 3/6/12/24 fixam o número de meses");

// ── Voltar à vista mensal ───────────────────────────────────────────────────
await p.locator('button:has-text("Mensal")').first().click();
await p.waitForTimeout(350);
t = await corpo();
ok(/Fluxo de Caixa/.test(t) && !/Despesas × meses/.test(t), "dá para ir à vista mensal");
await p.locator('button:has-text("Matriz")').first().click();
await p.waitForTimeout(350);
t = await corpo();
ok(/Despesas × meses/.test(t), "e voltar à matriz");

await b.close();
rmSync(dir, { recursive: true, force: true });
console.log(mau === 0 ? "✅ Matriz (ecrã) OK" : `❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
