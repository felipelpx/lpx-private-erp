// ─────────────────────────────────────────────────────────────────────────────
// A MATRIZ DO FLUXO — despesas × meses
//
// Vive à parte do Fluxo Futuro porque não é só dele: o Investor Relations
// mostra exatamente a mesma grelha, com os mesmos números, apenas sem a
// possibilidade de mexer em nada. Duas versões da mesma tabela acabariam por
// discordar uma da outra — e o que um investidor vê tem de ser o que a equipa
// vê.
//
// Só edita quem pode: com `isAdmin` em falso não há um único botão, nem o
// "+ Despesa". O painel que abre ao clicar num valor continua a abrir, porque
// ver o detalhe não é editar.
//
// A aritmética está em src/matriz.js; aqui é só apresentação.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import { temFunding, pctFunding } from "./funding.js";
import { fmtEUR } from "./formato.js";

const fmtK = (v) => fmtEUR(v);
const fmtFull = (v) => fmtEUR(v);

export function BotaoFunding({ fonte, onAlternar, onPct }) {
  const ligado = temFunding(fonte);
  const pct = pctFunding(fonte);
  const [aEditar, setAEditar] = useState(false);
  const [rascunho, setRascunho] = useState(String(pct));

  const confirma = () => {
    setAEditar(false);
    const v = Math.min(100, Math.max(0, parseFloat(String(rascunho).replace(",", ".")) || 0));
    if (v !== pct) onPct(v);
  };

  if (ligado && aEditar) {
    return (
      <span onClick={e => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        <input autoFocus type="number" min="0" max="100" value={rascunho}
          onChange={e => setRascunho(e.target.value)}
          onBlur={confirma}
          onKeyDown={e => { if (e.key === "Enter") confirma(); if (e.key === "Escape") setAEditar(false); }}
          style={{ width: 46, border: "1px solid #7FBE9C", borderRadius: 5, padding: "2px 4px", fontSize: 10, fontFamily: "var(--fonte-numero)" }} />
        <span style={{ fontSize: 10, color: "#1F7A54" }}>%</span>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <button onClick={(e) => { e.stopPropagation(); onAlternar(); }}
        title={ligado
          ? "Despesa financiada pelo banco: o banco liberta o valor e a saída fica neutralizada no caixa. Clica para desligar."
          : "Marcar como financiada pelo banco — o fluxo passa a gerar a entrada correspondente"}
        style={{
          background: ligado ? "#E2EFE8" : "transparent",
          border: ligado ? "none" : "1px solid #E3D9CC",
          color: ligado ? "#1B6A49" : "#c0c4cc",
          padding: "3px 8px", borderRadius: ligado ? "5px 0 0 5px" : 5,
          fontSize: 10, cursor: "pointer", fontWeight: 700, marginLeft: 4, whiteSpace: "nowrap",
        }}>
        🏦{ligado ? "" : ""}
      </button>
      {ligado && (
        <button onClick={(e) => { e.stopPropagation(); setRascunho(String(pct)); setAEditar(true); }}
          title="Percentagem financiada pelo banco"
          style={{ background: "#C9E3D5", border: "none", color: "#1B6A49", padding: "3px 7px",
                   borderRadius: "0 5px 5px 0", fontSize: 10, cursor: "pointer", fontWeight: 700, fontFamily: "var(--fonte-numero)" }}>
          {pct}%
        </button>
      )}
    </span>
  );
}

// ─── AS AÇÕES DE UM LANÇAMENTO ───────────────────────────────────────────────
// O mesmo conjunto de botões em todo o lado: na lista do mês, nas vencidas e
// na matriz. Estavam copiados em dois sítios e já tinham divergido — um deles
// mostrava o botão das recorrentes, o outro não. Agora é um componente só, e
// o que se corrige corrige-se de uma vez.
export function AcoesDoItem({ item, isAdmin, acoes, corDaCategoria = "#EDF1F5", corDoTexto = "#2C4A63" }) {
  const parar = (fn) => (e) => { e.stopPropagation(); fn(); };
  const btn = (fundo, cor) => ({
    background: fundo, border: "none", color: cor, padding: "3px 8px",
    borderRadius: 5, fontSize: 10, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap",
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ background: corDaCategoria, color: corDoTexto, fontSize: 9, padding: "1px 6px",
                     borderRadius: 3, fontFamily: "var(--fonte-numero)" }}>{item.cat || "—"}</span>

      {isAdmin && item.tipo === "saida" && (item.pagamento || item.fatura) && (
        <BotaoFunding fonte={item.pagamento || item.fatura}
          onAlternar={() => acoes.alternarFunding(item)}
          onPct={(v) => acoes.definirFundingPct(item, v)} />
      )}

      {item._funding && (
        <span title={`Entrada do banco associada a "${item.funding_de}" — neutraliza a despesa no caixa`}
          style={{ background: "#EFF5F1", color: "#1B6A49", fontSize: 9, padding: "1px 6px",
                   borderRadius: 3, fontFamily: "var(--fonte-numero)", fontWeight: 700 }}>
          🏦 funding
        </span>
      )}

      {/* Uma ocorrência de recorrente não se edita sozinha: o que se edita é
          a regra, no painel. */}
      {item.origem === "Recorrente" && item.recorrente && (
        <button onClick={parar(() => acoes.abrirRecorrentes())}
          title={`Despesa recorrente "${item.recorrente.descricao}" — abrir o painel para alterar o valor ou a data de fim`}
          style={{ ...btn("#F6F0E8", "#7E8388"), border: "1px solid #E7DED2", fontWeight: 400 }}>
          ↻ recorrente
        </button>
      )}

      {isAdmin && item.origem === "Manual" && item.pagamento && (
        <>
          <button onClick={parar(() => acoes.marcarPago(item.pagamento))}
            title="Marcar como Pago (sai do fluxo)" style={btn("#E2EFE8", "#1F7A54")}>✓</button>
          <button onClick={parar(() => acoes.converter(item.pagamento))}
            title="Já recebi a fatura: converter esta previsão em custo real"
            style={btn("#F6ECD6", "#96702A")}>→ fatura</button>
          <button onClick={parar(() => acoes.editar(item.pagamento))}
            title="Editar pagamento" style={btn("#EDF1F5", "#2C4A63")}>✎</button>
          <button onClick={parar(() => acoes.apagar(item.pagamento))}
            title="Eliminar pagamento" style={btn("#FBEDEB", "#A93226")}>✕</button>
        </>
      )}

      {isAdmin && (item.origem === "Contas a Pagar" || item.origem === "Vencida") && item.fatura && (
        <>
          <button onClick={parar(() => acoes.marcarFaturaPaga(item.fatura))}
            title="Marcar fatura como Paga" style={btn("#E2EFE8", "#1F7A54")}>✓</button>
          <button onClick={parar(() => acoes.apagarFatura(item.fatura))}
            title="Eliminar fatura" style={btn("#FBEDEB", "#A93226")}>✕</button>
        </>
      )}

      {isAdmin && ["Sinal / reforço", "Escritura", "Comissão no CPCV", "Comissão na escritura"]
        .includes(item.origem) && item.venda && (
        <button onClick={parar(() => acoes.marcarVendaPaga(item.venda, item.origem, item))}
          title={item.tipo === "entrada" ? "Marcar como Recebido (sai do fluxo)" : "Marcar como Pago (sai do fluxo)"}
          style={btn("#E2EFE8", "#1F7A54")}>✓</button>
      )}
    </div>
  );
}

// ─── A MATRIZ: DESPESAS × MESES ──────────────────────────────────────────────
// Uma linha por despesa, uma coluna por mês — a vista das folhas de forecast.
// Os botões de cada lançamento não ocupam espaço na grelha: aparecem quando se
// clica no valor, que é onde a pessoa já está a olhar.
// As rubricas que o plano de obra preenche sozinho ficam marcadas a amarelo.
// Não é decoração: lançar uma despesa à mão numa destas é o caminho curto para
// a contar duas vezes — o próximo recálculo põe lá a dele ao lado da tua.
const AMARELO = "#FDF6E3";
const AMARELO_LINHA = "#E8D9A8";
const AMARELO_TEXTO = "#7A5A22";

export default function MatrizFluxo({ matriz, isAdmin, acoes, nMeses, onNMeses, onNovaDespesa,
                                      comVazios, rubricasDoPlano = null }) {
  const doPlano = (cat) => !!rubricasDoPlano &&
    rubricasDoPlano.has(String(cat || "").trim().toLowerCase());
  const [celula, setCelula] = useState(null);   // { linha, mes, x, y }
  // Que grupos estão abertos. Começa tudo fechado — abre-se a matriz para ver
  // o desenho, não dezasseis linhas de detalhe. E cada grupo é independente:
  // abrir um nunca fecha outro, por isso guarda-se um conjunto, não "o aberto".
  const [abertos, setAbertos] = useState(() => new Set());
  const chaveGrupo = (sec, g) => `${sec.tipo}|${g.categoria}`;
  const aberto = (sec, g) => abertos.has(chaveGrupo(sec, g));
  const alternar = (sec, g) => setAbertos(ant => {
    const novo = new Set(ant);
    const k = chaveGrupo(sec, g);
    if (novo.has(k)) novo.delete(k); else novo.add(k);
    return novo;
  });

  // Fechar com Escape ou com um clique fora
  useEffect(() => {
    if (!celula) return;
    const esc = (e) => { if (e.key === "Escape") setCelula(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [celula]);

  const { colunas, seccoes, liquido, porMostrar, foraDaJanela = 0 } = matriz;
  const larguraMes = 118;

  // "2026-11" → "nov/26". O label que vem do fluxo sai "11/2026" em pt-PT, e
  // numa grelha de doze colunas isso lê-se pior do que o mês escrito.
  const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun",
                     "jul", "ago", "set", "out", "nov", "dez"];
  const rotuloCol = (c) => {
    const m = /^(\d{4})-(\d{2})$/.exec(String(c.key || ""));
    return m ? `${MES_CURTO[Number(m[2]) - 1]}/${m[1].slice(2)}` : (c.label || c.key);
  };

  const thMes = {
    padding: "9px 10px", textAlign: "right", color: "#9DA2A6", fontSize: 10,
    letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "var(--fonte-numero)",
    borderBottom: "1px solid #E7DED2", whiteSpace: "nowrap", minWidth: larguraMes,
  };
  const colada = (fundo = "#fff") => ({
    position: "sticky", left: 0, zIndex: 2, background: fundo,
    boxShadow: "1px 0 0 #EFE8DE",
  });
  const celulaNum = {
    padding: "5px 10px", textAlign: "right", fontFamily: "var(--fonte-numero)",
    fontSize: 11.5, whiteSpace: "nowrap",
  };

  const abrir = (linha, mes, e) => {
    const itens = linha.itens[mes.key] || [];
    if (!itens.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    setCelula({ linha, mes, itens, x: r.left, y: r.bottom });
  };

  if (!colunas.length) return (
    <div style={{ padding: 40, textAlign: "center", color: "#9DA2A6", fontSize: 12 }}>
      Não há lançamentos para mostrar nesta empresa.
    </div>
  );

  return (
    <div>
      {/* Quantas colunas */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
                    borderBottom: "1px solid #E7DED2", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "#7E8388" }}>Meses:</span>
        {/* O número que conta é o que está à vista: se o utilizador pediu 6 meses
            e só há 3 com lançamentos, carregar em − tem de mostrar 2, não 5. */}
        <button onClick={() => onNMeses(Math.max(1, Math.min(nMeses, colunas.length) - 1))}
          disabled={colunas.length <= 1}
          title="Menos um mês"
          style={{ background: "#E7DED2", border: "none", color: "#5C6166", width: 26, height: 26,
                   borderRadius: 7, fontSize: 14, cursor: colunas.length > 1 ? "pointer" : "default",
                   opacity: colunas.length > 1 ? 1 : 0.4, lineHeight: 1 }}>−</button>
        <span style={{ fontFamily: "var(--fonte-numero)", fontSize: 12, fontWeight: 700,
                       color: "#091C2A", minWidth: 20, textAlign: "center" }}>{colunas.length}</span>
        <button onClick={() => onNMeses(Math.min(nMeses, colunas.length) + 1)}
          disabled={porMostrar === 0}
          title={porMostrar === 0 ? "Não há mais meses à frente — liga «meses vazios» para ver os meses sem lançamentos" : "Mais um mês"}
          style={{ background: "#091C2A", border: "none", color: "#fff", width: 26, height: 26,
                   borderRadius: 7, fontSize: 14, cursor: porMostrar > 0 ? "pointer" : "default",
                   opacity: porMostrar > 0 ? 1 : 0.4, lineHeight: 1 }}>+</button>
        {[3, 6, 12, 24].map(n => (
          <button key={n} onClick={() => onNMeses(n)}
            style={{ background: nMeses === n ? "#091C2A" : "transparent", color: nMeses === n ? "#fff" : "#7E8388",
                     border: `1px solid ${nMeses === n ? "#091C2A" : "#E7DED2"}`, padding: "3px 10px",
                     borderRadius: 7, fontSize: 11, cursor: "pointer", fontFamily: "var(--fonte-numero)" }}>{n}</button>
        ))}
        {porMostrar > 0 && (
          <span style={{ fontSize: 10.5, color: "#9DA2A6" }}
            title="A coluna TOTAL soma o fluxo todo, não só os meses à vista.">
            mais {porMostrar} {porMostrar === 1 ? "mês" : "meses"} à frente
            {foraDaJanela > 0.005 && (
              <strong style={{ color: AMARELO_TEXTO, marginLeft: 5 }}>
                ({fmtK(foraDaJanela)} fora da vista, já no total)
              </strong>
            )}
          </span>
        )}
        <div style={{ width: 1, height: 18, background: "#E7DED2", margin: "0 4px" }} />
        <button onClick={() => setAbertos(new Set(
            seccoes.flatMap(sec => sec.grupos.map(g => chaveGrupo(sec, g)))))}
          title="Abrir o detalhe de todos os grupos"
          style={{ background: "transparent", border: "1px solid #E7DED2", color: "#7E8388",
                   padding: "3px 10px", borderRadius: 7, fontSize: 11, cursor: "pointer" }}>
          ⊞ Expandir tudo
        </button>
        <button onClick={() => setAbertos(new Set())} disabled={abertos.size === 0}
          title="Voltar a agrupar"
          style={{ background: "transparent", border: "1px solid #E7DED2",
                   color: abertos.size ? "#7E8388" : "#C4C7CA",
                   padding: "3px 10px", borderRadius: 7, fontSize: 11,
                   cursor: abertos.size ? "pointer" : "default" }}>
          ⊟ Recolher tudo
        </button>
        <span style={{ marginLeft: "auto", fontSize: 10.5, color: "#9DA2A6" }}>
          clica num grupo para o abrir · clica num valor para ver{isAdmin ? " e tratar" : ""} os lançamentos
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#FAF6F0" }}>
              <th style={{ ...thMes, ...colada("#FAF6F0"), textAlign: "left", minWidth: 300 }}>Despesa</th>
              {colunas.map(c => <th key={c.key} style={thMes}>{rotuloCol(c)}</th>)}
              <th style={{ ...thMes, borderLeft: "1px solid #E7DED2" }}
                  title="Soma o fluxo inteiro desta despesa, incluindo os meses que não estão à vista.">
                Total{porMostrar > 0 ? " ⃰" : ""}
              </th>
            </tr>
          </thead>

          {seccoes.map(sec => (
            <tbody key={sec.tipo}>
              <tr style={{ background: sec.tipo === "entrada" ? "#F2F7F4" : "#FBF7F1" }}>
                <td style={{ ...celulaNum, ...colada(sec.tipo === "entrada" ? "#F2F7F4" : "#FBF7F1"),
                             textAlign: "left", fontWeight: 800, fontSize: 10.5, letterSpacing: "0.08em",
                             textTransform: "uppercase", color: sec.tipo === "entrada" ? "#1F7A54" : "#A93226",
                             padding: "8px 12px" }}>
                  {sec.titulo}
                </td>
                {colunas.map(c => (
                  <td key={c.key} style={{ ...celulaNum, fontWeight: 700,
                                           color: sec.tipo === "entrada" ? "#1F7A54" : "#A93226" }}>
                    {sec.valores[c.key] > 0.005 ? fmtK(sec.valores[c.key]) : "—"}
                  </td>
                ))}
                <td style={{ ...celulaNum, fontWeight: 800, borderLeft: "1px solid #E7DED2",
                             color: sec.tipo === "entrada" ? "#1F7A54" : "#A93226" }}>
                  {fmtK(sec.total)}
                </td>
              </tr>

              {sec.grupos.map(g => [
                <tr key={`g_${sec.tipo}_${g.categoria}`} onClick={() => alternar(sec, g)}
                  title={aberto(sec, g) ? "Fechar o detalhe" : `Abrir as ${g.linhas.length} despesas`}
                  style={{ background: doPlano(g.categoria) ? AMARELO
                                       : aberto(sec, g) ? "#FBF9F6" : "#fff", cursor: "pointer" }}>
                  <td style={{ ...celulaNum,
                               ...colada(doPlano(g.categoria) ? AMARELO
                                         : aberto(sec, g) ? "#FBF9F6" : "#fff"),
                               textAlign: "left", paddingLeft: 24,
                               color: doPlano(g.categoria) ? AMARELO_TEXTO : "#5C6166",
                               fontWeight: 700, fontFamily: "var(--fonte-titulo)",
                               fontSize: 11.5,
                               borderLeft: doPlano(g.categoria) ? `3px solid ${AMARELO_LINHA}` : "none" }}>
                    <span style={{ display: "inline-block", width: 14, color: "#B2B6B9", fontSize: 9 }}>
                      {aberto(sec, g) ? "▼" : "▶"}
                    </span>
                    {g.categoria} <span style={{ color: "#C4C7CA", fontWeight: 400 }}>({g.linhas.length})</span>
                    {doPlano(g.categoria) && (
                      <span title="O plano de obra preenche esta rubrica. Lançar aqui à mão duplica: o próximo recálculo põe a dele ao lado da tua."
                        style={{ marginLeft: 7, fontSize: 9.5, fontWeight: 700, color: AMARELO_TEXTO,
                                 background: "#F7ECD0", border: `1px solid ${AMARELO_LINHA}`,
                                 borderRadius: 4, padding: "1px 6px", letterSpacing: 0.2,
                                 fontFamily: "var(--fonte-numero)", verticalAlign: "middle" }}>
                        plano de obra
                      </span>
                    )}
                  </td>
                  {colunas.map(c => (
                    <td key={c.key} style={{ ...celulaNum, color: "#5C6166", fontWeight: 600 }}>
                      {g.valores[c.key] > 0.005 ? fmtK(g.valores[c.key]) : "—"}
                    </td>
                  ))}
                  <td style={{ ...celulaNum, color: "#5C6166", fontWeight: 700, borderLeft: "1px solid #E7DED2" }}>
                    {fmtK(g.total)}
                  </td>
                </tr>,
                ...(aberto(sec, g) ? g.linhas : []).map(l => (
                  <tr key={l.chave} style={{ borderBottom: "1px solid #FBF7F1" }}>
                    <td style={{ ...celulaNum, ...colada(), textAlign: "left", paddingLeft: 40,
                                 color: "#23292D", maxWidth: 420, overflow: "hidden",
                                 textOverflow: "ellipsis" }} title={l.nome}>
                      {l.nome}
                    </td>
                    {colunas.map(c => {
                      const v = l.valores[c.key];
                      const n = (l.itens[c.key] || []).length;
                      const aberta = celula?.linha?.chave === l.chave && celula?.mes?.key === c.key;
                      return (
                        <td key={c.key} onClick={(e) => abrir(l, c, e)}
                          title={n ? `${n} ${n === 1 ? "lançamento" : "lançamentos"} — clica para tratar` : ""}
                          style={{ ...celulaNum, cursor: n ? "pointer" : "default",
                                   color: v > 0.005 ? (l.tipo === "entrada" ? "#1F7A54" : "#A93226") : "#E0E2E4",
                                   background: aberta ? "#F6ECD6" : undefined,
                                   borderRadius: aberta ? 5 : undefined,
                                   fontWeight: aberta ? 700 : 400 }}>
                          {v > 0.005 ? fmtK(v) : "—"}
                          {n > 1 && <span style={{ fontSize: 8.5, color: "#9DA2A6", marginLeft: 3 }}>×{n}</span>}
                        </td>
                      );
                    })}
                    <td style={{ ...celulaNum, fontWeight: 700, color: "#091C2A",
                                 borderLeft: "1px solid #E7DED2" }}>{fmtK(l.total)}</td>
                  </tr>
                )),
              ])}
            </tbody>
          ))}

          <tfoot>
            <tr style={{ background: "#EDF1F5", borderTop: "2px solid #dde3f0" }}>
              <td style={{ ...celulaNum, ...colada("#EDF1F5"), textAlign: "left", fontWeight: 800,
                           color: "#2C4A63", padding: "10px 12px" }}>Líquido do mês</td>
              {colunas.map(c => (
                <td key={c.key} style={{ ...celulaNum, fontWeight: 800, padding: "10px",
                                         color: liquido[c.key] >= 0 ? "#1F7A54" : "#A93226" }}>
                  {fmtK(liquido[c.key])}
                </td>
              ))}
              <td style={{ ...celulaNum, fontWeight: 800, padding: "10px", borderLeft: "1px solid #dde3f0",
                           color: matriz.totalLiquido >= 0 ? "#1F7A54" : "#A93226" }}>
                {fmtK(matriz.totalLiquido)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {isAdmin && (
        <div style={{ padding: "10px 16px", borderTop: "1px solid #E7DED2" }}>
          <button onClick={onNovaDespesa}
            style={{ background: "transparent", border: "1px dashed #BAA685", color: "#96702A",
                     padding: "7px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
            + Despesa
          </button>
        </div>
      )}

      {/* O que está dentro da célula, com as ações de cada lançamento */}
      {celula && (
        <>
          <div onClick={() => setCelula(null)}
            style={{ position: "fixed", inset: 0, zIndex: 190 }} />
          <div style={{
            position: "fixed", zIndex: 200,
            left: Math.max(12, Math.min(celula.x - 120, (typeof window !== "undefined" ? window.innerWidth : 1200) - 460)),
            top: Math.min(celula.y + 6, (typeof window !== "undefined" ? window.innerHeight : 800) - 160),
            width: 440, maxHeight: 380, overflowY: "auto",
            background: "#fff", border: "1px solid #E3D9CC", borderRadius: 12,
            boxShadow: "0 16px 44px rgba(9,28,42,0.22)", padding: 14,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#091C2A" }}>{celula.linha.nome}</div>
                <div style={{ fontSize: 10.5, color: "#9DA2A6", fontFamily: "var(--fonte-numero)" }}>
                  {rotuloCol(celula.mes)} · {celula.itens.length} {celula.itens.length === 1 ? "lançamento" : "lançamentos"}
                  {" · "}{fmtFull(celula.linha.valores[celula.mes.key])}
                </div>
              </div>
              <button onClick={() => setCelula(null)}
                style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#9DA2A6" }}>✕</button>
            </div>

            {celula.itens.map((item, i) => (
              <div key={i} style={{ borderTop: i ? "1px solid #F3EDE4" : "none", padding: "9px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                  <div style={{ fontSize: 11.5, color: "#23292D", lineHeight: 1.4 }}>
                    <span style={{ color: "#9DA2A6", marginRight: 6 }}>{item.origem}</span>
                    {item.desc}
                  </div>
                  <div style={{ fontFamily: "var(--fonte-numero)", fontSize: 11.5, fontWeight: 700,
                                whiteSpace: "nowrap",
                                color: item.tipo === "entrada" ? "#1F7A54" : "#A93226" }}>
                    {item.tipo === "entrada" ? "+" : "−"}{fmtFull(Math.abs(item.valor || 0))}
                  </div>
                </div>
                <AcoesDoItem item={item} isAdmin={isAdmin} acoes={acoes} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
