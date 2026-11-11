// A cauda dos stubs de hooks.js.
//
// Cada teste de ecrã escreve o seu próprio `stub-hooks.js` à mão, com os
// hooks de que precisa e com dados feitos à medida. O problema é o resto:
// um ecrã importa 20 hooks, o teste define 6, e os outros 14 fazem a
// compilação falhar com "No matching export". Foi assim que quatro testes
// deixaram de correr sem ninguém reparar — compilar falha, o teste sai com
// código 0, e a bateria dizia só "ERRO".
//
// Esta função lê o hooks.js REAL, vê o que ele exporta, e devolve uma cauda
// a declarar tudo o que o stub não declarou. Assim, acrescentar um hook à
// aplicação nunca mais parte um teste de ecrã: o hook novo aparece no stub
// vazio, e o teste continua a medir o que lhe interessa.
import { readFileSync } from "fs";
import { join } from "path";

export function exportsDeHooks(raiz = process.cwd()) {
  const s = readFileSync(join(raiz, "src", "hooks.js"), "utf8");
  const nomes = new Set();
  const re = /^export\s+(?:async\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of s.matchAll(re)) nomes.add(m[1]);
  return [...nomes];
}

// Tudo o que o stub não definir passa a existir como um hook inerte.
// O valor devolvido é um Proxy, para não ter de adivinhar os nomes dos
// campos de cada hook: `loading` é false, `error` é null, qualquer função
// de escrita devolve { error: null }, e todo o resto é [] — que tem .map,
// .filter e .length, e cujo acesso por chave dá undefined sem rebentar.
// O que os testes usam: dá-se o corpo do stub escrito à mão e sai o corpo
// mais a cauda. Os nomes já definidos saem do próprio corpo, para não haver
// uma segunda lista para manter desactualizada.
export function comCauda(corpo, raiz = process.cwd()) {
  const re = /^\s*export\s+(?:async\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm;
  const definidos = [...corpo.matchAll(re)].map(m => m[1]);
  return corpo + caudaDeHooks(definidos, raiz);
}

export function caudaDeHooks(jaDefinidos = [], raiz = process.cwd()) {
  const tem = new Set(jaDefinidos);
  const faltam = exportsDeHooks(raiz).filter(n => !tem.has(n));
  if (!faltam.length) return "";
  return `
// ── preenchido automaticamente por testes/stubHooks.mjs ──────────────────
const __inerte = () => new Proxy({}, { get(_, k) {
  if (k === "loading") return false;
  if (k === "error")   return null;
  if (typeof k !== "string") return undefined;
  if (/^(reload|refetch)$/.test(k)) return async () => ({ data: [], error: null });
  if (/^(add|update|delete|upsert|guardar|apagar|parar|marcar|anular|aplicar|ler|set)/.test(k))
    return async () => ({ data: [], error: null });
  return [];
} });
${faltam.map(n => `export const ${n} = __inerte;`).join("\n")}
// ─────────────────────────────────────────────────────────────────────────
`;
}
