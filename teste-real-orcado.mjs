// Real × Orçado: o orçado é estático, o real vem do extrato e o forecast
// mexe-se sozinho com o fluxo futuro, o plano de obra e as recorrentes.
//   node teste-real-orcado.mjs
import { calcularRealOrcado, semearDoModelo, id_orcamento } from "./src/realOrcado.js";
import { rubricasDa } from "./src/rubricas.js";
import { MODELO_REAL_ORCADO } from "./src/modeloRealOrcado.js";

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };
const perto = (a, b, t = 0.011) => Math.abs(a - b) < t;
const linha = (r, nome) => r.linhas.find(l => l.rubrica === nome);

const HOJE = "2026-10-13";
const base = { empresaId: "favcloset", hoje: HOJE };

console.log("As linhas são as rubricas da empresa:");
{
  const r = calcularRealOrcado(base);
  ok(r.linhas.length === rubricasDa("favcloset").length,
     `uma linha por rubrica do plano (${r.linhas.length})`);
  ok(!!linha(r, "Obra") && !!linha(r, "Vendas"), "as rubricas certas lá estão");
  ok(r.linhas.every(l => l.vazia), "sem dados, estão todas vazias");
  ok(r.nOrcadas === 0 && r.nComMovimento === 0, "e o ecrã sabe que não há nada ainda");
  ok(calcularRealOrcado({}).linhas.length > 0, "sem empresa cai no plano geral, não rebenta");
}

console.log("\nO orçado é estático e vem da base:");
{
  const r = calcularRealOrcado({ ...base, orcamento: [
    { empresa_id: "favcloset", categoria: "Obra", orcado: 1300000 },
    { empresa_id: "favcloset", categoria: "Vendas", orcado: 2400000 },
    { empresa_id: "favcloset", categoria: "obra", orcado: 99 },        // mesma rubrica, ignorada? não: sobrepõe
    { empresa_id: "outra", categoria: "Obra", orcado: 777 },           // outra empresa
  ]});
  ok(perto(linha(r, "Vendas").orcado, 2400000), "o orçado das vendas entra");
  ok(!perto(linha(r, "Obra").orcado, 777), "o orçado de outra empresa não entra");
  ok(r.nOrcadas === 2, "duas rubricas orçadas");
  // sem movimentos, uma rubrica orçada não é vazia: é precisamente a que interessa
  ok(linha(r, "Obra").vazia === false, "uma rubrica orçada e por gastar aparece à mesma");
  ok(linha(r, "Obra").lado === "saida", "e assume-se saída enquanto não houver dados");
  ok(linha(r, "Obra").desvio < 0, "com desvio negativo: ainda falta gastar o orçamento todo");

  const negativo = calcularRealOrcado({ ...base, orcamento: [
    { empresa_id: "favcloset", categoria: "Obra", orcado: -1300000 }]});
  ok(perto(negativo.linhas.find(l => l.rubrica === "Obra").orcado, 1300000),
     "o orçado guarda-se sem sinal, escreva-se como se escrever");
}

console.log("\nO real vem do extrato, pela vida toda do projeto:");
{
  const movimentos = [
    { categoria: "Obra", valor: -300000, data: "2024-05-10" },
    { categoria: "obra", valor: -200000, data: "2025-02-10" },
    { categoria: "Obra", valor: 5000, data: "2025-03-10" },     // nota de crédito
    { categoria: "Vendas", valor: 900000, data: "2026-01-10" },
    { categoria: "Ajustes do grupo", valor: 10000, data: "2026-02-10" },   // fora do fluxo
  ];
  const r = calcularRealOrcado({ ...base, movimentos, orcamento: [
    { empresa_id: "favcloset", categoria: "Obra", orcado: 1300000 },
    { empresa_id: "favcloset", categoria: "Vendas", orcado: 2400000 },
  ]});
  const obra = linha(r, "Obra"), vendas = linha(r, "Vendas");
  ok(perto(obra.real, -495000), `obra real: −495 000 € (deu ${obra.real})`);
  ok(perto(obra.realAbs, 495000), "mostrado em módulo");
  ok(obra.detalhe.nMovimentos === 3, "três movimentos de obra, com as duas grafias");
  ok(obra.lado === "saida" && vendas.lado === "entrada", "cada rubrica no seu lado");
  ok(perto(vendas.real, 900000), "vendas: 900 000 €");
  ok(!r.linhas.some(l => /Ajustes do grupo/.test(l.rubrica)),
     "um ajuste fora do plano não cria rubrica");

  // Sem nada comprometido, o forecast é o real
  ok(perto(obra.forecast, obra.real), "sem compromissos, o forecast é o real");
  ok(perto(obra.desvio, 495000 - 1300000), "e o desvio é face ao orçado");
  ok(perto(obra.desvioPct, (495000 - 1300000) / 1300000 * 100), "em percentagem também");
  ok(obra.bom === true, "gastar menos do que o orçado é bom numa saída");
  ok(vendas.bom === false, "vender menos do que o orçado é mau numa entrada");
}

console.log("\nO forecast mexe-se com o que está comprometido:");
{
  const movimentos = [{ categoria: "Obra", valor: -495000 }];
  const orcamento = [{ empresa_id: "favcloset", categoria: "Obra", orcado: 1300000 }];

  const so = calcularRealOrcado({ ...base, movimentos, orcamento });
  ok(perto(linha(so, "Obra").forecast, -495000), "ponto de partida: forecast = real");

  // 1. uma fatura por pagar
  const comFatura = calcularRealOrcado({ ...base, movimentos, orcamento, faturas: [
    { empresa: "favcloset", categoria: "Obra", valor: 80000, status: "Pendente" },
    { empresa: "favcloset", categoria: "Obra", valor: 50000, status: "Paga" },      // já no extrato
    { empresa: "favcloset", categoria: "Obra", valor: 99999, status: "Anulada" },   // não conta
    { empresa: "outra",     categoria: "Obra", valor: 70000, status: "Pendente" },  // outra empresa
  ]});
  const f = linha(comFatura, "Obra");
  ok(perto(f.forecast, -575000), `uma fatura por pagar de 80 000 entra no forecast (deu ${f.forecast})`);
  ok(perto(f.real, -495000), "e não mexe no real");
  ok(f.detalhe.nFaturas === 1, "só a pendente conta");

  // 2. uma previsão do Fluxo Futuro (é por aqui que entra o plano de obra)
  const comPrevisao = calcularRealOrcado({ ...base, movimentos, orcamento, pagamentos: [
    { empresa: "favcloset", categoria: "Obra", valor: 120000, tipo: "saida", status: "Pendente" },
    { empresa: "favcloset", categoria: "Obra", valor: 30000, tipo: "saida", status: "Convertida" },
    { empresa: "favcloset", categoria: "Funding", valor: 90000, tipo: "entrada", status: "Pendente" },
  ]});
  ok(perto(linha(comPrevisao, "Obra").forecast, -615000), "a previsão pendente entra");
  ok(perto(linha(comPrevisao, "Funding").forecast, 90000), "e uma entrada prevista também");
  ok(linha(comPrevisao, "Funding").lado === "entrada", "do lado certo");

  // 3. uma despesa recorrente
  const comRecorrente = calcularRealOrcado({ ...base, movimentos, orcamento, recorrentes: [
    { empresa: "favcloset", categoria: "Administrativos", descricao: "Contabilidade",
      valor: 150, tipo: "saida", periodicidade: "mensal", ativa: true,
      data_inicio: "2026-11-10", data_fim: "2027-04-10" },
    { empresa: "favcloset", categoria: "Administrativos", descricao: "Parada",
      valor: 999, tipo: "saida", periodicidade: "mensal", ativa: false,
      data_inicio: "2026-11-10", data_fim: "2027-04-10" },
  ]});
  const adm = linha(comRecorrente, "Administrativos");
  ok(perto(adm.forecast, -900), `6 × 150 € de recorrente entram no forecast (deu ${adm.forecast})`);
  ok(adm.detalhe.nRecorrentes === 6, "seis ocorrências");
  ok(perto(adm.real, 0), "e nada no real: ainda não aconteceram");
  ok(!perto(adm.forecast, -900 - 5994), "uma regra desligada não conta");

  // 4. tudo junto, e a conta fecha
  const tudo = calcularRealOrcado({ ...base, movimentos, orcamento,
    faturas: [{ empresa: "favcloset", categoria: "Obra", valor: 80000, status: "Pendente" }],
    pagamentos: [{ empresa: "favcloset", categoria: "Obra", valor: 120000, tipo: "saida", status: "Pendente" }],
    recorrentes: [{ empresa: "favcloset", categoria: "Obra", descricao: "Avença",
      valor: 1000, tipo: "saida", periodicidade: "mensal", ativa: true,
      data_inicio: "2026-11-10", data_fim: "2027-01-10" }],
  });
  const t = linha(tudo, "Obra");
  ok(perto(t.comprometido, -(80000 + 120000 + 3000)), "o comprometido soma as três origens");
  ok(perto(t.forecast, t.real + t.comprometido), "e o forecast é o real mais o comprometido");
  ok(perto(t.forecastAbs, 698000), `forecast da obra: 698 000 € (deu ${t.forecastAbs})`);
  ok(perto(t.desvio, 698000 - 1300000), "ainda abaixo do orçado");
  ok(t.detalhe.faturasPorPagar === -80000 && t.detalhe.previsoes === -120000 &&
     t.detalhe.recorrentes === -3000, "e o detalhe diz de onde veio cada parcela");
}

console.log("\nO orçado NÃO se mexe com nada disto:");
{
  const orcamento = [{ empresa_id: "favcloset", categoria: "Obra", orcado: 1300000 }];
  const semNada = calcularRealOrcado({ ...base, orcamento });
  const comTudo = calcularRealOrcado({ ...base, orcamento,
    movimentos: [{ categoria: "Obra", valor: -900000 }],
    faturas: [{ empresa: "favcloset", categoria: "Obra", valor: 400000, status: "Pendente" }],
    pagamentos: [{ empresa: "favcloset", categoria: "Obra", valor: 200000, tipo: "saida", status: "Pendente" }],
  });
  ok(perto(linha(semNada, "Obra").orcado, linha(comTudo, "Obra").orcado),
     "o orçado é o mesmo com ou sem movimento: é estático, como tem de ser");
  ok(linha(comTudo, "Obra").forecastAbs > linha(semNada, "Obra").forecastAbs,
     "mas o forecast cresceu");
  ok(linha(comTudo, "Obra").desvio > 0 && linha(comTudo, "Obra").bom === false,
     "e passou o orçamento: 1 500 000 contra 1 300 000");
}

console.log("\nTotais e resultado:");
{
  const r = calcularRealOrcado({ ...base,
    orcamento: [
      { empresa_id: "favcloset", categoria: "Vendas", orcado: 2400000 },
      { empresa_id: "favcloset", categoria: "Obra", orcado: 1300000 },
      { empresa_id: "favcloset", categoria: "Comissão", orcado: 100000 },
    ],
    movimentos: [
      { categoria: "Vendas", valor: 900000 },
      { categoria: "Obra", valor: -495000 },
      { categoria: "Comissão", valor: -40000 },
    ]});
  ok(perto(r.totais.entradas.orcado, 2400000), "o orçado das entradas soma");
  ok(perto(r.totais.saidas.orcado, 1400000), "e o das saídas também");
  ok(perto(r.totais.resultado.orcado, 1000000), "o resultado orçado é a diferença");
  ok(perto(r.totais.entradas.real, 900000) && perto(r.totais.saidas.real, 535000),
     "o real soma em módulo de cada lado");
  ok(perto(r.totais.resultado.real, 365000), "e o resultado real é 900 000 − 535 000");
  ok(perto(r.totais.resultado.forecast, r.totais.resultado.real),
     "sem compromissos, o resultado do forecast é o real");
}

console.log("\nUma rubrica fora do plano aparece, marcada:");
{
  const r = calcularRealOrcado({ ...base,
    movimentos: [{ categoria: "Rubrica Fantasma", valor: -777 }] });
  const fantasma = linha(r, "Rubrica Fantasma");
  ok(!!fantasma, "a rubrica fora do plano ganha linha");
  ok(fantasma.noPlano === false, "marcada como fora do plano");
  ok(perto(fantasma.real, -777), "com o valor certo");
  ok(r.linhas.filter(l => l.noPlano).length === rubricasDa("favcloset").length,
     "e as do plano continuam todas lá");
}

console.log("\nA tabela é da operação: de Vendas para baixo");
{
  const r = calcularRealOrcado({ ...base, movimentos: [
    { categoria: "Aporte Big Mouse", valor: 160000 },
    { categoria: "Mútuo Rio Capital", valor: 48000 },
    { categoria: "Resgate Findmore", valor: -11000 },
    { categoria: "Funding", valor: 800000 },
    { categoria: "Amortização", valor: -120000 },
    { categoria: "Vendas", valor: 430000 },
    { categoria: "Obra", valor: -300000 },
    { categoria: "Comissão", valor: -21500 },
  ]});

  const nomes = r.operacao.map(l => l.rubrica);
  ok(nomes[0] === "Vendas", `a operação abre nas vendas (abriu em "${nomes[0]}")`);
  ok(!nomes.some(n => /^(Aporte|Resgate|Mútuo)/.test(n)), "sem aportes, resgates nem mútuos");
  ok(!nomes.includes("Funding") && !nomes.includes("Amortização"),
     "sem funding nem amortização");
  ok(nomes.includes("Obra") && nomes.includes("Comissão"), "mas com a operação toda");

  const capital = r.capital.filter(l => !l.vazia).map(l => l.rubrica);
  ok(capital.includes("Aporte Big Mouse") && capital.includes("Funding"),
     "o capital não se perde: fica à parte");
  ok(r.nCapital === 5, `cinco rubricas de capital com movimento (deu ${r.nCapital})`);
  ok(r.operacao.length + r.capital.length === r.linhas.length,
     "e as duas metades dão o plano inteiro");

  // Os totais e o resultado são SÓ da operação
  ok(perto(r.totais.entradas.real, 430000), "as entradas são só as vendas");
  ok(perto(r.totais.saidas.real, 321500), "as saídas são a obra e a comissão");
  ok(perto(r.totais.resultado.real, 108500), "e o resultado é da operação, sem o capital");
  ok(perto(r.totaisCapital.real, 160000 + 48000 + 11000 + 800000 + 120000),
     "o capital tem o seu próprio total");

  // As linhas saem pela ordem do plano, não por ordem de aparecimento
  const plano = rubricasDa("favcloset");
  const pos = r.operacao.map(l => plano.indexOf(l.rubrica)).filter(i => i >= 0);
  ok(pos.every((x, i) => i === 0 || x > pos[i - 1]), "pela ordem do Excel");

  // Uma empresa sem "Vendas" no plano não fica sem tabela
  const semVendas = calcularRealOrcado({ empresaId: "blessed", hoje: HOJE,
    movimentos: [{ categoria: "Administrativos", valor: -5000 }] });
  ok(semVendas.operacao.length > 0, "uma empresa sem rubrica Vendas tem operação à mesma");
}

console.log("\nSemear o orçado a partir do modelo antigo:");
{
  const s = semearDoModelo(MODELO_REAL_ORCADO.favcloset, "favcloset");
  ok(s.length > 5, `aproveitam-se ${s.length} rubricas do business plan da Favorite Closet`);
  ok(s.every(x => rubricasDa("favcloset").includes(x.rubrica)), "todas são rubricas do plano");
  ok(s.every(x => x.orcado > 0), "e todas com valor positivo");
  const vendas = s.find(x => x.rubrica === "Vendas");
  ok(!!vendas && vendas.orcado > 0, "as vendas vêm com o número do business plan");

  // Nas HDG os rótulos do modelo são subcategorias: quase nada bate, e isso
  // tem de se ver em vez de se inventar.
  const hdg = semearDoModelo(MODELO_REAL_ORCADO.adseq, "adseq");
  ok(hdg.length < 5, `na Admirable Sequence quase nada bate (${hdg.length}) — fica por preencher`);
  ok(semearDoModelo(null, "favcloset").length === 0, "nulo não rebenta");
}

console.log("\nA chave do orçado é estável:");
{
  const a = id_orcamento("favcloset", "Impostos e taxas");
  const b = id_orcamento("favcloset", "Impostos e Taxas");
  ok(a === b, "duas grafias da mesma rubrica dão a mesma chave — não se grava duas vezes");
  ok(/^orc_favcloset_/.test(a), `a chave diz a empresa: ${a}`);
  ok(!/[^a-z0-9_]/.test(a), "e não leva acentos nem espaços");
  ok(id_orcamento("favcloset", "Obra") !== id_orcamento("simplify", "Obra"),
     "a mesma rubrica em empresas diferentes tem chaves diferentes");
}

console.log(mau === 0 ? "\n✅ Real × Orçado OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
