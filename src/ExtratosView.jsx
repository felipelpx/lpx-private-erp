import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useMovimentosByConta, useSaldosAtuais } from "./hooks.js";
import { supabase } from "./supabase.js";
import { CATEGORIAS } from "./categorias.js";
import { fmtEUR, fmtNum, fmtInt, fmtPctSinal, fmtDataHora, fmtData as fmtDataCfg } from "./formato.js";
import { agruparPorGrupo, GRUPOS_INFO } from "./empresas.js";

const BANCO_COLORS = {"Millennium":"#e84393","BNI":"#0057b7","BB Americas":"#c8a500","Eurobic":"#e74c3c","Revolut":"#6772e5","CGD":"#00a859","NovoBanco":"#ff6200","Banco Invest":"#1e3a6e","BAE":"#6c3483","BCP":"#002fa7","Miami":"#0891b2","Cartao 7449":"#f59e0b","Caixa Livre":"#8b5cf6"};

const fmtN = (v) => fmtEUR(v);

// ────────────────────────────────────────────────────────────────────────────
// Editable cells: campos com state local controlado, debounced save, e badge
// visual a indicar "a guardar / guardado / erro" para que o utilizador veja
// sempre se a alteração foi persistida.
// ────────────────────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (status === "saving") return <span title="A guardar..." style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", marginLeft: 6 }} />;
  if (status === "saved") return <span title="Guardado" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#16a34a", marginLeft: 6 }} />;
  if (status === "error") return <span title="Erro a guardar — tenta novamente" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#dc2626", marginLeft: 6 }} />;
  return null;
}

// Select editável: salva imediatamente onChange, mostra estado
function EditableCategoria({ initialValue, movId, onSave, disabled }) {
  const [val, setVal] = useState(initialValue || "");
  const [status, setStatus] = useState(null);
  // Sincroniza só quando o id muda OU quando o valor inicial muda E o utilizador não está a editar
  const lastInitial = useRef(initialValue || "");
  useEffect(() => {
    // Se o servidor empurra novo valor, e é diferente do que temos local + do que recebemos antes → adotar
    if (initialValue !== lastInitial.current) {
      setVal(initialValue || "");
      lastInitial.current = initialValue || "";
    }
  }, [initialValue, movId]);

  const handleChange = async (e) => {
    const newCat = e.target.value;
    setVal(newCat);
    if (!movId) {
      alert("Movimento sem ID — provavelmente é um snapshot antigo (não está no Supabase).\nReimporta o extrato para passar a editar.");
      setVal(initialValue || "");
      return;
    }
    setStatus("saving");
    const res = await onSave(movId, { categoria: newCat });
    if (res?.error) {
      setStatus("error");
      alert("Erro ao guardar categoria:\n\n" + (res.error.message || res.error));
      return;
    }
    if (!res?.data || res.data.length === 0) {
      setStatus("error");
      alert("Categoria não foi guardada.\n\nProvavelmente falta política UPDATE no RLS para 'movimentos', ou o RLS está a bloquear este utilizador.");
      return;
    }
    lastInitial.current = newCat;
    setStatus("saved");
    setTimeout(() => setStatus(s => s === "saved" ? null : s), 1500);
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <select
        value={val}
        disabled={disabled}
        onChange={handleChange}
        style={{ background: val ? "#f0f4ff" : "#f8f8f8", color: val ? "#4a6fa5" : "#aaa", border: `1px solid ${status === "error" ? "#dc2626" : "#eee"}`, borderRadius: 6, padding: "3px 6px", fontSize: 10, fontFamily: "monospace", cursor: "pointer", outline: "none", maxWidth: 160 }}
      >
        <option value="">-- sem categoria --</option>
        {CATEGORIAS.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <StatusBadge status={status} />
    </span>
  );
}

// Texto editável: controlled + debounce de 800ms + onBlur também salva
function EditableDetalhes({ initialValue, movId, onSave, disabled }) {
  const [val, setVal] = useState(initialValue || "");
  const [status, setStatus] = useState(null);
  const lastInitial = useRef(initialValue || "");
  const lastSaved = useRef(initialValue || "");
  const debounceRef = useRef(null);
  const isEditingRef = useRef(false);

  // Adotar valor do servidor apenas se o utilizador não estiver a editar agora
  useEffect(() => {
    if (initialValue !== lastInitial.current) {
      lastInitial.current = initialValue || "";
      if (!isEditingRef.current) {
        setVal(initialValue || "");
        lastSaved.current = initialValue || "";
      }
    }
  }, [initialValue, movId]);

  const doSave = useCallback(async (newValue) => {
    if (!movId) return;
    if (newValue === lastSaved.current) return;
    setStatus("saving");
    const res = await onSave(movId, { detalhes: newValue });
    if (res?.error) {
      setStatus("error");
      alert("Erro ao guardar detalhes:\n\n" + (res.error.message || res.error));
      return;
    }
    if (!res?.data || res.data.length === 0) {
      setStatus("error");
      alert("Detalhes não foram guardados.\n\nProvavelmente falta política UPDATE no RLS para 'movimentos'.");
      return;
    }
    lastSaved.current = newValue;
    setStatus("saved");
    setTimeout(() => setStatus(s => s === "saved" ? null : s), 1500);
  }, [movId, onSave]);

  const handleChange = (e) => {
    const next = e.target.value;
    setVal(next);
    isEditingRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      isEditingRef.current = false;
      doSave(next);
    }, 800);
  };

  const handleBlur = (e) => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    isEditingRef.current = false;
    doSave(e.target.value);
  };

  // Save pendente se a página fechar
  useEffect(() => {
    const handler = () => {
      if (debounceRef.current && val !== lastSaved.current && movId) {
        // Synchronous-ish: usa sendBeacon-like fallback ou simplesmente dispara o save (pode não terminar mas pelo menos tenta)
        clearTimeout(debounceRef.current);
        doSave(val);
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [val, movId, doSave]);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", width: "100%" }}>
      <input
        type="text"
        value={val}
        disabled={disabled}
        onChange={handleChange}
        onBlur={handleBlur}
        style={{ background: "transparent", border: "none", borderBottom: `1px solid ${status === "error" ? "#dc2626" : "#eee"}`, padding: "2px 4px", fontSize: 11, color: "#888", outline: "none", width: "100%", fontFamily: "inherit" }}
        placeholder="—"
      />
      <StatusBadge status={status} />
    </span>
  );
}


// ────────────────────────────────────────────────────────────────────────────
// CaixaDinamicoBar: barra de comparação no topo do Extratos. Tem 2 modos:
//
//  - Compacto: mostra hoje vs uma data anterior, com botão "📊 Ver detalhado".
//  - Expandido: vista completa estilo "Caixa Único Dinâmico" — selector de
//    empresas, selector de data anterior + data atual, tabela com NIPC,
//    Entidade, Projeto, Valor Anterior, Valor Atual, Variação € e %.
//
// Reaproveita os saldosHist já calculados (data anterior) para o modo compacto,
// e calcula um segundo conjunto de saldos para a "data atual" arbitrária no
// modo expandido.
// ────────────────────────────────────────────────────────────────────────────
function CaixaDinamicoBar({
  checkedEmps,
  empresasEnriquecidas,
  somaChecked,
  somaHistorica,
  loadingHist,
  saldosHist,
  compareDate,
  setCompareDate,
  diffAbs,
  diffPct,
  onClear,
}) {
  const [expanded, setExpanded] = useState(false);
  const todayISO = new Date().toISOString().slice(0, 10);
  const [dataAtual, setDataAtual] = useState(todayISO);
  const [saldosAtuais, setSaldosAtuais] = useState({}); // saldo em "Data Atual" selecionada
  const [loadingAtual, setLoadingAtual] = useState(false);

  // Buscar saldos na "Data Atual" — usa a mesma lógica do saldosHist mas para a outra data.
  // Quando dataAtual === hoje E não está expandido, podemos usar somaChecked direto (mais barato).
  useEffect(() => {
    if (!expanded) return;
    if (checkedEmps.length === 0 || !dataAtual) {
      setSaldosAtuais({});
      return;
    }
    const contaIds = empresasEnriquecidas
      .filter(e => checkedEmps.includes(e.id))
      .flatMap(e => e.contas.map(c => c.id));
    if (contaIds.length === 0) { setSaldosAtuais({}); return; }

    let cancelled = false;
    setLoadingAtual(true);
    (async () => {
      const out = {};
      await Promise.all(contaIds.map(async (cid) => {
        const { data, error } = await supabase
          .from('movimentos').select('saldo, data, seq')
          .eq('conta_id', cid)
          .lte('data', dataAtual)
          .order('data', { ascending: false })
          .order('seq', { ascending: false, nullsFirst: false })
          .limit(1);
        if (!error) out[cid] = data?.[0]?.saldo ?? 0;
      }));
      if (!cancelled) {
        setSaldosAtuais(out);
        setLoadingAtual(false);
      }
    })();
    return () => { cancelled = true; };
  }, [checkedEmps, dataAtual, empresasEnriquecidas, expanded]);

  // Cálculo por empresa para a tabela expandida
  const empresasSelecionadas = useMemo(() =>
    empresasEnriquecidas.filter(e => checkedEmps.includes(e.id)),
    [empresasEnriquecidas, checkedEmps]
  );

  const linhasTabela = useMemo(() => empresasSelecionadas.map(emp => {
    const contaIds = emp.contas.map(c => c.id);
    const valorAnterior = contaIds.reduce((s, cid) => s + (parseFloat(saldosHist[cid]) || 0), 0);
    const valorAtual = contaIds.reduce((s, cid) => s + (parseFloat(saldosAtuais[cid]) || 0), 0);
    const variacaoAbs = valorAtual - valorAnterior;
    const variacaoPct = Math.abs(valorAnterior) > 0.01 ? (variacaoAbs / Math.abs(valorAnterior)) * 100 : null;
    return {
      id: emp.id,
      nipc: emp.nipc,
      nome: emp.nome,
      projeto: emp.projeto || emp.nome,
      valorAnterior,
      valorAtual,
      variacaoAbs,
      variacaoPct,
    };
  }), [empresasSelecionadas, saldosHist, saldosAtuais]);

  const totaisTabela = useMemo(() => ({
    anterior: linhasTabela.reduce((s, l) => s + l.valorAnterior, 0),
    atual: linhasTabela.reduce((s, l) => s + l.valorAtual, 0),
    variacaoAbs: linhasTabela.reduce((s, l) => s + l.variacaoAbs, 0),
  }), [linhasTabela]);
  const totalVarPct = Math.abs(totaisTabela.anterior) > 0.01
    ? (totaisTabela.variacaoAbs / Math.abs(totaisTabela.anterior)) * 100
    : null;

  // ─── Modo COMPACTO ──────────────────────────────────────────────────────
  if (!expanded) {
    return (
      <div style={{ background: "#1a1a2e", borderRadius: 10, padding: "14px 20px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <span style={{ color: "#aaa", fontSize: 13 }}>
            <strong style={{ color: "#fff" }}>{checkedEmps.length}</strong> empresa(s) selecionada(s)
          </span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#888", fontSize: 9, fontFamily: "monospace", letterSpacing: 0.5, textTransform: "uppercase" }}>Hoje</span>
            <span style={{ color: "#6B7C93", fontSize: 20, fontFamily: "monospace", fontWeight: 700, lineHeight: 1.1 }}>{fmtN(somaChecked)}</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <label style={{ color: "#888", fontSize: 9, fontFamily: "monospace", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }}>Comparar com</label>
            <input type="date" value={compareDate} onChange={e => setCompareDate(e.target.value)}
              style={{ background: "#0f0f1a", color: "#fff", border: "1px solid #ffffff22", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontFamily: "monospace", outline: "none", colorScheme: "dark" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#888", fontSize: 9, fontFamily: "monospace", letterSpacing: 0.5, textTransform: "uppercase" }}>
              Saldo a {compareDate}
            </span>
            <span style={{ color: "#bbb", fontSize: 17, fontFamily: "monospace", fontWeight: 600, lineHeight: 1.1 }}>
              {loadingHist ? "…" : fmtN(somaHistorica || 0)}
            </span>
          </div>

          {diffAbs !== null && !loadingHist && (
            <div style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid #ffffff22", paddingLeft: 14 }}>
              <span style={{ color: "#888", fontSize: 9, fontFamily: "monospace", letterSpacing: 0.5, textTransform: "uppercase" }}>Variação</span>
              <span style={{ color: diffAbs >= 0 ? "#22c55e" : "#ef4444", fontSize: 17, fontFamily: "monospace", fontWeight: 700, lineHeight: 1.1 }}>
                {diffAbs >= 0 ? "+" : ""}{fmtN(diffAbs)}
                {diffPct !== null && (
                  <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.8 }}>
                    ({diffAbs >= 0 ? "+" : ""}{fmtNum(diffPct,1)}%)
                  </span>
                )}
              </span>
            </div>
          )}

          <button onClick={() => setExpanded(true)}
            title="Abrir vista detalhada por empresa"
            style={{ background: "#6B7C93", color: "#1a1a2e", border: "none", padding: "8px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontWeight: 700, marginLeft: 4 }}>
            📊 Ver detalhado
          </button>

          <button onClick={onClear}
            style={{ background: "#ffffff22", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>
            Limpar
          </button>
        </div>
      </div>
    );
  }

  // ─── Modo EXPANDIDO ─────────────────────────────────────────────────────
  return (
    <div style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #2a2a4e 100%)", borderRadius: 14, padding: "20px 24px", color: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#6B7C93", fontFamily: "Georgia, serif" }}>Caixa Único Dinâmico</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Selecione as SPV's para criar sua visualização personalizada</div>
        </div>
        <button onClick={() => setExpanded(false)}
          style={{ background: "#ffffff15", color: "#fff", border: "1px solid #ffffff22", padding: "8px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
          ↑ Fechar
        </button>
      </div>

      {/* Seletores de datas */}
      <div style={{ display: "flex", gap: 24, marginBottom: 18, paddingBottom: 18, borderBottom: "1px solid #ffffff15", flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", color: "#888", fontSize: 9, fontFamily: "monospace", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 5 }}>Selecione a Data Anterior</label>
          <input type="date" value={compareDate} onChange={e => setCompareDate(e.target.value)}
            style={{ background: "#0f0f1a", color: "#fff", border: "1px solid #ffffff22", borderRadius: 6, padding: "8px 12px", fontSize: 13, fontFamily: "monospace", outline: "none", colorScheme: "dark" }} />
        </div>
        <div>
          <label style={{ display: "block", color: "#888", fontSize: 9, fontFamily: "monospace", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 5 }}>Selecione a Data Atual</label>
          <input type="date" value={dataAtual} onChange={e => setDataAtual(e.target.value)}
            style={{ background: "#0f0f1a", color: "#fff", border: "1px solid #ffffff22", borderRadius: 6, padding: "8px 12px", fontSize: 13, fontFamily: "monospace", outline: "none", colorScheme: "dark" }} />
        </div>
      </div>

      {/* Tabela comparativa */}
      <div style={{ background: "#ffffff08", borderRadius: 10, overflow: "hidden", border: "1px solid #ffffff15" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#ffffff08" }}>
                {[
                  { label: "NIPC", sub: null },
                  { label: "Entidade", sub: null },
                  { label: "Projeto", sub: null },
                  { label: "Data Anterior", sub: compareDate },
                  { label: "Data Atual", sub: dataAtual },
                  { label: "Valor Variação", sub: "€" },
                  { label: "% Variação", sub: "%" },
                ].map((h, i) => (
                  <th key={i} style={{ padding: "12px 16px", textAlign: i >= 3 ? "right" : "left", color: "#888", fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "monospace", borderBottom: "1px solid #ffffff15" }}>
                    <div>{h.label}</div>
                    {h.sub && <div style={{ fontSize: 9, color: "#555", marginTop: 2, fontWeight: 400 }}>{h.sub}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhasTabela.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 30, textAlign: "center", color: "#666" }}>
                    Seleciona uma ou mais empresas em cima para comparar
                  </td>
                </tr>
              )}
              {linhasTabela.map(l => {
                const varColor = l.variacaoAbs > 0 ? "#22c55e" : l.variacaoAbs < 0 ? "#ef4444" : "#888";
                return (
                  <tr key={l.id} style={{ borderBottom: "1px solid #ffffff08" }}>
                    <td style={{ padding: "10px 16px", color: "#aaa", fontFamily: "monospace" }}>{l.nipc || "—"}</td>
                    <td style={{ padding: "10px 16px", color: "#fff" }}>{l.nome}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ background: "#ffffff10", color: "#bbb", padding: "3px 10px", borderRadius: 12, fontSize: 10, fontFamily: "monospace" }}>{l.projeto}</span>
                    </td>
                    <td style={{ padding: "10px 16px", color: l.valorAnterior < 0 ? "#ef4444" : "#22c55e", fontFamily: "monospace", fontWeight: 600, textAlign: "right" }}>
                      {loadingHist ? "…" : fmtN(l.valorAnterior)}
                    </td>
                    <td style={{ padding: "10px 16px", color: l.valorAtual < 0 ? "#ef4444" : "#22c55e", fontFamily: "monospace", fontWeight: 600, textAlign: "right" }}>
                      {loadingAtual ? "…" : fmtN(l.valorAtual)}
                    </td>
                    <td style={{ padding: "10px 16px", color: varColor, fontFamily: "monospace", fontWeight: 700, textAlign: "right" }}>
                      {loadingHist || loadingAtual ? "…" : (l.variacaoAbs >= 0 ? "+" : "") + fmtN(l.variacaoAbs)}
                    </td>
                    <td style={{ padding: "10px 16px", color: varColor, fontFamily: "monospace", fontWeight: 700, textAlign: "right" }}>
                      {loadingHist || loadingAtual ? "…" : (l.variacaoPct === null ? "—" : fmtPctSinal(l.variacaoPct))}
                    </td>
                  </tr>
                );
              })}
              {linhasTabela.length > 0 && (
                <tr style={{ background: "#ffffff10", borderTop: "1px solid #ffffff22" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 700, color: "#6B7C93", fontFamily: "monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }} colSpan={3}>
                    ⚪ Totalização
                  </td>
                  <td style={{ padding: "12px 16px", color: totaisTabela.anterior < 0 ? "#ef4444" : "#22c55e", fontFamily: "monospace", fontWeight: 800, textAlign: "right" }}>
                    {fmtN(totaisTabela.anterior)}
                  </td>
                  <td style={{ padding: "12px 16px", color: totaisTabela.atual < 0 ? "#ef4444" : "#22c55e", fontFamily: "monospace", fontWeight: 800, textAlign: "right" }}>
                    {fmtN(totaisTabela.atual)}
                  </td>
                  <td style={{ padding: "12px 16px", color: totaisTabela.variacaoAbs >= 0 ? "#22c55e" : "#ef4444", fontFamily: "monospace", fontWeight: 800, textAlign: "right" }}>
                    {(totaisTabela.variacaoAbs >= 0 ? "+" : "") + fmtN(totaisTabela.variacaoAbs)}
                  </td>
                  <td style={{ padding: "12px 16px", color: totaisTabela.variacaoAbs >= 0 ? "#22c55e" : "#ef4444", fontFamily: "monospace", fontWeight: 800, textAlign: "right" }}>
                    {totalVarPct === null ? "—" : fmtPctSinal(totalVarPct)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rodapé com ação Limpar */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <button onClick={onClear}
          style={{ background: "#ffffff15", color: "#fff", border: "1px solid #ffffff22", padding: "7px 16px", borderRadius: 8, fontSize: 11, cursor: "pointer" }}>
          Limpar Seleção
        </button>
      </div>
    </div>
  );
}


// ────────────────────────────────────────────────────────────────────────────
// Gerar Apresentação PPTX
// Baseado no template "RC_junho_variação.pdf" — Variação de Caixa + Movimentações
// ────────────────────────────────────────────────────────────────────────────

// Carrega pptxgenjs do CDN uma única vez
let _pptxLoader = null;
function loadPptxGenJS() {
  if (window.PptxGenJS) return Promise.resolve(window.PptxGenJS);
  if (_pptxLoader) return _pptxLoader;
  _pptxLoader = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js";
    s.onload = () => resolve(window.PptxGenJS);
    s.onerror = () => reject(new Error("Falha a carregar pptxgenjs do CDN"));
    document.head.appendChild(s);
  });
  return _pptxLoader;
}

// Formatadores dedicados à apresentação
const fmtEur = (v) => {
  const n = Number(v) || 0;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return sign + "€" + fmtNum(abs, 2);
};
const fmtDataPT = (iso) => {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("T")[0].split("-");
  return `${d}/${m}/${y}`;
};
const fmtDataCurta = (iso) => {
  if (!iso) return "";
  const [, m, d] = String(iso).split("T")[0].split("-");
  return `${d}/${m}`;
};

// ────────────────────────────────────────────────────────────────────────────
// EXPORTAÇÃO DO EXTRATO PARA EXCEL (.xlsx)
// Exporta exatamente o que está filtrado no ecrã (período, descrição, categoria).
// ────────────────────────────────────────────────────────────────────────────

// Carrega SheetJS do CDN uma única vez
let _xlsxLoader = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_xlsxLoader) return _xlsxLoader;
  _xlsxLoader = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error("Falha a carregar a biblioteca de Excel do CDN"));
    document.head.appendChild(s);
  });
  return _xlsxLoader;
}

// "2026-07-31" → Date ao meio-dia (evita saltos de fuso horário)
const isoParaData = (iso) => {
  const base = String(iso || "").split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return null;
  return new Date(base + "T12:00:00");
};

const limparNomeFicheiro = (txt) =>
  String(txt || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const FMT_EUR = '#,##0.00\\ "€"';
const FMT_DATA = "dd-mm-yyyy";

async function exportarExtratoExcel({ empresaNome, banco, sheetOrigem, movimentos, dataDe, dataAte, descFiltro, catFiltro }) {
  const XLSX = await loadXLSX();

  // Ordem cronológica ascendente para leitura de extrato
  const movs = [...movimentos].sort((a, b) => {
    const da = (a.data || a.data_str || ""), db = (b.data || b.data_str || "");
    if (da !== db) return da < db ? -1 : 1;
    return (a.seq ?? 0) - (b.seq ?? 0);
  });

  const entradas = movs.filter(m => (m.valor || 0) > 0).reduce((s, m) => s + (m.valor || 0), 0);
  const saidas   = movs.filter(m => (m.valor || 0) < 0).reduce((s, m) => s + (m.valor || 0), 0);
  const saldoFinal = movs.length ? (movs[movs.length - 1].saldo ?? null) : null;
  const saldoInicial = movs.length && movs[0].saldo != null
    ? (movs[0].saldo - (movs[0].valor || 0)) : null;

  const periodoTxt = (dataDe || dataAte)
    ? `${dataDe ? fmtDataPT(dataDe) : "início"} a ${dataAte ? fmtDataPT(dataAte) : "hoje"}`
    : "Todo o histórico";

  const filtrosTxt = [
    descFiltro ? `descrição contém "${descFiltro}"` : null,
    (catFiltro && catFiltro !== "Todas") ? `categoria "${catFiltro}"` : null,
  ].filter(Boolean).join(" · ") || "—";

  // ─── Folha 1: Extrato ───────────────────────────────────────────────────
  const cabecalho = [
    ["EXTRATO BANCÁRIO"],
    ["Empresa", empresaNome || ""],
    ["Conta", banco || ""],
    ["Origem", sheetOrigem || ""],
    ["Período", periodoTxt],
    ["Filtros", filtrosTxt],
    ["Movimentos", movs.length],
    ["Exportado em", fmtDataHora(new Date())],
    [],
    ["Data", "Descrição", "Valor", "Saldo", "Categoria", "Detalhes"],
  ];
  const LINHA_CABECALHO = cabecalho.length; // índice 0-based da 1.ª linha de dados

  const linhas = movs.map(m => ([
    isoParaData(m.data || m.data_str) || (m.data || m.data_str || ""),
    m.movimento || "",
    Number(m.valor) || 0,
    m.saldo != null ? Number(m.saldo) : null,
    m.categoria || "",
    m.detalhes || "",
  ]));

  const totais = [
    [],
    ["", "Entradas", entradas],
    ["", "Saídas", saidas],
    ["", "Variação do período", entradas + saidas],
    ["", "Saldo inicial", saldoInicial],
    ["", "Saldo final", saldoFinal],
  ];

  const ws = XLSX.utils.aoa_to_sheet([...cabecalho, ...linhas, ...totais], { cellDates: true });

  // Formatos: coluna A (datas) e colunas C/D (valores) da zona de dados
  linhas.forEach((_, i) => {
    const r = LINHA_CABECALHO + i;
    const cData = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (cData && cData.t === "d") cData.z = FMT_DATA;
    [2, 3].forEach(c => {
      const cel = ws[XLSX.utils.encode_cell({ r, c })];
      if (cel && cel.t === "n") cel.z = FMT_EUR;
    });
  });
  // Formatos da zona de totais (coluna C)
  const inicioTotais = LINHA_CABECALHO + linhas.length + 1;
  for (let r = inicioTotais; r < inicioTotais + 5; r++) {
    const cel = ws[XLSX.utils.encode_cell({ r, c: 2 })];
    if (cel && cel.t === "n") cel.z = FMT_EUR;
  }

  ws["!cols"] = [{ wch: 12 }, { wch: 52 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 34 }];
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range(
      { r: LINHA_CABECALHO - 1, c: 0 },
      { r: LINHA_CABECALHO + Math.max(linhas.length - 1, 0), c: 5 }
    )
  };

  // ─── Folha 2: Resumo por categoria ──────────────────────────────────────
  const porCat = {};
  movs.forEach(m => {
    const k = m.categoria || "— sem categoria —";
    if (!porCat[k]) porCat[k] = { n: 0, entradas: 0, saidas: 0 };
    porCat[k].n++;
    if ((m.valor || 0) >= 0) porCat[k].entradas += m.valor || 0;
    else porCat[k].saidas += m.valor || 0;
  });
  const resumo = [
    ["RESUMO POR CATEGORIA"],
    ["Período", periodoTxt],
    [],
    ["Categoria", "N.º mov.", "Entradas", "Saídas", "Líquido"],
    ...Object.entries(porCat)
      .sort((a, b) => (a[1].entradas + a[1].saidas) - (b[1].entradas + b[1].saidas))
      .map(([cat, v]) => [cat, v.n, v.entradas, v.saidas, v.entradas + v.saidas]),
    [],
    ["TOTAL", movs.length, entradas, saidas, entradas + saidas],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(resumo);
  for (let r = 4; r < resumo.length; r++) {
    [2, 3, 4].forEach(c => {
      const cel = ws2[XLSX.utils.encode_cell({ r, c })];
      if (cel && cel.t === "n") cel.z = FMT_EUR;
    });
  }
  ws2["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Extrato");
  XLSX.utils.book_append_sheet(wb, ws2, "Resumo por categoria");

  const sufixo = (dataDe || dataAte)
    ? `${(dataDe || "inicio").replace(/-/g, "")}_${(dataAte || "hoje").replace(/-/g, "")}`
    : "completo";
  const nome = `Extrato_${limparNomeFicheiro(empresaNome)}_${limparNomeFicheiro(banco)}_${sufixo}.xlsx`;

  XLSX.writeFile(wb, nome, { cellDates: true, compression: true });
  return nome;
}

async function buscarSaldoNaData(contaId, dataISO) {
  // Último saldo do movimento com data <= dataISO
  const { data, error } = await supabase
    .from("movimentos")
    .select("saldo, data, seq")
    .eq("conta_id", contaId)
    .lte("data", dataISO)
    .order("data", { ascending: false })
    .order("seq", { ascending: false })
    .limit(1);
  if (error || !data || !data.length) return null;
  return parseFloat(data[0].saldo) || 0;
}

async function buscarMovimentosPeriodo(contaId, dataInicio, dataFim) {
  // Paginado para contas grandes
  const out = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("movimentos")
      .select("*")
      .eq("conta_id", contaId)
      .gt("data", dataInicio)      // > início (o saldo inicial já reflecte tudo até esse dia inclusive)
      .lte("data", dataFim)         // <= fim (inclui movimentos do próprio dia final)
      .order("data", { ascending: true })
      .order("seq", { ascending: true })
      .range(from, from + step - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < step) break;
    from += step;
  }
  return out;
}

function GerarApresentacaoModal({ empresasEnriquecidas, onClose }) {
  // Datas padrão: primeiro dia do mês passado até primeiro dia do mês atual
  const hoje = new Date();
  const primeiroDiaMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const primeiroDiaMesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const toISO = (d) => d.toISOString().slice(0, 10);

  const [dataInicio, setDataInicio] = useState(toISO(primeiroDiaMesPassado));
  const [dataFim, setDataFim] = useState(toISO(primeiroDiaMesAtual));

  // Modo de apresentação
  const [modo, setModo] = useState("mensal");     // "mensal" | "anual"
  const trocaModo = (novoModo) => {
    setModo(novoModo);
    if (novoModo === "anual") {
      const anoAtual = new Date().getFullYear();
      setDataInicio(`${anoAtual}-01-01`);
      setDataFim(toISO(new Date()));
    } else {
      setDataInicio(toISO(primeiroDiaMesPassado));
      setDataFim(toISO(primeiroDiaMesAtual));
    }
  };

  // Selecção empresas — default todas
  const [empSel, setEmpSel] = useState(() => empresasEnriquecidas.map(e => e.id));
  // Selecção contas — default todas
  const [contaSel, setContaSel] = useState(() => {
    const s = new Set();
    empresasEnriquecidas.forEach(e => e.contas.forEach(c => s.add(c.id)));
    return s;
  });

  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [erro, setErro] = useState("");

  const toggleEmp = (id) => setEmpSel(empSel.includes(id) ? empSel.filter(x => x !== id) : [...empSel, id]);
  const toggleConta = (id) => {
    const s = new Set(contaSel);
    if (s.has(id)) s.delete(id); else s.add(id);
    setContaSel(s);
  };

  // Contas efectivas: só as das empresas seleccionadas E marcadas
  const contasParaProcessar = useMemo(() => {
    const out = [];
    empresasEnriquecidas.filter(e => empSel.includes(e.id)).forEach(emp => {
      emp.contas.forEach(c => {
        if (contaSel.has(c.id)) out.push({ ...c, empresaNome: emp.nome, empresaId: emp.id });
      });
    });
    return out;
  }, [empresasEnriquecidas, empSel, contaSel]);

  // ── Gerador ANUAL — resumo agregado por empresa com gráfico mensal ──
  const gerarPptxAnual = async (PptxGenJS) => {
    // 1. Datas do início e fim
    const anoInicio = parseInt(dataInicio.slice(0, 4));
    const mesInicio = parseInt(dataInicio.slice(5, 7)) - 1;
    const anoFim = parseInt(dataFim.slice(0, 4));
    const mesFim = parseInt(dataFim.slice(5, 7)) - 1;
    const nomesMeses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const dataPrev = new Date(dataInicio + "T00:00:00");
    dataPrev.setDate(dataPrev.getDate() - 1);
    const dataPrevISO = dataPrev.toISOString().slice(0, 10);

    // 2. Pontos mensais para o gráfico
    const pontosMes = [];
    {
      let ano = anoInicio, mes = mesInicio;
      while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
        const isMesFinal = (ano === anoFim && mes === mesFim);
        const dataConsulta = isMesFinal ? dataFim
          : new Date(ano, mes + 1, 0).toISOString().slice(0, 10);
        pontosMes.push({
          label: isMesFinal ? `${nomesMeses[mes]} (Total)` : nomesMeses[mes],
          dataConsulta,
        });
        mes++;
        if (mes > 11) { mes = 0; ano++; }
      }
    }

    // 3. Recolher saldos mensais + movimentos por conta
    const contasData = [];
    for (let i = 0; i < contasParaProcessar.length; i++) {
      const c = contasParaProcessar[i];
      setProgresso(`Conta ${i + 1}/${contasParaProcessar.length}: ${c.empresaNome} — ${c.banco}`);
      const saldoIni = await buscarSaldoNaData(c.id, dataPrevISO);
      const saldosMes = await Promise.all(pontosMes.map(p => buscarSaldoNaData(c.id, p.dataConsulta)));
      const movs = await buscarMovimentosPeriodo(c.id, dataPrevISO, dataFim);
      contasData.push({
        ...c,
        saldoIni: saldoIni ?? 0,
        saldosMes: saldosMes.map(s => s ?? 0),
        movs,
      });
    }

    // 4. Agregar por empresa
    const porEmpresa = {};
    contasData.forEach(c => {
      if (!porEmpresa[c.empresaId]) {
        porEmpresa[c.empresaId] = {
          id: c.empresaId,
          nome: c.empresaNome,
          contas: [],
          saldoIni: 0,
          saldosMes: pontosMes.map(() => 0),
          movs: [],
        };
      }
      const e = porEmpresa[c.empresaId];
      e.contas.push(c.banco);
      e.saldoIni += c.saldoIni;
      c.saldosMes.forEach((s, idx) => { e.saldosMes[idx] += s; });
      e.movs.push(...c.movs);
    });

    // 5. Calcular positivos/negativos/variação
    Object.values(porEmpresa).forEach(e => {
      e.saldoFim = e.saldosMes[e.saldosMes.length - 1];
      e.variacao = e.saldoFim - e.saldoIni;
      e.positivos = {}; e.negativos = {};
      e.movs.forEach(m => {
        const v = parseFloat(m.valor) || 0;
        const cat = m.categoria || "(sem categoria)";
        if (v > 0) e.positivos[cat] = (e.positivos[cat] || 0) + v;
        else if (v < 0) e.negativos[cat] = (e.negativos[cat] || 0) + v;
      });
      e.totalPositivos = Object.values(e.positivos).reduce((s, v) => s + v, 0);
      e.totalNegativos = Object.values(e.negativos).reduce((s, v) => s + v, 0);
    });
    const empresasArr = Object.values(porEmpresa)
      .sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao));

    // 6. Construir PPTX
    setProgresso("A construir slides…");
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.title = "LPX Private — Variação de Caixa Anual";

    const NAVY = "1A1A4E", GOLD = "6B7C93", RED = "D93B3B", GREEN = "16A34A",
          GREY_L = "F5F5F7", GREY_M = "E8E8EE";
    const totalSlides = empresasArr.length + 1;

    const addFooter = (slide, pageNum) => {
      slide.addShape(pptx.ShapeType.line, {
        x: 0.4, y: 6.85, w: 12.5, h: 0, line: { color: "1A1A2E", width: 1 },
      });
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.4, y: 6.95, w: 0.5, h: 0.5, fill: { color: "1A1A2E" }, line: { color: "1A1A2E" },
      });
      slide.addText("R", {
        x: 0.4, y: 6.95, w: 0.5, h: 0.5, fontSize: 22, bold: true, color: GOLD,
        align: "center", valign: "middle", fontFace: "Georgia",
      });
      slide.addText([
        { text: "RIO", options: { color: "1A1A2E", bold: true, fontSize: 11, charSpacing: 1 } },
        { text: "CAPITAL", options: { color: "888888", fontSize: 8, charSpacing: 2 } },
      ], { x: 0.95, y: 7.05, w: 1.5, h: 0.35, valign: "middle", fontFace: "Calibri" });
      slide.addText(`${pageNum} / ${totalSlides}`, {
        x: 12.4, y: 7.15, w: 0.6, h: 0.3, fontSize: 9, color: "888888",
        align: "right", fontFace: "Calibri",
      });
    };

    // ═══════════════════════ SLIDE 1: Fim de linha Grupo RC ═══════════════════════
    const s1 = pptx.addSlide();
    s1.background = { color: "FFFFFF" };
    s1.addText("Fim de linha Grupo RC", {
      x: 0.5, y: 0.35, w: 10, h: 0.65, fontSize: 30, bold: true, color: NAVY, fontFace: "Calibri",
    });
    s1.addText(`Compilado por grupo — ${fmtDataPT(dataInicio)} a ${fmtDataPT(dataFim)}`, {
      x: 0.5, y: 1.0, w: 10, h: 0.35, fontSize: 13, color: "888888", fontFace: "Calibri",
    });

    // Tabela agregada por empresa
    const t1Header = [
      { text: "Grupo / Empresa", options: { bold: true, color: "FFFFFF", fill: NAVY, align: "left",  valign: "middle" } },
      { text: `Saldo ${dataInicio.slice(8, 10)}/${dataInicio.slice(5, 7)}`, options: { bold: true, color: "FFFFFF", fill: NAVY, align: "right", valign: "middle" } },
      { text: `Saldo ${dataFim.slice(8, 10)}/${dataFim.slice(5, 7)}`,       options: { bold: true, color: "FFFFFF", fill: NAVY, align: "right", valign: "middle" } },
      { text: "Queda/Variação", options: { bold: true, color: "FFFFFF", fill: NAVY, align: "right", valign: "middle" } },
    ];
    const t1Rows = empresasArr.map((e, i) => {
      const zeb = i % 2 === 0 ? "FFFFFF" : GREY_L;
      const sinal = e.variacao >= 0 ? "+" : "";
      return [
        { text: e.nome, options: { fill: zeb, color: "1A1A2E", bold: true, align: "left", valign: "middle" } },
        { text: fmtEur(e.saldoIni), options: { fill: zeb, color: "444444", align: "right", valign: "middle", fontFace: "Consolas" } },
        { text: fmtEur(e.saldoFim), options: { fill: zeb, color: "444444", align: "right", valign: "middle", fontFace: "Consolas" } },
        { text: sinal + fmtEur(e.variacao), options: { fill: zeb, color: e.variacao < 0 ? RED : GREEN, bold: true, align: "right", valign: "middle", fontFace: "Consolas" } },
      ];
    });
    const gTotalIni = empresasArr.reduce((s, e) => s + e.saldoIni, 0);
    const gTotalFim = empresasArr.reduce((s, e) => s + e.saldoFim, 0);
    const gTotalVar = gTotalFim - gTotalIni;
    const gSinal = gTotalVar >= 0 ? "+" : "";
    const t1Total = [
      { text: "TOTAL GERAL", options: { fill: NAVY, color: "FFFFFF", bold: true, align: "left", valign: "middle" } },
      { text: fmtEur(gTotalIni), options: { fill: NAVY, color: "FFFFFF", bold: true, align: "right", valign: "middle", fontFace: "Consolas" } },
      { text: fmtEur(gTotalFim), options: { fill: NAVY, color: "FFFFFF", bold: true, align: "right", valign: "middle", fontFace: "Consolas" } },
      { text: gSinal + fmtEur(gTotalVar), options: { fill: NAVY, color: gTotalVar < 0 ? "FFB4B4" : "A9F0C1", bold: true, align: "right", valign: "middle", fontFace: "Consolas" } },
    ];
    s1.addTable([t1Header, ...t1Rows, t1Total], {
      x: 0.5, y: 1.5, w: 9,
      colW: [2.7, 2.1, 2.1, 2.1],
      rowH: Math.max(0.35, Math.min(0.55, 5.0 / (empresasArr.length + 2))),
      fontSize: 12, fontFace: "Calibri",
      border: { type: "solid", color: "E5E5EA", pt: 0.5 },
    });

    // Card lateral
    const cX = 10, cY = 1.5, cW = 2.95, cH = 5.15;
    s1.addShape(pptx.ShapeType.roundRect, {
      x: cX, y: cY, w: cW, h: cH,
      fill: { color: NAVY }, line: { color: NAVY }, rectRadius: 0.08,
    });
    s1.addText(gTotalVar < 0 ? "QUEDA TOTAL NO PERÍODO" : "GANHO TOTAL NO PERÍODO", {
      x: cX + 0.2, y: cY + 0.2, w: cW - 0.4, h: 0.3,
      fontSize: 10, bold: true, color: GOLD, fontFace: "Calibri", charSpacing: 1.5,
    });
    s1.addText(gSinal + fmtEur(gTotalVar), {
      x: cX + 0.2, y: cY + 0.55, w: cW - 0.4, h: 0.85,
      fontSize: 26, bold: true, color: gTotalVar < 0 ? "FF6B6B" : "72E6A0", fontFace: "Calibri",
    });
    s1.addShape(pptx.ShapeType.line, {
      x: cX + 0.2, y: cY + 1.5, w: cW - 0.4, h: 0, line: { color: GOLD, width: 0.5 },
    });
    s1.addText(fmtDataPT(dataInicio), {
      x: cX + 0.2, y: cY + 1.65, w: cW - 0.4, h: 0.25,
      fontSize: 9, color: GOLD, fontFace: "Calibri",
    });
    s1.addText(fmtEur(gTotalIni), {
      x: cX + 0.2, y: cY + 1.9, w: cW - 0.4, h: 0.4,
      fontSize: 16, bold: true, color: "FFFFFF", fontFace: "Calibri",
    });
    s1.addText(fmtDataPT(dataFim), {
      x: cX + 0.2, y: cY + 2.45, w: cW - 0.4, h: 0.25,
      fontSize: 9, color: GOLD, fontFace: "Calibri",
    });
    s1.addText(fmtEur(gTotalFim), {
      x: cX + 0.2, y: cY + 2.7, w: cW - 0.4, h: 0.4,
      fontSize: 16, bold: true, color: "FFFFFF", fontFace: "Calibri",
    });
    // Notas de agrupamento (empresas com >1 conta)
    const notasAgr = empresasArr
      .filter(e => e.contas.length > 1)
      .map(e => {
        const cs = e.contas.length === 2
          ? e.contas.join(" e ")
          : e.contas.slice(0, -1).join(", ") + " e " + e.contas[e.contas.length - 1];
        return `${e.nome} reúne ${cs}.`;
      });
    if (notasAgr.length) {
      s1.addText(notasAgr.map(n => ({ text: n + "\n", options: { color: "AAAAAA", fontSize: 8, italic: true } })), {
        x: cX + 0.2, y: cY + cH - 1.5, w: cW - 0.4, h: 1.3,
        fontFace: "Calibri", valign: "bottom",
      });
    }
    addFooter(s1, 1);

    // ═══════════════════════ SLIDES 2..N — Um por empresa ═══════════════════════
    empresasArr.forEach((emp, idx) => {
      const s = pptx.addSlide();
      s.background = { color: "FFFFFF" };

      const contasStr = emp.contas.length === 1 ? emp.contas[0]
        : emp.contas.length === 2 ? emp.contas.join(" e ")
        : emp.contas.slice(0, -1).join(", ") + " e " + emp.contas[emp.contas.length - 1];

      s.addText(`Resumo do Período — ${emp.nome} — ${contasStr}`, {
        x: 0.4, y: 0.3, w: 12.5, h: 0.55, fontSize: 22, bold: true, color: NAVY, fontFace: "Calibri",
      });
      s.addText(`Ano de ${anoInicio} (${fmtDataPT(dataInicio)} a ${fmtDataPT(dataFim)})`, {
        x: 0.4, y: 0.85, w: 12.5, h: 0.3, fontSize: 12, color: "888888", fontFace: "Calibri",
      });
      s.addShape(pptx.ShapeType.line, {
        x: 0.4, y: 1.22, w: 12.5, h: 0, line: { color: "E5E5EA", width: 0.5 },
      });

      const colY = 1.4, colH = 5.4;

      // ── COLUNA 1: POSITIVOS ──
      const p1X = 0.4, p1W = 4.2;
      s.addShape(pptx.ShapeType.roundRect, {
        x: p1X, y: colY, w: p1W, h: colH,
        fill: { color: "FFFFFF" }, line: { color: GREEN, width: 1 }, rectRadius: 0.06,
      });
      s.addText("SALDOS POSITIVOS", {
        x: p1X + 0.2, y: colY + 0.15, w: p1W - 0.4, h: 0.25,
        fontSize: 10, bold: true, color: "666666", fontFace: "Calibri", charSpacing: 1.5,
      });
      s.addText(fmtEur(emp.totalPositivos), {
        x: p1X + 0.2, y: colY + 0.4, w: p1W - 0.4, h: 0.55,
        fontSize: 22, bold: true, color: GREEN, fontFace: "Calibri",
      });
      s.addShape(pptx.ShapeType.line, {
        x: p1X + 0.2, y: colY + 1.0, w: p1W - 0.4, h: 0, line: { color: GREY_M, width: 0.5 },
      });
      const posArr = Object.entries(emp.positivos).sort((a, b) => b[1] - a[1]);
      if (posArr.length === 0) {
        s.addText("Sem entradas no período", {
          x: p1X + 0.2, y: colY + 1.3, w: p1W - 0.4, h: 0.3,
          fontSize: 10, italic: true, color: "AAAAAA", fontFace: "Calibri",
        });
      } else {
        const rowH = 0.42;
        const maxPorCol = 9;
        const emDuas = posArr.length > 5;
        const maxTotal = emDuas ? maxPorCol * 2 : maxPorCol;
        const halfW = emDuas ? (p1W - 0.5) / 2 : (p1W - 0.4);

        let itemsP = posArr;
        if (posArr.length > maxTotal) {
          const mostradas = posArr.slice(0, maxTotal - 1);
          const restantes = posArr.slice(maxTotal - 1);
          const somaRestantes = restantes.reduce((s, [, v]) => s + v, 0);
          itemsP = [...mostradas, [`+${restantes.length} outras categorias`, somaRestantes]];
        }

        const perCol = emDuas ? Math.ceil(itemsP.length / 2) : itemsP.length;
        itemsP.forEach(([cat, v], i) => {
          const col = emDuas && i >= perCol ? 1 : 0;
          const idxCol = col === 0 ? i : i - perCol;
          const xItem = p1X + 0.2 + (emDuas ? col * (halfW + 0.1) : 0);
          const yItem = colY + 1.15 + idxCol * rowH;
          s.addText("+" + fmtEur(v), {
            x: xItem, y: yItem, w: halfW, h: 0.22,
            fontSize: emDuas ? 10 : 11, bold: true, color: GREEN, fontFace: "Calibri",
          });
          s.addText(cat, {
            x: xItem, y: yItem + 0.2, w: halfW, h: 0.2,
            fontSize: emDuas ? 8 : 9, color: GREEN, fontFace: "Calibri",
          });
        });
      }

      // ── COLUNA 2: NEGATIVOS ──
      const p2X = 4.7, p2W = 4.2;
      s.addShape(pptx.ShapeType.roundRect, {
        x: p2X, y: colY, w: p2W, h: colH,
        fill: { color: "FFFFFF" }, line: { color: RED, width: 1 }, rectRadius: 0.06,
      });
      s.addText("SALDOS NEGATIVOS", {
        x: p2X + 0.2, y: colY + 0.15, w: p2W - 0.4, h: 0.25,
        fontSize: 10, bold: true, color: "666666", fontFace: "Calibri", charSpacing: 1.5,
      });
      s.addText(fmtEur(emp.totalNegativos), {
        x: p2X + 0.2, y: colY + 0.4, w: p2W - 0.4, h: 0.55,
        fontSize: 22, bold: true, color: RED, fontFace: "Calibri",
      });
      s.addShape(pptx.ShapeType.line, {
        x: p2X + 0.2, y: colY + 1.0, w: p2W - 0.4, h: 0, line: { color: GREY_M, width: 0.5 },
      });
      const negArr = Object.entries(emp.negativos).sort((a, b) => a[1] - b[1]);
      if (negArr.length === 0) {
        s.addText("Sem saídas no período", {
          x: p2X + 0.2, y: colY + 1.3, w: p2W - 0.4, h: 0.3,
          fontSize: 10, italic: true, color: "AAAAAA", fontFace: "Calibri",
        });
      } else {
        // Espaço útil no card: colY+1.15 até colY+colH-0.15 = 4.1"
        // Cada linha dupla (valor + label): 0.42"
        // Máx por coluna: 9 linhas; em duas colunas: 18 total
        const rowH = 0.42;
        const maxPorCol = 9;
        const emDuasNeg = negArr.length > 5;
        const maxTotal = emDuasNeg ? maxPorCol * 2 : maxPorCol;
        const halfWN = emDuasNeg ? (p2W - 0.5) / 2 : (p2W - 0.4);

        // Se sobra: agrupa o resto em "+N outras"
        let items = negArr;
        if (negArr.length > maxTotal) {
          const mostradas = negArr.slice(0, maxTotal - 1);
          const restantes = negArr.slice(maxTotal - 1);
          const somaRestantes = restantes.reduce((s, [, v]) => s + v, 0);
          items = [...mostradas, [`+${restantes.length} outras categorias`, somaRestantes]];
        }

        const perCol = emDuasNeg ? Math.ceil(items.length / 2) : items.length;
        items.forEach(([cat, v], i) => {
          const col = emDuasNeg && i >= perCol ? 1 : 0;
          const idxCol = col === 0 ? i : i - perCol;
          const xItem = p2X + 0.2 + (emDuasNeg ? col * (halfWN + 0.1) : 0);
          const yItem = colY + 1.15 + idxCol * rowH;
          s.addText(fmtEur(v), {
            x: xItem, y: yItem, w: halfWN, h: 0.22,
            fontSize: emDuasNeg ? 10 : 11, bold: true, color: RED, fontFace: "Calibri",
          });
          s.addText(cat, {
            x: xItem, y: yItem + 0.2, w: halfWN, h: 0.2,
            fontSize: emDuasNeg ? 8 : 9, color: RED, fontFace: "Calibri",
          });
        });
      }

      // ── COLUNA 3: VARIAÇÃO + GRÁFICO ──
      const p3X = 9.0, p3W = 4.0;
      s.addShape(pptx.ShapeType.roundRect, {
        x: p3X, y: colY, w: p3W, h: colH,
        fill: { color: "FFFFFF" }, line: { color: GREY_M, width: 1 }, rectRadius: 0.06,
      });
      s.addText("VARIAÇÃO TOTAL DO ANO", {
        x: p3X + 0.2, y: colY + 0.15, w: p3W - 0.4, h: 0.25,
        fontSize: 10, bold: true, color: "666666", fontFace: "Calibri", charSpacing: 1.5,
      });
      const sinalV = emp.variacao >= 0 ? "+" : "";
      s.addText(sinalV + fmtEur(emp.variacao), {
        x: p3X + 0.2, y: colY + 0.4, w: p3W - 0.4, h: 0.55,
        fontSize: 22, bold: true, color: emp.variacao < 0 ? RED : GREEN, fontFace: "Calibri",
      });

      // Gráfico linha
      const chartValues = emp.saldosMes.map(v => v - emp.saldoIni);
      const chartData = [{
        name: "Variação acumulada",
        labels: pontosMes.map(p => p.label),
        values: chartValues,
      }];
      const maxAbs = Math.max(1, ...chartValues.map(Math.abs));
      let fmtCode = "#,##0";
      if (maxAbs >= 1e6) fmtCode = '#,##0.0,,"M"';
      else if (maxAbs >= 1e4) fmtCode = '#,##0,"k"';
      s.addChart(pptx.ChartType.line, chartData, {
        x: p3X + 0.15, y: colY + 1.05, w: p3W - 0.3, h: colH - 1.5,
        chartColors: ["1A1A2E"],
        lineDataSymbol: "circle",
        lineDataSymbolSize: 8,
        lineDataSymbolLineColor: "1A1A2E",
        lineSize: 2,
        showLegend: false,
        showValue: true,
        dataLabelPosition: "t",
        dataLabelFontSize: 8,
        dataLabelFormatCode: fmtCode,
        catAxisLabelFontSize: 8,
        valAxisLabelFontSize: 7,
        valAxisLabelFormatCode: fmtCode,
      });
      s.addText(`● O último ponto (${pontosMes[pontosMes.length - 1].label}) é a variação total acumulada do ano: ${sinalV}${fmtEur(emp.variacao)}`, {
        x: p3X + 0.2, y: colY + colH - 0.35, w: p3W - 0.4, h: 0.3,
        fontSize: 7, italic: true, color: "666666", fontFace: "Calibri",
      });

      addFooter(s, idx + 2);
    });

    // Download
    setProgresso("A gerar ficheiro…");
    const anoStr = anoInicio === anoFim ? String(anoInicio) : `${anoInicio}-${anoFim}`;
    await pptx.writeFile({ fileName: `RC_Anual_${anoStr}_variacao.pptx` });
  };

  const gerar = async () => {
    if (contasParaProcessar.length === 0) { setErro("Selecciona pelo menos uma conta."); return; }
    if (dataInicio >= dataFim) { setErro("Data inicial tem de ser anterior à data final."); return; }
    setErro(""); setGerando(true); setProgresso("A carregar biblioteca…");
    try {
      const PptxGenJS = await loadPptxGenJS();

      // Dispatcher
      if (modo === "anual") {
        await gerarPptxAnual(PptxGenJS);
        setProgresso("");
        onClose();
        return;
      }

      // MODO MENSAL (detalhado com lançamentos)
      // 1. Recolher saldos + movimentos por conta
      setProgresso("A calcular saldos…");
      const dataPrev = new Date(dataInicio + "T00:00:00");
      dataPrev.setDate(dataPrev.getDate() - 1);        // saldo "final do dia anterior" = dataInicio-1
      const dataPrevISO = dataPrev.toISOString().slice(0, 10);

      const contasData = [];
      for (let i = 0; i < contasParaProcessar.length; i++) {
        const c = contasParaProcessar[i];
        setProgresso(`A processar ${c.empresaNome} — ${c.banco} (${i + 1}/${contasParaProcessar.length})`);
        const [saldoIni, saldoFim, movs] = await Promise.all([
          buscarSaldoNaData(c.id, dataPrevISO),
          buscarSaldoNaData(c.id, dataFim),
          buscarMovimentosPeriodo(c.id, dataPrevISO, dataFim),
        ]);
        contasData.push({ ...c, saldoIni: saldoIni ?? 0, saldoFim: saldoFim ?? 0, movs });
      }

      // 2. Agregar por empresa para o slide 1
      const porEmpresa = {};
      contasData.forEach(c => {
        if (!porEmpresa[c.empresaId]) porEmpresa[c.empresaId] = { nome: c.empresaNome, saldoIni: 0, saldoFim: 0 };
        porEmpresa[c.empresaId].saldoIni += c.saldoIni;
        porEmpresa[c.empresaId].saldoFim += c.saldoFim;
      });
      const empresasSlide = Object.values(porEmpresa).map(e => ({
        ...e, variacao: e.saldoFim - e.saldoIni,
      })).sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao));

      const totalIni = empresasSlide.reduce((s, e) => s + e.saldoIni, 0);
      const totalFim = empresasSlide.reduce((s, e) => s + e.saldoFim, 0);
      const totalVar = totalFim - totalIni;

      // 3. Construir PPTX
      setProgresso("A construir slides…");
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE";      // 13.333 x 7.5"
      pptx.title = "LPX Private — Variação de Caixa";

      // Cores (paleta baseada no PDF anexado)
      const NAVY = "1A1A4E";
      const NAVY_DK = "12123A";
      const GOLD = "6B7C93";
      const RED = "D93B3B";
      const GREEN = "16A34A";
      const GREY_L = "F5F5F7";
      const GREY_M = "E8E8EE";

      // Função utilitária para adicionar rodapé
      const addFooter = (slide) => {
        slide.addText([
          { text: "LPX PRIVATE", options: { color: NAVY, bold: true, fontSize: 8 } },
          { text: "  ·  ", options: { color: "AAAAAA", fontSize: 8 } },
          { text: `Período: ${fmtDataPT(dataInicio)} → ${fmtDataPT(dataFim)}`, options: { color: "888888", fontSize: 8 } },
        ], { x: 0.4, y: 7.1, w: 12.5, h: 0.3, fontFace: "Calibri" });
      };

      // ═══════════════════════════════════════════════════════════════
      // SLIDE 1 — Variação de Caixa
      // ═══════════════════════════════════════════════════════════════
      const s1 = pptx.addSlide();
      s1.background = { color: "FFFFFF" };

      s1.addText("Variação de Caixa", {
        x: 0.5, y: 0.4, w: 10, h: 0.7,
        fontSize: 34, bold: true, color: NAVY, fontFace: "Calibri",
      });
      s1.addText(`Comparativo de saldos entre ${fmtDataPT(dataInicio)} e ${fmtDataPT(dataFim)}`, {
        x: 0.5, y: 1.05, w: 10, h: 0.35,
        fontSize: 13, color: "888888", fontFace: "Calibri",
      });

      // Tabela empresas × datas × variação
      const tblHeader = [
        { text: "Empresa", options: { bold: true, color: "FFFFFF", fill: NAVY, align: "left",  valign: "middle" } },
        { text: fmtDataPT(dataInicio), options: { bold: true, color: "FFFFFF", fill: NAVY, align: "right", valign: "middle" } },
        { text: fmtDataPT(dataFim),    options: { bold: true, color: "FFFFFF", fill: NAVY, align: "right", valign: "middle" } },
        { text: "Variação", options: { bold: true, color: "FFFFFF", fill: NAVY, align: "right", valign: "middle" } },
      ];
      const tblRows = empresasSlide.map((e, i) => {
        const zebraFill = i % 2 === 0 ? "FFFFFF" : GREY_L;
        return [
          { text: e.nome, options: { fill: zebraFill, color: "1A1A2E", bold: true, align: "left", valign: "middle" } },
          { text: fmtEur(e.saldoIni), options: { fill: zebraFill, color: "444444", align: "right", valign: "middle", fontFace: "Consolas" } },
          { text: fmtEur(e.saldoFim), options: { fill: zebraFill, color: "444444", align: "right", valign: "middle", fontFace: "Consolas" } },
          { text: fmtEur(e.variacao), options: { fill: zebraFill, color: e.variacao < 0 ? RED : GREEN, bold: true, align: "right", valign: "middle", fontFace: "Consolas" } },
        ];
      });
      const tblTotal = [
        { text: "TOTAL", options: { fill: NAVY, color: "FFFFFF", bold: true, align: "left", valign: "middle" } },
        { text: fmtEur(totalIni), options: { fill: NAVY, color: "FFFFFF", bold: true, align: "right", valign: "middle", fontFace: "Consolas" } },
        { text: fmtEur(totalFim), options: { fill: NAVY, color: "FFFFFF", bold: true, align: "right", valign: "middle", fontFace: "Consolas" } },
        { text: fmtEur(totalVar), options: { fill: NAVY, color: totalVar < 0 ? "FFB4B4" : "A9F0C1", bold: true, align: "right", valign: "middle", fontFace: "Consolas" } },
      ];

      s1.addTable([tblHeader, ...tblRows, tblTotal], {
        x: 0.5, y: 1.6, w: 9,
        colW: [3.0, 2.0, 2.0, 2.0],
        rowH: 0.42,
        fontSize: 12, fontFace: "Calibri",
        border: { type: "solid", color: "E5E5EA", pt: 0.5 },
      });

      // Card lateral — Queda Total
      const cardX = 10, cardY = 1.6, cardW = 2.83, cardH = 3.6;
      s1.addShape(pptx.ShapeType.roundRect, {
        x: cardX, y: cardY, w: cardW, h: cardH,
        fill: { color: NAVY }, line: { color: NAVY }, rectRadius: 0.08,
      });
      s1.addText(totalVar < 0 ? "QUEDA TOTAL NO PERÍODO" : "GANHO TOTAL NO PERÍODO", {
        x: cardX + 0.15, y: cardY + 0.15, w: cardW - 0.3, h: 0.35,
        fontSize: 10, bold: true, color: "6B7C93", fontFace: "Calibri", charSpacing: 2,
      });
      s1.addText(fmtEur(totalVar), {
        x: cardX + 0.15, y: cardY + 0.55, w: cardW - 0.3, h: 0.8,
        fontSize: 30, bold: true, color: totalVar < 0 ? "FF6B6B" : "72E6A0", fontFace: "Calibri",
      });
      s1.addText([
        { text: fmtDataPT(dataInicio) + ":\n", options: { color: "6B7C93", bold: true, fontSize: 11 } },
        { text: fmtEur(totalIni), options: { color: "FFFFFF", fontSize: 13 } },
      ], { x: cardX + 0.15, y: cardY + 1.9, w: cardW - 0.3, h: 0.6, fontFace: "Calibri", paraSpaceAfter: 4 });
      s1.addText([
        { text: fmtDataPT(dataFim) + ":\n", options: { color: "6B7C93", bold: true, fontSize: 11 } },
        { text: fmtEur(totalFim), options: { color: "FFFFFF", fontSize: 13 } },
      ], { x: cardX + 0.15, y: cardY + 2.7, w: cardW - 0.3, h: 0.6, fontFace: "Calibri" });

      // Nota de exclusões (contas não seleccionadas)
      const contasExcluidasNomes = [];
      empresasEnriquecidas.forEach(emp => {
        emp.contas.forEach(c => {
          if (!contaSel.has(c.id) || !empSel.includes(emp.id)) {
            contasExcluidasNomes.push(`${emp.nome} ${c.banco}`);
          }
        });
      });
      if (contasExcluidasNomes.length) {
        s1.addText(`Exclui: ${contasExcluidasNomes.slice(0, 5).join(", ")}${contasExcluidasNomes.length > 5 ? ` e mais ${contasExcluidasNomes.length - 5}` : ""}.`, {
          x: 0.5, y: 6.4, w: 12, h: 0.3,
          fontSize: 9, italic: true, color: "888888", fontFace: "Calibri",
        });
      }
      s1.addText(`Fonte: registo de saldos por conta (${fmtDataPT(dataInicio)} e ${fmtDataPT(dataFim)})`, {
        x: 0.5, y: 6.7, w: 12, h: 0.3,
        fontSize: 9, italic: true, color: "888888", fontFace: "Calibri",
      });
      addFooter(s1);

      // ═══════════════════════════════════════════════════════════════
      // SLIDES POR EMPRESA — Movimentações
      // Estratégia: agrupar contas 2 a 2 por slide (como o PDF)
      // ═══════════════════════════════════════════════════════════════
      // Contas com movimentos vs sem movimentos
      const contasComMov = contasData.filter(c => c.movs.length > 0);
      const contasSemMov = contasData.filter(c => c.movs.length === 0);

      const mesNome = new Date(dataInicio + "T00:00:00").toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

      // Cada conta → 1 ou mais slides (nunca 2 contas por slide)
      // Máx movimentos por slide: 18 (garante espaço para header + rodapé)
      const MAX_MOVS_POR_SLIDE = 18;

      contasComMov.forEach(c => {
        const totalPaginas = Math.max(1, Math.ceil(c.movs.length / MAX_MOVS_POR_SLIDE));

        // Card lateral (resumo por categoria + total) — igual em todas as páginas desta conta
        const porCat = {};
        c.movs.forEach(m => {
          const k = m.categoria || "(sem categoria)";
          porCat[k] = (porCat[k] || 0) + (parseFloat(m.valor) || 0);
        });
        const catList = Object.entries(porCat).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
        const totalConta = c.movs.reduce((s, m) => s + (parseFloat(m.valor) || 0), 0);

        for (let pag = 0; pag < totalPaginas; pag++) {
          const s = pptx.addSlide();
          s.background = { color: "FFFFFF" };

          // Título com página se >1
          const tituloBase = `Movimentações — ${c.empresaNome} ${c.banco}`;
          const titulo = totalPaginas > 1 ? `${tituloBase}  (${pag + 1}/${totalPaginas})` : tituloBase;
          s.addText(titulo, {
            x: 0.4, y: 0.3, w: 12.5, h: 0.55,
            fontSize: 22, bold: true, color: NAVY, fontFace: "Calibri",
          });
          s.addText(mesNome.charAt(0).toUpperCase() + mesNome.slice(1), {
            x: 0.4, y: 0.85, w: 12.5, h: 0.3,
            fontSize: 12, color: "888888", fontFace: "Calibri",
          });

          // Título conta
          const yBase = 1.35;
          s.addText(`${c.empresaNome.toUpperCase()} ${c.banco.toUpperCase()}`, {
            x: 0.4, y: yBase, w: 9.6, h: 0.3,
            fontSize: 11, bold: true, color: NAVY, fontFace: "Calibri", charSpacing: 1,
          });

          // Fatia dos movimentos desta página
          const startIdx = pag * MAX_MOVS_POR_SLIDE;
          const movsPagina = c.movs.slice(startIdx, startIdx + MAX_MOVS_POR_SLIDE);

          // Tabela: Data | Descrição | Observação | Valor | Saldo | Categoria
          const movHeader = [
            { text: "Data",       options: { fill: NAVY, color: "FFFFFF", bold: true, fontSize: 9, align: "left",  valign: "middle" } },
            { text: "Descrição",  options: { fill: NAVY, color: "FFFFFF", bold: true, fontSize: 9, align: "left",  valign: "middle" } },
            { text: "Observação", options: { fill: NAVY, color: "FFFFFF", bold: true, fontSize: 9, align: "left",  valign: "middle" } },
            { text: "Valor (€)",  options: { fill: NAVY, color: "FFFFFF", bold: true, fontSize: 9, align: "right", valign: "middle" } },
            { text: "Saldo (€)",  options: { fill: NAVY, color: "FFFFFF", bold: true, fontSize: 9, align: "right", valign: "middle" } },
            { text: "Categoria",  options: { fill: NAVY, color: "FFFFFF", bold: true, fontSize: 9, align: "left",  valign: "middle" } },
          ];
          const movRows = movsPagina.map((m, i) => {
            const zeb = i % 2 === 0 ? "FFFFFF" : GREY_L;
            const valor = parseFloat(m.valor) || 0;
            const desc = m.movimento || m.descricao || "";
            const obs = m.detalhes || "";
            return [
              { text: fmtDataCurta(m.data), options: { fill: zeb, color: "444444", fontSize: 8, align: "left",  valign: "middle", fontFace: "Consolas" } },
              { text: desc.slice(0, 55),    options: { fill: zeb, color: "1A1A2E", fontSize: 8, align: "left",  valign: "middle" } },
              { text: obs.slice(0, 40),     options: { fill: zeb, color: "666666", fontSize: 7, align: "left",  valign: "middle", italic: true } },
              { text: fmtEur(valor).replace("€", ""), options: { fill: zeb, color: valor < 0 ? RED : GREEN, fontSize: 8, bold: true, align: "right", valign: "middle", fontFace: "Consolas" } },
              { text: fmtNum(Number(m.saldo) || 0, 2), options: { fill: zeb, color: "666666", fontSize: 8, align: "right", valign: "middle", fontFace: "Consolas" } },
              { text: m.categoria || "—",   options: { fill: zeb, color: "888888", fontSize: 8, align: "left",  valign: "middle" } },
            ];
          });

          // Altura útil: 6.85 - (yBase + 0.35) = 5.15"
          // 18 linhas + header → rowH = 5.15 / 19 ≈ 0.27
          s.addTable([movHeader, ...movRows], {
            x: 0.4, y: yBase + 0.35, w: 9.6,
            colW: [0.65, 3.1, 2.1, 1.15, 1.3, 1.3],
            rowH: 0.26,
            border: { type: "solid", color: "E5E5EA", pt: 0.5 },
            fontFace: "Calibri",
          });

          // ── Card lateral ──
          const cardX2 = 10.15, cardW2 = 2.8;
          const cardH2 = 5.5;
          s.addShape(pptx.ShapeType.roundRect, {
            x: cardX2, y: yBase, w: cardW2, h: cardH2,
            fill: { color: NAVY }, line: { color: NAVY }, rectRadius: 0.06,
          });
          s.addText("RESUMO DO PERÍODO", {
            x: cardX2 + 0.15, y: yBase + 0.1, w: cardW2 - 0.3, h: 0.25,
            fontSize: 8, bold: true, color: GOLD, fontFace: "Calibri", charSpacing: 1.5,
          });

          // Todas as categorias, com tamanho adaptativo se forem muitas
          // Espaço disponível para categorias: cardH2 - 0.4 (header) - 0.85 (total no fim) = 4.25"
          // Cada categoria ocupa: 2 linhas (valor + label) + espaço
          const alturaDispCat = 4.25;
          const numCats = catList.length;
          // Altura por categoria (valor + label) — ajusta para caber
          const fontValor  = numCats <= 5  ? 11 : numCats <= 8  ? 10 : numCats <= 12 ? 9 : 8;
          const fontLabel  = numCats <= 5  ? 8  : numCats <= 8  ? 7  : numCats <= 12 ? 7 : 6;
          const espacoLinha = Math.min(0.55, alturaDispCat / Math.max(numCats, 1));

          catList.forEach(([cat, v], i) => {
            const yItem = yBase + 0.45 + i * espacoLinha;
            if (yItem + espacoLinha > yBase + cardH2 - 0.85) return;   // segurança
            s.addText(fmtEur(v), {
              x: cardX2 + 0.15, y: yItem, w: cardW2 - 0.3, h: espacoLinha * 0.55,
              fontSize: fontValor, bold: true, color: v < 0 ? "FF6B6B" : "72E6A0", fontFace: "Calibri",
            });
            s.addText(cat, {
              x: cardX2 + 0.15, y: yItem + espacoLinha * 0.55, w: cardW2 - 0.3, h: espacoLinha * 0.4,
              fontSize: fontLabel, color: "FFFFFF", fontFace: "Calibri",
            });
          });

          // Total no fim do card
          s.addText([
            { text: fmtEur(totalConta) + "\n", options: { color: totalConta < 0 ? "FF6B6B" : "72E6A0", bold: true, fontSize: 14 } },
            { text: "TOTAL", options: { color: GOLD, fontSize: 8, bold: true, charSpacing: 1.5 } },
          ], {
            x: cardX2 + 0.15, y: yBase + cardH2 - 0.75, w: cardW2 - 0.3, h: 0.65,
            fontFace: "Calibri", valign: "bottom",
          });

          addFooter(s);
        }
      });

      // Slide final — contas sem movimentos
      if (contasSemMov.length > 0) {
        const s = pptx.addSlide();
        s.background = { color: "FFFFFF" };
        s.addText("Contas sem movimentos no período", {
          x: 0.4, y: 0.3, w: 12.5, h: 0.55,
          fontSize: 22, bold: true, color: NAVY, fontFace: "Calibri",
        });
        s.addText(`${fmtDataPT(dataInicio)} → ${fmtDataPT(dataFim)}`, {
          x: 0.4, y: 0.85, w: 12.5, h: 0.3,
          fontSize: 12, color: "888888", fontFace: "Calibri",
        });

        // Grid 3 colunas
        const colsPerRow = 3;
        contasSemMov.forEach((c, i) => {
          const row = Math.floor(i / colsPerRow);
          const col = i % colsPerRow;
          const cellW = 4.0, cellH = 1.2;
          const cellX = 0.4 + col * (cellW + 0.3);
          const cellY = 1.45 + row * (cellH + 0.3);
          s.addShape(pptx.ShapeType.roundRect, {
            x: cellX, y: cellY, w: cellW, h: cellH,
            fill: { color: GREY_L }, line: { color: GREY_M }, rectRadius: 0.06,
          });
          s.addText(`${c.empresaNome} ${c.banco}`, {
            x: cellX + 0.15, y: cellY + 0.15, w: cellW - 0.3, h: 0.4,
            fontSize: 13, bold: true, color: NAVY, fontFace: "Calibri",
          });
          s.addText(`Saldo em ${fmtDataPT(dataFim)}: ${fmtEur(c.saldoFim)}`, {
            x: cellX + 0.15, y: cellY + 0.55, w: cellW - 0.3, h: 0.4,
            fontSize: 10, color: "666666", fontFace: "Calibri",
          });
        });
        addFooter(s);
      }

      // 4. Download
      setProgresso("A gerar ficheiro…");
      const nomeFicheiro = `RC_${dataInicio}_a_${dataFim}_variacao.pptx`;
      await pptx.writeFile({ fileName: nomeFicheiro });

      setProgresso("");
      onClose();
    } catch (e) {
      console.error(e);
      setErro("Erro ao gerar: " + (e.message || String(e)));
    } finally {
      setGerando(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 12, width: "min(900px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>

        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #eee", background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "Georgia,serif" }}>📊 Gerar Apresentação</div>
            <div style={{ fontSize: 11, color: "#6B7C93", marginTop: 3, fontFamily: "monospace", letterSpacing: 0.5 }}>VARIAÇÃO DE CAIXA + MOVIMENTAÇÕES DO PERÍODO</div>
          </div>
          <button onClick={onClose} disabled={gerando}
            style={{ background: "#ffffff22", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: gerando ? "not-allowed" : "pointer" }}>
            ✕ Fechar
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflow: "auto", flex: 1 }}>

          {/* Modo */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Tipo de apresentação</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => trocaModo("mensal")} disabled={gerando}
                style={{
                  background: modo === "mensal" ? "#1a1a2e" : "#fafafa",
                  color: modo === "mensal" ? "#6B7C93" : "#888",
                  border: `2px solid ${modo === "mensal" ? "#1a1a2e" : "#e5e5e5"}`,
                  padding: "14px 16px", borderRadius: 10, cursor: gerando ? "not-allowed" : "pointer",
                  fontWeight: 700, textAlign: "left", fontFamily: "'DM Sans', sans-serif",
                }}>
                <div style={{ fontSize: 14, marginBottom: 3 }}>📅 Mensal (detalhado)</div>
                <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.85, letterSpacing: 0.3 }}>
                  Variação + tabelas de movimentos por conta
                </div>
              </button>
              <button onClick={() => trocaModo("anual")} disabled={gerando}
                style={{
                  background: modo === "anual" ? "#1a1a2e" : "#fafafa",
                  color: modo === "anual" ? "#6B7C93" : "#888",
                  border: `2px solid ${modo === "anual" ? "#1a1a2e" : "#e5e5e5"}`,
                  padding: "14px 16px", borderRadius: 10, cursor: gerando ? "not-allowed" : "pointer",
                  fontWeight: 700, textAlign: "left", fontFamily: "'DM Sans', sans-serif",
                }}>
                <div style={{ fontSize: 14, marginBottom: 3 }}>📈 Anual (resumo agregado)</div>
                <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.85, letterSpacing: 0.3 }}>
                  Positivos + negativos por categoria e gráfico mensal
                </div>
              </button>
            </div>
          </div>

          {/* Período */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>1. Período</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", marginBottom: 4 }}>DATA INICIAL (saldo de referência anterior)</div>
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} disabled={gerando}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 13, fontFamily: "monospace" }} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", marginBottom: 4 }}>DATA FINAL</div>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} disabled={gerando}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 13, fontFamily: "monospace" }} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 6, fontStyle: "italic" }}>
              {modo === "mensal"
                ? "O slide de variação compara os saldos a estas duas datas. Os slides de movimentações incluem tudo o que passou entre elas."
                : "Modo anual: um slide-síntese por empresa com saldos positivos, negativos e gráfico mensal — sem detalhe de lançamentos."}
            </div>
          </div>

          {/* Empresas */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace", letterSpacing: 0.5, textTransform: "uppercase" }}>2. Empresas ({empSel.length}/{empresasEnriquecidas.length})</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEmpSel(empresasEnriquecidas.map(e => e.id))} disabled={gerando}
                  style={{ background: "#f0f4ff", border: "none", padding: "4px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "#4a6fa5", fontWeight: 600 }}>Todas</button>
                <button onClick={() => setEmpSel([])} disabled={gerando}
                  style={{ background: "#fff0f0", border: "none", padding: "4px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "#a54a4a", fontWeight: 600 }}>Nenhuma</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
              {empresasEnriquecidas.map(emp => {
                const checked = empSel.includes(emp.id);
                return (
                  <label key={emp.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: checked ? "#f0f4ff" : "#fafafa", borderRadius: 7, cursor: gerando ? "not-allowed" : "pointer", border: `1px solid ${checked ? "#c7d2fe" : "#eee"}` }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleEmp(emp.id)} disabled={gerando} style={{ margin: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a2e", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.nome}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Contas (dentro das empresas seleccionadas) */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace", letterSpacing: 0.5, textTransform: "uppercase" }}>3. Contas ({[...contaSel].filter(id => empresasEnriquecidas.some(e => empSel.includes(e.id) && e.contas.some(c => c.id === id))).length} incluídas)</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => {
                  const s = new Set();
                  empresasEnriquecidas.forEach(e => e.contas.forEach(c => s.add(c.id)));
                  setContaSel(s);
                }} disabled={gerando}
                  style={{ background: "#f0f4ff", border: "none", padding: "4px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "#4a6fa5", fontWeight: 600 }}>Todas</button>
                <button onClick={() => setContaSel(new Set())} disabled={gerando}
                  style={{ background: "#fff0f0", border: "none", padding: "4px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "#a54a4a", fontWeight: 600 }}>Nenhuma</button>
              </div>
            </div>
            <div style={{ maxHeight: 200, overflow: "auto", background: "#fafafa", border: "1px solid #eee", borderRadius: 8, padding: 8 }}>
              {empresasEnriquecidas.filter(e => empSel.includes(e.id)).map(emp => (
                <div key={emp.id} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#1a1a2e", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4, letterSpacing: 0.5 }}>{emp.nome}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 8 }}>
                    {emp.contas.map(c => {
                      const checked = contaSel.has(c.id);
                      return (
                        <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", background: checked ? "#e0e7ff" : "#fff", borderRadius: 5, cursor: gerando ? "not-allowed" : "pointer", border: `1px solid ${checked ? "#a5b4fc" : "#eee"}`, fontSize: 10 }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleConta(c.id)} disabled={gerando} style={{ margin: 0, width: 12, height: 12 }} />
                          <span style={{ fontFamily: "monospace", color: "#1a1a2e", fontWeight: 600 }}>{c.banco}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              {empSel.length === 0 && (
                <div style={{ textAlign: "center", color: "#aaa", fontSize: 12, padding: 20, fontStyle: "italic" }}>Selecciona pelo menos uma empresa para escolher contas.</div>
              )}
            </div>
          </div>

          {/* Erro */}
          {erro && (
            <div style={{ background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 8, fontSize: 12, marginBottom: 12, fontWeight: 600 }}>
              ⚠️ {erro}
            </div>
          )}
          {progresso && (
            <div style={{ background: "#fef3c7", color: "#92400e", padding: 12, borderRadius: 8, fontSize: 12, marginBottom: 12, fontFamily: "monospace" }}>
              ⏳ {progresso}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #eee", background: "#fafafa", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }}>
            {contasParaProcessar.length} conta{contasParaProcessar.length === 1 ? "" : "s"} vão ser processadas
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} disabled={gerando}
              style={{ background: "#eee", border: "none", padding: "10px 16px", borderRadius: 7, fontSize: 12, cursor: gerando ? "not-allowed" : "pointer", fontWeight: 600 }}>
              Cancelar
            </button>
            <button onClick={gerar} disabled={gerando || contasParaProcessar.length === 0}
              style={{ background: gerando ? "#888" : "#1a1a2e", color: "#6B7C93", border: "none", padding: "10px 20px", borderRadius: 7, fontSize: 12, cursor: (gerando || contasParaProcessar.length === 0) ? "not-allowed" : "pointer", fontWeight: 700, letterSpacing: 0.5 }}>
              {gerando ? "A gerar…" : (modo === "anual" ? "📈 Gerar PPTX Anual →" : "📅 Gerar PPTX Mensal →")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


export default function ExtratosView({ EMPRESAS, extrato, caixaUnico, setCaixaUnico, currentUser, autoOpenConta, movCounts = {}, faturas = [], pagamentosExtras = [], onUpdateFatura, onUpdatePagamento }) {
  const [checkedEmps, setCheckedEmps] = useState([]);
  const [activeEmp, setActiveEmp] = useState(null);
  const [activeConta, setActiveConta] = useState(null);
  const [showApresentacao, setShowApresentacao] = useState(false);
  // Modal de "Match" — sugestões de faturas/pagamentos com valor próximo ao movimento
  const [matchMov, setMatchMov] = useState(null);

  // Lista de todas as contas para pedir saldos atuais (last movimento.saldo)
  const allContaIds = useMemo(() => (EMPRESAS || []).flatMap(e => e.contas.map(c => c.id)), [EMPRESAS]);
  const { saldos: saldosAtuais, reload: reloadSaldos } = useSaldosAtuais(allContaIds);
  const [editingMov, setEditingMov] = useState(null);
  const [descFilter, setDescFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [perPage, setPerPage] = useState(15);
  const [page, setPage] = useState(1);
  // Período do extrato (filtra a tabela e delimita o que é exportado para Excel)
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [exportando, setExportando] = useState(false);

  // Comparação histórica — saldo dos selecionados a uma data anterior
  const defaultCompareDate = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  };
  const [compareDate, setCompareDate] = useState(defaultCompareDate);
  const [saldosHist, setSaldosHist] = useState({}); // { conta_id: saldoNaData }
  const [loadingHist, setLoadingHist] = useState(false);

  const toggleCheck = (id) => setCheckedEmps(c => c.includes(id) ? c.filter(x=>x!==id) : [...c,id]);

  // Auto-open conta after import — use contaId directly
  useEffect(() => {
    if (!autoOpenConta) return;
    const { empresa: empId, contaId } = autoOpenConta;
    if (!contaId) return;
    const empConfig = EMPRESAS.find(e => e.id === empId);
    if (empConfig) setActiveEmp(empConfig);
    // Set activeConta with just the conta_id so the Supabase hook fires
    setActiveConta({ conta_id: contaId, id: contaId, banco: autoOpenConta.banco });
  }, [autoOpenConta]);

  // Use Supabase for movimentos when conta is selected
  const { movimentos: supaMovimentos, loading: movsLoading, deleteMovimento: sbDelete, updateMovimento: sbUpdate, reload } =
    useMovimentosByConta(activeConta?.id || activeConta?.conta_id || null);

  // Build enriched empresa list using caixaUnico data
  const empresasEnriquecidas = useMemo(() => {
    return EMPRESAS.map(emp => {
      const cuContas = caixaUnico[emp.id] || [];

      const contas = emp.contas.map(c => {
        // Match by sheet name (exact) or by banco name similarity
        const cuMatch = cuContas.find(cu =>
          (c.sheet && cu.sheet === c.sheet) ||
          cu.banco.toLowerCase().replace(/\s/g,'') === c.banco.toLowerCase().replace(/\s/g,'')
        );
        const fallbackMovs = cuMatch ? cuMatch.movimentos : [];
        // Supabase count: se existir é fonte de verdade para os cartões; senão usa o snapshot
        const supaCount = movCounts[c.id];
        const movCount = (supaCount !== undefined && supaCount !== null)
          ? supaCount
          : (fallbackMovs?.length || 0);
        return {
          ...c,
          movimentos: fallbackMovs, // mantém os movimentos reais (snapshot) — não substitui por nulls
          movCount,                  // contagem efetiva para mostrar nos cartões
          // Saldo da caixinha = saldo do último movimento na BD (= o que aparece no topo do extrato).
          // Só usamos fallbacks (snapshot, hardcoded) enquanto o hook ainda não respondeu.
          saldo: (saldosAtuais[c.id] !== undefined) ? saldosAtuais[c.id] : (cuMatch ? cuMatch.saldo : c.saldo),
          sheet: cuMatch ? cuMatch.sheet : (c.sheet || ""),
        };
      });

      return { ...emp, contas };
    });
  }, [EMPRESAS, caixaUnico, extrato, movCounts, saldosAtuais]);

  // somaChecked MUST be after empresasEnriquecidas
  const somaChecked = checkedEmps.length > 0
    ? empresasEnriquecidas.filter(e=>checkedEmps.includes(e.id)).reduce((s,e)=>s+e.contas.reduce((s2,c)=>s2+(c.saldo||0),0),0)
    : null;

  // Buscar saldos históricos das contas selecionadas, na data alvo.
  // Para cada conta, pega-se o último movimento com data <= compareDate.
  // O campo `saldo` desse movimento é o saldo da conta nessa data.
  useEffect(() => {
    if (checkedEmps.length === 0 || !compareDate) {
      setSaldosHist({});
      return;
    }
    const contaIds = empresasEnriquecidas
      .filter(e => checkedEmps.includes(e.id))
      .flatMap(e => e.contas.map(c => c.id));
    if (contaIds.length === 0) { setSaldosHist({}); return; }

    let cancelled = false;
    setLoadingHist(true);
    (async () => {
      const out = {};
      await Promise.all(contaIds.map(async (cid) => {
        // Último movimento com data <= compareDate, ordenado pela data DESC e seq DESC como desempate
        const { data, error } = await supabase
          .from('movimentos').select('saldo, data, seq')
          .eq('conta_id', cid)
          .lte('data', compareDate)
          .order('data', { ascending: false })
          .order('seq', { ascending: false, nullsFirst: false })
          .limit(1);
        if (error) { console.warn('hist saldo error', cid, error); return; }
        out[cid] = data?.[0]?.saldo ?? 0;
      }));
      if (!cancelled) {
        setSaldosHist(out);
        setLoadingHist(false);
      }
    })();
    return () => { cancelled = true; };
  }, [checkedEmps, compareDate, empresasEnriquecidas]);

  // Soma histórica das contas das empresas selecionadas
  const somaHistorica = useMemo(() => {
    if (checkedEmps.length === 0) return null;
    const contaIds = empresasEnriquecidas
      .filter(e => checkedEmps.includes(e.id))
      .flatMap(e => e.contas.map(c => c.id));
    return contaIds.reduce((s, cid) => s + (parseFloat(saldosHist[cid]) || 0), 0);
  }, [checkedEmps, saldosHist, empresasEnriquecidas]);

  const diffAbs = (somaChecked !== null && somaHistorica !== null) ? somaChecked - somaHistorica : null;
  const diffPct = (somaHistorica && Math.abs(somaHistorica) > 0.01) ? (diffAbs / Math.abs(somaHistorica)) * 100 : null;

  const openEmp = (emp) => {
    if (activeEmp && activeEmp.id === emp.id) { setActiveEmp(null); setActiveConta(null); }
    else { setActiveEmp(emp); setActiveConta(null); }
    setDescFilter(""); setCatFilter(""); setPage(1);
  };

  // Exporta para Excel exatamente o que está filtrado (período + descrição + categoria)
  const handleExportarExcel = async () => {
    if (!activeConta || exportando) return;
    if (filtered.length === 0) { alert("Não há movimentos no período selecionado."); return; }
    setExportando(true);
    try {
      await exportarExtratoExcel({
        empresaNome: activeEmp?.nome || "",
        banco: activeConta.banco || "",
        sheetOrigem: activeConta.sheet || "",
        movimentos: filtered,
        dataDe, dataAte,
        descFiltro: descFilter,
        catFiltro: catFilter,
      });
    } catch (e) {
      console.error("Exportar Excel:", e);
      alert("Não foi possível exportar: " + (e?.message || e));
    } finally {
      setExportando(false);
    }
  };

  // Atalhos de período
  const definirPeriodo = (tipo) => {
    const hoje = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    if (tipo === "mes") {
      setDataDe(iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
      setDataAte(iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)));
    } else if (tipo === "mesAnterior") {
      setDataDe(iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)));
      setDataAte(iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)));
    } else if (tipo === "ano") {
      setDataDe(`${hoje.getFullYear()}-01-01`);
      setDataAte(`${hoje.getFullYear()}-12-31`);
    } else {
      setDataDe(""); setDataAte("");
    }
    setPage(1);
  };

  const openConta = (conta) => {
    if (activeConta && activeConta.id === conta.id) { setActiveConta(null); }
    else { setActiveConta(conta); setDescFilter(""); setCatFilter(""); setDataDe(""); setDataAte(""); setPage(1); }
  };

  // Use Supabase movimentos if available, otherwise fall back to local caixaUnico
  const allMovs = useMemo(() => {
    if (supaMovimentos && supaMovimentos.length > 0) return supaMovimentos;
    return activeConta ? (activeConta.movimentos || []) : [];
  }, [supaMovimentos, activeConta]);

  const filtered = useMemo(() => {
    // Order comes from Supabase (seq field = Excel row order). Do NOT re-sort.
    const movs = allMovs.length > 0 ? allMovs : (activeConta ? (activeConta.movimentos || []) : []);
    return movs.filter(m => {
      const d = String(m.data || m.data_str || "").slice(0, 10);
      return (!descFilter || (m.movimento || "").toLowerCase().includes(descFilter.toLowerCase()))
        && (!catFilter || catFilter === "Todas" || m.categoria === catFilter)
        && (!dataDe  || (d && d >= dataDe))
        && (!dataAte || (d && d <= dataAte));
    });
  }, [allMovs, activeConta, descFilter, catFilter, dataDe, dataAte]);

  const cats = useMemo(() => {
    const set = new Set(allMovs.map(m => m.categoria).filter(Boolean));
    return ["Todas", ...[...set].sort()];
  }, [allMovs]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const slice = filtered.slice((page - 1) * perPage, page * perPage);
  const entradas = filtered.filter(m => m.valor > 0).reduce((s, m) => s + m.valor, 0);
  const saidas = filtered.filter(m => m.valor < 0).reduce((s, m) => s + m.valor, 0);

  // Agregados apenas de 2026 (saldos do histórico mais antigo no Excel são pouco fiáveis)
  const filtered2026 = filtered.filter(m => (m.data || "").startsWith("2026-"));
  const entradas2026 = filtered2026.filter(m => m.valor > 0).reduce((s, m) => s + m.valor, 0);
  const saidas2026 = filtered2026.filter(m => m.valor < 0).reduce((s, m) => s + m.valor, 0);

  // Total de movimentos: Supabase é fonte de verdade quando há contagens; senão snapshot
  const totalMovsGlobal = useMemo(() => {
    const supaTotal = Object.values(movCounts).reduce((s, n) => s + (n || 0), 0);
    if (supaTotal > 0) return supaTotal;
    return Object.values(caixaUnico).reduce((s, arr) =>
      s + arr.reduce((s2, c) => s2 + (c.movimentos?.length || 0), 0), 0);
  }, [movCounts, caixaUnico]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "'DM Sans', sans-serif" }}>

      {/* Soma selecionados + comparação histórica */}
      {somaChecked !== null && (
        <CaixaDinamicoBar
          checkedEmps={checkedEmps}
          empresasEnriquecidas={empresasEnriquecidas}
          somaChecked={somaChecked}
          somaHistorica={somaHistorica}
          loadingHist={loadingHist}
          saldosHist={saldosHist}
          compareDate={compareDate}
          setCompareDate={setCompareDate}
          diffAbs={diffAbs}
          diffPct={diffPct}
          onClear={() => setCheckedEmps([])}
        />
      )}

      {/* Header */}
      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", fontFamily: "Georgia,serif" }}>Extratos — Caixa Único</div>
          <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>Últimos 12 meses · Contas ativas (à esquerda de "Não Usuais")</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setShowApresentacao(true)}
            title="Gerar apresentação PPTX com variação de caixa e movimentos"
            style={{ background: "#1a1a2e", border: "none", color: "#6B7C93", padding: "8px 14px", borderRadius: 7, fontSize: 11, cursor: "pointer", fontWeight: 700, letterSpacing: 0.3 }}>
            📊 Gerar Apresentação
          </button>
          <button onClick={() => { reloadSaldos?.(); reload?.(); }}
            title="Atualizar saldos e movimentos"
            style={{ background: "#f0f4ff", border: "none", color: "#4a6fa5", padding: "6px 12px", borderRadius: 7, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
            🔄 Atualizar
          </button>
          <div style={{ fontSize: 12, color: "#6B7C93", fontFamily: "monospace", fontWeight: 700 }}>
            {totalMovsGlobal > 0 ? fmtInt(totalMovsGlobal) + " movimentos" : "A carregar..."}
          </div>
        </div>
      </div>

      {/* Modal Gerar Apresentação */}
      {showApresentacao && (
        <GerarApresentacaoModal
          empresasEnriquecidas={empresasEnriquecidas}
          onClose={() => setShowApresentacao(false)}
        />
      )}

      {/* Empresa grid — separado por grupo (LPX / HDG) */}
      {agruparPorGrupo(empresasEnriquecidas).map(bloco => (
      <div key={bloco.grupo} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ background: bloco.info.cor, color: "#fff", fontSize: 11, fontWeight: 800, padding: "3px 12px", borderRadius: 6, fontFamily: "monospace", letterSpacing: "0.08em" }}>
            {bloco.info.nome}
          </span>
          <span style={{ fontSize: 11, color: "#bbb", fontFamily: "monospace" }}>
            {bloco.empresas.length} {bloco.empresas.length === 1 ? "empresa" : "empresas"}
            {"  ·  "}
            {fmtN(bloco.empresas.reduce((s, e) => s + e.contas.reduce((t, c) => t + c.saldo, 0), 0))}
          </span>
          <div style={{ flex: 1, height: 1, background: "#eee" }} />
        </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
        {bloco.empresas.map(emp => {
          const total = emp.contas.reduce((s, c) => s + c.saldo, 0);
          const nMovs = emp.contas.reduce((s, c) => s + (c.movCount || 0), 0);
          const active = activeEmp && activeEmp.id === emp.id;
          const checked = checkedEmps.includes(emp.id);
          const isPositive = total >= 0;
          // Cor da borda em função do saldo
          const accentColor = isPositive ? "#16a34a" : "#dc2626";

          return (
            <div key={emp.id} style={{ position: "relative" }}>
              {/* Checkbox no canto */}
              <div
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); e.preventDefault(); toggleCheck(emp.id); }}
                style={{
                  position: "absolute", top: 10, right: 10, width: 18, height: 18,
                  border: `2px solid ${checked ? "#6B7C93" : "#d0d0d0"}`, borderRadius: 4,
                  background: checked ? "#1a1a2e" : "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", zIndex: 10, transition: "all 0.15s"
                }}
              >
                {checked && <span style={{ color: "#6B7C93", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
              </div>

              {/* Card body */}
              <div
                onClick={() => openEmp(emp)}
                style={{
                  background: active
                    ? "linear-gradient(135deg, #1a1a2e 0%, #2a2a4e 100%)"
                    : "#fff",
                  border: active ? "1px solid #1a1a2e" : "1px solid #ececec",
                  borderRadius: 14,
                  padding: "16px 18px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  boxShadow: active
                    ? "0 8px 24px rgba(26,26,46,0.18)"
                    : "0 1px 3px rgba(0,0,0,0.04)",
                  position: "relative",
                  overflow: "hidden",
                  minHeight: 120,
                }}
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.borderColor = accentColor + "55";
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.08)";
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.borderColor = "#ececec";
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
                  }
                }}
              >
                {/* Faixa colorida lateral */}
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
                  background: active ? "#6B7C93" : accentColor,
                  opacity: active ? 1 : 0.7,
                }} />

                <div style={{ paddingLeft: 4 }}>
                  {/* Nome empresa */}
                  <div style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: active ? "#6B7C93" : "#1a1a2e",
                    marginBottom: 2,
                    paddingRight: 24,
                    fontFamily: "Georgia, serif",
                    letterSpacing: -0.2,
                  }}>
                    {emp.nome}
                  </div>

                  {/* NIPC */}
                  <div style={{
                    fontSize: 9,
                    color: active ? "#888" : "#bbb",
                    fontFamily: "monospace",
                    marginBottom: 12,
                    letterSpacing: "0.05em",
                  }}>
                    NIPC {emp.nipc}
                  </div>

                  {/* Saldo grande */}
                  <div style={{
                    fontSize: 18,
                    fontWeight: 800,
                    fontFamily: "monospace",
                    color: active ? "#fff" : accentColor,
                    marginBottom: 12,
                    letterSpacing: -0.5,
                  }}>
                    {fmtN(total)}
                  </div>

                  {/* Bancos + movimentos */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 6,
                    paddingTop: 8,
                    borderTop: `1px solid ${active ? "#ffffff15" : "#f5f5f5"}`,
                  }}>
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
                      {emp.contas.slice(0, 3).map(c => (
                        <span key={c.id} style={{
                          fontSize: 8,
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontFamily: "monospace",
                          background: active ? "#ffffff15" : "#f5f5f5",
                          color: active ? "#ddd" : "#888",
                          fontWeight: 600,
                          letterSpacing: "0.03em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}>
                          {c.banco}
                        </span>
                      ))}
                      {emp.contas.length > 3 && (
                        <span style={{
                          fontSize: 8,
                          padding: "2px 6px",
                          color: active ? "#888" : "#bbb",
                          fontFamily: "monospace",
                        }}>
                          +{emp.contas.length - 3}
                        </span>
                      )}
                    </div>
                    {nMovs > 0 && (
                      <span style={{
                        fontSize: 10,
                        color: active ? "#6B7C93" : "#16a34a",
                        fontFamily: "monospace",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}>
                        {fmtInt(nMovs)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </div>
      ))}

      {/* Contas */}
      {activeEmp && (
        <div style={{ background: "#fff", border: "2px solid #1a1a2e", borderRadius: 14, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e", fontFamily: "Georgia,serif" }}>{activeEmp.nome} — Seleciona a Conta</div>
            <button onClick={() => { setActiveEmp(null); setActiveConta(null); }} style={{ background: "none", border: "none", color: "#bbb", cursor: "pointer", fontSize: 18 }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {activeEmp.contas.map(conta => {
              const active = activeConta && activeConta.id === conta.id;
              const color = BANCO_COLORS[conta.banco] || "#888";
              const nM = conta.movCount || 0;
              return (
                <div key={conta.id} onClick={() => openConta(conta)}
                  style={{ background: active ? "#f0f4ff" : "#fafafa", border: "2px solid " + (active ? "#3b82f6" : "#f0f0f0"), borderRadius: 10, padding: "14px 16px", cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ background: color + "18", color: color, border: "1px solid " + color + "33", fontSize: 11, padding: "2px 10px", borderRadius: 4, fontFamily: "monospace", fontWeight: 600 }}>{conta.banco}</span>
                      {conta.sheet && <div style={{ fontSize: 9, color: "#ccc", fontFamily: "monospace", marginTop: 5 }}>Aba: {conta.sheet}</div>}
                      {conta.iban && <div style={{ fontSize: 10, color: "#bbb", fontFamily: "monospace", marginTop: 3 }}>{conta.iban}</div>}
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: conta.saldo < 0 ? "#dc2626" : "#1a1a2e", marginTop: 6 }}>{fmtN(conta.saldo)}</div>
                      <div style={{ fontSize: 10, marginTop: 4, fontFamily: "monospace", color: nM > 0 ? "#16a34a" : "#ccc" }}>
                        {nM > 0 ? "📋 " + nM + " movimentos" : "Sem movimentos"}
                      </div>
                    </div>
                    <span style={{ color: active ? "#3b82f6" : "#ccc", fontSize: 20 }}>›</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Movimentos */}
      {activeConta && (
        <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f0", background: "#f8f9fc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e" }}>Movimentos — {activeEmp.nome} · {activeConta.banco}</div>
              {activeConta.sheet && <div style={{ fontSize: 10, color: "#bbb", fontFamily: "monospace", marginTop: 2 }}>Aba origem: {activeConta.sheet}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={handleExportarExcel} disabled={exportando} title="Exportar para Excel o período selecionado"
                style={{ background: exportando ? "#e8e8e8" : "#16a34a", color: exportando ? "#999" : "#fff", border: "none", padding: "5px 12px", borderRadius: 7, fontSize: 11, cursor: exportando ? "default" : "pointer", fontWeight: 600 }}>
                {exportando ? "A gerar..." : "⬇ Exportar Excel"}
              </button>
              {currentUser?.role === "admin" && (
                <button onClick={() => setEditingMov({ data: new Date().toISOString().slice(0,10), movimento: "", valor: 0, saldo: 0, categoria: "", detalhes: "", _isNew: true, _contaId: activeConta.id, _empId: activeEmp.id })}
                  style={{ background: "#1a1a2e", color: "#6B7C93", border: "none", padding: "5px 12px", borderRadius: 7, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                  + Nova Linha
                </button>
              )}
              <button onClick={() => setActiveConta(null)} style={{ background: "none", border: "none", color: "#bbb", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
          </div>

          {allMovs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#ccc" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
              <div style={{ fontSize: 14 }}>Nenhum movimento nesta conta</div>
            </div>
          ) : (
            <div>
              {/* Filters */}
              <div style={{ display: "flex", gap: 10, padding: "12px 20px", borderBottom: "1px solid #f5f5f5", flexWrap: "wrap" }}>
                <input value={descFilter} onChange={e => { setDescFilter(e.target.value); setPage(1); }} placeholder="Filtrar descrição..."
                  style={{ flex: 2, minWidth: 160, background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "7px 12px", fontSize: 12, outline: "none" }} />
                <select value={catFilter || "Todas"} onChange={e => { setCatFilter(e.target.value); setPage(1); }}
                  style={{ flex: 1, minWidth: 140, background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "7px 12px", fontSize: 12, outline: "none" }}>
                  {cats.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              {/* Período — filtra a tabela e delimita a exportação para Excel */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 20px", borderBottom: "1px solid #f5f5f5", flexWrap: "wrap", background: "#fcfcfd" }}>
                <span style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.07em" }}>Período</span>
                <input type="date" value={dataDe} max={dataAte || undefined}
                  onChange={e => { setDataDe(e.target.value); setPage(1); }}
                  style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "6px 10px", fontSize: 12, outline: "none", fontFamily: "monospace" }} />
                <span style={{ color: "#ccc", fontSize: 12 }}>até</span>
                <input type="date" value={dataAte} min={dataDe || undefined}
                  onChange={e => { setDataAte(e.target.value); setPage(1); }}
                  style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "6px 10px", fontSize: 12, outline: "none", fontFamily: "monospace" }} />
                {[["mes", "Este mês"], ["mesAnterior", "Mês anterior"], ["ano", "Este ano"], ["tudo", "Tudo"]].map(([k, label]) => (
                  <button key={k} onClick={() => definirPeriodo(k)}
                    style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 7, padding: "5px 11px", fontSize: 11, color: "#666", cursor: "pointer" }}>
                    {label}
                  </button>
                ))}
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#888", fontFamily: "monospace" }}>
                  {filtered.length} mov. · {(dataDe || dataAte) ? "período filtrado" : "histórico completo"}
                </span>
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#fafafa" }}>
                      {["Data", "Descrição", "Valor", "Saldo", "Categoria", "Detalhes", ...(currentUser?.role==="admin"?[""]:[])].map(h => (
                        <th key={h} style={{ padding: "9px 16px", textAlign: "left", color: "#aaa", fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "monospace", borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slice.map((m, i) => {
                      const movKey = `${m.data||m.data_str}_${m.movimento}_${m.valor}_${m.saldo}`;
                      return (
                      <tr key={m.id || movKey} style={{ borderBottom: "1px solid #fafafa" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f8f9fc"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}>
                        <td style={{ padding: "10px 16px", color: "#888", fontFamily: "monospace", whiteSpace: "nowrap" }}>{m.data || m.data_str || ""}</td>
                        <td style={{ padding: "10px 16px", color: "#333", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.movimento}>{m.movimento || ""}</td>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 700, color: m.valor >= 0 ? "#16a34a" : "#dc2626", whiteSpace: "nowrap" }}>
                          {m.valor >= 0 ? "+" : ""}{fmtN(m.valor)}
                        </td>
                        <td style={{ padding: "10px 16px", color: "#666", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                          {m.saldo != null ? fmtN(m.saldo) : "—"}
                        </td>
                        <td style={{ padding: "6px 10px" }}>
                          <EditableCategoria
                            initialValue={m.categoria}
                            movId={m.id}
                            onSave={sbUpdate}
                          />
                        </td>
                        <td style={{ padding: "6px 10px", maxWidth: 180 }}>
                          <EditableDetalhes
                            initialValue={m.detalhes}
                            movId={m.id}
                            onSave={sbUpdate}
                          />
                        </td>
                        {currentUser?.role === "admin" && (
                          <td style={{ padding: "10px 16px" }}>
                            <div style={{ display: "flex", gap: 4 }}>
                              {m.valor < 0 && (
                                <button onClick={() => setMatchMov(m)}
                                  title="Procurar match em Contas a Pagar / Fluxo Futuro"
                                  style={{ background: "#fef3c7", border: "none", color: "#92400e", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", fontWeight: 700 }}>🔗</button>
                              )}
                              <button onClick={() => setEditingMov({...m, _movKey: movKey, _contaId: activeConta.id, _empId: activeEmp.id})}
                                style={{ background: "#f0f4ff", border: "none", color: "#4a6fa5", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>✎</button>
                              <button onClick={async () => {
                                if (!window.confirm("Tens a certeza que queres eliminar este movimento?")) return;
                                if (m.id) {
                                  await sbDelete(m.id);
                                  // Realtime will auto-reload, but force it anyway
                                  setTimeout(() => reload(), 500);
                                } else {
                                  const updated = JSON.parse(JSON.stringify(caixaUnico));
                                  const emp = updated[activeEmp.id];
                                  if (!emp) return;
                                  const cIdx = emp.findIndex(c => c.conta_id === activeConta.id || c.banco === activeConta.banco);
                                  if (cIdx >= 0) {
                                    emp[cIdx].movimentos = emp[cIdx].movimentos.filter(mv => {
                                      const k = `${mv.data||mv.data_str}_${mv.movimento}_${mv.valor}_${mv.saldo}`;
                                      return k !== movKey;
                                    });
                                    setCaixaUnico(updated);
                                    setActiveConta({...emp[cIdx]});
                                  }
                                }
                              }} style={{ background: "#fff0f0", border: "none", color: "#dc2626", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer" }} title="Eliminar">✕</button>
                            </div>
                          </td>
                        )}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Saldo auditado */}
              {activeConta && (() => {
                const movsFiltrados = filtered;
                const saldoCalculado = movsFiltrados.reduce((s,m)=>s+(m.valor||0), 0);
                const saldoImportado = activeConta.saldo || 0;
                const diff = Math.abs(saldoCalculado - saldoImportado);
                const ok = diff < 0.02;
                return (
                  <div style={{ margin: "0 20px 12px", padding: "12px 16px", borderRadius: 10, background: ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${ok?"#bbf7d0":"#fecaca"}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 12, color: ok?"#16a34a":"#dc2626", fontWeight: 600 }}>
                      {ok ? "✅ Saldo auditado — movimentos conferem com o saldo importado" : "⚠️ Divergência de saldo — movimentos não conferem com o saldo importado"}
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 11, fontFamily: "monospace" }}>
                      <span style={{ color: "#888" }}>Calculado: <strong style={{ color: "#1a1a2e" }}>{fmtN(saldoCalculado)}</strong></span>
                      <span style={{ color: "#888" }}>Importado: <strong style={{ color: "#1a1a2e" }}>{fmtN(saldoImportado)}</strong></span>
                      {!ok && <span style={{ color: "#dc2626", fontWeight: 700 }}>Diferença: {fmtN(diff)}</span>}
                    </div>
                  </div>
                );
              })()}
              {/* Pagination */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderTop: "1px solid #f5f5f5" }}>
                <span style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>{filtered.length} registos</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <select value={perPage} onChange={e => { setPerPage(+e.target.value); setPage(1); }}
                    style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 6, padding: "3px 8px", fontSize: 11 }}>
                    {[10, 15, 25, 50].map(n => <option key={n}>{n}</option>)}
                  </select>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    style={{ background: "none", border: "1px solid #eee", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: page === 1 ? "default" : "pointer", color: page === 1 ? "#ddd" : "#555" }}>‹</button>
                  <span style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }}>Pág. {page} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    style={{ background: "none", border: "1px solid #eee", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: page === totalPages ? "default" : "pointer", color: page === totalPages ? "#ddd" : "#555" }}>›</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Edit movement modal */}
      {/* Modal: sugestões de match para o movimento selecionado */}
      {matchMov && (() => {
        const movValor = Math.abs(parseFloat(matchMov.valor) || 0);
        const movData = matchMov.data || "";
        // Função para calcular score de match (valor exato = 100, valor próximo = menos; data próxima ajuda)
        const score = (target, valorRef, dataRef) => {
          if (!valorRef) return 0;
          const diffValor = Math.abs(valorRef - movValor);
          const diffData = dataRef && movData
            ? Math.abs((new Date(dataRef) - new Date(movData)) / 86400000)
            : 999;
          let s = 0;
          if (diffValor < 0.01) s += 100;
          else if (diffValor < 1) s += 80;
          else if (diffValor / movValor < 0.05) s += 50;
          else if (diffValor / movValor < 0.15) s += 20;
          else return 0;
          if (diffData <= 1) s += 30;
          else if (diffData <= 5) s += 20;
          else if (diffData <= 15) s += 10;
          else if (diffData <= 30) s += 5;
          else if (diffData > 60) s -= 10;
          return s;
        };

        const sugestoes = [];
        // Faturas pendentes/vencidas
        (faturas || []).forEach(f => {
          if (f.status === "Paga") return;
          const sc = score(f, parseFloat(f.valor), f.vencimento);
          if (sc > 0) sugestoes.push({ tipo: "fatura", ref: f, score: sc, desc: f.fornecedor || f.fatura, valor: f.valor, data: f.vencimento, empresa: f.empresa, categoria: f.categoria });
        });
        // Pagamentos extras pendentes (só saídas)
        (pagamentosExtras || []).forEach(p => {
          if (p.status === "Paga" || p.status === "Pago") return;
          if (p.tipo === "entrada") return;
          const sc = score(p, parseFloat(p.valor), p.data_inicio);
          if (sc > 0) sugestoes.push({ tipo: "pagamento", ref: p, score: sc, desc: p.descricao, valor: p.valor, data: p.data_inicio, empresa: p.empresa, categoria: p.categoria });
        });

        sugestoes.sort((a, b) => b.score - a.score);
        const top = sugestoes.slice(0, 15);

        const aplicarMatch = async (sug) => {
          if (!window.confirm(`Marcar este ${sug.tipo === "fatura" ? "fatura" : "pagamento"} como Paga?\n\n${sug.desc}\nValor: ${fmtN(sug.valor)}`)) return;
          let res;
          if (sug.tipo === "fatura" && onUpdateFatura) {
            res = await onUpdateFatura(sug.ref.id, { status: "Paga" });
          } else if (sug.tipo === "pagamento" && onUpdatePagamento) {
            res = await onUpdatePagamento(sug.ref.id, { status: "Paga" });
          }
          if (res?.error) {
            alert("Erro: " + (res.error.message || res.error));
            return;
          }
          if (!res?.data || res.data.length === 0) {
            alert("Nada foi alterado (provavelmente RLS).");
            return;
          }
          setMatchMov(null);
        };

        return (
          <div onClick={e => { if (e.target === e.currentTarget) setMatchMov(null); }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: 24, width: 800, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <h2 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 18, color: "#1a1a2e" }}>🔗 Procurar match</h2>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                    Movimento: <strong>{matchMov.movimento}</strong> · <span style={{ color: "#dc2626", fontFamily: "monospace" }}>{fmtN(matchMov.valor)}</span> · {matchMov.data}
                  </div>
                </div>
                <button onClick={() => setMatchMov(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#aaa" }}>✕</button>
              </div>
              {top.length === 0 ? (
                <div style={{ padding: 30, textAlign: "center", color: "#888" }}>
                  Nenhuma fatura nem pagamento pendente com valor próximo a {fmtN(matchMov.valor)}.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead style={{ background: "#fafafa" }}>
                    <tr>
                      <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, color: "#666", textTransform: "uppercase", fontFamily: "monospace" }}>Score</th>
                      <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, color: "#666", textTransform: "uppercase", fontFamily: "monospace" }}>Tipo</th>
                      <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, color: "#666", textTransform: "uppercase", fontFamily: "monospace" }}>Data</th>
                      <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, color: "#666", textTransform: "uppercase", fontFamily: "monospace" }}>Descrição</th>
                      <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, color: "#666", textTransform: "uppercase", fontFamily: "monospace" }}>Empresa</th>
                      <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 10, color: "#666", textTransform: "uppercase", fontFamily: "monospace" }}>Valor</th>
                      <th style={{ padding: "8px 10px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((sug, i) => {
                      const corBarra = sug.score >= 100 ? "#16a34a" : sug.score >= 80 ? "#84cc16" : sug.score >= 50 ? "#f59e0b" : "#dc2626";
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #f5f5f5" }}>
                          <td style={{ padding: "8px 10px", fontFamily: "monospace", fontWeight: 700, color: corBarra }}>{sug.score}</td>
                          <td style={{ padding: "8px 10px", fontSize: 10, color: "#888", fontFamily: "monospace" }}>{sug.tipo === "fatura" ? "Fatura" : "Pagamento"}</td>
                          <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 10 }}>{sug.data || "—"}</td>
                          <td style={{ padding: "8px 10px", fontSize: 11 }}>{(sug.desc || "—").substring(0, 60)}</td>
                          <td style={{ padding: "8px 10px", fontSize: 10, color: "#666" }}>{sug.empresa || "—"}</td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", color: "#dc2626", fontWeight: 600 }}>{fmtN(sug.valor)}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <button onClick={() => aplicarMatch(sug)}
                              style={{ background: "#16a34a", color: "#fff", border: "none", padding: "5px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
                              ✓ Match
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: 14, padding: "10px 14px", background: "#fef3c7", borderRadius: 8, fontSize: 11, color: "#92400e" }}>
                💡 Score: 100 = valor exato + data muito próxima. ≥ 80 = muito provável. ≥ 50 = possível. Confere antes de aplicar.
              </div>
            </div>
          </div>
        );
      })()}

      {editingMov && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setEditingMov(null); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: 480, maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e" }}>Editar Movimento</div>
              <button onClick={() => setEditingMov(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#aaa" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[["Data","data","date"],["Descrição","movimento","text"],["Valor","valor","number"],["Saldo","saldo","number"],["Categoria","categoria","text"],["Detalhes","detalhes","text"]].map(([label,field,type])=>(
                <div key={field} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase" }}>{label}</label>
                  <input type={type} value={editingMov[field]||""} onChange={e=>setEditingMov(m=>({...m,[field]:type==="number"?parseFloat(e.target.value)||0:e.target.value}))}
                    style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" }}/>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditingMov(null)} style={{ background: "#f0f0f0", color: "#666", border: "none", padding: "9px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={async () => {
                if (editingMov._isNew) {
                  const {_isNew,_movKey,_contaId,_empId,...mov} = editingMov;
                  // Calcular o próximo seq para esta conta — assim a nova linha aparece como a mais recente
                  // (a query lista por seq DESC NULLS LAST → seq alto = no topo).
                  let nextSeq = null;
                  try {
                    const { data: maxSeqRow } = await supabase
                      .from('movimentos').select('seq')
                      .eq('conta_id', _contaId).not('seq', 'is', null)
                      .order('seq', { ascending: false }).limit(1);
                    nextSeq = (maxSeqRow?.[0]?.seq || 0) + 1;
                  } catch(e) {
                    console.warn('Não consegui calcular nextSeq, vai inserir sem seq', e);
                  }
                  // ID UUID válido — a tabela `movimentos` tem id uuid NOT NULL
                  // Usa crypto.randomUUID() (disponível em browsers modernos)
                  const newId = (typeof crypto !== "undefined" && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                        const r = Math.random() * 16 | 0;
                        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                      }));
                  const row = {
                    id: newId,
                    conta_id: _contaId,
                    empresa_id: _empId,
                    banco: activeConta?.banco || '',
                    data: mov.data,
                    movimento: mov.movimento,
                    valor: mov.valor,
                    saldo: mov.saldo || 0,
                    categoria: mov.categoria || '',
                    detalhes: mov.detalhes || '',
                    ...(nextSeq != null ? { seq: nextSeq } : {}),
                  };
                  const { data: inserted, error: insErr } = await supabase
                    .from('movimentos').insert([row]).select();
                  if (insErr) {
                    alert("Erro ao adicionar linha:\n\n" + (insErr.message || insErr));
                    return;
                  }
                  if (!inserted || inserted.length === 0) {
                    alert("Linha não foi guardada (provavelmente falta política INSERT no RLS para 'movimentos').");
                    return;
                  }
                } else if (editingMov.id) {
                  const {_movKey,_contaId,_empId,...mov} = editingMov;
                  const res = await sbUpdate(editingMov.id, {
                    data: mov.data, movimento: mov.movimento, valor: mov.valor,
                    saldo: mov.saldo, categoria: mov.categoria, detalhes: mov.detalhes
                  });
                  if (res?.error) { alert("Erro a guardar: " + (res.error.message || res.error)); return; }
                } else {
                  const updated = JSON.parse(JSON.stringify(caixaUnico));
                  const emp = updated[editingMov._empId];
                  if (!emp) return;
                  const cIdx = emp.findIndex(c => c.conta_id === editingMov._contaId || c.banco === activeConta?.banco);
                  if (cIdx >= 0) {
                    const {_movKey,_contaId,_empId,...mov} = editingMov;
                    const mIdx = emp[cIdx].movimentos.findIndex(mv =>
                      `${mv.data}_${mv.movimento}_${mv.valor}_${mv.saldo}` === editingMov._movKey
                    );
                    if (mIdx >= 0) emp[cIdx].movimentos[mIdx] = mov;
                    setCaixaUnico(updated);
                  }
                }
                setEditingMov(null);
              }} style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
