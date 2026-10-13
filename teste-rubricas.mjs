// As rubricas: a ordem é a do plano de cada empresa, nada se renomeia, e o
// que fica de fora do gráfico diz-se.
//   node teste-rubricas.mjs
import { rubricasDa, rubricaDe, agruparPorRubrica, passosDaCascata,
         rubricaNoPlano, ordemDaRubrica, chaveRubrica, SEM_RUBRICA } from "./src/rubricas.js";
import { CATEGORIAS_POR_EMPRESA, CAT_SUB_POR_EMPRESA } from "./src/categoriasEmpresa.js";

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };
const perto = (a, b, t = 0.005) => Math.abs(a - b) < t;

console.log("A lista de rubricas é a do plano da empresa:");
{
  const fc = rubricasDa("favcloset");
  const ad = rubricasDa("adseq");
  ok(fc.length > 10, `a Favorite Closet tem ${fc.length} rubricas`);
  const doExcel = CATEGORIAS_POR_EMPRESA.favcloset;
  ok(fc.every(c => doExcel.includes(c)) && doExcel.every(c =>
       fc.some(x => x.toLowerCase() === c.toLowerCase())),
     "e são exatamente as do Categorias.xlsx (tirando o duplicado de maiúsculas)");
  ok(ad.join() === Object.keys(CAT_SUB_POR_EMPRESA.adseq).join(),
     "numa empresa HDG a rubrica é a categoria, e as subcategorias são o detalhe");
  ok(fc.join() !== ad.join(), "cada empresa tem a sua lista");

  // A ordem importa: é a ordem do Excel, não alfabética
  const ordenada = [...fc].sort((a, b) => a.localeCompare(b, "pt"));
  ok(fc.join() !== ordenada.join() || fc.length < 3,
     "a ordem é a do plano, não a alfabética");

  ok(rubricasDa("empresa-que-nao-existe").length > 0,
     "uma empresa sem plano próprio cai no plano geral, não fica sem rubricas");

  // O Excel traz "Impostos e taxas" e "Impostos e Taxas" na mesma empresa
  const chaves = fc.map(c => c.toLowerCase());
  ok(new Set(chaves).size === chaves.length,
     "a mesma rubrica escrita de duas maneiras sai uma vez só");
}

console.log("\nA rubrica de um movimento é a sua categoria, escrita como o plano a escreve:");
{
  ok(rubricaDe("favcloset", "Obra") === "Obra", "bate direto");
  const comSub = rubricasDa("adseq").find(c => /_/.test(c));
  if (comSub) {
    const semUnderscore = comSub.replace(/_/g, " ").toLowerCase();
    ok(rubricaDe("adseq", semUnderscore) === comSub,
       `"${semUnderscore}" é reconhecido como "${comSub}" (acentos, espaços e underscores não contam)`);
  } else { ok(true, "(o plano HDG não tem rubricas com underscore para testar)"); }

  ok(rubricaDe("favcloset", "  obra  ") === "Obra", "espaços e maiúsculas não criam rubricas novas");
  ok(rubricaDe("favcloset", "Rubrica Inventada") === "Rubrica Inventada",
     "uma categoria fora do plano aparece à mesma, com o nome que tem");
  ok(rubricaDe("favcloset", "") === SEM_RUBRICA, "sem categoria tem rubrica própria");
  ok(rubricaDe("favcloset", "Ajustes do grupo") === null,
     "um ajuste que o plano não tem não é fluxo do projeto");
  ok(rubricaDe("favcloset", "Transferências", "Movimento entre contas do mesmo grupo") === null,
     "nem uma transferência intra-grupo fora do plano");
  // Mas uma rubrica que ESTÁ no plano não se esconde, chame-se ela o que for.
  ok(rubricasDa("favcloset").includes("Ajuste"), "o plano da Favorite Closet tem a rubrica Ajuste");
  ok(rubricaDe("favcloset", "Ajuste") === "Ajuste",
     "e por isso ela aparece: o plano manda mais do que a limpeza");
  ok(rubricaNoPlano("favcloset", "Obra") === true, "sabe o que está no plano");
  ok(rubricaNoPlano("favcloset", "Rubrica Inventada") === false, "e o que não está");
  ok(ordemDaRubrica("favcloset", "Rubrica Inventada") > ordemDaRubrica("favcloset", "Obra"),
     "o que não está no plano vai para o fim");
  ok(chaveRubrica("Soft_Costs") === chaveRubrica("soft costs"), "a chave normaliza");
}

console.log("\nAgrupar: cada rubrica uma vez, pela ordem do plano:");
{
  const movs = [
    { categoria: "Obra", valor: -100000 },
    { categoria: "obra", valor: -50000 },          // mesma rubrica, outra grafia
    { categoria: "Obra", valor: 2000 },            // nota de crédito
    { categoria: "Funding banco", valor: 800000 },
    { categoria: "Funding banco", valor: -120000 },
    { categoria: "Rubrica Inventada", valor: -300 },
    { categoria: "Ajustes do grupo", valor: 5000 },
    { categoria: "Transferências", subcategoria: "Movimento entre contas do mesmo grupo", valor: -5000 },
  ];
  const a = agruparPorRubrica(movs, { empresaId: "favcloset" });

  const obra = a.linhas.find(l => l.rubrica === "Obra");
  ok(a.linhas.filter(l => l.rubrica === "Obra").length === 1, "as duas grafias de obra dão uma linha só");
  ok(perto(obra.saida, -150000), "com as saídas somadas");
  ok(perto(obra.entrada, 2000), "e a entrada à parte");
  ok(perto(obra.liquido, -148000), "o líquido é a soma dos dois");
  ok(obra.n === 3, "três movimentos nessa rubrica");
  ok(obra.noPlano === true, "e está no plano");

  const inventada = a.linhas.find(l => l.rubrica === "Rubrica Inventada");
  ok(!!inventada && inventada.noPlano === false, "a rubrica fora do plano aparece, marcada");
  ok(a.linhas[a.linhas.length - 1].rubrica === "Rubrica Inventada", "e é a última");

  ok(a.nExcluidos === 2, "dois movimentos ficaram de fora");
  ok(perto(a.excluido, 0), "e não mexem no saldo: entram e saem pelo mesmo valor");
  ok(a.nomesExcluidos.includes("Ajustes do grupo") && a.nomesExcluidos.includes("Transferências"),
     "o rodapé pode dizer quais foram");

  ok(perto(a.entradas, 802000), "total de entradas");
  ok(perto(a.saidas, -270300), `total de saídas (deu ${a.saidas})`);
  ok(perto(a.entradas + a.saidas, 531700), "e o resultado do período");

  // A ordem das linhas segue o plano
  const plano = rubricasDa("favcloset");
  const posicoes = a.linhas.filter(l => l.noPlano)
    .map(l => plano.findIndex(c => chaveRubrica(c) === chaveRubrica(l.rubrica)));
  ok(posicoes.every((p, i) => i === 0 || p > posicoes[i - 1]), "as rubricas saem pela ordem do plano");
}

console.log("\nA cascata: entradas, depois saídas, sem rótulos repetidos:");
{
  const movs = [
    { categoria: "Funding banco", valor: 800000 },
    { categoria: "Funding banco", valor: -120000 },
    { categoria: "Obra", valor: -300000 },
    { categoria: "Vendas", valor: 90000 },
  ];
  const passos = passosDaCascata(agruparPorRubrica(movs, { empresaId: "favcloset" }));
  const nomes = passos.map(p => p.nome);

  ok(new Set(nomes).size === nomes.length, `nenhum rótulo repetido: ${nomes.join(" · ")}`);
  ok(nomes.includes("Funding banco (entradas)") && nomes.includes("Funding banco (saídas)"),
     "a rubrica com os dois sinais diz qual é qual");
  ok(nomes.includes("Obra") && !nomes.includes("Obra (saídas)"),
     "e a que só tem um sinal fica com o nome limpo");
  ok(!nomes.includes("Outros"), "não há balde de Outros: mostram-se todas as rubricas");

  const entradas = passos.filter(p => p.valor > 0);
  const saidas = passos.filter(p => p.valor < 0);
  ok(passos.slice(0, entradas.length).every(p => p.valor > 0), "as entradas vêm primeiro");
  ok(passos.slice(entradas.length).every(p => p.valor < 0), "e as saídas a seguir");
  ok(perto(passos.reduce((s, p) => s + p.valor, 0), 470000),
     "a soma dos passos é o resultado do período");
  ok(saidas.length === 2, "duas saídas: obra e a amortização do funding");
}

console.log("\nCasos de fronteira:");
{
  ok(agruparPorRubrica([], { empresaId: "favcloset" }).linhas.length === 0, "sem movimentos, sem linhas");
  ok(agruparPorRubrica(null, {}).linhas.length === 0, "nulo não rebenta");
  ok(passosDaCascata(agruparPorRubrica(null, {})).length === 0, "nem a cascata");
  const so0 = agruparPorRubrica([{ categoria: "Obra", valor: 0 }], { empresaId: "favcloset" });
  ok(so0.linhas.length === 1 && passosDaCascata(so0).length === 0,
     "uma rubrica só com zeros não desenha barra nenhuma");
  const semEmp = agruparPorRubrica([{ categoria: "Obra", valor: -10 }], {});
  ok(semEmp.linhas.length === 1, "sem empresa indicada continua a agrupar");
}

console.log(mau === 0 ? "\n✅ Rubricas OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
