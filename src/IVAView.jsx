import React, { useState, useMemo, useEffect } from "react";
import { EMPRESAS, agruparPorGrupo } from "./empresas.js";
import { useIvaDocumentos, useIvaPagamentos } from "./hooks.js";
import { fmtEUR, fmtData, fmtNum } from "./formato.js";
import {
  apurar, porMes, dataLimite, estadoTrimestre, ESTADOS_TRIMESTRE,
  proximoVencimento, rotuloTrimestre, TRIMESTRES, NOMES_MES, hojeISO, arred2,
} from "./iva.js";

// ─────────────────────────────────────────────────────────────────────────────
// APURAMENTO TRIMESTRAL DE IVA
//
// Ecrã de leitura: não tem lançamentos próprios nem valores escritos à mão.
// Tudo vem das faturas que já estão no ERP, pela view vw_iva_documentos, e
// atualiza-se sozinho quando uma fatura entra, muda ou é apagada.
//
// A única coisa que se grava aqui é o pagamento do IVA ao Estado.
// ─────────────────────────────────────────────────────────────────────────────

const COR = { tinta: "#1a1a2e", cinza: "#8a8f99", linha: "#f0f0f0",
              pagar: "#b45309", abater: "#4a6fa5", credito: "#15803d", alerta: "#dc2626" };

const MEMORIA_EMPRESA = "lpx_iva_empresa";

const Cartao = ({ children, cor }) => (
  <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12,
                padding: "14px 18px", borderTop: `3px solid ${cor || "#e8e8e8"}` }}>
    {children}
  </div>
);

const Rotulo = ({ children, dica }) => (
  <div title={dica} style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase",
                             fontFamily: "monospace", letterSpacing: "0.07em", marginBottom: 5 }}>
    {children}
  </div>
);

const Valor = ({ children, cor, tamanho = 18 }) => (
  <div style={{ fontSize: tamanho, fontWeight: 700, color: cor || COR.tinta, fontFamily: "monospace" }}>
    {children}
  </div>
);

const th = { padding: "9px 12px", textAlign: "left", color: "#aaa", fontSize: 10,
             letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "monospace",
             borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" };
const td = { padding: "9px 12px", fontSize: 12, color: "#333" };
const tdNum = { ...td, fontFamily: "monospace", textAlign: "right", whiteSpace: "nowrap" };

// Valor monetário: negativo a vermelho, como pedido.
const Euro = ({ v, forte, zeroTraco = true }) => {
  const n = Number(v) || 0;
  if (zeroTraco && Math.abs(n) < 0.005) return <span style={{ color: "#ddd" }}>—</span>;
  return <span style={{ color: n < 0 ? COR.alerta : COR.tinta, fontWeight: forte ? 700 : 400 }}>{fmtEUR(n)}</span>;
};

const Estado = ({ chave }) => {
  const e = ESTADOS_TRIMESTRE[chave] || ESTADOS_TRIMESTRE.curso;
  return <span style={{ background: e.fundo, color: e.cor, fontSize: 10, fontFamily: "monospace",
                        fontWeight: 700, padding: "2px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>{e.txt}</span>;
};

const nomeEmpresa = (id) => EMPRESAS.find(e => e.id === id)?.nome || id || "—";

// ─── Lista de faturas de um mês ──────────────────────────────────────────────
function BlocoFaturas({ docs, tipo, titulo, cor, mostrarEmpresa }) {
  const linhas = docs.filter(d => d.tipo === tipo);
  const soma = arred2(linhas.reduce((s, d) => s + d.iva, 0));
  if (!linhas.length) {
    return (
      <div style={{ padding: "8px 0 12px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: cor, marginBottom: 4 }}>{titulo}</div>
        <div style={{ fontSize: 11.5, color: "#ccc" }}>Nenhuma fatura.</div>
      </div>
    );
  }
  return (
    <div style={{ padding: "8px 0 12px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: cor, marginBottom: 6 }}>{titulo}</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Data", ...(mostrarEmpresa ? ["Empresa"] : []),
              tipo === "cliente" ? "Cliente" : "Fornecedor", "N.º", "Sem IVA", "IVA", "Estado"]
              .map((h, i) => (
                <th key={h} style={{ ...th, textAlign: i >= (mostrarEmpresa ? 4 : 3) && i <= (mostrarEmpresa ? 5 : 4) ? "right" : "left",
                                     fontSize: 9, padding: "6px 10px" }}>{h}</th>
              ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map(d => (
            <tr key={d.id} style={{ borderBottom: "1px solid #fafafa" }}>
              <td style={{ ...td, fontFamily: "monospace", fontSize: 11, color: "#888", padding: "7px 10px" }}>{fmtData(d.data_fatura)}</td>
              {mostrarEmpresa && <td style={{ ...td, fontSize: 11, padding: "7px 10px" }}>{nomeEmpresa(d.empresa)}</td>}
              <td style={{ ...td, padding: "7px 10px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={d.entidade}>{d.entidade}</td>
              <td style={{ ...td, fontFamily: "monospace", fontSize: 11, color: "#888", padding: "7px 10px" }}>{d.documento}</td>
              <td style={{ ...tdNum, padding: "7px 10px" }}>{fmtEUR(d.valor_base)}</td>
              <td style={{ ...tdNum, padding: "7px 10px", fontWeight: 700 }}>
                <Euro v={d.iva} forte />
                {d.estimado && (
                  <span title="O IVA não foi lido da fatura: foi deduzido a partir do total, à taxa normal. Confere e corrige na fatura."
                    style={{ marginLeft: 6, background: "#fef3c7", color: "#b45309", fontSize: 8.5,
                             fontFamily: "monospace", fontWeight: 700, padding: "1px 5px", borderRadius: 3 }}>calculado</span>
                )}
              </td>
              <td style={{ ...td, fontSize: 10.5, color: "#aaa", padding: "7px 10px" }}
                  title="Informativo: o estado de pagamento não entra no apuramento">{d.estado || "—"}</td>
            </tr>
          ))}
          <tr style={{ background: "#fafbfc" }}>
            <td colSpan={mostrarEmpresa ? 5 : 4} style={{ ...td, padding: "7px 10px", fontWeight: 700, fontSize: 11 }}>
              Soma
            </td>
            <td style={{ ...tdNum, padding: "7px 10px", fontWeight: 800 }}><Euro v={soma} forte zeroTraco={false} /></td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Um mês, expansível até às faturas ───────────────────────────────────────
function LinhaMes({ m, aberto, onAlternar, mostrarEmpresa, recuo = 28 }) {
  return (
    <>
      <tr onClick={m.semFaturas ? undefined : onAlternar}
          style={{ borderBottom: "1px solid #fafafa", cursor: m.semFaturas ? "default" : "pointer",
                   background: aberto ? "#f8f9ff" : "#fff" }}>
        <td style={{ ...td, paddingLeft: recuo, color: m.semFaturas ? "#bbb" : COR.tinta }}>
          {m.semFaturas ? "   " : (aberto ? "▼ " : "▶ ")}
          {NOMES_MES[m.mes - 1]}
          {m.semFaturas && <span style={{ fontSize: 10.5, color: "#ccc", marginLeft: 8 }}>Sem faturas</span>}
        </td>
        <td style={tdNum}><Euro v={m.aPagar} /></td>
        <td style={tdNum}><Euro v={m.aAbater} /></td>
        <td style={tdNum}><Euro v={m.saldo} forte /></td>
        <td colSpan={3} />
      </tr>
      {aberto && !m.semFaturas && (
        <tr>
          <td colSpan={7} style={{ padding: "4px 20px 10px", background: "#fcfcfd" }}>
            <BlocoFaturas docs={m.docs} tipo="cliente" titulo="Faturas emitidas a clientes (IVA a pagar)"
                          cor={COR.pagar} mostrarEmpresa={mostrarEmpresa} />
            <BlocoFaturas docs={m.docs} tipo="fornecedor" titulo="Faturas de fornecedores (IVA a abater)"
                          cor={COR.abater} mostrarEmpresa={mostrarEmpresa} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Ecrã ────────────────────────────────────────────────────────────────────
export default function IVAView({ currentUser, empresasVisiveis = [], onCriarPrevisao }) {
  const { documentos, loading, error } = useIvaDocumentos();
  const { pagamentos, marcarPago, anularPagamento } = useIvaPagamentos();

  const empresas = empresasVisiveis.length ? empresasVisiveis : EMPRESAS;
  const podeEditar = currentUser?.role === "admin" || currentUser?.role === "gestor";

  const [empSel, setEmpSel] = useState(() => {
    try { return localStorage.getItem(MEMORIA_EMPRESA) || "todas"; } catch { return "todas"; }
  });
  useEffect(() => { try { localStorage.setItem(MEMORIA_EMPRESA, empSel); } catch {} }, [empSel]);
  // Uma empresa memorizada que o utilizador já não pode ver volta a "todas"
  useEffect(() => {
    if (empSel !== "todas" && !empresas.some(e => e.id === empSel)) setEmpSel("todas");
  }, [empresas, empSel]);

  const [anoSel, setAnoSel] = useState(null);
  const [triSel, setTriSel] = useState("todos");
  const [vista, setVista] = useState("trimestre");       // trimestre | mes
  const [abertos, setAbertos] = useState({});            // trimestres e meses expandidos
  const [tipoDetalhe, setTipoDetalhe] = useState("todos");
  const [triDetalhe, setTriDetalhe] = useState(null);    // filtro vindo do resumo
  const [aPagar, setAPagar] = useState(null);            // trimestre a marcar como pago
  const [exportando, setExportando] = useState(false);

  const visiveis = useMemo(() => {
    const ids = empresas.map(e => e.id);
    return (documentos || []).filter(d => ids.includes(d.empresa));
  }, [documentos, empresas]);

  const anos = useMemo(
    () => [...new Set(visiveis.map(d => Number(String(d.data_fatura).slice(0, 4))))]
      .filter(Boolean).sort((a, b) => b - a),
    [visiveis]);

  useEffect(() => {
    if (anoSel == null && anos.length) setAnoSel(anos[0]);
  }, [anos, anoSel]);

  const apuramento = useMemo(
    () => apurar(visiveis, { empresa: empSel, ano: anoSel, trimestre: triSel }),
    [visiveis, empSel, anoSel, triSel]);

  const meses12 = useMemo(() => porMes(apuramento, anoSel), [apuramento, anoSel]);

  const pagamentoDe = (t) => (pagamentos || []).find(p =>
    p.ano === t.ano && p.trimestre === t.trimestre &&
    (empSel === "todas" ? true : p.empresa === empSel));

  const proximo = useMemo(
    () => proximoVencimento(apuramento.trimestres, pagamentos || []),
    [apuramento, pagamentos]);

  const alternar = (chave) => setAbertos(a => ({ ...a, [chave]: !a[chave] }));

  const semTabela = /vw_iva_documentos|does not exist|schema cache/i.test(error || "");
  if (semTabela) return (
    <div style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 12, padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 30, marginBottom: 10 }}>🧾</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: COR.tinta }}>Falta a base do apuramento de IVA</div>
      <div style={{ color: "#888", fontSize: 12.5, marginTop: 8, maxWidth: 520, margin: "8px auto 0", lineHeight: 1.6 }}>
        Corre <code style={{ background: "#f4f5f7", padding: "1px 5px", borderRadius: 4 }}>supabase/migracao-v14-iva.sql</code> no
        SQL Editor do Supabase e recarrega a página.
      </div>
    </div>
  );

  const mostrarEmpresa = empSel === "todas";
  const detalhe = apuramento.linhas
    .filter(d => tipoDetalhe === "todos" || d.tipo === tipoDetalhe)
    .filter(d => !triDetalhe || (d.ano === triDetalhe.ano && d.trimestre === triDetalhe.trimestre))
    .sort((a, b) => String(b.data_fatura).localeCompare(String(a.data_fatura)));

  const exportar = async () => {
    if (exportando) return;
    setExportando(true);
    try {
      const { exportarIvaExcel } = await import("./ivaExcel.js");
      await exportarIvaExcel({
        apuramento, meses12, ano: anoSel,
        empresaNome: empSel === "todas" ? "Todas as empresas" : nomeEmpresa(empSel),
        pagamentos: pagamentos || [], nomeEmpresa,
      });
    } catch (e) {
      alert("Não foi possível exportar: " + (e?.message || e));
    } finally { setExportando(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Filtros ────────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 14,
                    padding: "16px 20px", display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: COR.tinta, fontFamily: "Georgia,serif" }}>
            Apuramento de IVA
          </div>
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>
            Conta a data de emissão da fatura, não a do pagamento.
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <Rotulo>Empresa</Rotulo>
            <select value={empSel} onChange={e => setEmpSel(e.target.value)}
              style={{ border: "1px solid #e8e8e8", borderRadius: 8, padding: "7px 10px", fontSize: 12, minWidth: 210 }}>
              <option value="todas">Todas (consolidado, só para consulta)</option>
              {agruparPorGrupo(empresas).map(b => (
                <optgroup key={b.grupo} label={b.info.nome}>
                  {b.empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <Rotulo>Ano</Rotulo>
            <select value={anoSel ?? ""} onChange={e => setAnoSel(Number(e.target.value))}
              style={{ border: "1px solid #e8e8e8", borderRadius: 8, padding: "7px 10px", fontSize: 12 }}>
              {anos.length === 0 && <option value="">—</option>}
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <Rotulo>Trimestre</Rotulo>
            <div style={{ display: "flex", background: "#f4f5f7", borderRadius: 8, padding: 2, gap: 2 }}>
              {["todos", ...TRIMESTRES].map(t => (
                <button key={t} onClick={() => setTriSel(t)}
                  style={{ background: triSel === t ? COR.tinta : "transparent", color: triSel === t ? "#fff" : "#777",
                           border: "none", padding: "5px 11px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  {t === "todos" ? "Todos" : `${t}T`}
                </button>
              ))}
            </div>
          </div>
          <button onClick={exportar} disabled={exportando}
            style={{ background: exportando ? "#e8e8e8" : "#16a34a", color: exportando ? "#999" : "#fff",
                     border: "none", padding: "8px 14px", borderRadius: 8, fontSize: 12,
                     cursor: exportando ? "default" : "pointer", fontWeight: 600 }}>
            {exportando ? "A gerar..." : "⬇ Excel"}
          </button>
        </div>
      </div>

      {loading && <div style={{ padding: 30, textAlign: "center", color: "#ccc", fontSize: 12 }}>A carregar...</div>}

      {!loading && apuramento.linhas.length === 0 && (
        <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 14, padding: 40,
                      textAlign: "center", color: "#aaa", fontSize: 12.5, lineHeight: 1.7 }}>
          Sem faturas no período escolhido.<br />
          O IVA a abater vem das faturas do Contas a Pagar; o IVA a pagar vem das faturas
          emitidas que registares no Contas a Receber.
        </div>
      )}

      {!loading && apuramento.linhas.length > 0 && (
        <>
          {/* ── Cartões de resumo ──────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <Cartao cor={COR.pagar}>
              <Rotulo dica="IVA das faturas emitidas a clientes">IVA a pagar</Rotulo>
              <Valor cor={COR.pagar}>{fmtEUR(apuramento.total.aPagar)}</Valor>
            </Cartao>
            <Cartao cor={COR.abater}>
              <Rotulo dica="IVA das faturas de fornecedores">IVA a abater</Rotulo>
              <Valor cor={COR.abater}>{fmtEUR(apuramento.total.aAbater)}</Valor>
            </Cartao>
            <Cartao cor={apuramento.total.saldo >= 0 ? COR.alerta : COR.credito}>
              <Rotulo>{apuramento.total.saldo >= 0 ? "A pagar ao Estado" : "Crédito de IVA"}</Rotulo>
              <Valor cor={apuramento.total.saldo >= 0 ? COR.alerta : COR.credito} tamanho={21}>
                {fmtEUR(Math.abs(apuramento.total.saldo))}
              </Valor>
            </Cartao>
            <Cartao cor="#64748b">
              <Rotulo>Próxima data limite</Rotulo>
              {proximo ? (
                <>
                  <Valor>{fmtData(proximo.dataLimite)}</Valor>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 3, fontFamily: "monospace" }}>
                    {proximo.rotulo} · {fmtEUR(proximo.saldo)}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: "#bbb", marginTop: 4 }}>Nada por liquidar</div>
              )}
            </Cartao>
          </div>

          {/* ── Resumo trimestral / por mês ────────────────────────────────── */}
          <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0f0",
                          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, color: COR.tinta, fontSize: 13, fontFamily: "Georgia,serif" }}>
                  {vista === "trimestre" ? "Resumo trimestral" : `Os 12 meses de ${anoSel || ""}`}
                </div>
                <div style={{ fontSize: 10.5, color: "#aaa", marginTop: 2 }}>
                  Abre um {vista === "trimestre" ? "trimestre e depois um mês" : "mês"} para ver as faturas que o compõem.
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", background: "#f4f5f7", borderRadius: 8, padding: 2, gap: 2 }}>
                {[["trimestre", "Por trimestre"], ["mes", "Por mês"]].map(([k, r]) => (
                  <button key={k} onClick={() => setVista(k)}
                    style={{ background: vista === k ? COR.tinta : "transparent", color: vista === k ? "#fff" : "#777",
                             border: "none", padding: "5px 13px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#fafbfc" }}>
                    {["Período", "IVA a pagar", "IVA a abater", "Saldo", "Data limite", "Estado", ""].map((h, i) => (
                      <th key={h + i} style={{ ...th, textAlign: i >= 1 && i <= 3 ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vista === "trimestre" && apuramento.trimestres.map(t => {
                    const chave = `t${t.ano}-${t.trimestre}`;
                    const pag = pagamentoDe(t);
                    const est = estadoTrimestre(t.ano, t.trimestre, pag);
                    return (
                      <React.Fragment key={chave}>
                        <tr onClick={() => alternar(chave)}
                            style={{ borderBottom: "1px solid #f4f4f6", cursor: "pointer",
                                     background: abertos[chave] ? "#f8f9ff" : "#fff" }}>
                          <td style={{ ...td, fontWeight: 700, fontFamily: "monospace" }}>
                            {abertos[chave] ? "▼ " : "▶ "}{t.rotulo}
                          </td>
                          <td style={tdNum}><Euro v={t.aPagar} /></td>
                          <td style={tdNum}><Euro v={t.aAbater} /></td>
                          <td style={tdNum}><Euro v={t.saldo} forte /></td>
                          <td style={{ ...td, fontFamily: "monospace", fontSize: 11, color: "#888" }}>{fmtData(t.dataLimite)}</td>
                          <td style={td}><Estado chave={est} /></td>
                          <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                            <button onClick={(e) => { e.stopPropagation(); setTriDetalhe({ ano: t.ano, trimestre: t.trimestre }); }}
                              title="Filtrar o detalhe por fatura por este trimestre"
                              style={{ background: "#f0f4ff", border: "none", color: "#4a6fa5", padding: "4px 9px",
                                       borderRadius: 6, fontSize: 10.5, cursor: "pointer", marginRight: 5 }}>detalhe</button>
                            {podeEditar && (est === "pago"
                              ? <button onClick={(e) => { e.stopPropagation();
                                    if (confirm(`Anular o pagamento de ${t.rotulo}?`)) anularPagamento(pag.empresa, t.ano, t.trimestre); }}
                                  style={{ background: "none", border: "1px solid #f0f0f0", color: "#bbb", padding: "4px 9px",
                                           borderRadius: 6, fontSize: 10.5, cursor: "pointer" }}>anular</button>
                              : <button onClick={(e) => { e.stopPropagation(); setAPagar(t); }}
                                  disabled={empSel === "todas"}
                                  title={empSel === "todas" ? "Escolhe uma empresa: o IVA paga-se por NIF" : "Registar o pagamento ao Estado"}
                                  style={{ background: empSel === "todas" ? "#f4f5f7" : "#dcfce7", border: "none",
                                           color: empSel === "todas" ? "#ccc" : "#15803d", padding: "4px 9px", borderRadius: 6,
                                           fontSize: 10.5, cursor: empSel === "todas" ? "default" : "pointer", fontWeight: 600 }}>
                                  marcar pago</button>
                            )}
                          </td>
                        </tr>
                        {abertos[chave] && t.meses.map(m => (
                          <LinhaMes key={`${chave}-${m.mes}`} m={m}
                            aberto={!!abertos[`${chave}-${m.mes}`]}
                            onAlternar={() => alternar(`${chave}-${m.mes}`)}
                            mostrarEmpresa={mostrarEmpresa} />
                        ))}
                        {abertos[chave] && (
                          <tr style={{ background: "#f4f5f7" }}>
                            <td style={{ ...td, paddingLeft: 28, fontWeight: 700, fontSize: 11 }}>Subtotal {t.rotulo}</td>
                            <td style={tdNum}><Euro v={t.aPagar} forte zeroTraco={false} /></td>
                            <td style={tdNum}><Euro v={t.aAbater} forte zeroTraco={false} /></td>
                            <td style={tdNum}><Euro v={t.saldo} forte zeroTraco={false} /></td>
                            <td colSpan={3} />
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {vista === "mes" && meses12.map(m => (
                    <LinhaMes key={`m${m.mes}`} m={m}
                      aberto={!!abertos[`m${m.mes}`]}
                      onAlternar={() => alternar(`m${m.mes}`)}
                      mostrarEmpresa={mostrarEmpresa} recuo={12} />
                  ))}

                  <tr style={{ background: "#1a1a2e" }}>
                    <td style={{ ...td, color: "#fff", fontWeight: 700 }}>Total</td>
                    <td style={{ ...tdNum, color: "#fff", fontWeight: 700 }}>{fmtEUR(apuramento.total.aPagar)}</td>
                    <td style={{ ...tdNum, color: "#fff", fontWeight: 700 }}>{fmtEUR(apuramento.total.aAbater)}</td>
                    <td style={{ ...tdNum, color: apuramento.total.saldo >= 0 ? "#fca5a5" : "#86efac", fontWeight: 800 }}>
                      {fmtEUR(apuramento.total.saldo)}
                    </td>
                    <td colSpan={3} style={{ ...td, color: "#8b93a3", fontSize: 10.5 }}>
                      {apuramento.total.saldo >= 0 ? "a entregar ao Estado" : "crédito a favor da empresa"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Detalhe por fatura ─────────────────────────────────────────── */}
          <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0f0",
                          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, color: COR.tinta, fontSize: 13, fontFamily: "Georgia,serif" }}>
                Detalhe por fatura
                <span style={{ fontWeight: 400, color: "#aaa", fontSize: 11, marginLeft: 8, fontFamily: "monospace" }}>
                  {detalhe.length} documentos
                </span>
              </div>
              {triDetalhe && (
                <button onClick={() => setTriDetalhe(null)}
                  style={{ background: "#eef2ff", border: "none", color: "#4338ca", padding: "4px 11px",
                           borderRadius: 20, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                  {rotuloTrimestre(triDetalhe.ano, triDetalhe.trimestre)} ✕
                </button>
              )}
              <div style={{ marginLeft: "auto", display: "flex", background: "#f4f5f7", borderRadius: 8, padding: 2, gap: 2 }}>
                {[["todos", "Todos"], ["cliente", "Clientes"], ["fornecedor", "Fornecedores"]].map(([k, r]) => (
                  <button key={k} onClick={() => setTipoDetalhe(k)}
                    style={{ background: tipoDetalhe === k ? COR.tinta : "transparent", color: tipoDetalhe === k ? "#fff" : "#777",
                             border: "none", padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "#fafbfc", zIndex: 1 }}>
                  <tr>
                    {["Tipo", "Data", ...(mostrarEmpresa ? ["Empresa"] : []), "Cliente / Fornecedor",
                      "N.º", "Sem IVA", "Taxa", "IVA", "Mês", "Trim."].map((h, i) => (
                      <th key={h} style={{ ...th, textAlign: /Sem IVA|Taxa|IVA/.test(h) ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detalhe.map(d => (
                    <tr key={d.id} style={{ borderBottom: "1px solid #fafafa",
                                            background: d.estimado ? "#fffdf5" : "#fff" }}>
                      <td style={td}>
                        <span style={{ background: d.tipo === "cliente" ? "#fef3c7" : "#eff6ff",
                                       color: d.tipo === "cliente" ? "#b45309" : "#1d4ed8",
                                       fontSize: 9.5, fontFamily: "monospace", fontWeight: 700,
                                       padding: "2px 7px", borderRadius: 3 }}>
                          {d.tipo === "cliente" ? "cliente" : "fornec."}
                        </span>
                      </td>
                      <td style={{ ...td, fontFamily: "monospace", fontSize: 11, color: "#888" }}>{fmtData(d.data_fatura)}</td>
                      {mostrarEmpresa && <td style={{ ...td, fontSize: 11 }}>{nomeEmpresa(d.empresa)}</td>}
                      <td style={{ ...td, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={d.entidade}>{d.entidade}</td>
                      <td style={{ ...td, fontFamily: "monospace", fontSize: 11, color: "#888" }}>{d.documento}</td>
                      <td style={tdNum}>{fmtEUR(d.valor_base)}</td>
                      <td style={{ ...tdNum, color: "#888", fontSize: 11 }}>
                        {d.taxa_iva != null ? `${fmtNum(d.taxa_iva, 0)}%` : "—"}
                      </td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>
                        <Euro v={d.iva} forte />
                        {d.estimado && (
                          <span title="IVA deduzido do total à taxa normal, não lido da fatura"
                            style={{ marginLeft: 6, background: "#fef3c7", color: "#b45309", fontSize: 8.5,
                                     fontFamily: "monospace", fontWeight: 700, padding: "1px 5px", borderRadius: 3 }}>calc.</span>
                        )}
                      </td>
                      <td style={{ ...td, fontSize: 11, color: "#888" }}>{NOMES_MES[d.mes - 1]}</td>
                      <td style={{ ...td, fontFamily: "monospace", fontSize: 11, color: "#888" }}>
                        {rotuloTrimestre(d.ano, d.trimestre)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {apuramento.linhas.some(d => d.estimado) && (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12,
                          padding: "12px 16px", fontSize: 11.5, color: "#92400e", lineHeight: 1.6 }}>
              {(() => {
                const n = apuramento.linhas.filter(d => d.estimado).length;
                return (
                  <>
                    <strong>{n === 1 ? "1 documento com IVA calculado." : `${n} documentos com IVA calculado.`}</strong>{" "}
                    {n === 1 ? "É uma fatura que entrou" : "São faturas que entraram"} no ERP antes de haver campo
                    de IVA: o valor foi deduzido do total à taxa normal (23%). Onde a taxa real for outra —
                    isento, 6% ou 13% — o número está errado. Corrige na própria fatura e a marca desaparece.
                  </>
                );
              })()}
            </div>
          )}
        </>
      )}

      {/* ── Registar o pagamento ao Estado ─────────────────────────────────── */}
      {aPagar && (
        <ModalPagamento trimestre={aPagar} empresa={empSel} currentUser={currentUser}
          onFechar={() => setAPagar(null)}
          onGuardar={async (dados) => {
            const res = await marcarPago(dados);
            if (res?.error) {
              alert(/iva_pagamentos/i.test(res.error.message || "")
                ? "Falta a tabela iva_pagamentos.\n\nCorre supabase/migracao-v14-iva.sql no Supabase."
                : "Erro ao guardar: " + (res.error.message || res.error));
              return;
            }
            setAPagar(null);
          }} />
      )}
    </div>
  );
}

function ModalPagamento({ trimestre: t, empresa, currentUser, onFechar, onGuardar }) {
  const [valor, setValor] = useState(String(Math.abs(t.saldo).toFixed(2)));
  const [data, setData] = useState(hojeISO());
  const [obs, setObs] = useState("");
  const [aGuardar, setAGuardar] = useState(false);

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onFechar(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(10,10,15,0.55)", display: "flex",
               alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 440 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: COR.tinta, fontFamily: "Georgia,serif" }}>
          Registar pagamento do IVA — {t.rotulo}
        </div>
        <div style={{ fontSize: 11.5, color: "#888", marginTop: 6, lineHeight: 1.6 }}>
          {nomeEmpresa(empresa)} · apurado {fmtEUR(t.saldo)} · data limite {fmtData(t.dataLimite)}
        </div>

        {[["Valor pago (€)", valor, setValor, "text"], ["Data do pagamento", data, setData, "date"],
          ["Observações", obs, setObs, "text"]].map(([rot, v, set, tipo]) => (
          <div key={rot} style={{ marginTop: 12 }}>
            <Rotulo>{rot}</Rotulo>
            <input type={tipo} value={v} onChange={e => set(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e8e8e8",
                       borderRadius: 9, padding: "9px 11px", fontSize: 13 }} />
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onFechar}
            style={{ background: "none", border: "1px solid #e8e8e8", borderRadius: 8, padding: "8px 16px",
                     fontSize: 12, color: "#777", cursor: "pointer" }}>Cancelar</button>
          <button disabled={aGuardar}
            onClick={async () => {
              setAGuardar(true);
              await onGuardar({
                empresa, ano: t.ano, trimestre: t.trimestre,
                valor_pago: parseFloat(String(valor).replace(/\s/g, "").replace(",", ".")) || 0,
                data_pagamento: data || hojeISO(),
                pago_por: currentUser?.nome || "", obs,
              });
              setAGuardar(false);
            }}
            style={{ background: aGuardar ? "#c9cdd4" : "#16a34a", color: "#fff", border: "none",
                     borderRadius: 8, padding: "8px 20px", fontSize: 12, fontWeight: 600,
                     cursor: aGuardar ? "default" : "pointer" }}>
            {aGuardar ? "A guardar..." : "Registar pagamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
