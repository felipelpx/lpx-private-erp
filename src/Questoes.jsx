import React, { useState, useMemo, useEffect } from "react";
import { EMPRESAS } from "./empresas.js";
import { fmtEUR, fmtData, fmtDataHora } from "./formato.js";

// ─────────────────────────────────────────────────────────────────────────────
// QUESTIONAMENTOS
//
// O investidor levanta uma dúvida sobre uma linha do extrato; a pergunta fica
// agarrada ao movimento (data, descrição e valor ficam copiados, para a
// pergunta continuar legível mesmo que o extrato seja reimportado).
// Admin e gestor veem todas e respondem; o investidor vê só as suas.
// ─────────────────────────────────────────────────────────────────────────────

const nomeEmpresa = (id) => EMPRESAS.find(e => e.id === id)?.nome || id || "—";

export const ESTADO_QUESTAO = {
  aberto:     { txt: "Por responder", cor: "#b45309", fundo: "#fef3c7" },
  respondido: { txt: "Respondida",    cor: "#15803d", fundo: "#f0fdf4" },
  fechado:    { txt: "Fechada",       cor: "#64748b", fundo: "#f1f5f9" },
};

export const porLer = (questoes, currentUser) => {
  if (!currentUser || !["admin", "gestor"].includes(currentUser.role)) return 0;
  return (questoes || []).filter(q =>
    q.status !== "fechado" && !(Array.isArray(q.lido_por) ? q.lido_por : []).includes(currentUser.id)
  ).length;
};

// ─── Caixa de texto para o investidor colocar a dúvida ───────────────────────
export function ModalQuestionar({ movimento, empresa, banco, contaId, currentUser, existentes = [], onClose, onEnviar }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const enviar = async () => {
    const t = texto.trim();
    if (!t) { setErro("Escreve a tua dúvida antes de enviar."); return; }
    setEnviando(true); setErro("");
    const { error } = await onEnviar({
      movimento_id: movimento?.id || null,
      conta_id: contaId || null,
      empresa,
      banco: banco || null,
      mov_data: movimento?.data || movimento?.data_str || null,
      mov_descricao: movimento?.movimento || "",
      mov_valor: movimento?.valor ?? null,
      autor_id: currentUser.id,
      autor_nome: currentUser.nome,
      autor_email: currentUser.email,
      texto: t,
      status: "aberto",
    });
    setEnviando(false);
    if (error) {
      setErro(/relation .*questionamentos.* does not exist|schema cache/i.test(error.message || "")
        ? "A tabela de questionamentos ainda não existe na base de dados. Corre a migração v11 no Supabase."
        : "Não foi possível enviar: " + (error.message || error));
      return;
    }
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,10,15,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", fontFamily: "Georgia,serif" }}>
          Questionar lançamento
        </div>

        {/* O lançamento em causa */}
        <div style={{ background: "#f8f9fc", borderRadius: 10, padding: "12px 14px", marginTop: 14, fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#888", fontFamily: "monospace" }}>
              {fmtData(movimento?.data || movimento?.data_str) || "—"}
            </span>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: (movimento?.valor ?? 0) < 0 ? "#dc2626" : "#16a34a" }}>
              {fmtEUR(movimento?.valor ?? 0)}
            </span>
          </div>
          <div style={{ color: "#333", marginTop: 6, lineHeight: 1.4 }}>{movimento?.movimento || "—"}</div>
          <div style={{ color: "#aaa", marginTop: 6, fontSize: 10.5, fontFamily: "monospace" }}>
            {nomeEmpresa(empresa)}{banco ? ` · ${banco}` : ""}
          </div>
        </div>

        {/* Perguntas anteriores sobre o mesmo lançamento */}
        {existentes.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
              Já perguntaste sobre este lançamento
            </div>
            {existentes.map(q => (
              <div key={q.id} style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: "8px 11px", marginBottom: 6 }}>
                <div style={{ fontSize: 12, color: "#333" }}>{q.texto}</div>
                {q.resposta && (
                  <div style={{ fontSize: 11.5, color: "#15803d", marginTop: 6, borderLeft: "2px solid #86efac", paddingLeft: 8 }}>
                    {q.resposta}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, color: "#888", marginTop: 16, marginBottom: 6 }}>A tua dúvida</div>
        <textarea autoFocus value={texto} onChange={e => setTexto(e.target.value)} rows={5}
          placeholder="Ex.: a que fase da obra corresponde este pagamento?"
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e8e8e8", borderRadius: 9, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />

        {erro && <div style={{ color: "#dc2626", fontSize: 11.5, marginTop: 8 }}>{erro}</div>}

        <div style={{ fontSize: 10.5, color: "#aaa", marginTop: 10 }}>
          A equipa de gestão é notificada assim que enviares.
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #e8e8e8", borderRadius: 8, padding: "8px 16px", fontSize: 12, color: "#777", cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={enviar} disabled={enviando}
            style={{ background: enviando ? "#c9cdd4" : "#1a1a2e", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 12, fontWeight: 600, cursor: enviando ? "default" : "pointer" }}>
            {enviando ? "A enviar..." : "Enviar questão"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Pede ao browser autorização para mostrar avisos no ecrã, mesmo com o ERP
// noutro separador. Sem autorização, o aviso aparece à mesma dentro da app.
function AtivarAvisos() {
  const suportado = typeof window !== "undefined" && typeof Notification !== "undefined";
  const [estado, setEstado] = useState(suportado ? Notification.permission : "unsupported");
  if (!suportado || estado !== "default") return null;
  return (
    <button
      onClick={() => { try { Notification.requestPermission().then(setEstado); } catch { setEstado("denied"); } }}
      title="Receber aviso do sistema quando entrar uma questão nova"
      style={{ background: "#f0f4ff", border: "none", color: "#4a6fa5", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
      🔔 Ativar avisos
    </button>
  );
}

// ─── Separador "Questões" ────────────────────────────────────────────────────
export default function Questoes({ currentUser, questionamentos, loading, error, updateQuestionamento, deleteQuestionamento, marcarLida, empresasVisiveis = [] }) {
  const gestor = currentUser?.role === "admin" || currentUser?.role === "gestor";
  const [filtro, setFiltro] = useState("abertas");
  const [empFiltro, setEmpFiltro] = useState("todas");
  const [aResponder, setAResponder] = useState(null);
  const [rascunho, setRascunho] = useState("");

  const lista = useMemo(() => {
    let l = questionamentos || [];
    if (filtro === "abertas") l = l.filter(q => q.status === "aberto");
    if (filtro === "respondidas") l = l.filter(q => q.status === "respondido");
    if (filtro === "fechadas") l = l.filter(q => q.status === "fechado");
    if (empFiltro !== "todas") l = l.filter(q => q.empresa === empFiltro);
    return l;
  }, [questionamentos, filtro, empFiltro]);

  // Ao abrir o separador, o gestor deixa de ter as questões visíveis como
  // "por ler" — é isto que faz o contador do sino baixar.
  useEffect(() => {
    if (!gestor) return;
    lista.filter(q => !(Array.isArray(q.lido_por) ? q.lido_por : []).includes(currentUser.id))
         .forEach(q => marcarLida(q, currentUser.id));
  }, [gestor, lista, currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const responder = async (q) => {
    const t = rascunho.trim();
    if (!t) return;
    const { error } = await updateQuestionamento(q.id, {
      resposta: t, status: "respondido",
      respondido_por: currentUser.nome, respondido_em: new Date().toISOString(),
    });
    if (error) { alert("Não foi possível guardar a resposta: " + (error.message || error)); return; }
    setAResponder(null); setRascunho("");
  };

  const tabelaEmFalta = /relation .*questionamentos.* does not exist|schema cache/i.test(error || "");

  if (tabelaEmFalta) return (
    <div style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 12, padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 30, marginBottom: 10 }}>🗂️</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>Falta a tabela de questionamentos</div>
      <div style={{ color: "#888", fontSize: 12.5, marginTop: 8, maxWidth: 480, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
        Corre <code style={{ background: "#f4f5f7", padding: "1px 5px", borderRadius: 4 }}>supabase/migracao-v11-questionamentos.sql</code> no
        SQL Editor do Supabase e recarrega esta página.
      </div>
    </div>
  );

  const contagens = {
    abertas: (questionamentos || []).filter(q => q.status === "aberto").length,
    respondidas: (questionamentos || []).filter(q => q.status === "respondido").length,
    fechadas: (questionamentos || []).filter(q => q.status === "fechado").length,
    todas: (questionamentos || []).length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 14, padding: "16px 20px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", fontFamily: "Georgia,serif" }}>
            {gestor ? "Questões dos investidores" : "As minhas questões"}
          </div>
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>
            {gestor
              ? "Dúvidas levantadas nos extratos. Responde aqui e o investidor vê a resposta na mesma linha."
              : "Dúvidas que colocaste nos extratos e as respostas da gestão."}
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {gestor && <AtivarAvisos />}
          {empresasVisiveis.length > 1 && (
            <select value={empFiltro} onChange={e => setEmpFiltro(e.target.value)}
              style={{ border: "1px solid #e8e8e8", borderRadius: 8, padding: "6px 10px", fontSize: 11.5, color: "#555" }}>
              <option value="todas">Todas as empresas</option>
              {empresasVisiveis.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          )}
          <div style={{ display: "flex", background: "#f4f5f7", borderRadius: 8, padding: 2, gap: 2 }}>
            {[["abertas", "Por responder"], ["respondidas", "Respondidas"], ["fechadas", "Fechadas"], ["todas", "Todas"]].map(([k, label]) => (
              <button key={k} onClick={() => setFiltro(k)}
                style={{ background: filtro === k ? "#1a1a2e" : "transparent", color: filtro === k ? "#fff" : "#777", border: "none", padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                {label} <span style={{ opacity: 0.65 }}>{contagens[k]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div style={{ padding: 30, textAlign: "center", color: "#ccc", fontSize: 12 }}>A carregar...</div>}

      {!loading && lista.length === 0 && (
        <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 14, padding: 40, textAlign: "center", color: "#bbb", fontSize: 12.5 }}>
          {gestor ? "Nenhuma questão neste filtro." : "Ainda não colocaste nenhuma questão. Abre a aba Extratos e usa o botão “?” na linha que queres esclarecer."}
        </div>
      )}

      {lista.map(q => {
        const est = ESTADO_QUESTAO[q.status] || ESTADO_QUESTAO.aberto;
        const naoLida = gestor && !(Array.isArray(q.lido_por) ? q.lido_por : []).includes(currentUser.id);
        return (
          <div key={q.id} style={{ background: "#fff", border: `1px solid ${naoLida ? "#fde68a" : "#f0f0f0"}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <span style={{ background: est.fundo, color: est.cor, borderRadius: 20, padding: "3px 11px", fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>
                {est.txt}
              </span>
              <span style={{ fontSize: 11.5, color: "#555", fontWeight: 600 }}>{nomeEmpresa(q.empresa)}</span>
              {q.banco && <span style={{ fontSize: 10.5, color: "#aaa", fontFamily: "monospace" }}>{q.banco}</span>}
              <span style={{ marginLeft: "auto", fontSize: 10.5, color: "#bbb", fontFamily: "monospace" }}>
                {fmtDataHora(q.created_at)}
              </span>
            </div>

            {/* Lançamento questionado */}
            <div style={{ background: "#f8f9fc", borderRadius: 9, padding: "9px 12px", marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 11.5 }}>
              <span style={{ color: "#888", fontFamily: "monospace" }}>{fmtData(q.mov_data) || "—"}</span>
              <span style={{ color: "#333", flex: 1, minWidth: 180 }}>{q.mov_descricao || "—"}</span>
              <span style={{ fontFamily: "monospace", fontWeight: 700, color: (q.mov_valor ?? 0) < 0 ? "#dc2626" : "#16a34a" }}>
                {q.mov_valor != null ? fmtEUR(q.mov_valor) : "—"}
              </span>
            </div>

            <div style={{ marginTop: 12, fontSize: 13, color: "#1a1a2e", lineHeight: 1.55 }}>{q.texto}</div>
            <div style={{ fontSize: 10.5, color: "#aaa", marginTop: 5 }}>
              {q.autor_nome || q.autor_email || "Investidor"}
            </div>

            {q.resposta && (
              <div style={{ marginTop: 12, borderLeft: "3px solid #86efac", paddingLeft: 12 }}>
                <div style={{ fontSize: 12.5, color: "#1a1a2e", lineHeight: 1.55 }}>{q.resposta}</div>
                <div style={{ fontSize: 10.5, color: "#aaa", marginTop: 4 }}>
                  {q.respondido_por || "Gestão"} · {fmtDataHora(q.respondido_em)}
                </div>
              </div>
            )}

            {gestor && (
              aResponder === q.id ? (
                <div style={{ marginTop: 12 }}>
                  <textarea autoFocus rows={3} value={rascunho} onChange={e => setRascunho(e.target.value)}
                    placeholder="Resposta ao investidor..."
                    style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e8e8e8", borderRadius: 9, padding: "9px 11px", fontSize: 12.5, fontFamily: "inherit", resize: "vertical" }} />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                    <button onClick={() => { setAResponder(null); setRascunho(""); }}
                      style={{ background: "none", border: "1px solid #e8e8e8", borderRadius: 7, padding: "6px 14px", fontSize: 11.5, color: "#777", cursor: "pointer" }}>Cancelar</button>
                    <button onClick={() => responder(q)}
                      style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 7, padding: "6px 16px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Guardar resposta</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
                  <button onClick={() => { setAResponder(q.id); setRascunho(q.resposta || ""); }}
                    style={{ background: "#f0f4ff", border: "none", color: "#4a6fa5", borderRadius: 7, padding: "5px 13px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    {q.resposta ? "Editar resposta" : "Responder"}
                  </button>
                  {q.status !== "fechado" && (
                    <button onClick={() => updateQuestionamento(q.id, { status: "fechado" })}
                      style={{ background: "#f4f5f7", border: "none", color: "#64748b", borderRadius: 7, padding: "5px 13px", fontSize: 11, cursor: "pointer" }}>Fechar</button>
                  )}
                  {q.status === "fechado" && (
                    <button onClick={() => updateQuestionamento(q.id, { status: q.resposta ? "respondido" : "aberto" })}
                      style={{ background: "#f4f5f7", border: "none", color: "#64748b", borderRadius: 7, padding: "5px 13px", fontSize: 11, cursor: "pointer" }}>Reabrir</button>
                  )}
                  <button onClick={() => { if (window.confirm("Eliminar esta questão? A ação não pode ser desfeita.")) deleteQuestionamento(q.id); }}
                    style={{ background: "none", border: "1px solid #f0f0f0", color: "#c9cdd4", borderRadius: 7, padding: "5px 11px", fontSize: 11, cursor: "pointer" }}>Eliminar</button>
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
