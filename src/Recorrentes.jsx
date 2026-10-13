import React, { useState, useMemo, useEffect } from "react";
import { fmtEUR, fmtData } from "./formato.js";
import { COR, RAIO } from "./brand.js";
import { categoriasDa, subcategoriasDa, usaSubcategoria } from "./categoriasEmpresa.js";
import { CATEGORIAS } from "./categorias.js";
import { PERIODICIDADES, rotuloPeriodicidade, ocorrenciasDe,
         resumoDaRegra, validarRegra } from "./recorrentes.js";

// ─────────────────────────────────────────────────────────────────────────────
// DESPESAS RECORRENTES — o painel
//
// Uma regra por despesa: descritivo, valor, de quando a quando. O que o ecrã
// tem de deixar óbvio é a data de fim, porque é ela que manda — é lá que se
// pára uma despesa, não apagando linhas uma a uma.
// ─────────────────────────────────────────────────────────────────────────────

const hojeISO = () => new Date().toISOString().slice(0, 10);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const VAZIA = {
  id: null, empresa: "", tipo: "saida", descricao: "", categoria: "", subcategoria: "",
  valor: "", data_inicio: hojeISO(), data_fim: "", periodicidade: "mensal",
  ativa: true, obs: "",
};

const campo = {
  width: "100%", boxSizing: "border-box", background: COR.papel,
  border: `1px solid ${COR.linha}`, borderRadius: RAIO.pequeno,
  padding: "8px 10px", fontSize: 12.5, outline: "none", color: COR.texto,
};
const Rotulo = ({ children, dica }) => (
  <div title={dica} style={{ fontSize: 9, color: COR.textoTenue, textTransform: "uppercase",
                             letterSpacing: "0.12em", marginBottom: 5, fontWeight: 500 }}>{children}</div>
);

// ─── O botão que abre o painel ───────────────────────────────────────────────
export function BotaoRecorrentes({ empresa, recorrentes = [], onAbrir }) {
  // Uma despesa recorrente é de uma empresa. No consolidado o botão fica à
  // vista mas apagado, para se saber que existe e o que falta fazer.
  if (!empresa || empresa === "all") {
    return (
      <button disabled title="Escolha primeiro um projeto: uma despesa recorrente é de uma empresa"
        style={{ background: COR.fundoTenue, border: `1px solid ${COR.linha}`,
                 color: COR.textoApagado, padding: "7px 14px", borderRadius: 8,
                 fontSize: 12, cursor: "default", fontWeight: 500 }}>
        ↻ Despesas recorrentes
      </button>
    );
  }
  const minhas = recorrentes.filter(r => r.empresa === empresa && r.ativa !== false);
  const aCorrer = minhas.filter(r => !r.data_fim || r.data_fim >= hojeISO()).length;
  return (
    <button onClick={onAbrir}
      title="Despesas que se repetem todos os meses até uma data de fim"
      style={{ background: COR.fundoSuave, border: `1px solid ${COR.linhaForte}`,
               color: COR.texto, padding: "7px 14px", borderRadius: 8, fontSize: 12,
               cursor: "pointer", fontWeight: 500 }}>
      ↻ Despesas recorrentes
      {aCorrer > 0 && (
        <span style={{ marginLeft: 7, background: COR.ouroTenue, color: COR.ouroEscuro,
                       borderRadius: 999, padding: "1px 7px", fontSize: 10.5, fontWeight: 600 }}>
          {aCorrer}
        </span>
      )}
    </button>
  );
}

// ─── O painel ────────────────────────────────────────────────────────────────
export default function ModalRecorrentes({
  empresa, nomeEmpresa, recorrentes = [], currentUser,
  onGuardar, onApagar, onFechar, hoje = hojeISO(),
}) {
  const [f, setF] = useState({ ...VAZIA, empresa });
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState("");
  const [aApagar, setAApagar] = useState(null);     // id à espera de confirmação

  const podeEditar = currentUser?.role === "admin" || currentUser?.role === "gestor";
  const minhas = useMemo(
    () => recorrentes.filter(r => r.empresa === empresa)
      .sort((a, b) => String(a.descricao).localeCompare(String(b.descricao), "pt")),
    [recorrentes, empresa]);

  const plano = categoriasDa(empresa) || CATEGORIAS;
  const comSub = usaSubcategoria(empresa);
  const subs = comSub ? subcategoriasDa(empresa, f.categoria) : [];

  useEffect(() => { setF(x => ({ ...x, empresa })); }, [empresa]);

  const muda = (k) => (v) => setF(x => ({
    ...x, [k]: v,
    ...(k === "categoria" && comSub ? { subcategoria: "" } : {}),
  }));

  const emEdicao = !!f.id;
  const erros = validarRegra({ ...f, valor: num(f.valor) });

  // A pré-visualização: nada convence tanto como ver as datas que vão sair.
  const previsao = useMemo(() => {
    if (erros.length) return [];
    return ocorrenciasDe({ ...f, valor: num(f.valor) },
      { de: hoje, ate: f.data_fim || null }).slice(0, 60);
  }, [f, erros.length, hoje]);
  const totalPrevisto = previsao.reduce((s, o) => s + o.valor, 0);

  const limpar = () => { setF({ ...VAZIA, empresa }); setErro(""); };

  const gravar = async () => {
    if (erros.length || aGravar) return;
    setAGravar(true); setErro("");
    const linha = {
      ...(f.id ? { id: f.id } : {}),
      empresa: f.empresa, tipo: f.tipo, descricao: String(f.descricao).trim(),
      categoria: f.categoria || "", subcategoria: f.subcategoria || "",
      valor: num(f.valor), data_inicio: f.data_inicio,
      data_fim: f.data_fim || null, periodicidade: f.periodicidade,
      ativa: f.ativa !== false, obs: f.obs || "",
      criado_por: currentUser?.nome || currentUser?.email || "",
    };
    const r = await onGuardar?.(linha);
    setAGravar(false);
    if (r?.error) { setErro(r.error.message || "Não foi possível gravar."); return; }
    limpar();
  };

  const editar = (r) => setF({
    ...VAZIA, ...r,
    valor: String(r.valor ?? ""),
    data_fim: r.data_fim || "",
    subcategoria: r.subcategoria || "",
  });

  // Parar é pôr a data de fim em hoje: o que já aconteceu fica na história.
  const parar = async (r) => {
    await onGuardar?.({ ...r, data_fim: hoje });
  };

  const apagar = async (id) => {
    const r = await onApagar?.(id);
    setAApagar(null);
    if (r?.error) setErro(r.error.message || "Não foi possível apagar.");
    if (f.id === id) limpar();
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onFechar?.(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(9,28,42,0.45)", zIndex: 1000,
               display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: COR.papel, borderRadius: RAIO.grande, width: "min(1020px, 100%)",
                    maxHeight: "92vh", display: "flex", flexDirection: "column",
                    boxShadow: "0 24px 64px rgba(9,28,42,0.22)" }}>

        {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${COR.linha}`,
                      display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: COR.texto,
                          fontFamily: "var(--fonte-titulo)" }}>
              Despesas recorrentes — {nomeEmpresa || empresa}
            </div>
            <div style={{ fontSize: 11.5, color: COR.textoSuave, marginTop: 2 }}>
              O que se repete todos os meses. Guarda-se a regra, não as linhas:
              mudar a data de fim pára a despesa de uma vez.
            </div>
          </div>
          <button onClick={onFechar} style={{ marginLeft: "auto", background: "none", border: "none",
                                              fontSize: 20, cursor: "pointer", color: COR.textoApagado }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 360px) 1fr",
                      gap: 18, padding: 20, overflowY: "auto" }}>

          {/* ── O formulário ─────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COR.texto }}>
              {emEdicao ? "Alterar a despesa" : "Nova despesa recorrente"}
            </div>

            <div>
              <Rotulo>Descritivo</Rotulo>
              <input value={f.descricao} onChange={e => muda("descricao")(e.target.value)}
                placeholder="Contabilidade, seguro, limpeza..." style={campo} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <Rotulo>Valor por ocorrência</Rotulo>
                <input type="number" step="0.01" value={f.valor}
                  onChange={e => muda("valor")(e.target.value)} placeholder="150" style={campo} />
              </div>
              <div>
                <Rotulo>Tipo</Rotulo>
                <select value={f.tipo} onChange={e => muda("tipo")(e.target.value)} style={campo}>
                  <option value="saida">Saída</option>
                  <option value="entrada">Entrada</option>
                </select>
              </div>
            </div>

            <div>
              <Rotulo dica="As rubricas do plano de contas desta empresa">Categoria</Rotulo>
              <select value={f.categoria} onChange={e => muda("categoria")(e.target.value)} style={campo}>
                <option value="">—</option>
                {plano.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {comSub && (
              <div>
                <Rotulo>Subcategoria</Rotulo>
                <select value={f.subcategoria} onChange={e => muda("subcategoria")(e.target.value)} style={campo}>
                  <option value="">—</option>
                  {subs.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            <div>
              <Rotulo>Com que frequência</Rotulo>
              <select value={f.periodicidade} onChange={e => muda("periodicidade")(e.target.value)} style={campo}>
                {PERIODICIDADES.map(p => <option key={p.v} value={p.v}>{p.r}</option>)}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <Rotulo>Começa em</Rotulo>
                <input type="date" value={f.data_inicio}
                  onChange={e => muda("data_inicio")(e.target.value)} style={campo} />
              </div>
              <div>
                <Rotulo dica="Deixar em branco é uma despesa sem fim previsto">Até quando</Rotulo>
                <input type="date" value={f.data_fim}
                  onChange={e => muda("data_fim")(e.target.value)} style={campo} />
              </div>
            </div>
            {!f.data_fim && (
              <div style={{ fontSize: 10.5, color: COR.alertaForte, background: COR.alertaFundo,
                            border: `1px solid ${COR.alertaLinha}`, borderRadius: 7,
                            padding: "7px 10px", lineHeight: 1.5 }}>
                Sem data de fim, esta despesa corre até onde o fluxo for. Pode sempre
                pôr-se uma data mais tarde — é assim que se pára.
              </div>
            )}

            <div>
              <Rotulo>Observação</Rotulo>
              <input value={f.obs} onChange={e => muda("obs")(e.target.value)}
                placeholder="opcional" style={campo} />
            </div>

            {erros.length > 0 && f.descricao !== "" && (
              <div style={{ fontSize: 11, color: COR.negativoForte, lineHeight: 1.6 }}>
                {erros.map(e => <div key={e}>· {e}</div>)}
              </div>
            )}
            {erro && (
              <div style={{ fontSize: 11, color: COR.negativoForte, background: COR.negativoFundo,
                            border: `1px solid ${COR.negativoLinha}`, borderRadius: 7, padding: "7px 10px" }}>
                {erro}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={gravar} disabled={!podeEditar || erros.length > 0 || aGravar}
                style={{ flex: 1, background: (!podeEditar || erros.length) ? COR.linha : COR.navy,
                         color: (!podeEditar || erros.length) ? COR.textoTenue : COR.creme,
                         border: "none", padding: "10px 16px", borderRadius: 8, fontSize: 12.5,
                         fontWeight: 600, cursor: (!podeEditar || erros.length) ? "default" : "pointer" }}>
                {aGravar ? "A gravar..." : emEdicao ? "Guardar alterações" : "Criar despesa recorrente"}
              </button>
              {emEdicao && (
                <button onClick={limpar}
                  style={{ background: "transparent", border: `1px solid ${COR.linha}`,
                           color: COR.textoSuave, padding: "10px 14px", borderRadius: 8,
                           fontSize: 12, cursor: "pointer" }}>Cancelar</button>
              )}
            </div>
            {!podeEditar && (
              <div style={{ fontSize: 10.5, color: COR.textoTenue }}>
                Só um gestor ou administrador pode criar despesas recorrentes.
              </div>
            )}

            {/* ── O que isto vai lançar ─────────────────────────────────── */}
            {previsao.length > 0 && (
              <div style={{ background: COR.fundoSuave, borderRadius: 9, padding: "10px 12px" }}>
                <Rotulo>O que isto lança a partir de hoje</Rotulo>
                <div style={{ fontSize: 12.5, color: COR.texto, fontWeight: 600,
                              fontFamily: "var(--fonte-numero)" }}>
                  {previsao.length}{previsao.length === 60 ? "+" : ""} × {fmtEUR(num(f.valor))}
                  {" = "}{fmtEUR(totalPrevisto)}
                </div>
                <div style={{ fontSize: 10.5, color: COR.textoSuave, marginTop: 4, lineHeight: 1.5 }}>
                  {fmtData(previsao[0].data)}
                  {previsao.length > 1 && ` → ${fmtData(previsao[previsao.length - 1].data)}`}
                  {" · "}{rotuloPeriodicidade(f.periodicidade).toLowerCase()}
                </div>
              </div>
            )}
          </div>

          {/* ── A lista ──────────────────────────────────────────────────── */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: COR.texto, marginBottom: 9 }}>
              Nesta empresa ({minhas.length})
            </div>
            {minhas.length === 0 ? (
              <div style={{ padding: "34px 20px", textAlign: "center", color: COR.textoApagado,
                            fontSize: 12, border: `1px dashed ${COR.linha}`, borderRadius: 10 }}>
                Ainda não há despesas recorrentes nesta empresa.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {minhas.map(r => {
                  const res = resumoDaRegra(r, hoje);
                  const terminada = res.porVir === 0;
                  return (
                    <div key={r.id} style={{
                      border: `1px solid ${f.id === r.id ? COR.ouro : COR.linha}`,
                      borderRadius: 10, padding: "11px 13px",
                      background: terminada ? COR.fundoTenue : COR.papel,
                      opacity: terminada ? 0.72 : 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: COR.texto }}>
                          {r.descricao}
                        </div>
                        {r.categoria && (
                          <div style={{ fontSize: 10.5, color: COR.textoTenue }}>
                            {r.categoria}{r.subcategoria ? ` · ${r.subcategoria}` : ""}
                          </div>
                        )}
                        <div style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700,
                                      fontFamily: "var(--fonte-numero)",
                                      color: r.tipo === "entrada" ? COR.positivoForte : COR.texto }}>
                          {r.tipo === "entrada" ? "+" : "−"}{fmtEUR(Math.abs(num(r.valor)))}
                        </div>
                      </div>

                      <div style={{ fontSize: 11, color: COR.textoSuave, marginTop: 5, lineHeight: 1.6 }}>
                        {rotuloPeriodicidade(r.periodicidade)} · desde {fmtData(r.data_inicio)}
                        {r.data_fim ? ` até ${fmtData(r.data_fim)}` : " · sem fim previsto"}
                      </div>
                      <div style={{ fontSize: 11, marginTop: 3,
                                    color: terminada ? COR.textoTenue : COR.ouroEscuro }}>
                        {terminada
                          ? "Terminada — já não entra no fluxo"
                          : `Faltam ${res.porVir}${res.semFim ? "+" : ""} × ` +
                            `${fmtEUR(Math.abs(num(r.valor)))} = ${fmtEUR(Math.abs(res.total))}` +
                            (res.semFim ? " (no horizonte do fluxo)" : "")}
                      </div>
                      {r.obs && (
                        <div style={{ fontSize: 10.5, color: COR.textoTenue, marginTop: 3 }}>{r.obs}</div>
                      )}

                      {podeEditar && (
                        <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
                          <button onClick={() => editar(r)} style={botaoMini}>Alterar</button>
                          {!terminada && (
                            <button onClick={() => parar(r)}
                              title="Põe a data de fim em hoje: deixa de entrar no fluxo daqui para a frente"
                              style={botaoMini}>Parar hoje</button>
                          )}
                          {aApagar === r.id ? (
                            <>
                              <button onClick={() => apagar(r.id)}
                                style={{ ...botaoMini, borderColor: COR.negativoLinha,
                                         color: COR.negativoForte, fontWeight: 600 }}>
                                Apagar mesmo
                              </button>
                              <button onClick={() => setAApagar(null)} style={botaoMini}>Não</button>
                            </>
                          ) : (
                            <button onClick={() => setAApagar(r.id)}
                              title="Apagar é esquecer que existiu. Para a parar sem perder a história, use Parar hoje."
                              style={{ ...botaoMini, marginLeft: "auto", color: COR.negativoForte }}>
                              Apagar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: "13px 22px", borderTop: `1px solid ${COR.linha}`,
                      display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 11, color: COR.textoSuave }}>
            As recorrentes entram no Fluxo Futuro e no forecast do Real × Orçado.
            Para mexer só num mês, lance uma previsão normal nesse mês.
          </div>
          <button onClick={onFechar}
            style={{ marginLeft: "auto", background: COR.navy, color: COR.creme, border: "none",
                     padding: "9px 20px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                     cursor: "pointer" }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

const botaoMini = {
  background: "transparent", border: `1px solid ${COR.linha}`, borderRadius: 6,
  padding: "5px 11px", fontSize: 11, color: COR.textoSuave, cursor: "pointer",
};
