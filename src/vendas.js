// ─────────────────────────────────────────────────────────────────────────────
// VENDAS
//
// O lado comercial do projeto, numa aritmética só: o que cada fração vale, o
// que já entrou, o que falta entrar e quando, e quanto se deve ao mediador.
//
// O que havia antes estava a meio: a coluna `parcelas` existia na base desde o
// início e nunca tinha sido usada; o `falta_receber` nunca era calculado, só
// lido e zerado; e as comissões por pagar nunca chegavam ao fluxo porque
// dependiam de duas datas que nenhum ecrã escrevia. Aqui deriva-se tudo das
// três coisas que o utilizador escreve mesmo:
//
//   · o PREÇO da fração (ou o que se estima vender, se ainda não foi vendida)
//   · as PARCELAS — sinal e reforços de sinal, com data
//   · a % de COMISSÃO do mediador
//
// Tudo o resto sai daqui. Nada é gravado em duplicado, por isso nada pode
// ficar dessincronizado.
//
// DUAS MANEIRAS DE RECEBER:
//   · com plano de pagamentos — sinal, reforços, e o resto na escritura
//   · "só na entrega" — nada antes, tudo no mês da escritura
//
// A COMISSÃO paga-se com IVA, e o que não tiver sido pago até lá é liquidado
// na escritura: é essa a prática, e é isso que o fluxo tem de mostrar.
// ─────────────────────────────────────────────────────────────────────────────

import { rubricaDe, chaveRubrica } from "./rubricas.js";

const arred2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const ehISO = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || "").slice(0, 10));
const dia = (d) => String(d || "").slice(0, 10);

// ─── O preço de uma fração ───────────────────────────────────────────────────
// Por esta ordem: o que foi vendido, o que se estima vender, o preço de tabela.
// Uma fração vendida vale o que foi vendida; uma por vender vale o que se
// espera encaixar, e só na falta disso o preço que se pede.
export function precoDaFracao(fracao, venda) {
  const vendido = num(venda?.valor_venda);
  if (vendido > 0.005) return arred2(vendido);
  const estimado = num(fracao?.venda_estimada);
  if (estimado > 0.005) return arred2(estimado);
  return arred2(num(fracao?.preco_tabela));
}

export const temVendaFechada = (venda) =>
  !!venda && num(venda.valor_venda) > 0.005;

// ─── As parcelas de uma venda ────────────────────────────────────────────────
// Sinal e reforços de sinal. Cada uma com descrição, valor, data e se já foi
// paga. Uma venda "só na entrega" não tem nenhuma, por definição.
export function parcelasDaVenda(venda) {
  if (!venda || venda.so_na_entrega) return [];
  const lista = Array.isArray(venda.parcelas) ? venda.parcelas : [];
  return lista
    .map((p, i) => ({
      desc: String(p?.desc || "").trim() || (i === 0 ? "Sinal" : `${i}.º reforço`),
      valor: arred2(Math.abs(num(p?.valor))),
      data: ehISO(p?.data) ? dia(p.data) : null,
      pago: p?.pago === true,
      ordem: i,
    }))
    .filter(p => p.valor > 0.005);
}

/**
 * A conta de uma venda: o que entrou, o que falta, e quando.
 *
 * @param venda   a linha de `vendas`
 * @param fracao  a fração, para o preço quando a venda não o tiver
 */
export function contaDaVenda(venda, fracao) {
  const preco = precoDaFracao(fracao, venda);
  const parcelas = parcelasDaVenda(venda);

  const pagas = parcelas.filter(p => p.pago);
  const porPagar = parcelas.filter(p => !p.pago);

  const recebidoEmParcelas = arred2(pagas.reduce((s, p) => s + p.valor, 0));
  // O `recebemos` escrito à mão continua a valer, para as vendas antigas que
  // nunca tiveram parcelas: fica o maior dos dois, nunca a soma, senão o que
  // foi registado das duas maneiras contava a dobrar.
  const recebido = Math.max(recebidoEmParcelas, arred2(num(venda?.recebemos)));

  const porReceberEmParcelas = arred2(porPagar.reduce((s, p) => s + p.valor, 0));
  // O resto é o que fica para a escritura: o preço menos tudo o que está
  // planeado em parcelas. Nunca negativo — parcelas acima do preço são um
  // erro de lançamento, e `avisosDaVenda` di-lo.
  const naEscritura = arred2(Math.max(0, preco - recebido - porReceberEmParcelas));
  const porReceber = arred2(Math.max(0, preco - recebido));

  return {
    preco, parcelas,
    recebido, porReceber,
    porReceberEmParcelas, naEscritura,
    soNaEntrega: !!venda?.so_na_entrega,
    dataEscritura: ehISO(venda?.previsao_escritura) ? dia(venda.previsao_escritura) : null,
    nParcelas: parcelas.length,
    nPorPagar: porPagar.length,
  };
}

// ─── A comissão do mediador ─────────────────────────────────────────────────
// Uma percentagem do valor da venda, MAIS IVA — é com IVA que sai do caixa.
// O que já foi pago vem das parcelas de comissão marcadas como pagas; o resto
// paga-se na escritura.
export function comissaoDaVenda(venda, fracao) {
  const preco = precoDaFracao(fracao, venda);
  const pct = num(venda?.comissao_pct);
  const taxa = num(venda?.comissao_taxa_iva ?? 23);

  // O valor gravado manda sobre a percentagem, quando lá está: há comissões
  // negociadas a valor fixo, e não se deve reescrever o que alguém pôs à mão.
  const gravado = num(venda?.comissao_valor);
  const base = gravado > 0.005 ? arred2(gravado) : arred2(preco * pct / 100);
  const iva = arred2(base * taxa / 100);
  const comIva = arred2(base + iva);

  const parcelas = Array.isArray(venda?.comissao_parcelas) ? venda.comissao_parcelas : [];
  const pagaBase = arred2(parcelas.filter(p => p?.pago === true)
    .reduce((s, p) => s + Math.abs(num(p?.valor)), 0));
  // Compatibilidade com o que o ecrã antigo gravava nos campos escalares.
  const pagaEscalar = arred2(num(venda?.comissao_paga_sinal) + num(venda?.comissao_paga_escritura));
  const paga = Math.max(pagaBase, pagaEscalar);

  const porPagarBase = arred2(Math.max(0, base - paga));
  const porPagarIva = arred2(porPagarBase * taxa / 100);

  return {
    pct, taxa,
    base, iva, comIva,
    paga, pagaComIva: arred2(paga * (1 + taxa / 100)),
    porPagar: porPagarBase,
    porPagarComIva: arred2(porPagarBase + porPagarIva),
    manual: gravado > 0.005,
  };
}

// ─── Avisos: o que está mal lançado ─────────────────────────────────────────
// Dizer em vez de calar. Uma venda com parcelas acima do preço, ou sem data
// de escritura, dá números errados no fluxo sem ninguém reparar.
export function avisosDaVenda(venda, fracao) {
  const avisos = [];
  if (!venda) return avisos;
  const c = contaDaVenda(venda, fracao);
  const nome = venda.fracao || venda.cliente || "esta venda";

  if (!(c.preco > 0.005))
    avisos.push(`${nome}: sem preço de venda nem preço de tabela.`);
  const planeado = arred2(c.recebido + c.porReceberEmParcelas);
  if (c.preco > 0.005 && planeado > c.preco + 0.01)
    avisos.push(`${nome}: as parcelas somam ${planeado} €, mais do que o preço ` +
                `de ${c.preco} €. O excesso não entra no fluxo.`);
  if (c.porReceber > 0.005 && !c.dataEscritura)
    avisos.push(`${nome}: falta a previsão de escritura — ${c.naEscritura} € ` +
                `ficam de fora do fluxo até ela existir.`);
  if (venda.so_na_entrega && (venda.parcelas || []).length > 0)
    avisos.push(`${nome}: está marcada como "só na entrega" mas tem parcelas lançadas.`);
  return avisos;
}

// ─── O VGV que falta receber na escritura ───────────────────────────────────
// É o número que o plano de obra pede: o total da tabela de vendas, menos o
// que já foi recebido, menos o que já está lançado no Contas a Receber (senão
// contava-se a mesma entrada duas vezes — uma pela venda, outra pela carteira).
//
// O total conta TODAS as frações do projeto, vendidas ou não: as vendidas pelo
// que foram vendidas, as outras pelo que se estima vender.
// ─── O que já entrou mesmo na conta, por conta de vendas ─────────────────────
// Os sinais e reforços que já foram pagos aparecem no extrato muito antes de
// alguém os registar na ficha da venda — e é frequente nunca lá chegarem a ser
// registados. Por isso a verdade do "já recebido" é o banco: somam-se as
// ENTRADAS do extrato cuja rubrica é a das vendas da empresa.
export function recebidoDeVendas({ movimentos = [], empresaId } = {}) {
  return arred2((movimentos || []).reduce((s, m) => {
    const v = num(m?.valor);
    if (!(v > 0.005)) return s;                    // só entradas
    const cat = String(m?.categoria || "");
    const r = rubricaDe(empresaId, cat, m?.subcategoria);
    const chave = r === null ? "" : chaveRubrica(r);
    // A rubrica das vendas da empresa — ou, nas que lançam o sinal numa
    // rubrica própria, o adiantamento do comprador.
    const eVenda = chave === "vendas" || /^vendas?\b/.test(chave)
      || /\b(sinal|sinais|refor[cç]o|adiantament)/i.test(cat);
    return eVenda ? s + v : s;
  }, 0));
}

export function vgvPorReceber({ fracoes = [], vendas = [], recebiveis = [],
                                movimentos = [], projeto, empresaId } = {}) {
  const minhasFracoes = (fracoes || []).filter(f => !projeto || f?.projeto === projeto);
  const porFracao = new Map();
  (vendas || []).forEach(v => {
    if (projeto && v?.projeto !== projeto) return;
    if (v?.fracao_id) porFracao.set(v.fracao_id, v);
  });

  let total = 0, recebido = 0;
  const detalhe = [];
  minhasFracoes.forEach(f => {
    const v = porFracao.get(f.id) || null;
    const c = contaDaVenda(v, f);
    total += c.preco;
    recebido += c.recebido;
    detalhe.push({ fracao: f.fracao, preco: c.preco, recebido: c.recebido,
                   vendida: temVendaFechada(v) });
  });

  // Vendas sem fração associada (lançadas à mão) contam à mesma.
  (vendas || []).forEach(v => {
    if (projeto && v?.projeto !== projeto) return;
    if (v?.fracao_id && minhasFracoes.some(f => f.id === v.fracao_id)) return;
    const c = contaDaVenda(v, null);
    total += c.preco;
    recebido += c.recebido;
    detalhe.push({ fracao: v.fracao || "(sem fração)", preco: c.preco,
                   recebido: c.recebido, vendida: true });
  });

  // O que já está na carteira do Contas a Receber e ainda por receber: essa
  // entrada já está no fluxo por outra via, não se conta outra vez.
  const naCarteira = arred2((recebiveis || [])
    .filter(r => !empresaId || r?.empresa === empresaId)
    .filter(r => !/^(recebido|cancelado|anulada)$/i.test(String(r?.status || "").trim()))
    .filter(r => !ehFundingDeBanco(r))
    .reduce((s, r) => s + Math.abs(num(r?.valor)), 0));

  // Duas fontes para o mesmo dinheiro: as fichas das vendas e o extrato. Fica
  // a maior, nunca a soma — senão o sinal que está nos dois sítios contava a
  // dobrar. Na prática manda o extrato, que é onde o dinheiro aparece primeiro.
  const realizado = recebidoDeVendas({ movimentos, empresaId });
  total = arred2(total);
  recebido = arred2(Math.max(arred2(recebido), realizado));
  return {
    total, recebido, naCarteira, realizado,
    porReceber: arred2(Math.max(0, total - recebido - naCarteira)),
    nFracoes: detalhe.length,
    nVendidas: detalhe.filter(d => d.vendida).length,
    detalhe,
  };
}

// ─── Contas a Receber: o que é receita ──────────────────────────────────────
// A carteira é de faturas de receita — comissões, fee de gestão, vendas. O
// desembolso do banco não é receita, é dívida, e entrava aqui como se fosse
// dinheiro ganho. A rubrica separa-os; para as linhas antigas, sem rubrica,
// vale o que a descrição diz.
const PALAVRAS_FUNDING = /(funding|financiamento|desembolso|tranche|libertac|emprestimo|empréstimo|mutuo|mútuo)/i;

export function ehFundingDeBanco(recebivel) {
  const cat = String(recebivel?.categoria || "").trim();
  if (cat) return PALAVRAS_FUNDING.test(cat);
  return PALAVRAS_FUNDING.test(String(recebivel?.descricao || ""));
}

export const soReceita = (recebiveis) =>
  (recebiveis || []).filter(r => !ehFundingDeBanco(r));

// ─── As linhas que vão para o fluxo ─────────────────────────────────────────
// Cada venda dá, no máximo, três tipos de linha:
//   · as parcelas por pagar, cada uma na sua data        (entrada)
//   · o resto do preço, na data da escritura             (entrada)
//   · a comissão por pagar, com IVA, na escritura        (saída)
//
// A comissão vai toda para a escritura de propósito: é a prática — paga-se ao
// mediador o que lhe falta receber quando o negócio fecha.
export function linhasDeFluxo({ vendas = [], fracoes = [], projeto } = {}) {
  const porId = new Map((fracoes || []).map(f => [f.id, f]));
  const linhas = [];

  (vendas || []).forEach(v => {
    if (projeto && v?.projeto !== projeto) return;
    const f = v?.fracao_id ? porId.get(v.fracao_id) : null;
    const c = contaDaVenda(v, f);
    const com = comissaoDaVenda(v, f);
    const quem = v?.fracao ? `${v.fracao} — ${v.cliente || "cliente"}`
                           : (v?.cliente || "venda");

    c.parcelas.filter(p => !p.pago && p.data).forEach(p => {
      linhas.push({
        tipo: "entrada", data: p.data, valor: p.valor,
        categoria: "Vendas", origem: "Sinal / reforço",
        descricao: `${p.desc} — ${quem}`,
        vendaId: v.id, parcela: p.ordem,
      });
    });

    if (c.naEscritura > 0.005 && c.dataEscritura) {
      linhas.push({
        tipo: "entrada", data: c.dataEscritura, valor: c.naEscritura,
        categoria: "Vendas", origem: "Escritura",
        descricao: c.soNaEntrega ? `Entrega — ${quem}` : `Escritura — ${quem}`,
        vendaId: v.id,
      });
    }

    if (com.porPagarComIva > 0.005 && c.dataEscritura) {
      linhas.push({
        tipo: "saida", data: c.dataEscritura, valor: com.porPagarComIva,
        categoria: "Comissão", origem: "Comissão na escritura",
        descricao: `Comissão ${quem}` +
          (com.taxa > 0 ? ` (${com.porPagar} € + ${com.taxa}% de IVA)` : ""),
        vendaId: v.id,
      });
    }
  });

  return linhas.sort((a, b) => a.data.localeCompare(b.data) ||
                               String(a.descricao).localeCompare(String(b.descricao), "pt"));
}

// ─── O resumo de um projeto ─────────────────────────────────────────────────
// Para o cabeçalho do ecrã comercial e para o plano de obra.
export function resumoDoProjeto({ fracoes = [], vendas = [], recebiveis = [],
                                  projeto, empresaId } = {}) {
  const vgv = vgvPorReceber({ fracoes, vendas, recebiveis, projeto, empresaId });
  const porId = new Map((fracoes || []).map(f => [f.id, f]));

  let comissaoTotal = 0, comissaoPaga = 0, comissaoPorPagar = 0;
  (vendas || []).forEach(v => {
    if (projeto && v?.projeto !== projeto) return;
    const c = comissaoDaVenda(v, v?.fracao_id ? porId.get(v.fracao_id) : null);
    comissaoTotal += c.comIva;
    comissaoPaga += c.pagaComIva;
    comissaoPorPagar += c.porPagarComIva;
  });

  const avisos = (vendas || [])
    .filter(v => !projeto || v?.projeto === projeto)
    .flatMap(v => avisosDaVenda(v, v?.fracao_id ? porId.get(v.fracao_id) : null));

  return {
    ...vgv,
    comissaoTotal: arred2(comissaoTotal),
    comissaoPaga: arred2(comissaoPaga),
    comissaoPorPagar: arred2(comissaoPorPagar),
    avisos,
  };
}

export default {
  precoDaFracao, parcelasDaVenda, contaDaVenda, comissaoDaVenda,
  vgvPorReceber, linhasDeFluxo, resumoDoProjeto, soReceita, ehFundingDeBanco,
};
