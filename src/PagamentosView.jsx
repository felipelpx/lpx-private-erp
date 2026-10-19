import { useState, useMemo, useEffect } from "react";
import { useMapasPagamento, useMapaItens } from "./hooks.js";
import { supabase } from "./supabase.js";
import { fmtEUR, fmtDataHora } from "./formato.js";
import { statusFatura, faturaPaga } from "./status.js";

const fmtFull = (v) => fmtEUR(v);
const fmtDate = (s) => {
  if (!s || typeof s !== "string" || s.length < 10) return s || "—";
  const m = s.substring(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
};
const fmtDateTime = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return fmtDataHora(d);
};

const STATUS_INFO = {
  pendente_nivel_1: { label: "Pendente N1", color: "#C19A4A", bg: "#F6ECD6" },
  pendente_nivel_2: { label: "Pendente N2", color: "#2C4A63", bg: "#E0E9F0" },
  aprovado:         { label: "Aprovado",     color: "#1F7A54", bg: "#E2EFE8" },
  recusado:         { label: "Recusado",     color: "#A93226", bg: "#F6DED9" },
};

export default function PagamentosView({ faturas, pagamentosExtras, currentUser, profiles = [] }) {
  const { mapas, loading: mapasLoading, addMapa, updateMapa, deleteMapa } = useMapasPagamento();
  const [view, setView] = useState("lista");  // 'lista' | 'novo' | 'detalhe'
  const [activeMapaId, setActiveMapaId] = useState(null);

  // permissões
  const canCreate = currentUser?.can_create_mapas || currentUser?.role === "admin";
  // Hierarquia: quem aprova ao nível 2 também aprova ao nível 1.
  // (Antes era igualdade exata, e um aprovador de nível 2 ficava sem poder
  //  aprovar mapas parados no nível 1.)
  const isN1 = (currentUser?.approval_level || 0) >= 1;
  const isN2 = (currentUser?.approval_level || 0) >= 2;

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
      faturas={faturas}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: "var(--fonte-titulo)" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontFamily: "var(--fonte-titulo)", fontSize: 22, color: "#091C2A" }}>Mapas de Pagamento</h2>
        {canCreate && (
          <button onClick={() => setView("novo")}
            style={{ background:"#091C2A", color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 700 }}>
            + Novo Mapa
          </button>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {[
          { label: "Total Mapas", value: kpis.total, color: "#091C2A" },
          { label: "Pendente N1", value: kpis.pendN1, color: "#C19A4A" },
          { label: "Pendente N2", value: kpis.pendN2, color: "#2C4A63" },
          { label: "Aprovados", value: kpis.aprovados, color: "#1F7A54" },
          { label: "Recusados", value: kpis.recusados, color: "#A93226" },
        ].map((k, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 10, color: "#9DA2A6", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: k.color, fontFamily: "var(--fonte-numero)" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabela de mapas */}
      <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #E7DED2", fontWeight: 600, fontSize: 14, color: "#091C2A" }}>
          Lista de Mapas
        </div>
        {mapasLoading ? (
          <div style={{ padding: 32, textAlign: "center", color: "#7E8388" }}>A carregar…</div>
        ) : (!mapas || mapas.length === 0) ? (
          <div style={{ padding: 32, textAlign: "center", color: "#7E8388" }}>
            Ainda não há mapas de pagamento. {canCreate && "Clica em '+ Novo Mapa' para criar o primeiro."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#FBF7F1", textAlign: "left" }}>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 10, fontFamily: "var(--fonte-numero)" }}>Nº</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 10, fontFamily: "var(--fonte-numero)" }}>Descrição</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 10, fontFamily: "var(--fonte-numero)" }}>Criado por</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 10, fontFamily: "var(--fonte-numero)" }}>Data</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 10, fontFamily: "var(--fonte-numero)", textAlign: "right" }}>Total</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 10, fontFamily: "var(--fonte-numero)" }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {mapas.map(m => {
                const st = STATUS_INFO[m.status] || { label: m.status, color: "#7E8388", bg: "#EFE8DE" };
                return (
                  <tr key={m.id}
                    onClick={() => { setActiveMapaId(m.id); setView("detalhe"); }}
                    style={{ borderBottom: "1px solid #F7F2EA", cursor: "pointer" }}
                    onMouseOver={e => e.currentTarget.style.background = "#FBF7F1"}
                    onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "10px 16px", fontFamily: "var(--fonte-numero)", color: "#091C2A", fontWeight: 600 }}>{m.numero || m.id?.slice(0, 8)}</td>
                    <td style={{ padding: "10px 16px" }}>{m.descricao || "—"}</td>
                    <td style={{ padding: "10px 16px", color: "#5C6166", fontSize: 11 }}>{nomeUser(m.created_by)}</td>
                    <td style={{ padding: "10px 16px", color: "#5C6166", fontSize: 11 }}>{fmtDateTime(m.created_at)}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--fonte-numero)", fontWeight: 600 }}>{fmtFull(m.total_valor)}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ background: st.bg, color: st.color, padding: "3px 8px", borderRadius: 4, fontSize: 10, fontFamily: "var(--fonte-numero)", fontWeight: 700 }}>
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
      <div style={{ background: "#EDF1F5", border: "1px solid #CBDAE5", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#2C4A63" }}>
        <strong>O teu nível:</strong> {isN1 ? "Aprovador Nível 1" : isN2 ? "Aprovador Nível 2" : "Sem aprovação"}
        {canCreate && " · Podes criar mapas"}
      </div>
    </div>
  );
}

// ─── Componente: criar novo mapa ─────────────────────────────────────────────
function NovoMapa({ faturas, currentUser, onCancel, onCreated }) {
  const [previewItem, setPreviewItem] = useState(null);   // { item, src }
  const hoje = new Date().toISOString().slice(0, 10);
  const [descricao, setDescricao] = useState(`Mapa de ${hoje.split("-").reverse().join("-")}`);
  const [selected, setSelected] = useState({});  // key -> true
  const [filtro, setFiltro] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroFornecedor, setFiltroFornecedor] = useState("");
  const [filtroVencDe, setFiltroVencDe] = useState("");
  const [filtroVencAte, setFiltroVencAte] = useState("");

  // Candidatos ao mapa: SÓ faturas de Contas a Pagar que continuam por pagar.
  const candidatos = useMemo(() => {
    const out = [];

    // 1. Faturas (Contas a Pagar) — só as que continuam por pagar.
    //    Comparar com a string "Paga" já não chega: depois da migração v7 os
    //    estados passaram a ser "Pago" e "Lançado no banco", e as faturas
    //    liquidadas voltavam a aparecer aqui para seleção.
    (faturas || []).forEach(f => {
      if (faturaPaga(f)) return;                              // Pago / Lançado no banco
      if (!statusFatura(f).startsWith("Pendente")) return;    // exclui bloqueadas
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
        // Quem monta o mapa tem de ver o que está a escolher: a observação
        // escrita na fatura e o próprio documento, sem sair deste ecrã.
        obs: f.obs || f.observacoes || "",
        _fatura: f,
      });
    });

    // As previsões do Fluxo Futuro NÃO entram no mapa de pagamento.
    // Um mapa autoriza pagamentos a fornecedores, e isso só existe depois de
    // haver fatura em Contas a Pagar. Previsões são estimativas — quando a
    // fatura chega, converte-se a previsão e a fatura passa a estar disponível
    // aqui automaticamente.

    // As comissões de vendas também não entram diretamente: só chegam aqui
    // depois de virarem fatura. Na aba Comercial, o botão 🤝 de cada venda
    // gera a fatura da comissão em Contas a Pagar — e a partir daí aparece
    // nesta lista como qualquer outra. Evita que a mesma comissão seja paga
    // duas vezes, uma pelo mapa e outra pela fatura gerada.

    // Ordenar por data de vencimento (mais antigo primeiro)
    out.sort((a, b) => (a.vencimento || "9999").localeCompare(b.vencimento || "9999"));
    return out;
  }, [faturas]);

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
          !(c.categoria || "").toLowerCase().includes(f) &&
          !(c.obs || "").toLowerCase().includes(f)   // a observação também se procura
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "var(--fonte-titulo)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontFamily: "var(--fonte-titulo)", fontSize: 22, color: "#091C2A" }}>Novo Mapa de Pagamento</h2>
        <button onClick={onCancel} style={{ background: "#E7DED2", color: "#5C6166", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>← Voltar</button>
      </div>

      {/* Header form */}
      <div style={{ background: "#fff", borderRadius: 10, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ fontSize: 10, color: "#7E8388", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", marginBottom: 5 }}>Descrição do mapa</div>
        <input value={descricao} onChange={e => setDescricao(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", border: "1px solid #E3D9CC", borderRadius: 6, fontSize: 13, fontFamily: "inherit" }} />
      </div>

      {/* Tabela de candidatos */}
      <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid #E7DED2", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#091C2A" }}>
            Itens disponíveis ({candidatosFiltrados.length}{candidatosFiltrados.length !== candidatos.length ? ` de ${candidatos.length}` : ""}) · <span style={{ color: "#1F7A54" }}>{nSelecionados} selecionados</span>
          </div>
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Pesquisa livre…"
            style={{ padding: "6px 10px", border: "1px solid #E3D9CC", borderRadius: 6, fontSize: 12, fontFamily: "inherit", width: 200 }} />
        </div>
        {/* Filtros estruturados */}
        <div style={{ padding: "10px 18px", borderBottom: "1px solid #E7DED2", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: "#FBF7F1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#7E8388", textTransform: "uppercase", fontFamily: "var(--fonte-numero)" }}>Empresa:</span>
            <select value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}
              style={{ padding: "5px 8px", border: "1px solid #E3D9CC", borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: "#fff" }}>
              <option value="">Todas</option>
              {empresasUnicas.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#7E8388", textTransform: "uppercase", fontFamily: "var(--fonte-numero)" }}>Fornecedor:</span>
            <select value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)}
              style={{ padding: "5px 8px", border: "1px solid #E3D9CC", borderRadius: 6, fontSize: 11, fontFamily: "inherit", background: "#fff", maxWidth: 200 }}>
              <option value="">Todos</option>
              {fornecedoresUnicos.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#7E8388", textTransform: "uppercase", fontFamily: "var(--fonte-numero)" }}>Vencimento de:</span>
            <input type="date" value={filtroVencDe} onChange={e => setFiltroVencDe(e.target.value)}
              style={{ padding: "4px 6px", border: "1px solid #E3D9CC", borderRadius: 6, fontSize: 11, fontFamily: "var(--fonte-numero)" }} />
            <span style={{ fontSize: 10, color: "#7E8388", textTransform: "uppercase", fontFamily: "var(--fonte-numero)" }}>até:</span>
            <input type="date" value={filtroVencAte} onChange={e => setFiltroVencAte(e.target.value)}
              style={{ padding: "4px 6px", border: "1px solid #E3D9CC", borderRadius: 6, fontSize: 11, fontFamily: "var(--fonte-numero)" }} />
          </div>
          {(filtro || filtroEmpresa || filtroFornecedor || filtroVencDe || filtroVencAte) && (
            <button onClick={() => { setFiltro(""); setFiltroEmpresa(""); setFiltroFornecedor(""); setFiltroVencDe(""); setFiltroVencAte(""); }}
              title="Limpar todos os filtros"
              style={{ background: "#F6DED9", color: "#A93226", border: "none", padding: "4px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer", fontWeight: 600 }}>
              ✕ Limpar filtros
            </button>
          )}
        </div>
        <div style={{ maxHeight: 500, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead style={{ background: "#FBF7F1", position: "sticky", top: 0 }}>
              <tr>
                <th style={{ padding: "8px 12px", textAlign: "center", width: 30 }}>
                  <input type="checkbox" checked={candidatosFiltrados.length > 0 && nSelecionados === candidatosFiltrados.length} onChange={toggleAll} />
                </th>
                <th style={{ padding: "8px 12px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 9, fontFamily: "var(--fonte-numero)", textAlign: "left" }}>Tipo</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 9, fontFamily: "var(--fonte-numero)", textAlign: "left" }}>Vencimento</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 9, fontFamily: "var(--fonte-numero)", textAlign: "left" }}>Descrição</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 9, fontFamily: "var(--fonte-numero)", textAlign: "left" }}>Empresa</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 9, fontFamily: "var(--fonte-numero)", textAlign: "left" }}>Categoria</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 9, fontFamily: "var(--fonte-numero)", textAlign: "right" }}>Valor</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 9, fontFamily: "var(--fonte-numero)", textAlign: "center" }}>Fatura</th>
              </tr>
            </thead>
            <tbody>
              {candidatosFiltrados.map(c => {
                const isSel = !!selected[c.key];
                return (
                  <tr key={c.key}
                    onClick={() => setSelected(s => ({ ...s, [c.key]: !s[c.key] }))}
                    style={{ borderBottom: "1px solid #F7F2EA", cursor: "pointer", background: isSel ? "#EFF5F1" : "transparent" }}>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <input type="checkbox" checked={isSel} readOnly />
                    </td>
                    <td style={{ padding: "8px 12px", color: "#7E8388", fontSize: 10, fontFamily: "var(--fonte-numero)" }}>{c._label}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "var(--fonte-numero)", fontSize: 10 }}>{fmtDate(c.vencimento)}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <div>{c.fornecedor && <span style={{ color: "#7E8388", marginRight: 6 }}>{c.fornecedor} ·</span>}{c.descricao || "—"}</div>
                      {c.obs && (
                        <div style={{ fontSize: 10, color: "#7E8388", marginTop: 3, fontStyle: "italic", lineHeight: 1.4 }}>
                          💬 {c.obs}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", color: "#5C6166", fontSize: 10 }}>{c.empresa || "—"}</td>
                    <td style={{ padding: "8px 12px", color: "#5C6166" }}><span style={{ background: "#F6ECD6", color: "#7A5A22", padding: "1px 6px", borderRadius: 3, fontSize: 9, fontFamily: "var(--fonte-numero)" }}>{c.categoria || "—"}</span></td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--fonte-numero)", fontWeight: 600, color: "#A93226" }}>{fmtFull(c.valor)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}
                        onClick={e => { e.stopPropagation(); setPreviewItem({ item: c, src: c._fatura }); }}>
                      {(() => {
                        const temAnexo = !!(c._fatura?.anexo_b64 && c._fatura?.anexo_nome);
                        return (
                          <button title={temAnexo ? `Ver anexo (${c._fatura.anexo_nome})` : "Ver detalhes da fatura"}
                            style={{ background: temAnexo ? "#E0E9F0" : "#F7F2EA", color: temAnexo ? "#2C4A63" : "#7E8388",
                                     border: "none", padding: "4px 10px", borderRadius: 6, fontSize: 10,
                                     fontWeight: 600, cursor: "pointer", fontFamily: "var(--fonte-numero)" }}>
                            {temAnexo ? "📎 Ver" : "ℹ️ Info"}
                          </button>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer com total e botão */}
      <div style={{ background: "#091C2A", color: "#fff", borderRadius: 10, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ color: "#9DA2A6", fontSize: 11, fontFamily: "var(--fonte-numero)", textTransform: "uppercase", marginRight: 10 }}>Total selecionado</span>
          <span style={{ fontFamily: "var(--fonte-numero)", fontSize: 18, fontWeight: 700, color: "#BAA685" }}>{fmtFull(totalSelecionado)}</span>
          <span style={{ color: "#9DA2A6", marginLeft: 12, fontSize: 11 }}>({nSelecionados} itens)</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ background: "#3a3a4e", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={submit}
            disabled={nSelecionados === 0}
            style={{ background: nSelecionados === 0 ? "#4A5055" : "#091C2A", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 8, cursor: nSelecionados === 0 ? "default" : "pointer", fontSize: 13, fontWeight: 700 }}>
            Criar mapa e enviar para aprovação N1 →
          </button>
        </div>
      </div>

      <PreviewFatura previewItem={previewItem} onFechar={() => setPreviewItem(null)} />
    </div>
  );
}

// ─── Pré-visualização de uma fatura ──────────────────────────────────────────
// O anexo e as observações da fatura, no mesmo sítio. Serve o detalhe de um
// mapa e também a montagem de um mapa novo: quem está a escolher o que pagar
// precisa de ver o que está a escolher, não só o número da fatura.
function PreviewFatura({ previewItem, onFechar }) {
  if (!previewItem) return null;
        const src = previewItem.src;
        const it = previewItem.item;
        const nome = src?.anexo_nome || "";
        const b64 = src?.anexo_b64 || "";
        const obs = src?.obs || src?.observacoes || "";
        const isPdf = /\.pdf$/i.test(nome) || /^data:application\/pdf/i.test(b64);
        const isImg = /\.(png|jpe?g|gif|webp|bmp)$/i.test(nome) || /^data:image\//i.test(b64);
        return (
          <div onClick={() => onFechar()}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: 12, width: "min(1000px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>

              {/* Header */}
              <div style={{ padding: "16px 22px", borderBottom: "1px solid #EFE8DE", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FBF7F1" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#091C2A", fontFamily: "var(--fonte-titulo)" }}>
                    {src?.fornecedor || "—"} · {src?.fatura || it.descricao}
                  </div>
                  <div style={{ fontSize: 11, color: "#7E8388", marginTop: 3, fontFamily: "var(--fonte-numero)" }}>
                    {it.empresa?.toUpperCase() || "—"} · Vencimento: {fmtDate(src?.vencimento || it.vencimento)} · <b>{fmtFull(src?.valor || it.valor)}</b>
                  </div>
                </div>
                <button onClick={() => onFechar()}
                  style={{ background: "#F7F2EA", border: "none", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  ✕ Fechar
                </button>
              </div>

              {/* Observações */}
              {obs && (
                <div style={{ padding: "12px 22px", borderBottom: "1px solid #E7DED2", background: "#FBF6EC" }}>
                  <div style={{ fontSize: 10, color: "#7A5A22", fontWeight: 700, textTransform: "uppercase", fontFamily: "var(--fonte-numero)", letterSpacing: 0.5, marginBottom: 4 }}>💬 Observações</div>
                  <div style={{ fontSize: 13, color: "#091C2A", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{obs}</div>
                </div>
              )}

              {/* Preview */}
              <div style={{ flex: 1, overflow: "auto", background: "#F7F2EA", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, minHeight: 300 }}>
                {b64 ? (
                  isPdf ? (
                    <iframe src={b64} title={nome} style={{ width: "100%", height: "70vh", border: "none", background: "#fff", borderRadius: 6 }} />
                  ) : isImg ? (
                    <img src={b64} alt={nome} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", background: "#fff", padding: 10, borderRadius: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }} />
                  ) : (
                    <div style={{ textAlign: "center", color: "#7E8388" }}>
                      <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
                      <div style={{ fontSize: 13, marginBottom: 12 }}>Formato não pré-visualizável</div>
                      <a href={b64} download={nome} style={{ display: "inline-block", background: "#2C4A63", color: "#fff", padding: "8px 16px", borderRadius: 6, textDecoration: "none", fontSize: 12, fontWeight: 600 }}>⬇ Descarregar {nome}</a>
                    </div>
                  )
                ) : (
                  <div style={{ textAlign: "center", color: "#9DA2A6", padding: 40 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
                    <div style={{ fontSize: 13 }}>Esta fatura não tem anexo importado.</div>
                    {obs && <div style={{ fontSize: 11, marginTop: 6 }}>Vê as observações acima.</div>}
                  </div>
                )}
              </div>

              {/* Footer com download */}
              {b64 && (
                <div style={{ padding: "12px 22px", borderTop: "1px solid #EFE8DE", background: "#FBF7F1", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: "#7E8388", fontFamily: "var(--fonte-numero)" }}>{nome}</div>
                  <a href={b64} download={nome} style={{ background: "#091C2A", color: "#fff", padding: "6px 14px", borderRadius: 6, textDecoration: "none", fontSize: 11, fontWeight: 600, fontFamily: "var(--fonte-numero)" }}>
                    ⬇ Descarregar
                  </a>
                </div>
              )}
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

  const st = STATUS_INFO[mapa.status] || { label: mapa.status, color: "#7E8388", bg: "#EFE8DE" };
  const isN1 = (currentUser?.approval_level || 0) >= 1;
  const isN2 = (currentUser?.approval_level || 0) >= 2;
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
    const agora = new Date().toISOString();
    const updates = {};

    if (nivel === 1) {
      // Quem tem nível 2 pode fechar o mapa de uma vez. Perguntamos primeiro:
      // saltar o segundo visto elimina a validação por duas pessoas, por isso
      // a decisão é explícita e não silenciosa.
      const podeFecharJa = (currentUser.approval_level || 0) >= 2;
      const fecharJa = podeFecharJa && confirm(
        "Aprovar este mapa por completo?\n\n" +
        "OK — aprova os dois níveis de uma vez e o mapa fica fechado.\n" +
        "Cancelar — dá só a 1.ª aprovação e o mapa fica à espera do 2.º visto.\n\n" +
        "Nota: aprovar os dois níveis dispensa a validação por uma segunda pessoa."
      );

      if (fecharJa) {
        updates.status = "aprovado";
        updates.aprovado_n1_por = currentUser.id;
        updates.aprovado_n1_em = agora;
        updates.aprovado_n2_por = currentUser.id;
        updates.aprovado_n2_em = agora;
      } else {
        updates.status = "pendente_nivel_2";
        updates.aprovado_n1_por = currentUser.id;
        updates.aprovado_n1_em = agora;
      }
    } else {
      updates.status = "aprovado";
      updates.aprovado_n2_por = currentUser.id;
      updates.aprovado_n2_em = agora;
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
    const agora = new Date().toISOString();
    const updates = { total_valor: novoTotal };
    if (nivel === 1) {
      // Mesma escolha da aprovação total: quem tem nível 2 pode fechar já
      const podeFecharJa = (currentUser.approval_level || 0) >= 2;
      const fecharJa = podeFecharJa && confirm(
        "Aprovar por completo os itens selecionados?\n\n" +
        "OK — aprova os dois níveis e o mapa fica fechado.\n" +
        "Cancelar — dá só a 1.ª aprovação."
      );
      updates.status = fecharJa ? "aprovado" : "pendente_nivel_2";
      updates.aprovado_n1_por = currentUser.id;
      updates.aprovado_n1_em = agora;
      if (fecharJa) {
        updates.aprovado_n2_por = currentUser.id;
        updates.aprovado_n2_em = agora;
      }
    } else {
      updates.status = "aprovado";
      updates.aprovado_n2_por = currentUser.id;
      updates.aprovado_n2_em = agora;
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
        <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-15deg);border:8px solid #1F7A54;color:#1F7A54;padding:30px 60px;font-size:62px;font-weight:900;font-family:Georgia,serif;letter-spacing:6px;opacity:0.18;pointer-events:none;z-index:1;border-radius:14px;">
          APROVADO
        </div>`;
    } else if (mapa.status === "recusado") {
      carimbo = `
        <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-15deg);border:8px solid #A93226;color:#A93226;padding:30px 60px;font-size:62px;font-weight:900;font-family:Georgia,serif;letter-spacing:6px;opacity:0.18;pointer-events:none;z-index:1;border-radius:14px;">
          RECUSADO
        </div>`;
    } else if (mapa.status === "pendente_nivel_1" || mapa.status === "pendente_nivel_2") {
      carimbo = `
        <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-15deg);border:8px solid #C19A4A;color:#C19A4A;padding:24px 50px;font-size:44px;font-weight:900;font-family:Georgia,serif;letter-spacing:4px;opacity:0.16;pointer-events:none;z-index:1;border-radius:14px;">
          PENDENTE
        </div>`;
    }

    let tabelaEmpresas = "";
    empresas.forEach(emp => {
      const grupo = byEmpresa[emp];
      tabelaEmpresas += `
        <thead>
          <tr style="background:#EDF1F5;border-top:2px solid #CBDAE5;">
            <th colspan="4" style="padding:10px 14px;text-align:left;color:#2C4A63;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">
              ${emp} (${grupo.items.length} ${grupo.items.length === 1 ? 'item' : 'itens'})
            </th>
            <th style="padding:10px 14px;text-align:right;color:#2C4A63;font-size:13px;font-weight:700;font-family:monospace;">
              ${fmtFull(grupo.total)}
            </th>
          </tr>
        </thead>
        <tbody>
      `;
      grupo.items.forEach(it => {
        tabelaEmpresas += `
          <tr style="border-bottom:1px solid #EFE8DE;">
            <td style="padding:7px 14px 7px 28px;color:#7E8388;font-size:10px;font-family:monospace;">${it.tipo_origem}</td>
            <td style="padding:7px 14px;font-family:monospace;font-size:11px;">${fmtDate(it.vencimento)}</td>
            <td style="padding:7px 14px;font-size:11px;">${(it.fornecedor ? `<span style="color:#7E8388">${it.fornecedor} · </span>` : "")}${(it.descricao || "").replace(/</g, "&lt;")}</td>
            <td style="padding:7px 14px;font-size:10px;color:#7A5A22;">${it.categoria || "—"}</td>
            <td style="padding:7px 14px;text-align:right;font-family:monospace;font-weight:600;font-size:11px;color:#A93226;">${fmtFull(it.valor)}</td>
          </tr>
        `;
      });
      tabelaEmpresas += "</tbody>";
    });

    const aprovacoesHtml = `
      <div style="margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div style="border:1px solid #E3D9CC;border-radius:8px;padding:14px;${mapa.aprovado_n1_em ? 'background:#EFF5F1;border-color:#C9E3D5;' : ''}">
          <div style="font-size:10px;color:#7E8388;text-transform:uppercase;letter-spacing:0.5px;font-family:monospace;margin-bottom:6px;">Aprovação Nível 1</div>
          ${mapa.aprovado_n1_em ? `
            <div style="color:#1F7A54;font-weight:700;font-size:14px;">✓ ${nomeUser(mapa.aprovado_n1_por)}</div>
            <div style="color:#5C6166;font-size:11px;">${fmtDateTime(mapa.aprovado_n1_em)}</div>
          ` : `<div style="color:#9DA2A6;font-size:11px;font-style:italic;">a aguardar</div>`}
        </div>
        <div style="border:1px solid #E3D9CC;border-radius:8px;padding:14px;${mapa.aprovado_n2_em ? 'background:#EFF5F1;border-color:#C9E3D5;' : ''}">
          <div style="font-size:10px;color:#7E8388;text-transform:uppercase;letter-spacing:0.5px;font-family:monospace;margin-bottom:6px;">Aprovação Nível 2 (Final)</div>
          ${mapa.aprovado_n2_em ? `
            <div style="color:#1F7A54;font-weight:700;font-size:14px;">✓ ${nomeUser(mapa.aprovado_n2_por)}</div>
            <div style="color:#5C6166;font-size:11px;">${fmtDateTime(mapa.aprovado_n2_em)}</div>
          ` : `<div style="color:#9DA2A6;font-size:11px;font-style:italic;">a aguardar</div>`}
        </div>
      </div>
      ${mapa.status === "recusado" ? `
        <div style="margin-top:16px;border:1px solid #EFCFC9;background:#FBEDEB;border-radius:8px;padding:14px;">
          <div style="font-size:10px;color:#A93226;text-transform:uppercase;letter-spacing:0.5px;font-family:monospace;margin-bottom:6px;">Recusado</div>
          <div style="color:#A93226;font-weight:700;font-size:14px;">✕ ${nomeUser(mapa.recusado_por)}</div>
          <div style="color:#5C6166;font-size:11px;">${fmtDateTime(mapa.recusado_em)}</div>
          ${mapa.motivo_recusa ? `<div style="color:#6E241C;font-size:12px;margin-top:8px;font-style:italic;">"${mapa.motivo_recusa.replace(/</g, "&lt;")}"</div>` : ""}
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
    body { font-family: 'Helvetica', Arial, sans-serif; color: #091C2A; margin: 0; padding: 0; }
    .header { border-bottom: 3px solid #091C2A; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .brand { font-family: Georgia, serif; font-size: 26px; font-weight: 700; color: #091C2A; letter-spacing: -0.5px; }
    .brand span { color: #BAA685; }
    .subtitle { font-size: 11px; color: #7E8388; margin-top: 4px; letter-spacing: 2px; text-transform: uppercase; }
    .doc-id { text-align: right; font-family: monospace; }
    .doc-id .num { font-size: 18px; font-weight: 700; color: #091C2A; }
    .doc-id .label { font-size: 10px; color: #7E8388; text-transform: uppercase; letter-spacing: 1px; }
    h1 { font-family: Georgia, serif; font-size: 22px; margin: 0 0 18px 0; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; background: #FBF7F1; padding: 14px; border-radius: 8px; margin-bottom: 20px; }
    .info-grid .label { font-size: 9px; color: #7E8388; text-transform: uppercase; letter-spacing: 0.5px; font-family: monospace; margin-bottom: 4px; }
    .info-grid .value { font-size: 13px; color: #091C2A; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    .footer { margin-top: 40px; border-top: 1px solid #E3D9CC; padding-top: 14px; font-size: 9px; color: #7E8388; display: flex; justify-content: space-between; }
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
      <div style="font-size:10px;color:#7E8388;margin-top:4px;">${fmtDateTime(mapa.created_at)}</div>
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
      <div class="value" style="font-size:18px;color:#BAA685;font-family:monospace;">${fmtFull(mapa.total_valor)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr style="background:#091C2A;color:#fff;">
        <th style="padding:9px 14px;text-align:left;font-size:10px;text-transform:uppercase;font-family:monospace;letter-spacing:0.5px;">Tipo</th>
        <th style="padding:9px 14px;text-align:left;font-size:10px;text-transform:uppercase;font-family:monospace;letter-spacing:0.5px;">Vencimento</th>
        <th style="padding:9px 14px;text-align:left;font-size:10px;text-transform:uppercase;font-family:monospace;letter-spacing:0.5px;">Descrição</th>
        <th style="padding:9px 14px;text-align:left;font-size:10px;text-transform:uppercase;font-family:monospace;letter-spacing:0.5px;">Categoria</th>
        <th style="padding:9px 14px;text-align:right;font-size:10px;text-transform:uppercase;font-family:monospace;letter-spacing:0.5px;">Valor</th>
      </tr>
    </thead>
    ${tabelaEmpresas}
    <tfoot>
      <tr style="background:#091C2A;color:#fff;">
        <td colspan="4" style="padding:13px 14px;text-align:right;color:#9DA2A6;font-size:11px;text-transform:uppercase;font-family:monospace;letter-spacing:0.8px;">Total Geral</td>
        <td style="padding:13px 14px;text-align:right;color:#BAA685;font-size:18px;font-weight:700;font-family:monospace;">${fmtFull(mapa.total_valor)}</td>
      </tr>
    </tfoot>
  </table>

  ${aprovacoesHtml}

  <div class="footer">
    <div>Documento gerado em ${fmtDataHora(new Date())}</div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "var(--fonte-titulo)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontFamily: "var(--fonte-titulo)", fontSize: 22, color: "#091C2A" }}>
          Mapa {mapa.numero || mapa.id?.slice(0, 8)}
        </h2>
        <button onClick={onClose} style={{ background: "#E7DED2", color: "#5C6166", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>← Voltar</button>
      </div>

      {/* Header */}
      <div style={{ background: "#fff", borderRadius: 10, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: "#9DA2A6", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", marginBottom: 4 }}>Estado</div>
            <span style={{ background: st.bg, color: st.color, padding: "5px 12px", borderRadius: 4, fontSize: 12, fontFamily: "var(--fonte-numero)", fontWeight: 700 }}>{st.label}</span>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#9DA2A6", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", marginBottom: 4 }}>Total</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#091C2A", fontFamily: "var(--fonte-numero)" }}>{fmtFull(mapa.total_valor)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#9DA2A6", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", marginBottom: 4 }}>Criado por</div>
            <div style={{ fontSize: 12 }}>{nomeUser(mapa.created_by)}</div>
            <div style={{ fontSize: 10, color: "#7E8388" }}>{fmtDateTime(mapa.created_at)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#9DA2A6", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", marginBottom: 4 }}>Descrição</div>
            <div style={{ fontSize: 12 }}>{mapa.descricao || "—"}</div>
          </div>
        </div>

        {/* Trilha de aprovações */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #E7DED2", display: "flex", gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#9DA2A6", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", marginBottom: 4 }}>Aprovação Nível 1</div>
            {mapa.aprovado_n1_em ? (
              <div>
                <div style={{ color: "#1F7A54", fontSize: 12, fontWeight: 600 }}>✓ {nomeUser(mapa.aprovado_n1_por)}</div>
                <div style={{ fontSize: 10, color: "#7E8388" }}>{fmtDateTime(mapa.aprovado_n1_em)}</div>
              </div>
            ) : (
              <div style={{ color: "#9DA2A6", fontSize: 11, fontStyle: "italic" }}>a aguardar</div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#9DA2A6", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", marginBottom: 4 }}>Aprovação Nível 2</div>
            {mapa.aprovado_n2_em ? (
              <div>
                <div style={{ color: "#1F7A54", fontSize: 12, fontWeight: 600 }}>✓ {nomeUser(mapa.aprovado_n2_por)}</div>
                <div style={{ fontSize: 10, color: "#7E8388" }}>{fmtDateTime(mapa.aprovado_n2_em)}</div>
              </div>
            ) : (
              <div style={{ color: "#9DA2A6", fontSize: 11, fontStyle: "italic" }}>a aguardar</div>
            )}
          </div>
          {mapa.status === "recusado" && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#A93226", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", marginBottom: 4 }}>Recusado</div>
              <div style={{ color: "#A93226", fontSize: 12, fontWeight: 600 }}>✕ {nomeUser(mapa.recusado_por)}</div>
              <div style={{ fontSize: 10, color: "#7E8388" }}>{fmtDateTime(mapa.recusado_em)}</div>
              {mapa.motivo_recusa && <div style={{ fontSize: 11, color: "#A93226", marginTop: 6, fontStyle: "italic" }}>"{mapa.motivo_recusa}"</div>}
            </div>
          )}
        </div>
      </div>

      {/* Ações */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button onClick={exportPDF}
          style={{ background: "#091C2A", color: "#BAA685", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
          📄 Exportar PDF
        </button>
        {podeEliminar && (
          <button onClick={() => onDelete(mapa.id)}
            style={{ background: "#F6DED9", color: "#A93226", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            🗑️ Eliminar mapa
          </button>
        )}
        {podeRecusar && (
          <button onClick={recusar}
            style={{ background: "#A93226", color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
            ✕ Recusar
          </button>
        )}
        {podeAprovarN1 && (
          <>
            {!todosSelecionados && numSelecionados > 0 && (
              <button onClick={() => aprovarSelecionados(1)}
                style={{ background: "#2C4A63", color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                ✓ Aprovar {numSelecionados} de {itens.length}
              </button>
            )}
            <button onClick={() => aprovar(1)}
              style={{ background:"#091C2A", color: "#fff", border: "none", padding: "9px 24px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              ✓ Aprovar Todos (N1)
            </button>
          </>
        )}
        {podeAprovarN2 && (
          <>
            {!todosSelecionados && numSelecionados > 0 && (
              <button onClick={() => aprovarSelecionados(2)}
                style={{ background: "#2C4A63", color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                ✓ Aprovar {numSelecionados} de {itens.length}
              </button>
            )}
            <button onClick={() => aprovar(2)}
              style={{ background:"#091C2A", color: "#fff", border: "none", padding: "9px 24px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              ✓ Aprovar Todos (N2 Final)
            </button>
          </>
        )}
      </div>

      {/* Itens */}
      <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #E7DED2", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#091C2A" }}>
            Itens do mapa ({itens.length})
          </div>
          {(podeAprovarN1 || podeAprovarN2) && selectedItens && !todosSelecionados && (
            <div style={{ fontSize: 11, color: "#2C4A63", fontFamily: "var(--fonte-numero)", background: "#EDF1F5", padding: "5px 12px", borderRadius: 6, fontWeight: 600 }}>
              {numSelecionados}/{itens.length} selecionados · {fmtFull(totalSelecionado)}
            </div>
          )}
        </div>
        {itensLoading ? (
          <div style={{ padding: 30, textAlign: "center", color: "#7E8388" }}>A carregar…</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#FBF7F1" }}>
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
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 10, fontFamily: "var(--fonte-numero)", textAlign: "left" }}>Tipo</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 10, fontFamily: "var(--fonte-numero)", textAlign: "left" }}>Vencimento</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 10, fontFamily: "var(--fonte-numero)", textAlign: "left" }}>Descrição</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 10, fontFamily: "var(--fonte-numero)", textAlign: "left" }}>Categoria</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 10, fontFamily: "var(--fonte-numero)", textAlign: "right" }}>Valor</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, color: "#5C6166", textTransform: "uppercase", fontSize: 10, fontFamily: "var(--fonte-numero)", textAlign: "center", width: 80 }}>Fatura</th>
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
                    <tr key={`hdr_${emp}`} style={{ background: "#EDF1F5", borderTop: "2px solid #CBDAE5" }}>
                      {podeSel && (
                        <td style={{ padding: "8px 8px", textAlign: "center", background: "#EDF1F5" }}>
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
                      <td colSpan={4} style={{ padding: "8px 16px", fontWeight: 700, color: "#2C4A63", fontSize: 12, textTransform: "uppercase", fontFamily: "var(--fonte-numero)", letterSpacing: 0.5 }}>
                        📂 {emp} ({grupo.items.length})
                      </td>
                      <td style={{ padding: "8px 16px", textAlign: "right", fontFamily: "var(--fonte-numero)", fontWeight: 700, color: "#2C4A63", fontSize: 12 }}>
                        {fmtFull(grupo.total)}
                      </td>
                      <td style={{ padding: "8px 12px", background: "#EDF1F5" }}></td>
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
                      <tr key={it.id} style={{ borderBottom: "1px solid #F7F2EA", background: podeSel && !itemSelecionado ? "#FBF7F1" : "#fff", opacity: podeSel && !itemSelecionado ? 0.55 : 1 }}>
                        {podeSel && (
                          <td style={{ padding: "8px 8px", textAlign: "center", verticalAlign: "top" }}>
                            <input type="checkbox" checked={!!itemSelecionado}
                              onChange={() => toggleItemSel(it.id)}
                              style={{ cursor: "pointer", width: 14, height: 14 }} />
                          </td>
                        )}
                        <td style={{ padding: "8px 16px 8px 32px", color: "#7E8388", fontSize: 11, fontFamily: "var(--fonte-numero)", verticalAlign: "top" }}>{it.tipo_origem}</td>
                        <td style={{ padding: "8px 16px", fontFamily: "var(--fonte-numero)", fontSize: 11, verticalAlign: "top" }}>{fmtDate(it.vencimento)}</td>
                        <td style={{ padding: "8px 16px", verticalAlign: "top" }}>
                          <div>{it.fornecedor && <span style={{ color: "#7E8388", marginRight: 6 }}>{it.fornecedor} ·</span>}{it.descricao}</div>
                          {obs && (
                            <div style={{ fontSize: 10, color: "#7E8388", marginTop: 3, fontStyle: "italic", lineHeight: 1.4 }}>
                              💬 {obs}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "8px 16px", verticalAlign: "top" }}><span style={{ background: "#F6ECD6", color: "#7A5A22", padding: "2px 7px", borderRadius: 3, fontSize: 10, fontFamily: "var(--fonte-numero)" }}>{it.categoria || "—"}</span></td>
                        <td style={{ padding: "8px 16px", textAlign: "right", fontFamily: "var(--fonte-numero)", fontWeight: 600, color: "#A93226", verticalAlign: "top" }}>{fmtFull(it.valor)}</td>
                        <td style={{ padding: "8px 8px", textAlign: "center", verticalAlign: "top" }}>
                          {src ? (
                            <button onClick={() => abrirPreview(it)}
                              title={temAnexo ? `Ver anexo (${src.anexo_nome})` : "Ver detalhes da fatura"}
                              style={{ background: temAnexo ? "#E0E9F0" : "#F7F2EA", color: temAnexo ? "#2C4A63" : "#7E8388", border: "none", padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "var(--fonte-numero)" }}>
                              {temAnexo ? "📎 Ver" : "ℹ️ Info"}
                            </button>
                          ) : (
                            <span style={{ color: "#C4C7CA", fontSize: 10 }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  });
                });
                return rows;
              })()}
              <tr style={{ background: "#091C2A", color: "#fff" }}>
                {(podeAprovarN1 || podeAprovarN2) && <td style={{ background: "#091C2A" }}></td>}
                <td colSpan={4} style={{ padding: "12px 16px", textAlign: "right", fontFamily: "var(--fonte-numero)", color: "#9DA2A6", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5 }}>Total Geral</td>
                <td style={{ padding: "12px 16px", textAlign: "right", fontFamily: "var(--fonte-numero)", fontSize: 15, fontWeight: 700, color: "#BAA685" }}>{fmtFull(mapa.total_valor)}</td>
                <td style={{ background: "#091C2A" }}></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Modal preview da fatura */}
      <PreviewFatura previewItem={previewItem} onFechar={() => setPreviewItem(null)} />
    </div>
  );
}
