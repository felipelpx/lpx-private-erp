import React, { useMemo } from "react";
import { conferirRateio, repartirResto, LINHA_VAZIA } from "./rateio.js";
import { categoriasDeFatura } from "./rubricas.js";
import { usaSubcategoria, subcategoriasDa } from "./categoriasEmpresa.js";
import { CATEGORIAS_FATURA } from "./categorias.js";

// ─────────────────────────────────────────────────────────────────────────────
// REPARTIR UMA FATURA POR VÁRIAS CATEGORIAS
//
// Fica fechado por omissão: a esmagadora maioria das faturas tem uma
// categoria só, e um bloco sempre aberto com linhas vazias convida a enganos.
// Abre-se quando é preciso, e a partir daí a classificação normal da fatura
// deixa de mandar — é a repartição que decide por que rubricas o dinheiro
// passa no Fluxo Futuro e no Real × Orçado.
//
// A conta das partes tem de fechar com o total da fatura, e o botão de
// guardar fica travado enquanto não fechar. Ver a nota em src/rateio.js para
// a razão: uma repartição que soma menos faz desaparecer dinheiro dos mapas
// sem nada que o denuncie.
// ─────────────────────────────────────────────────────────────────────────────

const eur = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "−" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d} €`;
};

const campo = {
  background: "#F9F5EF", border: "1px solid #E3D9CC", borderRadius: 7,
  padding: "7px 9px", fontSize: 12, outline: "none", width: "100%",
  boxSizing: "border-box",
};
const rotulo = {
  fontSize: 9.5, color: "#9DA2A6", fontFamily: "var(--fonte-numero)",
  textTransform: "uppercase", letterSpacing: "0.05em",
};

export default function RateioFatura({ empresa, total, rateio, onMudar }) {
  const linhas = Array.isArray(rateio) && rateio.length ? rateio : [];
  const ligado = linhas.length > 0;

  const cats = useMemo(
    () => (empresa ? categoriasDeFatura(empresa) : CATEGORIAS_FATURA) || [],
    [empresa]);
  const temSub = usaSubcategoria(empresa);

  const check = useMemo(() => conferirRateio(linhas, total), [linhas, total]);

  const mudar = (i, chave, v) => {
    const novas = linhas.map((l, k) => {
      if (k !== i) return l;
      const l2 = { ...l, [chave]: v };
      // Valor e percentagem são alternativas: escrever num limpa o outro,
      // senão fica a dúvida de qual é que manda.
      if (chave === "valor") l2.pct = "";
      if (chave === "pct") l2.valor = "";
      if (chave === "categoria") l2.subcategoria = "";
      return l2;
    });
    onMudar(novas);
  };

  const acrescentar = () => onMudar([...linhas, { ...LINHA_VAZIA }]);
  const tirar = (i) => onMudar(linhas.filter((_, k) => k !== i));

  if (!ligado) {
    return (
      <div style={{ gridColumn: "1 / -1" }}>
        <button type="button"
          onClick={() => onMudar([{ ...LINHA_VAZIA }, { ...LINHA_VAZIA }])}
          title="Divide esta fatura por várias categorias, por valor ou por percentagem"
          style={{ background: "#EDF1F5", border: "none", color: "#2C4A63",
                   padding: "8px 12px", borderRadius: 8, fontSize: 11.5,
                   cursor: "pointer", fontWeight: 600 }}>
          Repartir por várias categorias
        </button>
      </div>
    );
  }

  return (
    <div style={{ gridColumn: "1 / -1", border: "1px solid #E3D9CC",
                  borderRadius: 10, padding: 12, background: "#FDFAF6" }}>
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "baseline", marginBottom: 8 }}>
        <div style={rotulo}>Repartição por categorias</div>
        <button type="button" onClick={() => onMudar([])}
          title="Volta à classificação normal, com uma categoria só"
          style={{ background: "none", border: "none", color: "#9DA2A6",
                   fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
          deixar de repartir
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {linhas.map((l, i) => (
          <div key={i} style={{ display: "grid", alignItems: "center", gap: 6,
                 gridTemplateColumns: temSub ? "1.3fr 1.3fr 90px 70px 26px"
                                             : "2.6fr 90px 70px 26px" }}>
            <select value={l.categoria || ""} style={campo}
              onChange={e => mudar(i, "categoria", e.target.value)}>
              <option value="">Categoria...</option>
              {cats.map(o => <option key={o}>{o}</option>)}
            </select>

            {temSub && (
              <select value={l.subcategoria || ""} style={{ ...campo,
                       background: l.categoria ? "#F9F5EF" : "#F2EDE5" }}
                disabled={!l.categoria}
                onChange={e => mudar(i, "subcategoria", e.target.value)}>
                <option value="">{l.categoria ? "Subcategoria..." : "—"}</option>
                {(subcategoriasDa(empresa, l.categoria) || [])
                  .map(o => <option key={o}>{o}</option>)}
              </select>
            )}

            <input type="number" step="0.01" placeholder="valor €"
              value={l.valor ?? ""} style={{ ...campo, textAlign: "right" }}
              onChange={e => mudar(i, "valor", e.target.value)} />
            <input type="number" step="0.01" placeholder="%"
              value={l.pct ?? ""} style={{ ...campo, textAlign: "right" }}
              onChange={e => mudar(i, "pct", e.target.value)} />

            <button type="button" onClick={() => tirar(i)} title="Tirar esta linha"
              style={{ background: "none", border: "none", color: "#C4C7CA",
                       fontSize: 15, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 9,
                    flexWrap: "wrap" }}>
        <button type="button" onClick={acrescentar}
          style={{ background: "#EDF1F5", border: "none", color: "#2C4A63",
                   padding: "6px 10px", borderRadius: 7, fontSize: 11,
                   cursor: "pointer", fontWeight: 600 }}>
          + linha
        </button>
        {check.sobra > 0.004 && (
          <button type="button" onClick={() => onMudar(repartirResto(linhas, total))}
            title="Põe o que falta nas linhas que ainda não têm valor"
            style={{ background: "#EDF1F5", border: "none", color: "#2C4A63",
                     padding: "6px 10px", borderRadius: 7, fontSize: 11,
                     cursor: "pointer", fontWeight: 600 }}>
            repartir o resto
          </button>
        )}

        <div style={{ marginLeft: "auto", fontSize: 11.5, textAlign: "right",
                      fontFamily: "var(--fonte-numero)" }}>
          <span style={{ color: "#9DA2A6" }}>soma </span>
          <strong style={{ color: check.fecha ? "#1B6A49" : "#A93226" }}>
            {eur(check.soma)}
          </strong>
          <span style={{ color: "#9DA2A6" }}> de {eur(Math.abs(Number(total) || 0))}</span>
        </div>
      </div>

      {/* Os erros aparecem aqui e travam o guardar (ver App.jsx). Dizer
          "não fecha" sem dizer quanto falta obrigava a fazer a conta à mão. */}
      {check.erros.map((e, i) => (
        <div key={i} style={{ fontSize: 11, color: "#A93226", marginTop: 6,
                              lineHeight: 1.5 }}>{e}</div>
      ))}
      {check.erros.length === 0 && check.avisos.map((a, i) => (
        <div key={i} style={{ fontSize: 11, color: "#96702A", marginTop: 6,
                              lineHeight: 1.5 }}>{a}</div>
      ))}
      {check.fecha && (
        <div style={{ fontSize: 10.5, color: "#9DA2A6", marginTop: 6, lineHeight: 1.5 }}>
          A categoria e a subcategoria em cima deixam de decidir onde esta fatura
          cai: passam a ser estas {linhas.length} linhas, no Fluxo Futuro e no
          Real × Orçado.
        </div>
      )}
    </div>
  );
}
