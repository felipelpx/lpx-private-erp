// Nomenclatura dos gráficos: cada rubrica dos dois planos de contas (LPX e
// HDG) tem de cair no grupo certo — e os juros do banco não podem virar
// "Funding banco", que é dinheiro a entrar.
//   node teste-nomenclatura.mjs
import { rotuloGrafico, ocultarNoGrafico, APORTE, RESGATE, FUNDING } from "./src/nomenclatura.js";

let mau = 0;
const eq = (cat, sub, esperado) => {
  const obtido = rotuloGrafico(cat, sub);
  const ok = obtido === esperado;
  if (!ok) mau++;
  const onde = String(sub ? `${cat} / ${sub}` : cat ?? "(nulo)");
  console.log(`  ${ok ? "✓" : "✗"} ${onde.padEnd(46)} → ${obtido === null ? "(fora do gráfico)" : obtido}` +
              (ok ? "" : `   [esperado: ${esperado === null ? "(fora)" : esperado}]`));
};

console.log("Aporte de sócios:");
eq("Aporte RC", "", APORTE);
eq("Aporte Investidores", "", APORTE);
eq("Aporte de Capital HSP", "", APORTE);
eq("Mútuo", "", APORTE);
eq("Mútuo investida", "", APORTE);
eq("Mútuo Findmore", "", APORTE);
eq("Lpx Private - Aporte/Resgate", "", APORTE);
eq("Blessed - Aporte/Resgate", "", APORTE);
eq("Sócios", "Suprimentos", APORTE);                    // plano HDG
eq("Sócios", "Rui Lima Cabral Unip. Lda", APORTE);      // subcategoria = investidor
eq("Sócios", "Oráculo Sábio Lda", APORTE);

console.log("\nResgate de capital (sai, não entra):");
eq("Resgate RC", "", RESGATE);
eq("Resgate Investidores", "", RESGATE);
eq("Resgate SPV", "", RESGATE);

console.log("\nBanco — o desembolso e o seu custo não se confundem:");
eq("Funding", "", FUNDING);
eq("Funding banco", "", FUNDING);
eq("Financiamento", "Inflow - Obra", FUNDING);
eq("Financiamento", "Inflow - Terreno", FUNDING);
eq("Financiamento", "Outflow - Juros", "Juros e encargos");
eq("Financiamento", "Outflow - Taxas e comissões", "Encargos bancários");
eq("Financiamento", "Outlow - Repagamento", "Amortização de dívida");   // typo do ficheiro
eq("Financiamento", "", FUNDING);
eq("Juros", "", "Juros e encargos");
eq("Encargos Financeiros", "Encargos Financeiros", "Juros e encargos");
eq("Amortização", "", "Amortização de dívida");

console.log("\nFora do gráfico (transferência intra-grupo):");
eq("Ajuste", "Movimento entre contas do mesmo grupo", null);
eq("Ajuste", "", null);
eq("Ajuste Contábil", "", null);

console.log("\nAcentos, underscores e maiúsculas não mudam o resultado:");
eq("ajuste", "", null);
eq("APORTE SPV", "", APORTE);
eq("Soft_Costs", "Taxa de Gestão", "Soft_Costs");
eq("Aquisição_de_Terreno", "IMT", "Aquisição_de_Terreno");

console.log("\nO resto passa tal e qual:");
eq("Obras", "Gastos com Obras", "Obras");
eq("Obra", "", "Obra");
eq("Licenças_e_Relacionados", "Taxas e emolumentos", "Licenças_e_Relacionados");
eq("Salários", "", "Salários");
eq("Vendas", "Residencial", "Vendas");
eq("Intra-Group (TRF)", "", "Intra-Group (TRF)");   // visível: só o Ajuste sai
eq("", "", "Sem categoria");
eq(null, null, "Sem categoria");

console.log("\nocultarNoGrafico:");
const o = (c, s, esp) => { const r = ocultarNoGrafico(c, s); const ok = r === esp;
  if (!ok) mau++; console.log(`  ${ok ? "✓" : "✗"} ${String(c)} → ${r}`); };
o("Ajuste", "", true);
o("Obras", "", false);
o("Soft_Costs", "Movimento entre contas do mesmo grupo", true);

console.log(mau === 0 ? "\n✅ Nomenclatura OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
