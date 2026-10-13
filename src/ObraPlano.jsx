import React, { useState, useMemo } from "react";
import { fmtEUR, fmtData } from "./formato.js";
import {
  planearObra, planearAplicacao, gastoEmObra, sugerirAvenca, planoDesatualizado,
  compararPrazos, categoriasDoMotor, classificacaoDe, temObra, rotuloMes,
  PLANO_VAZIO, TIPOS, ROTULO_TIPO,
} from "./obra.js";
import { hojeISO, arred2 } from "./iva.js";

// ─────────────────────────────────────────────────────────────────────────────
// PLANO DE OBRA
//
// Um ecrã de inputs com uma pré-visualização ao lado. Nada é gravado até se
// carregar em aplicar, e o que vai ser apagado é dito antes, com nomes e
// valores — porque apagar previsões de outra pessoa sem as mostrar é como
// este género de automatismo costuma correr mal.
// ─────────────────────────────────────────────────────────────────────────────

const COR = { tinta: "#1a1a2e", cinza: "#8a8f99", alerta: "#dc2626",
              bom: "#15803d", banco: "#4a6fa5", aviso: "#b45309" };

const Rotulo = ({ children, dica }) => (
  <div title={dica} style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase",
                             fontFamily: "monospace", letterSpacing: "0.06em", marginBottom: 4 }}>
    {children}
  </div>
);

const campo = {
  width: "100%", boxSizing: "border-box", background: "#f8f8f8",
  border: "1px solid #e8e8e8", borderRadius: 8, padding: "9px 11px",
  fontSize: 13, outline: "none",
};

const Caixa = ({ titulo, children, nota }) => (
  <div style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: "14px 16px" }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: COR.tinta, marginBottom: nota ? 2 : 10 }}>{titulo}</div>
    {nota && <div style={{ fontSize: 10.5, color: "#aaa", marginBottom: 10, lineHeight: 1.5 }}>{nota}</div>}
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
  </div>
);

// Um número com unidade. Guarda texto para não lutar com o cursor enquanto se
// escreve; a conversão é feita na leitura.
function Numero({ rotulo, valor, onMudar, sufixo = "€", dica, sugestao, onSugestao }) {
  return (
    <div>
      <Rotulo dica={dica}>{rotulo}</Rotulo>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="number" value={valor ?? ""} onChange={e => onMudar(e.target.value)}
          style={{ ...campo, textAlign: "right", fontFamily: "monospace" }} />
        <span style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace", minWidth: 16 }}>{sufixo}</span>
      </div>
      {sugestao != null && (
        <button onClick={() => onSugestao(sugestao.valor)}
          title={`Média do que já pagaste nesta rubrica, em ${sugestao.meses} ${sugestao.meses === 1 ? "mês" : "meses"} com fatura`}
          style={{ marginTop: 5, background: "#f0f4ff", border: "none", color: COR.banco,
                   padding: "3px 9px", borderRadius: 6, fontSize: 10.5, cursor: "pointer" }}>
          usar {fmtEUR(sugestao.valor)} (média das faturas)
        </button>
      )}
    </div>
  );
}

const nomeDoTipo = (t) => ROTULO_TIPO[t] || t;

// ─── O ecrã ──────────────────────────────────────────────────────────────────
export default function ModalPlanoObra({
  empresa, grupo = "LPX", nomeEmpresa, plano: planoGravado,
  faturas = [], pagamentos = [], currentUser,
  onGuardar, onAplicar, onFechar, hoje = hojeISO(),
}) {
  const [f, setF] = useState(() => ({ ...PLANO_VAZIO, ...(planoGravado || {}), empresa }));
  const [aGravar, setAGravar] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [simular, setSimular] = useState("");       // data de fim alternativa

  const muda = (k) => (v) => setF(x => ({ ...x, [k]: v }));

  const cats = useMemo(() => categoriasDoMotor(grupo), [grupo]);
  const catObra = classificacaoDe("obra", grupo).categoria;
  const catFisc = classificacaoDe("fiscalizacao", grupo).categoria;
  const catCso  = classificacaoDe("cso", grupo).categoria;

  // O que já se gastou sai das faturas reais — nunca se escreve à mão.
  const gasto = useMemo(
    () => gastoEmObra(faturas, { empresa, categorias: [catObra], taxaIva: f.taxa_iva_obra }),
    [faturas, empresa, catObra, f.taxa_iva_obra]);

  const sugFisc = useMemo(
    () => sugerirAvenca(faturas, { empresa, categorias: [catFisc] }), [faturas, empresa, catFisc]);
  const sugCso = useMemo(
    () => sugerirAvenca(faturas, { empresa, categorias: [catCso] }), [faturas, empresa, catCso]);

  const resultado = useMemo(
    () => planearObra(f, { gastoObra: gasto, hoje, grupo }), [f, gasto, hoje, grupo]);
  const { linhas, resumo, avisos } = resultado;

  const aplicacao = useMemo(() => planearAplicacao({
    linhas, pagamentosExistentes: pagamentos, empresa, grupo,
    primeiroMes: resumo.primeiroMes, hoje,
  }), [linhas, pagamentos, empresa, grupo, resumo.primeiroMes, hoje]);

  const comparacao = useMemo(() => {
    if (!simular || !f.data_fim || simular === f.data_fim) return null;
    try { return compararPrazos(f, { gastoObra: gasto, hoje, grupo }, simular); }
    catch { return null; }
  }, [simular, f, gasto, hoje, grupo]);

  const desatualizado = planoDesatualizado(planoGravado, gasto);
  const podeAplicar = linhas.length > 0 && !aGravar;

  const aplicar = async () => {
    setAGravar(true);
    try {
      const r = await onAplicar({
        plano: { ...f, empresa, id: empresa,
                 calculado_em: new Date().toISOString(), gasto_no_calculo: gasto,
                 updated_by: currentUser?.nome || "" },
        aCriar: aplicacao.aCriar,
        idsAApagar: aplicacao.idsAApagar,
      });
      if (r?.error) {
        alert(/obra_planos|plano_obra|plano_tipo|subcategoria|column/i.test(r.error.message || "")
          ? "Falta a base do plano de obra.\n\nCorre no Supabase obra-1-tabela-planos.sql e obra-2-marcas-nas-previsoes.sql."
          : "Não foi possível aplicar:\n\n" + (r.error.message || r.error));
        return;
      }
      setConfirmar(false);
      onFechar?.();
    } finally { setAGravar(false); }
  };

  const guardarSoInputs = async () => {
    setAGravar(true);
    try {
      const r = await onGuardar({ ...f, empresa, id: empresa, updated_by: currentUser?.nome || "" });
      if (r?.error) alert("Não foi possível guardar:\n\n" + (r.error.message || r.error));
      else onFechar?.();
    } finally { setAGravar(false); }
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onFechar?.(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(10,10,15,0.55)", display: "flex",
               alignItems: "center", justifyContent: "center", zIndex: 320, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 1080,
                    maxHeight: "92vh", display: "flex", flexDirection: "column" }}>

        {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #f0f0f0",
                      display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: COR.tinta, fontFamily: "Georgia,serif" }}>
              Plano de obra — {nomeEmpresa || empresa}
            </div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>
              Tudo o que está agarrado ao prazo. Mudar a data de fim recalcula o fluxo.
            </div>
          </div>
          {desatualizado && (
            <span title="Entraram faturas de obra desde o último recálculo: as previsões já não batem certo com o que falta gastar."
              style={{ background: "#fef3c7", color: COR.aviso, fontSize: 10.5, fontWeight: 700,
                       padding: "4px 10px", borderRadius: 20, fontFamily: "monospace" }}>
              desatualizado
            </span>
          )}
          <button onClick={onFechar} style={{ marginLeft: "auto", background: "none", border: "none",
                                              fontSize: 20, cursor: "pointer", color: "#bbb" }}>✕</button>
        </div>

        {/* ── Corpo ─────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) 1fr",
                      gap: 18, padding: 22, overflowY: "auto" }}>

          {/* Inputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Caixa titulo="Prazo" nota="É daqui que tudo se move.">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <Rotulo>Início da obra</Rotulo>
                  <input type="date" value={f.data_inicio || ""} style={campo}
                    onChange={e => muda("data_inicio")(e.target.value)} />
                </div>
                <div>
                  <Rotulo>Fim da obra</Rotulo>
                  <input type="date" value={f.data_fim || ""} style={campo}
                    onChange={e => muda("data_fim")(e.target.value)} />
                </div>
              </div>
            </Caixa>

            <Caixa titulo="Obra" nota="O budget é sem IVA. A fatura do empreiteiro sai pela base; o IVA é autoliquidado e entregue no apuramento do trimestre.">
              <Numero rotulo="Budget da empreitada (sem IVA)" valor={f.budget_obra}
                onMudar={muda("budget_obra")} />
              <Numero rotulo="Taxa de IVA da obra" sufixo="%" valor={f.taxa_iva_obra}
                onMudar={muda("taxa_iva_obra")} />
              <div style={{ background: "#f8f9fc", borderRadius: 9, padding: "10px 12px", fontSize: 11.5 }}>
                <Linha k="Já faturado (sem IVA)" v={fmtEUR(gasto)}
                  dica={`Soma da base das faturas de ${catObra} desta empresa. Vem do Contas a Pagar — não se escreve aqui.`} />
                <Linha k="Falta gastar" v={fmtEUR(resumo.porGastar)} forte />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12 }}>
                <input type="checkbox" checked={f.recuperar_iva !== false}
                  onChange={e => muda("recuperar_iva")(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: COR.tinta }} />
                O banco financia também o IVA, no dia do apuramento
              </label>
            </Caixa>

            <Caixa titulo="Avenças mensais" nota="Cobradas enquanto a obra durar. Esticar o prazo custa mais meses destas.">
              <Numero rotulo="Fiscalização / mês" valor={f.fiscalizacao_mensal}
                onMudar={muda("fiscalizacao_mensal")}
                sugestao={sugFisc} onSugestao={muda("fiscalizacao_mensal")} />
              <Numero rotulo="CSO / mês" valor={f.cso_mensal} onMudar={muda("cso_mensal")}
                sugestao={sugCso} onSugestao={muda("cso_mensal")} />
            </Caixa>

            <Caixa titulo="Financiamento" nota="Dois pagamentos, duas libertações: a base no vencimento da fatura, o IVA no dia 25 do apuramento. Os juros correm sobre o saldo médio do mês.">
              <Numero rotulo="Funding do banco" sufixo="%" valor={f.funding_pct}
                onMudar={muda("funding_pct")}
                dica="Percentagem que o banco liberta — aplica-se à base da fatura e, na data do apuramento, ao IVA." />
              <Numero rotulo="Comissão de avaliação (por libertação)" valor={f.comissao_avaliacao}
                onMudar={muda("comissao_avaliacao")} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Numero rotulo="Euribor" sufixo="%" valor={f.euribor} onMudar={muda("euribor")} />
                <Numero rotulo="Spread" sufixo="%" valor={f.spread} onMudar={muda("spread")} />
              </div>
              <Numero rotulo="Dívida já libertada hoje" valor={f.divida_inicial}
                onMudar={muda("divida_inicial")}
                dica="O que o banco já libertou (o tranche do terreno, por exemplo). É sobre isto que começam a contar os juros." />
              <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }}>
                Taxa all-in: {arred2((Number(f.euribor) || 0) + (Number(f.spread) || 0))}% ao ano
              </div>
            </Caixa>
          </div>

          {/* Pré-visualização */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {avisos.length > 0 && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10,
                            padding: "11px 14px", fontSize: 11.5, color: "#92400e", lineHeight: 1.7 }}>
                {avisos.map((a, i) => <div key={i}>{a}</div>)}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <Cartao rotulo="Meses por correr" valor={String(resumo.meses)}
                nota={resumo.primeiroMes ? `${rotuloMes(resumo.primeiroMes)} → ${rotuloMes(resumo.ultimoMes)}` : "—"} />
              <Cartao rotulo="Custo até ao fim" valor={fmtEUR(resumo.custoTotal)} cor={COR.alerta}
                nota="o que sai mesmo do bolso: já líquido do funding" />
              <Cartao rotulo="Dívida no fim" valor={fmtEUR(resumo.dividaFinal)} cor={COR.banco}
                nota="inicial + libertações de base e de IVA" />
            </div>

            <div style={{ border: "1px solid #f0f0f0", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#fafbfc" }}>
                    {["O que o motor vai lançar", "Linhas", "Por mês", "Total"].map((h, i) => (
                      <th key={h} style={{ padding: "9px 14px", textAlign: i === 0 ? "left" : "right",
                                           color: "#aaa", fontSize: 9.5, textTransform: "uppercase",
                                           fontFamily: "monospace", borderBottom: "1px solid #f0f0f0" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIPOS.map(t => {
                    const ls = linhas.filter(l => l.plano_tipo === t);
                    if (!ls.length) return null;
                    const total = resumo.totais[t];
                    const entrada = ls[0].tipo === "entrada";
                    return (
                      <tr key={t} style={{ borderBottom: "1px solid #fafafa" }}>
                        <td style={{ padding: "8px 14px" }}>
                          {nomeDoTipo(t)}
                          {entrada && <span style={{ marginLeft: 6, background: "#dcfce7", color: COR.bom,
                            fontSize: 8.5, fontFamily: "monospace", fontWeight: 700,
                            padding: "1px 5px", borderRadius: 3 }}>entrada</span>}
                        </td>
                        <td style={{ padding: "8px 14px", textAlign: "right", color: "#888", fontFamily: "monospace" }}>{ls.length}</td>
                        <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "monospace", color: "#888" }}>
                          {ls.length ? fmtEUR(Math.abs(total) / ls.length) : "—"}
                        </td>
                        <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "monospace",
                                     fontWeight: 700, color: entrada ? COR.bom : COR.tinta }}>
                          {entrada ? "+" : ""}{fmtEUR(Math.abs(total))}
                        </td>
                      </tr>
                    );
                  })}
                  {linhas.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: 26, textAlign: "center", color: "#ccc", fontSize: 12 }}>
                      Preenche o prazo e o budget para ver o plano.
                    </td></tr>
                  )}
                  {linhas.length > 0 && (
                    <tr style={{ background: COR.tinta }}>
                      <td style={{ padding: "9px 14px", color: "#fff", fontWeight: 700 }}>Custo total até ao fim da obra</td>
                      <td style={{ padding: "9px 14px", textAlign: "right", color: "#8b93a3", fontFamily: "monospace" }}>{linhas.length}</td>
                      <td />
                      <td style={{ padding: "9px 14px", textAlign: "right", color: "#fca5a5",
                                   fontFamily: "monospace", fontWeight: 800 }}>{fmtEUR(resumo.custoTotal)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* E se o prazo escorregar? */}
            {linhas.length > 0 && (
              <div style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: "13px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: COR.tinta, marginBottom: 3 }}>
                  E se a obra escorregar?
                </div>
                <div style={{ fontSize: 10.5, color: "#aaa", marginBottom: 10, lineHeight: 1.5 }}>
                  Experimenta uma data de fim diferente. Não grava nada — é só para ver o custo.
                </div>
                <input type="date" value={simular} onChange={e => setSimular(e.target.value)}
                  style={{ ...campo, width: 180 }} />
                {comparacao && (
                  <div style={{ marginTop: 10, background: comparacao.custoAMais > 0 ? "#fef2f2" : "#f0fdf4",
                                border: `1px solid ${comparacao.custoAMais > 0 ? "#fecaca" : "#bbf7d0"}`,
                                borderRadius: 10, padding: "11px 14px" }}>
                    <div style={{ fontSize: 13, color: comparacao.custoAMais > 0 ? COR.alerta : COR.bom,
                                  fontWeight: 700 }}>
                      {comparacao.mesesAMais > 0 ? "+" : ""}{comparacao.mesesAMais} meses
                      {" → "}
                      {comparacao.custoAMais > 0 ? "+" : ""}{fmtEUR(comparacao.custoAMais)} de custo
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 7,
                                  fontSize: 11, color: "#777", fontFamily: "monospace" }}>
                      {[["fiscalização", "fiscalizacao"], ["CSO", "cso"],
                        ["juros", "juros"], ["avaliações", "comissao"], ["obra", "obra"]].map(([r, k]) => (
                        <span key={k}>{r} {comparacao.diferencas[k] > 0 ? "+" : ""}{fmtEUR(comparacao.diferencas[k])}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 10.5, color: "#999", marginTop: 7, lineHeight: 1.5 }}>
                      A obra em si não muda — é o mesmo budget diluído por mais meses. O que custa
                      são as avenças e os juros a correrem mais tempo.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Rodapé: o que vai acontecer ───────────────────────────────── */}
        <div style={{ borderTop: "1px solid #f0f0f0", padding: "14px 24px" }}>
          {!confirmar ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11.5, color: "#888", lineHeight: 1.6 }}>
                Aplicar cria <strong style={{ color: COR.tinta }}>{aplicacao.resumo.criar} previsões</strong>
                {aplicacao.idsAApagar.length > 0 && <>
                  {" e apaga "}
                  <strong style={{ color: COR.alerta }}>{aplicacao.idsAApagar.length}</strong>
                  {" que lá estão"}
                </>}.
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button onClick={onFechar}
                  style={{ background: "none", border: "1px solid #e8e8e8", borderRadius: 8,
                           padding: "9px 16px", fontSize: 12, color: "#777", cursor: "pointer" }}>Cancelar</button>
                <button onClick={guardarSoInputs} disabled={aGravar}
                  title="Guarda os valores sem mexer no Fluxo Futuro"
                  style={{ background: "#f4f5f7", border: "none", borderRadius: 8, padding: "9px 16px",
                           fontSize: 12, color: "#555", cursor: "pointer", fontWeight: 600 }}>
                  Guardar sem aplicar
                </button>
                <button onClick={() => setConfirmar(true)} disabled={!podeAplicar}
                  style={{ background: podeAplicar ? COR.tinta : "#e8e8e8",
                           color: podeAplicar ? "#fff" : "#aaa", border: "none", borderRadius: 8,
                           padding: "9px 22px", fontSize: 12, fontWeight: 700,
                           cursor: podeAplicar ? "pointer" : "default" }}>
                  Recalcular o fluxo
                </button>
              </div>
            </div>
          ) : (
            <Confirmacao aplicacao={aplicacao} aGravar={aGravar}
              onVoltar={() => setConfirmar(false)} onAplicar={aplicar} cats={cats} />
          )}
        </div>
      </div>
    </div>
  );
}

const Linha = ({ k, v, forte, dica }) => (
  <div title={dica} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
    <span style={{ color: "#888" }}>{k}</span>
    <span style={{ fontFamily: "monospace", fontWeight: forte ? 700 : 400, color: COR.tinta }}>{v}</span>
  </div>
);

const Cartao = ({ rotulo, valor, nota, cor }) => (
  <div style={{ border: "1px solid #f0f0f0", borderRadius: 11, padding: "11px 14px" }}>
    <Rotulo>{rotulo}</Rotulo>
    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: cor || COR.tinta }}>{valor}</div>
    {nota && <div style={{ fontSize: 9.5, color: "#bbb", marginTop: 3, lineHeight: 1.4 }}>{nota}</div>}
  </div>
);

// ─── A confirmação ───────────────────────────────────────────────────────────
// Antes de apagar o trabalho de alguém, mostra-se o que vai desaparecer: a
// descrição, a data e o valor, linha a linha.
function Confirmacao({ aplicacao, aGravar, onVoltar, onAplicar, cats }) {
  const { aApagarManuais, aApagarDoMotor, resumo } = aplicacao;
  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: COR.tinta, fontWeight: 700 }}>Antes de aplicar:</div>
        <div style={{ fontSize: 11.5, color: "#888" }}>
          entram <strong style={{ color: COR.bom }}>{resumo.criar}</strong> previsões novas
          {" · "}saem <strong style={{ color: COR.alerta }}>{resumo.apagarManuais}</strong> previsões tuas
          {" · "}substituem-se <strong>{resumo.apagarMotor}</strong> de um recálculo anterior
          {resumo.protegidas > 0 && <> · ficam intactas <strong>{resumo.protegidas}</strong> já pagas ou convertidas</>}
        </div>
      </div>

      {aApagarManuais.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10,
                      padding: "11px 14px", marginBottom: 10, maxHeight: 150, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c", marginBottom: 6 }}>
            Estas previsões que lançaste vão desaparecer ({fmtEUR(resumo.valorManuais)}):
          </div>
          {aApagarManuais.map(p => (
            <div key={p.id} style={{ fontSize: 11, color: "#7f1d1d", display: "flex", gap: 10,
                                     justifyContent: "space-between", padding: "2px 0" }}>
              <span>{fmtData(p.data_inicio)} · {p.categoria} · {p.descricao || "—"}</span>
              <span style={{ fontFamily: "monospace" }}>{fmtEUR(p.valor)}</span>
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: "#991b1b", marginTop: 7, lineHeight: 1.5 }}>
            Só saem previsões das categorias que o motor passa a gerir ({cats.join(", ")}),
            e só de hoje para a frente. Tudo o resto fica como está.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onVoltar} disabled={aGravar}
          style={{ background: "none", border: "1px solid #e8e8e8", borderRadius: 8,
                   padding: "9px 16px", fontSize: 12, color: "#777", cursor: "pointer" }}>Voltar</button>
        <button onClick={onAplicar} disabled={aGravar}
          style={{ background: aGravar ? "#c9cdd4" : COR.alerta, color: "#fff", border: "none",
                   borderRadius: 8, padding: "9px 22px", fontSize: 12, fontWeight: 700,
                   cursor: aGravar ? "default" : "pointer" }}>
          {aGravar ? "A aplicar..." : "Sim, aplicar ao fluxo"}
        </button>
      </div>
    </div>
  );
}

// ─── O gatilho, para o cabeçalho do Fluxo Futuro ─────────────────────────────
export function BotaoPlanoObra({ empresa, plano, faturas = [], grupo = "LPX", onAbrir }) {
  if (!temObra(empresa)) return null;
  const gasto = gastoEmObra(faturas, {
    empresa, categorias: [classificacaoDe("obra", grupo).categoria],
    taxaIva: plano?.taxa_iva_obra ?? 23,
  });
  const desatualizado = planoDesatualizado(plano, gasto);
  const semPlano = !plano || !plano.data_fim;

  return (
    <button onClick={onAbrir}
      title={semPlano ? "Definir o prazo e o budget da obra deste projeto"
           : desatualizado ? "Entraram faturas de obra desde o último recálculo"
           : "Rever o plano de obra e recalcular o fluxo"}
      style={{ background: desatualizado ? "#fef3c7" : semPlano ? "#f4f5f7" : "#eef2ff",
               color: desatualizado ? COR.aviso : semPlano ? "#666" : "#4338ca",
               border: "none", padding: "8px 14px", borderRadius: 8, fontSize: 12,
               cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
      {desatualizado ? "⚠ Plano de obra" : "Plano de obra"}
      {!semPlano && plano.data_fim && (
        <span style={{ marginLeft: 7, fontFamily: "monospace", fontSize: 10.5, opacity: 0.75 }}>
          fim {fmtData(plano.data_fim)}
        </span>
      )}
    </button>
  );
}
