import { useState, useMemo } from "react";
import { EMPRESAS, agruparPorGrupo, GRUPOS_INFO } from "./empresas.js";
import { useMovimentosPeriodo, useFracoes, useVendas, useSaldosNaData } from "./hooks.js";
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

  // Período anterior, do mesmo comprimento, para calcular variações
  const periodoAnterior = useMemo(() => {
    const d1 = new Date(de), d2 = new Date(ate);
    const dias = Math.max(1, Math.round((d2 - d1) / 86400000));
    const fim = new Date(d1); fim.setDate(fim.getDate() - 1);
    const ini = new Date(fim); ini.setDate(ini.getDate() - dias);
    return { de: ini.toISOString().slice(0, 10), ate: fim.toISOString().slice(0, 10) };
  }, [de, ate]);
  const { movimentos: movsAnterior } = useMovimentosPeriodo(contaIds, periodoAnterior.de, periodoAnterior.ate);

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

      {/* Cascata */}
      <Card titulo="Fluxo de Caixa — do saldo inicial ao saldo final"
            subtitulo={`${fmtData(de)} a ${fmtData(ate)} · ${fmtInt(movimentos.length)} movimentos`}>
        {movimentos.length === 0
          ? <Vazio texto="Sem movimentos no período selecionado." />
          : <Cascata inicial={saldoInicial} entradas={entradasTop} saidas={saidasTop}
                     final={saldoInicial + agregado.resultado} />}
      </Card>

      {/* Centros de custo */}
      <Card titulo="Centros de custo"
            subtitulo={`Saídas por categoria · variação face ao período anterior (${fmtData(periodoAnterior.de)} a ${fmtData(periodoAnterior.ate)})`}>
        <BarrasCentroCusto dados={centrosCusto} />
      </Card>

      {/* Evolução */}
      <Card titulo="Evolução do saldo" subtitulo="Saldo consolidado das contas selecionadas, mês a mês">
        <EvolucaoSaldo serie={evolucao} />
      </Card>

      {/* Recebíveis */}
      <Card titulo="Carteira de recebíveis"
            subtitulo={`Recebido ${fmtEUR0(totalRecebido)} · por receber ${fmtEUR0(totalPorReceber)}`}>
        <BarrasRecebiveis meses={recebiveis} />
      </Card>

      {/* Espelho de vendas */}
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
    </div>
  );
}
