// O formulário de upload de fatura num browser a sério: a escolha da taxa
// recalcula base e IVA a partir do total, e desligar a dedução bloqueia tudo.
//   node teste-fatura-form.mjs
import { build } from "esbuild";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright";

const dir = mkdtempSync(join(process.cwd(), "node_modules", ".shotf-"));
writeFileSync(join(dir, "stub-supabase.js"), `
const r={data:[],error:null};
const q={select:()=>q,insert:()=>q,update:()=>q,upsert:()=>q,delete:()=>q,eq:()=>q,order:()=>q,then:(f)=>Promise.resolve(r).then(f)};
export const supabase={from:()=>q,channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:()=>{}};
export default supabase;`);
writeFileSync(join(dir, "entrada.jsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import ImportarFatura from "SRC/ImportarFatura.jsx";
createRoot(document.getElementById("r")).render(
  React.createElement("div",{style:{padding:24,background:"#f6f7f9",fontFamily:"system-ui,sans-serif",maxWidth:1100}},
    React.createElement(ImportarFatura,{onSave:async()=>({ok:true,inserted:1})})));
`.replace(/SRC\//g, pathToFileURL(join(process.cwd(),"src")).pathname + "/"));

await build({ entryPoints:[join(dir,"entrada.jsx")], bundle:true, outfile:join(dir,"app.js"),
  jsx:"automatic", logLevel:"error", define:{"process.env.NODE_ENV":'"production"'},
  plugins:[{name:"s",setup(b){ b.onResolve({filter:/(^|\/)supabase\.js$/},()=>({path:join(dir,"stub-supabase.js")})); }}] });
writeFileSync(join(dir,"i.html"), `<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="r"></div><script src="app.js"></script>`);

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewportSize:{width:1200,height:1100}, deviceScaleFactor:2 });
p.on("pageerror", e => console.log("[pageerror]", e.message));
await p.route("**/ai-proxy**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ content:[{ type:"text", text: JSON.stringify({
    numero_fatura:"FT 2026/114", data_fatura:"2026-09-28", data_vencimento:"2026-10-28",
    fornecedor_nome:"TRACO E ESQUADRIA LDA", fornecedor_nif:"501234567",
    fornecedor_email:"geral@traco.pt", fornecedor_iban:"PT50000201231234567890154",
    fornecedor_morada:"Rua do Norte 12, Porto",
    valor_base:2000, valor_iva:460, valor_total:2460, taxa_iva:23,
    descricao_servico:"Carpintaria - cozinha", notas:"" }) }] }) }));
await p.goto(pathToFileURL(join(dir,"i.html")).href);
await p.waitForTimeout(500);
// forçar o passo 1 (formulário) simulando o resultado da IA
await p.setInputFiles('input[type=file]', { name:"fatura.pdf", mimeType:"application/pdf", buffer: Buffer.from("%PDF-1.4 teste") });
await p.waitForTimeout(300);
const bt = p.locator('button:has-text("Extrair dados")');
if (await bt.count()) { await bt.click(); }
await p.waitForTimeout(1200);
await p.screenshot({ path:"/mnt/user-data/outputs/fatura-form.png", fullPage:true });

const vals = async () => p.evaluate(() => {
  const campo = (rot) => { const l=[...document.querySelectorAll("label")].find(x=>x.textContent.trim()===rot);
    return l ? l.parentElement.querySelector("input").value : null; };
  return { base: campo("Valor Base (sem IVA)"), iva: campo("IVA"), total: campo("Total a Pagar *") };
});
let mau=0;
const ok=(c,m)=>{console.log((c?"  \u2713 ":"  \u2717 ")+m); if(!c) mau++;};
console.log("Formulario de upload:");
let v = await vals();
ok(v.base==="2000" && v.iva==="460", "a IA preenche 2000 + 460");

await p.locator('button:has-text("6%")').click(); await p.waitForTimeout(150);
v = await vals();
ok(Math.abs(parseFloat(v.base)-2320.75)<0.005, "a 6% a base passa a 2320,75 (deu "+v.base+")");
ok(Math.abs(parseFloat(v.iva)-139.25)<0.005, "e o IVA a 139,25 (deu "+v.iva+")");
ok(Math.abs(parseFloat(v.base)+parseFloat(v.iva)-2460)<0.005, "base + IVA continua a dar 2460");

await p.locator('button:has-text("0%")').click(); await p.waitForTimeout(150);
v = await vals();
ok(parseFloat(v.iva)===0, "isento: IVA zero");
ok(Math.abs(parseFloat(v.base)-2460)<0.005, "isento: a base e o total");

await p.locator('button:has-text("23%")').click(); await p.waitForTimeout(150);
// desligar a deducao
await p.locator('input[type=checkbox]').first().click(); await p.waitForTimeout(200);
const desligado = await p.evaluate(() => {
  const l=[...document.querySelectorAll("label")].find(x=>x.textContent.trim()==="IVA");
  const inp = l ? l.parentElement.querySelector("input") : null;
  return { bloqueado: !!(inp && inp.disabled),
           semTaxas: ![...document.querySelectorAll("button")].some(b=>/^13%/.test(b.textContent)),
           texto: document.body.innerText.includes("fora do apuramento do IVA") };
});
ok(desligado.bloqueado, "ao desligar, os campos de IVA ficam bloqueados");
ok(desligado.semTaxas, "e a escolha da taxa desaparece");
ok(desligado.texto, "com explicacao do que isso significa");
await p.screenshot({ path:"/mnt/user-data/outputs/fatura-form-sem-iva.png", fullPage:false });
console.log("passo0 ok · botões:", await p.evaluate(()=>[...document.querySelectorAll("button")].map(b=>b.textContent.trim()).slice(0,12)));
await b.close();
rmSync(dir,{recursive:true,force:true});
console.log(mau===0 ? "\n\u2705 Formul\u00e1rio de fatura OK" : `\n\u274c ${mau} falha(s)`);
process.exit(mau?1:0);
