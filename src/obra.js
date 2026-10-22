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
export const TIPOS = ["obra", "funding", "fiscalizacao", "cso", "juros", "comissao",
                      "iva_obra", "funding_iva", "fecho", "venda", "amortizacao"];

export const ROTULO_TIPO = {
  obra:         "Obra",
  funding:      "Funding banco (obra)",
  fiscalizacao: "Fiscalização",
  cso:          "CSO",
  juros:        "Juros do financiamento",
  comissao:     "Comissão de avaliação",
  iva_obra:     "IVA da obra",
  funding_iva:  "Funding banco (IVA)",
  fecho:        "Despesas de fecho de obra",
  venda:        "Vendas na escritura",
  amortizacao:  "Amortização da dívida",
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
  fecho:        { categoria: "Obra" },          // cada despesa pode trazer a sua
  venda:        { categoria: "Vendas" },
  amortizacao:  { categoria: "Amortização" },
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
  fecho:        { categoria: "Obras",            subcategoria: "Buffer/Outros" },
  venda:        { categoria: "Vendas",           subcategoria: "Vendas" },
  amortizacao:  { categoria: "Financiamento",    subcategoria: "Outlow - Repagamento" },
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

// ─── O que o sistema já sabe sobre uma obra a decorrer ──────────────────────
// Numa obra já começada não faz sentido pedir ao utilizador o que o ERP já
// tem. Vai-se buscar aos documentos: a data do primeiro gasto, o que já foi
// pago pelo banco fora, e o que está faturado à espera de pagamento.
//
// Duas fontes, de propósito:
//   - as FATURAS (Contas a Pagar) dizem o que já foi incorrido contra o
//     budget, pago ou não. É este o número que consome o budget: uma fatura
//     por pagar já está no fluxo, prevê-la outra vez seria contá-la em
//     dobro.
//   - o EXTRATO diz o que saiu mesmo da conta. É a obra "já paga".
//
// Tudo isto conta-se COM IVA, porque é assim que o fluxo realizado trata a
// obra: o que saiu da conta saiu com IVA incluído, e o IVA de obra é obra.
// A comparação do outro lado é, por isso, com o budget + IVA. A base (sem
// IVA) fica também devolvida, para o ecrã poder abrir a conta.
const semAcento = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const bate = (valor, lista) => lista.map(semAcento).includes(semAcento(valor));

export function obraRealizada(movimentos, faturas, { empresa, categorias = [], taxaIva = 23 } = {}) {
  const fs = (faturas || [])
    .filter(f => f && f.empresa === empresa)
    .filter(f => bate(f.categoria, categorias))
    .filter(f => !/anulada|cancelada|rejeitada/i.test(String(f.status || "")));

  const taxa = Number(taxaIva) || 0;

  // A base é o que está registado; onde não houver, deduz-se do total à taxa
  // da obra. O bruto é o total da fatura; onde não houver, acrescenta-se o
  // IVA à base. Assim qualquer uma das duas colunas serve de origem.
  const baseDe = (f) => {
    const b = Number(f.valor_base);
    if (Number.isFinite(b) && b > 0) return b;
    return (Number(f.valor) || 0) / (1 + taxa / 100);
  };
  const brutoDe = (f) => {
    const t = Number(f.valor);
    if (Number.isFinite(t) && t > 0) return t;
    return baseDe(f) * (1 + taxa / 100);
  };
  const paga = (f) => /^(paga|pago)$/i.test(String(f.status || "").trim());

  const faturado       = arred2(fs.reduce((s, f) => s + baseDe(f), 0));
  const faturadoPago   = arred2(fs.filter(paga).reduce((s, f) => s + baseDe(f), 0));
  const porPagar       = arred2(faturado - faturadoPago);

  const faturadoBruto     = arred2(fs.reduce((s, f) => s + brutoDe(f), 0));
  const faturadoPagoBruto = arred2(fs.filter(paga).reduce((s, f) => s + brutoDe(f), 0));
  const porPagarBruto     = arred2(faturadoBruto - faturadoPagoBruto);

  // Saídas do extrato classificadas como obra: o que saiu mesmo da conta.
  const ms = (movimentos || [])
    .filter(m => m && bate(m.categoria, categorias))
    .filter(m => (Number(m.valor) || 0) < 0);
  const pagoExtrato = arred2(ms.reduce((s, m) => s + Math.abs(Number(m.valor) || 0), 0));

  const datas = [
    ...fs.map(f => String(f.data_fatura || f.vencimento || "").slice(0, 10)),
    ...ms.map(m => String(m.data || "").slice(0, 10)),
  ].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();

  // Quanto do que saiu da conta era IVA — informativo, para o ecrã mostrar
  // a composição do pagamento. Não se desconta de nada: o IVA de obra é obra.
  const pagoExtratoBase = arred2(pagoExtrato / (1 + taxa / 100));
  const ivaNoPago = arred2(pagoExtrato - pagoExtratoBase);

  // O que já foi incorrido é o que saiu da conta MAIS o que está faturado e
  // ainda por pagar, ambos COM IVA. Cada euro conta uma vez só: uma fatura
  // já paga está no extrato, e uma por pagar ainda não.
  //
  // Sem movimentos de obra no extrato não há nada a somar — aí vale o que as
  // faturas dizem, que é tudo o que o ERP sabe.
  const jaIncorrido = ms.length > 0
    ? arred2(pagoExtrato + porPagarBruto)
    : faturadoBruto;
  // E as suas duas metades. Decompõe-se à taxa do plano, e o IVA é o resto —
  // assim base + IVA dá exatamente o incorrido, sem cêntimos a fugir, e o IVA
  // já incorrido mais o IVA que falta fecham no IVA do budget.
  const jaIncorridoBase = arred2(jaIncorrido / (1 + taxa / 100));
  const ivaIncorrido    = arred2(jaIncorrido - jaIncorridoBase);

  return {
    faturado, faturadoPago, porPagar,
    faturadoBruto, faturadoPagoBruto, porPagarBruto,
    pagoExtrato, pagoExtratoBase, ivaNoPago, taxaUsada: taxa,
    nFaturas: fs.length, nMovimentos: ms.length,
    primeiroGasto: datas[0] || null,
    jaIncorrido, jaIncorridoBase, ivaIncorrido,
    // De onde veio o número, para o ecrã poder explicá-lo.
    fonte: ms.length > 0 ? "extrato" : "faturas",
  };
}

// O funding que o banco já libertou, lido do extrato: entradas classificadas
// na rubrica de financiamento do projeto. É a dívida de hoje, sem a escrever
// à mão.
export function fundingLibertado(movimentos, { categorias = [], subcategorias = [] } = {}) {
  const ms = (movimentos || [])
    .filter(m => m && (Number(m.valor) || 0) > 0)
    .filter(m => bate(m.categoria, categorias))
    .filter(m => subcategorias.length === 0 || !m.subcategoria || bate(m.subcategoria, subcategorias));
  return {
    total: arred2(ms.reduce((s, m) => s + (Number(m.valor) || 0), 0)),
    n: ms.length,
    ultimo: ms.map(m => String(m.data || "").slice(0, 10)).sort().pop() || null,
  };
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
// Os avisos são lidos por pessoas: euros escritos como se escrevem.
const eur = (v) => new Intl.NumberFormat("pt-PT",
  { style: "currency", currency: "EUR" }).format(arred2(v));

export const PLANO_VAZIO = {
  empresa: "", ativo: true,
  data_inicio: "", data_fim: "",
  budget_obra: 0, taxa_iva_obra: 23,
  fiscalizacao_mensal: 0, cso_mensal: 0, taxa_iva_servicos: 23, comissao_avaliacao: 0,
  euribor: 0, spread: 0, funding_pct: 0, divida_inicial: 0,
  // `recuperar_iva` liga/desliga o financiamento do IVA pelo banco (o nome
  // ficou de uma versão anterior). `funding_iva_pct` em branco = o mesmo
  // que a obra.
  recuperar_iva: true, funding_iva_pct: null,
  // ── A escritura ──────────────────────────────────────────────────────────
  // O projeto não acaba quando a obra acaba: vende-se, paga-se o banco e
  // fecham-se contas. A escritura é o mês em que isso acontece, e o
  // utilizador diz quantos meses depois do fim da obra ela cai.
  meses_ate_escritura: 0,
  valor_venda: 0,
  amortizar_divida: true,
  despesas_fecho: [],        // [{ descricao, valor, categoria }]
};

/**
 * Transforma um plano nas linhas que vão para o Fluxo Futuro.
 *
 * @param plano  os inputs do utilizador (ver PLANO_VAZIO)
 * @param opts.gastoObra  quanto já foi incorrido em obra, COM IVA — compara-se
 *                        com o budget + IVA, porque o IVA de obra é obra
 * @param opts.hoje       data de referência (injetável para os testes)
 * @param opts.grupo      "LPX" ou "HDG" — decide o plano de contas
 */
export function planearObra(plano, { gastoObra = 0, hoje = hojeISO(), grupo = "LPX",
                                     vendaNaEscritura = 0 } = {}) {
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

  // O budget é dado sem IVA; o que já foi incorrido vem com IVA. A conta
  // faz-se toda em bruto — budget + IVA menos o que já se pagou de obra e de
  // IVA de obra — e só depois se parte o que falta em base e IVA, porque é
  // assim que as faturas vão sair: a base no vencimento, o IVA no dia 25.
  const budget      = num(p.budget_obra);
  const taxa        = num(p.taxa_iva_obra, 23);
  const budgetBruto = arred2(budget * (1 + taxa / 100));
  const ivaDoBudget = arred2(budgetBruto - budget);
  const gasto       = arred2(num(gastoObra));

  // As duas metades do que já se gastou. O IVA é sempre o resto da base, para
  // que base + IVA feche no bruto ao cêntimo.
  const gastoBase = arred2(gasto / (1 + taxa / 100));
  const gastoIva  = arred2(gasto - gastoBase);

  // E as duas metades do que falta. A base é o que resta do budget; o IVA é
  // outra vez o resto. Daqui sai a garantia que interessa:
  //     IVA já incorrido + IVA que falta = IVA do budget, exatamente.
  const porGastarBruto = arred2(Math.max(0, budgetBruto - gasto));
  const porGastar      = Math.min(porGastarBruto, arred2(Math.max(0, budget - gastoBase)));
  const ivaPorGastar   = arred2(porGastarBruto - porGastar);

  if (budgetBruto > 0 && gasto > budgetBruto)
    avisos.push(`Já se gastou mais do que o budget com IVA — ` +
                `${arred2(gasto - budgetBruto)} € acima de ${arred2(budgetBruto)} €. ` +
                `A obra entra a zero daqui para a frente: corrige o budget se não for isso.`);
  if (meses.length === 0 && p.data_fim)
    avisos.push("A obra já devia ter terminado: não há meses para espalhar o que falta.");

  const linhas = [];
  if (meses.length === 0) {
    return { linhas, avisos, resumo: resumir(linhas, { budget, budgetBruto, ivaDoBudget, gasto, gastoBase, gastoIva,
                      porGastar, porGastarBruto, ivaPorGastar, meses }) };
  }

  // 1. Obra — o que falta, dividido por igual. A fatura do empreiteiro sai
  //    pela BASE: o IVA não é pago com ela, é autoliquidado e entregue com o
  //    apuramento do trimestre (ponto 6).
  const basePorMes = repartir(porGastar, meses.length);
  // O IVA reparte-se pela proporção da base, por soma corrida: assim a soma
  // das linhas de obra com as de IVA fecha ao cêntimo com o que falta gastar,
  // em vez de ficar a um ou dois cêntimos por causa dos arredondamentos mês
  // a mês. Cada mês continua a ter o IVA da sua própria base.
  const ivaTotal = ivaPorGastar;
  const ivaPorMes = (() => {
    let pago = 0, baseAcum = 0;
    return basePorMes.map((b, i) => {
      baseAcum = arred2(baseAcum + b);
      const alvo = i === basePorMes.length - 1
        ? ivaTotal
        : arred2(porGastar > 0 ? ivaTotal * baseAcum / porGastar : 0);
      const v = arred2(alvo - pago);
      pago = arred2(pago + v);
      return v;
    });
  })();
  const obraBaseMes = basePorMes[0];          // o mês típico, para os textos
  const obraIvaMes  = ivaPorMes[0];

  // 2 e 3. Avenças: o valor é o mesmo todos os meses, e são tantos meses
  //    quantos a obra durar. É aqui que esticar o prazo custa dinheiro.
  //
  //    Ao contrário da empreitada, estas faturas vêm COM IVA e pagam-se com
  //    ele: não há inversão do sujeito passivo em serviços de fiscalização e
  //    de coordenação de segurança. O valor que se introduz é a avença; o
  //    IVA é acrescentado.
  const taxaServicos = num(p.taxa_iva_servicos, 23);
  const comIva = (v) => arred2(v * (1 + taxaServicos / 100));
  const fiscBase = arred2(num(p.fiscalizacao_mensal));
  const csoBase  = arred2(num(p.cso_mensal));
  const fisc = comIva(fiscBase);
  const cso  = comIva(csoBase);

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
  // O campo chama-se `recuperar_iva` por razões históricas; o que ele liga e
  // desliga é o financiamento do IVA pelo banco. O rótulo no ecrã é esse.
  const financiaIva = p.recuperar_iva !== false;
  // E a percentagem é independente da da obra: há bancos que financiam a
  // empreitada a 80% e o IVA a 100%, porque o IVA volta por reembolso. Em
  // branco, segue a da obra — que era o que acontecia antes deste campo
  // existir, e por isso nada muda para quem não lhe tocar.
  const pctFundingIva = (p.funding_iva_pct === null || p.funding_iva_pct === undefined
                         || p.funding_iva_pct === "")
    ? pctFunding
    : Math.min(100, Math.max(0, num(p.funding_iva_pct)));
  let divida       = arred2(num(p.divida_inicial));
  let mesFimDaObra = "";

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
            funding: financiaIva ? arred2(valor * pctFundingIva / 100) : 0 };
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

    if (fisc > 0) linhas.push(linha("fiscalizacao", mes, fisc, grupo, {
      descricao: `Fiscalização de obra — ${rotuloMes(mes)}`,
      obs: `Avença ${fiscBase} € + IVA ${arred2(fisc - fiscBase)} € (${taxaServicos}%)`,
      base: fiscBase, iva: arred2(fisc - fiscBase),
    }));
    if (cso > 0)  linhas.push(linha("cso", mes, cso, grupo, {
      descricao: `CSO — ${rotuloMes(mes)}`,
      obs: `Avença ${csoBase} € + IVA ${arred2(cso - csoBase)} € (${taxaServicos}%)`,
      base: csoBase, iva: arred2(cso - csoBase),
    }));

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

    // A mensagem certa depende de haver ou não escritura marcada para depois:
    // a fiscalização e o CSO param com a obra, mas os juros correm enquanto a
    // dívida existir. Dizer "até aqui" quando não é verdade seria pior do que
    // não dizer nada.
    if (ultimo) mesFimDaObra = mes;
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
          obs: `${arred2(pctFundingIva)}% de ${e.valor} € de IVA` +
               (pctFundingIva !== pctFunding ? ` (a obra é financiada a ${arred2(pctFunding)}%)` : ""),
        }),
        tipo: "entrada", data: e.data,
      });
      // Um pagamento de IVA depois do fim da obra não gera mais linhas de
      // juros (o motor só vai até ao fim da obra), mas conta na dívida.
      if (mesDe(e.data) > ultimoMesObra) divida = arred2(divida + e.funding);
    }
  });

  if (mesFimDaObra) {
    const jurosMaisLonge = Math.max(0, Math.round(num(p.meses_ate_escritura))) > 0;
    avisos.push(`A obra termina em ${rotuloMes(mesFimDaObra)}: é até aí que se pagam ` +
      (jurosMaisLonge
        ? `fiscalização e CSO. Os juros continuam até à escritura, porque a dívida continua lá.`
        : `fiscalização, CSO e juros.`));
  }

  // ── 7. Da obra à escritura ───────────────────────────────────────────────
  // A obra acaba, mas o projeto não: há despesas de fecho, a venda e o
  // pagamento ao banco. A escritura cai `meses_ate_escritura` meses depois do
  // último mês de obra — zero quer dizer no próprio mês em que a obra acaba.
  const mesesAteEscritura = Math.max(0, Math.round(num(p.meses_ate_escritura)));
  const despesasFecho = (Array.isArray(p.despesas_fecho) ? p.despesas_fecho : [])
    .filter(d => Math.abs(num(d?.valor)) > 0.005);

  // A escritura só existe quando o utilizador a definiu: pôs um prazo, um
  // valor de venda ou despesas de fecho. Sem isso o plano fica exatamente
  // como estava — um plano antigo não pode começar a amortizar a dívida toda
  // sozinho só porque o motor aprendeu a fazê-lo.
  // O que entra na escritura. Por omissão segue a tabela de vendas: o que
  // falta receber, calculado em src/vendas.js e passado aqui de fora. Escrever
  // um número no campo é uma decisão de quem está a planear, e nesse caso manda
  // esse — mas um campo vazio deixa de significar "zero" e passa a significar
  // "o que a tabela de vendas disser", que é o que não envelhece.
  const vendaManual = Math.abs(num(p.valor_venda));
  const venda = vendaManual > 0.005 ? vendaManual : Math.abs(num(vendaNaEscritura));

  const temEscritura = mesesAteEscritura > 0 ||
                       venda > 0.005 ||
                       despesasFecho.length > 0;
  const mesEscritura = (temEscritura && ultimoMesObra)
    ? somarMeses(ultimoMesObra, mesesAteEscritura) : "";

  // Enquanto não se vende, a dívida continua a vencer juros. Até aqui o motor
  // parava no fim da obra e o custo desses meses desaparecia; agora cobra-se
  // até à escritura, que é quando o banco é pago. A fiscalização e o CSO NÃO
  // continuam: a obra acabou.
  if (mesEscritura && mesesAteEscritura > 0 && taxaAnual > 0) {
    // O IVA que ainda cai nestes meses também engrossa a dívida, no mês certo.
    const ivaPorMes = new Map();
    pagamentosIva.forEach(e => {
      const m = mesDe(e.data);
      if (m > ultimoMesObra && m <= mesEscritura && e.funding > 0)
        ivaPorMes.set(m, arred2((ivaPorMes.get(m) || 0) + e.funding));
    });
    // A dívida já leva o funding de IVA pós-obra somado no passo anterior:
    // tira-se aqui para o voltar a somar mês a mês, na data certa.
    let saldo = arred2(divida - [...ivaPorMes.values()].reduce((a, b) => a + b, 0));
    mesesEntre(somarMeses(ultimoMesObra, 1), `${mesEscritura}-28`).forEach(mes => {
      const fim = arred2(saldo + (ivaPorMes.get(mes) || 0));
      const medio = arred2((saldo + fim) / 2);
      if (medio > 0) {
        linhas.push(linha("juros", mes, arred2(medio * taxaAnual / 100 / 12), grupo, {
          descricao: "Juros do financiamento",
          obs: `Entre o fim da obra e a escritura · saldo médio ${medio} €`,
          dia: "fim",
        }));
      }
      saldo = fim;
    });
    divida = saldo;
  }

  // As despesas de fecho: licença de utilização, certificações, o que for.
  // Cada uma pode ir para a sua rubrica — é assim que caem no sítio certo do
  // Real × Orçado em vez de ficarem todas num balde.
  if (mesEscritura) {
    despesasFecho.forEach((d, i) => {
      const valor = Math.abs(num(d?.valor));
      const classe = String(d?.categoria || "").trim()
        ? { categoria: d.categoria, ...(d.subcategoria ? { subcategoria: d.subcategoria } : {}) }
        : null;
      linhas.push({
        ...linha("fecho", mesEscritura, valor, grupo, {
          descricao: String(d?.descricao || "").trim() || `Despesa de fecho ${i + 1}`,
          obs: "Fecho de obra, no mês da escritura",
          dia: "fim",
        }),
        ...(classe || {}),
      });
    });

    // A venda entra, e o banco é pago com ela.
    if (venda > 0.005) {
      linhas.push({
        ...linha("venda", mesEscritura, venda, grupo, {
          descricao: "Venda — escritura",
          obs: (mesesAteEscritura > 0
                 ? `${mesesAteEscritura} ${mesesAteEscritura === 1 ? "mês" : "meses"} após o fim da obra`
                 : "No mês em que a obra acaba")
               + (vendaManual > 0.005 ? " · valor escrito à mão"
                                      : " · o que falta receber da tabela de vendas"),
          dia: "fim",
        }),
        tipo: "entrada",
      });
    }

    if (p.amortizar_divida !== false && divida > 0.005) {
      linhas.push(linha("amortizacao", mesEscritura, arred2(divida), grupo, {
        descricao: "Amortização da dívida ao banco",
        obs: "Toda a dívida em aberto, liquidada na escritura",
        dia: "fim",
      }));
      if (venda > 0.005 && venda < divida)
        avisos.push(`A venda (${eur(venda)}) não chega para pagar a dívida ` +
                    `(${eur(divida)}) — faltam ${eur(divida - venda)}.`);
      divida = 0;
    }
  }

  if (pagamentosIva.some(e => mesDe(e.data) > (mesEscritura || ultimoMesObra)))
    avisos.push(mesEscritura
      ? "Há IVA a pagar depois da escritura. Aparece no fluxo, mas a essa " +
        "altura já não há dívida a vencer juros."
      : "Há IVA a pagar depois do fim da obra. Aparece no fluxo, mas os juros " +
        "só são calculados até ao último mês de obra.");

  linhas.sort((a, b) => a.data.localeCompare(b.data) || TIPOS.indexOf(a.plano_tipo) - TIPOS.indexOf(b.plano_tipo));
  return { linhas, avisos, resumo: resumir(linhas, { budget, budgetBruto, ivaDoBudget, gasto, gastoBase, gastoIva,
                    porGastar, porGastarBruto, ivaPorGastar, meses, dividaFinal: divida,
                    mesEscritura, mesesAteEscritura }) };
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

function resumir(linhas, { budget, budgetBruto = 0, ivaDoBudget = 0,
                           gasto, gastoBase = 0, gastoIva = 0,
                           porGastar, porGastarBruto = 0, ivaPorGastar = 0,
                           meses, dividaFinal = 0, mesEscritura = null,
                           mesesAteEscritura = 0 }) {
  const soma = (t) => arred2(linhas.filter(l => l.plano_tipo === t)
    .reduce((s, l) => s + (l.tipo === "entrada" ? -l.valor : l.valor), 0));
  const totais = Object.fromEntries(TIPOS.map(t => [t, soma(t)]));
  const custoTotal = arred2(TIPOS.reduce((s, t) => s + totais[t], 0));
  return {
    budget: arred2(budget), budgetBruto: arred2(budgetBruto),
    ivaDoBudget: arred2(ivaDoBudget),
    gasto, gastoBase: arred2(gastoBase), gastoIva: arred2(gastoIva),
    porGastar, porGastarBruto: arred2(porGastarBruto),
    ivaPorGastar: arred2(ivaPorGastar),
    meses: meses.length,
    primeiroMes: meses[0] || null,
    ultimoMes: meses[meses.length - 1] || null,
    totais,
    custoTotal,
    dividaFinal: arred2(dividaFinal),
    mesEscritura: mesEscritura || null, mesesAteEscritura,
    nLinhas: linhas.length,
  };
}

// ─── Despesas agarradas ao plano ────────────────────────────────────────────
// Uma previsão manual pode ficar PRESA a um marco do plano em vez de a uma
// data fixa. O caso que deu origem a isto: o resgate ao Enchanted paga-se na
// escritura — se a obra escorregar dois meses, aquela data tem de escorregar
// também, e ninguém se lembra de a ir muder à mão.
//
// Guarda-se a âncora e o desvio em meses; a data continua gravada em
// `data_inicio`, para tudo o resto no sistema continuar a ler o que sempre
// leu. O que muda é que um recálculo do plano a volta a escrever.
export const ANCORAS = {
  fim_obra:  "Fim da obra",
  escritura: "Escritura",
};

/**
 * A data de uma despesa agarrada ao plano.
 *
 * @param alvo   { ancora, ancora_meses, dia } — o dia do mês que se quer
 *               manter; se o mês for curto, encosta-se ao último dia.
 * @param plano  o plano de obra da empresa (precisa de data_fim e,
 *               para a âncora "escritura", de meses_ate_escritura)
 * @returns      "AAAA-MM-DD", ou null se não houver âncora ou plano
 */
export function dataAncorada({ ancora, ancora_meses = 0, dia = 1 } = {}, plano) {
  if (!ancora || !ANCORAS[ancora]) return null;
  const fim = mesDe(plano?.data_fim || "");
  if (!fim) return null;
  const base = ancora === "escritura"
    ? somarMeses(fim, Math.max(0, Math.round(num(plano?.meses_ate_escritura))))
    : fim;
  const mes = somarMeses(base, Math.round(num(ancora_meses)));
  const d = Math.min(Math.max(1, Math.round(num(dia, 1))),
                     Number(ultimoDia(mes).slice(-2)));
  return noMes(mes, d);
}

export const diaDe = (iso) => {
  const d = Number(String(iso || "").slice(8, 10));
  return Number.isFinite(d) && d >= 1 ? d : 1;
};

// Como se lê uma âncora, para o ecrã: "Escritura + 1 mês".
export function rotuloAncora(ancora, meses = 0) {
  if (!ANCORAS[ancora]) return "";
  const n = Math.round(num(meses));
  if (n === 0) return ANCORAS[ancora];
  const abs = Math.abs(n);
  return `${ANCORAS[ancora]} ${n > 0 ? "+" : "−"} ${abs} ${abs === 1 ? "mês" : "meses"}`;
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
  primeiroMes = null, hoje = hojeISO(), plano = null,
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

  // As previsões já pagas ou convertidas em fatura não são apagadas (regra 1),
  // mas os ids do motor são determinísticos — por isso o recálculo gerava
  // outra vez o id de uma que já lá estava, e o INSERT rebentava com
  // "duplicate key value violates unique constraint pagamentos_extras_pkey".
  //
  // A chave primária estava a proteger-te de pior: se a linha entrasse, ficava
  // ao lado da que já foi paga e a despesa contava duas vezes. Uma despesa
  // liquidada é passado, e passado não se prevê — por isso sai do que entra,
  // e diz-se quais foram, para não desaparecerem em silêncio.
  const jaLiquidadas = new Map(
    (pagamentosExistentes || [])
      .filter(p => p && p.empresa === empresa && INTOCAVEL.test(String(p.status || "")))
      .map(p => [String(p.id), p]));

  const todas = linhas.map(l => ({
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

  const aCriar = todas.filter(l => !jaLiquidadas.has(l.id));
  // O que o motor queria lançar e já está liquidado — com a linha que lá está,
  // para o ecrã poder dizer qual é e com que estado.
  const jaPagas = todas
    .filter(l => jaLiquidadas.has(l.id))
    .map(l => ({ ...l, existente: jaLiquidadas.get(l.id) }));

  // ── As despesas agarradas ao plano ────────────────────────────────────────
  // Não são do motor e não se apagam: são do utilizador. O que o recálculo
  // lhes faz é mudar a data, para continuarem presas ao marco que ele
  // escolheu. Só entram aqui as que mudam mesmo de data.
  const aApagarIds = new Set([...aApagarDoMotor, ...aApagarManuais].map(p => p.id));
  const aReagendar = daEmpresa
    .filter(p => p.ancora && ANCORAS[p.ancora] && !p.plano_obra && !aApagarIds.has(p.id))
    .map(p => {
      const nova = dataAncorada(
        { ancora: p.ancora, ancora_meses: p.ancora_meses, dia: diaDe(p.data_inicio) }, plano);
      return (nova && nova !== String(p.data_inicio || ""))
        ? { id: p.id, de: String(p.data_inicio || ""), para: nova,
            descricao: p.descricao, valor: p.valor, categoria: p.categoria,
            rotulo: rotuloAncora(p.ancora, p.ancora_meses) }
        : null;
    })
    .filter(Boolean);

  const somar = (arr) => arred2(arr.reduce((s, p) => s + (Number(p.valor) || 0), 0));
  return {
    aCriar, aApagarDoMotor, aApagarManuais, jaPagas, aReagendar,
    idsAApagar: [...aApagarDoMotor, ...aApagarManuais].map(p => p.id),
    resumo: {
      criar: aCriar.length,          valorCriar: somar(aCriar),
      apagarMotor: aApagarDoMotor.length, valorMotor: somar(aApagarDoMotor),
      apagarManuais: aApagarManuais.length, valorManuais: somar(aApagarManuais),
      jaPagas: jaPagas.length,       valorJaPagas: somar(jaPagas),
      reagendar: aReagendar.length,
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
