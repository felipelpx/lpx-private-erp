// O plano de contas de cada empresa: vem do Categorias.xlsx e tem de cobrir
// tudo o que está nos extratos dos Fluxos Operacionais.
//   node teste-categorias-empresa.mjs
import { CATEGORIAS_POR_EMPRESA, CAT_SUB_POR_EMPRESA, categoriasDa, subcategoriasDa,
         usaSubcategoria, temPlanoProprio, foraDoPlano, comOValorAtual } from "./src/categoriasEmpresa.js";
import { EMPRESAS } from "./src/empresas.js";

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };

console.log("Cada projeto tem o seu plano:");
["favcloset","simplify","enchanted","blessed","pearl","genero","adseq","infinite"].forEach(e =>
  ok(temPlanoProprio(e), `${e} tem plano próprio`));
["lpx","fluffy","tracos"].forEach(e =>
  ok(!temPlanoProprio(e) && categoriasDa(e) === null, `${e} fica com a lista geral`));

console.log("\nLPX: lista plana, sem subcategoria");
["favcloset","simplify","enchanted","blessed","pearl","genero"].forEach(e => {
  ok(!usaSubcategoria(e), `${e} não usa subcategoria`);
  ok(subcategoriasDa(e, "Obra").length === 0, `${e} não devolve subcategorias`);
});
ok(categoriasDa("favcloset").length > 30, "Favorite Closet tem o plano maior");
ok(categoriasDa("simplify").includes("Terreno"), "Simplify tem Terreno");

console.log("\nHDG: Categoria > Subcategoria");
["adseq","infinite"].forEach(e => ok(usaSubcategoria(e), `${e} usa subcategoria`));
ok(categoriasDa("adseq").includes("Obras"), "Admirable Sequence tem Obras");
ok(subcategoriasDa("adseq", "Obras").includes("Gastos com Obras"), "e Gastos com Obras lá dentro");
ok(subcategoriasDa("adseq", "Sócios").includes("Suprimentos"), "Sócios tem Suprimentos");
ok(subcategoriasDa("infinite", "Soft_Costs").includes("Fiscalização"), "Infinite tem Fiscalização em Soft_Costs");
ok(subcategoriasDa("adseq", "Categoria Que Não Existe").length > 0,
   "uma categoria desconhecida devolve todas as subcategorias, para a célula não ficar morta");

console.log("\nNada se perde:");
ok(foraDoPlano("favcloset", "Uma Coisa Qualquer"), "um valor estranho é assinalado");
ok(!foraDoPlano("favcloset", categoriasDa("favcloset")[0]), "um valor do plano não é");
ok(!foraDoPlano("lpx", "Seja O Que For"), "sem plano próprio, nada está fora do plano");
ok(comOValorAtual(["a","b"], "z").includes("z"), "o valor gravado entra sempre na lista");
ok(comOValorAtual(["a","b"], "a").length === 2, "e não se repete se já lá estiver");
ok(comOValorAtual(["a"], "").length === 1, "vazio não acrescenta nada");

console.log("\nAv. da Igreja: cada empresa com os SEUS sócios:");
{
  // Estas duas listas foram escritas à mão e ainda não estão no
  // Categorias.xlsx. Quem voltar a gerar este ficheiro a partir do Excel
  // apaga-as sem dar por isso — é este bloco que trava essa regressão.
  const MOLDE = "simplify";
  // Duas coisas diferentes com nomes parecidos: a linha de cada SÓCIO
  // ("<nome> - Aporte/Resgate", dinheiro que entra) e a da PARTICIPADA
  // ("Aporte / Resgate investida", dinheiro que sai para a sociedade
  // detida). Separam-se aqui para não se confundirem nas contagens.
  const aporte = (id) => categoriasDa(id).filter(c => /\s-\s*Aporte\s*\/?\s*Resgate/i.test(c));
  const investida = (id) => categoriasDa(id).filter(c => /investida/i.test(c));

  ok(temPlanoProprio("meridiano"), "a Meridiano tem plano próprio");
  ok(temPlanoProprio("spiral"), "a Spiral tem plano próprio");
  ok(!usaSubcategoria("meridiano") && !usaSubcategoria("spiral"),
     "as duas em lista plana, como o resto do grupo LPX");

  ok(aporte("meridiano").join(" · ") ===
     "LPX Private - Aporte/Resgate · Manga Investments - Aporte/Resgate · Alvorada Resiliente - Aporte/Resgate",
     `Meridiano: ${aporte("meridiano").join(", ")}`);
  ok(aporte("spiral").join(" · ") ===
     "Meridiano Radioso - Aporte/Resgate · Empresar - Aporte/Resgate",
     `Spiral: ${aporte("spiral").join(", ")}`);

  // A Meridiano é holding: tem de ter onde lançar o que SAI para a Spiral.
  // Sem esta linha, as "TRF P/ SPIRAL TREASURE LDA" do extrato ficavam sem
  // categoria possível.
  ok(investida("meridiano").join(" · ") === "Aporte / Resgate investida",
     `Meridiano tem a linha da participada: ${investida("meridiano").join(", ") || "(nenhuma)"}`);
  ok(investida("spiral").length === 0,
     "e a Spiral não tem, porque não detém ninguém");

  // Os sócios dos OUTROS projetos não podem ter vindo no molde.
  for (const id of ["meridiano", "spiral"]) {
    const intrusos = categoriasDa(id).filter(c => /Blessed|Parcela Emergente/i.test(c));
    ok(intrusos.length === 0,
       intrusos.length ? `${id} traz sócios de outro projeto: ${intrusos.join(", ")}`
                       : `${id} não traz a Blessed nem a Parcela Emergente`);
  }

  // E o resto da lista tem de ser o do molde, linha a linha: é isso que
  // significa "as mesmas categorias do grupo".
  const proprias = (id) => categoriasDa(id)
    .filter(c => !/\s-\s*Aporte\s*\/?\s*Resgate/i.test(c) && !/investida/i.test(c));
  for (const id of ["meridiano", "spiral"]) {
    const a = proprias(id).join("|"), b = proprias(MOLDE).join("|");
    ok(a === b, a === b
         ? `${id} tem as restantes ${proprias(id).length} rubricas iguais às da ${MOLDE}`
         : `${id} divergiu do molde: ${a.split("|").filter(x => !b.includes(x)).join(", ")}`);
  }

  // E o essencial de um plano de contas: nada repetido.
  for (const id of ["meridiano", "spiral"]) {
    const l = categoriasDa(id);
    ok(new Set(l.map(c => c.toLowerCase())).size === l.length,
       `${id}: ${l.length} rubricas, nenhuma repetida`);
  }
}

console.log("\nAs contas dos FO existem nas empresas:");
const bancos = (id) => EMPRESAS.find(e => e.id === id)?.contas.map(c => c.banco) || [];
ok(bancos("simplify").includes("BM"), "Simplify tem a conta BM (Big Mouse)");
ok(bancos("genero").includes("LPX"), "Genero Prudente tem a conta LPX");
ok(bancos("pearl").includes("Revolut"), "Pearl tem Revolut");
ok(bancos("favcloset").join(",") === "BCP,RED", "Favorite Closet continua com BCP e RED");

console.log(mau === 0 ? "\n✅ Categorias por empresa OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
