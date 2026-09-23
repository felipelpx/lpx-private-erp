import React, { useState, useMemo } from "react";
import { EMPRESAS, agruparPorGrupo, GRUPOS_INFO } from "./empresas.js";
import { useMovimentosPeriodo, useFracoes, useVendas, useSaldosNaData, usePagamentosExtras, useFaturas, useOrcamento } from "./hooks.js";
import { CRONOGRAMAS, ESTADO_MARCO } from "./cronogramas.js";
import { statusFatura, faturaPaga } from "./status.js";
import { fmtEUR, fmtEUR0, fmtNum, fmtInt, fmtCompacto, fmtData, fmtPctSinal } from "./formato.js";

// ─────────────────────────────────────────────────────────────────────────────
// INVESTOR RELATIONS — leitura visual do projeto
//
// Tudo é desenhado em SVG à mão: sem dependências novas, controlo total do
// aspeto e das cores da marca, e imprime bem em PDF.
// ─────────────────────────────────────────────────────────────────────────────

const COR = {
  tinta:    "#1a1a2e",
  entrada:  "#16a34a",
  saida:    "#dc2626",
  neutro:   "#6B7C93",
  saldo:    "#4a6fa5",
  fundo:    "#f8f9fc",
  grelha:   "#eef0f4",
  texto:    "#888",
};

// Paleta para centros de custo (estável: mesma categoria = mesma cor)
const PALETA = ["#4a6fa5","#6B7C93","#8b7355","#5b8c85","#9c6b8e","#7a8b6f","#b08968","#5f7a8c","#8c7ba6","#a67b5b"];
const corCategoria = (nome, i) => PALETA[i % PALETA.length];

const Card = ({ titulo, subtitulo, children, acao }) => (
  <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 14, padding: 20 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: COR.tinta, fontFamily: "Georgia,serif" }}>{titulo}</div>
        {subtitulo && <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{subtitulo}</div>}
      </div>
      {acao}
    </div>
    {children}
  </div>
);

const Vazio = ({ texto }) => (
  <div style={{ padding: 40, textAlign: "center", color: "#ccc", fontSize: 12 }}>{texto}</div>
);

// ─── GRÁFICO EM CASCATA (saldo inicial → receitas → custos → saldo final) ────
function Cascata({ inicial, entradas, saidas, final, largura = 900 }) {
  const altura = 320, margemY = 44, margemX = 8;

  // Barras: inicial (total), cada entrada (sobe), cada saída (desce), final (total)
  const passos = [
    { rotulo: "Saldo inicial", valor: inicial, tipo: "total" },
    ...entradas.map(e => ({ rotulo: e.nome, valor: e.valor, tipo: "entrada" })),
    ...saidas.map(e => ({ rotulo: e.nome, valor: -Math.abs(e.valor), tipo: "saida" })),
    { rotulo: "Saldo final", valor: final, tipo: "total" },
  ];

  // Acumulado para posicionar cada barra
  let acumulado = 0;
  const barras = passos.map((p) => {
    if (p.tipo === "total") {
      const b = { ...p, base: 0, topo: p.valor };
      acumulado = p.valor;
      return b;
    }
    const base = acumulado;
    acumulado += p.valor;
    return { ...p, base, topo: acumulado };
  });

  const valores = barras.flatMap(b => [b.base, b.topo]).concat([0]);
  const max = Math.max(...valores), min = Math.min(...valores);
  const amplitude = (max - min) || 1;
  const y = (v) => margemY + (max - v) / amplitude * (altura - margemY * 2);

  const larguraBarra = Math.min(74, (largura - margemX * 2) / barras.length - 10);
  const passo = (largura - margemX * 2) / barras.length;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${largura} ${altura}`} style={{ width: "100%", minWidth: 620, height: "auto", display: "block" }}>
        {/* linha do zero */}
        <line x1={margemX} y1={y(0)} x2={largura - margemX} y2={y(0)} stroke="#ddd" strokeWidth="1" />

        {barras.map((b, i) => {
          const cx = margemX + passo * i + passo / 2;
          const x = cx - larguraBarra / 2;
          const yTopo = y(Math.max(b.base, b.topo));
          const alt = Math.max(2, Math.abs(y(b.base) - y(b.topo)));
          const cor = b.tipo === "total" ? COR.saldo : b.tipo === "entrada" ? COR.entrada : COR.saida;
          const anterior = barras[i - 1];

          return (
            <g key={i}>
              {/* conector com a barra anterior */}
              {anterior && (
                <line x1={margemX + passo * (i - 1) + passo / 2 + larguraBarra / 2}
                      y1={y(b.tipo === "total" ? anterior.topo : b.base)}
                      x2={x} y2={y(b.tipo === "total" ? anterior.topo : b.base)}
                      stroke="#ccc" strokeWidth="1" strokeDasharray="3 3" />
              )}
              <rect x={x} y={yTopo} width={larguraBarra} height={alt} fill={cor}
                    rx="3" opacity={b.tipo === "total" ? 1 : 0.88}>
                <title>{`${b.rotulo}: ${fmtEUR(b.valor)}`}</title>
              </rect>
              {/* valor */}
              <text x={cx} y={yTopo - 7} textAnchor="middle" fontSize="10.5" fontFamily="monospace"
                    fontWeight="700" fill={cor}>
                {fmtCompacto(b.valor)}
              </text>
              {/* rótulo */}
              <text x={cx} y={altura - 20} textAnchor="middle" fontSize="9.5" fill={COR.texto}>
                {b.rotulo.length > 15 ? b.rotulo.slice(0, 14) + "…" : b.rotulo}
                <title>{b.rotulo}</title>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── BARRAS HORIZONTAIS POR CENTRO DE CUSTO, com variação ────────────────────
function BarrasCentroCusto({ dados }) {
  if (!dados.length) return <Vazio texto="Sem custos no período selecionado." />;
  const max = Math.max(...dados.map(d => Math.abs(d.atual)), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {dados.map((d, i) => {
        const pct = Math.abs(d.atual) / max * 100;
        const temAnterior = d.anterior !== 0;
        const varPct = temAnterior ? (Math.abs(d.atual) - Math.abs(d.anterior)) / Math.abs(d.anterior) * 100 : null;
        return (
          <div key={d.nome} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 150, fontSize: 11, color: COR.tinta, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                 title={d.nome}>{d.nome}</div>
            <div style={{ flex: 1, background: COR.fundo, borderRadius: 5, height: 22, position: "relative", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: corCategoria(d.nome, i), borderRadius: 5, transition: "width .3s" }} />
            </div>
            <div style={{ width: 108, textAlign: "right", fontFamily: "monospace", fontSize: 11.5, fontWeight: 700, color: COR.tinta }}>
              {fmtEUR0(Math.abs(d.atual))}
            </div>
            <div style={{ width: 74, textAlign: "right", fontFamily: "monospace", fontSize: 10.5,
                          color: varPct === null ? "#ccc" : varPct > 0 ? COR.saida : COR.entrada }}>
              {varPct === null ? "—" : fmtPctSinal(varPct, 0)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── EVOLUÇÃO DO SALDO (área + linha) ────────────────────────────────────────
function EvolucaoSaldo({ serie }) {
  if (serie.length < 2) return <Vazio texto="Poucos dados para desenhar a evolução." />;
  const L = 900, A = 240, mX = 46, mY = 22;
  const vals = serie.map(p => p.saldo);
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  const amp = (max - min) || 1;
  const x = (i) => mX + i / (serie.length - 1) * (L - mX - 16);
  const y = (v) => mY + (max - v) / amp * (A - mY * 2);

  const linha = serie.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.saldo)}`).join(" ");
  const area = `${linha} L ${x(serie.length - 1)} ${y(min)} L ${x(0)} ${y(min)} Z`;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${L} ${A}`} style={{ width: "100%", minWidth: 560, height: "auto", display: "block" }}>
        {[max, (max + min) / 2, min].map((v, i) => (
          <g key={i}>
            <line x1={mX} y1={y(v)} x2={L - 16} y2={y(v)} stroke={COR.grelha} strokeWidth="1" />
            <text x={mX - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fontFamily="monospace" fill="#bbb">
              {fmtCompacto(v)}
            </text>
          </g>
        ))}
        <path d={area} fill={COR.saldo} opacity="0.10" />
        <path d={linha} fill="none" stroke={COR.saldo} strokeWidth="2.2" strokeLinejoin="round" />
        {serie.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.saldo)} r="3" fill="#fff" stroke={COR.saldo} strokeWidth="1.8">
              <title>{`${p.rotulo}: ${fmtEUR(p.saldo)}`}</title>
            </circle>
            {(i === 0 || i === serie.length - 1 || serie.length <= 12) && (
              <text x={x(i)} y={A - 5} textAnchor="middle" fontSize="8.5" fill="#bbb">{p.rotulo}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── BARRAS AGRUPADAS: recebíveis real vs projetado ──────────────────────────
function BarrasRecebiveis({ meses }) {
  if (!meses.length) return <Vazio texto="Sem recebíveis previstos. Regista vendas com data de escritura na aba Comercial." />;
  const L = 900, A = 250, mX = 48, mY = 22;
  const max = Math.max(...meses.flatMap(m => [m.real, m.projetado]), 1);
  const passo = (L - mX - 16) / meses.length;
  const lb = Math.min(20, passo / 2.8);
  const y = (v) => mY + (1 - v / max) * (A - mY * 2);

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${L} ${A}`} style={{ width: "100%", minWidth: 560, height: "auto", display: "block" }}>
        {[max, max / 2, 0].map((v, i) => (
          <g key={i}>
            <line x1={mX} y1={y(v)} x2={L - 16} y2={y(v)} stroke={COR.grelha} strokeWidth="1" />
            <text x={mX - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fontFamily="monospace" fill="#bbb">{fmtCompacto(v)}</text>
          </g>
        ))}
        {meses.map((m, i) => {
          const cx = mX + passo * i + passo / 2;
          return (
            <g key={i}>
              <rect x={cx - lb - 2} y={y(m.real)} width={lb} height={Math.max(1, y(0) - y(m.real))} fill={COR.entrada} rx="2">
                <title>{`${m.rotulo} — recebido: ${fmtEUR(m.real)}`}</title>
              </rect>
              <rect x={cx + 2} y={y(m.projetado)} width={lb} height={Math.max(1, y(0) - y(m.projetado))} fill={COR.saldo} opacity="0.5" rx="2">
                <title>{`${m.rotulo} — projetado: ${fmtEUR(m.projetado)}`}</title>
              </rect>
              <text x={cx} y={A - 5} textAnchor="middle" fontSize="8.5" fill="#bbb">{m.rotulo}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 18, justifyContent: "center", marginTop: 8 }}>
        <span style={{ fontSize: 10.5, color: COR.texto }}>
          <span style={{ display: "inline-block", width: 10, height: 10, background: COR.entrada, borderRadius: 2, marginRight: 5 }} />Recebido
        </span>
        <span style={{ fontSize: 10.5, color: COR.texto }}>
          <span style={{ display: "inline-block", width: 10, height: 10, background: COR.saldo, opacity: 0.5, borderRadius: 2, marginRight: 5 }} />Projetado
        </span>
      </div>
    </div>
  );
}

// ─── ESPELHO DE VENDAS — o "predinho" ────────────────────────────────────────
const ESTADO_COR = {
  "Disponível":  { fundo: "#f4f5f7", borda: "#dcdfe5", texto: "#8a8f99" },
  "Reservada":   { fundo: "#fff7ed", borda: "#fdba74", texto: "#c2410c" },
  "CPCV":        { fundo: "#eff6ff", borda: "#93c5fd", texto: "#1d4ed8" },
  "Escriturada": { fundo: "#f0fdf4", borda: "#86efac", texto: "#15803d" },
};

function Predinho({ fracoes }) {
  if (!fracoes.length) return <Vazio texto="Sem frações neste projeto." />;

  // Agrupa por piso; ordena do último piso para a cave
  const porPiso = {};
  fracoes.forEach(f => {
    const p = (f.piso ?? "").toString().trim() || "—";
    (porPiso[p] = porPiso[p] || []).push(f);
  });
  const ordem = (p) => {
    const s = String(p).toUpperCase();
    if (s === "R/C" || s === "RC") return 0;
    const n = parseFloat(s.replace(",", "."));
    return isNaN(n) ? -99 : n;
  };
  const pisos = Object.keys(porPiso).sort((a, b) => ordem(b) - ordem(a));

  const resumo = {};
  fracoes.forEach(f => { const s = f.status || "Disponível"; resumo[s] = (resumo[s] || 0) + 1; });

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 760 }}>
        {pisos.map(piso => (
          <div key={piso} style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
            <div style={{ width: 52, display: "flex", alignItems: "center", justifyContent: "flex-end",
                          fontSize: 10, fontFamily: "monospace", color: "#aaa", fontWeight: 700 }}>
              {piso}
            </div>
            <div style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap", background: "#fbfcfd",
                          border: "1px solid #f0f2f5", borderRadius: 8, padding: 7 }}>
              {porPiso[piso]
                .slice()
                .sort((a, b) => String(a.fracao).localeCompare(String(b.fracao)))
                .map(f => {
                  const c = ESTADO_COR[f.status] || ESTADO_COR["Disponível"];
                  return (
                    <div key={f.id} title={`${f.fracao} · ${f.tipologia || "—"} · ${fmtNum(f.area)} m² · ${fmtEUR0(f.preco_tabela)} · ${f.status}`}
                      style={{ minWidth: 74, background: c.fundo, border: `1px solid ${c.borda}`, borderRadius: 6,
                               padding: "7px 9px", cursor: "default" }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: c.texto }}>{f.fracao}</div>
                      <div style={{ fontSize: 8.5, color: c.texto, opacity: 0.85, fontFamily: "monospace" }}>
                        {f.tipologia || "—"}
                      </div>
                      <div style={{ fontSize: 8.5, color: c.texto, opacity: 0.7, fontFamily: "monospace" }}>
                        {fmtCompacto(f.preco_tabela)}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14 }}>
        {Object.keys(ESTADO_COR).map(s => (
          <span key={s} style={{ fontSize: 10.5, color: COR.texto, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: ESTADO_COR[s].fundo, border: `1px solid ${ESTADO_COR[s].borda}` }} />
            {s} <strong style={{ color: COR.tinta }}>{resumo[s] || 0}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── FLUXO FUTURO PREVISTO (entradas e saídas por mês) ───────────────────────
function BarrasFluxoFuturo({ meses, saldoArranque }) {
  if (!meses.length) return <Vazio texto="Sem entradas nem saídas previstas. Lança previsões no Fluxo Futuro ou faturas com previsão de pagamento." />;
  const L = 940, A = 300, mX = 52, mY = 26;
  const base = A - mY * 2;
  const max = Math.max(...meses.flatMap(m => [m.entradas, Math.abs(m.saidas)]), 1);
  const passo = (L - mX - 16) / meses.length;
  const lb = Math.min(18, passo / 3);
  const zero = mY + base / 2;
  const h = (v) => (Math.abs(v) / max) * (base / 2);

  // Saldo acumulado projetado
  let acc = saldoArranque;
  const saldos = meses.map(m => { acc += m.entradas + m.saidas; return acc; });
  const maxSaldo = Math.max(...saldos.map(Math.abs), 1);
  const ySaldo = (v) => zero - (v / maxSaldo) * (base / 2) * 0.9;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${L} ${A}`} style={{ width: "100%", minWidth: 620, height: "auto", display: "block" }}>
        <line x1={mX} y1={zero} x2={L - 16} y2={zero} stroke="#ccc" strokeWidth="1" />
        <text x={mX - 6} y={zero - h(max) + 4} textAnchor="end" fontSize="9" fontFamily="monospace" fill="#bbb">{fmtCompacto(max)}</text>
        <text x={mX - 6} y={zero + h(max) + 4} textAnchor="end" fontSize="9" fontFamily="monospace" fill="#bbb">{fmtCompacto(-max)}</text>

        {meses.map((m, i) => {
          const cx = mX + passo * i + passo / 2;
          return (
            <g key={i}>
              <rect x={cx - lb - 1} y={zero - h(m.entradas)} width={lb} height={Math.max(1, h(m.entradas))} fill={COR.entrada} rx="2">
                <title>{`${m.rotulo} — entradas: ${fmtEUR(m.entradas)}`}</title>
              </rect>
              <rect x={cx + 1} y={zero} width={lb} height={Math.max(1, h(m.saidas))} fill={COR.saida} rx="2">
                <title>{`${m.rotulo} — saídas: ${fmtEUR(m.saidas)}`}</title>
              </rect>
              <text x={cx} y={A - 4} textAnchor="middle" fontSize="8.5" fill="#bbb">{m.rotulo}</text>
            </g>
          );
        })}

        {/* Linha do saldo projetado */}
        <path d={saldos.map((v, i) => `${i === 0 ? "M" : "L"} ${mX + passo * i + passo / 2} ${ySaldo(v)}`).join(" ")}
              fill="none" stroke={COR.tinta} strokeWidth="1.8" strokeDasharray="4 3" />
        {saldos.map((v, i) => (
          <circle key={i} cx={mX + passo * i + passo / 2} cy={ySaldo(v)} r="2.6"
                  fill={v < 0 ? COR.saida : "#fff"} stroke={COR.tinta} strokeWidth="1.4">
            <title>{`${meses[i].rotulo} — saldo projetado: ${fmtEUR(v)}`}</title>
          </circle>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 18, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
        {[["Entradas previstas", COR.entrada], ["Saídas previstas", COR.saida]].map(([t, c]) => (
          <span key={t} style={{ fontSize: 10.5, color: COR.texto }}>
            <span style={{ display: "inline-block", width: 10, height: 10, background: c, borderRadius: 2, marginRight: 5 }} />{t}
          </span>
        ))}
        <span style={{ fontSize: 10.5, color: COR.texto }}>
          <span style={{ display: "inline-block", width: 14, height: 0, borderTop: `2px dashed ${COR.tinta}`, marginRight: 5, verticalAlign: "middle" }} />Saldo projetado
        </span>
      </div>
    </div>
  );
}

// ─── REAL × ORÇADO ───────────────────────────────────────────────────────────
// Atenção aos sinais: os custos são guardados NEGATIVOS e as receitas positivas.
// Um desvio calculado como (orçado − previsto) sobre números com sinal inverte
// a leitura — um estouro aparecia como folga. Por isso o cálculo é feito sobre
// magnitudes e o sentido de "bom" depende do grupo.
const GRUPO_ROTULO = {
  receita: "Receitas",
  capex:   "Aquisição de terreno",
  obra:    "Obras",
  opex:    "Soft costs e licenças",
};

function RealOrcado({ linhas }) {
  if (!linhas.length) return <Vazio texto="Sem orçamento definido para estas empresas." />;

  // desvio > 0 é sempre favorável: gastar menos, ou vender mais
  const calc = (l) => {
    const previsto = l.realizado + l.a_realizar;
    const receita = l.grupo === "receita";
    const desvio = receita
      ? previsto - l.orcado
      : Math.abs(l.orcado) - Math.abs(previsto);
    const pct = l.orcado ? (Math.abs(previsto) / Math.abs(l.orcado)) * 100 : (previsto ? 100 : 0);
    return { previsto, desvio, pct, favoravel: desvio >= -0.005 };
  };

  const grupos = [];
  ["receita", "capex", "obra", "opex"].forEach(g => {
    const doGrupo = linhas.filter(l => l.grupo === g);
    if (doGrupo.length) grupos.push({ g, linhas: doGrupo });
  });

  const soma = (arr) => arr.reduce((a, l) => ({
    grupo: arr[0]?.grupo, orcado: a.orcado + l.orcado,
    realizado: a.realizado + l.realizado, a_realizar: a.a_realizar + l.a_realizar,
  }), { orcado: 0, realizado: 0, a_realizar: 0 });

  const custos = linhas.filter(l => l.grupo !== "receita");
  const totCustos = { ...soma(custos), grupo: "custos", categoria: "TOTAL CUSTOS" };

  const Linha = ({ l, nivel }) => {
    const { previsto, desvio, pct, favoravel } = calc(l);
    const cabecalho = nivel === "grupo" || nivel === "total";
    return (
      <tr style={{
        borderBottom: "1px solid " + (cabecalho ? "#e8eaef" : "#fafafa"),
        fontWeight: cabecalho ? 700 : 400,
        background: nivel === "total" ? "#f0f4ff" : nivel === "grupo" ? "#f8f9fc" : "transparent",
      }}>
        <td style={{ padding: "8px 10px", color: COR.tinta, paddingLeft: nivel === "linha" ? 24 : 10 }}>{l.categoria}</td>
        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", color: "#666" }}>{fmtEUR0(l.orcado)}</td>
        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", color: COR.tinta }}>{fmtEUR0(l.realizado)}</td>
        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", color: "#888" }}>{fmtEUR0(l.a_realizar)}</td>
        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", color: "#666" }}>{fmtEUR0(previsto)}</td>
        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: favoravel ? COR.entrada : COR.saida }}>
          {(desvio >= 0 ? "+" : "") + fmtEUR0(desvio)}
        </td>
        <td style={{ padding: "8px 10px", width: 120 }}>
          <div style={{ background: "#f1f2f5", borderRadius: 4, height: 13, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: favoravel ? COR.saldo : COR.saida, borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 9, color: favoravel ? "#aaa" : COR.saida, fontFamily: "monospace", marginTop: 2 }}>{fmtNum(pct, 0)}%</div>
        </td>
      </tr>
    );
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
        <thead>
          <tr style={{ background: "#f8f9fc" }}>
            {[["Categoria", "left"], ["Orçado", "right"], ["Realizado", "right"], ["A realizar", "right"],
              ["Previsto total", "right"], ["Desvio", "right"], ["Consumo", "left"]].map(([h, al]) => (
              <th key={h} style={{ padding: "9px 10px", textAlign: al, color: "#aaa", fontSize: 9, textTransform: "uppercase", fontFamily: "monospace", letterSpacing: "0.06em", borderBottom: "1px solid #f0f0f0" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grupos.map(({ g, linhas: ls }) => (
            <React.Fragment key={g}>
              <Linha nivel="grupo" l={{ ...soma(ls), grupo: g, categoria: GRUPO_ROTULO[g] || g }} />
              {ls.filter(l => Math.abs(l.orcado) + Math.abs(l.realizado) + Math.abs(l.a_realizar) > 0.005)
                 .map(l => <Linha key={l.id || l.categoria} nivel="linha" l={l} />)}
            </React.Fragment>
          ))}
          <Linha nivel="total" l={totCustos} />
        </tbody>
      </table>
      <div style={{ fontSize: 10.5, color: "#aaa", marginTop: 10, lineHeight: 1.6 }}>
        <strong>Orçado</strong> vem do business plan. <strong>Realizado</strong> é a soma dos
        movimentos bancários da categoria, desde o início do projeto.
        <strong>A realizar</strong> são as previsões do Fluxo Futuro por liquidar mais as faturas
        por pagar — lançar uma despesa no Fluxo Futuro atualiza esta tabela de imediato.<br/>
        Previsto total = realizado + a realizar. Desvio positivo é favorável: gastar abaixo do
        orçamento ou vender acima. Consumo acima de 100% marca a vermelho.
      </div>
    </div>
  );
}

// ─── TIMELINE DO BUSINESS PLAN ───────────────────────────────────────────────
function Timeline({ cronograma, projeto }) {
  if (!cronograma) return (
    <Vazio texto={`Sem cronograma carregado para ${projeto || "este projeto"}. Os marcos vivem em src/cronogramas.js — envia o business plan e acrescento-os.`} />
  );

  const marcos = cronograma.marcos;
  const mesN = (k) => { const [a, m] = k.split("-").map(Number); return a * 12 + (m - 1); };
  const todos = marcos.flatMap(x => [mesN(x.inicio), mesN(x.fim || x.inicio)]);
  const hojeN = (() => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); })();
  const min = Math.min(...todos, hojeN), max = Math.max(...todos, hojeN);
  const span = Math.max(1, max - min);
  const pos = (n) => ((n - min) / span) * 100;

  // Marcas de ano no topo
  const anoIni = Math.floor(min / 12), anoFim = Math.floor(max / 12);
  const anos = [];
  for (let a = anoIni; a <= anoFim; a++) anos.push(a);

  const rotuloMes = (k) => { const [a, m] = k.split("-"); return `${m}/${a.slice(2)}`; };

  return (
    <div>
      {/* Régua de anos */}
      <div style={{ position: "relative", height: 20, marginBottom: 6, marginLeft: 176 }}>
        {anos.map(a => (
          <div key={a} style={{ position: "absolute", left: `${pos(a * 12)}%`, fontSize: 9.5, color: "#bbb", fontFamily: "monospace" }}>
            {a}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {marcos.map((m, i) => {
          const est = ESTADO_MARCO[m.estado] || ESTADO_MARCO.previsto;
          const ini = mesN(m.inicio), fim = mesN(m.fim || m.inicio);
          const esquerda = pos(ini);
          const largura = Math.max(1.6, pos(fim) - esquerda);
          const pontual = !m.fim;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 166, fontSize: 11, color: COR.tinta, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                   title={m.fase}>{m.fase}</div>
              <div style={{ flex: 1, position: "relative", height: 26, background: "#fbfcfd", borderRadius: 5 }}>
                {/* linha de hoje */}
                <div style={{ position: "absolute", left: `${pos(hojeN)}%`, top: 0, bottom: 0, width: 1, background: "#f59e0b" }} />
                <div title={`${m.fase}\n${rotuloMes(m.inicio)}${m.fim ? ` → ${rotuloMes(m.fim)}` : ""}\n${est.rotulo}${m.nota ? `\n${m.nota}` : ""}`}
                  style={{
                    position: "absolute", left: `${esquerda}%`, width: pontual ? undefined : `${largura}%`,
                    top: 4, height: 18, background: est.fundo, border: `1px solid ${est.cor}`,
                    borderRadius: pontual ? "50%" : 5, minWidth: pontual ? 18 : undefined,
                    display: "flex", alignItems: "center", paddingLeft: pontual ? 0 : 7,
                    fontSize: 9, color: est.cor, fontFamily: "monospace", whiteSpace: "nowrap", cursor: "default",
                  }}>
                  {!pontual && largura > 12 ? `${rotuloMes(m.inicio)} → ${rotuloMes(m.fim)}` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
        {Object.values(ESTADO_MARCO).map(e => (
          <span key={e.rotulo} style={{ fontSize: 10.5, color: COR.texto, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: e.fundo, border: `1px solid ${e.cor}` }} />{e.rotulo}
          </span>
        ))}
        <span style={{ fontSize: 10.5, color: COR.texto, display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 2, height: 12, background: "#f59e0b" }} />hoje
        </span>
      </div>

      {marcos.some(m => m.nota) && (
        <div style={{ marginTop: 12, borderTop: "1px solid #f0f0f0", paddingTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
          {marcos.filter(m => m.nota).map((m, i) => (
            <div key={i} style={{ fontSize: 10.5, color: "#888" }}>
              <strong style={{ color: ESTADO_MARCO[m.estado]?.cor || COR.tinta }}>{m.fase}</strong> — {m.nota}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── KPI ─────────────────────────────────────────────────────────────────────
const Kpi = ({ rotulo, valor, cor = COR.tinta, nota }) => (
  <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: "15px 18px", borderTop: `3px solid ${cor}` }}>
    <div style={{ fontSize: 9.5, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace", marginBottom: 6 }}>{rotulo}</div>
    <div style={{ fontSize: 19, fontWeight: 700, color: cor, fontFamily: "monospace" }}>{valor}</div>
    {nota && <div style={{ fontSize: 10, color: "#bbb", marginTop: 4 }}>{nota}</div>}
  </div>
);

// ─── VISTA PRINCIPAL ─────────────────────────────────────────────────────────
export default function IRView({ currentUser, empresasVisiveis }) {
  const empresas = Array.isArray(empresasVisiveis) ? empresasVisiveis : EMPRESAS;

  const hoje = new Date();
  const inicioAno = `${hoje.getFullYear()}-01-01`;
  const [de, setDe] = useState(inicioAno);
  const [ate, setAte] = useState(hoje.toISOString().slice(0, 10));
  const [empSel, setEmpSel] = useState("todas");

  const empresasAtivas = empSel === "todas" ? empresas : empresas.filter(e => e.id === empSel);
  const contaIds = useMemo(() => empresasAtivas.flatMap(e => e.contas.map(c => c.id)), [empresasAtivas]);

  const { movimentos, loading } = useMovimentosPeriodo(contaIds, de, ate);
  const { saldos: saldosIniciais } = useSaldosNaData(contaIds, de);
  const { fracoes } = useFracoes();
  const { vendas } = useVendas();
  const { pagamentosExtras } = usePagamentosExtras();
  const { faturas } = useFaturas();
  const { orcamento } = useOrcamento();

  // Secção ativa — o utilizador escolhe o que quer ver
  const [seccao, setSeccao] = useState("fluxo");

  // Período anterior, do mesmo comprimento, para calcular variações
  const periodoAnterior = useMemo(() => {
    const d1 = new Date(de), d2 = new Date(ate);
    const dias = Math.max(1, Math.round((d2 - d1) / 86400000));
    const fim = new Date(d1); fim.setDate(fim.getDate() - 1);
    const ini = new Date(fim); ini.setDate(ini.getDate() - dias);
    return { de: ini.toISOString().slice(0, 10), ate: fim.toISOString().slice(0, 10) };
  }, [de, ate]);
  const { movimentos: movsAnterior } = useMovimentosPeriodo(contaIds, periodoAnterior.de, periodoAnterior.ate);
  // Real × Orçado é acumulado do projeto — não segue o filtro de período
  const { movimentos: movimentosTotais } = useMovimentosPeriodo(contaIds, "2000-01-01", ate);

  const saldoInicial = useMemo(
    () => Object.values(saldosIniciais || {}).reduce((s, v) => s + (v || 0), 0),
    [saldosIniciais]
  );

  // Agregações do período
  const agregado = useMemo(() => {
    const porCat = {};
    let entradas = 0, saidas = 0;
    movimentos.forEach(m => {
      const cat = (m.categoria || "").trim() || "Sem categoria";
      if (!porCat[cat]) porCat[cat] = { entrada: 0, saida: 0 };
      if (m.valor >= 0) { porCat[cat].entrada += m.valor; entradas += m.valor; }
      else { porCat[cat].saida += m.valor; saidas += m.valor; }
    });
    return { porCat, entradas, saidas, resultado: entradas + saidas };
  }, [movimentos]);

  const anteriorPorCat = useMemo(() => {
    const p = {};
    movsAnterior.forEach(m => {
      if (m.valor >= 0) return;
      const cat = (m.categoria || "").trim() || "Sem categoria";
      p[cat] = (p[cat] || 0) + m.valor;
    });
    return p;
  }, [movsAnterior]);

  // Top de entradas e saídas para a cascata (o resto agrega-se em "Outros")
  const topN = (obj, chave, n = 5) => {
    const lista = Object.entries(obj)
      .map(([nome, v]) => ({ nome, valor: v[chave] }))
      .filter(x => Math.abs(x.valor) > 0.005)
      .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
    if (lista.length <= n) return lista;
    const resto = lista.slice(n).reduce((s, x) => s + x.valor, 0);
    return [...lista.slice(0, n), { nome: "Outros", valor: resto }];
  };
  const entradasTop = useMemo(() => topN(agregado.porCat, "entrada"), [agregado]);
  const saidasTop = useMemo(() => topN(agregado.porCat, "saida"), [agregado]);

  const centrosCusto = useMemo(() => Object.entries(agregado.porCat)
    .map(([nome, v]) => ({ nome, atual: v.saida, anterior: anteriorPorCat[nome] || 0 }))
    .filter(d => Math.abs(d.atual) > 0.005)
    .sort((a, b) => Math.abs(b.atual) - Math.abs(a.atual))
    .slice(0, 12), [agregado, anteriorPorCat]);

  // Evolução mensal do saldo consolidado
  const evolucao = useMemo(() => {
    const porMes = {};
    movimentos.forEach(m => {
      const k = String(m.data).slice(0, 7);
      porMes[k] = (porMes[k] || 0) + m.valor;
    });
    let acc = saldoInicial;
    return Object.keys(porMes).sort().map(k => {
      acc += porMes[k];
      const [a, mm] = k.split("-");
      return { rotulo: `${mm}/${a.slice(2)}`, saldo: acc };
    });
  }, [movimentos, saldoInicial]);

  // Projetos visíveis (para o espelho de vendas)
  const projetosVisiveis = empresasAtivas.map(e => e.nome);
  const fracoesVisiveis = fracoes.filter(f => projetosVisiveis.includes(f.projeto));
  const projetosComFracoes = [...new Set(fracoesVisiveis.map(f => f.projeto))];
  const [projSel, setProjSel] = useState("");
  const projetoAtivo = projSel && projetosComFracoes.includes(projSel) ? projSel : projetosComFracoes[0];

  // Carteira de recebíveis
  const recebiveis = useMemo(() => {
    const relevantes = vendas.filter(v => projetosVisiveis.includes(v.projeto));
    const porMes = {};
    relevantes.forEach(v => {
      const k = (v.previsao_escritura || v.data || "").slice(0, 7);
      if (!k) return;
      if (!porMes[k]) porMes[k] = { real: 0, projetado: 0 };
      porMes[k].real += Number(v.recebemos) || 0;
      porMes[k].projetado += Number(v.falta_receber) || 0;
    });
    return Object.keys(porMes).sort().map(k => {
      const [a, mm] = k.split("-");
      return { rotulo: `${mm}/${a.slice(2)}`, ...porMes[k] };
    });
  }, [vendas, projetosVisiveis]);

  const totalRecebido = recebiveis.reduce((s, m) => s + m.real, 0);
  const totalPorReceber = recebiveis.reduce((s, m) => s + m.projetado, 0);

  const vgv = fracoesVisiveis.reduce((s, f) => s + (Number(f.preco_tabela) || 0), 0);
  const vendido = fracoesVisiveis.filter(f => f.status === "CPCV" || f.status === "Escriturada")
    .reduce((s, f) => s + (Number(f.preco_tabela) || 0), 0);

  // ─── Fluxo futuro previsto ────────────────────────────────────────────────
  // Junta as previsões lançadas à mão (pagamentos_extras, excluindo as já
  // convertidas ou pagas) com as faturas ainda por liquidar. A data que conta
  // é a previsão de pagamento; sem ela, o vencimento.
  const idsAtivos = empresasAtivas.map(e => e.id);
  const futuro = useMemo(() => {
    const hojeISO = new Date().toISOString().slice(0, 10);
    const porMes = {};
    const junta = (data, valor, tipo) => {
      const k = String(data || "").slice(0, 7);
      if (!k || k.length !== 7) return;
      if (!porMes[k]) porMes[k] = { entradas: 0, saidas: 0, itens: 0 };
      if (tipo === "entrada") porMes[k].entradas += Math.abs(valor);
      else porMes[k].saidas -= Math.abs(valor);
      porMes[k].itens++;
    };

    (pagamentosExtras || [])
      .filter(p => idsAtivos.includes(p.empresa))
      .filter(p => !["Convertida", "Paga", "Pago"].includes(p.status))
      .forEach(p => junta(p.data_inicio, Number(p.valor) || 0, p.tipo === "entrada" ? "entrada" : "saida"));

    (faturas || [])
      .filter(f => idsAtivos.includes(f.empresa))
      .filter(f => !faturaPaga(f))
      .forEach(f => junta(f.previsao_pagamento || f.vencimento, Number(f.valor) || 0, "saida"));

    // Recebíveis das vendas
    (vendas || [])
      .filter(v => empresasAtivas.some(e => e.nome === v.projeto || e.projeto === v.projeto))
      .forEach(v => {
        if ((Number(v.falta_receber) || 0) > 0 && v.previsao_escritura)
          junta(v.previsao_escritura, Number(v.falta_receber), "entrada");
      });

    return Object.keys(porMes).sort().map(k => {
      const [a, mm] = k.split("-");
      return { key: k, rotulo: `${mm}/${a.slice(2)}`, ...porMes[k], passado: k < hojeISO.slice(0, 7) };
    });
  }, [pagamentosExtras, faturas, vendas, idsAtivos, empresasAtivas]);

  const saldoHoje = useMemo(
    () => empresasAtivas.reduce((s, e) => s + e.contas.reduce((t, c) => t + (Number(c.saldo) || 0), 0), 0),
    [empresasAtivas]
  );
  const totalPrevEntradas = futuro.reduce((s, m) => s + m.entradas, 0);
  const totalPrevSaidas = futuro.reduce((s, m) => s + m.saidas, 0);

  // ─── Real × Orçado ────────────────────────────────────────────────────────
  // O orçado é o único número fixo (vem do business plan, tabela `orcamento`).
  // O realizado e o a realizar calculam-se em tempo real a partir do ERP:
  //   realizado  = movimentos bancários da categoria, desde sempre
  //   a realizar = previsões do Fluxo Futuro por liquidar + faturas por pagar
  // Assim, lançar uma despesa no Fluxo Futuro atualiza logo o Real × Orçado.
  const linhasOrcamento = useMemo(() => {
    const porCat = new Map();
    const toca = (cat, campo, valor) => {
      const k = (cat || "").trim() || "(sem categoria)";
      if (!porCat.has(k)) porCat.set(k, { categoria: k, grupo: "opex", orcado: 0, realizado: 0, a_realizar: 0 });
      porCat.get(k)[campo] += valor;
    };

    // 1. Orçado — do business plan
    (orcamento || [])
      .filter(o => idsAtivos.includes(o.empresa_id))
      .forEach(o => {
        const k = (o.categoria || "").trim() || "(sem categoria)";
        if (!porCat.has(k)) porCat.set(k, { categoria: k, grupo: o.grupo || "opex", orcado: 0, realizado: 0, a_realizar: 0 });
        const linha = porCat.get(k);
        linha.orcado += Number(o.orcado) || 0;
        if (o.grupo) linha.grupo = o.grupo;
      });

    // 2. Realizado — movimentos bancários de todo o histórico
    movimentosTotais.forEach(m => toca(m.categoria, "realizado", Number(m.valor) || 0));

    // 3. A realizar — previsões por liquidar (mesma regra do Fluxo Futuro)
    (pagamentosExtras || [])
      .filter(p => idsAtivos.includes(p.empresa))
      .filter(p => !["Convertida", "Paga", "Pago"].includes(p.status))
      .forEach(p => {
        const v = Math.abs(Number(p.valor) || 0);
        toca(p.categoria, "a_realizar", p.tipo === "entrada" ? v : -v);
      });

    // 4. A realizar — faturas ainda por pagar
    (faturas || [])
      .filter(f => idsAtivos.includes(f.empresa))
      .filter(f => !faturaPaga(f))
      .forEach(f => toca(f.categoria, "a_realizar", -Math.abs(Number(f.valor) || 0)));

    return [...porCat.values()]
      .filter(l => Math.abs(l.orcado) + Math.abs(l.realizado) + Math.abs(l.a_realizar) > 0.005)
      .sort((a, b) => Math.abs(b.orcado) - Math.abs(a.orcado));
  }, [orcamento, idsAtivos, movimentosTotais, pagamentosExtras, faturas]);

  // ─── Timeline ─────────────────────────────────────────────────────────────
  const empresaTimeline = empSel !== "todas"
    ? empSel
    : (empresasAtivas.find(e => CRONOGRAMAS[e.id])?.id || empresasAtivas[0]?.id);
  const cronograma = CRONOGRAMAS[empresaTimeline];

  const SECCOES = [
    { id: "fluxo",      rotulo: "Fluxo de caixa" },
    { id: "futuro",     rotulo: "Fluxo futuro" },
    { id: "custos",     rotulo: "Centros de custo" },
    { id: "orcado",     rotulo: "Real × Orçado" },
    { id: "evolucao",   rotulo: "Evolução do saldo" },
    { id: "recebiveis", rotulo: "Recebíveis" },
    { id: "vendas",     rotulo: "Espelho de vendas" },
    { id: "timeline",   rotulo: "Cronograma" },
  ];

  const inputEstilo = { background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, padding: "7px 11px", fontSize: 12, outline: "none", fontFamily: "monospace" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Filtros */}
      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: "13px 18px",
                    display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select value={empSel} onChange={e => setEmpSel(e.target.value)}
          style={{ ...inputEstilo, fontFamily: "inherit", minWidth: 220 }}>
          <option value="todas">Todas as empresas</option>
          {agruparPorGrupo(empresas).map(b => (
            <optgroup key={b.grupo} label={b.info.nome}>
              {b.empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </optgroup>
          ))}
        </select>
        <span style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase" }}>Período</span>
        <input type="date" value={de} max={ate} onChange={e => setDe(e.target.value)} style={inputEstilo} />
        <span style={{ color: "#ccc", fontSize: 12 }}>até</span>
        <input type="date" value={ate} min={de} onChange={e => setAte(e.target.value)} style={inputEstilo} />
        {[["Este ano", inicioAno, hoje.toISOString().slice(0, 10)],
          ["12 meses", new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate()).toISOString().slice(0, 10), hoje.toISOString().slice(0, 10)],
          ["Tudo", "2020-01-01", hoje.toISOString().slice(0, 10)]].map(([r, d, a]) => (
          <button key={r} onClick={() => { setDe(d); setAte(a); }}
            style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 7, padding: "6px 12px", fontSize: 11, color: "#666", cursor: "pointer" }}>
            {r}
          </button>
        ))}
        <button onClick={() => window.print()}
          style={{ marginLeft: "auto", background: COR.tinta, color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Imprimir / PDF
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Kpi rotulo="Saldo inicial" valor={fmtEUR0(saldoInicial)} cor={COR.neutro} nota={fmtData(de)} />
        <Kpi rotulo="Entradas" valor={fmtEUR0(agregado.entradas)} cor={COR.entrada} />
        <Kpi rotulo="Saídas" valor={fmtEUR0(Math.abs(agregado.saidas))} cor={COR.saida} />
        <Kpi rotulo="Variação" valor={fmtEUR0(agregado.resultado)} cor={agregado.resultado >= 0 ? COR.entrada : COR.saida} />
        <Kpi rotulo="Saldo final" valor={fmtEUR0(saldoInicial + agregado.resultado)} cor={COR.saldo} nota={fmtData(ate)} />
      </div>

      {loading && <div style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>a carregar movimentos…</div>}

      {/* Navegação por secções */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {SECCOES.map(sec => {
          const ativo = seccao === sec.id;
          return (
            <button key={sec.id} onClick={() => setSeccao(sec.id)}
              style={{
                background: ativo ? COR.tinta : "#fff",
                color: ativo ? "#fff" : "#666",
                border: "1px solid " + (ativo ? COR.tinta : "#e8e8e8"),
                borderRadius: 20, padding: "8px 16px", fontSize: 12.5,
                fontWeight: ativo ? 700 : 500, cursor: "pointer",
              }}>
              {sec.rotulo}
            </button>
          );
        })}
      </div>

      {seccao === "fluxo" && (
        <Card titulo="Fluxo de Caixa — do saldo inicial ao saldo final"
              subtitulo={`${fmtData(de)} a ${fmtData(ate)} · ${fmtInt(movimentos.length)} movimentos`}>
          {movimentos.length === 0
            ? <Vazio texto="Sem movimentos no período selecionado." />
            : <Cascata inicial={saldoInicial} entradas={entradasTop} saidas={saidasTop}
                       final={saldoInicial + agregado.resultado} />}
        </Card>
      )}

      {seccao === "futuro" && (
        <Card titulo="Fluxo futuro — entradas e saídas previstas"
              subtitulo={`Previsões e faturas por liquidar · entradas ${fmtEUR0(totalPrevEntradas)} · saídas ${fmtEUR0(Math.abs(totalPrevSaidas))} · saldo de partida ${fmtEUR0(saldoHoje)}`}>
          <BarrasFluxoFuturo meses={futuro} saldoArranque={saldoHoje} />
        </Card>
      )}

      {seccao === "custos" && (
        <Card titulo="Centros de custo"
              subtitulo={`Saídas por categoria · variação face ao período anterior (${fmtData(periodoAnterior.de)} a ${fmtData(periodoAnterior.ate)})`}>
          <BarrasCentroCusto dados={centrosCusto} />
        </Card>
      )}

      {seccao === "orcado" && (
        <Card titulo="Real × Orçado"
              subtitulo={`${empSel === "todas" ? "Todas as empresas selecionadas" : empresasAtivas[0]?.nome} · realizado e a realizar calculados em tempo real a partir do ERP`}>
          <RealOrcado linhas={linhasOrcamento} />
        </Card>
      )}

      {seccao === "evolucao" && (
        <Card titulo="Evolução do saldo" subtitulo="Saldo consolidado das contas selecionadas, mês a mês">
          <EvolucaoSaldo serie={evolucao} />
        </Card>
      )}

      {seccao === "recebiveis" && (
        <Card titulo="Carteira de recebíveis"
              subtitulo={`Recebido ${fmtEUR0(totalRecebido)} · por receber ${fmtEUR0(totalPorReceber)}`}>
          <BarrasRecebiveis meses={recebiveis} />
        </Card>
      )}

      {seccao === "vendas" && (
        <Card titulo="Espelho de vendas"
              subtitulo={projetoAtivo ? `${projetoAtivo} · VGV ${fmtEUR0(vgv)} · colocado ${fmtEUR0(vendido)}${vgv ? ` (${fmtNum(vendido / vgv * 100, 0)}%)` : ""}` : undefined}
              acao={projetosComFracoes.length > 1 && (
                <select value={projetoAtivo || ""} onChange={e => setProjSel(e.target.value)}
                  style={{ ...inputEstilo, fontFamily: "inherit" }}>
                  {projetosComFracoes.map(p => <option key={p}>{p}</option>)}
                </select>
              )}>
          <Predinho fracoes={fracoesVisiveis.filter(f => f.projeto === projetoAtivo)} />
        </Card>
      )}

      {seccao === "timeline" && (
        <Card titulo="Cronograma do projeto"
              subtitulo={cronograma ? `${cronograma.projeto} · marcos do business plan` : "Escolhe um projeto com cronograma carregado"}>
          <Timeline cronograma={cronograma} projeto={empresasAtivas.find(e => e.id === empresaTimeline)?.nome} />
        </Card>
      )}
    </div>
  );
}
