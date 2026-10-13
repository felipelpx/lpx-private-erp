import { build } from "esbuild";
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from "fs";
import { join } from "path"; import { pathToFileURL } from "url";
import { chromium } from "playwright";
const SRC = pathToFileURL(join(process.cwd(),"src")).pathname + "/";
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".montra-"));
writeFileSync(join(dir,"stub-supabase.js"),`
const r={data:[],error:null};const q={select:()=>q,insert:()=>q,update:()=>q,upsert:()=>q,delete:()=>q,eq:()=>q,in:()=>q,order:()=>q,then:(f)=>Promise.resolve(r).then(f)};
export const supabase={from:()=>q,channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:()=>{}};export default supabase;`);
writeFileSync(join(dir,"stub-hooks.js"),`
export * from "${SRC}hooks.js";
const DOCS=[
 {tipo:"fornecedor",id:"f1",empresa:"adseq",documento:"FT 2026/114",entidade:"TRAÇO E ESQUADRIA LDA",data_fatura:"2026-09-28",valor_base:2000,valor_iva:460,valor_total:2460,taxa_iva:23,iva_estimado:false,iva_dedutivel:true,estado:"Pendente em dia"},
 {tipo:"cliente",id:"r1",empresa:"adseq",documento:"FR 2026/7",entidade:"Cliente Beta",data_fatura:"2026-09-20",valor_base:12000,valor_iva:2760,valor_total:14760,taxa_iva:23,iva_estimado:false,iva_dedutivel:true,estado:"Previsto"},
 {tipo:"fornecedor",id:"f2",empresa:"adseq",documento:"lpx_0049",entidade:"AT",data_fatura:"2026-09-20",valor_base:65.04,valor_iva:14.96,valor_total:80,taxa_iva:23,iva_estimado:true,iva_dedutivel:false,estado:"Pago"},
 {tipo:"fornecedor",id:"f3",empresa:"adseq",documento:"297",entidade:"White Helmet",data_fatura:"2026-08-30",valor_base:350,valor_iva:80.5,valor_total:430.5,taxa_iva:23,iva_estimado:true,iva_dedutivel:true,estado:"Pago"},
 {tipo:"fornecedor",id:"f4",empresa:"adseq",documento:"FT 2026/88",entidade:"Cosmik Brigade, Lda",data_fatura:"2026-07-12",valor_base:120000,valor_iva:27600,valor_total:147600,taxa_iva:23,iva_estimado:false,iva_dedutivel:true,estado:"Pago"},
];
const RES=Object.freeze({documentos:DOCS,loading:false,error:null,reload:()=>{},guardarDocumento:async()=>({data:[{}],error:null})});
const PAG=Object.freeze({pagamentos:[],loading:false,error:null,reload:()=>{},marcarPago:async()=>({error:null}),anularPagamento:async()=>({error:null})});
export const useIvaDocumentos=()=>RES;
export const useIvaPagamentos=()=>PAG;
const MOV=Object.freeze({movimentos:[
 {data:"2026-05-12",categoria:"Obra",valor:-42545.67},
 {data:"2026-05-02",categoria:"Funding banco",valor:160000},
],loading:false,reload:()=>{}});
export const useMovimentosPeriodo=()=>MOV;
const CX=Object.freeze({movimentos:[
 {id:"a1",conta_id:"favcloset_bcp",empresa_id:"favcloset",banco:"BCP",data:"2026-10-05",movimento:"TRF P/ COSMIK BRIGADE, LDA",valor:-15812.37,saldo:716.96,categoria:"Obra",subcategoria:"",detalhes:"Auto de medição 7",seq:723},
 {id:"a2",conta_id:"favcloset_red",empresa_id:"favcloset",banco:"RED",data:"2026-10-01",movimento:"LIBERTAÇÃO FUNDING OBRA",valor:15812.37,saldo:10314.84,categoria:"Funding",subcategoria:"",detalhes:"Tranche 7",seq:722},
 {id:"b1",conta_id:"adseq_bcp",empresa_id:"adseq",banco:"BCP",data:"2026-09-28",movimento:"TRAÇO E ESQUADRIA LDA",valor:-2460,saldo:30.20,categoria:"Obras",subcategoria:"Gastos com Obras",detalhes:"Carpintaria",seq:338},
 {id:"b2",conta_id:"adseq_red",empresa_id:"adseq",banco:"RED",data:"2026-09-23",movimento:"COMISSAO ABERTURA NR.",valor:-20307.04,saldo:12209.02,categoria:"Financiamento",subcategoria:"Outflow - Taxas e comissões",detalhes:"",seq:337},
 {id:"c1",conta_id:"pearl_bcp",empresa_id:"pearl",banco:"BCP",data:"2026-09-20",movimento:"TRF P/ MORNING STEPS",valor:-782.28,saldo:24535.22,categoria:"Comissão",subcategoria:"",detalhes:"Fração AQ",seq:180},
 {id:"d1",conta_id:"infinite_bcp",empresa_id:"infinite",banco:"BCP",data:"2026-09-18",movimento:"SUPRIMENTO PARCELA EMERGENTE",valor:48165.88,saldo:57711.31,categoria:"Sócios",subcategoria:"Suprimentos",detalhes:"2.ª parcela",seq:297},
 {id:"e1",conta_id:"simplify_red",empresa_id:"simplify",banco:"RED",data:"2026-09-15",movimento:"IMPOSTO DE SELO 17.3.4",valor:-0.67,saldo:4609.55,categoria:"Encargos financeiros",subcategoria:"",detalhes:"",seq:307},
 {id:"f1",conta_id:"genero_bcp",empresa_id:"genero",banco:"BCP",data:"2026-09-10",movimento:"REFORÇO SINAL PRÉDIO",valor:-50000,saldo:51298.39,categoria:"Terreno",subcategoria:"",detalhes:"Maria Pia",seq:25},
],loading:false,error:null,reload:()=>{},atualizarMovimento:async()=>({data:[{}],error:null})});
export const useCaixaUnico=()=>CX;
const V=Object.freeze({vendas:[],loading:false,updateVenda:async()=>({})});
export const useVendas=()=>V;
const S=Object.freeze({saldos:Object.freeze({adseq_bcp:11032}),reload:()=>{},loading:false});
export const useSaldosAtuais=()=>S;
const RB=Object.freeze({recebiveis:[],loading:false,addRecebivel:async()=>({}),updateRecebivel:async()=>({}),deleteRecebivel:async()=>({})});
export const useRecebiveis=()=>RB;
const OP=Object.freeze({planos:[{id:"adseq",empresa:"adseq",data_fim:"2027-03-31",budget_obra:1300000}],loading:false,error:null,guardarPlano:async()=>({})});
export const useObraPlanos=()=>OP;`);
writeFileSync(join(dir,"entrada.jsx"),`
import React from "react";import { createRoot } from "react-dom/client";
import IVAView from "SRC/IVAView.jsx";
import ModalPlanoObra from "SRC/ObraPlano.jsx";
import FluxoFuturo from "SRC/FluxoFuturo.jsx";
import CaixaUnicoView from "SRC/CaixaUnicoView.jsx";
import { Login } from "SRC/App.jsx";
import { EMPRESAS } from "SRC/empresas.js";
import { COR, FONTE, BRAND } from "SRC/brand.js";
import Logo from "SRC/Logo.jsx";
const emp = EMPRESAS.filter(e=>e.id==="adseq");
const abas=["Investor Relations","Extratos","Comercial","Fotos","Fluxo Futuro","Contas a Receber","Contas a Pagar","IVA","Pagamentos","Questões","Importar","Utilizadores"];
const Chip=({t,c})=>React.createElement("span",{style:{background:c+"1A",color:c,fontSize:9,fontWeight:600,padding:"1px 7px",borderRadius:20,letterSpacing:"0.04em"}},t);
const Barra = () => React.createElement("div",{style:{background:COR.navy,padding:"0 28px",position:"sticky",top:0,zIndex:50}},
  React.createElement("div",{style:{display:"flex",alignItems:"center",gap:18,height:60}},
    React.createElement(Logo,{altura:22,cor:COR.ouro}),
    React.createElement("div",{style:{width:1,height:24,background:"rgba(186,166,133,0.28)"}}),
    React.createElement("div",{style:{fontSize:13,color:COR.sobreEscuro,fontFamily:FONTE.titulo,fontWeight:300,whiteSpace:"nowrap"}},BRAND.tagline),
    React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6,marginLeft:16,flex:1}},
      React.createElement("span",{style:{fontSize:8.5,color:COR.sobreEscuroTenue,textTransform:"uppercase",letterSpacing:"0.16em",fontWeight:500}},"Grupo"),
      React.createElement("div",{style:{display:"flex",background:"rgba(252,243,235,0.07)",borderRadius:6,padding:2,gap:2}},
        ["Todos","LPX","HDG"].map((g,i)=>React.createElement("button",{key:g,style:{background:i===0?COR.ouro:"transparent",color:i===0?COR.navy:COR.sobreEscuroTenue,border:"none",padding:"5px 13px",borderRadius:4,fontSize:11,fontWeight:i===0?600:400,cursor:"pointer"}},g)))),
    React.createElement("div",{style:{display:"flex",alignItems:"center",gap:9,borderLeft:"1px solid rgba(186,166,133,0.22)",paddingLeft:16,marginLeft:8}},
      React.createElement("div",{style:{width:30,height:30,borderRadius:"50%",border:"1px solid "+COR.ouro,color:COR.ouro,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}},"F"),
      React.createElement("div",null,
        React.createElement("div",{style:{fontSize:12,color:COR.sobreEscuro,lineHeight:1.3}},"Felipe",
          React.createElement("span",{style:{fontSize:9,color:COR.sobreEscuroTenue,marginLeft:6}},"v57")),
        React.createElement("div",{style:{display:"flex",gap:4,marginTop:1}},React.createElement(Chip,{t:"Gestor",c:COR.ouro}))),
      React.createElement("button",{style:{background:"none",border:"1px solid rgba(186,166,133,0.30)",borderRadius:6,padding:"4px 9px",fontSize:12,color:COR.ouro,cursor:"pointer",marginLeft:4}},"☾"),
      React.createElement("button",{style:{background:"none",border:"1px solid rgba(186,166,133,0.30)",borderRadius:6,padding:"4px 11px",fontSize:11,color:COR.ouro,cursor:"pointer",marginLeft:4}},"Sair"))),
  React.createElement("div",{style:{display:"flex",flexWrap:"wrap",borderTop:"1px solid rgba(186,166,133,0.14)"}},
    abas.map((t,i)=>React.createElement("button",{key:t,style:{background:"none",color:i===7?COR.creme:COR.sobreEscuroTenue,border:"none",
      borderBottom:"2px solid "+(i===7?COR.ouro:"transparent"),padding:"13px 15px 11px",fontSize:12,cursor:"pointer",fontWeight:i===7?500:400,whiteSpace:"nowrap"}},t))));
const Ecra = ({children}) => React.createElement("div",{style:{minHeight:"100vh",background:COR.fundo}},
  React.createElement(Barra,null),
  React.createElement("div",{style:{padding:"32px 28px 56px",maxWidth:1560,margin:"0 auto"}},children));
const qual = new URLSearchParams(location.search).get("e") || "iva";
const hoje=new Date(); const d=(m,dia)=>{const x=new Date(hoje); x.setMonth(x.getMonth()+m); x.setDate(dia); return x.toISOString().slice(0,10);};
const FATURAS=[
 {id:"a1",empresa:"adseq",fatura:"FT 2026/114",fornecedor:"COSMIK BRIGADE, LDA",categoria:"Obras",valor:15812.37,vencimento:d(-1,30),status:"Pendente",funding:true,funding_pct:100},
 {id:"a2",empresa:"adseq",fatura:"FT 980",fornecedor:"CHIASSO, RODRIGUES & SILVA, LDA",categoria:"Fiscalização",valor:1476,vencimento:d(0,10),status:"Pendente"},
 {id:"a3",empresa:"adseq",fatura:"FT 2026/77",fornecedor:"White Helmet",categoria:"Soft_Costs",valor:430.5,vencimento:d(1,15),status:"Pendente"},
 {id:"a4",empresa:"adseq",fatura:"FT 2026/90",fornecedor:"Millennium BCP",categoria:"Encargos Financeiros",valor:150,vencimento:d(1,30),status:"Pendente"},
 {id:"a5",empresa:"adseq",fatura:"FT 2026/91",fornecedor:"Cosmik",categoria:"Obras",valor:134811.91,vencimento:d(2,15),status:"Pendente",funding:true,funding_pct:70},
];
const PAGS=[{id:"p1",tipo:"saida",descricao:"Fiscalização de obra (2/5)",empresa:"adseq",categoria:"Obras",valor:1476,data_inicio:d(2,11),parcelas:1,periodicidade:"unica",status:"Pendente"}];
const plano={empresa:"adseq",data_inicio:"2026-06-01",data_fim:"2027-03-31",budget_obra:1300000,taxa_iva_obra:6,
 fiscalizacao_mensal:1476,cso_mensal:475,taxa_iva_servicos:23,comissao_avaliacao:500,funding_pct:100,
 euribor:2.5,spread:2,divida_inicial:400000,recuperar_iva:true,calculado_em:"2026-09-01T00:00:00Z",gasto_no_calculo:0};
createRoot(document.getElementById("r")).render(
  qual==="obra"
   ? React.createElement(Ecra,null, React.createElement(ModalPlanoObra,{empresa:"adseq",grupo:"HDG",
       nomeEmpresa:"Admirable Sequence (Cinq Etoiles)",plano,faturas:[],pagamentos:[],contaIds:["adseq_bcp"],
       currentUser:{nome:"Felipe",role:"admin"},hoje:"2026-10-13",onGuardar:async()=>({}),onAplicar:async()=>({}),onFechar:()=>{}}))
   : qual==="login" ? React.createElement(Login,{onLogin:()=>{}})
   : qual==="caixa"
   ? React.createElement(Ecra,null, React.createElement(CaixaUnicoView,{currentUser:{id:"u1",nome:"Felipe",role:"gestor"},
       empresasVisiveis:EMPRESAS.filter(e=>["favcloset","adseq","pearl","infinite","simplify","genero"].includes(e.id))}))
   : qual==="fluxo"
   ? React.createElement(Ecra,null, React.createElement(FluxoFuturo,{faturas:FATURAS,faturasLoading:false,
       pagamentosExtras:PAGS,pagamentosLoading:false,onAddPagamento:async()=>({}),onUpdatePagamento:async()=>({}),
       onDeletePagamento:async()=>({}),onAddPagamentos:async()=>({}),onApagarPagamentos:async()=>({}),
       onUpdateFatura:async()=>({}),onDeleteFatura:async()=>({}),currentUser:{id:"u1",nome:"Felipe",role:"gestor"},
       EMPRESAS:emp,caixaUnico:{}}))
   : React.createElement(Ecra,null, React.createElement(IVAView,{currentUser:{id:"u1",nome:"Felipe",role:"gestor"},empresasVisiveis:emp})));
`.replace(/SRC\//g, SRC));
await build({entryPoints:[join(dir,"entrada.jsx")],bundle:true,outfile:join(dir,"app.js"),jsx:"automatic",
 logLevel:"error",define:{"process.env.NODE_ENV":'"production"',"import.meta.env":'{"VITE_SUPABASE_URL":"https://x.supabase.co","VITE_SUPABASE_ANON_KEY":"k"}'},
 plugins:[{name:"s",setup(b){
   b.onResolve({filter:/(^|\/)supabase\.js$/},()=>({path:join(dir,"stub-supabase.js")}));
   b.onResolve({filter:/(^|\/)hooks\.js$/},(a)=> a.importer===join(dir,"stub-hooks.js") ? null : ({path:join(dir,"stub-hooks.js")}));
 }}]});
writeFileSync(join(dir,"estilo.css"), readFileSync("src/estilo.css","utf8"));
writeFileSync(join(dir,"i.html"),`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="estilo.css"><body><div id="r"></div><script src="app.js"></script>`);
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
const p=await b.newPage({viewportSize:{width:1500,height:1080},deviceScaleFactor:2});
p.on("pageerror",e=>console.log("[err]",e.message));
for (const [e,out] of [["iva","/mnt/user-data/outputs/id-1-iva.png"],["obra","/mnt/user-data/outputs/id-2-obra.png"],["fluxo","/mnt/user-data/outputs/id-3-fluxo.png"],["login","/mnt/user-data/outputs/id-4-login.png"],["caixa","/mnt/user-data/outputs/caixa-unico.png"]]) {
  await p.goto(pathToFileURL(join(dir,"i.html")).href + "?e=" + e);
  await p.waitForTimeout(1200);
  if (e==="caixa") { await p.waitForTimeout(400); } else if (e==="iva") { const t=await p.locator('td:has-text("3T26")').first(); if (await t.count()) { await t.click(); await p.waitForTimeout(300);} }
  await p.screenshot({path:out, fullPage: e==="iva"});
}
await b.close();rmSync(dir,{recursive:true,force:true});console.log("ok");
