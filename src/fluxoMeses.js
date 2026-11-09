// ─────────────────────────────────────────────────────────────────────────────
// O FLUXO FUTURO, MÊS A MÊS — um construtor só
//
// Isto vivia dentro do <FluxoFuturo>, e o Investor Relations tinha uma cópia
// própria, mais curta, a fazer de conta que era a mesma coisa. Não era: à
// cópia faltavam as despesas recorrentes, o funding delas, as parcelas das
// previsões, o balde das vencidas e a regra que impede a venda de ser contada
// duas vezes quando o plano de obra já a lançou. O resultado é que o
// investidor via um fluxo que a equipa nunca tinha visto, e ninguém dava por
// isso — os dois números eram plausíveis.
//
// É a mesma armadilha de sempre neste ERP: o mesmo conceito definido em dois
// ecrãs. A cura é esta — um construtor, sem React lá dentro, que os dois
// chamam e que se pode testar em Node sem navegador nenhum.
//
// Entra dado em bruto (faturas, previsões, vendas, recebíveis, recorrentes) e
// sai a grelha de meses com os lançamentos lá dentro. Não sabe desenhar nada.
// ─────────────────────────────────────────────────────────────────────────────

import { faturaPaga, faturaAtrasada } from "./status.js";
import { linhaFunding } from "./funding.js";
import { ocorrenciasDe } from "./recorrentes.js";
import { linhasDeFluxo as linhasDeVendasBase, soReceita } from "./vendas.js";
import { partesDaFatura } from "./rateio.js";

const chaveMes = (data) => (data ? String(data).slice(0, 7) : null);
const n2 = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/**
 * A grelha de meses do fluxo futuro.
 *
 * @param pertence        (empresaId) => bool — quem decide que empresas entram.
 *                        O <FluxoFuturo> usa o seletor de empresa; o Investor
 *                        Relations usa as empresas a que o investidor tem
 *                        acesso. É a única diferença entre os dois.
 * @param projetoEmpresa  nome do projeto → id da empresa (as vendas vêm por
 *                        projeto, tudo o resto por empresa).
 * @param natureza        "todos" | "real" | "previsto"
 * @returns { meses, vencidas, mesesComSaldo, saldoLiquido }
 */
export function construirMesesDoFluxo({
  faturas = [], pagamentosExtras = [], vendas = [], fracoes = [],
  recebiveis = [], recorrentes = [],
  pertence = () => true,
  projetoEmpresa = {},
  natureza = "todos",
  saldoAtual = 0,
  hoje = new Date(),
  nMeses = 36,
} = {}) {
  const meses = Array.from({ length: nMeses }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("pt-PT", { month: "short", year: "numeric" }),
      ano: d.getFullYear(), mes: d.getMonth() + 1,
      entradas: 0, saidas: 0, items: [],
    };
  });
  const mesPor = (data) => meses.find(m => m.key === chaveMes(data));

  // Uma saída financiada pelo banco traz atrás de si a entrada do banco, no
  // mesmo mês: é isso que a neutraliza no caixa do projeto.
  const comFunding = (bucket, fonte, saida, extra = {}) => {
    const linha = linhaFunding(fonte, saida);
    if (!linha) return;
    bucket.entradas += linha.valor;
    bucket.items.push({ ...linha, ...extra });
  };

  // O que ficou de meses anteriores e ainda não foi pago. Não vive em mês
  // nenhum: abate ao caixa de partida. Sem este balde, uma fatura vencida
  // desaparecia do fluxo e o caixa saía otimista pelo valor dela.
  const vencidas = { entradas: 0, saidas: 0, items: [] };

  const hojeISO = hoje.toISOString().slice(0, 10);
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  // ── Contas a pagar ────────────────────────────────────────────────────────
  (faturas || []).forEach(f => {
    if (!f) return;
    // A data que conta no fluxo é a previsão de pagamento, quando existe: é
    // quando o dinheiro sai mesmo. Sem previsão, usa-se o vencimento.
    const dataFluxo = f.previsao_pagamento || f.vencimento;
    if (!dataFluxo) return;
    if (!pertence(f.empresa)) return;
    if (faturaPaga(f)) return;

    // Uma fatura pode estar repartida por várias categorias — obra e
    // trabalhos a mais, IMI e imposto de selo. Cada parte é uma linha com a
    // sua rubrica; `partesDaFatura` devolve uma parte só quando não há
    // repartição, para este código ser o mesmo nos dois casos.
    const partes = partesDaFatura(f);
    const nome = (p) => partes.length > 1
      ? `${f.fornecedor || f.fatura} · ${p.subcategoria || p.categoria}`
      : (f.fornecedor || f.fatura);

    if (faturaAtrasada(f)) {
      partes.forEach(p => {
        const saida = { tipo: "saida", desc: nome(p), valor: p.valor,
                        cat: p.categoria, subcategoria: p.subcategoria,
                        origem: "Vencida", natureza: "real",
                        vencimento: dataFluxo, fatura: f, parte: p };
        vencidas.saidas += p.valor;
        vencidas.items.push(saida);
        comFunding(vencidas, f, saida, { vencimento: dataFluxo, fatura: f });
      });
      return;
    }
    const m = mesPor(dataFluxo);
    if (!m) return;
    partes.forEach(p => {
      const saida = { tipo: "saida", desc: nome(p), valor: p.valor,
                      cat: p.categoria, subcategoria: p.subcategoria,
                      origem: "Contas a Pagar", natureza: "real", fatura: f, parte: p };
      m.saidas += p.valor;
      m.items.push(saida);
      comFunding(m, f, saida, { fatura: f });
    });
  });

  // ── Vendas ────────────────────────────────────────────────────────────────
  // Quando o plano de obra já lançou a venda da escritura, as entradas desta
  // empresa já estão no fluxo por essa via: lançá-las outra vez dava o dobro.
  // A comissão do mediador não vem no plano — essa fica.
  const vivo = (p) => !["Paga", "Pago", "Convertida"].includes(p?.status);
  const vendaJaNoPlano = new Set((pagamentosExtras || [])
    .filter(p => p?.plano_tipo === "venda" && vivo(p)).map(p => p?.empresa).filter(Boolean));

  // A data da escritura segundo o plano. A comissão do mediador passa a sair
  // nessa data em vez da previsão escrita na ficha da venda: reprogramar a
  // obra mexia na entrada e deixava a comissão para trás.
  const escrituraPorEmpresa = new Map((pagamentosExtras || [])
    .filter(p => p?.plano_tipo === "venda" && vivo(p) && p?.empresa && p?.data_inicio)
    .map(p => [p.empresa, String(p.data_inicio).slice(0, 10)]));
  const escrituraDoPlano = (v) =>
    escrituraPorEmpresa.get(projetoEmpresa[v?.projeto]) || null;

  linhasDeVendasBase({ vendas, fracoes, escrituraDoPlano }).forEach(l => {
    const v = (vendas || []).find(x => x.id === l.vendaId);
    const empId = projetoEmpresa[v?.projeto];
    if (!pertence(empId)) return;
    if (l.tipo === "entrada" && vendaJaNoPlano.has(empId)) return;
    const base = { desc: l.descricao, valor: l.valor, cat: l.categoria,
                   origem: l.origem, natureza: "real", vendaId: l.vendaId,
                   venda: v, parcela: l.parcela };
    if (l.data < hojeISO) {
      if (l.tipo === "entrada") vencidas.entradas += l.valor; else vencidas.saidas += l.valor;
      vencidas.items.push({ ...base, tipo: l.tipo, vencimento: l.data });
      return;
    }
    const m = mesPor(l.data);
    if (!m) return;
    if (l.tipo === "entrada") m.entradas += l.valor; else m.saidas += l.valor;
    m.items.push({ ...base, tipo: l.tipo });
  });

  // ── Recebíveis ────────────────────────────────────────────────────────────
  // Só o que ainda está por receber: o que já entrou está no extrato.
  soReceita(recebiveis).forEach(r => {
    if (!pertence(r.empresa)) return;
    if (["Recebido", "Cancelado", "Anulada"].includes(r.status)) return;
    const data = r.data_prevista || r.data_fatura;
    if (!data) return;
    const valor = Math.abs(n2(r.valor));
    if (!valor) return;
    const ehFatura = !!(r.numero_fatura && r.data_fatura);
    const base = {
      desc: ehFatura ? `${r.numero_fatura} — ${r.cliente || r.descricao || "cliente"}`
                     : (r.descricao || r.cliente || "Entrada prevista"),
      valor,
      cat: ehFatura ? "Faturação" : "Vendas",
      origem: ehFatura ? "Fatura emitida" : "Contas a Receber",
      natureza: ehFatura ? "real" : "previsto",
      recebivel: r,
    };
    if (data < hojeISO) {
      vencidas.entradas += valor;
      vencidas.items.push({ ...base, tipo: "entrada", vencimento: data });
      return;
    }
    const m = mesPor(data);
    if (m) { m.entradas += valor; m.items.push({ ...base, tipo: "entrada" }); }
  });

  // ── Previsões lançadas à mão (e as que o plano de obra escreve) ──────────
  (pagamentosExtras || []).forEach(p => {
    if (!p) return;
    if (!pertence(p.empresa)) return;
    if (!vivo(p)) return;              // já pago, ou já convertido em fatura
    const nParcelas = parseInt(p.parcelas) || 1;
    const inicio = new Date(p.data_inicio);
    if (Number.isNaN(inicio.getTime())) return;

    for (let i = 0; i < nParcelas; i++) {
      const d = new Date(inicio);
      if (p.periodicidade === "mensal") d.setMonth(d.getMonth() + i);
      else if (p.periodicidade === "trimestral") d.setMonth(d.getMonth() + i * 3);
      else if (p.periodicidade === "anual") d.setFullYear(d.getFullYear() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const dataISO = `${key}-${String(d.getDate()).padStart(2, "0")}`;
      const valor = n2(p.valor) / nParcelas;
      const base = {
        desc: p.descricao + (nParcelas > 1 ? ` (${i + 1}/${nParcelas})` : ""),
        valor, cat: p.categoria, origem: "Manual", natureza: "previsto",
        pagamentoId: p.id, pagamento: p,
      };

      // Vencida é o que ficou em MESES ANTERIORES — não o que passou do dia
      // de hoje. Uma previsão é planeamento mensal e o plano de obra
      // escreve-a sempre no dia 1: a comparar ao dia, a obra do próprio mês
      // passava a "vencida" no dia 2 e saía da grelha.
      if (chaveMes(dataISO) < mesAtual) {
        if (p.tipo === "entrada") {
          vencidas.entradas += valor;
          vencidas.items.push({ ...base, tipo: "entrada", vencimento: dataISO });
        } else {
          const saida = { ...base, tipo: "saida", vencimento: dataISO };
          vencidas.saidas += valor;
          vencidas.items.push(saida);
          comFunding(vencidas, p, saida, { vencimento: dataISO, pagamento: p, pagamentoId: p.id });
        }
        continue;
      }

      const m = meses.find(x => x.key === key);
      if (!m) continue;
      if (p.tipo === "entrada") {
        m.entradas += valor;
        m.items.push({ ...base, tipo: "entrada" });
      } else {
        const saida = { ...base, tipo: "saida" };
        m.saidas += valor;
        m.items.push(saida);
        comFunding(m, p, saida, { pagamento: p, pagamentoId: p.id });
      }
    }
  });

  // ── Despesas recorrentes ─────────────────────────────────────────────────
  // A regra não tem linhas gravadas: expande-se aqui, para a janela do fluxo.
  const fimDoFluxo = meses.length ? `${meses[meses.length - 1].key}-28` : hojeISO;
  (recorrentes || []).forEach(r => {
    if (!r) return;
    if (!pertence(r.empresa)) return;
    if (r.ativa === false) return;
    ocorrenciasDe(r, { de: hojeISO, ate: fimDoFluxo }).forEach(oc => {
      const m = meses.find(x => x.key === oc.data.slice(0, 7));
      if (!m) return;
      const base = {
        desc: r.descricao, valor: Math.abs(oc.valor),
        cat: r.categoria || "", subcategoria: r.subcategoria || "",
        origem: "Recorrente", natureza: "previsto",
        recorrenteId: r.id, recorrente: r, vencimento: oc.data,
      };
      if (r.tipo === "entrada") {
        m.entradas += base.valor;
        m.items.push({ ...base, tipo: "entrada" });
      } else {
        const saida = { ...base, tipo: "saida" };
        m.saidas += saida.valor;
        m.items.push(saida);
        // Há recorrentes que o banco financia — a taxa de gestão de um
        // projeto em obra, por exemplo. A entrada do banco vem atrás, no
        // mesmo mês, como em qualquer outra saída financiada.
        comFunding(m, r, saida, {
          origem: "Recorrente", recorrenteId: r.id, recorrente: r, vencimento: oc.data });
      }
    });
  });

  // ── Filtro Real / Previsto ───────────────────────────────────────────────
  // Os totais recalculam-se a partir dos itens que sobrevivem ao filtro, para
  // que o gráfico e o saldo acumulado reflictam a mesma seleção.
  if (natureza !== "todos") {
    const passa = (it) => (it.natureza || "previsto") === natureza;
    const recalcula = (b) => {
      b.items = b.items.filter(passa);
      b.entradas = b.items.filter(i => i.tipo === "entrada").reduce((t, i) => t + n2(i.valor), 0);
      b.saidas   = b.items.filter(i => i.tipo === "saida").reduce((t, i) => t + n2(i.valor), 0);
    };
    meses.forEach(recalcula);
    recalcula(vencidas);
  }

  // ── O saldo acumulado ────────────────────────────────────────────────────
  // Parte do caixa de hoje menos o que já está vencido por pagar: esse
  // dinheiro já está comprometido e não aparece em mês nenhum.
  const saldoLiquido = saldoAtual - (vencidas.saidas - vencidas.entradas);
  let acumulado = saldoLiquido;
  const mesesComSaldo = meses.map(m => {
    const liquido = m.entradas - m.saidas;
    acumulado += liquido;
    return { ...m, liquido, saldo_fim: acumulado };
  });

  return { meses, vencidas, mesesComSaldo, saldoLiquido, saldoAtual };
}

/** O mapa nome-do-projeto → id da empresa, a partir de src/empresas.js. */
export function mapaProjetoEmpresa(empresas = []) {
  return Object.fromEntries(
    empresas.flatMap(e => [[e.nome, e.id], [e.projeto, e.id], [e.razaoSocial, e.id]])
      .filter(([k]) => k));
}

// ─────────────────────────────────────────────────────────────────────────────
// A LINHA A QUE CADA LANÇAMENTO PERTENCE
//
// Também isto estava em dois sítios, e as duas versões não concordavam: a do
// Investor Relations lia a subcategoria do documento de origem, e por isso a
// libertação do banco de uma fatura de obra ia parar a «Gastos com Obras» —
// ou seja, às RECEITAS. Uma entrada do banco contada como receita do projeto.
//
// Nas empresas LPX a linha é a categoria com que o lançamento foi
// classificado; nos projetos HDG é a despesa da FO (ver src/rubricasHDG.js).
// Em "Todos os Projetos" convivem os dois mundos, por isso a empresa vem do
// próprio lançamento.
// ─────────────────────────────────────────────────────────────────────────────
export function criarRubricaDoItem({ empresa = "", empresas = [],
                                     classificacaoDe, rubricaDe, rubricaNoFluxo } = {}) {
  return (it) => {
    const emp = it?.pagamento?.empresa || it?.fatura?.empresa
             || it?.recorrente?.empresa || (empresa && empresa !== "all" ? empresa : "");
    const g = empresas.find(e => e.id === emp)?.grupo === "HDG" ? "HDG" : "LPX";

    // A entrada do banco é do BANCO, não da despesa que a originou. A linha
    // de funding leva atrás a fatura de origem só para o detalhe da célula
    // poder dizer de onde veio — a classificação não a pode ler.
    if (it?._funding) {
      const c = classificacaoDe("funding", g);
      const r = rubricaDe(emp, c.categoria, c.subcategoria || "") || c.categoria;
      return rubricaNoFluxo(g, r, "");
    }

    // A PARTE primeiro. Quando uma fatura está repartida, cada linha tem a
    // sua rubrica e a do documento deixa de valer — ler a da fatura aqui
    // mandava as três partes todas para a mesma linha do fluxo e a
    // repartição ficava só a enfeitar o ecrã das contas a pagar.
    const sub = it?.parte?.subcategoria || it?.pagamento?.subcategoria
             || it?.fatura?.subcategoria || it?.recorrente?.subcategoria
             || it?.subcategoria || "";
    const cat = it?.parte?.categoria || it?.cat;
    const r = rubricaDe(emp, cat, sub) || cat || "";
    // O IVA da obra é obra: lê-se dentro do balde dela, com o nome do
    // trimestre a distingui-lo. Ver rubricaNoFluxo em src/obra.js.
    return rubricaNoFluxo(g, r, it?.desc || "");
  };
}
