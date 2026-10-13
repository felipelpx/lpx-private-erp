import React, { useState, useMemo, useEffect } from "react";
import { EMPRESAS, agruparPorGrupo } from "./empresas.js";
import { useIvaDocumentos, useIvaPagamentos } from "./hooks.js";
import { fmtEUR, fmtData, fmtNum } from "./formato.js";
import {
  apurar, porMes, dataLimite, estadoTrimestre, ESTADOS_TRIMESTRE,
  proximoVencimento, rotuloTrimestre, TRIMESTRES, NOMES_MES, hojeISO, arred2,
  TAXAS_IVA, decomporPorTaxa,
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

const COR = { tinta: "#091C2A", cinza: "#6E7378", linha: "#E7DED2",
              pagar: "#96702A", abater: "#2C4A63", credito: "#1B6A49", alerta: "#A93226" };

const MEMORIA_EMPRESA = "lpx_iva_empresa";

const Cartao = ({ children, cor }) => (
  <div style={{ background: "#fff", border: "1px solid #E7DED2", borderRadius: 12,
                padding: "14px 18px", borderTop: `3px solid ${cor || "#E3D9CC"}` }}>
    {children}
  </div>
);

const Rotulo = ({ children, dica }) => (
  <div title={dica} style={{ fontSize: 10, color: "#9DA2A6", textTransform: "uppercase",
                             fontFamily: "var(--fonte-numero)", letterSpacing: "0.07em", marginBottom: 5 }}>
    {children}
  </div>
);

const Valor = ({ children, cor, tamanho = 18 }) => (
  <div style={{ fontSize: tamanho, fontWeight: 700, color: cor || COR.tinta, fontFamily: "var(--fonte-numero)" }}>
    {children}
  </div>
);

const th = { padding: "9px 12px", textAlign: "left", color: "#9DA2A6", fontSize: 10,
             letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "var(--fonte-numero)",
             borderBottom: "1px solid #E7DED2", whiteSpace: "nowrap" };
const td = { padding: "9px 12px", fontSize: 12, color: "#23292D" };
const tdNum = { ...td, fontFamily: "var(--fonte-numero)", textAlign: "right", whiteSpace: "nowrap" };

// Valor monetário: negativo a vermelho, como pedido.
const Euro = ({ v, forte, zeroTraco = true }) => {
  const n = Number(v) || 0;
  if (zeroTraco && Math.abs(n) < 0.005) return <span style={{ color: "#D8CCBB" }}>—</span>;
  return <span style={{ color: n < 0 ? COR.alerta : COR.tinta, fontWeight: forte ? 700 : 400 }}>{fmtEUR(n)}</span>;
};

const Estado = ({ chave }) => {
  const e = ESTADOS_TRIMESTRE[chave] || ESTADOS_TRIMESTRE.curso;
  return <span style={{ background: e.fundo, color: e.cor, fontSize: 10, fontFamily: "var(--fonte-numero)",
                        fontWeight: 700, padding: "2px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>{e.txt}</span>;
};

const nomeEmpresa = (id) => EMPRESAS.find(e => e.id === id)?.nome || id || "—";

// ─── Marcas e acções de uma linha ────────────────────────────────────────────
const SelosIVA = ({ d }) => (
  <>
    {d.naoDeduz && (
      <span title={d.tipo === "cliente"
          ? "Fatura sem IVA liquidado: continua no Contas a Receber, mas não entra no IVA a pagar."
          : "Marcada como não dedutível: fica no Contas a Pagar, mas entra no apuramento com IVA zero."}
        style={{ marginLeft: 6, background: "#F2EDE5", color: "#6E7378", fontSize: 8.5,
                 fontFamily: "var(--fonte-numero)", fontWeight: 700, padding: "1px 5px", borderRadius: 3 }}>
        {d.tipo === "cliente" ? "sem IVA" : "não deduz"}</span>
    )}
    {d.estimado && !d.naoDeduz && (
      <span title="O IVA não foi lido da fatura: foi deduzido do total à taxa normal. Confirma a taxa aqui."
        style={{ marginLeft: 6, background: "#F6ECD6", color: "#96702A", fontSize: 8.5,
                 fontFamily: "var(--fonte-numero)", fontWeight: 700, padding: "1px 5px", borderRadius: 3 }}>calculado</span>
    )}
  </>
);

const botaoAccao = (cor, fundo) => ({
  background: fundo, border: "none", color: cor, padding: "3px 8px",
  borderRadius: 5, fontSize: 10, cursor: "pointer", fontWeight: 600,
  whiteSpace: "nowrap", marginLeft: 4,
});

// Duas acções por fatura: corrigir a taxa, e tirar/repor no apuramento.
// "Tirar do apuramento" não apaga a fatura — essa vive no Contas a Pagar e
// apaga-se lá, onde se vê o que mais depende dela.
function AccoesIVA({ d, onTaxa, onDeducao }) {
  const cliente = d.tipo === "cliente";
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <button onClick={(e) => { e.stopPropagation(); onTaxa(d); }}
        title="Corrigir a taxa de IVA deste documento"
        style={botaoAccao("#2C4A63", "#EDF1F5")}>taxa</button>
      {d.naoDeduz ? (
        <button onClick={(e) => { e.stopPropagation(); onDeducao(d, true); }}
          title="Voltar a contar esta fatura no apuramento"
          style={botaoAccao("#1B6A49", "#E2EFE8")}>repor</button>
      ) : (
        <button onClick={(e) => { e.stopPropagation(); onDeducao(d, false); }}
          title={cliente
            ? "Tirar do apuramento: a fatura mantém-se, mas deixa de liquidar IVA"
            : "Tirar do apuramento: a fatura mantém-se, mas deixa de deduzir IVA"}
          style={botaoAccao("#8E2A20", "#F6DED9")}>{cliente ? "sem IVA" : "não deduz"}</button>
      )}
    </span>
  );
}

// ─── Lista de faturas de um mês ──────────────────────────────────────────────
function BlocoFaturas({ docs, tipo, titulo, cor, mostrarEmpresa, accoes }) {
  const linhas = docs.filter(d => d.tipo === tipo);
  const soma = arred2(linhas.reduce((s, d) => s + d.iva, 0));
  if (!linhas.length) {
    return (
      <div style={{ padding: "8px 0 12px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: cor, marginBottom: 4 }}>{titulo}</div>
        <div style={{ fontSize: 11.5, color: "#C4C7CA" }}>Nenhuma fatura.</div>
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
              tipo === "cliente" ? "Cliente" : "Fornecedor", "N.º", "Sem IVA", "IVA", "Estado",
              ...(accoes ? [""] : [])]
              .map((h, i) => (
                <th key={h + i} style={{ ...th, textAlign: i >= (mostrarEmpresa ? 4 : 3) && i <= (mostrarEmpresa ? 5 : 4) ? "right" : "left",
                                     fontSize: 9, padding: "6px 10px" }}>{h}</th>
              ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map(d => (
            <tr key={d.id} style={{ borderBottom: "1px solid #FBF7F1",
                                    background: d.naoDeduz ? "#fbfbfc" : "#fff",
                                    color: d.naoDeduz ? "#9DA2A6" : undefined }}>
              <td style={{ ...td, fontFamily: "var(--fonte-numero)", fontSize: 11, color: "#7E8388", padding: "7px 10px" }}>{fmtData(d.data_fatura)}</td>
              {mostrarEmpresa && <td style={{ ...td, fontSize: 11, padding: "7px 10px" }}>{nomeEmpresa(d.empresa)}</td>}
              <td style={{ ...td, padding: "7px 10px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={d.entidade}>{d.entidade}</td>
              <td style={{ ...td, fontFamily: "var(--fonte-numero)", fontSize: 11, color: "#7E8388", padding: "7px 10px" }}>{d.documento}</td>
              <td style={{ ...tdNum, padding: "7px 10px" }}>{fmtEUR(d.valor_base)}</td>
              <td style={{ ...tdNum, padding: "7px 10px", fontWeight: 700 }}>
                <Euro v={d.iva} forte />
                <SelosIVA d={d} />
              </td>
              <td style={{ ...td, fontSize: 10.5, color: "#9DA2A6", padding: "7px 10px" }}
                  title="Informativo: o estado de pagamento não entra no apuramento">{d.estado || "—"}</td>
              {accoes && <td style={{ ...td, padding: "7px 10px", textAlign: "right" }}>{accoes(d)}</td>}
            </tr>
          ))}
          <tr style={{ background: "#F9F4EC" }}>
            <td colSpan={mostrarEmpresa ? 5 : 4} style={{ ...td, padding: "7px 10px", fontWeight: 700, fontSize: 11 }}>
              Soma
            </td>
            <td style={{ ...tdNum, padding: "7px 10px", fontWeight: 800 }}><Euro v={soma} forte zeroTraco={false} /></td>
            <td colSpan={accoes ? 2 : 1} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Um mês, expansível até às faturas ───────────────────────────────────────
function LinhaMes({ m, aberto, onAlternar, mostrarEmpresa, accoes, recuo = 28 }) {
  return (
    <>
      <tr onClick={m.semFaturas ? undefined : onAlternar}
          style={{ borderBottom: "1px solid #FBF7F1", cursor: m.semFaturas ? "default" : "pointer",
                   background: aberto ? "#FAF6F0" : "#fff" }}>
        <td style={{ ...td, paddingLeft: recuo, color: m.semFaturas ? "#B2B6B9" : COR.tinta }}>
          {m.semFaturas ? "   " : (aberto ? "▼ " : "▶ ")}
          {NOMES_MES[m.mes - 1]}
          {m.semFaturas && <span style={{ fontSize: 10.5, color: "#C4C7CA", marginLeft: 8 }}>Sem faturas</span>}
        </td>
        <td style={tdNum}><Euro v={m.aPagar} /></td>
        <td style={tdNum}><Euro v={m.aAbater} /></td>
        <td style={tdNum}><Euro v={m.saldo} forte /></td>
        <td colSpan={3} />
      </tr>
      {aberto && !m.semFaturas && (
        <tr>
          <td colSpan={7} style={{ padding: "4px 20px 10px", background: "#FDFAF6" }}>
            <BlocoFaturas docs={m.docs} tipo="cliente" titulo="Faturas emitidas a clientes (IVA a pagar)"
                          cor={COR.pagar} mostrarEmpresa={mostrarEmpresa} accoes={accoes} />
            <BlocoFaturas docs={m.docs} tipo="fornecedor" titulo="Faturas de fornecedores (IVA a abater)"
                          cor={COR.abater} mostrarEmpresa={mostrarEmpresa} accoes={accoes} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Ecrã ────────────────────────────────────────────────────────────────────
export default function IVAView({ currentUser, empresasVisiveis = [], onCriarPrevisao }) {
  const { documentos, loading, error, guardarDocumento } = useIvaDocumentos();
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
  const [aEditarTaxa, setAEditarTaxa] = useState(null);  // documento em correcção de taxa

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

  // ── Correcções feitas a partir deste ecrã ─────────────────────────────────
  const avisarErro = (res) => {
    if (!res?.error) return false;
    alert(/iva_dedutivel|column .* does not exist|schema cache/i.test(res.error.message || "")
      ? "Falta a coluna iva_dedutivel.\n\nCorre iva-7-coluna-nao-deduz.sql e iva-8-view-v2.sql no Supabase."
      : "Não foi possível guardar:\n\n" + (res.error.message || res.error));
    return true;
  };

  const alternarDeducao = async (d, passaADeduzir) => {
    const quem = `${d.entidade} · ${d.documento}`;
    const onde = d.tipo === "cliente" ? "Contas a Receber" : "Contas a Pagar";
    const verbo = d.tipo === "cliente" ? "liquidar" : "deduzir";
    if (!passaADeduzir && !confirm(
      `Tirar esta fatura do apuramento de IVA?\n\n${quem}\n\n` +
      `A fatura mantém-se no ${onde} — só deixa de ${verbo} ${fmtEUR(d.iva)} de IVA. ` +
      `Podes repor a qualquer momento.`)) return;
    avisarErro(await guardarDocumento(d, { iva_dedutivel: passaADeduzir }));
  };

  // Mudar a taxa recalcula base e IVA a partir do TOTAL do documento, que é o
  // único valor de que temos a certeza. Deixa de ser estimativa: foi uma
  // pessoa que confirmou a taxa, por isso a marca "calculado" cai.
  const guardarTaxa = async (d, taxa) => {
    const total = Number(d.valor_total) || arred2((Number(d.valor_base) || 0) + (Number(d.valor_iva) || 0));
    const { base, iva } = decomporPorTaxa(total, taxa);
    const res = await guardarDocumento(d, {
      taxa_iva: taxa, valor_base: base, valor_iva: iva, iva_estimado: false,
    });
    if (avisarErro(res)) return;
    setAEditarTaxa(null);
  };

  const accoesLinha = podeEditar
    ? (d) => <AccoesIVA d={d} onTaxa={setAEditarTaxa} onDeducao={alternarDeducao} />
    : null;

  const semTabela = /vw_iva_documentos|does not exist|schema cache/i.test(error || "");
  if (semTabela) return (
    <div style={{ background: "#fff", border: "1px solid #E3CE9F", borderRadius: 12, padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 30, marginBottom: 10 }}>🧾</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: COR.tinta }}>Falta a base do apuramento de IVA</div>
      <div style={{ color: "#7E8388", fontSize: 12.5, marginTop: 8, maxWidth: 520, margin: "8px auto 0", lineHeight: 1.6 }}>
        Corre <code style={{ background: "#F6F0E8", padding: "1px 5px", borderRadius: 4 }}>supabase/migracao-v14-iva.sql</code> no
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
      <div style={{ background: "#fff", border: "1px solid #E7DED2", borderRadius: 14,
                    padding: "16px 20px", display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: COR.tinta, fontFamily: "var(--fonte-titulo)" }}>
            Apuramento de IVA
          </div>
          <div style={{ fontSize: 11, color: "#9DA2A6", marginTop: 3 }}>
            Conta a data de emissão da fatura, não a do pagamento.
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <Rotulo>Empresa</Rotulo>
            <select value={empSel} onChange={e => setEmpSel(e.target.value)}
              style={{ border: "1px solid #E3D9CC", borderRadius: 8, padding: "7px 10px", fontSize: 12, minWidth: 210 }}>
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
              style={{ border: "1px solid #E3D9CC", borderRadius: 8, padding: "7px 10px", fontSize: 12 }}>
              {anos.length === 0 && <option value="">—</option>}
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <Rotulo>Trimestre</Rotulo>
            <div style={{ display: "flex", background: "#F6F0E8", borderRadius: 8, padding: 2, gap: 2 }}>
              {["todos", ...TRIMESTRES].map(t => (
                <button key={t} onClick={() => setTriSel(t)}
                  style={{ background: triSel === t ? COR.tinta : "transparent", color: triSel === t ? "#fff" : "#6E7378",
                           border: "none", padding: "5px 11px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  {t === "todos" ? "Todos" : `${t}T`}
                </button>
              ))}
            </div>
          </div>
          <button onClick={exportar} disabled={exportando}
            style={{ background: exportando ? "#E3D9CC" : "#091C2A", color: exportando ? "#8E9398" : "#fff",
                     border: "none", padding: "8px 14px", borderRadius: 8, fontSize: 12,
                     cursor: exportando ? "default" : "pointer", fontWeight: 600 }}>
            {exportando ? "A gerar..." : "⬇ Excel"}
          </button>
        </div>
      </div>

      {loading && <div style={{ padding: 30, textAlign: "center", color: "#C4C7CA", fontSize: 12 }}>A carregar...</div>}

      {!loading && apuramento.linhas.length === 0 && (
        <div style={{ background: "#fff", border: "1px solid #E7DED2", borderRadius: 14, padding: 40,
                      textAlign: "center", color: "#9DA2A6", fontSize: 12.5, lineHeight: 1.7 }}>
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
            <Cartao cor="#6E7378">
              <Rotulo>Próxima data limite</Rotulo>
              {proximo ? (
                <>
                  <Valor>{fmtData(proximo.dataLimite)}</Valor>
                  <div style={{ fontSize: 11, color: "#7E8388", marginTop: 3, fontFamily: "var(--fonte-numero)" }}>
                    {proximo.rotulo} · {fmtEUR(proximo.saldo)}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: "#B2B6B9", marginTop: 4 }}>Nada por liquidar</div>
              )}
            </Cartao>
          </div>

          {/* ── Resumo trimestral / por mês ────────────────────────────────── */}
          <div style={{ background: "#fff", border: "1px solid #E7DED2", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #E7DED2",
                          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, color: COR.tinta, fontSize: 13, fontFamily: "var(--fonte-titulo)" }}>
                  {vista === "trimestre" ? "Resumo trimestral" : `Os 12 meses de ${anoSel || ""}`}
                </div>
                <div style={{ fontSize: 10.5, color: "#9DA2A6", marginTop: 2 }}>
                  Abre um {vista === "trimestre" ? "trimestre e depois um mês" : "mês"} para ver as faturas que o compõem.
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", background: "#F6F0E8", borderRadius: 8, padding: 2, gap: 2 }}>
                {[["trimestre", "Por trimestre"], ["mes", "Por mês"]].map(([k, r]) => (
                  <button key={k} onClick={() => setVista(k)}
                    style={{ background: vista === k ? COR.tinta : "transparent", color: vista === k ? "#fff" : "#6E7378",
                             border: "none", padding: "5px 13px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F9F4EC" }}>
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
                            style={{ borderBottom: "1px solid #EFE9E1", cursor: "pointer",
                                     background: abertos[chave] ? "#FAF6F0" : "#fff" }}>
                          <td style={{ ...td, fontWeight: 700, fontFamily: "var(--fonte-numero)" }}>
                            {abertos[chave] ? "▼ " : "▶ "}{t.rotulo}
                          </td>
                          <td style={tdNum}><Euro v={t.aPagar} /></td>
                          <td style={tdNum}><Euro v={t.aAbater} /></td>
                          <td style={tdNum}><Euro v={t.saldo} forte /></td>
                          <td style={{ ...td, fontFamily: "var(--fonte-numero)", fontSize: 11, color: "#7E8388" }}>{fmtData(t.dataLimite)}</td>
                          <td style={td}><Estado chave={est} /></td>
                          <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                            <button onClick={(e) => { e.stopPropagation(); setTriDetalhe({ ano: t.ano, trimestre: t.trimestre }); }}
                              title="Filtrar o detalhe por fatura por este trimestre"
                              style={{ background: "#EDF1F5", border: "none", color: "#2C4A63", padding: "4px 9px",
                                       borderRadius: 6, fontSize: 10.5, cursor: "pointer", marginRight: 5 }}>detalhe</button>
                            {podeEditar && (est === "pago"
                              ? <button onClick={(e) => { e.stopPropagation();
                                    if (confirm(`Anular o pagamento de ${t.rotulo}?`)) anularPagamento(pag.empresa, t.ano, t.trimestre); }}
                                  style={{ background: "none", border: "1px solid #E7DED2", color: "#B2B6B9", padding: "4px 9px",
                                           borderRadius: 6, fontSize: 10.5, cursor: "pointer" }}>anular</button>
                              : <button onClick={(e) => { e.stopPropagation(); setAPagar(t); }}
                                  disabled={empSel === "todas"}
                                  title={empSel === "todas" ? "Escolhe uma empresa: o IVA paga-se por NIF" : "Registar o pagamento ao Estado"}
                                  style={{ background: empSel === "todas" ? "#F6F0E8" : "#E2EFE8", border: "none",
                                           color: empSel === "todas" ? "#C4C7CA" : "#1B6A49", padding: "4px 9px", borderRadius: 6,
                                           fontSize: 10.5, cursor: empSel === "todas" ? "default" : "pointer", fontWeight: 600 }}>
                                  marcar pago</button>
                            )}
                          </td>
                        </tr>
                        {abertos[chave] && t.meses.map(m => (
                          <LinhaMes key={`${chave}-${m.mes}`} m={m}
                            aberto={!!abertos[`${chave}-${m.mes}`]}
                            onAlternar={() => alternar(`${chave}-${m.mes}`)}
                            mostrarEmpresa={mostrarEmpresa} accoes={accoesLinha} />
                        ))}
                        {abertos[chave] && (
                          <tr style={{ background: "#F6F0E8" }}>
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
                      mostrarEmpresa={mostrarEmpresa} accoes={accoesLinha} recuo={12} />
                  ))}

                  <tr style={{ background: "#091C2A" }}>
                    <td style={{ ...td, color: "#fff", fontWeight: 700 }}>Total</td>
                    <td style={{ ...tdNum, color: "#fff", fontWeight: 700 }}>{fmtEUR(apuramento.total.aPagar)}</td>
                    <td style={{ ...tdNum, color: "#fff", fontWeight: 700 }}>{fmtEUR(apuramento.total.aAbater)}</td>
                    <td style={{ ...tdNum, color: apuramento.total.saldo >= 0 ? "#D99A91" : "#7FBE9C", fontWeight: 800 }}>
                      {fmtEUR(apuramento.total.saldo)}
                    </td>
                    <td colSpan={3} style={{ ...td, color: "#8B98A3", fontSize: 10.5 }}>
                      {apuramento.total.saldo >= 0 ? "a entregar ao Estado" : "crédito a favor da empresa"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Detalhe por fatura ─────────────────────────────────────────── */}
          <div style={{ background: "#fff", border: "1px solid #E7DED2", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #E7DED2",
                          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, color: COR.tinta, fontSize: 13, fontFamily: "var(--fonte-titulo)" }}>
                Detalhe por fatura
                <span style={{ fontWeight: 400, color: "#9DA2A6", fontSize: 11, marginLeft: 8, fontFamily: "var(--fonte-numero)" }}>
                  {detalhe.length} documentos
                </span>
              </div>
              {triDetalhe && (
                <button onClick={() => setTriDetalhe(null)}
                  style={{ background: "#EDF1F5", border: "none", color: "#2C4A63", padding: "4px 11px",
                           borderRadius: 20, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                  {rotuloTrimestre(triDetalhe.ano, triDetalhe.trimestre)} ✕
                </button>
              )}
              <div style={{ marginLeft: "auto", display: "flex", background: "#F6F0E8", borderRadius: 8, padding: 2, gap: 2 }}>
                {[["todos", "Todos"], ["cliente", "Clientes"], ["fornecedor", "Fornecedores"]].map(([k, r]) => (
                  <button key={k} onClick={() => setTipoDetalhe(k)}
                    style={{ background: tipoDetalhe === k ? COR.tinta : "transparent", color: tipoDetalhe === k ? "#fff" : "#6E7378",
                             border: "none", padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "#F9F4EC", zIndex: 1 }}>
                  <tr>
                    {["Tipo", "Data", ...(mostrarEmpresa ? ["Empresa"] : []), "Cliente / Fornecedor",
                      "N.º", "Sem IVA", "Taxa", "IVA", "Mês", "Trim.",
                      ...(accoesLinha ? [""] : [])].map((h, i) => (
                      <th key={h + i} style={{ ...th, textAlign: /Sem IVA|Taxa|IVA/.test(h) ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detalhe.map(d => (
                    <tr key={d.id} style={{ borderBottom: "1px solid #FBF7F1",
                                            background: d.naoDeduz ? "#fbfbfc"
                                                      : d.estimado ? "#fffdf5" : "#fff",
                                            color: d.naoDeduz ? "#9DA2A6" : undefined }}>
                      <td style={td}>
                        <span style={{ background: d.tipo === "cliente" ? "#F6ECD6" : "#EDF1F5",
                                       color: d.tipo === "cliente" ? "#96702A" : "#1F3A52",
                                       fontSize: 9.5, fontFamily: "var(--fonte-numero)", fontWeight: 700,
                                       padding: "2px 7px", borderRadius: 3 }}>
                          {d.tipo === "cliente" ? "cliente" : "fornec."}
                        </span>
                      </td>
                      <td style={{ ...td, fontFamily: "var(--fonte-numero)", fontSize: 11, color: "#7E8388" }}>{fmtData(d.data_fatura)}</td>
                      {mostrarEmpresa && <td style={{ ...td, fontSize: 11 }}>{nomeEmpresa(d.empresa)}</td>}
                      <td style={{ ...td, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={d.entidade}>{d.entidade}</td>
                      <td style={{ ...td, fontFamily: "var(--fonte-numero)", fontSize: 11, color: "#7E8388" }}>{d.documento}</td>
                      <td style={tdNum}>{fmtEUR(d.valor_base)}</td>
                      <td style={{ ...tdNum, color: "#7E8388", fontSize: 11 }}>
                        {d.taxa_iva != null ? `${fmtNum(d.taxa_iva, 0)}%` : "—"}
                      </td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>
                        <Euro v={d.iva} forte />
                        <SelosIVA d={d} />
                      </td>
                      <td style={{ ...td, fontSize: 11, color: "#7E8388" }}>{NOMES_MES[d.mes - 1]}</td>
                      <td style={{ ...td, fontFamily: "var(--fonte-numero)", fontSize: 11, color: "#7E8388" }}>
                        {rotuloTrimestre(d.ano, d.trimestre)}
                      </td>
                      {accoesLinha && <td style={{ ...td, textAlign: "right" }}>{accoesLinha(d)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {apuramento.linhas.some(d => d.estimado && !d.naoDeduz) && (
            <div style={{ background: "#FBF6EC", border: "1px solid #E3CE9F", borderRadius: 12,
                          padding: "12px 16px", fontSize: 11.5, color: "#7A5A22", lineHeight: 1.6 }}>
              {(() => {
                const n = apuramento.linhas.filter(d => d.estimado && !d.naoDeduz).length;
                return (
                  <>
                    <strong>{n === 1 ? "1 documento com IVA calculado." : `${n} documentos com IVA calculado.`}</strong>{" "}
                    {n === 1 ? "É uma fatura que entrou" : "São faturas que entraram"} no ERP antes de haver campo
                    de IVA: o valor foi deduzido do total à taxa normal (23%). Onde a taxa real for outra —
                    isento, 6% ou 13% — o número está errado.{" "}
                    {podeEditar
                      ? <>Corrige com o botão <strong>taxa</strong> na linha, ou tira do apuramento com
                         <strong> não deduz</strong> se for um pagamento sem direito a dedução.</>
                      : <>Um gestor pode corrigir a taxa linha a linha.</>}
                  </>
                );
              })()}
            </div>
          )}

          {apuramento.linhas.some(d => d.naoDeduz) && (
            <div style={{ background: "#f8fafc", border: "1px solid #E3D9CC", borderRadius: 12,
                          padding: "12px 16px", fontSize: 11.5, color: "#4A5055", lineHeight: 1.6 }}>
              {(() => {
                const fora = apuramento.linhas.filter(d => d.naoDeduz);
                const perdido = arred2(fora.reduce((s, d) =>
                  s + (Number(d.valor_iva) || 0), 0));
                return (
                  <>
                    <strong>{fora.length === 1 ? "1 documento fora do apuramento" : `${fora.length} documentos fora do apuramento`}</strong>
                    {" "}({fmtEUR(perdido)} de IVA não deduzido). Continuam no Contas a Pagar — só não contam
                    para o IVA. O botão <strong>repor</strong> na linha desfaz.
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

      {/* ── Corrigir a taxa de um documento ────────────────────────────────── */}
      {aEditarTaxa && (
        <ModalTaxa doc={aEditarTaxa}
          onFechar={() => setAEditarTaxa(null)}
          onGuardar={(taxa) => guardarTaxa(aEditarTaxa, taxa)} />
      )}
    </div>
  );
}

// ─── Corrigir a taxa de IVA de um documento ──────────────────────────────────
// Só se escolhe a TAXA. A base e o IVA saem do total do documento, que é o
// número de que temos a certeza — é o que está no Contas a Pagar e o que foi
// efetivamente pago. Deixar mexer na base abriria a porta a um documento cuja
// base mais IVA não dá o total.
function ModalTaxa({ doc, onFechar, onGuardar }) {
  const totalDoc = Number(doc.valor_total)
    || arred2((Number(doc.valor_base) || 0) + (Number(doc.valor_iva) || 0));
  const [taxa, setTaxa] = useState(() => {
    const t = Number(doc.taxa_iva);
    return Number.isFinite(t) && TAXAS_IVA.some(x => x.taxa === t) ? t : 23;
  });
  const [aGuardar, setAGuardar] = useState(false);
  const previsto = decomporPorTaxa(totalDoc, taxa);

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onFechar(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(10,10,15,0.55)", display: "flex",
               alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 430 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: COR.tinta, fontFamily: "var(--fonte-titulo)" }}>
          Taxa de IVA
        </div>
        <div style={{ fontSize: 11.5, color: "#7E8388", marginTop: 6, lineHeight: 1.6 }}>
          {doc.entidade} · {doc.documento}<br />
          {fmtData(doc.data_fatura)} · total do documento <strong style={{ color: COR.tinta }}>{fmtEUR(totalDoc)}</strong>
        </div>

        <div style={{ marginTop: 16 }}>
          <Rotulo>Taxa aplicada</Rotulo>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TAXAS_IVA.map(t => (
              <button key={t.taxa} onClick={() => setTaxa(t.taxa)}
                title={t.nota}
                style={{ flex: 1, minWidth: 74, background: taxa === t.taxa ? COR.tinta : "#F6F0E8",
                         color: taxa === t.taxa ? "#fff" : "#4A5055", border: "none", borderRadius: 9,
                         padding: "10px 6px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                {t.rotulo}
                <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2,
                              color: taxa === t.taxa ? "#A7AFB8" : "#8E9398" }}>{t.nota}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, background: "#FAF6F0", borderRadius: 10, padding: "12px 14px",
                      display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
          <div>
            <div style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)" }}>SEM IVA</div>
            <div style={{ fontFamily: "var(--fonte-numero)", fontWeight: 700, color: COR.tinta }}>{fmtEUR(previsto.base)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)" }}>IVA</div>
            <div style={{ fontFamily: "var(--fonte-numero)", fontWeight: 700, color: COR.abater }}>{fmtEUR(previsto.iva)}</div>
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: "#9DA2A6", marginTop: 8, lineHeight: 1.5 }}>
          A base e o IVA são recalculados a partir do total. Se o total estiver errado,
          corrige-o primeiro na fatura, no Contas a Pagar.
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onFechar}
            style={{ background: "none", border: "1px solid #E3D9CC", borderRadius: 8, padding: "8px 16px",
                     fontSize: 12, color: "#6E7378", cursor: "pointer" }}>Cancelar</button>
          <button disabled={aGuardar}
            onClick={async () => { setAGuardar(true); await onGuardar(taxa); setAGuardar(false); }}
            style={{ background: aGuardar ? "#C4C7CA" : "#091C2A", color: "#fff", border: "none",
                     borderRadius: 8, padding: "8px 20px", fontSize: 12, fontWeight: 600,
                     cursor: aGuardar ? "default" : "pointer" }}>
            {aGuardar ? "A guardar..." : "Guardar taxa"}
          </button>
        </div>
      </div>
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
        <div style={{ fontSize: 16, fontWeight: 700, color: COR.tinta, fontFamily: "var(--fonte-titulo)" }}>
          Registar pagamento do IVA — {t.rotulo}
        </div>
        <div style={{ fontSize: 11.5, color: "#7E8388", marginTop: 6, lineHeight: 1.6 }}>
          {nomeEmpresa(empresa)} · apurado {fmtEUR(t.saldo)} · data limite {fmtData(t.dataLimite)}
        </div>

        {[["Valor pago (€)", valor, setValor, "text"], ["Data do pagamento", data, setData, "date"],
          ["Observações", obs, setObs, "text"]].map(([rot, v, set, tipo]) => (
          <div key={rot} style={{ marginTop: 12 }}>
            <Rotulo>{rot}</Rotulo>
            <input type={tipo} value={v} onChange={e => set(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E3D9CC",
                       borderRadius: 9, padding: "9px 11px", fontSize: 13 }} />
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onFechar}
            style={{ background: "none", border: "1px solid #E3D9CC", borderRadius: 8, padding: "8px 16px",
                     fontSize: 12, color: "#6E7378", cursor: "pointer" }}>Cancelar</button>
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
            style={{ background: aGuardar ? "#C4C7CA" : "#091C2A", color: "#fff", border: "none",
                     borderRadius: 8, padding: "8px 20px", fontSize: 12, fontWeight: 600,
                     cursor: aGuardar ? "default" : "pointer" }}>
            {aGuardar ? "A guardar..." : "Registar pagamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
