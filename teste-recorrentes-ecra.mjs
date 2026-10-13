// As despesas recorrentes de ponta a ponta num browser: criar a regra,
// vê-la cair nos meses do fluxo, e pará-la com a data de fim.
//   node teste-recorrentes-ecra.mjs
import { build } from "esbuild";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright";

const dir = mkdtempSync(join(process.cwd(), "node_modules", ".lpx-rec-"));
const SRC = pathToFileURL(join(process.cwd(), "src")).pathname + "/";

writeFileSync(join(dir, "stub-supabase.js"), `
const r = { data: [], error: null };
const q = { select:()=>q, insert:()=>q, update:()=>q, delete:()=>q, upsert:()=>q, eq:()=>q,
  in:()=>q, gte:()=>q, lte:()=>q, neq:()=>q, order:()=>q, range:()=>q, limit:()=>q,
  single:()=>Promise.resolve(r), then:(f)=>Promise.resolve(r).then(f) };
export const supabase = { from:()=>q, channel:()=>({on(){return this},subscribe(){return this}}),
  removeChannel:()=>{},
  auth:{ getSession:()=>Promise.resolve({data:{session:null}}),
         onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) } };
export default supabase;`);

// A tabela das recorrentes vive em memória, para o ecrã se comportar como
// se o Supabase estivesse lá: gravar aparece na lista e no fluxo.
writeFileSync(join(dir, "stub-hooks.js"), `
import { useState, useCallback } from "react";
const VAZIO = Object.freeze({ loading:false, error:null, reload:()=>{} });
export const useVendas = () => ({ ...VAZIO, vendas: [], updateVenda: async()=>({}) });
export const useSaldosAtuais = () => ({ ...VAZIO, saldos: { favcloset_bcp: 100000 } });
export const useRecebiveis = () => ({ ...VAZIO, recebiveis: [], addRecebivel: async()=>({}),
  updateRecebivel: async()=>({}), deleteRecebivel: async()=>({}) });
export const useObraPlanos = () => ({ ...VAZIO, planos: [], guardarPlano: async()=>({}) });
export const useMovimentosPeriodo = () => ({ ...VAZIO, movimentos: [] });

let LINHAS = [];
const ouvintes = new Set();
const avisar = () => ouvintes.forEach(f => f(x => x + 1));
export const useDespesasRecorrentes = () => {
  const [, forca] = useState(0);
  useState(() => { ouvintes.add(forca); });
  const guardarRecorrente = useCallback(async (r) => {
    const id = r.id || "rec_" + Math.random().toString(36).slice(2, 8);
    const i = LINHAS.findIndex(x => x.id === id);
    const linha = { ...r, id };
    // Array novo sempre: mutar em sítio deixava os useMemo do painel a ver
    // a mesma referência e a lista não se atualizava (o hook real substitui
    // os dados por inteiro, por isso o problema era só do duplo).
    LINHAS = i >= 0 ? LINHAS.map((x, k) => (k === i ? linha : x)) : [...LINHAS, linha];
    globalThis.__recGravados = LINHAS;
    avisar();
    return { data: [linha], error: null };
  }, []);
  const apagarRecorrente = useCallback(async (id) => {
    LINHAS = LINHAS.filter(x => x.id !== id); avisar(); return { data: [], error: null };
  }, []);
  return { ...VAZIO, recorrentes: LINHAS, guardarRecorrente, apagarRecorrente,
           pararRecorrente: async()=>({}) };
};
`);

writeFileSync(join(dir, "entrada.jsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import FluxoFuturo from "SRC/FluxoFuturo.jsx";
import { EMPRESAS } from "SRC/empresas.js";
const emp = EMPRESAS.filter(e => e.id === "favcloset");
createRoot(document.getElementById("r")).render(
  React.createElement("div", { style: { fontFamily: "system-ui,-apple-system,sans-serif",
                                        background: "#F6F0E8", padding: 16, minHeight: "100vh" } },
    React.createElement(FluxoFuturo, {
      faturas: [], faturasLoading: false, pagamentosExtras: [], pagamentosLoading: false,
      onAddPagamento: async()=>({}), onUpdatePagamento: async()=>({}),
      onDeletePagamento: async()=>({}), onAddPagamentos: async()=>({}),
      onApagarPagamentos: async()=>({}), onUpdateFatura: async()=>({}),
      onDeleteFatura: async()=>({}),
      currentUser: { nome: "Felipe", role: "admin" }, EMPRESAS: emp, caixaUnico: {} })));
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
const p = await b.newPage({ viewportSize: { width: 1440, height: 980 }, deviceScaleFactor: 2 });
p.on("pageerror", e => console.log("[pageerror]", e.message));
await p.goto(pathToFileURL(join(dir, "i.html")).href);
await p.waitForTimeout(600);

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };
const txt = () => p.evaluate(() => document.body.innerText);
const preencher = async (rotulo, valor) => {
  await p.evaluate(([r, v]) => {
    const d = [...document.querySelectorAll("div")].find(x =>
      x.children[0] && (x.children[0].textContent || "").trim().toLowerCase() === r.toLowerCase() &&
      x.querySelector("input, select"));
    const el = d.querySelector("input, select");
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, [rotulo, valor]);
  await p.waitForTimeout(120);
};

// Datas em ISO sem passar pelo toISOString, que converte para UTC e rouba um
// dia a quem está em UTC+1 — o bug que fazia o teste pedir 6 e receber 5.
const hoje = new Date();
const isoLocal = (a, m, d) =>
  `${a}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
// O dia 28 existe em todos os meses e é sempre depois de hoje no mês corrente
// só se hoje for antes dele; por isso arranca-se no mês seguinte.
const daquiAMeses = (n) => {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + n, 1);
  return isoLocal(d.getFullYear(), d.getMonth(), 28);
};

console.log("Despesas recorrentes (browser):");
// No consolidado o botão está lá mas apagado: a despesa é de uma empresa.
ok(await p.locator('button:has-text("Despesas recorrentes")').first().isDisabled(),
   "em Todos os Projetos o botão está à vista mas apagado");

// ── Escolher o projeto, como o Felipe faz ─────────────────────────────────
await p.locator('button:has-text("Favorite Closet")').first().click();
await p.waitForTimeout(400);
ok(!(await p.locator('button:has-text("Despesas recorrentes")').first().isDisabled()),
   "escolhido o projeto, o botão acende");
await p.locator('button:has-text("Despesas recorrentes")').first().click();
await p.waitForTimeout(350);
ok(/Nova despesa recorrente/.test(await txt()), "e abre o painel");
ok(/Ainda não há despesas recorrentes/.test(await txt()), "que começa vazio");

// ── Criar uma regra ────────────────────────────────────────────────────────
await preencher("Descritivo", "Contabilidade");
await preencher("Valor por ocorrência", "150");
await preencher("Categoria", "Administrativos");
const inicio = daquiAMeses(1), fim = daquiAMeses(6);
await preencher("Começa em", inicio);
await preencher("Até quando", fim);
await p.waitForTimeout(250);
const { ocorrenciasDe } = await import("./src/recorrentes.js");
const esperadas = ocorrenciasDe(
  { descricao: "Contabilidade", valor: 150, data_inicio: inicio, data_fim: fim,
    periodicidade: "mensal", ativa: true },
  { de: isoLocal(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()), ate: fim }).length;

const comPrevisao = await txt();
// o rótulo está em maiúsculas por CSS, e o innerText devolve-o assim
ok(/o que isto lan.a a partir de hoje/i.test(comPrevisao), "o painel pré-visualiza o que vai lançar");
ok(new RegExp(`${esperadas} × 150,00 €`).test(comPrevisao.replace(/\s+/g, " ")),
   `${esperadas} ocorrências de 150 € no horizonte`);
ok(new RegExp(`= ${(esperadas * 150).toLocaleString("pt-PT", {minimumFractionDigits: 2})} €`)
     .test(comPrevisao.replace(/\s+/g, " ")) ||
   comPrevisao.includes(String(esperadas * 150)), "com o total feito pelo ecrã");
await p.screenshot({ path: "/mnt/user-data/outputs/recorrentes-painel.png" });

await p.locator('button:has-text("Criar despesa recorrente")').click();
await p.waitForTimeout(400);
const depois = await txt();
ok(/Nesta empresa \(1\)/.test(depois), "a regra entra na lista");
ok(/Mensal · desde/.test(depois), "dizendo a periodicidade e as datas");
ok(new RegExp(`Faltam ${esperadas} ×`).test(depois.replace(/\s+/g, " ")),
   "e quanto falta até ao fim");

// ── Cai no fluxo, mês a mês ────────────────────────────────────────────────
await p.locator('div[style*="fixed"] button:has-text("Fechar")').last().click();
await p.waitForTimeout(450);
// Os meses do fluxo vêm fechados: abre-se o primeiro que tenha saídas para
// ver as linhas lá dentro.
const abriu = await p.evaluate(() => {
  const linhas = [...document.querySelectorAll("tr")];
  const alvo = linhas.find(tr => /Contabilidade|^\s*\w{3}\.?\s*(de\s*)?20/.test(tr.innerText) &&
                                 /150/.test(tr.innerText));
  const candidata = alvo || linhas.find(tr => /150/.test(tr.innerText));
  if (candidata) { candidata.click(); return candidata.innerText.slice(0, 80); }
  return null;
});
await p.waitForTimeout(350);
const fluxoAberto = await txt();
const nosMeses = (fluxoAberto.match(/Contabilidade/g) || []).length;
ok(nosMeses >= 1, `a despesa cai nos meses do fluxo (${nosMeses} linhas; abriu: ${abriu})`);
ok(/recorrente/i.test(fluxoAberto), "e a linha diz que vem de uma recorrente");
await p.screenshot({ path: "/mnt/user-data/outputs/recorrentes-fluxo.png", fullPage: false });

// ── Parar: mudar a data de fim ─────────────────────────────────────────────
await p.locator('button:has-text("Despesas recorrentes")').first().click();
await p.waitForTimeout(350);
await p.locator('button:has-text("Parar hoje")').first().click();
await p.waitForTimeout(400);
const parada = await txt();
ok(/Terminada/.test(parada),
   `parar hoje encosta a data de fim e a regra deixa de correr (${
     (parada.match(/Faltam[^\n]*|Terminada[^\n]*/) || ["?"])[0]})`);
ok(/Nesta empresa \(1\)/.test(parada), "mas a regra continua lá: parar não é apagar");

// ── Apagar pede confirmação ────────────────────────────────────────────────
await p.locator('button:has-text("Apagar")').first().click();
await p.waitForTimeout(200);
ok(/Apagar mesmo/.test(await txt()), "apagar pede confirmação antes");
await p.locator('button:has-text("Não")').first().click();
await p.waitForTimeout(200);
ok(/Nesta empresa \(1\)/.test(await txt()), "e dizer que não deixa a regra em paz");
await p.locator('button:has-text("Apagar")').first().click();
await p.waitForTimeout(150);
await p.locator('button:has-text("Apagar mesmo")').first().click();
await p.waitForTimeout(400);
ok(/Ainda não há despesas recorrentes/.test(await txt()), "confirmar apaga mesmo");

console.log(mau === 0 ? "\n✅ Despesas recorrentes (ecrã) OK" : `\n❌ ${mau} falha(s)`);
await b.close();
rmSync(dir, { recursive: true, force: true });
process.exit(mau ? 1 : 0);
