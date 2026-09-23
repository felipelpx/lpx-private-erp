import React, { useState, useMemo } from "react";
import { EMPRESAS, agruparPorGrupo } from "./empresas.js";
import { useMovimentosPeriodo, usePagamentosExtras, useFaturas, useOrcamento } from "./hooks.js";
import { faturaPaga } from "./status.js";
import { fmtEUR0, fmtNum } from "./formato.js";

// ─────────────────────────────────────────────────────────────────────────────
// REAL × ORÇADO — partilhado pelo separador próprio e pelo Investor Relations
//
// O orçado é o único número guardado (tabela `orcamento`, vem do business plan).
// O realizado e o a realizar são calculados em tempo real a partir do ERP, para
// que lançar uma despesa no Fluxo Futuro se reflita aqui de imediato.
// ─────────────────────────────────────────────────────────────────────────────

const COR = {
  tinta: "#1a1a2e", entrada: "#16a34a", saida: "#dc2626",
  saldo: "#4a6fa5", texto: "#888",
};

const Vazio = ({ texto }) => (
  <div style={{ padding: 40, textAlign: "center", color: "#ccc", fontSize: 12 }}>{texto}</div>
);

// Calcula as linhas do Real × Orçado para um conjunto de empresas.
export function useRealOrcado(empresasAtivas) {
  const idsAtivos = useMemo(() => empresasAtivas.map(e => e.id), [empresasAtivas]);
  const contaIds = useMemo(() => empresasAtivas.flatMap(e => e.contas?.map(c => c.id) || []), [empresasAtivas]);

  const { orcamento } = useOrcamento();
  const { pagamentosExtras } = usePagamentosExtras();
  const { faturas } = useFaturas();
  // Acumulado do projeto — não segue filtros de período
  const { movimentos, loading } = useMovimentosPeriodo(contaIds, "2000-01-01", new Date().toISOString().slice(0, 10));

  const linhas = useMemo(() => {
    const porCat = new Map();
    const toca = (cat, campo, valor) => {
      const k = (cat || "").trim() || "(sem categoria)";
      if (!porCat.has(k)) porCat.set(k, { categoria: k, grupo: "opex", orcado: 0, realizado: 0, a_realizar: 0 });
      porCat.get(k)[campo] += valor;
    };

    (orcamento || []).filter(o => idsAtivos.includes(o.empresa_id)).forEach(o => {
      const k = (o.categoria || "").trim() || "(sem categoria)";
      if (!porCat.has(k)) porCat.set(k, { categoria: k, grupo: o.grupo || "opex", orcado: 0, realizado: 0, a_realizar: 0 });
      const linha = porCat.get(k);
      linha.orcado += Number(o.orcado) || 0;
      if (o.grupo) linha.grupo = o.grupo;
    });

    movimentos.forEach(m => toca(m.categoria, "realizado", Number(m.valor) || 0));

    (pagamentosExtras || [])
      .filter(p => idsAtivos.includes(p.empresa))
      .filter(p => !["Convertida", "Paga", "Pago"].includes(p.status))
      .forEach(p => {
        const v = Math.abs(Number(p.valor) || 0);
        toca(p.categoria, "a_realizar", p.tipo === "entrada" ? v : -v);
      });

    (faturas || [])
      .filter(f => idsAtivos.includes(f.empresa))
      .filter(f => !faturaPaga(f))
      .forEach(f => toca(f.categoria, "a_realizar", -Math.abs(Number(f.valor) || 0)));

    return [...porCat.values()]
      .filter(l => Math.abs(l.orcado) + Math.abs(l.realizado) + Math.abs(l.a_realizar) > 0.005)
      .sort((a, b) => Math.abs(b.orcado) - Math.abs(a.orcado));
  }, [orcamento, idsAtivos, movimentos, pagamentosExtras, faturas]);

  return { linhas, loading };
}

// ─── REAL × ORÇADO ───────────────────────────────────────────────────────────
// Atenção aos sinais: os custos são guardados NEGATIVOS e as receitas positivas.
// Um desvio calculado como (orçado − previsto) sobre números com sinal inverte
// a leitura — um estouro aparecia como folga. Por isso o cálculo é feito sobre
// magnitudes e o sentido de "bom" depende do grupo.
const GRUPO_ROTULO = {
  receita: "Receitas",
  capex:   "Aquisição de terreno",
  obra:    "Obras",
  opex:    "Soft costs e licenças",
};

export function RealOrcado({ linhas }) {
  if (!linhas.length) return <Vazio texto="Sem orçamento definido para estas empresas." />;

  // desvio > 0 é sempre favorável: gastar menos, ou vender mais
  const calc = (l) => {
    const previsto = l.realizado + l.a_realizar;
    const receita = l.grupo === "receita";
    const desvio = receita
      ? previsto - l.orcado
      : Math.abs(l.orcado) - Math.abs(previsto);
    const pct = l.orcado ? (Math.abs(previsto) / Math.abs(l.orcado)) * 100 : (previsto ? 100 : 0);
    return { previsto, desvio, pct, favoravel: desvio >= -0.005 };
  };

  const grupos = [];
  ["receita", "capex", "obra", "opex"].forEach(g => {
    const doGrupo = linhas.filter(l => l.grupo === g);
    if (doGrupo.length) grupos.push({ g, linhas: doGrupo });
  });

  const soma = (arr) => arr.reduce((a, l) => ({
    grupo: arr[0]?.grupo, orcado: a.orcado + l.orcado,
    realizado: a.realizado + l.realizado, a_realizar: a.a_realizar + l.a_realizar,
  }), { orcado: 0, realizado: 0, a_realizar: 0 });

  const custos = linhas.filter(l => l.grupo !== "receita");
  const totCustos = { ...soma(custos), grupo: "custos", categoria: "TOTAL CUSTOS" };

  const Linha = ({ l, nivel }) => {
    const { previsto, desvio, pct, favoravel } = calc(l);
    const cabecalho = nivel === "grupo" || nivel === "total";
    return (
      <tr style={{
        borderBottom: "1px solid " + (cabecalho ? "#e8eaef" : "#fafafa"),
        fontWeight: cabecalho ? 700 : 400,
        background: nivel === "total" ? "#f0f4ff" : nivel === "grupo" ? "#f8f9fc" : "transparent",
      }}>
        <td style={{ padding: "8px 10px", color: COR.tinta, paddingLeft: nivel === "linha" ? 24 : 10 }}>{l.categoria}</td>
        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", color: "#666" }}>{fmtEUR0(l.orcado)}</td>
        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", color: COR.tinta }}>{fmtEUR0(l.realizado)}</td>
        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", color: "#888" }}>{fmtEUR0(l.a_realizar)}</td>
        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", color: "#666" }}>{fmtEUR0(previsto)}</td>
        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: favoravel ? COR.entrada : COR.saida }}>
          {(desvio >= 0 ? "+" : "") + fmtEUR0(desvio)}
        </td>
        <td style={{ padding: "8px 10px", width: 120 }}>
          <div style={{ background: "#f1f2f5", borderRadius: 4, height: 13, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: favoravel ? COR.saldo : COR.saida, borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 9, color: favoravel ? "#aaa" : COR.saida, fontFamily: "monospace", marginTop: 2 }}>{fmtNum(pct, 0)}%</div>
        </td>
      </tr>
    );
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
        <thead>
          <tr style={{ background: "#f8f9fc" }}>
            {[["Categoria", "left"], ["Orçado", "right"], ["Realizado", "right"], ["A realizar", "right"],
              ["Previsto total", "right"], ["Desvio", "right"], ["Consumo", "left"]].map(([h, al]) => (
              <th key={h} style={{ padding: "9px 10px", textAlign: al, color: "#aaa", fontSize: 9, textTransform: "uppercase", fontFamily: "monospace", letterSpacing: "0.06em", borderBottom: "1px solid #f0f0f0" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grupos.map(({ g, linhas: ls }) => (
            <React.Fragment key={g}>
              <Linha nivel="grupo" l={{ ...soma(ls), grupo: g, categoria: GRUPO_ROTULO[g] || g }} />
              {ls.filter(l => Math.abs(l.orcado) + Math.abs(l.realizado) + Math.abs(l.a_realizar) > 0.005)
                 .map(l => <Linha key={l.id || l.categoria} nivel="linha" l={l} />)}
            </React.Fragment>
          ))}
          <Linha nivel="total" l={totCustos} />
        </tbody>
      </table>
      <div style={{ fontSize: 10.5, color: "#aaa", marginTop: 10, lineHeight: 1.6 }}>
        <strong>Orçado</strong> vem do business plan. <strong>Realizado</strong> é a soma dos
        movimentos bancários da categoria, desde o início do projeto.
        <strong>A realizar</strong> são as previsões do Fluxo Futuro por liquidar mais as faturas
        por pagar — lançar uma despesa no Fluxo Futuro atualiza esta tabela de imediato.<br/>
        Previsto total = realizado + a realizar. Desvio positivo é favorável: gastar abaixo do
        orçamento ou vender acima. Consumo acima de 100% marca a vermelho.
      </div>
    </div>
  );
}


// ─── ECRÃ COMPLETO (separador próprio) ───────────────────────────────────────
export default function RealOrcadoView({ empresasVisiveis }) {
  const empresas = Array.isArray(empresasVisiveis) ? empresasVisiveis : EMPRESAS;
  const [empSel, setEmpSel] = useState("todas");
  const empresasAtivas = empSel === "todas" ? empresas : empresas.filter(e => e.id === empSel);
  const { linhas, loading } = useRealOrcado(empresasAtivas);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: "13px 18px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select value={empSel} onChange={e => setEmpSel(e.target.value)}
          style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", minWidth: 240 }}>
          <option value="todas">Todas as empresas</option>
          {agruparPorGrupo(empresas).map(b => (
            <optgroup key={b.grupo} label={b.info.nome}>
              {b.empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </optgroup>
          ))}
        </select>
        {loading && <span style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>a carregar movimentos…</span>}
        <button onClick={() => window.print()}
          style={{ marginLeft: "auto", background: COR.tinta, color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Imprimir / PDF
        </button>
      </div>

      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: COR.tinta, fontFamily: "Georgia,serif", marginBottom: 4 }}>
          Real × Orçado
        </div>
        <div style={{ fontSize: 11, color: "#aaa", marginBottom: 16 }}>
          {empSel === "todas" ? "Todas as empresas" : empresasAtivas[0]?.nome} · realizado e a realizar calculados em tempo real a partir do ERP
        </div>
        {linhas.length === 0 && !loading
          ? <Vazio texto="Sem orçamento carregado para estas empresas. O orçado vem da tabela `orcamento` no Supabase." />
          : <RealOrcado linhas={linhas} />}
      </div>
    </div>
  );
}
