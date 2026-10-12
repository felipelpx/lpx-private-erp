// ─────────────────────────────────────────────────────────────────────────────
// Exportação do apuramento de IVA para Excel.
//
// Três folhas, pela mesma ordem do ecrã: resumo trimestral, detalhe mensal
// (faturas agrupadas por mês, com subtotais) e detalhe por fatura.
//
// O SheetJS é carregado do CDN só quando se exporta — não pesa no arranque.
// ─────────────────────────────────────────────────────────────────────────────
import { NOMES_MES, rotuloTrimestre, estadoTrimestre, ESTADOS_TRIMESTRE, arred2 } from "./iva.js";

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

export async function exportarIvaExcel({ apuramento, meses12, ano, empresaNome, pagamentos = [], nomeEmpresa }) {
  const XLSX = await carregarXLSX();
  const wb = XLSX.utils.book_new();
  const FORMATO_EUR = '#,##0.00\\ "€"';
  const FORMATO_DATA = "dd/mm/yyyy";

  const aplicar = (ws, linhas, colsNum, colsData, inicio) => {
    linhas.forEach((_, i) => {
      const r = inicio + i;
      colsNum.forEach(c => {
        const cel = ws[XLSX.utils.encode_cell({ r, c })];
        if (cel && typeof cel.v === "number") cel.z = FORMATO_EUR;
      });
      colsData.forEach(c => {
        const cel = ws[XLSX.utils.encode_cell({ r, c })];
        if (cel && cel.v instanceof Date) { cel.t = "d"; cel.z = FORMATO_DATA; }
      });
    });
  };

  // ── Folha 1 · Resumo trimestral ───────────────────────────────────────────
  {
    const cab = [
      ["APURAMENTO DE IVA"],
      ["Empresa", empresaNome],
      ["Ano", ano || ""],
      ["Exportado em", new Date()],
      ["Critério", "Data de emissão da fatura. O estado de pagamento não entra no apuramento."],
      [],
      ["Trimestre", "IVA a pagar", "IVA a abater", "Saldo", "Data limite", "Estado"],
    ];
    const linhas = apuramento.trimestres.map(t => {
      const pag = pagamentos.find(p => p.ano === t.ano && p.trimestre === t.trimestre);
      const est = estadoTrimestre(t.ano, t.trimestre, pag);
      return [t.rotulo, t.aPagar, t.aAbater, t.saldo, isoParaData(t.dataLimite), ESTADOS_TRIMESTRE[est].txt];
    });
    const total = ["TOTAL", apuramento.total.aPagar, apuramento.total.aAbater, apuramento.total.saldo, "", ""];
    const ws = XLSX.utils.aoa_to_sheet([...cab, ...linhas, [], total], { cellDates: true });
    ws["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }];
    aplicar(ws, [...linhas, [], total], [1, 2, 3], [4], cab.length);
    XLSX.utils.book_append_sheet(wb, ws, "Resumo trimestral");
  }

  // ── Folha 2 · Detalhe mensal ──────────────────────────────────────────────
  {
    const linhas = [];
    apuramento.trimestres.forEach(t => {
      linhas.push([t.rotulo, "", "", "", ""]);
      t.meses.forEach(m => {
        linhas.push(["", NOMES_MES[m.mes - 1], m.aPagar, m.aAbater, m.saldo]);
        m.docs.forEach(d => {
          linhas.push([
            "", `    ${d.tipo === "cliente" ? "Cliente" : "Fornecedor"} · ${d.entidade} · ${d.documento}`,
            d.tipo === "cliente" ? d.iva : "", d.tipo === "fornecedor" ? d.iva : "", "",
          ]);
        });
      });
      linhas.push(["", `Subtotal ${t.rotulo}`, t.aPagar, t.aAbater, t.saldo]);
      linhas.push([]);
    });
    const cab = [["DETALHE MENSAL"], ["Empresa", empresaNome], [],
                 ["Trimestre", "Mês / documento", "IVA a pagar", "IVA a abater", "Saldo"]];
    const ws = XLSX.utils.aoa_to_sheet([...cab, ...linhas], { cellDates: true });
    ws["!cols"] = [{ wch: 12 }, { wch: 62 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    aplicar(ws, linhas, [2, 3, 4], [], cab.length);
    XLSX.utils.book_append_sheet(wb, ws, "Detalhe mensal");
  }

  // ── Folha 3 · Detalhe por fatura ──────────────────────────────────────────
  {
    const cab = [["DETALHE POR FATURA"], ["Empresa", empresaNome], [],
                 ["Tipo", "Empresa", "Data da fatura", "Cliente / Fornecedor", "N.º",
                  "Valor sem IVA", "Taxa %", "IVA", "IVA calculado", "Deduz IVA",
                  "Mês", "Trimestre"]];
    const linhas = [...apuramento.linhas]
      .sort((a, b) => a.ano - b.ano || a.trimestre - b.trimestre || String(a.data_fatura).localeCompare(String(b.data_fatura)))
      .map(d => [
        d.tipo === "cliente" ? "Cliente" : "Fornecedor",
        nomeEmpresa ? nomeEmpresa(d.empresa) : d.empresa,
        isoParaData(d.data_fatura), d.entidade, d.documento,
        Number(d.valor_base) || 0, d.taxa_iva != null ? Number(d.taxa_iva) : "",
        d.iva, d.estimado ? "sim" : "", d.naoDeduz ? "NÃO" : "sim",
        NOMES_MES[d.mes - 1], rotuloTrimestre(d.ano, d.trimestre),
      ]);
    const totalIva = arred2(apuramento.linhas.reduce((s, d) => s + (d.tipo === "cliente" ? d.iva : -d.iva), 0));
    const ws = XLSX.utils.aoa_to_sheet(
      [...cab, ...linhas, [], ["", "", "", "", "SALDO", "", "", totalIva]], { cellDates: true });
    ws["!cols"] = [{ wch: 12 }, { wch: 26 }, { wch: 15 }, { wch: 34 }, { wch: 18 },
                   { wch: 15 }, { wch: 9 }, { wch: 14 }, { wch: 14 }, { wch: 11 },
                   { wch: 12 }, { wch: 11 }];
    aplicar(ws, linhas, [5, 7], [2], cab.length);
    XLSX.utils.book_append_sheet(wb, ws, "Detalhe por fatura");
  }

  const nome = `IVA_${(empresaNome || "LPX").replace(/[^\w]+/g, "_")}_${ano || ""}.xlsx`;
  XLSX.writeFile(wb, nome);
}
