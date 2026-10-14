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
         ehCapital, ehAjuste, ordemDaRubrica } from "./rubricas.js";
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
      noPlano: rubricaNoPlano(empresaId, r),
    });
    return baldes.get(r);
  };
  // Os ajustes ficam de fora: não são dinheiro que o projeto ganhou ou gastou,
  // e uma linha de ajustes num quadro de orçamento só levanta perguntas.
  rubricasDa(empresaId).filter(r => !ehAjuste(r)).forEach(balde);

  // ── Orçado ────────────────────────────────────────────────────────────────
  // Guardado em módulo (sempre positivo); a rubrica é a chave.
  (orcamento || []).forEach(o => {
    if (o?.empresa_id !== empresaId) return;
    const r = rubricasDa(empresaId).find(c => chaveRubrica(c) === chaveRubrica(o.categoria))
            || String(o.categoria || "").trim();
    if (!r) return;
    balde(r).orcado = Math.abs(num(o.orcado));
  });

  // ── Real ──────────────────────────────────────────────────────────────────
  (movimentos || []).forEach(m => {
    const r = rubricaDe(empresaId, m?.categoria, m?.subcategoria);
    if (r === null) return;
    const b = balde(r);
    b.real += num(m?.valor);
    b.nMovimentos++;
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

  // O que falta receber das vendas é a mesma conta do plano de obra
  // (vgvPorReceber): tabela de vendas − o que já entrou. O "já entrou" lê o
  // extrato, não só as fichas das vendas — senão um sinal que caiu na conta
  // sem estar registado na ficha era contado duas vezes, uma no Real e outra
  // no por receber.
  //
  // O Contas a Receber soma-se à parte, logo a seguir: lá dentro estão fees e
  // comissões a faturar, não prestações de vendas, por isso são receita a mais
  // e não uma parte desta.
  if (nomeEmpresa) {
    const vgv = vgvPorReceber({ fracoes, vendas, movimentos,
                                projeto: nomeEmpresa, empresaId });
    // E desconta-se o que já está lançado no Fluxo Futuro como entrada de
    // venda — tipicamente a linha "Venda — escritura" que o plano de obra
    // cria. É a mesma venda vista de outro lado: somar as duas dava o dobro
    // do que o projeto tem para receber.
    const jaNoFluxo = Math.max(0, num(baldes.get(rubricaVendas)?.previsoes));
    const falta = arred2(Math.max(0, vgv.total - vgv.recebido - jaNoFluxo));
    if (falta > 0.005) {
      const b = balde(rubricaVendas);
      b.porReceber += falta;
      b.nPorReceber++;
    }
  }

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
  });

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
      },
      // Uma rubrica sem orçado e sem nada que se lhe diga não vale uma linha.
      vazia: orcado <= 0.005 && Math.abs(real) <= 0.005 && Math.abs(comprometido) <= 0.005,
      // Capital e financiamento: aportes, resgates, mútuos, funding e
      // amortização. É como o projeto é PAGO, não o que o projeto FAZ, e por
      // isso não entra na conta de exploração. O ecrã mostra-os à parte.
      capital: ehCapital(b.rubrica),
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

  const tC = totalDe(capital);

  return {
    linhas, operacao, capital,
    entradas, saidas,
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
