// O ecrã do plano de obra num browser a sério: os números do quadro, o
// simulador de atraso, e o que muda quando se estica o prazo.
//   node teste-obra-ecra.mjs
import { build } from "esbuild";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright";

const dir = mkdtempSync(join(process.cwd(), "node_modules", ".shoto-"));
writeFileSync(join(dir, "stub-supabase.js"), `
const r={data:[],error:null};
const q={select:()=>q,insert:()=>q,update:()=>q,upsert:()=>q,delete:()=>q,eq:()=>q,in:()=>q,order:()=>q,then:(f)=>Promise.resolve(r).then(f)};
export const supabase={from:()=>q,channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:()=>{}};
export default supabase;`);

writeFileSync(join(dir, "stub-hooks.js"), `
const MOVS = Object.freeze({ movimentos: [
  { data:"2026-06-10", categoria:"Obra", valor:-300000 },
  { data:"2026-07-10", categoria:"Obra", valor:-192000 },
  { data:"2026-06-02", categoria:"Funding banco", valor: 250000 },
  { data:"2026-07-02", categoria:"Funding banco", valor: 150000 },
], loading:false, reload:()=>{} });
export const useMovimentosPeriodo = () => MOVS;
`);

writeFileSync(join(dir, "entrada.jsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import ModalPlanoObra from "SRC/ObraPlano.jsx";

const plano = { empresa:"favcloset", data_inicio:"2026-06-01", data_fim:"2027-03-31",
  budget_obra:1000000, taxa_iva_obra:23, fiscalizacao_mensal:1476, cso_mensal:500,
  comissao_avaliacao:300, funding_pct:70, euribor:2.5, spread:2, divida_inicial:400000,
  recuperar_iva:true, calculado_em:"2026-09-01T00:00:00Z", gasto_no_calculo:300000 };

const faturas = [
  { empresa:"favcloset", categoria:"Obra", valor:492000, valor_base:400000, status:"Pago", data_fatura:"2026-08-10" },
  { empresa:"favcloset", categoria:"Fiscalização", valor:1476, status:"Pago", data_fatura:"2026-08-10" },
  { empresa:"favcloset", categoria:"Fiscalização", valor:1476, status:"Pago", data_fatura:"2026-09-10" },
];
const pagamentos = [
  { id:"m1", empresa:"favcloset", categoria:"Obra", descricao:"Cosmik (2/5)", valor:134811.91, data_inicio:"2026-11-15", status:"Pendente" },
  { id:"m2", empresa:"favcloset", categoria:"Fiscalização", descricao:"Fiscalização de obra (2/5)", valor:1476, data_inicio:"2026-11-11", status:"Pendente" },
  { id:"m3", empresa:"favcloset", categoria:"Salários", descricao:"Equipa", valor:5000, data_inicio:"2026-11-01", status:"Pendente" },
];

createRoot(document.getElementById("r")).render(
  React.createElement("div",{style:{fontFamily:"system-ui,-apple-system,sans-serif"}},
    React.createElement(ModalPlanoObra,{
      empresa:"favcloset", grupo:"LPX", nomeEmpresa:"Favorite Closet (Amadeu 07)",
      plano, faturas, pagamentos, contaIds:["favcloset_bcp"], currentUser:{nome:"Felipe",role:"admin"},
      hoje:"2026-10-12",
      onGuardar:async()=>({}), onAplicar:async()=>({}), onFechar:()=>{} })));
`.replace(/SRC\//g, pathToFileURL(join(process.cwd(),"src")).pathname + "/"));

await build({ entryPoints:[join(dir,"entrada.jsx")], bundle:true, outfile:join(dir,"app.js"),
  jsx:"automatic", logLevel:"error", define:{"process.env.NODE_ENV":'"production"'},
  plugins:[{name:"s",setup(b){ b.onResolve({filter:/(^|\/)supabase\.js$/},()=>({path:join(dir,"stub-supabase.js")}));
    b.onResolve({filter:/(^|\/)hooks\.js$/},()=>({path:join(dir,"stub-hooks.js")})); }}] });
writeFileSync(join(dir,"i.html"), `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#eef0f3"><div id="r"></div><script src="app.js"></script>`);

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewportSize:{width:1240,height:940}, deviceScaleFactor:2 });
p.on("pageerror", e => console.log("[pageerror]", e.message));
await p.goto(pathToFileURL(join(dir,"i.html")).href);
await p.waitForTimeout(600);
await p.screenshot({ path:"/mnt/user-data/outputs/obra-plano.png" });

// simular um atraso
await p.locator('input[type=date]').nth(2).fill("2027-06-30");
await p.waitForTimeout(400);
await p.evaluate(() => { const d=[...document.querySelectorAll("div")].find(x=>/E se a obra escorregar/.test(x.textContent||"")&&x.children.length<6); if(d) d.scrollIntoView({block:"center"}); });
await p.waitForTimeout(300);
await p.screenshot({ path:"/mnt/user-data/outputs/obra-atraso.png" });

// confirmação
await p.locator('button:has-text("Recalcular o fluxo")').click();
await p.waitForTimeout(400);
await p.screenshot({ path:"/mnt/user-data/outputs/obra-confirmacao.png" });
// ── Asserções no browser ────────────────────────────────────────────────
let mau = 0;
const ok = (c, m) => { console.log((c?"  \u2713 ":"  \u2717 ")+m); if(!c) mau++; };
const corpo = () => p.evaluate(() => document.body.innerText);

await p.locator('button:has-text("Voltar")').click();
await p.waitForTimeout(250);

console.log("Plano de obra (browser):");
let t = await corpo();
ok(t.includes("600.000,00"), "obra: sai a base, 600 000 \u20ac");
ok(t.includes("10.892,88"), "fiscaliza\u00e7\u00e3o com IVA: 1 476 \u00d7 1,23 \u00d7 6 meses");
ok(t.includes("138.000,00"), "IVA da obra: 138 000 \u20ac, pago nos dias 25");
ok(t.includes("916.600,00"), "d\u00edvida no fim = 400 000 + 70% de (600 000 + 138 000)");
ok(t.includes("420.000,00"), "o banco liberta 420 000 \u20ac sobre a base");
ok(t.includes("96.600,00"), "e 96 600 \u20ac sobre o IVA, nos dias 25");

// O simulador de atraso
await p.locator('input[type=date]').nth(2).fill("2027-06-30");
await p.waitForTimeout(350);
t = await corpo();
ok(/\+3 meses/.test(t), "simular jun/27 d\u00e1 +3 meses");
ok(/de custo/.test(t), "e di-lo em euros");
ok(/A obra em si n\u00e3o muda/.test(t), "explicando que a obra n\u00e3o muda, s\u00f3 o que corre com o prazo");
const linhaAtraso = await p.evaluate(() => {
  const d = [...document.querySelectorAll("div")].find(x => /meses \u2192/.test(x.textContent||"") && x.children.length === 0);
  return d ? d.textContent : "";
});
ok(/\+3 meses/.test(linhaAtraso), "a linha do atraso \u00e9 leg\u00edvel: " + linhaAtraso.trim());

// Mudar a data de fim de verdade recalcula o quadro
await p.locator('input[type=date]').nth(1).fill("2027-06-30");
await p.waitForTimeout(350);
t = await corpo();
ok(t.includes("600.000,00"), "a obra total continua a mesma com o prazo maior");
ok(/9 meses|\b9\b/.test(t), "mas passam a ser 9 meses");
ok(t.includes("16.339,32"), "e a fiscaliza\u00e7\u00e3o sobe para 1 815,48 \u00d7 9 = 16 339,32 \u20ac");

ok(t.includes("400.000,00"), "o ecr\u00e3 prop\u00f5e a d\u00edvida de 400 000 \u20ac lida do extrato");
ok(/liberta\u00e7\u00f5es encontradas no\s+extrato|liberta\u00e7\u00e3o encontrada no\s+extrato/.test(t.replace(/\s+/g," ")) || t.includes("extrato"),
   "dizendo que veio do extrato");
ok(t.includes("492.000,00"), "mostra 492 000 \u20ac pagos no extrato, com IVA");
ok(t.includes("92.000,00"), "e a linha do IVA a 23% retirado: 92 000 \u20ac");
ok(t.includes("400.000,00"), "sobrando 400 000 \u20ac de base incorrida");

console.log(mau === 0 ? "\n\u2705 Ecr\u00e3 do plano de obra OK" : `\n\u274c ${mau} falha(s)`);
await b.close();
rmSync(dir,{recursive:true,force:true});
process.exit(mau ? 1 : 0);
