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
// A tabela segue EXATAMENTE a folha "Real x Orçado" do projeto: mesmas linhas,
// mesma ordem, mesmos subtotais, mesmas colunas (Orçado · Realizado · %).
// Só o REALIZADO flutua — vem do ERP.
// ─────────────────────────────────────────────────────────────────────────────
export function RealOrcado({ modelo, realizadoPorCategoria, comprometidoPorCategoria }) {
  if (!modelo) return <Vazio texto="Sem modelo de Real × Orçado para este projeto. Os modelos vivem em src/modeloRealOrcado.js." />;

  const real = (rotulo) => realizadoPorCategoria[rotulo] || 0;
  const comp = (rotulo) => comprometidoPorCategoria?.[rotulo] || 0;

  // Realizado de um subtotal = soma dos filhos, como na folha
  const realSubtotal = (filhos) => filhos.reduce((s, c) => s + real(c), 0);
  const compSubtotal = (filhos) => filhos.reduce((s, c) => s + comp(c), 0);

  // Valores de cada linha já resolvidos, para os resultados poderem referi-los
  const valores = {};
  modelo.linhas.forEach(l => {
    if (l.tipo === "item") valores[l.rotulo] = { orcado: l.orcado ?? 0, realizado: real(l.rotulo), comprometido: comp(l.rotulo) };
    if (l.tipo === "subtotal") valores[l.rotulo] = { orcado: l.orcado ?? 0, realizado: realSubtotal(l.filhos), comprometido: compSubtotal(l.filhos) };
  });

  // Lucro bruto / tributável = receitas + despesas (os custos já são negativos)
  const somaTudo = (campo) => Object.entries(valores)
    .filter(([k]) => modelo.linhas.some(l => l.tipo === "subtotal" && l.rotulo === k))
    .reduce((s, [, v]) => s + v[campo], 0);

  const linhaResultado = (l) => {
    const ehLucroBase = /^Lucro (tributável|bruto)$/i.test(l.rotulo);
    if (ehLucroBase) return { orcado: l.orcado ?? 0, realizado: somaTudo("realizado") };
    // Restantes resultados (Success Fee, IRC, Lucro líquido) mantêm o valor do
    // business plan: dependem de fórmulas fiscais que não vivem no ERP.
    return { orcado: l.orcado ?? 0, realizado: l.real_bp ?? null, doBP: true };
  };

  const pct = (orc, rea) => {
    if (!orc) return null;
    return (rea / orc) * 100;
  };

  const Celula = ({ v, cor, negrito, titulo }) => (
    <td title={titulo} style={{ padding: "7px 12px", textAlign: "right", fontFamily: "monospace",
      fontSize: 11.5, color: cor || "#555", fontWeight: negrito ? 700 : 400, whiteSpace: "nowrap" }}>
      {v == null ? "" : fmtEUR0(v)}
    </td>
  );

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", maxWidth: 780, borderCollapse: "collapse", fontSize: 11.5 }}>
        <thead>
          <tr style={{ background: "#f8f9fc" }}>
            <th style={{ padding: "9px 12px", textAlign: "left", color: "#aaa", fontSize: 9,
                         textTransform: "uppercase", fontFamily: "monospace", letterSpacing: "0.06em",
                         borderBottom: "1px solid #e8eaef" }} />
            {["Orçado", "Realizado", "% Realizado"].map(h => (
              <th key={h} style={{ padding: "9px 12px", textAlign: "right", color: "#aaa", fontSize: 9,
                                   textTransform: "uppercase", fontFamily: "monospace",
                                   letterSpacing: "0.06em", borderBottom: "1px solid #e8eaef" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modelo.linhas.map((l, i) => {
            if (l.tipo === "espaco") return <tr key={i} style={{ height: 10 }}><td colSpan={4} /></tr>;

            const sub = l.tipo === "subtotal", res = l.tipo === "resultado";
            const v = res ? linhaResultado(l) : valores[l.rotulo] || { orcado: l.orcado ?? 0, realizado: 0 };
            const p = pct(v.orcado, v.realizado);

            // Excedeu o orçamento? (custos: realizado mais negativo que o orçado)
            const excedeu = l.tipo === "item" && v.orcado < 0 && v.realizado < v.orcado - 0.005;

            return (
              <tr key={i} style={{
                borderBottom: sub || res ? "1px solid #e8eaef" : "1px solid #fafafa",
                background: sub ? "#f8f9fc" : res ? "#f0f4ff" : "transparent",
              }}>
                <td style={{ padding: "7px 12px", color: COR.tinta,
                             fontWeight: sub || res ? 700 : 400,
                             paddingLeft: l.tipo === "item" ? 26 : 12,
                             textTransform: sub && l.rotulo === l.rotulo.toUpperCase() ? "none" : "none" }}>
                  {l.rotulo}
                </td>
                <Celula v={v.orcado} negrito={sub || res} />
                <Celula v={v.realizado} negrito={sub || res}
                        cor={excedeu ? COR.saida : (sub || res ? COR.tinta : "#555")}
                        titulo={v.doBP ? "Valor do business plan — depende de fórmulas fiscais fora do ERP" : undefined} />
                <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "monospace",
                             fontSize: 11, color: p == null ? "#ddd" : excedeu ? COR.saida : "#888",
                             fontWeight: sub || res ? 700 : 400 }}>
                  {p == null ? "n.a." : fmtNum(p, 0) + "%"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ fontSize: 10.5, color: "#aaa", marginTop: 12, lineHeight: 1.6, maxWidth: 780 }}>
        A estrutura e a coluna <strong>Orçado</strong> vêm do business plan e são fixas.
        O <strong>Realizado</strong> é calculado ao vivo a partir dos movimentos bancários do ERP.
        As linhas de resultado que dependem de fórmulas fiscais mantêm o valor do business plan.
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
        <RealOrcado modelo={modelo} realizadoPorCategoria={realizadoPorCategoria}
                    comprometidoPorCategoria={comprometidoPorCategoria} />
      </div>
    </div>
  );
}
