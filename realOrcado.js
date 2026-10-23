// ─────────────────────────────────────────────────────────────────────────────
// REAL × ORÇADO
//
// Três colunas, três naturezas diferentes:
//
//   ORÇADO     o que se contratou com os investidores. É ESTÁTICO: escreve-se
//              uma vez por rubrica e fica. Só muda quando há uma revisão de
//              orçamento, e isso é uma decisão, não um cálculo.
//
//   REAL       o que já saiu ou entrou na conta. Vem do extrato, pela vida
//              toda do projeto — não do período escolhido no filtro, que é
//              para os gráficos. Um orçamento compara-se com o acumulado.
//
//   FORECAST   o Real mais tudo o que já está comprometido e ainda não passou
//              pela conta: faturas por pagar, previsões do Fluxo Futuro (onde
//              entra o plano de obra) e as despesas recorrentes. É VIVO: muda
//              sozinho sempre que se lança uma previsão ou se recalcula um
//              plano de obra.
//
// As rubricas são as mesmas de todo o sistema (src/rubricas.js) — as do
// Categorias.xlsx de cada empresa. O gráfico, o extrato e esta tabela falam a
// mesma língua, senão não se consegue cruzar nada.
//
// SINAIS. Por dentro é tudo com sinal de caixa: entradas positivas, saídas
// negativas. O ecrã mostra valores absolutos, agrupados em Entradas e Saídas,
// que é como as planilhas de fluxo operacional estão feitas — e é assim que o
// orçado se escreve, sem ter de pensar em sinais.
// ─────────────────────────────────────────────────────────────────────────────

import { rubricasDa, rubricaDe, chaveRubrica, rubricaNoPlano,
         ehCapital, ehFunding, ehAjuste, ordemDaRubrica } from "./rubricas.js";
import { ocorrenciasDe } from "./recorrentes.js";
import { comissaoDaVenda, soReceita, vgvPorReceber } from "./vendas.js";

const arred2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Estados que já não contam como compromisso por vir.
const FATURA_PAGA = /^(paga|pago|liquidada|liquidado)$/i;
const FATURA_MORTA = /anulada|cancelada|rejeitada/i;
const PREVISAO_FORA = /^(convertida|paga|pago)$/i;

export const id_orcamento = (empresaId, rubrica) =>
  `orc_${empresaId}_${chaveRubrica(rubrica).replace(/[^a-z0-9]+/g, "_")}`;

/**
 * A tabela do Real × Orçado de uma empresa.
 *
 * @param empresaId    a empresa
 * @param movimentos   extrato (vida toda do projeto)
 * @param faturas      Contas a Pagar
 * @param pagamentos   pagamentos_extras (previsões do Fluxo Futuro)
 * @param recorrentes  despesas_recorrentes
 * @param vendas       vendas registadas (o que falta receber de cada fração)
 * @param recebiveis   Contas a Receber ainda por entrar
 * @param nomeEmpresa  o nome do projeto, que é a chave das vendas
 * @param orcamento    linhas da tabela `orcamento` (o estático)
 * @param hoje         data de referência, injetável para os testes
 * @param horizonte    até quando contar as recorrentes (ISO). Por omissão,
 *                     três anos — o mesmo horizonte do Fluxo Futuro.
 */
// Os documentos de uma parcela, prontos para o ecrã: os maiores primeiro, e o
// resto numa linha só. Devolver cinquenta linhas não ajudava ninguém.
const MAX_DOCS = 8;
function resumirDocs(lista) {
  const ls = (lista || []).filter(d => Math.abs(num(d?.valor)) > 0.005)
    .sort((a, b) => Math.abs(num(b.valor)) - Math.abs(num(a.valor)));
  if (ls.length <= MAX_DOCS) return ls.map(d => ({ ...d, valor: arred2(d.valor) }));
  const topo = ls.slice(0, MAX_DOCS).map(d => ({ ...d, valor: arred2(d.valor) }));
  const resto = ls.slice(MAX_DOCS);
  const soma = arred2(resto.reduce((s, d) => s + num(d.valor), 0));
  return [...topo, { texto: `e mais ${resto.length}`, valor: soma, data: "", resto: true }];
}

export function calcularRealOrcado({
  empresaId, nomeEmpresa = "",
  movimentos = [], faturas = [], pagamentos = [], recorrentes = [],
  vendas = [], recebiveis = [], fracoes = [],
  orcamento = [], hoje = new Date().toISOString().slice(0, 10), horizonte = null,
} = {}) {
  const ate = horizonte || `${Number(String(hoje).slice(0, 4)) + 3}${String(hoje).slice(4, 10)}`;

  // Um balde por rubrica. Começa-se pelo plano, para que uma rubrica orçada e
  // ainda sem um único movimento apareça à mesma — é precisamente essa que
  // interessa ver numa reunião de investidores.
  const baldes = new Map();
  const balde = (r) => {
    if (!baldes.has(r)) baldes.set(r, {
      rubrica: r, orcado: 0, real: 0,
      faturasPorPagar: 0, previsoes: 0, recorrentes: 0, porReceber: 0,
      nMovimentos: 0, nFaturas: 0, nPrevisoes: 0, nRecorrentes: 0, nPorReceber: 0,
      // Os documentos por trás de cada parcela. Sem isto, um forecast que não
      // bate obriga a ir procurar a quatro ecrãs diferentes.
      docs: { real: [], faturas: [], previsoes: [], recorrentes: [], porReceber: [] },
      noPlano: rubricaNoPlano(empresaId, r),
    });
    return baldes.get(r);
  };
  // Os ajustes ficam de fora: não são dinheiro que o projeto ganhou ou gastou,
  // e uma linha de ajustes num quadro de orçamento só levanta perguntas.
  rubricasDa(empresaId).filter(r => !ehAjuste(r)).forEach(balde);

  // ── Orçado ────────────────────────────────────────────────────────────────
  // Guardado em módulo (sempre positivo); a rubrica é a chave.
  //
  // Pode haver MAIS DO QUE UMA linha para a mesma rubrica. As migrações que
  // semearam os orçamentos deram-lhes ids por número — 'orc_favcloset_09' —
  // e a aplicação grava em 'orc_favcloset_obra'. O upsert não encontrava a
  // linha semeada, criava outra ao lado, e depois era o acaso a decidir qual
  // das duas aparecia: o utilizador escrevia um valor novo e via o antigo
  // voltar. Aqui ganha sempre a mais recente — que é a que ele acabou de
  // escrever — e, em caso de empate, a que tem o id canónico.
  // O supabase/orcamento-ids.sql arruma os duplicados de vez.
  const quando = (o) => { const t = Date.parse(o?.updated_at || ""); return Number.isFinite(t) ? t : 0; };
  const porRubrica = new Map();
  (orcamento || []).forEach(o => {
    if (o?.empresa_id !== empresaId) return;
    const r = rubricasDa(empresaId).find(c => chaveRubrica(c) === chaveRubrica(o.categoria))
            || String(o.categoria || "").trim();
    if (!r) return;
    const atual = porRubrica.get(r);
    const ganha = !atual || quando(o) > quando(atual)
      || (quando(o) === quando(atual) && o.id === id_orcamento(empresaId, r));
    if (ganha) porRubrica.set(r, o);
  });
  porRubrica.forEach((o, r) => { balde(r).orcado = Math.abs(num(o.orcado)); });

  // ── Real ──────────────────────────────────────────────────────────────────
  (movimentos || []).forEach(m => {
    const r = rubricaDe(empresaId, m?.categoria, m?.subcategoria);
    if (r === null) return;
    const b = balde(r);
    b.real += num(m?.valor);
    b.nMovimentos++;
    b.docs.real.push({ texto: m?.movimento || m?.detalhes || "(sem descrição)",
                       valor: num(m?.valor), data: m?.data || "" });
  });

  // ── Comprometido: faturas por pagar ──────────────────────────────────────
  (faturas || []).forEach(f => {
    if (f?.empresa !== empresaId) return;
    const estado = String(f?.status || "").trim();
    if (FATURA_PAGA.test(estado) || FATURA_MORTA.test(estado)) return;
    const r = rubricaDe(empresaId, f?.categoria, f?.subcategoria);
    if (r === null) return;
    const b = balde(r);
    b.faturasPorPagar -= Math.abs(num(f?.valor));   // uma fatura por pagar é saída
    b.nFaturas++;
    b.docs.faturas.push({ texto: [f?.fornecedor, f?.fatura].filter(Boolean).join(" · ")
                                 || f?.descricao || "(fatura)",
                          valor: -Math.abs(num(f?.valor)), data: f?.vencimento || "" });
  });

  // ── Comprometido: previsões do Fluxo Futuro (inclui o plano de obra) ─────
  (pagamentos || []).forEach(p => {
    if (p?.empresa !== empresaId) return;
    if (PREVISAO_FORA.test(String(p?.status || "").trim())) return;
    const r = rubricaDe(empresaId, p?.categoria, p?.subcategoria);
    if (r === null) return;
    const b = balde(r);
    const v = Math.abs(num(p?.valor));
    b.previsoes += p?.tipo === "entrada" ? v : -v;
    b.nPrevisoes++;
    b.docs.previsoes.push({ texto: p?.descricao || "(previsão)",
                            valor: p?.tipo === "entrada" ? v : -v,
                            data: p?.data_inicio || "" });
  });

  // ── Comprometido: as vendas por receber ──────────────────────────────────
  // Esta é a entrada que faltava. O "Real" das vendas só conta o que já
  // entrou na conta; mas um CPCV assinado com escritura marcada é dinheiro
  // contratado, e é assim que ele aparece nos fluxos operacionais. Sem isto,
  // o forecast das vendas ficava igual ao realizado e o projeto parecia
  // vender menos de metade do orçado até ao dia da escritura.
  //
  // Duas origens, sem se pisarem: as VENDAS (por projeto, o que falta receber
  // de cada fração) e os RECEBÍVEIS (faturas emitidas e entradas previstas no
  // Contas a Receber).
  const rubricaVendas = rubricasDa(empresaId).find(c => chaveRubrica(c) === "vendas") || "Vendas";
  const rubricaComissao = rubricasDa(empresaId).find(c => chaveRubrica(c) === "comissao") || null;

  const fracaoDa = (v) => (fracoes || []).find(f => f.id === v?.fracao_id) || null;

  (vendas || []).forEach(v => {
    if (!nomeEmpresa || v?.projeto !== nomeEmpresa) return;
    // A comissão do mediador ainda por pagar é um compromisso como outro —
    // com IVA, que é o que sai da conta.
    if (rubricaComissao) {
      const com = comissaoDaVenda(v, fracaoDa(v)).porPagarComIva;
      if (com > 0.005) {
        const b = balde(rubricaComissao);
        b.porReceber -= com;
        b.nPorReceber++;
        b.docs.porReceber.push({
          texto: `Comissão por pagar · ${v?.fracao || v?.cliente || "venda"}`,
          valor: -com, data: v?.previsao_escritura || "" });
      }
    }
  });

  // Só faturas de receita: o funding do banco não é venda nenhuma.
  soReceita(recebiveis || []).forEach(rc => {
    if (rc?.empresa !== empresaId) return;
    if (/^(recebido|cancelado|anulada)$/i.test(String(rc?.status || "").trim())) return;
    const valor = Math.abs(num(rc?.valor));
    if (!(valor > 0.005)) return;
    const b = balde(rubricaVendas);
    b.porReceber += valor;
    b.nPorReceber++;
    b.docs.porReceber.push({
      texto: [rc?.cliente, rc?.descricao || rc?.numero_fatura].filter(Boolean).join(" · ")
             || "(contas a receber)",
      valor, data: rc?.vencimento || rc?.data || "" });
  });

  // ── As vendas por receber: o FLUXO manda ─────────────────────────────────
  // O forecast das vendas vem do Fluxo Futuro — as previsões que o plano de
  // obra lança e os recebíveis do Contas a Receber. A tabela de vendas é a
  // mesma receita vista de outro lado, por isso NÃO se soma: somar as duas
  // dava o dobro do que o projeto tem para receber.
  //
  // Era o que acontecia. O código antigo descontava as previsões do fluxo mas
  // ignorava os recebíveis, e numa empresa cujos recebimentos estão todos no
  // Contas a Receber a tabela inteira entrava por cima: 4,8 M a mais na
  // Admirable Sequence.
  //
  // A tabela só entra quando o fluxo não diz NADA sobre vendas — senão um
  // projeto sem previsões lançadas mostrava forecast igual ao já recebido,
  // que também não é verdade. Quando entra, o painel do forecast di-lo.
  if (nomeEmpresa) {
    const b0 = baldes.get(rubricaVendas);
    const jaNoFluxo = Math.abs(num(b0?.previsoes)) + Math.abs(num(b0?.porReceber));
    if (jaNoFluxo <= 0.005) {
      const vgv = vgvPorReceber({ fracoes, vendas, movimentos,
                                  projeto: nomeEmpresa, empresaId });
      const falta = arred2(Math.max(0, vgv.total - vgv.recebido));
      if (falta > 0.005) {
        const b = balde(rubricaVendas);
        b.porReceber += falta;
        b.nPorReceber++;
        b.docs.porReceber.push({
          texto: `Tabela de vendas (o fluxo não tem previsões de venda) · ${vgv.nFracoes || ""} fração(ões)`.trim(),
          valor: falta, data: "" });
      }
    }
  }

  // ── Comprometido: despesas recorrentes ───────────────────────────────────
  // Só o que falta acontecer: o que já passou está no extrato ou nas faturas.
  (recorrentes || []).forEach(reg => {
    if (reg?.empresa !== empresaId) return;
    if (reg?.ativa === false) return;
    const r = rubricaDe(empresaId, reg?.categoria, reg?.subcategoria);
    if (r === null) return;
    const oc = ocorrenciasDe(reg, { de: hoje, ate: reg?.data_fim || ate });
    if (!oc.length) return;
    const b = balde(r);
    const total = oc.reduce((s, o) => s + Math.abs(o.valor), 0);
    b.recorrentes += reg?.tipo === "entrada" ? total : -total;
    b.nRecorrentes += oc.length;
    b.docs.recorrentes.push({
      texto: `${reg?.descricao || "(recorrente)"} · ${oc.length}× ${reg?.periodicidade || ""}`.trim(),
      valor: reg?.tipo === "entrada" ? total : -total,
      data: oc[0]?.data || "" });
  });

  // ── Fechar as contas de cada rubrica ─────────────────────────────────────
  const linhas = [...baldes.values()].map(b => {
    const real = arred2(b.real);
    const comprometido = arred2(b.faturasPorPagar + b.previsoes + b.recorrentes + b.porReceber);
    const forecast = arred2(real + comprometido);

    // Em que lado da tabela esta rubrica vive. Decide o forecast; sem
    // movimento nenhum, decide o real; sem nada, fica nas saídas, que é o que
    // uma rubrica de custo orçada e ainda por gastar é.
    const referencia = Math.abs(forecast) > 0.005 ? forecast
                     : Math.abs(real) > 0.005 ? real : -1;
    const lado = referencia >= 0 ? "entrada" : "saida";

    // O ecrã trabalha em módulo: o orçado escreve-se sem sinal e o desvio
    // lê-se como "acima" ou "abaixo", que é o que se pergunta numa reunião.
    const orcado = arred2(b.orcado);
    const realAbs = Math.abs(real), forecastAbs = Math.abs(forecast);
    const desvio = arred2(forecastAbs - orcado);
    const desvioPct = orcado > 0.005 ? arred2(desvio / orcado * 100) : null;

    return {
      rubrica: b.rubrica, lado, noPlano: b.noPlano,
      orcado, real, realAbs, comprometido, forecast, forecastAbs,
      desvio, desvioPct,
      // Gastar menos do que o orçado é bom numa saída; vender menos do que o
      // orçado é mau numa entrada. O ecrã pinta por aqui, não pelo sinal.
      bom: orcado <= 0.005 ? null : (lado === "saida" ? desvio <= 0 : desvio >= 0),
      detalhe: {
        faturasPorPagar: arred2(b.faturasPorPagar),
        previsoes: arred2(b.previsoes),
        recorrentes: arred2(b.recorrentes),
        porReceber: arred2(b.porReceber),
        nMovimentos: b.nMovimentos, nFaturas: b.nFaturas,
        nPrevisoes: b.nPrevisoes, nRecorrentes: b.nRecorrentes,
        nPorReceber: b.nPorReceber,
        // Os documentos de cada parcela, os maiores primeiro. Mais do que uma
        // dúzia não cabe num painel nem se lê — o resto vai somado numa linha,
        // para o total continuar a fechar à vista.
        docs: Object.fromEntries(Object.entries(b.docs)
          .map(([k, lista]) => [k, resumirDocs(lista)])),
      },
      // Uma rubrica sem orçado e sem nada que se lhe diga não vale uma linha.
      vazia: orcado <= 0.005 && Math.abs(real) <= 0.005 && Math.abs(comprometido) <= 0.005,
      // Capital e financiamento: aportes, resgates, mútuos, funding e
      // amortização nas empresas LPX; o grupo "Financiamento" da FO inteiro
      // nos projetos HDG. É como o projeto é PAGO, não o que o projeto FAZ, e
      // por isso não entra na conta de exploração: é a terceira secção.
      capital: ehFunding(b.rubrica),
      ordem: ordemDaRubrica(empresaId, b.rubrica),
    };
  }).sort((a, b) => a.ordem - b.ordem ||
                    String(a.rubrica).localeCompare(String(b.rubrica), "pt"));

  // A tabela mostra a operação: de "Vendas" para baixo, que é onde o bloco de
  // capital que abre todos os planos acaba. O capital fica guardado à parte,
  // para quem o quiser ver sem o misturar com a exploração.
  const soma = (ls, campo) => arred2(ls.reduce((s, l) => s + l[campo], 0));
  const operacao = linhas.filter(l => !l.capital);
  const capital = linhas.filter(l => l.capital);
  const entradas = operacao.filter(l => l.lado === "entrada");
  const saidas = operacao.filter(l => l.lado === "saida");

  const totalDe = (ls) => ({
    orcado: soma(ls, "orcado"),
    real: arred2(ls.reduce((s, l) => s + Math.abs(l.real), 0)),
    forecast: arred2(ls.reduce((s, l) => s + Math.abs(l.forecast), 0)),
  });
  const tE = totalDe(entradas), tS = totalDe(saidas);

  // A terceira secção leva os dois sentidos — o desembolso e a amortização —,
  // por isso o seu total é LÍQUIDO: somar os dois em absoluto daria um número
  // que não quer dizer nada.
  const fundingEntradas = capital.filter(l => l.lado === "entrada");
  const fundingSaidas = capital.filter(l => l.lado === "saida");
  const tFE = totalDe(fundingEntradas), tFS = totalDe(fundingSaidas);
  const tC = totalDe(capital);
  const tFL = {
    orcado: arred2(tFE.orcado - tFS.orcado),
    real: arred2(tFE.real - tFS.real),
    forecast: arred2(tFE.forecast - tFS.forecast),
  };

  return {
    linhas, operacao, capital,
    entradas, saidas,
    fundingEntradas, fundingSaidas,
    totaisFunding: { entradas: tFE, saidas: tFS, liquido: tFL },
    totaisCapital: tC,
    totais: {
      entradas: tE, saidas: tS,
      resultado: {
        orcado: arred2(tE.orcado - tS.orcado),
        real: arred2(tE.real - tS.real),
        forecast: arred2(tE.forecast - tS.forecast),
      },
    },
    // Quanto do orçado já está escrito: numa empresa sem orçado nenhum, o
    // ecrã tem de dizer isso em vez de mostrar uma coluna de zeros.
    nOrcadas: operacao.filter(l => l.orcado > 0.005).length,
    nComMovimento: operacao.filter(l => !l.vazia).length,
    nCapital: capital.filter(l => !l.vazia).length,
  };
}

// ─── Quem pode escrever o orçado ────────────────────────────────────────────
// O orçamento é o compromisso com os investidores. Ao contrário da
// classificação de um lançamento, que a equipa toda revê, este número é de uma
// pessoa só: muda-se numa revisão de orçamento, não no dia a dia.
//
// Para passar a caneta a outra pessoa, acrescenta-se aqui o e-mail da conta
// dela no ERP. O ecrã diz sempre quem pode editar, para ninguém ficar sem
// perceber porque é que a célula está trancada.
export const DONOS_DO_ORCAMENTO = [
  "felipe@riocapital.pt",
  "felipe@lpxprivate.com",
];

export function podeEditarOrcado(utilizador) {
  const email = String(utilizador?.email || "").toLowerCase().trim();
  return !!email && DONOS_DO_ORCAMENTO.includes(email);
}

// ─── Semear o orçado a partir do modelo antigo ──────────────────────────────
// Os números que estavam escritos à mão em src/modeloRealOrcado.js foram
// transcritos dos business plans. Onde o rótulo do modelo bate numa rubrica da
// empresa, aproveita-se — poupa reescrever catorze linhas por projeto. Onde
// não bate, fica em branco: inventar um orçado seria pior do que não ter.
export function semearDoModelo(modelo, empresaId) {
  if (!modelo?.linhas) return [];
  const plano = rubricasDa(empresaId);
  const out = [];
  modelo.linhas.forEach(l => {
    if (l.tipo !== "item" || !l.rotulo) return;
    const valor = Number(l.orcado);
    if (!Number.isFinite(valor) || Math.abs(valor) <= 0.005) return;
    const r = plano.find(c => chaveRubrica(c) === chaveRubrica(l.rotulo));
    if (!r) return;
    out.push({ rubrica: r, orcado: Math.abs(valor) });
  });
  return out;
}

export default { calcularRealOrcado, semearDoModelo, id_orcamento,
                 podeEditarOrcado, DONOS_DO_ORCAMENTO };
