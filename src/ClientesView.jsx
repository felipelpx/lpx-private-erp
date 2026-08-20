import { useState, useMemo } from "react";

const fmt = (v) => new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0) + " €";
const fmt2 = (v) => new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0) + " €";

const STATUS_MAP = {
  "Escriturada":    { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
  "CPCV Assinado":  { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe" },
  "CPCV":           { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe" },
  "Sinal Reduzido": { bg: "#fffbeb", text: "#d97706", border: "#fde68a" },
  "Disponível":     { bg: "#f8f9fc", text: "#888",    border: "#e0e0e0" },
  "Reservado":      { bg: "#fdf4ff", text: "#9333ea", border: "#e9d5ff" },
};

const PROJETOS = []; // preencher com os projetos comerciais quando existirem

const PROJ_COLORS = {};

export default function ClientesView({ vendas }) {
  const [projeto, setProjeto] = useState(PROJETOS[0] || "");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [filterTipo, setFilterTipo] = useState("Todos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const projData = useMemo(() => vendas.filter(v => v.projeto === projeto), [vendas, projeto]);

  const filtered = useMemo(() => projData.filter(v =>
    (filterStatus === "Todos" || v.situacao === filterStatus || v.status === filterStatus) &&
    (filterTipo === "Todos" || v.tipologia === filterTipo) &&
    (!search || v.cliente?.toLowerCase().includes(search.toLowerCase()) || v.fracao?.toLowerCase().includes(search.toLowerCase()))
  ), [projData, filterStatus, filterTipo, search]);

  const statuses = useMemo(() => ["Todos", ...new Set(projData.map(v => v.situacao).filter(Boolean))], [projData]);
  const tipos = useMemo(() => ["Todos", ...new Set(projData.map(v => v.tipologia).filter(Boolean))], [projData]);

  // KPIs
  const kpis = useMemo(() => ({
    total: projData.length,
    escrituradas: projData.filter(v => v.situacao === "Escriturada").length,
    cpcv: projData.filter(v => ["CPCV Assinado","CPCV","Sinal Reduzido"].includes(v.situacao)).length,
    vgv: projData.reduce((s, v) => s + (v.valor_venda || 0), 0),
    recebido: projData.reduce((s, v) => s + (v.recebemos || 0), 0),
    a_receber: projData.reduce((s, v) => s + (v.falta_receber || 0), 0),
    comissao_pendente: projData.reduce((s, v) => s + (v.comissao_pendente_sinal || 0) + (v.comissao_pendente_escritura || 0), 0),
    liquido: projData.reduce((s, v) => s + (v.liquido_empresa || 0), 0),
  }), [projData]);

  const StatusBadge = ({ status }) => {
    const s = STATUS_MAP[status] || STATUS_MAP["Disponível"];
    return <span style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, fontSize: 10, padding: "2px 9px", borderRadius: 20, fontFamily: "monospace", fontWeight: 600, whiteSpace: "nowrap" }}>{status}</span>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: "'DM Sans', sans-serif" }}>

      {/* Project tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        {PROJETOS.map(p => (
          <button key={p} onClick={() => { setProjeto(p); setFilterStatus("Todos"); setFilterTipo("Todos"); setSearch(""); setSelected(null); }}
            style={{ background: projeto === p ? PROJ_COLORS[p] : "#fff", color: projeto === p ? "#fff" : "#666", border: `2px solid ${projeto === p ? PROJ_COLORS[p] : "#eee"}`, padding: "9px 24px", borderRadius: 10, fontSize: 13, cursor: "pointer", fontWeight: projeto === p ? 700 : 400, transition: "all 0.15s" }}>
            {p}
          </button>
        ))}
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {[
          { label: "VGV Total",      value: fmt(kpis.vgv),             color: "#1a1a2e" },
          { label: "Recebido",       value: fmt(kpis.recebido),        color: "#16a34a" },
          { label: "A Receber",      value: fmt(kpis.a_receber),       color: "#d97706" },
          { label: "Comissão Pend.", value: fmt(kpis.comissao_pendente), color: "#dc2626" },
        ].map((k, i) => (
          <div key={i} style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: "14px 18px", borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5, fontFamily: "monospace" }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontFamily: "monospace" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Status summary bar */}
      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: "12px 20px", display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "#888" }}>
          <strong style={{ color: "#1a1a2e" }}>{kpis.total}</strong> unidades totais ·
          <strong style={{ color: "#16a34a" }}> {kpis.escrituradas}</strong> escrituradas ·
          <strong style={{ color: "#2563eb" }}> {kpis.cpcv}</strong> CPCV ·
          <strong style={{ color: "#888" }}> {kpis.total - kpis.escrituradas - kpis.cpcv}</strong> disponíveis
        </div>
        {/* Progress bar */}
        <div style={{ flex: 1, height: 8, background: "#f0f0f0", borderRadius: 4, overflow: "hidden", minWidth: 100 }}>
          <div style={{ width: `${(kpis.escrituradas / kpis.total) * 100}%`, height: "100%", background: "#16a34a", borderRadius: 4, display: "inline-block" }} />
          <div style={{ width: `${(kpis.cpcv / kpis.total) * 100}%`, height: "100%", background: "#3b82f6", display: "inline-block" }} />
        </div>
        <div style={{ fontSize: 12, color: "#16a34a", fontFamily: "monospace", fontWeight: 700 }}>
          {Math.round(((kpis.escrituradas + kpis.cpcv) / kpis.total) * 100)}% vendido
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar cliente ou fração..."
          style={{ flex: 2, minWidth: 160, background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: "8px 14px", fontSize: 13, outline: "none" }} />
        {statuses.map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{ background: filterStatus === s ? "#1a1a2e" : "#fff", color: filterStatus === s ? "#fff" : "#888", border: `1px solid ${filterStatus === s ? "#1a1a2e" : "#eee"}`, padding: "7px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer" }}>
            {s}
          </button>
        ))}
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
          style={{ background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none" }}>
          {tipos.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {/* Main table */}
      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8f9fc" }}>
                {["Piso","Fração","Tipo","Bloco","Andar","Estac.","Área (m²)","Cliente","Mediação","Prev. Escritura","Preço Tabela","Valor Venda","Recebido","A Receber","Comissão Total","Com. Pendente (S)","Data Pag. (S)","Com. Pendente (E)","Data Pag. (E)","Líquido Empresa","Situação"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#aaa", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "monospace", borderBottom: "2px solid #f0f0f0", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => {
                const comPend = (u.comissao_pendente_sinal || 0) + (u.comissao_pendente_escritura || 0);
                return (
                  <tr key={i}
                    onClick={() => setSelected(selected?.fracao === u.fracao && selected?.projeto === u.projeto ? null : u)}
                    style={{ borderBottom: "1px solid #fafafa", cursor: "pointer", background: selected?.fracao === u.fracao ? "#f0f4ff" : "" }}
                    onMouseEnter={e => { if (selected?.fracao !== u.fracao) e.currentTarget.style.background = "#f8f9fc"; }}
                    onMouseLeave={e => { if (selected?.fracao !== u.fracao) e.currentTarget.style.background = ""; }}>
                    <td style={{ padding: "9px 12px", color: "#888", whiteSpace: "nowrap" }}>{u.piso}</td>
                    <td style={{ padding: "9px 12px", fontWeight: 600, color: "#1a1a2e", whiteSpace: "nowrap" }}>{u.fracao}</td>
                    <td style={{ padding: "9px 12px" }}><span style={{ background: "#f0f4ff", color: "#4a6fa5", fontSize: 10, padding: "2px 7px", borderRadius: 4, fontFamily: "monospace" }}>{u.tipologia}</span></td>
                    <td style={{ padding: "9px 12px", color: "#888" }}>{u.bloco}</td>
                    <td style={{ padding: "9px 12px", color: "#888", whiteSpace: "nowrap" }}>{u.andar}</td>
                    <td style={{ padding: "9px 12px", color: "#aaa", fontSize: 11 }}>{u.estacionamento || "—"}</td>
                    <td style={{ padding: "9px 12px", color: "#888", fontFamily: "monospace" }}>{u.area_privativa?.toFixed(2)}</td>
                    <td style={{ padding: "9px 12px", color: "#333", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.cliente}>{u.cliente || "—"}</td>
                    <td style={{ padding: "9px 12px", color: "#888", fontSize: 11, whiteSpace: "nowrap" }}>{u.consultor || "—"}</td>
                    <td style={{ padding: "9px 12px", color: "#888", fontFamily: "monospace", whiteSpace: "nowrap" }}>{u.previsao_escritura || "—"}</td>
                    <td style={{ padding: "9px 12px", color: "#aaa", fontFamily: "monospace", whiteSpace: "nowrap" }}>{fmt(u.preco_tabela)}</td>
                    <td style={{ padding: "9px 12px", fontWeight: 700, color: "#1a1a2e", fontFamily: "monospace", whiteSpace: "nowrap" }}>{fmt(u.valor_venda)}</td>
                    <td style={{ padding: "9px 12px", color: "#16a34a", fontFamily: "monospace", whiteSpace: "nowrap" }}>{fmt(u.recebemos)}</td>
                    <td style={{ padding: "9px 12px", color: u.falta_receber > 0 ? "#d97706" : "#aaa", fontFamily: "monospace", fontWeight: u.falta_receber > 0 ? 700 : 400, whiteSpace: "nowrap" }}>{u.falta_receber > 0 ? fmt(u.falta_receber) : "—"}</td>
                    <td style={{ padding: "9px 12px", color: "#888", fontFamily: "monospace", whiteSpace: "nowrap" }}>{fmt(u.comissao_total)}</td>
                    <td style={{ padding: "9px 12px", color: u.comissao_pendente_sinal > 0 ? "#dc2626" : "#aaa", fontFamily: "monospace", whiteSpace: "nowrap" }}>{u.comissao_pendente_sinal > 0 ? fmt(u.comissao_pendente_sinal) : "—"}</td>
                    <td style={{ padding: "9px 12px", color: "#888", fontFamily: "monospace", whiteSpace: "nowrap", fontSize: 11 }}>{u.data_pagamento_sinal || "—"}</td>
                    <td style={{ padding: "9px 12px", color: u.comissao_pendente_escritura > 0 ? "#dc2626" : "#aaa", fontFamily: "monospace", whiteSpace: "nowrap" }}>{u.comissao_pendente_escritura > 0 ? fmt(u.comissao_pendente_escritura) : "—"}</td>
                    <td style={{ padding: "9px 12px", color: "#888", fontFamily: "monospace", whiteSpace: "nowrap", fontSize: 11 }}>{u.data_pagamento_escritura || "—"}</td>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontWeight: 700, color: "#1a1a2e", whiteSpace: "nowrap" }}>{fmt(u.liquido_empresa)}</td>
                    <td style={{ padding: "9px 12px" }}><StatusBadge status={u.situacao || u.status} /></td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr style={{ background: "#f0f4ff", borderTop: "2px solid #dde3f0" }}>
                <td colSpan={11} style={{ padding: "11px 12px", fontSize: 11, color: "#4a6fa5", fontFamily: "monospace", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>TOTAIS ({filtered.length} unidades)</td>
                <td style={{ padding: "11px 12px", fontFamily: "monospace", fontWeight: 700, color: "#1a1a2e", whiteSpace: "nowrap" }}>{fmt(filtered.reduce((s,v)=>s+(v.valor_venda||0),0))}</td>
                <td style={{ padding: "11px 12px", fontFamily: "monospace", fontWeight: 700, color: "#16a34a", whiteSpace: "nowrap" }}>{fmt(filtered.reduce((s,v)=>s+(v.recebemos||0),0))}</td>
                <td style={{ padding: "11px 12px", fontFamily: "monospace", fontWeight: 700, color: "#d97706", whiteSpace: "nowrap" }}>{fmt(filtered.reduce((s,v)=>s+(v.falta_receber||0),0))}</td>
                <td style={{ padding: "11px 12px", fontFamily: "monospace", fontWeight: 700, color: "#888", whiteSpace: "nowrap" }}>{fmt(filtered.reduce((s,v)=>s+(v.comissao_total||0),0))}</td>
                <td style={{ padding: "11px 12px", fontFamily: "monospace", fontWeight: 700, color: "#dc2626", whiteSpace: "nowrap" }}>{fmt(filtered.reduce((s,v)=>s+(v.comissao_pendente_sinal||0),0))}</td>
                <td />
                <td style={{ padding: "11px 12px", fontFamily: "monospace", fontWeight: 700, color: "#dc2626", whiteSpace: "nowrap" }}>{fmt(filtered.reduce((s,v)=>s+(v.comissao_pendente_escritura||0),0))}</td>
                <td />
                <td style={{ padding: "11px 12px", fontFamily: "monospace", fontWeight: 700, color: "#1a1a2e", whiteSpace: "nowrap" }}>{fmt(filtered.reduce((s,v)=>s+(v.liquido_empresa||0),0))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div style={{ background: "#fff", border: "2px solid #3b82f6", borderRadius: 14, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", fontFamily: "Georgia,serif" }}>
              {selected.fracao} · {selected.cliente}
            </div>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 18 }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            {[
              { label: "Valor de Venda", value: fmt(selected.valor_venda), color: "#1a1a2e" },
              { label: "Recebido", value: fmt(selected.recebemos), color: "#16a34a" },
              { label: "A Receber", value: fmt(selected.falta_receber), color: selected.falta_receber > 0 ? "#d97706" : "#aaa" },
              { label: "Líquido Empresa", value: fmt(selected.liquido_empresa), color: "#1a1a2e" },
              { label: "Comissão Total", value: fmt(selected.comissao_total), color: "#888" },
              { label: "Com. Pend. Sinal", value: fmt(selected.comissao_pendente_sinal), color: selected.comissao_pendente_sinal > 0 ? "#dc2626" : "#aaa" },
              { label: "Data Pag. Sinal", value: selected.data_pagamento_sinal || "—", color: "#888" },
              { label: "Com. Pend. Escritura", value: fmt(selected.comissao_pendente_escritura), color: selected.comissao_pendente_escritura > 0 ? "#dc2626" : "#aaa" },
              { label: "Data Pag. Escritura", value: selected.data_pagamento_escritura || "—", color: "#888" },
              { label: "Previsão Escritura", value: selected.previsao_escritura || "—", color: "#888" },
              { label: "Tipologia", value: selected.tipologia, color: "#4a6fa5" },
              { label: "Área Privativa", value: `${selected.area_privativa?.toFixed(2)} m²`, color: "#888" },
            ].map((k, i) => (
              <div key={i} style={{ background: "#f8f9fc", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", letterSpacing: "0.06em", marginBottom: 3 }}>{k.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: k.color, fontFamily: "monospace" }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
