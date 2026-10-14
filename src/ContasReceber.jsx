import { useState, useMemo } from "react";
import { EMPRESAS, agruparPorGrupo } from "./empresas.js";
import { useRecebiveis, usePagamentosExtras } from "./hooks.js";
import { soReceita, ehFundingDeBanco } from "./vendas.js";
import { fmtEUR, fmtEUR0, fmtData, fmtInt, fmtNum, parseNumero } from "./formato.js";

// ─────────────────────────────────────────────────────────────────────────────
// CONTAS A RECEBER
// A carteira de recebíveis previstos. É esta tabela que alimenta as entradas
// do Fluxo Futuro do Investor Relations.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS = ["Previsto", "Recebido", "Cancelado"];
const ESTILO = {
  "Previsto":  { bg: "#EDF1F5", cor: "#1F3A52", borda: "#CBDAE5" },
  "Recebido":  { bg: "#EFF5F1", cor: "#1F7A54", borda: "#C9E3D5" },
  "Cancelado": { bg: "#F7F2EA", cor: "#8E9398",    borda: "#DFD5C8" },
};

const VAZIO = { descricao: "", cliente: "", fracao: "", valor: "", data_prevista: "",
                status: "Previsto", obs: "",
                // Fatura emitida: preenchidos, a linha passa a ser documento
                // fiscal e entra no apuramento de IVA (aba IVA).
                numero_fatura: "", data_fatura: "", nif: "",
                valor_base: "", taxa_iva: "", valor_iva: "" };

// Um recebível é uma previsão de entrada. Quando leva número e data de fatura,
// é também a fatura emitida ao cliente — e é só essa que conta para o IVA.
export const ehFaturaEmitida = (r) => !!(r && r.numero_fatura && r.data_fatura);

export default function ContasReceber({ currentUser, empresasVisiveis }) {
  const empresas = Array.isArray(empresasVisiveis) ? empresasVisiveis : EMPRESAS;
  const podeEditar = currentUser?.role === "admin" || currentUser?.role === "gestor";
  const { recebiveis, loading, addRecebivel, updateRecebivel, deleteRecebivel } = useRecebiveis();
  // As entradas previstas no Fluxo Futuro também são contas a receber.
  // Aparecem aqui em conjunto, marcadas com a origem, para a carteira ser uma só.
  const { pagamentos, updatePagamento } = usePagamentosExtras();

  // Obrigatório escolher um projeto — olhar tudo junto não ajuda a decidir
  const [empSel, setEmpSel] = useState(empresas[0]?.id || "");
  const [fStatus, setFStatus] = useState("Todos");
  const [form, setForm] = useState(null);       // objeto em edição, ou null

  const ids = empresas.map(e => e.id);

  // Entradas do Fluxo Futuro convertidas para o formato da carteira
  const doFluxo = useMemo(() => (pagamentos || [])
    .filter(p => p.tipo === "entrada")
    .filter(p => !["Convertida"].includes(p.status))
    .map(p => ({
      id: p.id,
      empresa: p.empresa,
      projeto: "",
      descricao: p.descricao || p.categoria || "Entrada prevista",
      categoria: p.categoria || "",
      cliente: "",
      fracao: "",
      valor: Math.abs(Number(p.valor) || 0),
      data_prevista: p.data_inicio,
      status: ["Paga", "Pago"].includes(p.status) ? "Recebido" : "Previsto",
      obs: p.obs || "",
      _origem: "fluxo",          // veio do Fluxo Futuro
      _raw: p,
    })), [pagamentos]);

  // Só faturas de RECEITA: comissões, fee de gestão, vendas. O desembolso do
  // banco entrava aqui como se fosse dinheiro ganho, e não é — é dívida. Uma
  // linha é funding pela rubrica, ou, nas antigas sem rubrica, pelo que a
  // descrição diz (ver src/vendas.js).
  const lista = useMemo(() => [...soReceita(recebiveis).map(r => ({ ...r, _origem: "carteira" })),
                               ...soReceita(doFluxo)]
    .filter(r => ids.includes(r.empresa))
    .filter(r => r.empresa === empSel)
    .filter(r => fStatus === "Todos" || (r.status || "Previsto") === fStatus)
    .sort((a, b) => (a.data_prevista || "9999").localeCompare(b.data_prevista || "9999")),
    [recebiveis, doFluxo, ids, empSel, fStatus]);

  // Quantas linhas ficaram de fora por serem funding, para o ecrã não
  // esconder nada em silêncio.
  const nFunding = useMemo(() => [...(recebiveis || []), ...doFluxo]
    .filter(r => r.empresa === empSel && ehFundingDeBanco(r)).length,
    [recebiveis, doFluxo, empSel]);

  const tot = {
    previsto: lista.filter(r => (r.status || "Previsto") === "Previsto").reduce((s, r) => s + (Number(r.valor) || 0), 0),
    recebido: lista.filter(r => r.status === "Recebido").reduce((s, r) => s + (Number(r.valor) || 0), 0),
  };

  const nomeEmp = (id) => empresas.find(e => e.id === id)?.nome || id;

  const guardar = async () => {
    if (!form.empresa) { alert("Escolhe o projeto."); return; }
    if (!form.data_prevista) { alert("Indica a data prevista."); return; }
    if (form.numero_fatura && !form.data_fatura) {
      alert("Uma fatura emitida precisa da data de emissão — é ela que define o trimestre de IVA.");
      return;
    }
    if (form.data_fatura && !form.numero_fatura) {
      alert("Indica o número da fatura, ou apaga a data de emissão se isto for só uma previsão.");
      return;
    }
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
      numero_fatura: form.numero_fatura || null,
      data_fatura: form.data_fatura || null,
      nif: form.nif || null,
      valor_base: form.valor_base !== "" ? parseNumero(form.valor_base) : null,
      taxa_iva:   form.taxa_iva   !== "" ? parseNumero(form.taxa_iva)   : null,
      valor_iva:  form.valor_iva  !== "" ? parseNumero(form.valor_iva)  : null,
      iva_estimado: false,
    };
    const res = form.id
      ? await updateRecebivel(form.id, linha)
      : await addRecebivel({ ...linha, id: "rec_m_" + Date.now().toString(36) });
    if (res?.error) { alert("Erro ao guardar:\n\n" + (res.error.message || res.error)); return; }
    setForm(null);
  };

  const marcarRecebido = async (r) => {
    if (!confirm(`Marcar como recebido?\n\n${r.descricao || r.cliente || "—"}\n${fmtEUR(r.valor)}`)) return;
    const res = r._origem === "fluxo"
      ? await updatePagamento(r.id, { ...r._raw, status: "Paga" })
      : await updateRecebivel(r.id, { status: "Recebido" });
    if (res?.error) alert("Erro: " + (res.error.message || res.error));
  };

  const apagar = async (r) => {
    if (r._origem === "fluxo") {
      alert("Esta entrada veio do Fluxo Futuro.\n\nElimina-a lá, no separador Fluxo Futuro, para não ficarem os dois ecrãs em desacordo.");
      return;
    }
    if (!confirm(`Eliminar este recebível?\n\n${r.descricao || "—"} · ${fmtEUR(r.valor)}`)) return;
    const res = await deleteRecebivel(r.id);
    if (res?.error) alert("Erro: " + (res.error.message || res.error));
  };

  const inputEstilo = { background: "#F9F5EF", border: "1px solid #E3D9CC", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div style={{ background: "#fff", border: "1px solid #E7DED2", borderRadius: 12, padding: "15px 18px", borderTop: "3px solid #1F3A52" }}>
          <div style={{ fontSize: 9.5, color: "#9DA2A6", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--fonte-numero)", marginBottom: 6 }}>A receber</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: "#1F3A52", fontFamily: "var(--fonte-numero)" }}>{fmtEUR0(tot.previsto)}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E7DED2", borderRadius: 12, padding: "15px 18px", borderTop: "3px solid #1F7A54" }}>
          <div style={{ fontSize: 9.5, color: "#9DA2A6", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--fonte-numero)", marginBottom: 6 }}>Já recebido</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: "#1F7A54", fontFamily: "var(--fonte-numero)" }}>{fmtEUR0(tot.recebido)}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E7DED2", borderRadius: 12, padding: "15px 18px", borderTop: "3px solid #BAA685" }}>
          <div style={{ fontSize: 9.5, color: "#9DA2A6", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--fonte-numero)", marginBottom: 6 }}>Linhas</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: "#091C2A", fontFamily: "var(--fonte-numero)" }}>{fmtInt(lista.length)}</div>
          {nFunding > 0 && (
            <div style={{ fontSize: 9.5, color: "#9DA2A6", marginTop: 4, lineHeight: 1.4 }}>
              {fmtInt(nFunding)} de funding do banco fora desta lista
            </div>
          )}
        </div>
      </div>

      {nFunding > 0 && (
        <div style={{ background: "#FAF6F0", border: "1px solid #E7DED2", borderRadius: 10,
                      padding: "9px 14px", fontSize: 11.5, color: "#7E8388", lineHeight: 1.6 }}>
          Esta carteira é de <strong>faturas de receita</strong> — comissões, fee de gestão,
          vendas. O desembolso do banco não é receita, é dívida: fica de fora, e aparece
          como entrada no Fluxo Futuro, ao lado da despesa que financia.
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {["Todos", ...STATUS].map(s => (
          <button key={s} onClick={() => setFStatus(s)}
            style={{ background: fStatus === s ? "#091C2A" : "#E7DED2", color: fStatus === s ? "#fff" : "#5C6166", border: "none", padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer" }}>
            {s}
          </button>
        ))}
        <select value={empSel} onChange={e => setEmpSel(e.target.value)}
          style={{ background: "#fff", border: "1px solid #D8CCBB", borderRadius: 20, padding: "6px 14px", fontSize: 12, outline: "none", fontWeight: 600 }}>
          {agruparPorGrupo(empresas).map(b => (
            <optgroup key={b.grupo} label={b.info.nome}>
              {b.empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </optgroup>
          ))}
        </select>
        {podeEditar && (
          <button onClick={() => setForm({ ...VAZIO, empresa: empSel !== "todas" ? empSel : empresas[0]?.id || "" })}
            style={{ marginLeft: "auto", background: "#091C2A", color: "#fff", border: "none", padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Novo recebível
          </button>
        )}
      </div>

      {/* Tabela */}
      <div style={{ background: "#fff", border: "1px solid #E7DED2", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#FAF6F0" }}>
                {[["Projeto", "left"], ["Descrição", "left"], ["Origem", "center"], ["Cliente", "left"], ["Fração", "center"],
                  ["Valor", "right"], ["Data prevista", "center"], ["Estado", "center"], ["", "center"]].map(([h, al]) => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: al, color: "#9DA2A6", fontSize: 9, textTransform: "uppercase", fontFamily: "var(--fonte-numero)", letterSpacing: "0.06em", borderBottom: "1px solid #E7DED2", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "#C4C7CA" }}>A carregar…</td></tr>
              ) : lista.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "#C4C7CA" }}>Sem recebíveis registados.</td></tr>
              ) : lista.map(r => {
                const est = ESTILO[r.status || "Previsto"];
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid #FBF7F1" }}>
                    <td style={{ padding: "10px 12px", color: "#7E8388", fontSize: 11 }}>{nomeEmp(r.empresa)}</td>
                    <td style={{ padding: "10px 12px", color: "#091C2A" }}>
                      {ehFaturaEmitida(r) && (
                        <span title={`Fatura ${r.numero_fatura}, emitida a ${fmtData(r.data_fatura)} — entra no apuramento de IVA`}
                          style={{ background: "#EDF1F5", color: "#2C4A63", fontSize: 9, fontFamily: "var(--fonte-numero)",
                                   fontWeight: 700, padding: "1px 6px", borderRadius: 3, marginRight: 6 }}>
                          {r.numero_fatura}
                        </span>
                      )}
                      {r.descricao || "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <span title={r._origem === "fluxo" ? "Entrada prevista no Fluxo Futuro" : "Registada na carteira de Contas a Receber"}
                        style={{ background: r._origem === "fluxo" ? "#F6ECD6" : "#eef1f5",
                                 color: r._origem === "fluxo" ? "#7A5A22" : "#BAA685",
                                 padding: "2px 8px", borderRadius: 20, fontSize: 9, fontWeight: 700,
                                 fontFamily: "var(--fonte-numero)", letterSpacing: "0.04em" }}>
                        {r._origem === "fluxo" ? "FLUXO" : "CARTEIRA"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#5C6166" }}>{r.cliente || "—"}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "#091C2A" }}>{r.fracao || "—"}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "var(--fonte-numero)", fontWeight: 700, color: "#1F7A54" }}>{fmtEUR(r.valor)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontFamily: "var(--fonte-numero)", fontSize: 11, color: "#5C6166" }}>{fmtData(r.data_prevista)}</td>
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
                              style={{ background: "#EFF5F1", border: "1px solid #C9E3D5", color: "#1F7A54", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", fontWeight: 700 }}>✓€</button>
                          )}
                          {r._origem === "fluxo"
                            ? <span title="Editar no separador Fluxo Futuro"
                                style={{ color: "#C4C7CA", padding: "3px 8px", fontSize: 10 }}>✎</span>
                            : <button onClick={() => setForm({ ...r, valor: String(r.valor ?? "") })} title="Editar"
                                style={{ background: "#EDF1F5", border: "none", color: "#2C4A63", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>✎</button>}
                          <button onClick={() => apagar(r)} title={r._origem === "fluxo" ? "Eliminar no Fluxo Futuro" : "Eliminar"}
                            style={{ background: "#FBEDEB", border: "none", color: "#A93226", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>✕</button>
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
            <div style={{ fontSize: 16, fontWeight: 700, color: "#091C2A", fontFamily: "var(--fonte-titulo)" }}>
              {form.id ? "Editar recebível" : "Novo recebível"}
            </div>

            <div>
              <div style={{ fontSize: 9, color: "#9DA2A6", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", marginBottom: 4 }}>Projeto</div>
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
                <div style={{ fontSize: 9, color: "#9DA2A6", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", marginBottom: 4 }}>{rot}</div>
                <input type={tipo} value={form[campo] ?? ""} onChange={e => setForm(f => ({ ...f, [campo]: e.target.value }))} style={inputEstilo} />
              </div>
            ))}

            <div>
              <div style={{ fontSize: 9, color: "#9DA2A6", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", marginBottom: 4 }}>Estado</div>
              <select value={form.status || "Previsto"} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputEstilo}>
                {STATUS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            {/* ── Fatura emitida ─────────────────────────────────────────────
                Opcional: sem isto a linha é só uma previsão de entrada. Com o
                número e a data de emissão preenchidos passa a ser documento
                fiscal e entra no apuramento de IVA, no trimestre da EMISSÃO —
                independentemente de quando o dinheiro entrar. */}
            <div style={{ borderTop: "1px solid #E7DED2", paddingTop: 12, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#091C2A" }}>Fatura emitida ao cliente</div>
              <div style={{ fontSize: 10.5, color: "#9DA2A6", marginTop: 3, lineHeight: 1.5 }}>
                Preenche só se já emitiste fatura. O IVA conta no trimestre da data de
                emissão, mesmo que o recebimento seja noutro.
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["N.º da fatura", "numero_fatura", "text"], ["Data de emissão", "data_fatura", "date"],
                ["NIF do cliente", "nif", "text"], ["Valor sem IVA (€)", "valor_base", "text"],
                ["Taxa de IVA (%)", "taxa_iva", "text"], ["IVA (€)", "valor_iva", "text"]].map(([rot, campo, tipo]) => (
                <div key={campo}>
                  <div style={{ fontSize: 9, color: "#9DA2A6", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", marginBottom: 4 }}>{rot}</div>
                  <input type={tipo} value={form[campo] ?? ""}
                    onChange={e => {
                      const v = e.target.value;
                      setForm(f => {
                        const n = { ...f, [campo]: v };
                        // Base e taxa preenchidas calculam o IVA, desde que
                        // ninguém o tenha escrito à mão: o que vem na fatura
                        // manda sempre sobre o que nós deduzimos.
                        if ((campo === "valor_base" || campo === "taxa_iva") && !f._ivaManual) {
                          const b = parseNumero(campo === "valor_base" ? v : f.valor_base);
                          const t = parseNumero(campo === "taxa_iva" ? v : f.taxa_iva);
                          if (b && t) n.valor_iva = String(Math.round(b * t) / 100);
                        }
                        if (campo === "valor_iva") n._ivaManual = v !== "";
                        return n;
                      });
                    }}
                    style={inputEstilo} />
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 6, justifyContent: "flex-end" }}>
              <button onClick={() => setForm(null)}
                style={{ background: "#F6F0E8", border: "none", color: "#5C6166", padding: "10px 18px", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={guardar}
                style={{ background: "#091C2A", border: "none", color: "#fff", padding: "10px 22px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
