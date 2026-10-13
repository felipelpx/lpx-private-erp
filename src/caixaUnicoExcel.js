// ─────────────────────────────────────────────────────────────────────────────
// Exportação do Caixa Único para Excel.
//
// Duas folhas: os lançamentos como estão no ecrã (já filtrados) e um resumo
// por empresa e categoria, que é o que se costuma querer colar num mapa.
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

const isoParaData = (iso) => {
  const s = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "";
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a, m - 1, d);
};

const arred2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;

// Descreve os filtros em texto, para quem abrir o ficheiro saber o que está a ver.
// Categoria, ano e mês aceitam várias escolhas, por isso podem vir em lista.
const lista = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);
const emTexto = (rotulo, v, plural = `${rotulo}s`) => {
  const xs = lista(v);
  if (xs.length === 0) return null;
  if (xs.length === 1) return `${rotulo} ${xs[0]}`;
  return `${plural} ${xs.join(", ")}`;
};

function descreverFiltros(f = {}) {
  const partes = [];
  if (f.empresa) partes.push(`empresa ${f.empresa}`);
  if (f.banco) partes.push(`banco ${f.banco}`);
  [emTexto("categoria", f.categoria), emTexto("subcategoria", f.subcategoria),
   emTexto("ano", f.ano), emTexto("mês", f.mes, "meses")]
    .filter(Boolean).forEach(x => partes.push(x));
  if (f.de) partes.push(`de ${f.de}`);
  if (f.ate) partes.push(`até ${f.ate}`);
  if (f.procura) partes.push(`a procurar "${f.procura}"`);
  if (f.sinal && f.sinal !== "todos") partes.push(f.sinal);
  return partes.length ? partes.join(" · ") : "sem filtros";
}

export async function exportarCaixaUnico(linhas, { nomeEmpresa = (x) => x, filtros = {} } = {}) {
  const XLSX = await carregarXLSX();
  const wb = XLSX.utils.book_new();

  const euro = "#,##0.00 €";
  const estilo = (ws, nLinhas, colsEuro, colsData, desde) => {
    for (let i = 0; i < nLinhas; i++) {
      colsEuro.forEach(c => {
        const ref = XLSX.utils.encode_cell({ r: desde + i, c });
        if (ws[ref]) ws[ref].z = euro;
      });
      colsData.forEach(c => {
        const ref = XLSX.utils.encode_cell({ r: desde + i, c });
        if (ws[ref]) ws[ref].z = "dd/mm/yyyy";
      });
    }
  };

  // ── Folha 1 · os lançamentos ──────────────────────────────────────────────
  {
    const cab = [["CAIXA ÚNICO"], ["Filtros", descreverFiltros(filtros)],
                 ["Lançamentos", linhas.length], [],
                 ["Data", "Empresa", "Banco", "Descrição", "Valor",
                  "Saldo", "Categoria", "Subcategoria", "Observação"]];
    const corpo = linhas.map(m => [
      isoParaData(m.data), nomeEmpresa(m.empresa_id), m.banco || "",
      m.movimento || "", arred2(m.valor), arred2(m.saldo),
      m.categoria || "", m.subcategoria || "", m.detalhes || "",
    ]);
    const entradas = arred2(linhas.reduce((s, m) => s + (m.valor > 0 ? m.valor : 0), 0));
    const saidas   = arred2(linhas.reduce((s, m) => s + (m.valor < 0 ? m.valor : 0), 0));
    const ws = XLSX.utils.aoa_to_sheet([...cab, ...corpo, [],
      ["", "", "", "Entradas", entradas], ["", "", "", "Saídas", saidas],
      ["", "", "", "Líquido", arred2(entradas + saidas)]], { cellDates: true });
    ws["!cols"] = [{ wch: 12 }, { wch: 32 }, { wch: 9 }, { wch: 46 },
                   { wch: 14 }, { wch: 14 }, { wch: 26 }, { wch: 24 }, { wch: 34 }];
    ws["!freeze"] = { xSplit: 0, ySplit: cab.length };
    estilo(ws, corpo.length + 4, [4, 5], [0], cab.length);
    XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
  }

  // ── Folha 2 · resumo por empresa e categoria ──────────────────────────────
  {
    const mapa = new Map();
    linhas.forEach(m => {
      const chave = `${m.empresa_id}||${m.categoria || "(sem categoria)"}||${m.subcategoria || ""}`;
      const a = mapa.get(chave) || { n: 0, entradas: 0, saidas: 0 };
      a.n += 1;
      if (m.valor > 0) a.entradas += m.valor; else a.saidas += m.valor;
      mapa.set(chave, a);
    });
    const corpo = [...mapa.entries()]
      .map(([k, v]) => {
        const [emp, cat, sub] = k.split("||");
        return [nomeEmpresa(emp), cat, sub, v.n, arred2(v.entradas), arred2(v.saidas),
                arred2(v.entradas + v.saidas)];
      })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])) ||
                      String(a[1]).localeCompare(String(b[1])) ||
                      String(a[2]).localeCompare(String(b[2])));
    const cab = [["RESUMO POR EMPRESA E CATEGORIA"], ["Filtros", descreverFiltros(filtros)], [],
                 ["Empresa", "Categoria", "Subcategoria", "Lançamentos",
                  "Entradas", "Saídas", "Líquido"]];
    const ws = XLSX.utils.aoa_to_sheet([...cab, ...corpo], { cellDates: true });
    ws["!cols"] = [{ wch: 32 }, { wch: 28 }, { wch: 26 }, { wch: 13 },
                   { wch: 15 }, { wch: 15 }, { wch: 15 }];
    ws["!freeze"] = { xSplit: 0, ySplit: cab.length };
    estilo(ws, corpo.length, [4, 5, 6], [], cab.length);
    XLSX.utils.book_append_sheet(wb, ws, "Resumo");
  }

  const hoje = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Caixa_Unico_LPX_${hoje}.xlsx`);
}
