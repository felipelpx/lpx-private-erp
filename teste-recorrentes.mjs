// As despesas recorrentes: a regra expande-se nas datas certas, pára na data
// de fim, e o fim de mês não salta para o mês seguinte.
//   node teste-recorrentes.mjs
import { ocorrenciasDe, resumoDaRegra, validarRegra, somarMesesData,
         MESES_DE, rotuloPeriodicidade, PERIODICIDADES } from "./src/recorrentes.js";

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };
const perto = (a, b, t = 0.005) => Math.abs(a - b) < t;

const base = {
  id: "r1", empresa: "favcloset", tipo: "saida", descricao: "Contabilidade",
  categoria: "Administrativos", valor: 150, data_inicio: "2026-01-10",
  data_fim: "2026-12-10", periodicidade: "mensal", ativa: true,
};

console.log("Somar meses sem a armadilha do fim do mês:");
{
  ok(somarMesesData("2026-01-31", 1) === "2026-02-28", "31 de janeiro + 1 mês é 28 de fevereiro");
  ok(somarMesesData("2028-01-31", 1) === "2028-02-29", "e 29 num ano bissexto");
  ok(somarMesesData("2026-01-31", 3) === "2026-04-30", "31 + 3 meses cai a 30 de abril");
  ok(somarMesesData("2026-03-31", 1) === "2026-04-30", "31 de março + 1 é 30 de abril, não 1 de maio");
  ok(somarMesesData("2026-12-15", 1) === "2027-01-15", "dezembro + 1 vira o ano");
  ok(somarMesesData("2026-01-15", 12) === "2027-01-15", "e doze meses dão o ano seguinte");
  ok(somarMesesData("2026-01-15", 0) === "2026-01-15", "mais zero é o próprio dia");
  ok(somarMesesData("2026-06-15", -1) === "2026-05-15", "e sabe andar para trás");
}

console.log("\nA regra expande-se até à data de fim:");
{
  const oc = ocorrenciasDe(base, { de: "2026-01-01", ate: "2030-12-31" });
  ok(oc.length === 12, `de janeiro a dezembro são 12 ocorrências (deu ${oc.length})`);
  ok(oc[0].data === "2026-01-10", "a primeira é na data de início");
  ok(oc[11].data === "2026-12-10", "e a última na data de fim");
  ok(oc.every(o => perto(o.valor, 150)), "todas pelo mesmo valor");
  ok(perto(oc.reduce((s, o) => s + o.valor, 0), 1800), "1 800 € no total do ano");
  ok(oc.every((o, i) => i === 0 || o.data > oc[i - 1].data), "por ordem cronológica");

  // Encurtar a data de fim pára a despesa — num sítio só
  const parada = ocorrenciasDe({ ...base, data_fim: "2026-06-30" }, { de: "2026-01-01", ate: "2030-12-31" });
  ok(parada.length === 6, "mudar a data de fim para junho deixa 6 ocorrências");
  ok(parada[parada.length - 1].data === "2026-06-10", "a última é a de junho");

  // Parar no passado apaga o futuro todo
  const antiga = ocorrenciasDe({ ...base, data_fim: "2026-01-10" }, { de: "2026-01-01", ate: "2030-12-31" });
  ok(antiga.length === 1, "fim no próprio dia de início deixa uma só");
}

console.log("\nPeriodicidades:");
{
  const janela = { de: "2026-01-01", ate: "2026-12-31" };
  const n = (p) => ocorrenciasDe({ ...base, periodicidade: p, data_fim: "2026-12-31" }, janela).length;
  ok(n("mensal") === 12, "mensal dá 12 no ano");
  ok(n("bimestral") === 6, "bimestral dá 6");
  ok(n("trimestral") === 4, "trimestral dá 4");
  ok(n("semestral") === 2, "semestral dá 2");
  ok(n("anual") === 1, "anual dá 1");
  ok(MESES_DE("trimestral") === 3 && MESES_DE("disparate") === 1,
     "uma periodicidade desconhecida trata-se como mensal");
  ok(rotuloPeriodicidade("semestral") === "Semestral", "e tem rótulo para o ecrã");
  ok(PERIODICIDADES.length === 5, "cinco periodicidades à escolha");

  // Trimestral a partir de 31 de janeiro: 31/01, 30/04, 31/07, 31/10
  const tri = ocorrenciasDe({ ...base, data_inicio: "2026-01-31", periodicidade: "trimestral",
                              data_fim: "2026-12-31" }, janela);
  ok(tri.map(o => o.data).join(" ") === "2026-01-31 2026-04-30 2026-07-31 2026-10-31",
     `o dia 31 acompanha os meses curtos: ${tri.map(o => o.data).join(" ")}`);
}

console.log("\nA janela do fluxo corta o que está fora:");
{
  const oc = ocorrenciasDe(base, { de: "2026-07-01", ate: "2026-09-30" });
  ok(oc.length === 3, "só as de julho, agosto e setembro");
  ok(oc[0].data === "2026-07-10", "a primeira é a de julho");

  // Sem data de fim, é a janela que manda
  const semFim = ocorrenciasDe({ ...base, data_fim: null }, { de: "2026-01-01", ate: "2027-12-31" });
  ok(semFim.length === 24, `sem data de fim, a regra enche a janela (deu ${semFim.length})`);
  const semNada = ocorrenciasDe({ ...base, data_fim: null }, {});
  ok(semNada.length === 1, "sem fim nem janela não se geram ocorrências infinitas");
}

console.log("\nUma regra desligada não produz nada:");
{
  ok(ocorrenciasDe({ ...base, ativa: false }, { de: "2026-01-01", ate: "2026-12-31" }).length === 0,
     "ativa: false não dá ocorrências");
  ok(ocorrenciasDe({ ...base, valor: 0 }, { de: "2026-01-01", ate: "2026-12-31" }).length === 0,
     "valor zero também não");
  ok(ocorrenciasDe({ ...base, data_inicio: "" }, { de: "2026-01-01", ate: "2026-12-31" }).length === 0,
     "nem sem data de início");
  ok(ocorrenciasDe(null, {}).length === 0, "nulo não rebenta");
  ok(ocorrenciasDe({ ...base, data_fim: "2025-01-01" }, { de: "2026-01-01", ate: "2026-12-31" }).length === 0,
     "uma regra já terminada não aparece no futuro");
}

console.log("\nO resumo que o ecrã mostra:");
{
  const r = resumoDaRegra(base, "2026-07-01");
  ok(r.porVir === 6, `faltam 6 ocorrências a partir de julho (deu ${r.porVir})`);
  ok(perto(r.total, 900), "que custam 900 €");
  ok(r.proxima === "2026-07-10", "a próxima é a 10 de julho");
  ok(r.ultima === "2026-12-10", "e a última a 10 de dezembro");
  ok(r.semFim === false, "e sabe que tem fim");
  ok(resumoDaRegra({ ...base, data_fim: null }, "2026-07-01").semFim === true,
     "uma regra sem fim diz que não tem fim");
  ok(resumoDaRegra(base, "2027-01-01").porVir === 0, "passada a data de fim não falta nada");
}

console.log("\nValidação antes de gravar:");
{
  ok(validarRegra(base).length === 0, "a regra boa passa");
  ok(validarRegra({ ...base, empresa: "" }).some(e => /empresa/i.test(e)), "pede a empresa");
  ok(validarRegra({ ...base, descricao: "  " }).some(e => /descritivo/i.test(e)), "pede o descritivo");
  ok(validarRegra({ ...base, valor: 0 }).some(e => /valor/i.test(e)), "pede um valor");
  ok(validarRegra({ ...base, data_inicio: "" }).some(e => /in[íi]cio/i.test(e)), "pede a data de início");
  ok(validarRegra({ ...base, data_fim: "2025-01-01" }).some(e => /anterior/i.test(e)),
     "recusa um fim antes do início");
  ok(validarRegra({ ...base, data_fim: "" }).length === 0, "mas aceita ficar sem data de fim");
  ok(validarRegra(null).length > 0, "e nulo dá erro em vez de rebentar");
}

console.log(mau === 0 ? "\n✅ Despesas recorrentes OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
