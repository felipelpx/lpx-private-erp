// ─────────────────────────────────────────────────────────────────────────────
// FLUXO REALIZADO — a outra metade do Fluxo Futuro
//
// Mesma grelha, mesmas rubricas, mesmas três secções (receitas, custos,
// funding). A diferença é a origem: ali são previsões, faturas e recorrentes;
// aqui é o extrato. Nada se prevê — já aconteceu.
//
// Partilha o motor da matriz com o futuro de propósito (src/matriz.js). Duas
// implementações da mesma grelha divergiam ao primeiro ajuste, e já custou
// caro ter o mesmo conceito contado de maneiras diferentes em ecrãs
// diferentes.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useCallback } from "react";
import { useMovimentosPeriodo } from "./hooks.js";
import { EMPRESAS } from "./empresas.js";
import { rubricaDe, ehAjuste, ehTransferenciaInterna } from "./rubricas.js";
import { rubricaNoFluxo } from "./obra.js";
import { construirMatriz } from "./matriz.js";
import MatrizFluxo from "./MatrizFluxo.jsx";
import { mesesRealizados } from "./realizado.js";
import { fmtEUR } from "./formato.js";
import { COR } from "./brand.js";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const arred2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const hojeISO = () => new Date().toISOString().slice(0, 10);
const mesAtual = () => hojeISO().slice(0, 7);

// Doze meses atrás, que é o arranque razoável: um ano fechado.
const umAnoAtras = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 11);
  return d.toISOString().slice(0, 7);
};

export default function FluxoRealizado({ currentUser, EMPRESAS: empresasVisiveis }) {
  const empresas = Array.isArray(empresasVisiveis) && empresasVisiveis.length
    ? empresasVisiveis : EMPRESAS;

  const [empresa, setEmpresa] = useState("all");
  const [de, setDe] = useState(umAnoAtras());
  const [ate, setAte] = useState(mesAtual());
  const [nMeses, setNMeses] = useState(12);
  const [mostrarVazios, setMostrarVazios] = useState(false);

  const ativas = empresa === "all" ? empresas : empresas.filter(e => e.id === empresa);
  const contaIds = useMemo(
    () => ativas.flatMap(e => (e.contas || []).map(c => c.id)),
    [ativas.map(e => e.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // O extrato do período. O `ate` é um mês, por isso estica-se até ao último
  // dia dele — senão um movimento do dia 30 ficava de fora do próprio mês.
  const { movimentos, loading } = useMovimentosPeriodo(
    contaIds, `${de}-01`, fimDoMes(ate));

  // ── Em que rubrica cai cada movimento ────────────────────────────────────
  // É a mesma pergunta que o Fluxo Futuro e o Real × Orçado fazem, e tem de
  // ter a mesma resposta: a rubrica do plano de contas DA EMPRESA, com o IVA
  // da obra lido como obra.
  //
  // Devolver `null` deixa o movimento de fora. Saem os ajustes e as
  // transferências entre contas da mesma empresa: entram de um lado e saem do
  // outro pelo mesmo valor, e não são fluxo do projeto — inflavam as duas
  // pontas sem mexer no líquido.
  const rubricaDoMovimento = useCallback((m) => {
    const emp = m?.empresa_id || (empresa !== "all" ? empresa : "");
    const r = rubricaDe(emp, m?.categoria, m?.subcategoria);
    if (r === null) return null;
    if (ehAjuste(r) || ehTransferenciaInterna(r)) return null;
    const g = EMPRESAS.find(e => e.id === emp)?.grupo === "HDG" ? "HDG" : "LPX";
    return rubricaNoFluxo(g, r, m?.movimento || "");
  }, [empresa]);

  const resumo = useMemo(
    () => mesesRealizados({ movimentos, rubricaDoMovimento, de, ate,
                            comVazios: mostrarVazios }),
    [movimentos, rubricaDoMovimento, de, ate, mostrarVazios]);

  const matriz = useMemo(() => construirMatriz({
    meses: resumo.meses, maxMeses: nMeses, comVazios: mostrarVazios,
    // A rubrica já vem resolvida de cima; aqui é só lê-la.
    rubricaDoItem: (it) => it?.cat || "",
  }), [resumo.meses, nMeses, mostrarVazios]);

  // ── O cabeçalho é CAIXA, não operação ────────────────────────────────────
  // Estes dois vêm dos meses em cru, antes da divisão em secções: é tudo o
  // que entrou e saiu da conta, incluindo o desembolso do banco e a
  // amortização. Começaram por ser `matriz.entradas` e `matriz.saidas` — mas
  // essas, desde que o funding passou a ter secção própria, são só a
  // operação, e o ecrã dizia "entrou 300 000" num mês em que entraram
  // 500 000. Num quadro chamado fluxo, isso é mentira.
  //
  // A repartição por secções continua a ver-se na grelha, que é onde ela
  // ajuda a ler; aqui em cima o que se quer é o dinheiro.
  const totalEntradas = arred2(resumo.meses.reduce((s, m) => s + num(m.entradas), 0));
  const totalSaidas = arred2(resumo.meses.reduce((s, m) => s + num(m.saidas), 0));
  // E o líquido da operação — receitas menos custos, sem o funding —, que
  // responde à outra pergunta: o projeto paga-se a si mesmo?
  const liquidoOperacao = matriz.totalLiquidoOperacao || 0;

  return (
    <div>
      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end",
                    marginBottom: 14 }}>
        <Campo rotulo="Projeto">
          <select value={empresa} onChange={e => setEmpresa(e.target.value)} style={sel}>
            <option value="all">Todos os Projetos</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="De">
          <input type="month" value={de} max={ate} onChange={e => setDe(e.target.value)} style={sel} />
        </Campo>
        <Campo rotulo="Até">
          <input type="month" value={ate} min={de} max={mesAtual()}
            onChange={e => setAte(e.target.value)} style={sel} />
        </Campo>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11,
                        color: COR.textoSuave, cursor: "pointer", paddingBottom: 8 }}>
          <input type="checkbox" checked={mostrarVazios}
            onChange={e => setMostrarVazios(e.target.checked)}
            style={{ width: 14, height: 14, accentColor: COR.navy }} />
          Mostrar meses sem movimento
        </label>
      </div>

      {/* ── Cabeçalho com a conta do período ─────────────────────────────── */}
      <div style={{ background: COR.navy, borderRadius: 12, padding: "14px 18px",
                    marginBottom: 14, display: "flex", gap: 28, flexWrap: "wrap",
                    alignItems: "baseline" }}>
        <div>
          <div style={rotuloEscuro}>Entrou</div>
          <div style={{ ...valorEscuro, color: "#7FC9A3" }}>{fmtEUR(totalEntradas)}</div>
        </div>
        <div>
          <div style={rotuloEscuro}>Saiu</div>
          <div style={{ ...valorEscuro, color: "#E79C92" }}>{fmtEUR(totalSaidas)}</div>
        </div>
        <div>
          <div style={rotuloEscuro}>Líquido de caixa</div>
          <div style={{ ...valorEscuro,
                        color: totalEntradas - totalSaidas >= 0 ? "#7FC9A3" : "#E79C92" }}>
            {fmtEUR(totalEntradas - totalSaidas)}
          </div>
        </div>
        <div title="Receitas menos custos, sem o funding. Diz se o projeto se paga a si mesmo — o líquido de caixa ao lado inclui o desembolso do banco e a amortização.">
          <div style={rotuloEscuro}>Líquido da operação</div>
          <div style={{ ...valorEscuro, fontSize: 15,
                        color: liquidoOperacao >= 0 ? "#7FC9A3" : "#E79C92" }}>
            {fmtEUR(liquidoOperacao)}
          </div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={rotuloEscuro}>
            {resumo.meses.length} {resumo.meses.length === 1 ? "mês" : "meses"}
          </div>
          <div style={{ fontSize: 11, color: COR.sobreEscuroTenue }}>
            {resumo.nUsados} movimentos
            {resumo.nIgnorados > 0 && (
              <span title="Ajustes e transferências entre contas da mesma empresa: entram de um lado e saem do outro pelo mesmo valor, e não são fluxo do projeto.">
                {" · "}{resumo.nIgnorados} fora do fluxo
              </span>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ padding: 30, textAlign: "center", color: COR.textoApagado, fontSize: 12 }}>
          A ler o extrato…
        </div>
      )}

      {!loading && resumo.meses.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: COR.textoApagado, fontSize: 12 }}>
          Sem movimentos no período escolhido.
        </div>
      )}

      {!loading && resumo.meses.length > 0 && (
        <MatrizFluxo matriz={matriz} isAdmin={false} acoes={{}}
          nMeses={nMeses} onNMeses={setNMeses} comVazios={mostrarVazios} />
      )}

      <div style={{ fontSize: 10.5, color: COR.textoApagado, marginTop: 11, lineHeight: 1.6 }}>
        Isto é o <strong>extrato</strong>, arrumado pelas mesmas rubricas e nas mesmas três
        secções do Fluxo Futuro — receitas, custos e, por baixo, funding. Não há nada
        previsto aqui: cada número já passou pela conta. Os meses vêm <strong>do mais
        recente para o mais antigo</strong>, ao contrário do futuro, porque num quadro de
        realizado é o mês que acabou que se quer ver primeiro. Clica numa célula para ver
        os movimentos que a compõem.
      </div>
    </div>
  );
}

// Último dia do mês "AAAA-MM", para o filtro não cortar o próprio mês.
function fimDoMes(mes) {
  const [a, m] = String(mes || "").split("-").map(Number);
  if (!a || !m) return null;
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

const sel = {
  background: "#F9F5EF", border: "1px solid #E3D9CC", borderRadius: 8,
  padding: "8px 11px", fontSize: 12.5, outline: "none", minWidth: 150,
};
const rotuloEscuro = {
  fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase",
  color: "#8FA3B3", fontFamily: "var(--fonte-numero)", marginBottom: 3,
};
const valorEscuro = {
  fontSize: 17, fontWeight: 700, fontFamily: "var(--fonte-numero)",
};

function Campo({ rotulo, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 10, color: "#9DA2A6", textTransform: "uppercase",
                      fontFamily: "var(--fonte-numero)", letterSpacing: "0.05em" }}>
        {rotulo}
      </label>
      {children}
    </div>
  );
}
