import { build } from "esbuild";
import { writeFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".lpx-svg-"));
writeFileSync(join(dir,"stub-supabase.js"), `export const supabase={from:()=>({select:()=>({}),}),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:()=>{}};export default supabase;`);
writeFileSync(join(dir,"stub-hooks.js"), `
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
import { BarrasFluxoFuturo } from "SRC/IRView.jsx";
import { writeFileSync } from "fs";
const meses = [
  { rotulo:"10/26", entradas:0,       saidas:-148500 },
  { rotulo:"11/26", entradas:143300,  saidas:-92400 },
  { rotulo:"12/26", entradas:0,       saidas:-210750 },
  { rotulo:"01/27", entradas:141000,  saidas:-98300 },
  { rotulo:"02/27", entradas:0,       saidas:-176200 },
  { rotulo:"03/27", entradas:221300,  saidas:-134900 },
  { rotulo:"04/27", entradas:0,       saidas:-88600 },
  { rotulo:"05/27", entradas:1223000, saidas:-402150 },
  { rotulo:"06/27", entradas:0,       saidas:-64300 },
  { rotulo:"07/27", entradas:222600,  saidas:-71900 },
  { rotulo:"08/27", entradas:0,       saidas:-45200 },
  { rotulo:"09/27", entradas:226600,  saidas:-58800 },
];
const html = renderToStaticMarkup(React.createElement(BarrasFluxoFuturo, { meses, saldoArranque: 58341 }));
writeFileSync("/tmp/grafico.html",
  '<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#fff;font-family:Georgia,serif">' +
  '<div style="background:#fff;border:1px solid #f0f0f0;border-radius:14px;padding:20px;max-width:1500px">' +
  '<div style="font-size:15px;font-weight:700;color:#1a1a2e;font-family:Georgia,serif">Fluxo futuro — entradas e saídas previstas</div>' +
  '<div style="font-size:11px;color:#aaa;margin:3px 0 16px">Previsões e faturas por liquidar</div>' +
  html + '</div></body>');
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
