import { subcategoriasHDG, subcategoriaValida, categoriaNoPlanoHDG, TODAS_SUBCATEGORIAS_HDG }
  from "./src/categoriasHDG.js";
let mau = 0;
const ok = (c, m) => { console.log((c?"  ✓ ":"  ✗ ")+m); if(!c) mau++; };
console.log("Categorias escritas de várias maneiras:");
for (const v of ["Financiamento", "financiamento", " Financiamento ", "FINANCIAMENTO"]) {
  const s = subcategoriasHDG(v);
  ok(s.includes("Inflow - Obra") && s.length === 5, `"${v}" → ${s.length} subcategorias`);
}
for (const v of ["Soft_Costs", "Soft Costs", "soft costs", "Soft  Costs"]) {
  const s = subcategoriasHDG(v);
  ok(s.includes("Taxa de Gestão"), `"${v}" → encontra as do Soft Costs (${s.length})`);
}
for (const v of ["Aquisição_de_Terreno", "Aquisicao de Terreno", "Aquisição de Terreno"]) {
  ok(subcategoriasHDG(v).includes("IMT"), `"${v}" → encontra IMT`);
}
ok(categoriaNoPlanoHDG("Intra-Group (TRF)"), "Intra-Group (TRF) está no plano");
ok(categoriaNoPlanoHDG("Soft Costs"), "Soft Costs (com espaço) está no plano");
ok(!categoriaNoPlanoHDG("Ticket Refeição"), "Ticket Refeição não é do plano HDG");

console.log("\nNunca deixa a célula morta:");
ok(subcategoriasHDG("Transferências").length > 0, "categoria sem subcategorias próprias oferece a lista toda");
ok(subcategoriasHDG("Categoria Inventada").length === TODAS_SUBCATEGORIAS_HDG.length, "categoria desconhecida oferece a lista toda");
ok(subcategoriasHDG("").length > 0, "categoria vazia oferece a lista toda");

console.log("\nValidação:");
ok(subcategoriaValida("Financiamento", "Inflow - Obra"), "par válido");
ok(!subcategoriaValida("Financiamento", "IMT"), "par inválido é recusado");
ok(subcategoriaValida("Soft_Costs", "Taxa de Gestão"), "aceita a grafia com underscore");
ok(subcategoriaValida("Categoria Inventada", "Seja o que for"), "fora do plano não bloqueia");
ok(subcategoriaValida("Financiamento", ""), "sem subcategoria é sempre válido");
console.log(mau===0 ? "\n✅ OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau?1:0);
