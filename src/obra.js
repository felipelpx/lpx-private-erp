// ─────────────────────────────────────────────────────────────────────────────
// PLANO DE OBRA — o que falta gastar, e tudo o que anda agarrado ao prazo
//
// Um projeto com obra tem seis custos que se movem todos com a data de fim:
//
//   1. Obra          — o que falta do budget, espalhado pelos meses que faltam
//   2. Fiscalização  — avença mensal, enquanto a obra durar
//   3. CSO           — avença mensal, enquanto a obra durar
//   4. Juros         — sobre a dívida libertada, que cresce com a obra
//   5. Comissão de avaliação — uma por cada libertação do banco
//   6. IVA da obra   — pago com a fatura, recuperado no trimestre seguinte
//
// Esticar o prazo não dilui o custo: a obra mensal baixa, mas fiscalização,
// CSO e juros são cobrados mais meses. O projeto fica pior, e é isso que o
// motor tem de mostrar.
//
// Módulo sem React e sem acesso a dados: recebe um plano e devolve linhas.
// É assim que pode ser testado sem browser nem base de dados.
// ─────────────────────────────────────────────────────────────────────────────

import { arred2, dataLimite, trimestreDe, anoDe, hojeISO } from "./iva.js";

// Os projetos com obra. Os outros não têm plano nenhum e o ecrã não os mostra.
export const EMPRESAS_COM_OBRA = ["favcloset", "simplify", "genero", "adseq", "infinite"];

export const temObra = (empresaId) => EMPRESAS_COM_OBRA.includes(empresaId);

// Os seis tipos de linha que o motor gera. A marca `plano_tipo` fica gravada
// em cada previsão: é por ela que um recálculo sabe o que é dele e o que é do
// utilizador.
export const TIPOS = ["obra", "funding", "fiscalizacao", "cso", "juros", "comissao", "iva_obra", "funding_iva"];

export const ROTULO_TIPO = {
  obra:         "Obra",
  funding:      "Funding banco (obra)",
  fiscalizacao: "Fiscalização",
  cso:          "CSO",
  juros:        "Juros do financiamento",
  comissao:     "Comissão de avaliação",
  iva_obra:     "IVA da obra",
  funding_iva:  "Funding banco (IVA)",
};

// Onde cada linha cai no plano de contas. Os projetos da LPX e os da HDG têm
// taxonomias diferentes — a mesma linha tem de ir para o sítio certo em cada um.
const CATEGORIAS_LPX = {
  obra:         { categoria: "Obra" },
  funding:      { categoria: "Funding" },
  fiscalizacao: { categoria: "Fiscalização" },
  cso:          { categoria: "CSO" },
  juros:        { categoria: "Juros" },
  comissao:     { categoria: "Encargos financeiros" },
  iva_obra:     { categoria: "IVA construção" },
  funding_iva:  { categoria: "Funding" },
};

const CATEGORIAS_HDG = {
  obra:         { categoria: "Obras",            subcategoria: "Gastos com Obras" },
  funding:      { categoria: "Financiamento",    subcategoria: "Inflow - Obra" },
  fiscalizacao: { categoria: "Obras",            subcategoria: "Fiscalização" },
  cso:          { categoria: "Soft_Costs",       subcategoria: "CSO" },
  juros:        { categoria: "Financiamento",    subcategoria: "Outflow - Juros" },
  comissao:     { categoria: "Financiamento",    subcategoria: "Outflow - Taxas e comissões" },
  iva_obra:     { categoria: "Impostos e taxas", subcategoria: "IVA" },
  funding_iva:  { categoria: "Financiamento",    subcategoria: "Inflow - Obra" },
};

export const classificacaoDe = (tipo, grupo) =>
  (grupo === "HDG" ? CATEGORIAS_HDG : CATEGORIAS_LPX)[tipo] || { categoria: "Obra" };

// As categorias que o motor toma conta. Quando se manda substituir, são as
// previsões manuais DESTAS categorias que saem — e mais nenhuma.
export function categoriasDoMotor(grupo) {
  const mapa = grupo === "HDG" ? CATEGORIAS_HDG : CATEGORIAS_LPX;
  return [...new Set(TIPOS.map(t => mapa[t]?.categoria).filter(Boolean))];
}

// ─── Aritmética de meses ────────────────────────────────────────────────────
// Feita sobre "AAAA-MM" em vez de Date, porque somar meses a um Date salta
// dias: 31 de janeiro mais um mês dá 2 ou 3 de março.
export const mesDe = (iso) => String(iso || "").slice(0, 7);

export function somarMeses(mesISO, n) {
  const [a, m] = String(mesISO).slice(0, 7).split("-").map(Number);
  if (!a || !m) return null;
  const i = a * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

export function diferencaMeses(de, ate) {
  const [a1, m1] = String(de).slice(0, 7).split("-").map(Number);
  const [a2, m2] = String(ate).slice(0, 7).split("-").map(Number);
  if (!a1 || !m1 || !a2 || !m2) return 0;
  return (a2 * 12 + m2) - (a1 * 12 + m1);
}

// Os meses de um intervalo, inclusive nas duas pontas. Fim antes do início
// devolve lista vazia — não há meses negativos.
export function mesesEntre(inicioISO, fimISO) {
  const ini = mesDe(inicioISO), fim = mesDe(fimISO);
  const n = diferencaMeses(ini, fim);
  if (!ini || !fim || n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => somarMeses(ini, i));
}

// O dia em que a linha cai. Dia 1 para a obra e as avenças (é quando se
// processa), último dia do mês para os juros (vencem no fecho).
const noMes = (mes, dia = 1) => `${mes}-${String(dia).padStart(2, "0")}`;
const ultimoDia = (mes) => {
  const [a, m] = mes.split("-").map(Number);
  return noMes(mes, new Date(a, m, 0).getDate());
};

// Repartir um total por n meses sem perder cêntimos: divide-se por igual e o
// último mês leva a sobra. Sem isto, 600 000 € por 9 meses soma 600 000,03 €,
// e o budget deixa de fechar.
export function repartir(total, n) {
  if (!(n > 0)) return [];
  const cents = Math.round((Number(total) || 0) * 100);
  const porMes = Math.floor(cents / n);
  const sobra = cents - porMes * n;
  return Array.from({ length: n }, (_, i) => (porMes + (i === n - 1 ? sobra : 0)) / 100);
}

// ─── O que já se gastou em obra ─────────────────────────────────────────────
// Compara-se com o budget SEM IVA, por isso conta-se a base das faturas. Onde
// não houver base registada, deduz-se do total à taxa da obra — é a mesma
// conta que o apuramento do IVA faz.
export function gastoEmObra(faturas, { empresa, categorias, taxaIva = 23 } = {}) {
  const cats = (categorias || []).map(c => String(c).toLowerCase());
  return arred2((faturas || [])
    .filter(f => f && f.empresa === empresa)
    .filter(f => cats.includes(String(f.categoria || "").toLowerCase()))
    .filter(f => !/anulada|cancelada|rejeitada/i.test(String(f.status || "")))
    .reduce((s, f) => {
      const base = Number(f.valor_base);
      if (Number.isFinite(base) && base > 0) return s + base;
      const total = Number(f.valor) || 0;
      return s + total / (1 + (Number(taxaIva) || 0) / 100);
    }, 0));
}

// Quanto se tem pago por mês numa rubrica, para propor a avença em vez de
// obrigar a ir ver às faturas. É a média pelos meses em que houve fatura —
// não pelo número de faturas, que num mês podem ser duas.
export function sugerirAvenca(faturas, { empresa, categorias } = {}) {
  const cats = (categorias || []).map(c => String(c).toLowerCase());
  const porMes = new Map();
  (faturas || [])
    .filter(f => f && f.empresa === empresa)
    .filter(f => cats.includes(String(f.categoria || "").toLowerCase()))
    .filter(f => !/anulada|cancelada|rejeitada/i.test(String(f.status || "")))
    .forEach(f => {
      const m = mesDe(f.data_fatura || f.vencimento);
      if (!/^\d{4}-\d{2}$/.test(m)) return;
      porMes.set(m, (porMes.get(m) || 0) + (Number(f.valor) || 0));
    });
  if (porMes.size === 0) return null;
  const total = [...porMes.values()].reduce((s, v) => s + v, 0);
  return { valor: arred2(total / porMes.size), meses: porMes.size };
}

// O plano ficou para trás? Se entrou fatura de obra desde o último recálculo,
// as previsões seguintes já não correspondem ao que falta gastar.
export function planoDesatualizado(plano, gastoAgora) {
  if (!plano || !plano.calculado_em) return false;
  const antes = Number(plano.gasto_no_calculo);
  if (!Number.isFinite(antes)) return true;
  return Math.abs(arred2(gastoAgora) - arred2(antes)) > 0.01;
}

// ─── O plano ────────────────────────────────────────────────────────────────
const num = (v, def = 0) => { const n = Number(v); return Number.isFinite(n) ? n : def; };

export const PLANO_VAZIO = {
  empresa: "", ativo: true,
  data_inicio: "", data_fim: "",
  budget_obra: 0, taxa_iva_obra: 23,
  fiscalizacao_mensal: 0, cso_mensal: 0, comissao_avaliacao: 0,
  euribor: 0, spread: 0, funding_pct: 0, divida_inicial: 0,
  recuperar_iva: true,
};

/**
 * Transforma um plano nas linhas que vão para o Fluxo Futuro.
 *
 * @param plano  os inputs do utilizador (ver PLANO_VAZIO)
 * @param opts.gastoObra  quanto já foi gasto em obra, SEM IVA
 * @param opts.hoje       data de referência (injetável para os testes)
 * @param opts.grupo      "LPX" ou "HDG" — decide o plano de contas
 */
export function planearObra(plano, { gastoObra = 0, hoje = hojeISO(), grupo = "LPX" } = {}) {
  const avisos = [];
  const p = { ...PLANO_VAZIO, ...(plano || {}) };

  if (!p.data_fim)    avisos.push("Falta a data de fim de obra: sem ela não há nada a calcular.");
  if (!p.data_inicio) avisos.push("Falta a data de início de obra.");
  if (p.data_inicio && p.data_fim && mesDe(p.data_fim) < mesDe(p.data_inicio))
    avisos.push("A data de fim é anterior à de início.");
  if (!(num(p.budget_obra) > 0)) avisos.push("Falta o budget de obra.");

  // O plano arranca no mês corrente, ou no início da obra se ainda não começou:
  // o passado já está no fluxo realizado e não se prevê duas vezes.
  const primeiro = mesDe(p.data_inicio) > mesDe(hoje) ? mesDe(p.data_inicio) : mesDe(hoje);
  const meses = mesesEntre(primeiro, p.data_fim);

  const budget    = num(p.budget_obra);
  const gasto     = arred2(num(gastoObra));
  const porGastar = arred2(Math.max(0, budget - gasto));
  const taxa      = num(p.taxa_iva_obra, 23);

  if (budget > 0 && gasto > budget)
    avisos.push(`Já se faturou mais do que o budget — ${arred2(gasto - budget)} € acima. ` +
                `A obra entra a zero daqui para a frente: corrige o budget se não for isso.`);
  if (meses.length === 0 && p.data_fim)
    avisos.push("A obra já devia ter terminado: não há meses para espalhar o que falta.");

  const linhas = [];
  if (meses.length === 0) {
    return { linhas, avisos, resumo: resumir(linhas, { budget, gasto, porGastar, meses }) };
  }

  // 1. Obra — o que falta, dividido por igual. A fatura do empreiteiro sai
  //    pela BASE: o IVA não é pago com ela, é autoliquidado e entregue com o
  //    apuramento do trimestre (ponto 6).
  const basePorMes = repartir(porGastar, meses.length);
  const ivaPorMes  = basePorMes.map(b => arred2(b * taxa / 100));
  const obraBaseMes = basePorMes[0];          // o mês típico, para os textos
  const obraIvaMes  = ivaPorMes[0];

  // 2 e 3. Avenças: o valor é o mesmo todos os meses, e são tantos meses
  //    quantos a obra durar. É aqui que esticar o prazo custa dinheiro.
  const fisc = arred2(num(p.fiscalizacao_mensal));
  const cso  = arred2(num(p.cso_mensal));

  // 4, 5 e 6. Banco. Dois pagamentos distintos, em duas datas, ambos
  //    financiados:
  //
  //      no vencimento da fatura  →  sai a BASE, o banco liberta a sua
  //                                  percentagem contra o auto de medição
  //      no dia 25 do apuramento  →  sai o IVA do trimestre, e o banco
  //                                  financia-o também
  //
  //    Em caixa, cada par quase se anula; o que fica é a dívida, e é sobre
  //    ela que correm os juros. É esse o custo verdadeiro do prazo.
  const pctFunding = Math.min(100, Math.max(0, num(p.funding_pct)));
  const comissao   = arred2(num(p.comissao_avaliacao));
  const taxaAnual  = num(p.euribor) + num(p.spread);
  const financiaIva = p.recuperar_iva !== false;
  let divida       = arred2(num(p.divida_inicial));

  // O calendário do IVA tem de estar pronto ANTES de andar pelos meses: um
  // pagamento de IVA que caia num mês de obra conta no saldo desse mês, e
  // portanto nos juros.
  const ivaPorTrimestre = new Map();
  meses.forEach((mes, i) => {
    if (!(ivaPorMes[i] > 0)) return;
    const chave = `${anoDe(noMes(mes, 1))}-${trimestreDe(noMes(mes, 1))}`;
    ivaPorTrimestre.set(chave, arred2((ivaPorTrimestre.get(chave) || 0) + ivaPorMes[i]));
  });
  const pagamentosIva = [...ivaPorTrimestre.entries()]
    .map(([chave, valor]) => {
      const [ano, tri] = chave.split("-").map(Number);
      return (!ano || !tri || !(valor > 0)) ? null
        : { data: dataLimite(ano, tri), valor: arred2(valor), ano, tri,
            funding: financiaIva ? arred2(valor * pctFunding / 100) : 0 };
    })
    .filter(Boolean)
    .sort((a, b) => a.data.localeCompare(b.data));

  const fundingIvaNoMes = (mes) => arred2(pagamentosIva
    .filter(e => mesDe(e.data) === mes).reduce((s, e) => s + e.funding, 0));

  meses.forEach((mes, i) => {
    const ultimo = i === meses.length - 1;

    const baseMes = basePorMes[i], ivaMes = ivaPorMes[i];
    if (baseMes > 0) {
      linhas.push(linha("obra", mes, baseMes, grupo, {
        descricao: `Obra — ${rotuloMes(mes)}`,
        obs: `Base da fatura. O IVA (${ivaMes} € a ${taxa}%) sai no apuramento do trimestre.`,
        base: baseMes, iva: ivaMes,
      }));
    }

    if (fisc > 0) linhas.push(linha("fiscalizacao", mes, fisc, grupo,
      { descricao: `Fiscalização de obra — ${rotuloMes(mes)}` }));
    if (cso > 0)  linhas.push(linha("cso", mes, cso, grupo,
      { descricao: `CSO — ${rotuloMes(mes)}` }));

    // Libertação do mês: a percentagem contratada sobre a base da fatura.
    const libertado = arred2(baseMes * pctFunding / 100);
    if (libertado > 0) {
      linhas.push({
        ...linha("funding", mes, libertado, grupo, {
          descricao: `Funding banco — ${rotuloMes(mes)}`,
          obs: `${arred2(pctFunding)}% de ${baseMes} € (base da fatura)`,
        }),
        tipo: "entrada",
      });
      if (comissao > 0) linhas.push(linha("comissao", mes, comissao, grupo, {
        descricao: `Comissão de avaliação — ${rotuloMes(mes)}`,
        obs: `Libertação de ${libertado} €`,
      }));
    }

    // Juros sobre o SALDO MÉDIO do mês: a libertação não espera pelo mês
    // seguinte para contar, nem conta o mês inteiro.
    const dividaFim = arred2(divida + libertado + fundingIvaNoMes(mes));
    if (taxaAnual > 0 && (divida > 0 || dividaFim > 0)) {
      const medio = arred2((divida + dividaFim) / 2);
      const juros = arred2(medio * taxaAnual / 100 / 12);
      if (juros > 0) linhas.push(linha("juros", mes, juros, grupo, {
        dia: "fim",
        descricao: `Juros do financiamento — ${rotuloMes(mes)}`,
        obs: `Saldo médio ${medio} € (${arred2(divida)} → ${dividaFim}) × ${arred2(taxaAnual)}% / 12`,
      }));
    }
    divida = dividaFim;

    if (ultimo) avisos.push(`A obra termina em ${rotuloMes(mes)}: é até aí que ` +
      `se pagam fiscalização, CSO e juros.`);
  });

  // 6. O IVA da obra: autoliquidado, entregue no dia 25 da data-limite do
  //    trimestre, e financiado pelo banco na mesma data.
  const ultimoMesObra = meses[meses.length - 1] || "";
  pagamentosIva.forEach(e => {
    const rot = `${e.tri}T${String(e.ano).slice(-2)}`;
    linhas.push({
      ...linha("iva_obra", mesDe(e.data), e.valor, grupo, {
        descricao: `IVA da obra ${rot}`,
        obs: `IVA das faturas de obra de ${rot}, entregue com o apuramento`,
      }),
      data: e.data,
    });
    if (e.funding > 0) {
      linhas.push({
        ...linha("funding_iva", mesDe(e.data), e.funding, grupo, {
          descricao: `Funding banco — IVA da obra ${rot}`,
          obs: `${arred2(pctFunding)}% de ${e.valor} € de IVA`,
        }),
        tipo: "entrada", data: e.data,
      });
      // Um pagamento de IVA depois do fim da obra não gera mais linhas de
      // juros (o motor só vai até ao fim da obra), mas conta na dívida.
      if (mesDe(e.data) > ultimoMesObra) divida = arred2(divida + e.funding);
    }
  });

  if (pagamentosIva.some(e => mesDe(e.data) > ultimoMesObra))
    avisos.push("Há IVA a pagar depois do fim da obra. Aparece no fluxo, mas " +
                "os juros só são calculados até ao último mês de obra.");

  linhas.sort((a, b) => a.data.localeCompare(b.data) || TIPOS.indexOf(a.plano_tipo) - TIPOS.indexOf(b.plano_tipo));
  return { linhas, avisos, resumo: resumir(linhas, { budget, gasto, porGastar, meses, dividaFinal: divida }) };
}

function linha(tipo, mes, valor, grupo, extra = {}) {
  const { dia, ...resto } = extra;
  return {
    plano_tipo: tipo,
    tipo: "saida",
    data: dia === "fim" ? ultimoDia(mes) : noMes(mes, 1),
    mes,
    valor: arred2(valor),
    ...classificacaoDe(tipo, grupo),
    funding: false, funding_pct: 100,
    ...resto,
  };
}

const NOMES_MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun",
                         "jul", "ago", "set", "out", "nov", "dez"];
export function rotuloMes(mes) {
  const [a, m] = String(mes).split("-").map(Number);
  return m ? `${NOMES_MES_CURTO[m - 1]}/${String(a).slice(-2)}` : String(mes);
}

function resumir(linhas, { budget, gasto, porGastar, meses, dividaFinal = 0 }) {
  const soma = (t) => arred2(linhas.filter(l => l.plano_tipo === t)
    .reduce((s, l) => s + (l.tipo === "entrada" ? -l.valor : l.valor), 0));
  const totais = Object.fromEntries(TIPOS.map(t => [t, soma(t)]));
  const custoTotal = arred2(TIPOS.reduce((s, t) => s + totais[t], 0));
  return {
    budget: arred2(budget), gasto, porGastar,
    meses: meses.length,
    primeiroMes: meses[0] || null,
    ultimoMes: meses[meses.length - 1] || null,
    totais,
    custoTotal,
    dividaFinal: arred2(dividaFinal),
    nLinhas: linhas.length,
  };
}

// ─── Aplicar o plano ao Fluxo Futuro ────────────────────────────────────────
// A parte que apaga coisas, e por isso a que tem de ser óbvia antes de correr.
//
// Três regras, por esta ordem:
//
//   1. As linhas do motor desta empresa saem todas — é um recálculo, não uma
//      adição. As que já foram pagas ou convertidas em fatura ficam: isso já
//      é passado, e passado não se prevê.
//   2. As previsões MANUAIS das categorias do motor, de hoje para a frente,
//      também saem: foi o que ficou decidido, para não haver duplicação. As
//      de outras categorias nunca são tocadas.
//   3. Entram as linhas novas, com ids determinísticos — correr duas vezes
//      seguidas dá exatamente o mesmo resultado.
//
// Devolve o que vai acontecer SEM fazer nada. Quem chama é que decide.
const INTOCAVEL = /^(paga|pago|convertida)$/i;

export function planearAplicacao({
  linhas = [], pagamentosExistentes = [], empresa, grupo = "LPX",
  primeiroMes = null, hoje = hojeISO(),
} = {}) {
  const cats = categoriasDoMotor(grupo).map(c => c.toLowerCase());
  const corte = primeiroMes ? `${primeiroMes}-01` : mesDe(hoje) + "-01";

  const daEmpresa = (pagamentosExistentes || [])
    .filter(p => p && p.empresa === empresa)
    .filter(p => !INTOCAVEL.test(String(p.status || "")));

  const aApagarDoMotor = daEmpresa.filter(p =>
    p.plano_obra === empresa && String(p.data_inicio || "") >= corte);

  const aApagarManuais = daEmpresa.filter(p =>
    !p.plano_obra &&
    cats.includes(String(p.categoria || "").toLowerCase()) &&
    String(p.data_inicio || "") >= corte);

  const aCriar = linhas.map(l => ({
    id: `obra_${empresa}_${l.plano_tipo}_${l.data}`,
    tipo: l.tipo || "saida",
    descricao: l.descricao,
    empresa,
    categoria: l.categoria,
    subcategoria: l.subcategoria || "",
    valor: l.valor,
    data_inicio: l.data,
    parcelas: 1,
    periodicidade: "unica",
    status: "Pendente",
    obs: l.obs || "",
    funding: !!l.funding,
    funding_pct: l.funding_pct ?? 100,
    plano_obra: empresa,
    plano_tipo: l.plano_tipo,
  }));

  const somar = (arr) => arred2(arr.reduce((s, p) => s + (Number(p.valor) || 0), 0));
  return {
    aCriar, aApagarDoMotor, aApagarManuais,
    idsAApagar: [...aApagarDoMotor, ...aApagarManuais].map(p => p.id),
    resumo: {
      criar: aCriar.length,          valorCriar: somar(aCriar),
      apagarMotor: aApagarDoMotor.length, valorMotor: somar(aApagarDoMotor),
      apagarManuais: aApagarManuais.length, valorManuais: somar(aApagarManuais),
      protegidas: (pagamentosExistentes || [])
        .filter(p => p && p.empresa === empresa && INTOCAVEL.test(String(p.status || ""))).length,
    },
  };
}

// ─── Comparar dois cenários ─────────────────────────────────────────────────
// Para responder à pergunta que importa: o que custa esticar o prazo?
export function compararPrazos(plano, opts, novaDataFim) {
  const antes  = planearObra(plano, opts);
  const depois = planearObra({ ...plano, data_fim: novaDataFim }, opts);
  const dif = Object.fromEntries(TIPOS.map(t =>
    [t, arred2(depois.resumo.totais[t] - antes.resumo.totais[t])]));
  return {
    antes: antes.resumo, depois: depois.resumo, diferencas: dif,
    mesesAMais: depois.resumo.meses - antes.resumo.meses,
    custoAMais: arred2(depois.resumo.custoTotal - antes.resumo.custoTotal),
  };
}
