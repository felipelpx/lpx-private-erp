import React, { useState, useMemo } from "react";
import { EMPRESAS, agruparPorGrupo } from "./empresas.js";
import { useMovimentosPeriodo, usePagamentosExtras, useFaturas, useOrcamento } from "./hooks.js";
import { faturaPaga } from "./status.js";
import { fmtEUR0, fmtNum } from "./formato.js";

// ─────────────────────────────────────────────────────────────────────────────
// REAL × ORÇADO — partilhado pelo separador próprio e pelo Investor Relations
//
// O orçado é o único número guardado (tabela `orcamento`, vem do business plan).
// O realizado e o a realizar são calculados em tempo real a partir do ERP, para
// que lançar uma despesa no Fluxo Futuro se reflita aqui de imediato.
// ─────────────────────────────────────────────────────────────────────────────

const COR = {
  tinta: "#1a1a2e", entrada: "#16a34a", saida: "#dc2626",
  saldo: "#4a6fa5", texto: "#888",
};

const Vazio = ({ texto }) => (
  <div style={{ padding: 40, textAlign: "center", color: "#ccc", fontSize: 12 }}>{texto}</div>
);

// Calcula as linhas do Real × Orçado para um conjunto de empresas.
export function useRealOrcado(empresasAtivas) {
  const idsAtivos = useMemo(() => empresasAtivas.map(e => e.id), [empresasAtivas]);
  const contaIds = useMemo(() => empresasAtivas.flatMap(e => e.contas?.map(c => c.id) || []), [empresasAtivas]);

  const { orcamento } = useOrcamento();
  const { pagamentos: pagamentosExtras } = usePagamentosExtras();
  const { faturas } = useFaturas();
  // Acumulado do projeto — não segue filtros de período
  const { movimentos, loading } = useMovimentosPeriodo(contaIds, "2000-01-01", new Date().toISOString().slice(0, 10));

  const linhas = useMemo(() => {
    const porCat = new Map();
    const toca = (cat, campo, valor) => {
      const k = (cat || "").trim() || "(sem categoria)";
      if (!porCat.has(k)) porCat.set(k, { categoria: k, grupo: "opex", orcado: 0, realizado: 0, a_realizar: 0 });
      porCat.get(k)[campo] += valor;
    };

    (orcamento || []).filter(o => idsAtivos.includes(o.empresa_id)).forEach(o => {
      const k = (o.categoria || "").trim() || "(sem categoria)";
      if (!porCat.has(k)) porCat.set(k, { categoria: k, grupo: o.grupo || "opex", orcado: 0, realizado: 0, a_realizar: 0 });
      const linha = porCat.get(k);
      linha.orcado += Number(o.orcado) || 0;
      if (o.grupo) linha.grupo = o.grupo;
    });

    movimentos.forEach(m => toca(m.categoria, "realizado", Number(m.valor) || 0));

    (pagamentosExtras || [])
      .filter(p => idsAtivos.includes(p.empresa))
      .filter(p => !["Convertida", "Paga", "Pago"].includes(p.status))
      .forEach(p => {
        const v = Math.abs(Number(p.valor) || 0);
        toca(p.categoria, "a_realizar", p.tipo === "entrada" ? v : -v);
      });

    (faturas || [])
      .filter(f => idsAtivos.includes(f.empresa))
      .filter(f => !faturaPaga(f))
      .forEach(f => toca(f.categoria, "a_realizar", -Math.abs(Number(f.valor) || 0)));

    return [...porCat.values()]
      .filter(l => Math.abs(l.orcado) + Math.abs(l.realizado) + Math.abs(l.a_realizar) > 0.005)
      .sort((a, b) => Math.abs(b.orcado) - Math.abs(a.orcado));
  }, [orcamento, idsAtivos, movimentos, pagamentosExtras, faturas]);

  return { linhas, loading };
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

// Sintetiza as categorias em quatro blocos de leitura rápida.
// Uma categoria entra em "Aportes" ou "Banco" pelo nome; o resto divide-se
// entre receitas (grupo receita) e despesas.
// Classificação por nome. Cobre as duas convenções em uso:
//   LPX  — Obra, Projetos, Fee Gestão, Fiscalização, Encargos financeiros, Juros…
//   HDG  — Gastos com Obras, Taxa de Gestão, Outflow - Juros, Aporte/Resgate…
const ehAporte = (c) => /aporte|resgate|suprimento|sócio|socio|capital social/i.test(c);
const ehBanco  = (c) => /financiamento|financeir|juros|banc|empréstimo|emprestimo|inflow|outflow|funding|amortiza/i.test(c);

const BLOCOS = [
  { id: "aportes",  rotulo: "Aportes de sócios", teste: (l) => ehAporte(l.categoria) },
  { id: "banco",    rotulo: "Banco / financiamento", teste: (l) => !ehAporte(l.categoria) && ehBanco(l.categoria) },
  { id: "receitas", rotulo: "Receitas", teste: (l) => !ehAporte(l.categoria) && !ehBanco(l.categoria) && l.grupo === "receita" },
  { id: "despesas", rotulo: "Despesas", teste: (l) => !ehAporte(l.categoria) && !ehBanco(l.categoria) && l.grupo !== "receita" },
];

export function RealOrcado({ linhas, tir }) {
  const [aberto, setAberto] = useState({});

  if (!linhas.length) return <Vazio texto="Sem orçamento carregado para estas empresas." />;

  // Variação: quanto o previsto se afasta do orçado. Positivo = favorável
  // (gastar menos, receber mais). Os custos estão guardados em negativo.
  const calc = (l) => {
    const previsto = l.realizado + l.a_realizar;
    const receita = l.grupo === "receita" || previsto > 0;
    const variacao = receita ? previsto - l.orcado : Math.abs(l.orcado) - Math.abs(previsto);
    const varPct = l.orcado ? (variacao / Math.abs(l.orcado)) * 100 : null;
    return { previsto, variacao, varPct, favoravel: variacao >= -0.005 };
  };

  const soma = (arr) => arr.reduce((a, l) => ({
    orcado: a.orcado + l.orcado, realizado: a.realizado + l.realizado,
    a_realizar: a.a_realizar + l.a_realizar, grupo: a.grupo,
  }), { orcado: 0, realizado: 0, a_realizar: 0, grupo: arr[0]?.grupo || "opex" });

  const blocos = BLOCOS.map(b => {
    const suas = linhas.filter(b.teste);
    return { ...b, linhas: suas, total: { ...soma(suas), categoria: b.rotulo, grupo: b.id === "receitas" ? "receita" : "opex" } };
  }).filter(b => b.linhas.length);

  // Lucro = tudo somado (receitas positivas menos despesas negativas)
  const lucro = {
    orcado: linhas.reduce((s, l) => s + l.orcado, 0),
    realizado: linhas.reduce((s, l) => s + l.realizado, 0),
    a_realizar: linhas.reduce((s, l) => s + l.a_realizar, 0),
  };
  const lucroPrev = lucro.realizado + lucro.a_realizar;
  const lucroVar = lucroPrev - lucro.orcado;

  const Cel = ({ children, cor, negrito, alinhar = "right" }) => (
    <td style={{ padding: "9px 12px", textAlign: alinhar, fontFamily: "monospace",
                 color: cor || "#666", fontWeight: negrito ? 700 : 400, whiteSpace: "nowrap" }}>
      {children}
    </td>
  );

  const Linha = ({ l, nivel, expansivel, id }) => {
    const { previsto, variacao, varPct, favoravel } = calc(l);
    const bloco = nivel === "bloco", total = nivel === "total";
    return (
      <tr style={{
        borderBottom: "1px solid " + (bloco || total ? "#e8eaef" : "#fafafa"),
        background: total ? "#f0f4ff" : bloco ? "#f8f9fc" : "transparent",
        cursor: expansivel ? "pointer" : "default",
      }}
        onClick={expansivel ? () => setAberto(a => ({ ...a, [id]: !a[id] })) : undefined}>
        <td style={{ padding: "9px 12px", color: COR.tinta, fontWeight: bloco || total ? 700 : 400,
                     paddingLeft: nivel === "linha" ? 30 : 12 }}>
          {expansivel && <span style={{ color: "#aaa", marginRight: 6, fontSize: 10 }}>{aberto[id] ? "▾" : "▸"}</span>}
          {l.categoria}
        </td>
        <Cel negrito={bloco || total}>{fmtEUR0(l.orcado)}</Cel>
        <Cel negrito={bloco || total} cor={COR.tinta}>{fmtEUR0(l.realizado)}</Cel>
        <Cel negrito={bloco || total} cor="#888">{fmtEUR0(l.a_realizar)}</Cel>
        <Cel negrito={bloco || total}>{fmtEUR0(previsto)}</Cel>
        <Cel negrito cor={favoravel ? COR.entrada : COR.saida}>
          {(variacao >= 0 ? "+" : "") + fmtEUR0(variacao)}
        </Cel>
        <Cel cor={favoravel ? COR.entrada : COR.saida}>
          {varPct === null ? "—" : (varPct >= 0 ? "+" : "") + fmtNum(varPct, 0) + "%"}
        </Cel>
      </tr>
    );
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
        <thead>
          <tr style={{ background: "#f8f9fc" }}>
            {[["", "left"], ["Orçado", "right"], ["Realizado", "right"], ["A realizar", "right"],
              ["Previsto", "right"], ["Variação", "right"], ["%", "right"]].map(([h, al], i) => (
              <th key={i} style={{ padding: "9px 12px", textAlign: al, color: "#aaa", fontSize: 9,
                                   textTransform: "uppercase", fontFamily: "monospace",
                                   letterSpacing: "0.06em", borderBottom: "1px solid #f0f0f0" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {blocos.map(b => (
            <React.Fragment key={b.id}>
              <Linha l={b.total} nivel="bloco" expansivel id={b.id} />
              {aberto[b.id] && b.linhas
                .slice()
                .sort((x, y) => Math.abs(y.realizado + y.a_realizar) - Math.abs(x.realizado + x.a_realizar))
                .map(l => <Linha key={l.categoria} l={l} nivel="linha" />)}
            </React.Fragment>
          ))}
          <Linha l={{ ...lucro, categoria: "LUCRO", grupo: "receita" }} nivel="total" />
        </tbody>
      </table>

      {/* Lucro e TIR em destaque */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 16 }}>
        <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 10, padding: "14px 16px", borderTop: `3px solid ${lucroPrev >= 0 ? COR.entrada : COR.saida}` }}>
          <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", letterSpacing: "0.07em", marginBottom: 5 }}>Lucro previsto</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace", color: lucroPrev >= 0 ? COR.entrada : COR.saida }}>{fmtEUR0(lucroPrev)}</div>
          <div style={{ fontSize: 10, color: "#bbb", marginTop: 3 }}>
            orçado {fmtEUR0(lucro.orcado)} · {(lucroVar >= 0 ? "+" : "") + fmtEUR0(lucroVar)}
          </div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 10, padding: "14px 16px", borderTop: `3px solid ${COR.saldo}` }}>
          <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", letterSpacing: "0.07em", marginBottom: 5 }}>TIR do projeto (a.a.)</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace", color: tir != null ? COR.saldo : "#ddd" }}>
            {tir != null ? fmtNum(tir * 100, 1) + "%" : "—"}
          </div>
          <div style={{ fontSize: 10, color: "#bbb", marginTop: 3 }}>
            {tir != null ? "líquida de imposto" : "sem cálculo para este projeto"}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10.5, color: "#aaa", marginTop: 12, lineHeight: 1.6 }}>
        Clica num bloco para ver as categorias. <strong>Orçado</strong> vem do business plan;
        <strong> realizado</strong> são os movimentos bancários; <strong>a realizar</strong> são as
        previsões do Fluxo Futuro e as faturas por pagar. Variação positiva é favorável.
      </div>
    </div>
  );
}

// ─── ECRÃ COMPLETO (separador próprio) ───────────────────────────────────────
export default function RealOrcadoView({ empresasVisiveis }) {
  const empresas = Array.isArray(empresasVisiveis) ? empresasVisiveis : EMPRESAS;
  const [empSel, setEmpSel] = useState("todas");
  const empresasAtivas = empSel === "todas" ? empresas : empresas.filter(e => e.id === empSel);
  const { linhas, loading } = useRealOrcado(empresasAtivas);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: "13px 18px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select value={empSel} onChange={e => setEmpSel(e.target.value)}
          style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", minWidth: 240 }}>
          <option value="todas">Todas as empresas</option>
          {agruparPorGrupo(empresas).map(b => (
            <optgroup key={b.grupo} label={b.info.nome}>
              {b.empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </optgroup>
          ))}
        </select>
        {loading && <span style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>a carregar movimentos…</span>}
        <button onClick={() => window.print()}
          style={{ marginLeft: "auto", background: COR.tinta, color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Imprimir / PDF
        </button>
      </div>

      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: COR.tinta, fontFamily: "Georgia,serif", marginBottom: 4 }}>
          Real × Orçado
        </div>
        <div style={{ fontSize: 11, color: "#aaa", marginBottom: 16 }}>
          {empSel === "todas" ? "Todas as empresas" : empresasAtivas[0]?.nome} · realizado e a realizar calculados em tempo real a partir do ERP
        </div>
        {linhas.length === 0 && !loading
          ? <Vazio texto="Sem orçamento carregado para estas empresas. O orçado vem da tabela `orcamento` no Supabase." />
          : <RealOrcado linhas={linhas} />}
      </div>
    </div>
  );
}
