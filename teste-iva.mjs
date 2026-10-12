// Apuramento de IVA: os dez pontos de validação do enunciado, mais as
// armadilhas de calendário (4T paga-se no ano seguinte, fevereiro bissexto).
//   node teste-iva.mjs
import {
  trimestreDe, rotuloTrimestre, dataLimite, fimDoTrimestre, estadoTrimestre,
  ivaDoDocumento, apurar, porMes, proximoVencimento, arred2, mesesDoTrimestre,
} from "./src/iva.js";

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };
const perto = (a, b) => Math.abs(a - b) < 0.005;

const doc = (o) => ({ tipo: "fornecedor", empresa: "adseq", ...o });

console.log("Trimestre a partir da data de emissão:");
[["2026-01-01",1],["2026-03-31",1],["2026-04-01",2],["2026-06-30",2],
 ["2026-07-01",3],["2026-09-28",3],["2026-10-01",4],["2026-12-31",4]].forEach(([d,t]) =>
  ok(trimestreDe(d) === t, `${d} → ${t}T`));
ok(trimestreDe("") === null, "data vazia não tem trimestre");
ok(trimestreDe("não é data") === null, "lixo não tem trimestre");
ok(rotuloTrimestre(2027, 3) === "3T27", "rótulo 3T27");
ok(mesesDoTrimestre(3).join(",") === "7,8,9", "3T são julho, agosto e setembro");

console.log("\nData-limite: dia 25 do 2.º mês após o fim do trimestre");
ok(dataLimite(2027, 1) === "2027-05-25", "1T27 → 25 de maio de 2027");
ok(dataLimite(2027, 2) === "2027-08-25", "2T27 → 25 de agosto de 2027");
ok(dataLimite(2027, 3) === "2027-11-25", "3T27 → 25 de novembro de 2027");
ok(dataLimite(2027, 4) === "2028-02-25", "4T27 → 25 de fevereiro de 2028 (salta de ano)");
ok(fimDoTrimestre(2026, 1) === "2026-03-31", "1T26 acaba a 31 de março");
ok(fimDoTrimestre(2026, 2) === "2026-06-30", "2T26 acaba a 30 de junho");

console.log("\nEstado do trimestre:");
ok(estadoTrimestre(2026, 4, null, "2026-11-10") === "curso",   "antes de fechar: Em curso");
ok(estadoTrimestre(2026, 3, null, "2026-10-15") === "aberto",  "fechado, dentro do prazo: Em aberto");
ok(estadoTrimestre(2026, 3, null, "2026-11-26") === "vencido", "passou o prazo: Vencido");
ok(estadoTrimestre(2026, 3, null, "2026-11-25") === "aberto",  "no próprio dia 25 ainda não venceu");
ok(estadoTrimestre(2026, 3, { data_pagamento: "2026-11-20" }, "2027-01-01") === "pago",
   "marcado como pago fica Pago mesmo depois do prazo");

console.log("\nO IVA vem da fatura; só se calcula quando falta:");
ok(perto(ivaDoDocumento({ valor_iva: 230 }).iva, 230), "lê o montante da fatura");
ok(ivaDoDocumento({ valor_iva: 230 }).estimado === false, "e não o marca como calculado");
const calc = ivaDoDocumento({ valor_base: 1000, taxa_iva: 23 });
ok(perto(calc.iva, 230), "sem montante, calcula base × taxa");
ok(calc.estimado === true, "e assinala-o como calculado");
ok(perto(ivaDoDocumento({ valor_base: 1000, taxa_iva: 6 }).iva, 60), "respeita a taxa reduzida");
ok(ivaDoDocumento({ valor_base: 1000 }).iva === 0, "sem taxa não inventa nada");
ok(ivaDoDocumento({}).iva === 0, "documento vazio dá zero");
ok(perto(ivaDoDocumento({ valor_iva: -230 }).iva, -230), "nota de crédito mantém o sinal negativo");
ok(perto(ivaDoDocumento({ valor_base: 333.33, taxa_iva: 23 }).iva, 76.67), "arredonda a 2 casas");

console.log("\nO exemplo do enunciado (setembro de 2026):");
{
  const docs = [
    doc({ id: "f1", valor_base: 1000, valor_iva: 230, data_fatura: "2026-09-28" }),
    doc({ id: "r1", tipo: "cliente", valor_base: 3000, valor_iva: 690, data_fatura: "2026-09-20" }),
  ];
  const a = apurar(docs);
  const t = a.trimestres[0];
  ok(a.trimestres.length === 1 && t.rotulo === "3T26", "cai tudo no 3T26");
  ok(perto(t.aPagar, 690), "IVA a pagar 690 €");
  ok(perto(t.aAbater, 230), "IVA a abater 230 €");
  ok(perto(t.saldo, 460), "saldo 460 € a pagar ao Estado");
  ok(t.dataLimite === "2026-11-25", "a pagar até 25 de novembro de 2026");
  const set = t.meses.find(m => m.mes === 9);
  ok(perto(set.saldo, 460), "o mês de setembro também dá 460 €");
  ok(t.meses.length === 3, "os três meses do trimestre aparecem sempre");
  ok(t.meses.filter(m => m.semFaturas).length === 2, "julho e agosto aparecem vazios e assinalados");
}

console.log("\nO pagamento não mexe no apuramento:");
{
  const base = doc({ valor_iva: 230, data_fatura: "2026-09-28" });
  const porPagar = apurar([{ ...base, estado: "Pendente em dia" }]);
  const paga     = apurar([{ ...base, estado: "Pago" }]);
  ok(perto(porPagar.total.aAbater, paga.total.aAbater), "por pagar e paga dão o mesmo");
  ok(perto(paga.total.aAbater, 230), "e a fatura por pagar conta na mesma");
}

console.log("\nNotas de crédito:");
{
  const a = apurar([
    doc({ tipo: "cliente", valor_iva: 690, data_fatura: "2026-09-20" }),
    doc({ tipo: "cliente", valor_iva: -230, data_fatura: "2026-09-25" }),
    doc({ valor_iva: 230, data_fatura: "2026-09-28" }),
    doc({ valor_iva: -115, data_fatura: "2026-09-29" }),
  ]);
  ok(perto(a.total.aPagar, 460), "a nota de crédito a cliente reduz o IVA a pagar");
  ok(perto(a.total.aAbater, 115), "a nota de crédito de fornecedor reduz o IVA a abater");
  ok(perto(a.total.saldo, 345), "saldo 345 €");
}

console.log("\nFiltros:");
{
  const docs = [
    doc({ empresa: "adseq",    valor_iva: 100, data_fatura: "2026-02-10" }),
    doc({ empresa: "infinite", valor_iva: 200, data_fatura: "2026-02-10" }),
    doc({ empresa: "adseq",    valor_iva: 300, data_fatura: "2027-05-10" }),
  ];
  ok(perto(apurar(docs, { empresa: "adseq" }).total.aAbater, 400), "empresa A não traz nada da B");
  ok(perto(apurar(docs, { empresa: "infinite" }).total.aAbater, 200), "e vice-versa");
  ok(perto(apurar(docs).total.aAbater, 600), '"Todas" é a soma das empresas');
  ok(perto(apurar(docs, { ano: 2026 }).total.aAbater, 300), "filtro de ano");
  ok(perto(apurar(docs, { ano: 2027, trimestre: 2 }).total.aAbater, 300), "ano + trimestre combinam");
  ok(apurar(docs, { ano: 2026, trimestre: 3 }).trimestres.length === 0, "trimestre sem faturas vem vazio");
}

console.log("\nSoma dos meses = total do trimestre:");
{
  const docs = [];
  for (let m = 1; m <= 12; m++) {
    docs.push(doc({ valor_iva: m * 10, data_fatura: `2026-${String(m).padStart(2,"0")}-15` }));
    docs.push(doc({ tipo: "cliente", valor_iva: m * 25, data_fatura: `2026-${String(m).padStart(2,"0")}-20` }));
  }
  const a = apurar(docs, { ano: 2026 });
  ok(a.trimestres.length === 4, "quatro trimestres");
  a.trimestres.forEach(t => {
    const somaMeses = arred2(t.meses.reduce((s, m) => s + m.saldo, 0));
    ok(perto(somaMeses, t.saldo), `${t.rotulo}: ${somaMeses} = ${t.saldo}`);
  });
  const totalTri = arred2(a.trimestres.reduce((s, t) => s + t.saldo, 0));
  ok(perto(totalTri, a.total.saldo), "e os trimestres somam o total do ano");

  const meses = porMes(a, 2026);
  ok(meses.length === 12, "a vista por mês tem os 12 meses");
  ok(perto(arred2(meses.reduce((s, m) => s + m.saldo, 0)), a.total.saldo), "que somam o mesmo total");
}

console.log("\nPróximo vencimento:");
{
  const docs = [
    doc({ tipo: "cliente", valor_iva: 1000, data_fatura: "2026-02-10" }),  // 1T26
    doc({ tipo: "cliente", valor_iva: 2000, data_fatura: "2026-05-10" }),  // 2T26
  ];
  const a = apurar(docs);
  const prox = proximoVencimento(a.trimestres, [], "2026-07-01");
  ok(prox && prox.rotulo === "1T26", "escolhe o trimestre fechado mais antigo por pagar");
  const prox2 = proximoVencimento(a.trimestres, [{ ano: 2026, trimestre: 1, data_pagamento: "2026-05-20" }], "2026-07-01");
  ok(prox2 && prox2.rotulo === "2T26", "depois de pago, passa ao seguinte");
  ok(proximoVencimento(a.trimestres, [], "2026-04-01")?.rotulo === "1T26", "o 2T ainda em curso não conta");
}

console.log("\nCasos de fronteira:");
ok(apurar([]).trimestres.length === 0, "sem documentos não rebenta");
ok(apurar(null).total.saldo === 0, "nulo não rebenta");
ok(apurar([doc({ valor_iva: 100, data_fatura: null })]).linhas.length === 0, "documento sem data fica de fora");
ok(apurar([doc({ valor_iva: 100, data_fatura: "2026-12-31" })]).trimestres[0].rotulo === "4T26",
   "31 de dezembro é 4T, não 1T do ano seguinte");
ok(apurar([doc({ valor_iva: 100, data_fatura: "2026-01-01" })]).trimestres[0].dataLimite === "2026-05-25",
   "1 de janeiro paga-se a 25 de maio");

console.log(mau === 0 ? "\n✅ Apuramento de IVA OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
