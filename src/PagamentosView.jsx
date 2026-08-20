import { useState, useMemo, useEffect } from "react";
import { useMapasPagamento, useMapaItens, useVendas } from "./hooks.js";
import { supabase } from "./supabase.js";

const fmtFull = (v) => new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0) + " €";
const fmtDate = (s) => {
  if (!s || typeof s !== "string" || s.length < 10) return s || "—";
  const m = s.substring(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
};
const fmtDateTime = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const STATUS_INFO = {
  pendente_nivel_1: { label: "Pendente N1", color: "#f59e0b", bg: "#fef3c7" },
  pendente_nivel_2: { label: "Pendente N2", color: "#3b82f6", bg: "#dbeafe" },
  aprovado:         { label: "Aprovado",     color: "#16a34a", bg: "#dcfce7" },
  recusado:         { label: "Recusado",     color: "#dc2626", bg: "#fee2e2" },
};

export default function PagamentosView({ faturas, pagamentosExtras, currentUser, profiles = [] }) {
  const { mapas, loading: mapasLoading, addMapa, updateMapa, deleteMapa } = useMapasPagamento();
  const { vendas } = useVendas();
  const [view, setView] = useState("lista");  // 'lista' | 'novo' | 'detalhe'
  const [activeMapaId, setActiveMapaId] = useState(null);

  // permissões
  const canCreate = currentUser?.can_create_mapas || currentUser?.role === "admin";
  const isN1 = currentUser?.approval_level === 1;
  const isN2 = currentUser?.approval_level === 2;

  const profileById = useMemo(() => {
    const map = {};
    (profiles || []).forEach(p => { map[p.id] = p; });
    return map;
  }, [profiles]);
  const nomeUser = (id) => profileById[id]?.email || profileById[id]?.nome || id || "—";

  // KPIs
  const kpis = useMemo(() => {
    const m = mapas || [];
    return {
      total: m.length,
      pendN1: m.filter(x => x.status === "pendente_nivel_1").length,
      pendN2: m.filter(x => x.status === "pendente_nivel_2").length,
      aprovados: m.filter(x => x.status === "aprovado").length,
      recusados: m.filter(x => x.status === "recusado").length,
    };
  }, [mapas]);

  if (view === "novo") {
    return <NovoMapa
      faturas={faturas} pagamentosExtras={pagamentosExtras} vendas={vendas}
      currentUser={currentUser}
      onCancel={() => setView("lista")}
      onCreated={async (mapa, itens) => {
        const res = await addMapa(mapa, itens);
        if (res.error) {
          alert("Erro ao criar mapa:\n\n" + (res.error.message || res.error));
          return;
        }
        setView("lista");
      }}
    />;
  }

  if (view === "detalhe" && activeMapaId) {
    return <DetalheMapa
      mapaId={activeMapaId}
      mapas={mapas}
      currentUser={currentUser}
      profileById={profileById}
      faturas={faturas}
      pagamentosExtras={pagamentosExtras}
      onClose={() => { setActiveMapaId(null); setView("lista"); }}
      onUpdate={updateMapa}
      onDelete={async (id) => {
        if (!confirm("Eliminar este mapa? Esta ação é irreversível.")) return;
        const res = await deleteMapa(id);
        if (res.error) { alert("Erro: " + (res.error.message || res.error)); return; }
        setActiveMapaId(null); setView("lista");
      }}
    />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: "'DM Sans', sans-serif" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 22, color: "#1a1a2e" }}>Mapas de Pagamento</h2>
        {canCreate && (
          <button onClick={() => setView("novo")}
            style={{ background: "#16a34a", color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 700 }}>
            + Novo Mapa
          </button>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {[
          { label: "Total Mapas", value: kpis.total, color: "#1a1a2e" },
          { label: "Pendente N1", value: kpis.pendN1, color: "#f59e0b" },
          { label: "Pendente N2", value: kpis.pendN2, color: "#3b82f6" },
          { label: "Aprovados", value: kpis.aprovados, color: "#16a34a" },
          { label: "Recusados", value: kpis.recusados, color: "#dc2626" },
        ].map((k, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: k.color, fontFamily: "monospace" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabela de mapas */}
      <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #f0f0f0", fontWeight: 600, fontSize: 14, color: "#1a1a2e" }}>
          Lista de Mapas
        </div>
        {mapasLoading ? (
          <div style={{ padding: 32, textAlign: "center", color: "#888" }}>A carregar…</div>
        ) : (!mapas || mapas.length === 0) ? (
          <div style={{ padding: 32, textAlign: "center", color: "#888" }}>
            Ainda não há mapas de pagamento. {canCreate && "Clica em '+ Novo Mapa' para criar o primeiro."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#fafafa", textAlign: "left" }}>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 10, fontFamily: "monospace" }}>Nº</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 10, fontFamily: "monospace" }}>Descrição</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 10, fontFamily: "monospace" }}>Criado por</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 10, fontFamily: "monospace" }}>Data</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 10, fontFamily: "monospace", textAlign: "right" }}>Total</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 10, fontFamily: "monospace" }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {mapas.map(m => {
                const st = STATUS_INFO[m.status] || { label: m.status, color: "#888", bg: "#eee" };
                return (
                  <tr key={m.id}
                    onClick={() => { setActiveMapaId(m.id); setView("detalhe"); }}
                    style={{ borderBottom: "1px solid #f5f5f5", cursor: "pointer" }}
                    onMouseOver={e => e.currentTarget.style.background = "#fafafa"}
                    onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "10px 16px", fontFamily: "monospace", color: "#1a1a2e", fontWeight: 600 }}>{m.numero || m.id?.slice(0, 8)}</td>
                    <td style={{ padding: "10px 16px" }}>{m.descricao || "—"}</td>
                    <td style={{ padding: "10px 16px", color: "#666", fontSize: 11 }}>{nomeUser(m.created_by)}</td>
                    <td style={{ padding: "10px 16px", color: "#666", fontSize: 11 }}>{fmtDateTime(m.created_at)}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fmtFull(m.total_valor)}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ background: st.bg, color: st.color, padding: "3px 8px", borderRadius: 4, fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Info de permissões */}
      <div style={{ background: "#f0f4ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#3730a3" }}>
        <strong>O teu nível:</strong> {isN1 ? "Aprovador Nível 1" : isN2 ? "Aprovador Nível 2" : "Sem aprovação"}
        {canCreate && " · Podes criar mapas"}
      </div>
    </div>
  );
}

// ─── Componente: criar novo mapa ─────────────────────────────────────────────
function NovoMapa({ faturas, pagamentosExtras, vendas, currentUser, onCancel, onCreated }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [descricao, setDescricao] = useState(`Mapa de ${hoje.split("-").reverse().join("-")}`);
  const [selected, setSelected] = useState({});  // key -> true
  const [filtro, setFiltro] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroFornecedor, setFiltroFornecedor] = useState("");
  const [filtroVencDe, setFiltroVencDe] = useState("");
  const [filtroVencAte, setFiltroVencAte] = useState("");

  // Construir lista de candidatos: faturas pendentes + pagamentos manuais pendentes + comissões pendentes
  const candidatos = useMemo(() => {
    const out = [];

    // 1. Faturas (Contas a Pagar) que estão Pendente ou Vencida
    (faturas || []).forEach(f => {
      if (f.status === "Paga") return;
      out.push({
        key: `fatura:${f.id}`,
        tipo_origem: "fatura",
        origem_id: f.id,
        descricao: f.fatura || "(sem fatura)",
        fornecedor: f.fornecedor || "",
        empresa: f.empresa || "",
        categoria: f.categoria || "",
        valor: parseFloat(f.valor) || 0,
        vencimento: f.vencimento,
        _label: "Fatura",
      });
    });

    // 2. Pagamentos extras Pendentes
    (pagamentosExtras || []).forEach(p => {
      if (p.status === "Paga" || p.status === "Pago") return;
      if (p.tipo === "entrada") return;  // só saídas vão para mapa
      out.push({
        key: `pagamento_extra:${p.id}`,
        tipo_origem: "pagamento_extra",
        origem_id: p.id,
        descricao: p.descricao || "",
        fornecedor: "",
        empresa: p.empresa || "",
        categoria: p.categoria || "",
        valor: parseFloat(p.valor) || 0,
        vencimento: p.data_inicio,
        _label: "Pagamento",
      });
    });

    // 3. Comissões pendentes de vendas (sinal e escritura)
    (vendas || []).forEach(v => {
      if (v.comissao_pendente_sinal > 0 && v.data_pagamento_sinal) {
        out.push({
          key: `comissao_sinal:${v.id}`,
          tipo_origem: "comissao_sinal",
          origem_id: String(v.id),
          descricao: `Comissão sinal · ${v.fracao} (${v.cliente || "—"})`,
          fornecedor: v.imobiliaria || "",
          empresa: v.projeto || "",
          categoria: "Comissão",
          valor: parseFloat(v.comissao_pendente_sinal) || 0,
          vencimento: v.data_pagamento_sinal,
          _label: "Comissão Sinal",
        });
      }
      if (v.comissao_pendente_escritura > 0 && v.data_pagamento_escritura) {
        out.push({
          key: `comissao_escritura:${v.id}`,
          tipo_origem: "comissao_escritura",
          origem_id: String(v.id),
          descricao: `Comissão escritura · ${v.fracao} (${v.cliente || "—"})`,
          fornecedor: v.imobiliaria || "",
          empresa: v.projeto || "",
          categoria: "Comissão",
          valor: parseFloat(v.comissao_pendente_escritura) || 0,
          vencimento: v.data_pagamento_escritura,
          _label: "Comissão Escritura",
        });
      }
    });

    // Ordenar por data de vencimento (mais antigo primeiro)
    out.sort((a, b) => (a.vencimento || "9999").localeCompare(b.vencimento || "9999"));
    return out;
  }, [faturas, pagamentosExtras, vendas]);

  // Listas únicas para dropdowns
  const empresasUnicas = useMemo(() => {
    const set = new Set();
    candidatos.forEach(c => { if (c.empresa) set.add(c.empresa); });
    return [...set].sort();
  }, [candidatos]);

  const fornecedoresUnicos = useMemo(() => {
    const set = new Set();
    candidatos.forEach(c => { if (c.fornecedor) set.add(c.fornecedor); });
    return [...set].sort();
  }, [candidatos]);

  const candidatosFiltrados = useMemo(() => {
    return candidatos.filter(c => {
      // Texto
      if (filtro) {
        const f = filtro.toLowerCase();
        if (
          !(c.descricao || "").toLowerCase().includes(f) &&
          !(c.fornecedor || "").toLowerCase().includes(f) &&
          !(c.empresa || "").toLowerCase().includes(f) &&
          !(c.categoria || "").toLowerCase().includes(f)
        ) return false;
      }
      // Empresa
      if (filtroEmpresa && c.empresa !== filtroEmpresa) return false;
      // Fornecedor
      if (filtroFornecedor && c.fornecedor !== filtroFornecedor) return false;
      // Vencimento de/até
      if (filtroVencDe && (!c.vencimento || c.vencimento < filtroVencDe)) return false;
      if (filtroVencAte && (!c.vencimento || c.vencimento > filtroVencAte)) return false;
      return true;
    });
  }, [candidatos, filtro, filtroEmpresa, filtroFornecedor, filtroVencDe, filtroVencAte]);

  const totalSelecionado = useMemo(() => {
    return candidatos.filter(c => selected[c.key]).reduce((s, c) => s + c.valor, 0);
  }, [candidatos, selected]);

  const nSelecionados = Object.values(selected).filter(Boolean).length;

  const toggleAll = () => {
    if (nSelecionados === candidatosFiltrados.length) {
      setSelected({});
    } else {
      const all = {};
      candidatosFiltrados.forEach(c => all[c.key] = true);
      setSelected(all);
    }
  };

  const submit = async () => {
    if (nSelecionados === 0) { alert("Seleciona pelo menos uma linha"); return; }
    const itens = candidatos.filter(c => selected[c.key]).map(c => ({
      tipo_origem: c.tipo_origem,
      origem_id: c.origem_id,
      descricao: c.descricao,
      fornecedor: c.fornecedor,
      empresa: c.empresa,
      categoria: c.categoria,
      valor: c.valor,
      vencimento: c.vencimento || null,
    }));
    const mapa = {
      descricao,
      status: "pendente_nivel_1",
      total_valor: totalSelecionado,
      created_by: currentUser?.id || null,
      // numero: vai ser preenchido por um trigger ou inferido depois (deixa null por agora)
    };
    await onCreated(mapa, itens);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 22, color: "#1a1a2e" }}>Novo Mapa de Pagamento</h2>
        <button onClick={onCancel} style={{ background: "#f0f0f0", color: "#666", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>← Voltar</button>
      </div>

      {/* Header form */}
      <div style={{ background: "#fff", borderRadius: 10, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 5 }}>Descrição do mapa</div>
        <input value={descricao} onChange={e => setDescricao(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e5e5", borderRadius: 6, fontSize: 13, fontFamily: "inherit" }} />
      </div>

      {/* Tabela de candidatos */}
      <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a2e" }}>
            Itens disponíveis ({candidatosFiltrados.length}{candidatosFiltrados.length !== candidatos.length ? ` de ${candidatos.length}` : ""}) · <span style={{ color: "#16a34a" }}>{nSelecionados} selecionados</span>
          </div>
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Pesquisa livre…"
            style={{ padding: "6px 10px", border: "1px solid #e5e5e5", borderRadius: 6, fontSize: 12, fontFamily: "inherit", width: 200 }} />
        </div>
        {/* Filtros estruturados */}
        <div style={{ padding: "10px 18px", borderBottom: "1px solid #f0f0f0", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: "#fafafa" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#888", textTransform: "uppercase", fontFamily: "monospace" }}>Empresa:</span>
            <select value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}
              style={{ padding: "5px 8px", border: "1px solid #e5e5e5", borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: "#fff" }}>
              <option value="">Todas</option>
              {empresasUnicas.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#888", textTransform: "uppercase", fontFamily: "monospace" }}>Fornecedor:</span>
            <select value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)}
              style={{ padding: "5px 8px", border: "1px solid #e5e5e5", borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: "#fff", maxWidth: 200 }}>
              <option value="">Todos</option>
              {fornecedoresUnicos.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#888", textTransform: "uppercase", fontFamily: "monospace" }}>Vencimento de:</span>
            <input type="date" value={filtroVencDe} onChange={e => setFiltroVencDe(e.target.value)}
              style={{ padding: "4px 6px", border: "1px solid #e5e5e5", borderRadius: 6, fontSize: 11, fontFamily: "monospace" }} />
            <span style={{ fontSize: 10, color: "#888", textTransform: "uppercase", fontFamily: "monospace" }}>até:</span>
            <input type="date" value={filtroVencAte} onChange={e => setFiltroVencAte(e.target.value)}
              style={{ padding: "4px 6px", border: "1px solid #e5e5e5", borderRadius: 6, fontSize: 11, fontFamily: "monospace" }} />
          </div>
          {(filtro || filtroEmpresa || filtroFornecedor || filtroVencDe || filtroVencAte) && (
            <button onClick={() => { setFiltro(""); setFiltroEmpresa(""); setFiltroFornecedor(""); setFiltroVencDe(""); setFiltroVencAte(""); }}
              title="Limpar todos os filtros"
              style={{ background: "#fee2e2", color: "#dc2626", border: "none", padding: "4px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer", fontWeight: 600 }}>
              ✕ Limpar filtros
            </button>
          )}
        </div>
        <div style={{ maxHeight: 500, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead style={{ background: "#fafafa", position: "sticky", top: 0 }}>
              <tr>
                <th style={{ padding: "8px 12px", textAlign: "center", width: 30 }}>
                  <input type="checkbox" checked={candidatosFiltrados.length > 0 && nSelecionados === candidatosFiltrados.length} onChange={toggleAll} />
                </th>
                <th style={{ padding: "8px 12px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 9, fontFamily: "monospace", textAlign: "left" }}>Tipo</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 9, fontFamily: "monospace", textAlign: "left" }}>Vencimento</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 9, fontFamily: "monospace", textAlign: "left" }}>Descrição</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 9, fontFamily: "monospace", textAlign: "left" }}>Empresa</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 9, fontFamily: "monospace", textAlign: "left" }}>Categoria</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 9, fontFamily: "monospace", textAlign: "right" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {candidatosFiltrados.map(c => {
                const isSel = !!selected[c.key];
                return (
                  <tr key={c.key}
                    onClick={() => setSelected(s => ({ ...s, [c.key]: !s[c.key] }))}
                    style={{ borderBottom: "1px solid #f5f5f5", cursor: "pointer", background: isSel ? "#f0fdf4" : "transparent" }}>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <input type="checkbox" checked={isSel} readOnly />
                    </td>
                    <td style={{ padding: "8px 12px", color: "#888", fontSize: 10, fontFamily: "monospace" }}>{c._label}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 10 }}>{fmtDate(c.vencimento)}</td>
                    <td style={{ padding: "8px 12px" }}>{c.fornecedor && <span style={{ color: "#888", marginRight: 6 }}>{c.fornecedor} ·</span>}{c.descricao || "—"}</td>
                    <td style={{ padding: "8px 12px", color: "#666", fontSize: 10 }}>{c.empresa || "—"}</td>
                    <td style={{ padding: "8px 12px", color: "#666" }}><span style={{ background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 3, fontSize: 9, fontFamily: "monospace" }}>{c.categoria || "—"}</span></td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#dc2626" }}>{fmtFull(c.valor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer com total e botão */}
      <div style={{ background: "#1a1a2e", color: "#fff", borderRadius: 10, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ color: "#aaa", fontSize: 11, fontFamily: "monospace", textTransform: "uppercase", marginRight: 10 }}>Total selecionado</span>
          <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "#6B7C93" }}>{fmtFull(totalSelecionado)}</span>
          <span style={{ color: "#aaa", marginLeft: 12, fontSize: 11 }}>({nSelecionados} itens)</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ background: "#3a3a4e", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={submit}
            disabled={nSelecionados === 0}
            style={{ background: nSelecionados === 0 ? "#555" : "#16a34a", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 8, cursor: nSelecionados === 0 ? "default" : "pointer", fontSize: 13, fontWeight: 700 }}>
            Criar mapa e enviar para aprovação N1 →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente: detalhe de um mapa ──────────────────────────────────────────
function DetalheMapa({ mapaId, mapas, currentUser, profileById, faturas = [], pagamentosExtras = [], onClose, onUpdate, onDelete }) {
  const mapa = (mapas || []).find(m => m.id === mapaId);
  const { itens, loading: itensLoading } = useMapaItens(mapaId);
  const [previewItem, setPreviewItem] = useState(null);  // {item, fatura|pagamento}
  // Selecção de itens para aprovação parcial — por defeito TODOS selecionados
  const [selectedItens, setSelectedItens] = useState(null);   // Set<itemId> — null = ainda não inicializado
  // Inicializar quando itens carregarem
  useEffect(() => {
    if (itens.length > 0 && selectedItens === null) {
      setSelectedItens(new Set(itens.map(i => i.id)));
    }
  }, [itens, selectedItens]);
  const toggleItemSel = (id) => {
    setSelectedItens(prev => {
      const s = new Set(prev || []);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };
  const numSelecionados = selectedItens ? selectedItens.size : 0;
  const totalSelecionado = selectedItens
    ? itens.filter(i => selectedItens.has(i.id)).reduce((s, i) => s + (parseFloat(i.valor) || 0), 0)
    : 0;
  const todosSelecionados = selectedItens && itens.length > 0 && itens.every(i => selectedItens.has(i.id));

  const nomeUser = (id) => profileById[id]?.email || profileById[id]?.nome || id || "—";

  // Índices para lookup O(1) por id (origem_id vem do item)
  const faturasById = useMemo(() => {
    const m = {};
    (faturas || []).forEach(f => { if (f?.id) m[String(f.id)] = f; });
    return m;
  }, [faturas]);
  const pagamentosById = useMemo(() => {
    const m = {};
    (pagamentosExtras || []).forEach(p => { if (p?.id) m[String(p.id)] = p; });
    return m;
  }, [pagamentosExtras]);

  const abrirPreview = (item) => {
    const idKey = String(item.origem_id || "");
    const src = item.tipo_origem === "fatura" ? faturasById[idKey]
              : item.tipo_origem === "pagamento_extra" ? pagamentosById[idKey]
              : null;
    setPreviewItem({ item, src });
  };

  if (!mapa) {
    return (
      <div style={{ padding: 30 }}>
        <button onClick={onClose}>← Voltar</button>
        <p>Mapa não encontrado.</p>
      </div>
    );
  }

  const st = STATUS_INFO[mapa.status] || { label: mapa.status, color: "#888", bg: "#eee" };
  const isN1 = currentUser?.approval_level === 1;
  const isN2 = currentUser?.approval_level === 2;
  const podeAprovarN1 = isN1 && mapa.status === "pendente_nivel_1";
  const podeAprovarN2 = isN2 && mapa.status === "pendente_nivel_2";
  const podeRecusar = (podeAprovarN1 || podeAprovarN2);
  const podeEliminar = mapa.status === "pendente_nivel_1" && (currentUser?.id === mapa.created_by || currentUser?.role === "admin");

  const aprovar = async (nivel) => {
    if (!currentUser?.id) {
      alert("Sem utilizador autenticado.");
      return;
    }
    console.log(`[aprovar] N${nivel}`, { mapaId, currentUser: { id: currentUser.id, email: currentUser.email, level: currentUser.approval_level } });
    const updates = {};
    if (nivel === 1) {
      updates.status = "pendente_nivel_2";
      updates.aprovado_n1_por = currentUser.id;
      updates.aprovado_n1_em = new Date().toISOString();
    } else {
      updates.status = "aprovado";
      updates.aprovado_n2_por = currentUser.id;
      updates.aprovado_n2_em = new Date().toISOString();
    }
    console.log(`[aprovar] updates:`, updates);
    const res = await onUpdate(mapaId, updates);
    console.log(`[aprovar] resultado:`, res);
    if (res?.error) {
      alert("Erro ao aprovar:\n\n" + (res.error.message || JSON.stringify(res.error)));
      return;
    }
    if (!res?.data || res.data.length === 0) {
      alert("Nada foi alterado.\n\nProvavelmente falta política UPDATE no RLS para 'mapas_pagamento', ou o currentUser.id não existe na tabela 'profiles' (chave estrangeira).\n\nUser id: " + currentUser.id);
      return;
    }
    // Se chegou aqui, sucesso — mas garantimos o feedback visual com um pequeno hint
    console.log(`[aprovar] N${nivel} → sucesso`);
  };

  // Aprovação PARCIAL: remove os itens não selecionados do mapa (voltam a estar disponíveis para incluir noutro mapa),
  // ajusta total_valor e depois aprova o mapa no nível correspondente.
  const aprovarSelecionados = async (nivel) => {
    if (!currentUser?.id) { alert("Sem utilizador autenticado."); return; }
    if (!selectedItens || selectedItens.size === 0) { alert("Selecciona pelo menos um item."); return; }
    if (selectedItens.size === itens.length) {
      // Todos selecionados → equivalente a "Aprovar Todos"
      return aprovar(nivel);
    }
    const removidos = itens.filter(i => !selectedItens.has(i.id));
    const mantidos  = itens.filter(i => selectedItens.has(i.id));
    const novoTotal = mantidos.reduce((s, i) => s + (parseFloat(i.valor) || 0), 0);
    const msg = `Vais aprovar ${mantidos.length} de ${itens.length} itens (${fmtFull(novoTotal)}).\n\n` +
                `Os ${removidos.length} não selecionados vão ser REMOVIDOS deste mapa e ficam disponíveis para incluir noutro mapa.\n\n` +
                `Confirmas?`;
    if (!confirm(msg)) return;

    // 1. Remove os não selecionados
    const idsRemover = removidos.map(i => i.id);
    const { error: eDel } = await supabase.from("mapas_pagamento_itens").delete().in("id", idsRemover);
    if (eDel) { alert("Erro ao remover itens:\n\n" + eDel.message); return; }

    // 2. Atualiza total_valor + aprova o nível
    const updates = { total_valor: novoTotal };
    if (nivel === 1) {
      updates.status = "pendente_nivel_2";
      updates.aprovado_n1_por = currentUser.id;
      updates.aprovado_n1_em = new Date().toISOString();
    } else {
      updates.status = "aprovado";
      updates.aprovado_n2_por = currentUser.id;
      updates.aprovado_n2_em = new Date().toISOString();
    }
    const res = await onUpdate(mapaId, updates);
    if (res?.error) { alert("Erro ao aprovar:\n\n" + (res.error.message || JSON.stringify(res.error))); return; }
    if (!res?.data || res.data.length === 0) {
      alert("Nada foi alterado (provavelmente RLS).");
      return;
    }
    console.log(`[aprovar parcial] N${nivel} → sucesso — ${mantidos.length} aprovados, ${removidos.length} removidos`);
  };

  const recusar = async () => {
    const motivo = prompt("Motivo da recusa (visível ao criador):");
    if (motivo === null) return;
    const updates = {
      status: "recusado",
      recusado_por: currentUser.id,
      recusado_em: new Date().toISOString(),
      motivo_recusa: motivo,
    };
    const res = await onUpdate(mapaId, updates);
    if (res?.error) {
      alert("Erro ao recusar:\n\n" + (res.error.message || JSON.stringify(res.error)));
      return;
    }
    if (!res?.data || res.data.length === 0) {
      alert("Nada foi alterado (provavelmente RLS).");
    }
  };

  // ─── Export PDF (abre janela de impressão com layout formal) ─────────
  const exportPDF = () => {
    // Agrupar itens por empresa
    const byEmpresa = {};
    itens.forEach(it => {
      const emp = it.empresa || "(sem empresa)";
      if (!byEmpresa[emp]) byEmpresa[emp] = { items: [], total: 0 };
      byEmpresa[emp].items.push(it);
      byEmpresa[emp].total += parseFloat(it.valor) || 0;
    });
    const empresas = Object.keys(byEmpresa).sort();
    const numeroAmigavel = mapa.numero || `MP-${(mapa.id || "").slice(0, 8).toUpperCase()}`;

    // Carimbo conforme estado
    let carimbo = "";
    if (mapa.status === "aprovado") {
      carimbo = `
        <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-15deg);border:8px solid #16a34a;color:#16a34a;padding:30px 60px;font-size:62px;font-weight:900;font-family:Georgia,serif;letter-spacing:6px;opacity:0.18;pointer-events:none;z-index:1;border-radius:14px;">
          APROVADO
        </div>`;
    } else if (mapa.status === "recusado") {
      carimbo = `
        <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-15deg);border:8px solid #dc2626;color:#dc2626;padding:30px 60px;font-size:62px;font-weight:900;font-family:Georgia,serif;letter-spacing:6px;opacity:0.18;pointer-events:none;z-index:1;border-radius:14px;">
          RECUSADO
        </div>`;
    } else if (mapa.status === "pendente_nivel_1" || mapa.status === "pendente_nivel_2") {
      carimbo = `
        <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-15deg);border:8px solid #f59e0b;color:#f59e0b;padding:24px 50px;font-size:44px;font-weight:900;font-family:Georgia,serif;letter-spacing:4px;opacity:0.16;pointer-events:none;z-index:1;border-radius:14px;">
          PENDENTE
        </div>`;
    }

    let tabelaEmpresas = "";
    empresas.forEach(emp => {
      const grupo = byEmpresa[emp];
      tabelaEmpresas += `
        <thead>
          <tr style="background:#f0f4ff;border-top:2px solid #c7d2fe;">
            <th colspan="4" style="padding:10px 14px;text-align:left;color:#3730a3;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">
              ${emp} (${grupo.items.length} ${grupo.items.length === 1 ? 'item' : 'itens'})
            </th>
            <th style="padding:10px 14px;text-align:right;color:#3730a3;font-size:13px;font-weight:700;font-family:monospace;">
              ${fmtFull(grupo.total)}
            </th>
          </tr>
        </thead>
        <tbody>
      `;
      grupo.items.forEach(it => {
        tabelaEmpresas += `
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:7px 14px 7px 28px;color:#888;font-size:10px;font-family:monospace;">${it.tipo_origem}</td>
            <td style="padding:7px 14px;font-family:monospace;font-size:11px;">${fmtDate(it.vencimento)}</td>
            <td style="padding:7px 14px;font-size:11px;">${(it.fornecedor ? `<span style="color:#888">${it.fornecedor} · </span>` : "")}${(it.descricao || "").replace(/</g, "&lt;")}</td>
            <td style="padding:7px 14px;font-size:10px;color:#92400e;">${it.categoria || "—"}</td>
            <td style="padding:7px 14px;text-align:right;font-family:monospace;font-weight:600;font-size:11px;color:#dc2626;">${fmtFull(it.valor)}</td>
          </tr>
        `;
      });
      tabelaEmpresas += "</tbody>";
    });

    const aprovacoesHtml = `
      <div style="margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div style="border:1px solid #e5e5e5;border-radius:8px;padding:14px;${mapa.aprovado_n1_em ? 'background:#f0fdf4;border-color:#bbf7d0;' : ''}">
          <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;font-family:monospace;margin-bottom:6px;">Aprovação Nível 1</div>
          ${mapa.aprovado_n1_em ? `
            <div style="color:#16a34a;font-weight:700;font-size:14px;">✓ ${nomeUser(mapa.aprovado_n1_por)}</div>
            <div style="color:#666;font-size:11px;">${fmtDateTime(mapa.aprovado_n1_em)}</div>
          ` : `<div style="color:#aaa;font-size:11px;font-style:italic;">a aguardar</div>`}
        </div>
        <div style="border:1px solid #e5e5e5;border-radius:8px;padding:14px;${mapa.aprovado_n2_em ? 'background:#f0fdf4;border-color:#bbf7d0;' : ''}">
          <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;font-family:monospace;margin-bottom:6px;">Aprovação Nível 2 (Final)</div>
          ${mapa.aprovado_n2_em ? `
            <div style="color:#16a34a;font-weight:700;font-size:14px;">✓ ${nomeUser(mapa.aprovado_n2_por)}</div>
            <div style="color:#666;font-size:11px;">${fmtDateTime(mapa.aprovado_n2_em)}</div>
          ` : `<div style="color:#aaa;font-size:11px;font-style:italic;">a aguardar</div>`}
        </div>
      </div>
      ${mapa.status === "recusado" ? `
        <div style="margin-top:16px;border:1px solid #fecaca;background:#fef2f2;border-radius:8px;padding:14px;">
          <div style="font-size:10px;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;font-family:monospace;margin-bottom:6px;">Recusado</div>
          <div style="color:#dc2626;font-weight:700;font-size:14px;">✕ ${nomeUser(mapa.recusado_por)}</div>
          <div style="color:#666;font-size:11px;">${fmtDateTime(mapa.recusado_em)}</div>
          ${mapa.motivo_recusa ? `<div style="color:#7f1d1d;font-size:12px;margin-top:8px;font-style:italic;">"${mapa.motivo_recusa.replace(/</g, "&lt;")}"</div>` : ""}
        </div>
      ` : ""}
    `;

    const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>${numeroAmigavel} — Mapa de Pagamento</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Helvetica', Arial, sans-serif; color: #1a1a2e; margin: 0; padding: 0; }
    .header { border-bottom: 3px solid #1a1a2e; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .brand { font-family: Georgia, serif; font-size: 26px; font-weight: 700; color: #1a1a2e; letter-spacing: -0.5px; }
    .brand span { color: #6B7C93; }
    .subtitle { font-size: 11px; color: #888; margin-top: 4px; letter-spacing: 2px; text-transform: uppercase; }
    .doc-id { text-align: right; font-family: monospace; }
    .doc-id .num { font-size: 18px; font-weight: 700; color: #1a1a2e; }
    .doc-id .label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
    h1 { font-family: Georgia, serif; font-size: 22px; margin: 0 0 18px 0; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; background: #fafafa; padding: 14px; border-radius: 8px; margin-bottom: 20px; }
    .info-grid .label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; font-family: monospace; margin-bottom: 4px; }
    .info-grid .value { font-size: 13px; color: #1a1a2e; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    .footer { margin-top: 40px; border-top: 1px solid #e5e5e5; padding-top: 14px; font-size: 9px; color: #888; display: flex; justify-content: space-between; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  ${carimbo}

  <div class="header">
    <div>
      <div class="brand">LPX<span> PRIVATE</span></div>
      <div class="subtitle">Mapa de Pagamento</div>
    </div>
    <div class="doc-id">
      <div class="label">Nº</div>
      <div class="num">${numeroAmigavel}</div>
      <div style="font-size:10px;color:#888;margin-top:4px;">${fmtDateTime(mapa.created_at)}</div>
    </div>
  </div>

  <h1>${(mapa.descricao || "Mapa de Pagamento").replace(/</g, "&lt;")}</h1>

  <div class="info-grid">
    <div>
      <div class="label">Criado por</div>
      <div class="value">${nomeUser(mapa.created_by)}</div>
    </div>
    <div>
      <div class="label">Estado</div>
      <div class="value">${(STATUS_INFO[mapa.status]?.label) || mapa.status}</div>
    </div>
    <div>
      <div class="label">Total a Pagar</div>
      <div class="value" style="font-size:18px;color:#6B7C93;font-family:monospace;">${fmtFull(mapa.total_valor)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr style="background:#1a1a2e;color:#fff;">
        <th style="padding:9px 14px;text-align:left;font-size:10px;text-transform:uppercase;font-family:monospace;letter-spacing:0.5px;">Tipo</th>
        <th style="padding:9px 14px;text-align:left;font-size:10px;text-transform:uppercase;font-family:monospace;letter-spacing:0.5px;">Vencimento</th>
        <th style="padding:9px 14px;text-align:left;font-size:10px;text-transform:uppercase;font-family:monospace;letter-spacing:0.5px;">Descrição</th>
        <th style="padding:9px 14px;text-align:left;font-size:10px;text-transform:uppercase;font-family:monospace;letter-spacing:0.5px;">Categoria</th>
        <th style="padding:9px 14px;text-align:right;font-size:10px;text-transform:uppercase;font-family:monospace;letter-spacing:0.5px;">Valor</th>
      </tr>
    </thead>
    ${tabelaEmpresas}
    <tfoot>
      <tr style="background:#1a1a2e;color:#fff;">
        <td colspan="4" style="padding:13px 14px;text-align:right;color:#aaa;font-size:11px;text-transform:uppercase;font-family:monospace;letter-spacing:0.8px;">Total Geral</td>
        <td style="padding:13px 14px;text-align:right;color:#6B7C93;font-size:18px;font-weight:700;font-family:monospace;">${fmtFull(mapa.total_valor)}</td>
      </tr>
    </tfoot>
  </table>

  ${aprovacoesHtml}

  <div class="footer">
    <div>Documento gerado em ${new Date().toLocaleString("pt-PT")}</div>
    <div>LPX Private · Mapa ${numeroAmigavel}</div>
  </div>

  <script>
    window.onload = () => { setTimeout(() => window.print(), 400); };
  </script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) { alert("O browser bloqueou a janela. Permite popups e tenta novamente."); return; }
    win.document.write(html);
    win.document.close();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 22, color: "#1a1a2e" }}>
          Mapa {mapa.numero || mapa.id?.slice(0, 8)}
        </h2>
        <button onClick={onClose} style={{ background: "#f0f0f0", color: "#666", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>← Voltar</button>
      </div>

      {/* Header */}
      <div style={{ background: "#fff", borderRadius: 10, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>Estado</div>
            <span style={{ background: st.bg, color: st.color, padding: "5px 12px", borderRadius: 4, fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>{st.label}</span>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>Total</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e", fontFamily: "monospace" }}>{fmtFull(mapa.total_valor)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>Criado por</div>
            <div style={{ fontSize: 12 }}>{nomeUser(mapa.created_by)}</div>
            <div style={{ fontSize: 10, color: "#888" }}>{fmtDateTime(mapa.created_at)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>Descrição</div>
            <div style={{ fontSize: 12 }}>{mapa.descricao || "—"}</div>
          </div>
        </div>

        {/* Trilha de aprovações */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #f0f0f0", display: "flex", gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>Aprovação Nível 1</div>
            {mapa.aprovado_n1_em ? (
              <div>
                <div style={{ color: "#16a34a", fontSize: 12, fontWeight: 600 }}>✓ {nomeUser(mapa.aprovado_n1_por)}</div>
                <div style={{ fontSize: 10, color: "#888" }}>{fmtDateTime(mapa.aprovado_n1_em)}</div>
              </div>
            ) : (
              <div style={{ color: "#aaa", fontSize: 11, fontStyle: "italic" }}>a aguardar</div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>Aprovação Nível 2</div>
            {mapa.aprovado_n2_em ? (
              <div>
                <div style={{ color: "#16a34a", fontSize: 12, fontWeight: 600 }}>✓ {nomeUser(mapa.aprovado_n2_por)}</div>
                <div style={{ fontSize: 10, color: "#888" }}>{fmtDateTime(mapa.aprovado_n2_em)}</div>
              </div>
            ) : (
              <div style={{ color: "#aaa", fontSize: 11, fontStyle: "italic" }}>a aguardar</div>
            )}
          </div>
          {mapa.status === "recusado" && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#dc2626", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>Recusado</div>
              <div style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>✕ {nomeUser(mapa.recusado_por)}</div>
              <div style={{ fontSize: 10, color: "#888" }}>{fmtDateTime(mapa.recusado_em)}</div>
              {mapa.motivo_recusa && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 6, fontStyle: "italic" }}>"{mapa.motivo_recusa}"</div>}
            </div>
          )}
        </div>
      </div>

      {/* Ações */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button onClick={exportPDF}
          style={{ background: "#1a1a2e", color: "#6B7C93", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
          📄 Exportar PDF
        </button>
        {podeEliminar && (
          <button onClick={() => onDelete(mapa.id)}
            style={{ background: "#fee2e2", color: "#dc2626", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            🗑️ Eliminar mapa
          </button>
        )}
        {podeRecusar && (
          <button onClick={recusar}
            style={{ background: "#dc2626", color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
            ✕ Recusar
          </button>
        )}
        {podeAprovarN1 && (
          <>
            {!todosSelecionados && numSelecionados > 0 && (
              <button onClick={() => aprovarSelecionados(1)}
                style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                ✓ Aprovar {numSelecionados} de {itens.length}
              </button>
            )}
            <button onClick={() => aprovar(1)}
              style={{ background: "#16a34a", color: "#fff", border: "none", padding: "9px 24px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              ✓ Aprovar Todos (N1)
            </button>
          </>
        )}
        {podeAprovarN2 && (
          <>
            {!todosSelecionados && numSelecionados > 0 && (
              <button onClick={() => aprovarSelecionados(2)}
                style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                ✓ Aprovar {numSelecionados} de {itens.length}
              </button>
            )}
            <button onClick={() => aprovar(2)}
              style={{ background: "#16a34a", color: "#fff", border: "none", padding: "9px 24px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              ✓ Aprovar Todos (N2 Final)
            </button>
          </>
        )}
      </div>

      {/* Itens */}
      <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a2e" }}>
            Itens do mapa ({itens.length})
          </div>
          {(podeAprovarN1 || podeAprovarN2) && selectedItens && !todosSelecionados && (
            <div style={{ fontSize: 11, color: "#3b82f6", fontFamily: "monospace", background: "#eff6ff", padding: "5px 12px", borderRadius: 6, fontWeight: 600 }}>
              {numSelecionados}/{itens.length} selecionados · {fmtFull(totalSelecionado)}
            </div>
          )}
        </div>
        {itensLoading ? (
          <div style={{ padding: 30, textAlign: "center", color: "#888" }}>A carregar…</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                {(podeAprovarN1 || podeAprovarN2) && (
                  <th style={{ padding: "10px 8px", fontWeight: 600, textAlign: "center", width: 36 }}>
                    <input type="checkbox" checked={todosSelecionados}
                      onChange={e => {
                        if (e.target.checked) setSelectedItens(new Set(itens.map(i => i.id)));
                        else setSelectedItens(new Set());
                      }}
                      style={{ cursor: "pointer", width: 15, height: 15 }} title="Selecionar/desselecionar todos" />
                  </th>
                )}
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 10, fontFamily: "monospace", textAlign: "left" }}>Tipo</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 10, fontFamily: "monospace", textAlign: "left" }}>Vencimento</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 10, fontFamily: "monospace", textAlign: "left" }}>Descrição</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 10, fontFamily: "monospace", textAlign: "left" }}>Categoria</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 10, fontFamily: "monospace", textAlign: "right" }}>Valor</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, color: "#666", textTransform: "uppercase", fontSize: 10, fontFamily: "monospace", textAlign: "center", width: 80 }}>Fatura</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Agrupar por empresa
                const byEmpresa = {};
                itens.forEach(it => {
                  const emp = it.empresa || "(sem empresa)";
                  if (!byEmpresa[emp]) byEmpresa[emp] = { items: [], total: 0 };
                  byEmpresa[emp].items.push(it);
                  byEmpresa[emp].total += parseFloat(it.valor) || 0;
                });
                const empresasOrdenadas = Object.keys(byEmpresa).sort();
                const rows = [];
                empresasOrdenadas.forEach(emp => {
                  const grupo = byEmpresa[emp];
                  const podeSel = podeAprovarN1 || podeAprovarN2;
                  const gruposSelIds = grupo.items.map(i => i.id);
                  const todosGrupoSel = selectedItens && gruposSelIds.every(id => selectedItens.has(id));
                  const nenhumGrupoSel = selectedItens && gruposSelIds.every(id => !selectedItens.has(id));
                  // Cabeçalho da empresa
                  rows.push(
                    <tr key={`hdr_${emp}`} style={{ background: "#f0f4ff", borderTop: "2px solid #c7d2fe" }}>
                      {podeSel && (
                        <td style={{ padding: "8px 8px", textAlign: "center", background: "#f0f4ff" }}>
                          <input type="checkbox" checked={!!todosGrupoSel}
                            ref={el => { if (el) el.indeterminate = !todosGrupoSel && !nenhumGrupoSel; }}
                            onChange={e => {
                              setSelectedItens(prev => {
                                const s = new Set(prev || []);
                                if (e.target.checked) gruposSelIds.forEach(id => s.add(id));
                                else gruposSelIds.forEach(id => s.delete(id));
                                return s;
                              });
                            }}
                            style={{ cursor: "pointer", width: 14, height: 14 }}
                            title={`Selecionar/desselecionar todos de ${emp}`} />
                        </td>
                      )}
                      <td colSpan={4} style={{ padding: "8px 16px", fontWeight: 700, color: "#3730a3", fontSize: 12, textTransform: "uppercase", fontFamily: "monospace", letterSpacing: 0.5 }}>
                        📂 {emp} ({grupo.items.length})
                      </td>
                      <td style={{ padding: "8px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#3730a3", fontSize: 12 }}>
                        {fmtFull(grupo.total)}
                      </td>
                      <td style={{ padding: "8px 12px", background: "#f0f4ff" }}></td>
                    </tr>
                  );
                  // Itens
                  grupo.items.forEach(it => {
                    const idKey = String(it.origem_id || "");
                    const src = it.tipo_origem === "fatura" ? faturasById[idKey]
                              : it.tipo_origem === "pagamento_extra" ? pagamentosById[idKey]
                              : null;
                    const obs = src?.obs || src?.observacoes || "";
                    const temAnexo = !!(src?.anexo_b64 && src?.anexo_nome);
                    const itemSelecionado = selectedItens && selectedItens.has(it.id);
                    rows.push(
                      <tr key={it.id} style={{ borderBottom: "1px solid #f5f5f5", background: podeSel && !itemSelecionado ? "#fafafa" : "#fff", opacity: podeSel && !itemSelecionado ? 0.55 : 1 }}>
                        {podeSel && (
                          <td style={{ padding: "8px 8px", textAlign: "center", verticalAlign: "top" }}>
                            <input type="checkbox" checked={!!itemSelecionado}
                              onChange={() => toggleItemSel(it.id)}
                              style={{ cursor: "pointer", width: 14, height: 14 }} />
                          </td>
                        )}
                        <td style={{ padding: "8px 16px 8px 32px", color: "#888", fontSize: 11, fontFamily: "monospace", verticalAlign: "top" }}>{it.tipo_origem}</td>
                        <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 11, verticalAlign: "top" }}>{fmtDate(it.vencimento)}</td>
                        <td style={{ padding: "8px 16px", verticalAlign: "top" }}>
                          <div>{it.fornecedor && <span style={{ color: "#888", marginRight: 6 }}>{it.fornecedor} ·</span>}{it.descricao}</div>
                          {obs && (
                            <div style={{ fontSize: 10, color: "#888", marginTop: 3, fontStyle: "italic", lineHeight: 1.4 }}>
                              💬 {obs}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "8px 16px", verticalAlign: "top" }}><span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 7px", borderRadius: 3, fontSize: 10, fontFamily: "monospace" }}>{it.categoria || "—"}</span></td>
                        <td style={{ padding: "8px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#dc2626", verticalAlign: "top" }}>{fmtFull(it.valor)}</td>
                        <td style={{ padding: "8px 8px", textAlign: "center", verticalAlign: "top" }}>
                          {src ? (
                            <button onClick={() => abrirPreview(it)}
                              title={temAnexo ? `Ver anexo (${src.anexo_nome})` : "Ver detalhes da fatura"}
                              style={{ background: temAnexo ? "#e0e7ff" : "#f5f5f5", color: temAnexo ? "#3730a3" : "#888", border: "none", padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "monospace" }}>
                              {temAnexo ? "📎 Ver" : "ℹ️ Info"}
                            </button>
                          ) : (
                            <span style={{ color: "#ccc", fontSize: 10 }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  });
                });
                return rows;
              })()}
              <tr style={{ background: "#1a1a2e", color: "#fff" }}>
                {(podeAprovarN1 || podeAprovarN2) && <td style={{ background: "#1a1a2e" }}></td>}
                <td colSpan={4} style={{ padding: "12px 16px", textAlign: "right", fontFamily: "monospace", color: "#aaa", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5 }}>Total Geral</td>
                <td style={{ padding: "12px 16px", textAlign: "right", fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: "#6B7C93" }}>{fmtFull(mapa.total_valor)}</td>
                <td style={{ background: "#1a1a2e" }}></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Modal preview da fatura */}
      {previewItem && (() => {
        const src = previewItem.src;
        const it = previewItem.item;
        const nome = src?.anexo_nome || "";
        const b64 = src?.anexo_b64 || "";
        const obs = src?.obs || src?.observacoes || "";
        const isPdf = /\.pdf$/i.test(nome) || /^data:application\/pdf/i.test(b64);
        const isImg = /\.(png|jpe?g|gif|webp|bmp)$/i.test(nome) || /^data:image\//i.test(b64);
        return (
          <div onClick={() => setPreviewItem(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: 12, width: "min(1000px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>

              {/* Header */}
              <div style={{ padding: "16px 22px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fafafa" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", fontFamily: "'DM Sans', sans-serif" }}>
                    {src?.fornecedor || "—"} · {src?.fatura || it.descricao}
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 3, fontFamily: "monospace" }}>
                    {it.empresa?.toUpperCase() || "—"} · Vencimento: {fmtDate(src?.vencimento || it.vencimento)} · <b>{fmtFull(src?.valor || it.valor)}</b>
                  </div>
                </div>
                <button onClick={() => setPreviewItem(null)}
                  style={{ background: "#f5f5f5", border: "none", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  ✕ Fechar
                </button>
              </div>

              {/* Observações */}
              {obs && (
                <div style={{ padding: "12px 22px", borderBottom: "1px solid #f0f0f0", background: "#fffbeb" }}>
                  <div style={{ fontSize: 10, color: "#92400e", fontWeight: 700, textTransform: "uppercase", fontFamily: "monospace", letterSpacing: 0.5, marginBottom: 4 }}>💬 Observações</div>
                  <div style={{ fontSize: 13, color: "#1a1a2e", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{obs}</div>
                </div>
              )}

              {/* Preview */}
              <div style={{ flex: 1, overflow: "auto", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, minHeight: 300 }}>
                {b64 ? (
                  isPdf ? (
                    <iframe src={b64} title={nome} style={{ width: "100%", height: "70vh", border: "none", background: "#fff", borderRadius: 6 }} />
                  ) : isImg ? (
                    <img src={b64} alt={nome} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", background: "#fff", padding: 10, borderRadius: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }} />
                  ) : (
                    <div style={{ textAlign: "center", color: "#888" }}>
                      <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
                      <div style={{ fontSize: 13, marginBottom: 12 }}>Formato não pré-visualizável</div>
                      <a href={b64} download={nome} style={{ display: "inline-block", background: "#3730a3", color: "#fff", padding: "8px 16px", borderRadius: 6, textDecoration: "none", fontSize: 12, fontWeight: 600 }}>⬇ Descarregar {nome}</a>
                    </div>
                  )
                ) : (
                  <div style={{ textAlign: "center", color: "#aaa", padding: 40 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
                    <div style={{ fontSize: 13 }}>Esta fatura não tem anexo importado.</div>
                    {obs && <div style={{ fontSize: 11, marginTop: 6 }}>Vê as observações acima.</div>}
                  </div>
                )}
              </div>

              {/* Footer com download */}
              {b64 && (
                <div style={{ padding: "12px 22px", borderTop: "1px solid #eee", background: "#fafafa", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }}>{nome}</div>
                  <a href={b64} download={nome} style={{ background: "#1a1a2e", color: "#fff", padding: "6px 14px", borderRadius: 6, textDecoration: "none", fontSize: 11, fontWeight: 600, fontFamily: "monospace" }}>
                    ⬇ Descarregar
                  </a>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
