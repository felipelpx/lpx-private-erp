// O motor do plano de obra: a aritmética de meses, o que falta gastar, as
// avenças que se esticam com o prazo, os juros sobre dívida que cresce, e o
// IVA que volta no trimestre seguinte.
//   node teste-obra.mjs
import {
  planearObra, mesesEntre, somarMeses, diferencaMeses, gastoEmObra,
  compararPrazos, categoriasDoMotor, classificacaoDe, temObra, rotuloMes,
  sugerirAvenca, planoDesatualizado, planearAplicacao, repartir,
  obraRealizada, fundingLibertado,
} from "./src/obra.js";

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };
const perto = (a, b, t = 0.02) => Math.abs(a - b) < t;
const soma = (ls, tipo) => ls.filter(l => l.plano_tipo === tipo)
  .reduce((s, l) => s + l.valor, 0);

// ─────────────────────────────────────────────────────────────────────────────
console.log("Aritmética de meses:");
ok(somarMeses("2026-10", 3) === "2027-01", "outubro + 3 = janeiro do ano seguinte");
ok(somarMeses("2026-01", -1) === "2025-12", "janeiro − 1 = dezembro anterior");
ok(somarMeses("2026-12", 1) === "2027-01", "dezembro + 1 vira o ano");
ok(diferencaMeses("2026-10", "2027-03") === 5, "de outubro a março são 5 meses");
ok(mesesEntre("2026-10", "2026-10").length === 1, "o mesmo mês conta como 1");
ok(mesesEntre("2026-10", "2027-01").join(",") === "2026-10,2026-11,2026-12,2027-01",
   "o intervalo inclui as duas pontas");
ok(mesesEntre("2027-01", "2026-10").length === 0, "fim antes do início não dá meses negativos");
// A armadilha clássica: 31 de janeiro mais um mês com Date dá 2 ou 3 de março
ok(somarMeses("2026-01-31", 1) === "2026-02", "31 de janeiro + 1 mês é fevereiro, não março");
ok(rotuloMes("2026-10") === "out/26", "rótulo do mês");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nO que já se gastou em obra:");
{
  const faturas = [
    { empresa: "favcloset", categoria: "Obra", valor: 123, valor_base: 100, status: "Pago" },
    { empresa: "favcloset", categoria: "obra", valor: 246, valor_base: 200, status: "Pendente" },
    { empresa: "favcloset", categoria: "Obra", valor: 123, valor_base: null, status: "Pago" },
    { empresa: "favcloset", categoria: "Fiscalização", valor: 1000, valor_base: 813, status: "Pago" },
    { empresa: "simplify",  categoria: "Obra", valor: 999, valor_base: 812, status: "Pago" },
    { empresa: "favcloset", categoria: "Obra", valor: 500, valor_base: 406, status: "Anulada" },
  ];
  const g = gastoEmObra(faturas, { empresa: "favcloset", categorias: ["Obra"], taxaIva: 23 });
  ok(perto(g, 400), `conta a base das faturas de obra da empresa certa (deu ${g})`);
  ok(gastoEmObra([], { empresa: "x", categorias: ["Obra"] }) === 0, "sem faturas dá zero");
  ok(gastoEmObra(null, { empresa: "x", categorias: ["Obra"] }) === 0, "nulo não rebenta");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nObra: o que falta, espalhado pelos meses que faltam");
const base = {
  empresa: "favcloset", data_inicio: "2026-06-01", data_fim: "2027-03-31",
  budget_obra: 1000000, taxa_iva_obra: 23,
  fiscalizacao_mensal: 1476, cso_mensal: 500, taxa_iva_servicos: 23, comissao_avaliacao: 300,
  euribor: 2.5, spread: 2.0, funding_pct: 70, divida_inicial: 400000,
  recuperar_iva: true,
};
const opts = { gastoObra: 400000, hoje: "2026-10-12", grupo: "LPX" };

{
  const { linhas, resumo } = planearObra(base, opts);
  // De outubro/26 a março/27 são 6 meses
  ok(resumo.meses === 6, `6 meses por correr (deu ${resumo.meses})`);
  ok(resumo.primeiroMes === "2026-10", "arranca no mês corrente, não no início da obra");
  ok(resumo.ultimoMes === "2027-03", "acaba no mês do fim da obra");
  ok(perto(resumo.porGastar, 600000), "falta gastar 600 000 € de budget");

  const obra = linhas.filter(l => l.plano_tipo === "obra");
  ok(obra.length === 6, "uma linha de obra por mês");
  ok(perto(obra[0].base, 100000), "base mensal = 600 000 / 6 = 100 000 €");
  ok(perto(obra[0].iva, 23000), "IVA mensal a 23% = 23 000 €");
  ok(perto(obra[0].valor, 100000), "a fatura do empreiteiro sai pela BASE: 100 000 €");
  ok(!perto(obra[0].valor, 123000), "o IVA não sai com ela — é autoliquidado e sai no apuramento");
  ok(perto(soma(linhas, "obra"), 600000), "a obra total em base é 600 000 €");
  ok(perto(soma(linhas, "iva_obra"), 138000), "e o IVA, 138 000 €, sai à parte nos dias 25");
  ok(obra.every(l => l.categoria === "Obra"), "classificada como Obra (LPX)");
  ok(obra.every(l => l.funding === false),
     "a obra NÃO leva a marca de funding: a entrada do banco é uma linha própria");
  ok(obra.every(l => l.data.endsWith("-01")), "a obra cai no dia 1 de cada mês");
}

console.log("\nAvenças: fixas por mês, tantos meses quanto a obra durar");
{
  const { linhas } = planearObra(base, opts);
  ok(linhas.filter(l => l.plano_tipo === "fiscalizacao").length === 6, "6 meses de fiscalização");
  ok(perto(soma(linhas, "fiscalizacao"), 6 * 1476 * 1.23), "1 476 €/mês + IVA × 6");
  ok(linhas.filter(l => l.plano_tipo === "cso").length === 6, "6 meses de CSO");
  ok(perto(soma(linhas, "cso"), 6 * 500 * 1.23), "500 €/mês + IVA × 6");
  ok(linhas.filter(l => l.plano_tipo === "fiscalizacao").every(l => l.funding === false),
     "as avenças não são financiadas pelo banco");
}

console.log("\nFunding: o banco financia a BASE, não a fatura cheia");
{
  const { linhas } = planearObra(base, opts);
  const fund = linhas.filter(l => l.plano_tipo === "funding");
  ok(fund.length === 6, "uma libertação por mês de obra");
  ok(fund.every(l => l.tipo === "entrada"), "e é uma entrada");
  // base 100 000 × 70% = 70 000 — e NÃO 123 000 × 70% = 86 100
  ok(perto(fund[0].valor, 70000), `70% de 100 000 € de base = 70 000 € (deu ${fund[0].valor})`);
  ok(!perto(fund[0].valor, 86100), "não é 70% da fatura com IVA");
  ok(perto(soma(linhas, "funding"), 420000), "6 × 70 000 = 420 000 € libertados pelo banco");
  const liquido = soma(linhas, "obra") + soma(linhas, "iva_obra")
                - soma(linhas, "funding") - soma(linhas, "funding_iva");
  ok(perto(liquido, 0.30 * 738000), "a 70%, de bolso saem 30% da base e 30% do IVA");
  const cem = planearObra({ ...base, funding_pct: 100 }, opts);
  const liquido100 = soma(cem.linhas, "obra") + soma(cem.linhas, "iva_obra")
                   - soma(cem.linhas, "funding") - soma(cem.linhas, "funding_iva");
  ok(perto(liquido100, 0), "a 100%, obra e IVA anulam-se em caixa: fica só a dívida");
}

console.log("\nJuros: sobre o SALDO MÉDIO do mês");
{
  const { linhas, resumo } = planearObra(base, opts);
  const juros = linhas.filter(l => l.plano_tipo === "juros");
  ok(juros.length === 6, "6 meses de juros");
  // Mês 1: dívida 400 000 → 470 000, média 435 000 × 4,5% / 12 = 1 631,25
  ok(perto(juros[0].valor, 1631.25), `1.º mês: média de 435 000 € = 1 631,25 € (deu ${juros[0].valor})`);
  ok(juros[0].valor > 1500, "mais do que sobre o saldo de abertura (1 500 €)");
  ok(juros[0].valor < 1762.5, "e menos do que sobre o saldo de fecho (1 762,50 €)");
  // Mês 2: 470 000 → 540 000, média 505 000 × 4,5% / 12 = 1 893,75
  ok(perto(juros[1].valor, 1893.75), `2.º mês: média de 505 000 € = 1 893,75 € (deu ${juros[1].valor})`);
  ok(juros.every((j, i) => i === 0 || j.valor > juros[i - 1].valor), "os juros sobem todos os meses");
  // fev/27 recebe a entrada de IVA do 4T26: o salto tem de aparecer nos juros
  const fev = juros.find(l => l.mes === "2027-02");
  const jan = juros.find(l => l.mes === "2027-01");
  ok(fev.valor - jan.valor > 300, "o mês que recebe o IVA dá um salto maior nos juros");
  ok(perto(resumo.dividaFinal, 400000 + 0.7 * (600000 + 138000)),
     "dívida final = inicial + 70% da base + 70% do IVA");
  ok(juros.every(l => !l.data.endsWith("-01")), "os juros vencem no fim do mês, não no dia 1");

  const semDivida = planearObra({ ...base, divida_inicial: 0, funding_pct: 0, recuperar_iva: false }, opts);
  ok(semDivida.linhas.filter(l => l.plano_tipo === "juros").length === 0,
     "sem dívida nenhuma não há juros");
}

console.log("\nComissão de avaliação: uma por libertação");
{
  const { linhas } = planearObra(base, opts);
  ok(linhas.filter(l => l.plano_tipo === "comissao").length === 6, "6 libertações, 6 avaliações");
  ok(perto(soma(linhas, "comissao"), 1800), "300 € × 6");
  const semFunding = planearObra({ ...base, funding_pct: 0 }, opts);
  ok(semFunding.linhas.filter(l => l.plano_tipo === "comissao").length === 0,
     "sem funding não há libertações nem avaliações");
  ok(semFunding.linhas.filter(l => l.plano_tipo === "funding").length === 0,
     "nem entradas do banco");
}

console.log("\nIVA da obra: adiantado pela empresa, volta no dia 25 do apuramento");
{
  const { linhas } = planearObra(base, opts);
  const iva = linhas.filter(l => l.plano_tipo === "iva_obra");
  ok(iva.every(l => l.tipo === "saida"), "o IVA da obra é uma SAÍDA: entrega-se ao Estado");
  const fIva = linhas.filter(l => l.plano_tipo === "funding_iva");
  ok(fIva.every(l => l.tipo === "entrada"), "e o banco financia-o — essa é a entrada");
  ok(fIva.length === iva.length, "uma libertação por cada pagamento de IVA");
  ok(fIva.every((l, i) => l.data === iva[i].data), "na mesma data do pagamento");
  ok(perto(soma(linhas, "funding_iva"), 0.7 * 138000), "a 70% do IVA, como a base");
  // out+nov+dez = 4T26 → data-limite 25/02/2027 ; jan+fev+mar = 1T27 → 25/05/2027
  ok(iva.length === 2, `dois trimestres com obra (deu ${iva.length})`);
  const t4 = iva.find(l => l.data === "2027-02-25");
  const t1 = iva.find(l => l.data === "2027-05-25");
  ok(!!t4, "4T26 recupera-se a 25/02/2027");
  ok(!!t1, "1T27 recupera-se a 25/05/2027");
  ok(perto(t4.valor, 69000), "3 meses × 23 000 € = 69 000 €");
  ok(perto(t1.valor, 69000), "e os outros 3 meses no trimestre seguinte");
  ok(perto(soma(linhas, "iva_obra"), 138000), "o IVA todo volta: 138 000 €");
  ok(perto(soma(linhas, "iva_obra"), 0.23 * soma(linhas, "obra")),
     "e é exatamente 23% da base das faturas de obra");

  const sem = planearObra({ ...base, recuperar_iva: false }, opts);
  ok(sem.linhas.filter(l => l.plano_tipo === "iva_obra").length === iva.length,
     "desligar o financiamento do IVA não faz o IVA desaparecer: continua a pagar-se");
  ok(sem.linhas.filter(l => l.plano_tipo === "funding_iva").length === 0,
     "mas o banco deixa de o financiar");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nEsticar o prazo piora o projeto (o ponto todo do exercício):");
{
  const c = compararPrazos(base, opts, "2027-06-30");
  ok(c.mesesAMais === 3, "três meses a mais");
  ok(perto(c.diferencas.obra, 0), "a obra total NÃO muda: o mesmo budget, mais diluído");
  ok(perto(c.diferencas.iva_obra, 0, 0.05), "nem o IVA, que é 23% da mesma base");
  ok(perto(c.diferencas.fiscalizacao, 3 * 1476 * 1.23), "mas paga-se fiscalização mais 3 meses, com IVA");
  ok(perto(c.diferencas.cso, 3 * 500 * 1.23), "e CSO mais 3 meses, com IVA");
  ok(perto(c.diferencas.comissao, 900), "e mais 3 avaliações");
  ok(c.diferencas.juros > 0, "e mais juros");
  ok(c.custoAMais > 0, `o projeto fica ${Math.round(c.custoAMais)} € pior`);

  const curto = planearObra({ ...base, data_fim: "2026-12-31" }, opts);
  const longo = planearObra({ ...base, data_fim: "2027-06-30" }, opts);
  ok(perto(soma(curto.linhas, "obra"), soma(longo.linhas, "obra")),
     "encurtar ou esticar não muda o custo da obra em si");
  ok(soma(longo.linhas, "juros") > soma(curto.linhas, "juros"),
     "mas o prazo longo paga mais juros");
  ok(curto.linhas.filter(l => l.plano_tipo === "obra")[0].valor >
     longo.linhas.filter(l => l.plano_tipo === "obra")[0].valor,
     "num prazo curto a obra mensal é maior");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nCasos de fronteira:");
{
  const r = planearObra({ ...base, data_fim: "2026-01-31" }, opts);
  ok(r.linhas.length === 0, "obra que já devia ter acabado não gera linhas");
  ok(r.avisos.some(a => /já devia ter terminado/.test(a)), "e avisa porquê");

  const gastoDemais = planearObra(base, { ...opts, gastoObra: 1200000 });
  ok(perto(gastoDemais.resumo.porGastar, 0), "gasto acima do budget: não há obra a prever");
  ok(gastoDemais.linhas.filter(l => l.plano_tipo === "obra").length === 0,
     "sem obra, nenhuma linha de obra");
  ok(gastoDemais.linhas.filter(l => l.plano_tipo === "fiscalizacao").length > 0,
     "mas a fiscalização continua a correr até ao fim da obra");
  ok(gastoDemais.avisos.some(a => /acima/.test(a)), "e avisa que passou o budget");

  ok(planearObra({}, opts).avisos.length > 0, "plano vazio avisa em vez de rebentar");
  ok(planearObra(null, opts).linhas.length === 0, "nulo não rebenta");

  const umMes = planearObra({ ...base, data_fim: "2026-10-31" }, opts);
  ok(umMes.resumo.meses === 1, "obra que acaba este mês tem 1 mês");
  ok(perto(soma(umMes.linhas, "obra"), 600000), "e leva o que falta todo de uma vez");

  const futura = planearObra({ ...base, data_inicio: "2027-01-01", data_fim: "2027-06-30" },
                             { ...opts, gastoObra: 0 });
  ok(futura.resumo.primeiroMes === "2027-01", "obra que ainda não começou arranca na data de início");
  ok(futura.resumo.meses === 6, "e conta os seus 6 meses");
}

console.log("\nPlano de contas por grupo:");
{
  const lpx = planearObra(base, opts);
  const hdg = planearObra({ ...base, empresa: "adseq" }, { ...opts, grupo: "HDG" });
  ok(lpx.linhas.find(l => l.plano_tipo === "obra").categoria === "Obra", "LPX: Obra");
  ok(hdg.linhas.find(l => l.plano_tipo === "obra").categoria === "Obras", "HDG: Obras");
  ok(hdg.linhas.find(l => l.plano_tipo === "obra").subcategoria === "Gastos com Obras",
     "HDG leva subcategoria");
  ok(hdg.linhas.find(l => l.plano_tipo === "cso").subcategoria === "CSO", "HDG: CSO em Soft_Costs");
  ok(lpx.linhas.find(l => l.plano_tipo === "juros").categoria === "Juros", "LPX: Juros");
  ok(hdg.linhas.find(l => l.plano_tipo === "juros").subcategoria === "Outflow - Juros",
     "HDG: Outflow - Juros");
  ok(categoriasDoMotor("LPX").length >= 5, "as categorias que o motor toma conta (LPX)");
  ok(!categoriasDoMotor("LPX").includes("Salários"), "e não toca em categorias alheias");
  ok(classificacaoDe("obra", "HDG").categoria === "Obras", "classificação direta");
}

console.log("\nQue projetos têm obra:");
["favcloset", "simplify", "genero", "adseq", "infinite"].forEach(e =>
  ok(temObra(e), `${e} tem obra`));
["pearl", "lpx", "fluffy", "enchanted"].forEach(e =>
  ok(!temObra(e), `${e} não tem obra`));


console.log("\nSugerir a avença pela média das faturas:");
{
  const fs = [
    { empresa:"favcloset", categoria:"Fiscalização", valor:1476, data_fatura:"2026-07-10", status:"Pago" },
    { empresa:"favcloset", categoria:"Fiscalização", valor:1476, data_fatura:"2026-08-10", status:"Pago" },
    // dois documentos no mesmo mês contam como um mês, não como dois
    { empresa:"favcloset", categoria:"Fiscalização", valor:1000, data_fatura:"2026-09-10", status:"Pago" },
    { empresa:"favcloset", categoria:"Fiscalização", valor:476,  data_fatura:"2026-09-20", status:"Pago" },
    { empresa:"simplify",  categoria:"Fiscalização", valor:9999, data_fatura:"2026-09-10", status:"Pago" },
    { empresa:"favcloset", categoria:"Fiscalização", valor:5000, data_fatura:"2026-09-25", status:"Anulada" },
  ];
  const s1 = sugerirAvenca(fs, { empresa:"favcloset", categorias:["Fiscalização"] });
  ok(s1 && s1.meses === 3, `três meses com fatura (deu ${s1 && s1.meses})`);
  ok(s1 && perto(s1.valor, 1476), `média 1 476 €/mês (deu ${s1 && s1.valor})`);
  ok(sugerirAvenca(fs, { empresa:"genero", categorias:["Fiscalização"] }) === null,
     "sem faturas não inventa uma sugestão");
  ok(sugerirAvenca(null, { empresa:"x", categorias:["a"] }) === null, "nulo não rebenta");
}

console.log("\nSaber que o plano ficou para trás:");
{
  const pl = { calculado_em:"2026-10-01T10:00:00Z", gasto_no_calculo: 400000 };
  ok(planoDesatualizado(pl, 400000) === false, "sem faturas novas, está em dia");
  ok(planoDesatualizado(pl, 450000) === true, "entrou fatura de obra: fica desatualizado");
  ok(planoDesatualizado(pl, 399000) === true, "uma fatura anulada também o desatualiza");
  ok(planoDesatualizado({}, 1000) === false, "plano nunca calculado não se diz desatualizado");
  ok(planoDesatualizado(null, 1000) === false, "nulo não rebenta");
  ok(planoDesatualizado({ calculado_em:"2026-10-01T10:00:00Z" }, 1) === true,
     "calculado sem registo do gasto: por segurança, recalcular");
}


// ─────────────────────────────────────────────────────────────────────────────
// Aplicar ao Fluxo Futuro — a parte que apaga coisas
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nAplicar: o que entra, o que sai, o que nunca se toca");
{
  const { linhas } = planearObra(base, opts);
  const existentes = [
    // previsões manuais do utilizador, nas categorias do motor → saem
    { id:"m1", empresa:"favcloset", categoria:"Obra",          valor:134811, data_inicio:"2026-11-15", status:"Pendente" },
    { id:"m2", empresa:"favcloset", categoria:"Fiscalização",  valor:1476,   data_inicio:"2026-12-11", status:"Pendente" },
    // categoria alheia → fica
    { id:"m3", empresa:"favcloset", categoria:"Salários",      valor:5000,   data_inicio:"2026-11-01", status:"Pendente" },
    // já paga → fica, mesmo sendo de uma categoria do motor
    { id:"m4", empresa:"favcloset", categoria:"Obra",          valor:9999,   data_inicio:"2026-11-01", status:"Paga" },
    // convertida em fatura → fica
    { id:"m5", empresa:"favcloset", categoria:"Obra",          valor:8888,   data_inicio:"2026-12-01", status:"Convertida" },
    // passado, antes do plano → fica
    { id:"m6", empresa:"favcloset", categoria:"Obra",          valor:7777,   data_inicio:"2026-08-01", status:"Pendente" },
    // outra empresa → nunca
    { id:"x1", empresa:"simplify",  categoria:"Obra",          valor:50000,  data_inicio:"2026-11-01", status:"Pendente" },
    // linha de um recálculo anterior → sai
    { id:"g1", empresa:"favcloset", categoria:"Obra", valor:123000, data_inicio:"2026-11-01",
      status:"Pendente", plano_obra:"favcloset", plano_tipo:"obra" },
  ];
  const a = planearAplicacao({ linhas, pagamentosExistentes: existentes,
                               empresa:"favcloset", grupo:"LPX",
                               primeiroMes:"2026-10", hoje:"2026-10-12" });

  const ids = (arr) => arr.map(p => p.id).sort().join(",");
  ok(ids(a.aApagarManuais) === "m1,m2", `só as manuais das categorias do motor saem (saíram ${ids(a.aApagarManuais)})`);
  ok(ids(a.aApagarDoMotor) === "g1", "e a linha do recálculo anterior");
  ok(!a.idsAApagar.includes("m3"), "Salários nunca é tocado");
  ok(!a.idsAApagar.includes("m4"), "uma previsão já paga nunca é apagada");
  ok(!a.idsAApagar.includes("m5"), "nem uma já convertida em fatura");
  ok(!a.idsAApagar.includes("m6"), "nem o passado anterior ao plano");
  ok(!a.idsAApagar.includes("x1"), "nem nada de outra empresa");
  ok(a.resumo.protegidas === 2, "conta as que ficaram protegidas por já estarem pagas/convertidas");

  ok(a.aCriar.length === linhas.length, "cria uma previsão por linha do plano");
  ok(a.aCriar.every(p => p.plano_obra === "favcloset" && p.plano_tipo),
     "todas levam as duas marcas — a constraint da base de dados exige-o");
  ok(a.aCriar.every(p => p.parcelas === 1 && p.periodicidade === "unica"),
     "cada mês é uma linha própria, não uma série de parcelas");
  ok(a.aCriar.every(p => p.status === "Pendente"), "entram como pendentes");
  const obraCriada = a.aCriar.filter(p => p.plano_tipo === "obra");
  ok(obraCriada.every(p => p.funding === false),
     "a obra entra sem a marca de funding — a entrada do banco é linha própria");
  ok(a.aCriar.filter(p => p.plano_tipo === "funding").every(p => p.tipo === "entrada"),
     "e as libertações do banco entram como entradas");
  ok(a.aCriar.find(p => p.plano_tipo === "iva_obra").tipo === "saida",
     "o pagamento de IVA entra como saída");
  ok(a.aCriar.find(p => p.plano_tipo === "funding_iva").tipo === "entrada",
     "e o funding desse IVA como entrada");

  // Ids determinísticos: correr duas vezes dá o mesmo
  const b = planearAplicacao({ linhas, pagamentosExistentes: existentes,
                               empresa:"favcloset", grupo:"LPX",
                               primeiroMes:"2026-10", hoje:"2026-10-12" });
  ok(ids(a.aCriar) === ids(b.aCriar), "os ids são determinísticos: aplicar duas vezes não duplica");
  ok(new Set(a.aCriar.map(p => p.id)).size === a.aCriar.length, "e não há dois ids iguais");

  // Depois de aplicado, um segundo recálculo apanha as suas próprias linhas
  const depois = [...existentes.filter(p => !a.idsAApagar.includes(p.id)), ...a.aCriar];
  const c = planearAplicacao({ linhas, pagamentosExistentes: depois,
                               empresa:"favcloset", grupo:"LPX",
                               primeiroMes:"2026-10", hoje:"2026-10-12" });
  ok(c.aApagarDoMotor.length === a.aCriar.length,
     "o recálculo seguinte apaga exatamente as linhas que este criou");
  ok(c.aApagarManuais.length === 0, "e já não há manuais para apagar");
}

console.log("\nAplicar num projeto HDG:");
{
  const { linhas } = planearObra({ ...base, empresa:"adseq" }, { ...opts, grupo:"HDG" });
  const existentes = [
    { id:"h1", empresa:"adseq", categoria:"Obras",      valor:1000, data_inicio:"2026-11-01", status:"Pendente" },
    { id:"h2", empresa:"adseq", categoria:"Soft_Costs", valor:500,  data_inicio:"2026-11-01", status:"Pendente" },
    { id:"h3", empresa:"adseq", categoria:"Sócios",     valor:900,  data_inicio:"2026-11-01", status:"Pendente" },
  ];
  const a = planearAplicacao({ linhas, pagamentosExistentes: existentes, empresa:"adseq",
                               grupo:"HDG", primeiroMes:"2026-10", hoje:"2026-10-12" });
  ok(a.idsAApagar.includes("h1") && a.idsAApagar.includes("h2"),
     "no HDG apaga as categorias do plano HDG");
  ok(!a.idsAApagar.includes("h3"), "e não toca em Sócios");
  ok(a.aCriar.find(p => p.plano_tipo === "cso").subcategoria === "CSO",
     "as linhas criadas levam subcategoria");
}

console.log("\nAplicar sem nada para apagar:");
{
  const { linhas } = planearObra(base, opts);
  const a = planearAplicacao({ linhas, pagamentosExistentes: [], empresa:"favcloset",
                               primeiroMes:"2026-10", hoje:"2026-10-12" });
  ok(a.idsAApagar.length === 0, "fluxo vazio: não há nada a apagar");
  ok(a.aCriar.length > 0, "mas cria à mesma");
  const z = planearAplicacao({});
  ok(z.aCriar.length === 0 && z.idsAApagar.length === 0, "chamada vazia não rebenta");
}


console.log("\nRepartir sem perder cêntimos:");
{
  const soma3 = (a) => Math.round(a.reduce((s, v) => s + v, 0) * 100) / 100;
  ok(soma3(repartir(600000, 9)) === 600000, "600 000 por 9 meses fecha exatamente");
  ok(soma3(repartir(100, 3)) === 100, "100 por 3 fecha exatamente");
  ok(repartir(100, 3)[2] !== repartir(100, 3)[0], "a sobra fica no último mês");
  ok(soma3(repartir(1234.56, 7)) === 1234.56, "um valor feio também fecha");
  ok(repartir(0, 5).every(v => v === 0), "zero reparte-se em zeros");
  ok(repartir(100, 0).length === 0, "zero meses não rebenta");
  ok(repartir(null, 3).every(v => v === 0), "nulo não rebenta");
  // E no plano: a soma das linhas de obra é o budget por gastar, ao cêntimo
  [1, 2, 3, 5, 7, 9, 13].forEach(n => {
    const fim = `2027-${String(((9 + n - 1) % 12) + 1).padStart(2, "0")}-28`;
    const ano = 2026 + Math.floor((9 + n - 1) / 12);
    const r = planearObra({ ...base, data_fim: `${ano}-${fim.slice(5)}` }, opts);
    if (r.resumo.meses > 0)
      ok(Math.abs(soma(r.linhas, "obra") - 600000) < 0.005,
         `${r.resumo.meses} meses: a obra soma 600 000,00 € ao cêntimo`);
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Avenças com IVA
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nFiscalização e CSO levam IVA (não há inversão nestes serviços):");
{
  const { linhas } = planearObra(base, opts);
  const fisc = linhas.filter(l => l.plano_tipo === "fiscalizacao");
  const cso  = linhas.filter(l => l.plano_tipo === "cso");
  ok(perto(fisc[0].valor, 1476 * 1.23), `1 476 € + 23% = 1 815,48 € (deu ${fisc[0].valor})`);
  ok(perto(fisc[0].base, 1476), "a avença fica registada como base");
  ok(perto(fisc[0].iva, 339.48), "e o IVA à parte, na mesma linha");
  ok(perto(cso[0].valor, 500 * 1.23), "o CSO também: 500 € + 23% = 615 €");
  ok(perto(soma(linhas, "fiscalizacao"), 6 * 1815.48), "seis meses de fiscalização com IVA");

  const a6 = planearObra({ ...base, taxa_iva_servicos: 6 }, opts);
  ok(perto(a6.linhas.find(l => l.plano_tipo === "fiscalizacao").valor, 1476 * 1.06),
     "a taxa dos serviços é independente da taxa da obra");
  const sem = planearObra({ ...base, taxa_iva_servicos: 0 }, opts);
  ok(perto(sem.linhas.find(l => l.plano_tipo === "fiscalizacao").valor, 1476),
     "a 0% volta a ser a avença limpa");
  // O IVA dos serviços NÃO entra no apuramento trimestral: é pago com a fatura
  ok(perto(soma(linhas, "iva_obra"), 0.23 * soma(linhas, "obra")),
     "o IVA do dia 25 continua a ser só o da empreitada");
}

// ─────────────────────────────────────────────────────────────────────────────
// O que o ERP já sabe de uma obra a decorrer
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nObra já iniciada: o sistema vai buscar em vez de perguntar");
{
  const faturas = [
    { empresa:"favcloset", categoria:"Obra", valor_base:100000, valor:123000, status:"Paga",     data_fatura:"2026-07-15" },
    { empresa:"favcloset", categoria:"obra", valor_base:150000, valor:184500, status:"Paga",     data_fatura:"2026-08-15" },
    { empresa:"favcloset", categoria:"Obra", valor_base: 80000, valor: 98400, status:"Pendente", data_fatura:"2026-09-15" },
    { empresa:"favcloset", categoria:"Obra", valor_base: 50000, valor: 61500, status:"Anulada",  data_fatura:"2026-09-20" },
    { empresa:"favcloset", categoria:"Salários", valor_base:9000, valor:9000, status:"Paga",     data_fatura:"2026-07-01" },
    { empresa:"simplify",  categoria:"Obra", valor_base:999999, valor:999999, status:"Paga",     data_fatura:"2026-06-01" },
  ];
  const movimentos = [
    { data:"2026-07-20", categoria:"Obra",          valor:-123000 },
    { data:"2026-08-20", categoria:"obra",          valor:-184500 },
    { data:"2026-07-05", categoria:"Funding banco", valor: 250000 },
    { data:"2026-08-05", categoria:"Funding banco", valor: 150000 },
    { data:"2026-08-07", categoria:"Funding banco", valor: -5000 },   // devolução: não é libertação
    { data:"2026-09-01", categoria:"Aporte SPV",    valor: 80000 },   // não é funding
  ];
  const r = obraRealizada(movimentos, faturas, { empresa:"favcloset", categorias:["Obra"], taxaIva:23 });
  ok(perto(r.faturado, 330000), `incorrido = 100k + 150k + 80k = 330 000 € (deu ${r.faturado})`);
  ok(perto(r.faturadoPago, 250000), "já pago em faturas = 250 000 €");
  ok(perto(r.porPagar, 80000), "por pagar = 80 000 €");
  ok(perto(r.pagoExtrato, 307500), "saiu da conta 307 500 € (com IVA, como no extrato)");
  ok(r.primeiroGasto === "2026-07-15", "o primeiro gasto de obra é de 15/07/2026");
  ok(r.nFaturas === 3, "três faturas de obra válidas");
  ok(r.jaIncorrido === r.faturado, "o budget é consumido pelo incorrido, não pelo pago");

  // categoria alheia e outra empresa ficam de fora
  ok(!perto(r.faturado, 339000), "Salários não conta");
  ok(r.faturado < 999999, "e a obra da simplify não entra aqui");

  const f = fundingLibertado(movimentos, { categorias:["Funding banco"] });
  ok(perto(f.total, 400000), `o banco já libertou 400 000 € (deu ${f.total})`);
  ok(f.n === 2, "duas libertações");
  ok(f.ultimo === "2026-08-05", "a última a 05/08/2026");

  // Sem extrato nenhum continua a funcionar pelas faturas
  const semExtrato = obraRealizada([], faturas, { empresa:"favcloset", categorias:["Obra"] });
  ok(perto(semExtrato.faturado, 330000), "sem extrato, o incorrido sai à mesma das faturas");
  ok(semExtrato.pagoExtrato === 0, "e o pago fica a zero");
  ok(semExtrato.primeiroGasto === "2026-07-15", "a data de início também");
  ok(fundingLibertado([], { categorias:["Funding banco"] }).total === 0, "sem extrato não há funding");
  ok(obraRealizada(null, null, {}).faturado === 0, "nulos não rebentam");

  // Uma obra já iniciada entra no plano com o budget certo
  const plano = planearObra({ ...base, budget_obra: 1000000, data_inicio: r.primeiroGasto },
                            { gastoObra: r.jaIncorrido, hoje:"2026-10-12", grupo:"LPX" });
  ok(perto(plano.resumo.gasto, 330000), "o plano arranca com 330 000 € já incorridos");
  ok(perto(plano.resumo.porGastar, 670000), "e 670 000 € por gastar");
}

console.log("\nHDG: o funding tem subcategoria própria");
{
  const movs = [
    { data:"2026-07-05", categoria:"Financiamento", subcategoria:"Inflow - Obra",    valor: 200000 },
    { data:"2026-07-06", categoria:"Financiamento", subcategoria:"Inflow - Terreno", valor: 500000 },
    { data:"2026-07-07", categoria:"Financiamento", subcategoria:"Outflow - Juros",  valor: -1000 },
  ];
  const so = fundingLibertado(movs, { categorias:["Financiamento"], subcategorias:["Inflow - Obra"] });
  ok(perto(so.total, 200000), "só o Inflow - Obra conta quando se filtra por subcategoria");
  const tudo = fundingLibertado(movs, { categorias:["Financiamento"] });
  ok(perto(tudo.total, 700000), "sem filtro de subcategoria, conta todo o financiamento entrado");
}

console.log(mau === 0 ? "\n✅ Plano de obra OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
