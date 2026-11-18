// O ficheiro .xlsx a sério — escrito pelo código que o ERP usa, e reaberto.
//
// O `teste-matriz-excel.mjs` confere o CONTEÚDO (que valores vão em que
// célula). Este confere o FICHEIRO: que os números chegam ao Excel como
// números com formato de moeda, e não como texto já formatado, que é o erro
// que faz uma folha de cálculo não servir para somar nada.
//
// Chama `exportarMatrizExcel`, o mesmo que o botão chama. A única coisa que
// se finge é o browser: o módulo vai buscar o SheetJS a `window.XLSX` quando
// ele já lá está, e `writeFile` em Node escreve no disco.
//
// O SheetJS não é dependência do projeto (no browser vem do CDN), por isso
// este teste salta-se sozinho se não o encontrar:
//   npm install --no-save xlsx && node teste-matriz-xlsx-real.mjs
import { execSync } from "child_process";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { construirMatriz } from "./src/matriz.js";

// O pacote traz uma entrada ESM (xlsx.mjs) e uma CJS; só a primeira expõe
// readFile como export nomeado, por isso procura-se essa antes do nome nu.
let XLSX = null;
for (const onde of [join(process.cwd(), "node_modules", "xlsx", "xlsx.mjs"), "xlsx"]) {
  try {
    const m = await import(onde);
    const cand = typeof m?.readFile === "function" ? m
               : typeof m?.default?.readFile === "function" ? m.default : null;
    if (cand) { XLSX = cand; break; }
  } catch { /* a seguir */ }
}
if (!XLSX) {
  console.log("⏭  SheetJS não instalado — salta-se.");
  console.log("   Para correr este teste:  npm install --no-save xlsx");
  process.exit(0);
}
const fs = await import("fs");
if (XLSX.set_fs) XLSX.set_fs(fs);

// O módulo procura o SheetJS em window.XLSX antes de ir ao CDN.
globalThis.window = { XLSX };
globalThis.document = { head: { appendChild() {} }, createElement: () => ({}) };
const { exportarMatrizExcel } = await import("./src/matrizExcel.js");

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };

const item = (tipo, cat, nome, valor, extra = {}) =>
  ({ tipo, cat, categoria: cat, subcategoria: nome, desc: nome, valor, ...extra });
const meses = ["2026-11", "2026-12", "2027-01"].map((key, i) => ({ key, items: [
  item("saida",   "Obra",          "Auto de medição", 103695.64),
  item("saida",   "Juros",         "Juros BCP",         1356.38 + i * 388.86),
  item("entrada", "Inflow - Obra", "Desembolso",      103695.64, { funding: true }),
  ...(i === 2 ? [item("saida", "Amortização", "Reembolso", 40000, { funding: true })] : []),
]}));
const matriz = construirMatriz({ meses, maxMeses: 3, saldoInicial: 1725 });

const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
const antes = process.cwd();
process.chdir(dir);           // writeFile escreve no diretório corrente
let nome;
try {
  nome = await exportarMatrizExcel(matriz, {
    nomeProjeto: "Simplify Rubric (Alto dos 7 Moinhos)",
    saldoAtual: 1725, hoje: new Date("2026-11-18T12:00:00Z"),
  });
} finally { process.chdir(antes); }
const caminho = join(dir, nome);

console.log("O botão produz um ficheiro:");
ok(existsSync(caminho), `escreveu "${nome}"`);
ok(/^Fluxo Futuro - Simplify Rubric \(Alto dos 7 Moinhos\) 2026-11-18\.xlsx$/.test(nome),
   "com o nome do projeto e a data");

const unz = (f) => execSync(`unzip -p ${JSON.stringify(caminho)} ${f}`).toString();

console.log("\nAbre como livro do Excel, com as duas folhas:");
const lido = XLSX.readFile(caminho);
ok(lido.SheetNames.join(", ") === "Matriz, Linhas", `folhas: ${lido.SheetNames.join(", ")}`);

console.log("\nO dinheiro são números, com formato de moeda:");
{
  const M = lido.Sheets.Matriz;
  const cels = Object.keys(M).filter(k => !k.startsWith("!"));
  const nums = cels.filter(k => M[k].t === "n");
  ok(nums.length > 20, `${nums.length} células numéricas`);
  ok(nums.every(k => typeof M[k].v === "number"), "todas com valor numérico");
  const texto = cels.filter(k => M[k].t === "s" && /€/.test(String(M[k].v)));
  ok(texto.length === 0,
     `nenhuma com o euro colado ao texto${texto.length ? ` — ${M[texto[0]].v}` : ""}`);
  ok(/formatCode="#,##0\.00 €"/.test(unz("xl/styles.xml")),
     "e o formato de moeda está no styles.xml, que é onde o Excel o lê");
}

console.log("\nO que o Felipe vê ao abrir:");
{
  const folha1 = unz("xl/worksheets/sheet1.xml");
  ok(/<col /.test(folha1), "as colunas vêm com largura (a dos nomes é larga)");
  ok(/<autoFilter/.test(unz("xl/worksheets/sheet2.xml")),
     "e a folha Linhas abre com filtro automático");
  // O que NÃO se consegue, e está documentado no módulo: painéis fixos.
  ok(!/<pane[ />]/.test(folha1),
     "painéis fixos não existem — o SheetJS aberto não os escreve (por isso não há linha morta a fingir que sim)");
}

console.log("\nOs valores do ficheiro são os do ecrã:");
{
  const M = lido.Sheets.Matriz;
  const porValor = (v) => Object.keys(M).filter(k => !k.startsWith("!") && M[k].v === v);
  ok(porValor(103695.64).length >= 3, "o auto de medição aparece nos três meses");
  ok(porValor(-40000).length >= 1, "e o reembolso está a NEGATIVO, como no ecrã");
  ok(porValor(40000).length === 0, "nunca a positivo, que duplicaria o funding");
  const fim = Math.round(matriz.caixaFim * 100) / 100;
  ok(porValor(fim).length >= 1, `o caixa no fim do fluxo (${fim}) está lá`);
}

rmSync(dir, { recursive: true, force: true });
console.log(mau === 0 ? "\n✅ Ficheiro .xlsx real OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
