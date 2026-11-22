// O botão do report no Fluxo Futuro: está lá, lê o extrato e descarrega um
// .pptx válido — com os números do ecrã, não outros.
//   node teste-report-ecra.mjs
import { build } from "esbuild";
import { comCauda } from "./testes/stubHooks.mjs";
import { writeFileSync, mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright";
import { crc32 } from "./src/pptx.js";

const SAIDA = existsSync("/mnt/user-data/outputs") ? "/mnt/user-data/outputs" : "/tmp";
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".shrep-"));
const SRC = pathToFileURL(join(process.cwd(), "src")).pathname + "/";

const daquiA = (n) => { const d = new Date(); d.setDate(1);
                        d.setMonth(d.getMonth() + n); d.setDate(10);
                        return d.toISOString().slice(0, 10); };

const PAGS = [
  { id:"p1", tipo:"saida", empresa:"adseq", categoria:"Obras", subcategoria:"Gastos com Obras",
    descricao:"Obra — auto 3", valor:90196.75, data_inicio:daquiA(0),
    parcelas:1, periodicidade:"unica", status:"Pendente" },
  { id:"p2", tipo:"saida", empresa:"adseq", categoria:"Obras", subcategoria:"Gastos com Obras",
    descricao:"Obra — auto 4", valor:90196.74, data_inicio:daquiA(1),
    parcelas:1, periodicidade:"unica", status:"Pendente" },
];
const FATURAS = [
  { id:"f1", empresa:"adseq", fatura:"FT 2026/71", fornecedor:"Chiasso",
    categoria:"Soft_Costs", subcategoria:"Fiscalização", valor:1599,
    vencimento:daquiA(0), status:"Pendente em dia" },
];

writeFileSync(join(dir, "stub-supabase.js"), `
const r = { data: [], error: null };
const q = { select:()=>q, insert:()=>q, update:()=>q, upsert:()=>q, delete:()=>q, eq:()=>q, in:()=>q,
  gt:()=>q, gte:()=>q, lte:()=>q, neq:()=>q, order:()=>q, range:()=>q, limit:()=>q,
  single:()=>Promise.resolve(r), then:(f)=>Promise.resolve(r).then(f) };
export const supabase = { from:()=>q, channel:()=>({on(){return this},subscribe(){return this}}),
  removeChannel:()=>{},
  auth:{ getSession:()=>Promise.resolve({data:{session:null}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) } };
export default supabase;`);

// O stub do hooks exporta também o lerCaixaSemana, com um extrato de mentira:
// é o que o botão vai buscar quando é carregado.
writeFileSync(join(dir, "stub-hooks.js"), comCauda(`
export const useVendas = () => Object.freeze({ vendas: [], loading:false, updateVenda: async()=>({}) });
export const useSaldosAtuais = () => Object.freeze({ saldos: Object.freeze({ adseq_bcp: 3225.72 }), reload:()=>{}, loading:false });
export const useRecebiveis = () => Object.freeze({ recebiveis: [], loading:false });
export const useObraPlanos = () => Object.freeze({ planos: [], loading:false, error:null, guardarPlano: async()=>({}) });
export const useDespesasRecorrentes = () => Object.freeze({ recorrentes: [], loading:false, error:null,
  guardarRecorrente: async()=>({}), apagarRecorrente: async()=>({}), pararRecorrente: async()=>({}) });
export const useFracoes = () => Object.freeze({ fracoes: [], loading:false, upsertFracao: async()=>({}), deleteFracao: async()=>({}) });
export const useMovimentosPeriodo = () => Object.freeze({ movimentos: [], loading:false, reload:()=>{} });
export const lerCaixaSemana = async (contaIds, de, ate) => {
  window.__pedido = { contaIds, de, ate };
  return { saldoAnterior: 19500, erro: null, movimentos: [
    { data: de, valor: -15000, movimento: "TRF P/ COMPLAI", subcategoria: "Gastos com Obras" },
    { data: ate, valor: -1274.28, movimento: "CHIASSO fiscalizacao", subcategoria: "Fiscalização" },
  ]};
};
`));

writeFileSync(join(dir, "entrada.jsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import FluxoFuturo from "SRC/FluxoFuturo.jsx";
import { EMPRESAS } from "SRC/empresas.js";
// Apanhar o ficheiro em vez de o descarregar.
window.__blobs = [];
window.__nomes = [];
const criar = URL.createObjectURL.bind(URL);
URL.createObjectURL = (b) => { window.__blobs.push(b); return criar(b); };
// O nome do ficheiro vive no atributo download do <a>; sem o apanhar aqui
// não há como verificar que é "Report Semanal - ...".
const criarEl = document.createElement.bind(document);
document.createElement = (t) => {
  const el = criarEl(t);
  if (String(t).toLowerCase() === "a") {
    const obs = new MutationObserver(() => {
      if (el.download && !window.__nomes.includes(el.download)) window.__nomes.push(el.download);
    });
    obs.observe(el, { attributes: true });
    Object.defineProperty(el, "download", {
      set(v) { this.setAttribute("download", v); window.__nomes.push(v); },
      get() { return this.getAttribute("download"); }, configurable: true });
  }
  return el;
};
createRoot(document.getElementById("r")).render(
  React.createElement("div", { style:{ fontFamily:"system-ui,-apple-system,sans-serif", padding:14 } },
    React.createElement(FluxoFuturo, {
      faturas: ${JSON.stringify(FATURAS)}, faturasLoading: false,
      pagamentosExtras: ${JSON.stringify(PAGS)}, pagamentosLoading: false,
      onAddPagamento: async()=>({}), onUpdatePagamento: async()=>({data:[{}],error:null}),
      onDeletePagamento: async()=>({data:[{}],error:null}),
      onUpdateFatura: async()=>({}), onDeleteFatura: async()=>({}),
      onAddPagamentos: async()=>({}), onApagarPagamentos: async()=>({}),
      currentUser: { id:"u1", nome:"Felipe", role:"admin", approval_level:2, empresas:[] },
      EMPRESAS: EMPRESAS.filter(e => e.id === "adseq"), caixaUnico: {},
    })));
`.replace(/SRC\//g, SRC));

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
const p = await b.newPage({ viewportSize: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
const erros = [];
p.on("pageerror", e => { erros.push(e.message); console.log("[pageerror]", e.message); });
p.on("dialog", async d => { console.log("[dialog]", d.type(), d.message().slice(0, 200)); await d.dismiss(); });
await p.goto(pathToFileURL(join(dir, "i.html")).href);
await p.waitForTimeout(900);

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };

console.log("O botão no Fluxo Futuro:");
ok(erros.length === 0, `o ecrã monta sem erros${erros.length ? ": " + erros[0] : ""}`);

// ── O projeto agora é uma lista, não dez botões ──────────────────────────
const seletor = await p.evaluate(() => {
  const lab = [...document.querySelectorAll("label")].find(l => /^Projeto$/i.test(l.textContent.trim()));
  const sel = lab?.parentElement?.querySelector("select");
  if (!sel) return null;
  return { n: sel.options.length, valor: sel.value,
           opcoes: [...sel.options].map(o => o.textContent),
           grupos: [...sel.querySelectorAll("optgroup")].map(g => g.label) };
});
ok(!!seletor, "o projeto escolhe-se numa lista");
ok(seletor && seletor.opcoes.some(o => /Todos os Projetos/i.test(o)),
   "com «Todos os Projetos» no topo");
ok(seletor && seletor.opcoes.every(o => /€/.test(o)),
   `e cada projeto com o saldo ao lado: ${(seletor?.opcoes || [])[0]}`);
const nBotoesProjeto = await p.evaluate(() =>
  [...document.querySelectorAll("button")].filter(b => /Admirable Sequence/i.test(b.textContent)).length);
ok(nBotoesProjeto === 0, "e já não há uma fila de botões por projeto");

const temBotao = await p.evaluate(() =>
  !![...document.querySelectorAll("button")].find(x => /Report de caixa/i.test(x.textContent)));
ok(temBotao, "o botão «Report de caixa» está na barra");

const estado = await p.evaluate(() => {
  const bt = [...document.querySelectorAll("button")].find(x => /Report de caixa/i.test(x.textContent));
  if (!bt) return { achou: false };
  const r = { achou: true, disabled: bt.disabled, texto: bt.textContent.trim(), title: bt.title };
  bt.click();
  return r;
});
ok(estado.achou && !estado.disabled, "e está ativo com um projeto escolhido");
await p.waitForTimeout(1200);

const pedido = await p.evaluate(() => window.__pedido);
ok(!!pedido, "ao carregar, vai mesmo buscar o extrato");
ok(Array.isArray(pedido?.contaIds) && pedido.contaIds.length > 0,
   `com as contas do projeto: ${(pedido?.contaIds || []).join(", ")}`);
const diff = pedido ? (new Date(pedido.ate) - new Date(pedido.de)) / 86400000 : 0;
ok(Math.round(diff) === 7, `e uma janela de 7 dias (${Math.round(diff)})`);

// Saem DOIS ficheiros do mesmo clique: o .pptx e o PDF.
await p.waitForTimeout(700);        // o segundo sai com um intervalo curto
const blobs = await p.evaluate(() => window.__blobs.map(b => b.type));
ok(blobs.length === 2, `saem dois ficheiros (${blobs.length})`);
ok(/presentationml\.presentation/.test(blobs[0] || ""), `o 1.º é o deck: ${blobs[0]}`);
ok(/application\/pdf/.test(blobs[1] || ""), `o 2.º é o PDF: ${blobs[1]}`);

const nomesFicheiro = await p.evaluate(() => window.__nomes || []);
ok(nomesFicheiro.every(n => /^Report Semanal - /.test(n)),
   `com os nomes certos: ${nomesFicheiro.join(" | ")}`);
ok(nomesFicheiro.length === 2 && nomesFicheiro[0].endsWith(".pptx")
   && nomesFicheiro[1].endsWith(".pdf"), "um .pptx e um .pdf");

// Ler os bytes de volta e conferir que é um .pptx a sério.
const b64 = await p.evaluate(async () => {
  const buf = await window.__blobs[0].arrayBuffer();
  let s = ""; const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
});
const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
ok(bytes[0] === 0x50 && bytes[1] === 0x4b, `começa por PK (${bytes.length} bytes)`);

const partes = lerZip(bytes);
ok(partes.length > 10, `${partes.length} partes dentro do ZIP`);
ok(partes.every(x => x.crcOk), "e todas com o CRC certo");
const nomes = partes.map(x => x.nome);
ok(nomes.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length === 4, "quatro slides");

const dec = new TextDecoder();
const s1 = dec.decode(partes.find(x => x.nome === "ppt/slides/slide1.xml").dados);
ok(/19\.500,00 €/.test(s1), "o caixa de há 7 dias veio do extrato que o botão leu");
ok(/3\.225,72 €/.test(s1), "e o caixa de hoje é o do ecrã");
ok(/16\.274,28 €/.test(s1), "com as saídas da semana somadas");

const s2 = dec.decode(partes.find(x => x.nome === "ppt/slides/slide2.xml").dados);
ok(/1\.599,00 €/.test(s2), "o slide do mês separa o que já está faturado (a fatura)");
ok(/90\.196,75 €/.test(s2), "do que é previsão (o auto de obra)");

// O botão volta ao normal — não pode ficar preso em "A preparar…".
const voltou = await p.evaluate(() =>
  !![...document.querySelectorAll("button")].find(x => /^Report de caixa$/.test(x.textContent.trim())));
ok(voltou, "e o botão volta ao estado normal");

await p.screenshot({ path: join(SAIDA, "botao-report.png"), fullPage: false });
await b.close();
rmSync(dir, { recursive: true, force: true });

function lerZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = []; let i = 0;
  while (i < buf.length - 4 && dv.getUint32(i, true) === 0x04034b50) {
    const crc = dv.getUint32(i + 14, true), tam = dv.getUint32(i + 18, true);
    const nLen = dv.getUint16(i + 26, true), eLen = dv.getUint16(i + 28, true);
    const nome = new TextDecoder().decode(buf.slice(i + 30, i + 30 + nLen));
    const ini = i + 30 + nLen + eLen;
    const dados = buf.slice(ini, ini + tam);
    out.push({ nome, dados, crcOk: crc32(dados) === crc });
    i = ini + tam;
  }
  return out;
}

console.log(mau === 0 ? "\n✅ Botão do report OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
