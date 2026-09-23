import React, { useState, useMemo } from "react";
import { EMPRESAS, agruparPorGrupo } from "./empresas.js";
import { useMovimentosPeriodo, usePagamentosExtras, useFaturas } from "./hooks.js";
import { MODELO_REAL_ORCADO } from "./modeloRealOrcado.js";
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

// Realizado por categoria, ao vivo a partir do ERP.
// Devolve também o comprometido (faturas por pagar + previsões do Fluxo Futuro).
export function useRealOrcado(empresasAtivas) {
  const idsAtivos = useMemo(() => empresasAtivas.map(e => e.id), [empresasAtivas]);
  const contaIds = useMemo(() => empresasAtivas.flatMap(e => e.contas?.map(c => c.id) || []), [empresasAtivas]);

  const { pagamentos: pagamentosExtras } = usePagamentosExtras();
  const { faturas } = useFaturas();
  // Acumulado do projeto — o Real × Orçado não segue filtros de período
  const { movimentos, loading } = useMovimentosPeriodo(contaIds, "2000-01-01", new Date().toISOString().slice(0, 10));

  const realizadoPorCategoria = useMemo(() => {
    const m = {};
    movimentos.forEach(x => {
      const k = (x.categoria || "").trim();
      if (!k) return;
      m[k] = (m[k] || 0) + (Number(x.valor) || 0);
    });
    return m;
  }, [movimentos]);

  const comprometidoPorCategoria = useMemo(() => {
    const m = {};
    const toca = (cat, v) => { const k = (cat || "").trim(); if (k) m[k] = (m[k] || 0) + v; };
    (pagamentosExtras || [])
      .filter(p => idsAtivos.includes(p.empresa))
      .filter(p => !["Convertida", "Paga", "Pago"].includes(p.status))
      .forEach(p => toca(p.categoria, p.tipo === "entrada" ? Math.abs(Number(p.valor) || 0) : -Math.abs(Number(p.valor) || 0)));
    (faturas || [])
      .filter(f => idsAtivos.includes(f.empresa))
      .filter(f => !faturaPaga(f))
      .forEach(f => toca(f.categoria, -Math.abs(Number(f.valor) || 0)));
    return m;
  }, [pagamentosExtras, faturas, idsAtivos]);

  return { realizadoPorCategoria, comprometidoPorCategoria, loading };
}


// ─────────────────────────────────────────────────────────────────────────────
// Quadro ORÇADO × FORECAST, estático, igual à folha do business plan.
// Todas as linhas aparecem, pela ordem da folha. Nada vem do ERP.
// ─────────────────────────────────────────────────────────────────────────────
export function RealOrcado({ modelo }) {
  if (!modelo) return <Vazio texto="Sem quadro de Real × Orçado para este projeto. Os quadros vivem em src/modeloRealOrcado.js." />;

  // Quando a folha não traz o subtotal, soma-se pelos filhos
  const porRotulo = {};
  modelo.linhas.forEach(l => { if (l.rotulo) porRotulo[l.rotulo] = l; });
  const valor = (l, campo) => {
    if (l[campo] != null) return l[campo];
    if (l.tipo === "subtotal" && l.filhos)
      return l.filhos.reduce((s, c) => s + (porRotulo[c]?.[campo] ?? 0), 0);
    return null;
  };

  const temForecast = modelo.linhas.some(l => l.forecast != null);

  const Cel = ({ v, negrito, cor }) => (
    <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 11.5,
                 color: cor || "#555", fontWeight: negrito ? 700 : 400, whiteSpace: "nowrap" }}>
      {v == null ? "—" : fmtEUR0(v)}
    </td>
  );

  return (
    <div style={{ overflowX: "auto" }}>
      {!temForecast && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8,
                      padding: "10px 14px", fontSize: 11.5, color: "#92400e", marginBottom: 12, maxWidth: 820 }}>
          Este projeto ainda não tem forecast no business plan — só aparece a coluna Orçado.
        </div>
      )}

      <table style={{ width: "100%", maxWidth: 820, borderCollapse: "collapse", fontSize: 11.5 }}>
        <thead>
          <tr style={{ background: "#f8f9fc" }}>
            <th style={{ padding: "9px 12px", borderBottom: "1px solid #e8eaef" }} />
            {["Orçado", "Forecast", "Δ", "Δ %"].map(h => (
              <th key={h} style={{ padding: "9px 12px", textAlign: "right", color: "#aaa", fontSize: 9,
                                   textTransform: "uppercase", fontFamily: "monospace",
                                   letterSpacing: "0.06em", borderBottom: "1px solid #e8eaef" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modelo.linhas.map((l, i) => {
            if (l.tipo === "espaco") return <tr key={i} style={{ height: 10 }}><td colSpan={5} /></tr>;

            const sub = l.tipo === "subtotal", res = l.tipo === "resultado";
            const orc = valor(l, "orcado");
            const fc = valor(l, "forecast");
            const delta = (orc != null && fc != null) ? fc - orc : null;
            // Favorável: receitas acima do orçado, ou custos menos negativos
            const receita = (orc ?? 0) >= 0;
            const bom = delta == null ? null : (receita ? delta >= 0 : delta >= 0);
            const pctD = (delta != null && orc) ? (delta / Math.abs(orc)) * 100 : null;

            return (
              <tr key={i} style={{
                borderBottom: sub || res ? "1px solid #e8eaef" : "1px solid #fafafa",
                background: sub ? "#f8f9fc" : res ? "#f0f4ff" : "transparent",
              }}>
                <td style={{ padding: "7px 12px", color: COR.tinta, fontWeight: sub || res ? 700 : 400,
                             paddingLeft: l.tipo === "item" ? 26 : 12 }}>{l.rotulo}</td>
                <Cel v={orc} negrito={sub || res} />
                <Cel v={fc} negrito={sub || res} cor={sub || res ? COR.tinta : "#555"} />
                <Cel v={delta} negrito
                     cor={delta == null ? "#ddd" : bom ? COR.entrada : COR.saida} />
                <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 11,
                             fontWeight: sub || res ? 700 : 400,
                             color: pctD == null ? "#ddd" : bom ? COR.entrada : COR.saida }}>
                  {pctD == null ? "—" : (pctD >= 0 ? "+" : "") + fmtNum(pctD, 1) + "%"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ fontSize: 10.5, color: "#aaa", marginTop: 12, lineHeight: 1.6, maxWidth: 820 }}>
        Quadro estático do business plan: <strong>Orçado</strong> contra <strong>Forecast</strong>
        {modelo.fonteForecast ? ` (${modelo.fonteForecast})` : ""}. Δ é a diferença entre os dois —
        verde quando o forecast é melhor que o orçamento, vermelho quando é pior.
      </div>
    </div>
  );
}

// ─── ECRÃ COMPLETO (separador próprio) ───────────────────────────────────────
export default function RealOrcadoView({ empresasVisiveis }) {
  const empresas = Array.isArray(empresasVisiveis) ? empresasVisiveis : EMPRESAS;
  const [empSel, setEmpSel] = useState("todas");
  const empresasAtivas = empSel === "todas" ? empresas : empresas.filter(e => e.id === empSel);
  const { realizadoPorCategoria, comprometidoPorCategoria, loading } = useRealOrcado(empresasAtivas);
  const modelo = MODELO_REAL_ORCADO[empSel];

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
        <RealOrcado modelo={modelo} />
      </div>
    </div>
  );
}
