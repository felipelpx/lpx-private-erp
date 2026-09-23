import { useState, useMemo } from "react";
import { EMPRESAS, agruparPorGrupo } from "./empresas.js";
import { useRecebiveis } from "./hooks.js";
import { fmtEUR, fmtEUR0, fmtData, fmtInt, fmtNum, parseNumero } from "./formato.js";

// ─────────────────────────────────────────────────────────────────────────────
// CONTAS A RECEBER
// A carteira de recebíveis previstos. É esta tabela que alimenta as entradas
// do Fluxo Futuro do Investor Relations.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS = ["Previsto", "Recebido", "Cancelado"];
const ESTILO = {
  "Previsto":  { bg: "#eff6ff", cor: "#2563eb", borda: "#bfdbfe" },
  "Recebido":  { bg: "#f0fdf4", cor: "#16a34a", borda: "#bbf7d0" },
  "Cancelado": { bg: "#f5f5f5", cor: "#999",    borda: "#e0e0e0" },
};

const VAZIO = { descricao: "", cliente: "", fracao: "", valor: "", data_prevista: "", status: "Previsto", obs: "" };

export default function ContasReceber({ currentUser, empresasVisiveis }) {
  const empresas = Array.isArray(empresasVisiveis) ? empresasVisiveis : EMPRESAS;
  const podeEditar = currentUser?.role === "admin" || currentUser?.role === "gestor";
  const { recebiveis, loading, addRecebivel, updateRecebivel, deleteRecebivel } = useRecebiveis();

  // Obrigatório escolher um projeto — olhar tudo junto não ajuda a decidir
  const [empSel, setEmpSel] = useState(empresas[0]?.id || "");
  const [fStatus, setFStatus] = useState("Todos");
  const [form, setForm] = useState(null);       // objeto em edição, ou null

  const ids = empresas.map(e => e.id);
  const lista = useMemo(() => (recebiveis || [])
    .filter(r => ids.includes(r.empresa))
    .filter(r => r.empresa === empSel)
    .filter(r => fStatus === "Todos" || (r.status || "Previsto") === fStatus)
    .sort((a, b) => (a.data_prevista || "9999").localeCompare(b.data_prevista || "9999")),
    [recebiveis, ids, empSel, fStatus]);

  const tot = {
    previsto: lista.filter(r => (r.status || "Previsto") === "Previsto").reduce((s, r) => s + (Number(r.valor) || 0), 0),
    recebido: lista.filter(r => r.status === "Recebido").reduce((s, r) => s + (Number(r.valor) || 0), 0),
  };

  const nomeEmp = (id) => empresas.find(e => e.id === id)?.nome || id;

  const guardar = async () => {
    if (!form.empresa) { alert("Escolhe o projeto."); return; }
    if (!form.data_prevista) { alert("Indica a data prevista."); return; }
    const linha = {
      empresa: form.empresa,
      projeto: empresas.find(e => e.id === form.empresa)?.nome || "",
      descricao: form.descricao || "",
      cliente: form.cliente || "",
      fracao: form.fracao || "",
      valor: parseNumero(form.valor),
      data_prevista: form.data_prevista,
      status: form.status || "Previsto",
      obs: form.obs || "",
    };
    const res = form.id
      ? await updateRecebivel(form.id, linha)
      : await addRecebivel({ ...linha, id: "rec_m_" + Date.now().toString(36) });
    if (res?.error) { alert("Erro ao guardar:\n\n" + (res.error.message || res.error)); return; }
    setForm(null);
  };

  const marcarRecebido = async (r) => {
    if (!confirm(`Marcar como recebido?\n\n${r.descricao || r.cliente || "—"}\n${fmtEUR(r.valor)}`)) return;
    const res = await updateRecebivel(r.id, { status: "Recebido" });
    if (res?.error) alert("Erro: " + (res.error.message || res.error));
  };

  const apagar = async (r) => {
    if (!confirm(`Eliminar este recebível?\n\n${r.descricao || "—"} · ${fmtEUR(r.valor)}`)) return;
    const res = await deleteRecebivel(r.id);
    if (res?.error) alert("Erro: " + (res.error.message || res.error));
  };

  const inputEstilo = { background: "#f8f8f8", border: "1px solid #e8e8e8", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: "15px 18px", borderTop: "3px solid #2563eb" }}>
          <div style={{ fontSize: 9.5, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace", marginBottom: 6 }}>A receber</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: "#2563eb", fontFamily: "monospace" }}>{fmtEUR0(tot.previsto)}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: "15px 18px", borderTop: "3px solid #16a34a" }}>
          <div style={{ fontSize: 9.5, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace", marginBottom: 6 }}>Já recebido</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: "#16a34a", fontFamily: "monospace" }}>{fmtEUR0(tot.recebido)}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: "15px 18px", borderTop: "3px solid #6B7C93" }}>
          <div style={{ fontSize: 9.5, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace", marginBottom: 6 }}>Linhas</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: "#1a1a2e", fontFamily: "monospace" }}>{fmtInt(lista.length)}</div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {["Todos", ...STATUS].map(s => (
          <button key={s} onClick={() => setFStatus(s)}
            style={{ background: fStatus === s ? "#1a1a2e" : "#f0f0f0", color: fStatus === s ? "#fff" : "#666", border: "none", padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer" }}>
            {s}
          </button>
        ))}
        <select value={empSel} onChange={e => setEmpSel(e.target.value)}
          style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 20, padding: "6px 14px", fontSize: 12, outline: "none", fontWeight: 600 }}>
          {agruparPorGrupo(empresas).map(b => (
            <optgroup key={b.grupo} label={b.info.nome}>
              {b.empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </optgroup>
          ))}
        </select>
        {podeEditar && (
          <button onClick={() => setForm({ ...VAZIO, empresa: empSel !== "todas" ? empSel : empresas[0]?.id || "" })}
            style={{ marginLeft: "auto", background: "#1a1a2e", color: "#fff", border: "none", padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Novo recebível
          </button>
        )}
      </div>

      {/* Tabela */}
      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8f9fc" }}>
                {[["Projeto", "left"], ["Descrição", "left"], ["Cliente", "left"], ["Fração", "center"],
                  ["Valor", "right"], ["Data prevista", "center"], ["Estado", "center"], ["", "center"]].map(([h, al]) => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: al, color: "#aaa", fontSize: 9, textTransform: "uppercase", fontFamily: "monospace", letterSpacing: "0.06em", borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#ccc" }}>A carregar…</td></tr>
              ) : lista.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#ccc" }}>Sem recebíveis registados.</td></tr>
              ) : lista.map(r => {
                const est = ESTILO[r.status || "Previsto"];
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid #fafafa" }}>
                    <td style={{ padding: "10px 12px", color: "#888", fontSize: 11 }}>{nomeEmp(r.empresa)}</td>
                    <td style={{ padding: "10px 12px", color: "#1a1a2e" }}>{r.descricao || "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#666" }}>{r.cliente || "—"}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "#1a1a2e" }}>{r.fracao || "—"}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#16a34a" }}>{fmtEUR(r.valor)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontFamily: "monospace", fontSize: 11, color: "#666" }}>{fmtData(r.data_prevista)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <span style={{ background: est.bg, color: est.cor, border: `1px solid ${est.borda}`, padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
                        {r.status || "Previsto"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {podeEditar && (
                        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                          {(r.status || "Previsto") === "Previsto" && (
                            <button onClick={() => marcarRecebido(r)} title="Marcar como recebido"
                              style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", fontWeight: 700 }}>✓€</button>
                          )}
                          <button onClick={() => setForm({ ...r, valor: String(r.valor ?? "") })} title="Editar"
                            style={{ background: "#f0f4ff", border: "none", color: "#4a6fa5", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>✎</button>
                          <button onClick={() => apagar(r)} title="Eliminar"
                            style={{ background: "#fff0f0", border: "none", color: "#dc2626", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>✕</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {form && (
        <div onClick={e => { if (e.target === e.currentTarget) setForm(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 12, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", fontFamily: "Georgia,serif" }}>
              {form.id ? "Editar recebível" : "Novo recebível"}
            </div>

            <div>
              <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>Projeto</div>
              <select value={form.empresa || ""} onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))} style={inputEstilo}>
                {agruparPorGrupo(empresas).map(b => (
                  <optgroup key={b.grupo} label={b.info.nome}>
                    {b.empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            {[["Descrição", "descricao", "text"], ["Cliente", "cliente", "text"],
              ["Fração", "fracao", "text"], ["Valor (€)", "valor", "text"],
              ["Data prevista", "data_prevista", "date"], ["Observações", "obs", "text"]].map(([rot, campo, tipo]) => (
              <div key={campo}>
                <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>{rot}</div>
                <input type={tipo} value={form[campo] ?? ""} onChange={e => setForm(f => ({ ...f, [campo]: e.target.value }))} style={inputEstilo} />
              </div>
            ))}

            <div>
              <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>Estado</div>
              <select value={form.status || "Previsto"} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputEstilo}>
                {STATUS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 6, justifyContent: "flex-end" }}>
              <button onClick={() => setForm(null)}
                style={{ background: "#f4f5f7", border: "none", color: "#666", padding: "10px 18px", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={guardar}
                style={{ background: "#1a1a2e", border: "none", color: "#fff", padding: "10px 22px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
