import { build } from "esbuild";
import { writeFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".lpx-svg-"));
writeFileSync(join(dir,"stub-supabase.js"), `export const supabase={from:()=>({select:()=>({}),}),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:()=>{}};export default supabase;`);
writeFileSync(join(dir,"stub-hooks.js"), `
const DOCS = [
  { tipo:"fornecedor", id:"f1", empresa:"adseq", documento:"FT 2026/148", entidade:"Construtora Alfa, Lda",
    data_fatura:"2026-09-28", valor_base:98110.72, valor_iva:22565.47, taxa_iva:23, iva_estimado:false, estado:"Pendente em dia" },
  { tipo:"cliente", id:"r1", empresa:"adseq", documento:"FR 2026/12", entidade:"Cliente Beta SA",
    data_fatura:"2026-09-20", valor_base:145000, valor_iva:33350, taxa_iva:23, iva_estimado:false, estado:"Previsto" },
  { tipo:"fornecedor", id:"f2", empresa:"adseq", documento:"FT 2026/90", entidade:"Reis e Pellicano Internat.",
    data_fatura:"2026-08-14", valor_base:1712.50, valor_iva:393.88, taxa_iva:23, iva_estimado:true, estado:"Pago" },
  { tipo:"fornecedor", id:"f3", empresa:"adseq", documento:"FT 2026/71", entidade:"Vazio Arquitectura",
    data_fatura:"2026-07-03", valor_base:24500, valor_iva:5635, taxa_iva:23, iva_estimado:false, estado:"Pago" },
  { tipo:"cliente", id:"r2", empresa:"adseq", documento:"FR 2026/9", entidade:"Cliente Gama",
    data_fatura:"2026-05-11", valor_base:62000, valor_iva:14260, taxa_iva:23, iva_estimado:false, estado:"Recebido" },
  { tipo:"fornecedor", id:"f4", empresa:"adseq", documento:"FT 2026/44", entidade:"Camara Municipal",
    data_fatura:"2026-05-30", valor_base:8900, valor_iva:0, taxa_iva:0, iva_estimado:false, estado:"Pago" },
];
const RESIVA = Object.freeze({ documentos: DOCS, loading:false, error:null, reload:()=>{} });
const PAGIVA = Object.freeze({ pagamentos: [], loading:false, error:null, reload:()=>{},
  marcarPago: async()=>({error:null}), anularPagamento: async()=>({error:null}) });
export const useIvaDocumentos = () => RESIVA;
export const useIvaPagamentos = () => PAGIVA;
const V = Object.freeze({ movimentos: [], loading: false, reload: ()=>{}, total: 0,
  fracoes: [], vendas: [], recebiveis: [], pagamentos: [], faturas: [], orcamento: [],
  saldos: {}, contas: [], profiles: [], counts: {} });
export const useMovimentosPeriodo=()=>V; export const useFracoes=()=>V;
export const useVendas=()=>V; export const useSaldosNaData=()=>V;
export const usePagamentosExtras=()=>V; export const useFaturas=()=>V;
export const useOrcamento=()=>V; export const useRecebiveis=()=>V;
export const useSaldosAtuais=()=>V; export const useMovimentosByConta=()=>V;
`);
writeFileSync(join(dir,"e.jsx"), `
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import IVAView from "SRC/IVAView.jsx";
import { writeFileSync } from "fs";
const emp = (await import("SRC/empresas.js")).EMPRESAS.filter(e => ["adseq","infinite"].includes(e.id));
const html = renderToStaticMarkup(React.createElement(IVAView, {
  currentUser: { id:"u1", nome:"Rodrigo", role:"gestor" }, empresasVisiveis: emp }));
writeFileSync("/tmp/grafico.html",
  '<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Georgia,serif">' +
  '<div style="max-width:1500px;margin:0 auto">' + html + '</div></body>');
`.replace(/SRC\//g, pathToFileURL(join(process.cwd(),"src")).pathname + "/"));
await build({ entryPoints:[join(dir,"e.jsx")], bundle:true, platform:"node", format:"esm",
  outfile:join(dir,"o.mjs"), jsx:"automatic", logLevel:"error",
  external:["react","react-dom","react-dom/server","fs"],
  plugins:[{name:"s",setup(b){
    b.onResolve({filter:/(^|\/)supabase\.js$/},()=>({path:join(dir,"stub-supabase.js")}));
    b.onResolve({filter:/(^|\/)hooks\.js$/},()=>({path:join(dir,"stub-hooks.js")}));
  }}]});
await import(pathToFileURL(join(dir,"o.mjs")).href);
console.log("ok");
