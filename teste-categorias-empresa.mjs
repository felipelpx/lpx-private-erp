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

console.log("\nAs contas dos FO existem nas empresas:");
const bancos = (id) => EMPRESAS.find(e => e.id === id)?.contas.map(c => c.banco) || [];
ok(bancos("simplify").includes("BM"), "Simplify tem a conta BM (Big Mouse)");
ok(bancos("genero").includes("LPX"), "Genero Prudente tem a conta LPX");
ok(bancos("pearl").includes("Revolut"), "Pearl tem Revolut");
ok(bancos("favcloset").join(",") === "BCP,RED", "Favorite Closet continua com BCP e RED");

console.log(mau === 0 ? "\n✅ Categorias por empresa OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
