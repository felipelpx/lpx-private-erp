import React, { useState, useMemo, useEffect, useRef } from "react";
import { fmtEUR0 } from "./formato.js";
import { COR, RAIO } from "./brand.js";
import { calcularRealOrcado, semearDoModelo, id_orcamento,
         DONOS_DO_ORCAMENTO } from "./realOrcado.js";
import { MODELO_REAL_ORCADO } from "./modeloRealOrcado.js";

// ─────────────────────────────────────────────────────────────────────────────
// REAL × ORÇADO — a tabela
//
// Uma linha por rubrica da empresa, agrupadas em Entradas e Saídas como nas
// planilhas de fluxo operacional. Três colunas de números:
//
//   Orçado    escreve-se aqui, fica gravado, e não se mexe sozinho.
//   Real      o que já passou pela conta.
//   Forecast  o Real mais o que está comprometido — e que muda sempre que se
//             lança uma previsão, se recalcula um plano de obra ou se cria
//             uma despesa recorrente.
//
// O desvio lê-se como "acima" ou "abaixo" do orçado, que é a pergunta que se
// faz numa reunião — e a cor depende do lado: gastar menos é bom, vender
// menos não é.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pct = (v) => v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(0)}%`;

const th = {
  padding: "9px 12px", textAlign: "right", color: COR.textoTenue, fontSize: 9,
  letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 500,
  borderBottom: `1px solid ${COR.linha}`, whiteSpace: "nowrap",
};
const td = { padding: "6px 12px", fontSize: 12, color: COR.texto, textAlign: "right",
             fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

// ─── A célula do orçado, que grava sozinha ───────────────────────────────────
// Escrever e ler números: duas coisas diferentes.
//
// Enquanto se escreve, a caixa deixa escrever à vontade — "1 277 293,96",
// "1277293.96" ou "1.277.293,96" dão todos o mesmo. Fora da caixa, mostra-se
// formatado à portuguesa, com milhares e dois decimais quando os há. A coluna
// crua, com "1277293.96" ao lado de "3.653.080 €", não se lia.
const paraNumero = (t) => {
  const s = String(t ?? "").trim().replace(/[€\s\u00a0]/g, "");
  if (!s) return 0;
  // Último separador manda: em "1.277.293,96" é a vírgula, em "1,277,293.96"
  // é o ponto. O que vier antes dele são milhares e deita-se fora.
  const ultimaVirgula = s.lastIndexOf(","), ultimoPonto = s.lastIndexOf(".");
  let limpo = s;
  if (ultimaVirgula >= 0 || ultimoPonto >= 0) {
    const corte = Math.max(ultimaVirgula, ultimoPonto);
    const decimais = s.slice(corte + 1);
    // Três algarismos depois do separador e sem outro separador antes: é um
    // separador de milhares, não um decimal ("3.653" são três mil).
    const ehMilhar = /^\d{3}$/.test(decimais) &&
                     s.slice(0, corte).replace(/[.,]/g, "").length > 0 &&
                     !(ultimaVirgula >= 0 && ultimoPonto >= 0 && corte === ultimaVirgula);
    limpo = ehMilhar
      ? s.replace(/[.,]/g, "")
      : s.slice(0, corte).replace(/[.,]/g, "") + "." + decimais;
  }
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
};

const paraTexto = (n) => {
  const v = Math.abs(num(n));
  if (!(v > 0.005)) return "";
  return v.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

function Orcado({ valor, onGravar, podeEditar, rubrica, quemPode }) {
  const [v, setV] = useState(paraTexto(valor));
  const [aEscrever, setAEscrever] = useState(false);
  const [estado, setEstado] = useState("");
  const ultimo = useRef(num(valor));

  useEffect(() => {
    if (num(valor) !== num(ultimo.current)) {
      ultimo.current = num(valor);
      if (!aEscrever) setV(paraTexto(valor));
    }
  }, [valor, aEscrever]);

  const gravar = async () => {
    setAEscrever(false);
    const novo = Math.abs(paraNumero(v));
    setV(paraTexto(novo));
    if (Math.abs(novo - num(ultimo.current)) < 0.005) return;
    setEstado("gravando");
    const r = await onGravar(novo);
    if (r?.error) { setEstado("erro"); setV(paraTexto(ultimo.current)); }
    else { ultimo.current = novo; setEstado("ok"); setTimeout(() => setEstado(""), 1200); }
  };

  if (!podeEditar) {
    return (
      <span title={num(valor) > 0.005
        ? `Orçado de ${rubrica} — só ${quemPode} pode alterar`
        : `Sem orçamento escrito — só ${quemPode} o pode escrever`}
        style={{ fontVariantNumeric: "tabular-nums",
                 color: num(valor) > 0.005 ? COR.texto : COR.textoApagado }}>
        {num(valor) > 0.005 ? fmtEUR0(valor) : "—"}
      </span>
    );
  }

  const borda = estado === "erro" ? COR.negativo : estado === "ok" ? COR.positivo
              : aEscrever ? COR.ouro : COR.linha;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4,
                   justifyContent: "flex-end" }}>
      <input value={v}
        onFocus={(e) => { setAEscrever(true); e.target.select(); }}
        onChange={e => setV(e.target.value)} onBlur={gravar}
        onKeyDown={e => { if (e.key === "Enter") e.target.blur();
                          if (e.key === "Escape") { setV(paraTexto(ultimo.current)); e.target.blur(); } }}
        inputMode="decimal" placeholder="—"
        title={`Orçado de ${rubrica}`}
        style={{ width: 112, boxSizing: "border-box", textAlign: "right",
                 background: estado === "gravando" ? COR.fundoSuave : COR.papel,
                 border: `1px solid ${borda}`, borderRadius: 5, padding: "4px 7px",
                 fontSize: 11.5, outline: "none", color: COR.texto,
                 fontVariantNumeric: "tabular-nums" }} />
      <span style={{ fontSize: 10.5, color: num(valor) > 0.005 ? COR.textoTenue : "transparent" }}>€</span>
    </span>
  );
}

// ─── A tabela ────────────────────────────────────────────────────────────────
export default function RealOrcadoTabela({
  empresaId, nomeEmpresa, movimentos = [], faturas = [], pagamentos = [],
  recorrentes = [], vendas = [], recebiveis = [], fracoes = [],
  orcamento = [], podeEditar = false, onGravarOrcado,
  loading = false, hoje,
}) {
  const [soComDados, setSoComDados] = useState(true);
  // O capital (aportes, resgates, mútuos, funding, amortização) fica fechado:
  // a tabela é da operação, de "Vendas" para baixo.
  const [verCapital, setVerCapital] = useState(false);
  const [aSemear, setASemear] = useState(false);
  const [erro, setErro] = useState("");

  const quemPode = DONOS_DO_ORCAMENTO.join(" ou ");

  const r = useMemo(() => calcularRealOrcado({
    empresaId, nomeEmpresa, movimentos, faturas, pagamentos, recorrentes,
    vendas, recebiveis, fracoes, orcamento, hoje,
  }), [empresaId, nomeEmpresa, movimentos, faturas, pagamentos, recorrentes,
       vendas, recebiveis, fracoes, orcamento, hoje]);

  const gravar = (rubrica) => async (valor) => {
    const res = await onGravarOrcado?.({
      id: id_orcamento(empresaId, rubrica),
      empresa_id: empresaId, categoria: rubrica, orcado: valor,
    });
    if (res?.error) setErro(res.error.message || "Não foi possível gravar o orçado.");
    return res;
  };

  // Aproveitar o business plan que já estava escrito no código.
  const porSemear = useMemo(() => {
    const sugestao = semearDoModelo(MODELO_REAL_ORCADO[empresaId], empresaId);
    const jaTem = new Set(r.linhas.filter(l => l.orcado > 0.005).map(l => l.rubrica));
    return sugestao.filter(s => !jaTem.has(s.rubrica));
  }, [empresaId, r.linhas]);

  const semear = async () => {
    if (aSemear || !porSemear.length) return;
    setASemear(true); setErro("");
    for (const s of porSemear) {
      const res = await gravar(s.rubrica)(s.orcado);
      if (res?.error) break;
    }
    setASemear(false);
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: COR.textoApagado, fontSize: 12 }}>
      A ler os movimentos do projeto…</div>;
  }
  if (!empresaId || empresaId === "todas" || empresaId === "all") {
    return <div style={{ padding: 40, textAlign: "center", color: COR.textoApagado, fontSize: 12 }}>
      Escolha um projeto: um orçamento é de uma empresa.</div>;
  }

  const visiveis = (ls) => soComDados ? ls.filter(l => !l.vazia) : ls;
  const entradas = visiveis(r.entradas);
  const saidas = visiveis(r.saidas);
  const capital = visiveis(r.capital);

  const Secao = ({ titulo, linhas, total, cor }) => (
    <>
      <tr>
        <td colSpan={6} style={{ ...td, textAlign: "left", paddingTop: 16, paddingBottom: 5,
                                 fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
                                 color: COR.textoTenue, fontWeight: 600 }}>{titulo}</td>
      </tr>
      {linhas.length === 0 && (
        <tr><td colSpan={6} style={{ ...td, textAlign: "left", color: COR.textoApagado, fontSize: 11 }}>
          Nada nesta secção.</td></tr>
      )}
      {linhas.map(l => (
        <tr key={l.rubrica} style={{ borderTop: `1px solid ${COR.linhaSuave}` }}>
          <td style={{ ...td, textAlign: "left", color: l.noPlano ? COR.texto : COR.negativoForte }}
              title={l.noPlano ? undefined : `${l.rubrica} — fora do plano de contas da empresa`}>
            {l.rubrica}{l.noPlano ? "" : " ⚠"}
          </td>
          <td style={td}><Orcado valor={l.orcado} podeEditar={podeEditar}
                                 rubrica={l.rubrica} quemPode={quemPode}
                                 onGravar={gravar(l.rubrica)} /></td>
          <td style={{ ...td, color: COR.textoSuave }}>
            {l.detalhe.nMovimentos ? fmtEUR0(l.realAbs) : "—"}
          </td>
          <td style={{ ...td, fontWeight: 600, color: cor }}
              title={[
                `Real ${fmtEUR0(l.realAbs)}`,
                l.detalhe.faturasPorPagar ? `faturas por pagar ${fmtEUR0(Math.abs(l.detalhe.faturasPorPagar))}` : null,
                l.detalhe.previsoes ? `previsões do fluxo ${fmtEUR0(Math.abs(l.detalhe.previsoes))}` : null,
                l.detalhe.recorrentes ? `recorrentes ${fmtEUR0(Math.abs(l.detalhe.recorrentes))} (${l.detalhe.nRecorrentes}×)` : null,
                l.detalhe.porReceber ? `por receber ${fmtEUR0(Math.abs(l.detalhe.porReceber))} (${l.detalhe.nPorReceber}×)` : null,
              ].filter(Boolean).join(" · ")}>
            {Math.abs(l.forecast) > 0.005 ? fmtEUR0(l.forecastAbs) : "—"}
          </td>
          <td style={{ ...td, color: l.bom === null ? COR.textoApagado
                                   : l.bom ? COR.positivoForte : COR.negativoForte }}>
            {l.orcado > 0.005 ? `${l.desvio > 0 ? "+" : ""}${fmtEUR0(l.desvio)}` : "—"}
          </td>
          <td style={{ ...td, fontSize: 11, color: l.bom === null ? COR.textoApagado
                                   : l.bom ? COR.positivoForte : COR.negativoForte }}>
            {l.orcado > 0.005 ? pct(l.desvioPct) : "—"}
          </td>
        </tr>
      ))}
      <tr style={{ borderTop: `1px solid ${COR.linhaForte}`, background: COR.fundoTenue }}>
        <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>Total {titulo.toLowerCase()}</td>
        <td style={{ ...td, fontWeight: 700 }}>{total.orcado > 0.005 ? fmtEUR0(total.orcado) : "—"}</td>
        <td style={{ ...td, fontWeight: 700, color: COR.textoSuave }}>{fmtEUR0(total.real)}</td>
        <td style={{ ...td, fontWeight: 700, color: cor }}>{fmtEUR0(total.forecast)}</td>
        <td style={{ ...td, fontWeight: 700 }}>
          {total.orcado > 0.005 ? fmtEUR0(total.forecast - total.orcado) : "—"}</td>
        <td style={td} />
      </tr>
    </>
  );

  const res = r.totais.resultado;

  return (
    <div>
      {/* ── Barra de estado ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                    marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11,
                        color: COR.textoSuave, cursor: "pointer" }}>
          <input type="checkbox" checked={soComDados} onChange={e => setSoComDados(e.target.checked)}
            style={{ width: 14, height: 14, accentColor: COR.navy }} />
          Só as rubricas com orçamento ou movimento
        </label>
        <span style={{ fontSize: 11, color: COR.textoApagado }}>
          {r.nOrcadas} de {r.operacao.length} rubricas orçadas
        </span>
        {r.nCapital > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11,
                          color: COR.textoSuave, cursor: "pointer" }}
                 title="Aportes, resgates, mútuos, funding e amortização — como o projeto é pago, não o que o projeto faz">
            <input type="checkbox" checked={verCapital} onChange={e => setVerCapital(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: COR.navy }} />
            Incluir capital e financiamento ({r.nCapital})
          </label>
        )}
        {podeEditar && porSemear.length > 0 && (
          <button onClick={semear} disabled={aSemear}
            title="Preenche o orçado das rubricas que batem com o business plan que já estava no sistema. Não toca no que já estiver escrito."
            style={{ marginLeft: "auto", background: COR.ouroTenue, border: `1px solid ${COR.alertaLinha}`,
                     color: COR.ouroEscuro, padding: "6px 13px", borderRadius: 7, fontSize: 11.5,
                     fontWeight: 600, cursor: aSemear ? "default" : "pointer" }}>
            {aSemear ? "A preencher…" : `Trazer ${porSemear.length} do business plan`}
          </button>
        )}
      </div>

      {!podeEditar && (
        <div style={{ background: COR.fundoSuave, border: `1px solid ${COR.linha}`,
                      borderRadius: 9, padding: "9px 13px", fontSize: 11.5,
                      color: COR.textoSuave, marginBottom: 12, lineHeight: 1.6 }}>
          O <strong>Orçado</strong> é só de leitura: o orçamento é o compromisso com os
          investidores e muda-se numa revisão, não no dia a dia. Quem o pode alterar:{" "}
          {quemPode}.
        </div>
      )}
      {podeEditar && r.nOrcadas === 0 && (
        <div style={{ background: COR.alertaFundo, border: `1px solid ${COR.alertaLinha}`,
                      borderRadius: 9, padding: "10px 13px", fontSize: 11.5,
                      color: COR.alertaForte, marginBottom: 12, lineHeight: 1.6 }}>
          Esta empresa ainda não tem orçamento escrito. A coluna <strong>Orçado</strong> é
          editável: escreve-se uma vez por rubrica e fica gravada. As outras duas calculam-se
          sozinhas.
        </div>
      )}
      {erro && (
        <div style={{ background: COR.negativoFundo, border: `1px solid ${COR.negativoLinha}`,
                      borderRadius: 9, padding: "9px 13px", fontSize: 11.5,
                      color: COR.negativoForte, marginBottom: 12 }}>{erro}</div>
      )}

      {/* ── A tabela ────────────────────────────────────────────────────── */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 740 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Rubrica</th>
              <th style={th} title="O que se contratou. Estático: só muda quando o escrever.">Orçado</th>
              <th style={th} title="O que já passou pela conta, desde o início do projeto.">Real</th>
              <th style={th} title="Real + faturas por pagar + previsões do Fluxo Futuro + recorrentes. Muda sozinho.">Forecast</th>
              <th style={th}>Δ</th>
              <th style={th}>Δ %</th>
            </tr>
          </thead>
          <tbody>
            <Secao titulo="Entradas" linhas={entradas} total={r.totais.entradas}
                   cor={COR.positivoForte} />
            <Secao titulo="Saídas" linhas={saidas} total={r.totais.saidas}
                   cor={COR.negativoForte} />
            {verCapital && (
              <Secao titulo="Capital e financiamento" linhas={capital}
                     total={r.totaisCapital} cor={COR.infoForte} />
            )}
            <tr style={{ borderTop: `2px solid ${COR.navy}`, background: COR.navy }}>
              <td style={{ ...td, textAlign: "left", fontWeight: 700, color: COR.creme,
                           padding: "10px 12px" }}>
                Resultado da operação{verCapital ? " (sem o capital)" : ""}</td>
              <td style={{ ...td, fontWeight: 700, color: COR.creme }}>
                {Math.abs(res.orcado) > 0.005 ? fmtEUR0(res.orcado) : "—"}</td>
              <td style={{ ...td, fontWeight: 700, color: COR.sobreEscuroTenue }}>
                {fmtEUR0(res.real)}</td>
              <td style={{ ...td, fontWeight: 700,
                           color: res.forecast >= 0 ? "#7FC9A3" : "#E79C92" }}>
                {fmtEUR0(res.forecast)}</td>
              <td style={{ ...td, fontWeight: 700, color: COR.creme }}>
                {Math.abs(res.orcado) > 0.005 ? fmtEUR0(res.forecast - res.orcado) : "—"}</td>
              <td style={td} />
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 10.5, color: COR.textoApagado, marginTop: 11, lineHeight: 1.6 }}>
        As rubricas são as do plano de contas desta empresa — as mesmas do extrato e dos
        gráficos —, da operação: começa nas vendas, que é onde acaba o bloco de capital e
        financiamento que abre o plano. O <strong>Orçado</strong> é estático. O{" "}
        <strong>Forecast</strong> soma ao realizado tudo o que já está comprometido: as
        vendas por receber, as faturas por pagar, as previsões do Fluxo Futuro (onde entra
        o plano de obra) e as despesas recorrentes. Por isso muda sozinho sempre que uma
        delas muda.
      </div>
    </div>
  );
}
