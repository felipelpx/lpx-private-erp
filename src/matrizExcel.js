// ─────────────────────────────────────────────────────────────────────────────
// Exportação da matriz do fluxo futuro para Excel.
//
// Duas folhas:
//   · "Matriz" — o que está no ecrã, despesa × mês, com os grupos e as linhas
//     de detalhe, e os totais no fundo (líquido da operação, líquido do mês,
//     caixa acumulado). É esta que se cola num mapa ou se manda ao banco.
//   · "Linhas" — uma linha por despesa, em formato de lista, para quem quiser
//     fazer tabela dinâmica. A mesma informação, arrumada ao contrário.
//
// Duas decisões que vale a pena explicar:
//
//   1. Os valores vão como NÚMEROS, com formato de moeda — nunca como texto
//      já formatado. Uma folha de cálculo em que não se pode somar uma coluna
//      não serve para nada, e "113.726,34 €" numa célula é exatamente isso.
//
//   2. Exporta-se o que está à vista, com as mesmas colunas e a mesma ordem.
//      Se o utilizador está a ver 7 meses, o ficheiro traz 7 meses. O que fica
//      para lá da janela vai numa coluna própria ("Fora da janela") e na do
//      total, com uma nota no cabeçalho — para ninguém somar as colunas à mão
//      e estranhar que não bata certo com o total.
//
// O SheetJS é carregado do CDN só quando se exporta — não pesa no arranque.
// ─────────────────────────────────────────────────────────────────────────────

const CDN = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";

async function carregarXLSX() {
  if (typeof window !== "undefined" && window.XLSX) return window.XLSX;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CDN;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Não foi possível carregar a biblioteca de Excel."));
    document.head.appendChild(s);
  });
  if (!window.XLSX) throw new Error("Biblioteca de Excel indisponível.");
  return window.XLSX;
}

const arred2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Um nome de folha não pode ter : \ / ? * [ ] nem passar de 31 caracteres.
const nomeDeFolha = (s, alternativa) => {
  const limpo = String(s || "").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return limpo || alternativa;
};

// Um nome de ficheiro sem nada que o sistema recuse.
const nomeDeFicheiro = (s) =>
  String(s || "").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();

/** "2026-11" → "nov/26", igual ao cabeçalho do ecrã. */
const MES = ["jan", "fev", "mar", "abr", "mai", "jun",
             "jul", "ago", "set", "out", "nov", "dez"];
export function rotuloDoMes(chave) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(chave || ""));
  if (!m) return String(chave || "");
  return `${MES[Number(m[2]) - 1]}/${m[1].slice(2)}`;
}

/**
 * Constrói as duas folhas como matrizes de células (array de arrays).
 *
 * Está separado do SheetJS de propósito: assim os testes conseguem conferir o
 * conteúdo sem browser nenhum, e o que se testa é mesmo o que vai no ficheiro.
 */
export function construirFolhasDaMatriz(matriz, {
  nomeProjeto = "", hoje = new Date(), saldoAtual = null, filtro = "",
} = {}) {
  // As `chaves` são as strings "2026-11"; `colunas` são os objetos do mês.
  // É das chaves que sai o rótulo — passar `colunas` ao formatador punha
  // "[object Object]" no cabeçalho de cada mês.
  const chaves = matriz?.chaves || [];
  const seccoes = matriz?.seccoes || [];
  const temFora = Math.abs(num(matriz?.foraDaJanela)) > 0.005
               || num(matriz?.mesesForaDaJanela) > 0;

  // Cada linha tem: rótulo, nível, um valor por mês, fora da janela, total.
  const linhaDe = (rotulo, nivel, valores, foraDaJanela, total) => [
    rotulo, nivel,
    ...chaves.map(c => arred2(num(valores?.[c]))),
    ...(temFora ? [arred2(num(foraDaJanela))] : []),
    arred2(num(total)),
  ];
  const vazia = () => [];

  const dia = (d) => {
    const x = d instanceof Date ? d : new Date(d);
    return Number.isNaN(+x) ? "" : x.toISOString().slice(0, 10);
  };

  // ── Folha 1 · a matriz ────────────────────────────────────────────────────
  const cabecalho = [
    ["FLUXO FUTURO — DESPESAS × MESES"],
    ["Projeto", nomeProjeto || "(todos)"],
    ["Exportado em", dia(hoje)],
    ...(filtro ? [["Vista", filtro]] : []),
    ...(saldoAtual != null ? [["Caixa atual", arred2(saldoAtual)]] : []),
    ...(temFora ? [["Nota",
      `A coluna TOTAL é do fluxo inteiro. ${num(matriz.mesesForaDaJanela) > 0
        ? `Há mais ${matriz.mesesForaDaJanela} ${num(matriz.mesesForaDaJanela) === 1
            ? "mês" : "meses"} à frente que não estão nas colunas` +
          (temFora ? ", somados em «Fora da janela»." : ".")
        : "O que não cabe nas colunas está em «Fora da janela»."}`]] : []),
    [],
    ["Despesa", "Nível", ...chaves.map(rotuloDoMes),
     ...(temFora ? ["Fora da janela"] : []), "Total"],
  ];

  const corpo = [];
  for (const s of seccoes) {
    corpo.push(linhaDe(String(s.titulo || "").toUpperCase(), "secção",
                       s.valores, s.foraDaJanela, s.total));
    for (const g of s.grupos || []) {
      corpo.push(linhaDe(g.categoria, "categoria", g.valores, g.foraDaJanela, g.total));
      for (const l of g.linhas || []) {
        // Numa secção com sinal (o funding), a amortização entra a negativo —
        // tal como no ecrã. Sem isto a folha somava o desembolso com o
        // reembolso e dava o dobro.
        const sinal = s.assinado && l.tipo === "saida" ? -1 : 1;
        const valores = Object.fromEntries(
          chaves.map(c => [c, sinal * num(l.valores?.[c])]));
        corpo.push(linhaDe(l.nome, "despesa", valores,
                           sinal * num(l.foraDaJanela), sinal * num(l.total)));
      }
    }
    corpo.push(vazia());
  }

  // Os totais do fundo, os mesmos do ecrã.
  const rodape = [
    linhaDe("Líquido da operação (receitas − custos, sem o funding)", "total",
            matriz?.liquidoOperacao, null, matriz?.totalLiquidoOperacao),
    linhaDe("Líquido do mês", "total", matriz?.liquido, null, matriz?.totalLiquido),
  ];
  if (matriz?.temCaixa) {
    // O caixa acumulado é um SALDO: não se soma ao longo da linha. A coluna do
    // total leva o saldo no fim do fluxo inteiro, não a soma das colunas — por
    // isso é que o cabeçalho dessa célula diz "no fim", e não "total".
    rodape.push([
      "Caixa acumulado (saldo, não soma)", "saldo",
      ...chaves.map(c => arred2(num(matriz.caixa?.[c]))),
      ...(temFora ? [""] : []),
      arred2(num(matriz.caixaFim)),
    ]);
  }

  const matrizAoA = [...cabecalho, ...corpo, ...rodape];

  // ── Folha 2 · a mesma coisa em lista, para tabela dinâmica ────────────────
  const listaAoA = [
    ["Secção", "Categoria", "Despesa", "Mês", "Valor"],
  ];
  for (const s of seccoes) {
    for (const g of s.grupos || []) {
      for (const l of g.linhas || []) {
        const sinal = s.assinado && l.tipo === "saida" ? -1 : 1;
        for (const c of chaves) {
          const v = arred2(sinal * num(l.valores?.[c]));
          if (Math.abs(v) < 0.005) continue;   // não se exportam zeros
          listaAoA.push([s.titulo, g.categoria, l.nome, rotuloDoMes(c), v]);
        }
      }
    }
  }

  return {
    matriz: matrizAoA,
    lista: listaAoA,
    temFora,
    nColunasMes: chaves.length,
    // Onde é que começam as colunas de valor e onde acaba o cabeçalho: é o
    // que o estilo precisa de saber, e o teste também.
    primeiraColunaValor: 2,
    linhaDoCabecalho: cabecalho.length - 1,
  };
}

export async function exportarMatrizExcel(matriz, {
  nomeProjeto = "", saldoAtual = null, filtro = "", hoje = new Date(),
} = {}) {
  const XLSX = await carregarXLSX();
  const folhas = construirFolhasDaMatriz(matriz, { nomeProjeto, saldoAtual, filtro, hoje });
  const wb = XLSX.utils.book_new();
  const euro = "#,##0.00 €";

  // ── Folha "Matriz" ────────────────────────────────────────────────────────
  {
    const ws = XLSX.utils.aoa_to_sheet(folhas.matriz);
    const nCols = folhas.primeiraColunaValor + folhas.nColunasMes
                + (folhas.temFora ? 1 : 0) + 1;
    ws["!cols"] = [{ wch: 52 }, { wch: 11 },
      ...Array.from({ length: nCols - 2 }, () => ({ wch: 15 }))];
    // Congelar o cabeçalho era o que fazia falta aqui — numa matriz de 24
    // meses perde-se o nome da despesa ao rolar para a direita. Não dá: o
    // SheetJS da edição aberta não escreve painéis fixos, e `ws["!freeze"]`
    // é aceite sem erro e ignorado (confirmado no XML gerado). Fica por
    // fazer em vez de ficar uma linha que não faz nada.
    for (let r = folhas.linhaDoCabecalho + 1; r < folhas.matriz.length; r++) {
      for (let c = folhas.primeiraColunaValor; c < nCols; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref] && ws[ref].t === "n") ws[ref].z = euro;
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, "Matriz");
  }

  // ── Folha "Linhas" ────────────────────────────────────────────────────────
  {
    const ws = XLSX.utils.aoa_to_sheet(folhas.lista);
    ws["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 46 }, { wch: 10 }, { wch: 15 }];
    // Filtro automático no cabeçalho: é o que torna esta folha útil para
    // isolar uma rubrica ou um mês sem fazer tabela dinâmica. Ao contrário
    // dos painéis fixos, este o SheetJS escreve mesmo.
    if (folhas.lista.length > 1) {
      ws["!autofilter"] = {
        ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 },
                                       e: { r: folhas.lista.length - 1, c: 4 } }),
      };
    }
    for (let r = 1; r < folhas.lista.length; r++) {
      const ref = XLSX.utils.encode_cell({ r, c: 4 });
      if (ws[ref]) ws[ref].z = euro;
    }
    XLSX.utils.book_append_sheet(wb, ws, nomeDeFolha("Linhas", "Linhas"));
  }

  const dia = (hoje instanceof Date ? hoje : new Date(hoje)).toISOString().slice(0, 10);
  const base = nomeDeFicheiro(nomeProjeto ? `Fluxo Futuro - ${nomeProjeto}` : "Fluxo Futuro");
  XLSX.writeFile(wb, `${base} ${dia}.xlsx`);
  return `${base} ${dia}.xlsx`;
}

export default exportarMatrizExcel;
