// O ecrã tem de se actualizar SEM o tempo real.
//
// O ERP dependia inteiramente dos eventos do Supabase para refrescar as
// listas: gravava-se uma fatura e ela só aparecia depois de um F5. O tempo
// real falha por várias razões banais — a tabela não estar na publicação
// `supabase_realtime`, o separador ter estado em segundo plano, a rede ter
// oscilado — e nenhuma delas devia obrigar a recarregar a página.
//
// Aqui o canal de tempo real está MORTO de propósito: nunca entrega nada.
// Se a lista mudar, mudou porque a escrita a aplicou localmente.
//   node teste-sem-realtime.mjs
import { build } from "esbuild";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright";

const dir = mkdtempSync(join(process.cwd(), "node_modules", ".shrt-"));

// Um Supabase de mentira: guarda as linhas em memória, devolve-as no
// .select(), e o canal de tempo real NUNCA chama o callback.
writeFileSync(join(dir, "stub-supabase.js"), `
const TABELAS = { faturas: [
  { id: "f1", empresa: "x", fornecedor: "Complai", valor: 1000,
    vencimento: "2026-12-01", status: "Pendente", categoria: "Obras" },
] };
window.__TABELAS = TABELAS;
window.__eventosEntregues = 0;

const resposta = (data) => ({ data, error: null });

function q(tabela) {
  let modo = null, corpo = null, idAlvo = null;
  const api = {
    select: () => api,
    order: () => api,
    limit: () => api,
    eq: (_c, v) => { idAlvo = v; return api },
    in: () => api,
    insert: (linhas) => { modo = "insert"; corpo = [].concat(linhas); return api },
    update: (c) => { modo = "update"; corpo = c; return api },
    upsert: (linhas) => { modo = "upsert"; corpo = [].concat(linhas); return api },
    delete: () => { modo = "delete"; return api },
    single: () => Promise.resolve(resposta(null)),
    then: (f) => Promise.resolve(executar()).then(f),
  };
  function executar() {
    const t = TABELAS[tabela] || (TABELAS[tabela] = []);
    if (modo === "insert" || modo === "upsert") {
      const novas = corpo.map((x, i) => ({ ...x, id: x.id || tabela + "-" + (t.length + i + 1) }));
      novas.forEach(n => {
        const j = t.findIndex(y => String(y.id) === String(n.id));
        if (j >= 0) t[j] = { ...t[j], ...n }; else t.push(n);
      });
      return resposta(novas);
    }
    if (modo === "update") {
      const j = t.findIndex(y => String(y.id) === String(idAlvo));
      if (j < 0) return resposta([]);
      t[j] = { ...t[j], ...corpo };
      return resposta([t[j]]);
    }
    if (modo === "delete") {
      const j = t.findIndex(y => String(y.id) === String(idAlvo));
      if (j < 0) return resposta([]);
      const [fora] = t.splice(j, 1);
      return resposta([fora]);
    }
    return resposta([...t]);
  }
  return api;
}

export const supabase = {
  from: (t) => q(t),
  // O canal aceita tudo e NÃO entrega nada. É este o ponto do teste.
  channel: () => ({ on() { return this }, subscribe() { return this } }),
  removeChannel: () => {},
  auth: { getSession: () => Promise.resolve({ data: { session: null } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
};
export default supabase;`);

writeFileSync(join(dir, "entrada.jsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import { useFaturas, useDespesasRecorrentes } from "SRC/hooks.js";

function Demo() {
  const { faturas, addFatura, updateFatura, deleteFatura } = useFaturas();
  window.__api = { addFatura, updateFatura, deleteFatura };
  return React.createElement("div", { style: { fontFamily: "system-ui", padding: 16 } },
    React.createElement("div", { id: "n" }, String(faturas.length)),
    React.createElement("ul", { id: "lista" },
      faturas.map(f => React.createElement("li", { key: f.id, "data-id": f.id },
        f.fornecedor + " — " + f.valor + " — " + f.status))));
}
createRoot(document.getElementById("r")).render(React.createElement(Demo));
`.replace(/SRC\//g, pathToFileURL(join(process.cwd(), "src")).pathname + "/"));

await build({
  entryPoints: [join(dir, "entrada.jsx")], bundle: true, outfile: join(dir, "app.js"),
  jsx: "automatic", logLevel: "error", define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "s", setup(b) {
    b.onResolve({ filter: /(^|\/)supabase(\.js)?$/ }, () => ({ path: join(dir, "stub-supabase.js") }));
  } }],
});
writeFileSync(join(dir, "i.html"),
  `<!doctype html><meta charset="utf-8"><body><div id="r"></div><script src="app.js"></script>`);

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage();
const erros = [];
p.on("pageerror", e => { erros.push(e.message); console.log("[pageerror]", e.message); });
await p.goto(pathToFileURL(join(dir, "i.html")).href);
await p.waitForTimeout(500);

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };
const n = () => p.evaluate(() => Number(document.getElementById("n").textContent));
const linhas = () => p.evaluate(() => [...document.querySelectorAll("#lista li")]
  .map(x => x.textContent));

console.log("Com o tempo real MORTO (nunca entrega um evento):");
ok(erros.length === 0, `o ecrã monta sem erros${erros[0] ? " — " + erros[0] : ""}`);
ok(await n() === 1, `arranca com ${await n()} fatura`);

console.log("\nGravar uma fatura nova:");
{
  await p.evaluate(() => window.__api.addFatura({
    empresa: "x", fornecedor: "EDP", valor: 21.7, status: "Pendente", categoria: "Office" }));
  await p.waitForTimeout(250);
  ok(await n() === 2, `a lista passa a ${await n()} — sem F5`);
  ok((await linhas()).some(t => /EDP/.test(t)), "e a nova linha está lá");
}

console.log("\nAlterar uma fatura:");
{
  await p.evaluate(() => window.__api.updateFatura("f1", { status: "Pago", valor: 1234 }));
  await p.waitForTimeout(250);
  const l = (await linhas()).find(t => /Complai/.test(t));
  ok(/Pago/.test(l), `o estado mudou no ecrã: "${l}"`);
  ok(/1234/.test(l), "e o valor também");
  ok(await n() === 2, "sem duplicar a linha");
}

console.log("\nApagar uma fatura:");
{
  await p.evaluate(() => window.__api.deleteFatura("f1"));
  await p.waitForTimeout(250);
  ok(await n() === 1, `a lista desce para ${await n()}`);
  ok(!(await linhas()).some(t => /Complai/.test(t)), "e a linha desapareceu");
}

console.log("\nApagar uma que já não existe não mexe na lista:");
{
  const antes = await n();
  await p.evaluate(() => window.__api.deleteFatura("nao-existe"));
  await p.waitForTimeout(250);
  ok(await n() === antes, `continua em ${await n()}`);
}

console.log("\nE o tempo real continua a não ter entregue nada:");
{
  const ev = await p.evaluate(() => window.__eventosEntregues);
  ok(ev === 0, `zero eventos (${ev}) — tudo o que se viu foi a escrita a aplicar-se`);
}

console.log(mau === 0 ? "\n✅ Sem tempo real OK" : `\n❌ ${mau} falha(s)`);
await b.close();
rmSync(dir, { recursive: true, force: true });
process.exit(mau ? 1 : 0);
