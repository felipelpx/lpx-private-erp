// A exportação da matriz do fluxo futuro para Excel.
//
// O que pode correr mal aqui não é o ficheiro não abrir — é abrir e estar
// errado, que é pior, porque vai colado para um mapa ou para o banco. Os três
// perigos concretos:
//
//   1. Valores como TEXTO ("113.726,34 €"). A folha abre, parece bem, e não
//      se pode somar uma coluna. Tudo o que é dinheiro tem de ser número.
//   2. O sinal do funding. Na secção do funding a amortização entra a
//      negativo — como no ecrã. Se a folha somar o desembolso com o
//      reembolso, dá o dobro do financiamento.
//   3. O caixa acumulado é um SALDO, não uma soma. A célula do total tem de
//      levar o saldo no fim do fluxo, não a soma das colunas.
//
// Testa-se `construirFolhasDaMatriz`, que é o que decide o conteúdo; o
// SheetJS só o escreve.
//   node teste-matriz-excel.mjs
import { construirMatriz } from "./src/matriz.js";
import { construirFolhasDaMatriz, rotuloDoMes } from "./src/matrizExcel.js";

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };
const arred2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// Um fluxo parecido com o do Alto dos 7 Moinhos: obra, juros, fiscalização,
// encargos, e funding com desembolso e amortização.
const item = (mes, tipo, cat, nome, valor, extra = {}) =>
  ({ tipo, cat, categoria: cat, subcategoria: nome, desc: nome, valor, ...extra });
const MESES = ["2026-11", "2026-12", "2027-01"];
const meses = MESES.map((key, i) => ({ key, items: [
  item(key, "saida",   "Obra",                "Auto de medição",   103695.64),
  item(key, "saida",   "Juros",               "Juros BCP",           1356.38 + i * 388.86),
  item(key, "saida",   "Fiscalização",        "Fiscalização",        2765.04),
  item(key, "saida",   "Encargos financeiros", "Comissão de gestão",   500.00),
  item(key, "entrada", "Inflow - Obra",       "Desembolso",        103695.64, { funding: true }),
  ...(i === 2 ? [item(key, "saida", "Amortização", "Reembolso", 40000, { funding: true })] : []),
  ...(i === 0 ? [item(key, "entrada", "Vendas", "Escritura fração A", 250000)] : []),
]}));

const matriz = construirMatriz({ meses, maxMeses: 3, saldoInicial: 1725 });

console.log("A matriz de partida é a do ecrã:");
ok(matriz.chaves.length === 3, `${matriz.chaves.length} colunas de mês`);
ok(matriz.seccoes.length === 3, `${matriz.seccoes.length} secções (receitas, custos, funding)`);
ok(matriz.temCaixa, "e tem caixa acumulado");

const folhas = construirFolhasDaMatriz(matriz, {
  nomeProjeto: "Simplify Rubric (Alto dos 7 Moinhos)",
  saldoAtual: 1725, hoje: new Date("2026-11-18T12:00:00Z"),
});
const F = folhas.matriz;
const cab = F[folhas.linhaDoCabecalho];
const linha = (rot) => F.find(l => String(l[0]) === rot);
const valores = (l) => l.slice(folhas.primeiraColunaValor);

console.log("\nO cabeçalho identifica o que se está a ver:");
{
  ok(/FLUXO FUTURO/.test(String(F[0][0])), `título: "${F[0][0]}"`);
  ok(F.some(l => l[0] === "Projeto" && /Alto dos 7 Moinhos/.test(String(l[1]))),
     "com o nome do projeto");
  ok(F.some(l => l[0] === "Exportado em" && l[1] === "2026-11-18"), "e a data");
  ok(cab[0] === "Despesa" && cab[1] === "Nível", "colunas: Despesa, Nível, …");
  ok(cab.slice(2, 5).join(" ") === "nov/26 dez/26 jan/27",
     `e os meses como no ecrã: ${cab.slice(2, 5).join(" ")}`);
  ok(cab[cab.length - 1] === "Total", "a última coluna é o Total");
}

console.log("\nTUDO o que é dinheiro vai como número, nunca como texto:");
{
  // Este é o erro que faz uma folha de cálculo não servir para nada.
  const corpo = F.slice(folhas.linhaDoCabecalho + 1);
  let textos = 0, numeros = 0, exemplo = null;
  for (const l of corpo) {
    for (let c = folhas.primeiraColunaValor; c < l.length; c++) {
      const v = l[c];
      if (v === "" || v == null) continue;
      if (typeof v === "number") numeros++;
      else { textos++; exemplo = exemplo || `linha "${l[0]}" → ${JSON.stringify(v)}`; }
    }
  }
  ok(textos === 0, `${numeros} células numéricas, ${textos} de texto${exemplo ? " — " + exemplo : ""}`);
  ok(numeros > 20, "e há valores que cheguem para somar");
}

console.log("\nOs valores batem certo com a matriz do ecrã:");
{
  const obra = linha("Obra");
  ok(!!obra, "a categoria Obra está lá");
  ok(valores(obra)[0] === 103695.64, `nov/26 = ${valores(obra)[0]}`);
  const custos = linha("CUSTOS");
  ok(!!custos, "e a secção CUSTOS");
  ok(valores(custos)[0] === arred2(matriz.saidas.valores["2026-11"]),
     `o total de custos de nov bate: ${valores(custos)[0]}`);
  const receitas = linha("RECEITAS");
  ok(valores(receitas)[0] === 250000, `receitas de nov = ${valores(receitas)[0]}`);
  ok(valores(receitas)[1] === 0, "e dez sem receitas = 0");
}

console.log("\nO funding leva o sinal certo — a amortização a negativo:");
{
  // Sem isto a folha dava 103.695,64 + 40.000 de financiamento em jan/27,
  // quando o que entrou foram 103.695,64 e saíram 40.000.
  const amort = linha("Reembolso");
  ok(!!amort, "a linha do reembolso existe");
  ok(valores(amort)[2] === -40000, `jan/27 = ${valores(amort)[2]} (negativo)`);
  const funding = linha("FUNDING");
  ok(valores(funding)[2] === arred2(103695.64 - 40000),
     `e a secção FUNDING em jan/27 = ${valores(funding)[2]}, não ${arred2(103695.64 + 40000)}`);
  ok(valores(funding)[2] === arred2(matriz.funding.valores["2027-01"]),
     "exatamente o que o ecrã mostra");
}

console.log("\nO caixa acumulado é saldo, e a folha diz isso:");
{
  const caixa = F.find(l => /Caixa acumulado/.test(String(l[0])));
  ok(!!caixa, `a linha existe: "${caixa?.[0]}"`);
  ok(/saldo, não soma/.test(String(caixa[0])),
     "e o rótulo avisa que não se soma a linha");
  const vs = valores(caixa);
  ok(vs[0] === arred2(matriz.caixa["2026-11"]), `nov = ${vs[0]}`);
  ok(vs[vs.length - 1] === arred2(matriz.caixaFim),
     `e a célula do total leva o saldo no fim (${vs[vs.length - 1]}), não a soma das colunas`);
  const soma = arred2(vs.slice(0, 3).reduce((a, b) => a + b, 0));
  ok(vs[vs.length - 1] !== soma,
     `que é mesmo coisa diferente da soma (${soma})`);
}

console.log("\nAs linhas dos totais são as do ecrã:");
{
  const lo = F.find(l => /Líquido da operação/.test(String(l[0])));
  const lm = linha("Líquido do mês");
  ok(!!lo && !!lm, "estão as duas lá");
  ok(valores(lo)[0] === arred2(matriz.liquidoOperacao["2026-11"]),
     `líquido da operação de nov = ${valores(lo)[0]}`);
  ok(valores(lm)[0] === arred2(matriz.liquido["2026-11"]),
     `líquido do mês de nov = ${valores(lm)[0]}`);
  ok(/sem o funding/.test(String(lo[0])),
     "e o rótulo explica a diferença entre os dois");
}

console.log("\nA hierarquia vai numa coluna, para se poder filtrar:");
{
  const niveis = new Set(F.slice(folhas.linhaDoCabecalho + 1)
    .filter(l => l.length).map(l => l[1]));
  ok(niveis.has("secção") && niveis.has("categoria") && niveis.has("despesa"),
     `níveis presentes: ${[...niveis].filter(Boolean).join(", ")}`);
  ok(linha("Obra")[1] === "categoria", "«Obra» é categoria");
  ok(linha("CUSTOS")[1] === "secção", "«CUSTOS» é secção");
  ok(linha("Auto de medição")[1] === "despesa", "«Auto de medição» é despesa");
}

console.log("\nA segunda folha é a mesma coisa em lista:");
{
  const L = folhas.lista;
  ok(L[0].join("|") === "Secção|Categoria|Despesa|Mês|Valor", `cabeçalho: ${L[0].join(", ")}`);
  ok(L.length > 10, `${L.length - 1} linhas`);
  ok(L.slice(1).every(l => typeof l[4] === "number"), "os valores são todos números");
  ok(L.slice(1).every(l => Math.abs(l[4]) > 0.005), "e não se exportam zeros");
  const reembolso = L.find(l => l[2] === "Reembolso");
  ok(reembolso && reembolso[4] === -40000,
     `o reembolso também vai a negativo aqui (${reembolso?.[4]})`);
  // A soma da lista tem de bater com a soma da matriz: é a mesma informação.
  const somaLista = arred2(L.slice(1).reduce((s, l) => s + l[4], 0));
  const somaMatriz = arred2(matriz.seccoes.reduce((s, sec) =>
    s + matriz.chaves.reduce((t, c) => t + sec.valores[c], 0), 0));
  ok(Math.abs(somaLista - somaMatriz) < 0.02,
     `as duas folhas somam o mesmo: ${somaLista} e ${somaMatriz}`);
}

console.log("\nQuando há meses para lá da janela, a folha avisa:");
{
  // O ecrã mostra 3 meses mas o fluxo tem 6: somar as colunas à mão não dá o
  // total, e sem uma nota isso parece um erro de contas.
  const muitos = ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]
    .map(key => ({ key, items: [item(key, "saida", "Obra", "Auto", 1000)] }));
  const m2 = construirMatriz({ meses: muitos, maxMeses: 3, saldoInicial: 0 });
  const f2 = construirFolhasDaMatriz(m2, { nomeProjeto: "X" });
  ok(f2.temFora, "a folha sabe que há coisa de fora");
  ok(f2.matriz.some(l => l[0] === "Nota" && /mais 3 meses/.test(String(l[1]))),
     "e há uma nota a dizer quantos meses ficaram de fora");
  const c2 = f2.matriz[f2.linhaDoCabecalho];
  ok(c2.includes("Fora da janela"), "com uma coluna própria para esse valor");
  const obra = f2.matriz.find(l => l[0] === "Obra");
  const vs = obra.slice(f2.primeiraColunaValor);
  ok(arred2(vs.slice(0, 3).reduce((a, b) => a + b, 0) + vs[3]) === vs[4],
     `e as colunas + fora da janela dão o total: ${vs.slice(0, 3)} + ${vs[3]} = ${vs[4]}`);
}

console.log("\nCasos de fronteira não rebentam:");
{
  const vazia = construirMatriz({ meses: [], maxMeses: 3, saldoInicial: 0 });
  const fv = construirFolhasDaMatriz(vazia, {});
  ok(Array.isArray(fv.matriz) && fv.matriz.length > 0, "matriz vazia dá folha com cabeçalho");
  ok(fv.lista.length === 1, "e a lista fica só com o cabeçalho");

  const semNada = construirFolhasDaMatriz(null, {});
  ok(Array.isArray(semNada.matriz), "matriz nula não parte a exportação");

  const semProjeto = construirFolhasDaMatriz(matriz, {});
  ok(semProjeto.matriz.some(l => l[0] === "Projeto" && l[1] === "(todos)"),
     "sem nome de projeto, diz \"(todos)\"");

  ok(rotuloDoMes("2027-01") === "jan/27", "o rótulo do mês é o do ecrã");
  ok(rotuloDoMes("") === "", "e uma chave vazia não inventa nada");
  ok(rotuloDoMes("lixo") === "lixo", "nem uma chave estranha");
}

console.log(mau === 0 ? "\n✅ Excel da matriz OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
