// ─────────────────────────────────────────────────────────────────────────────
// A OBSERVAÇÃO DE UMA LINHA
//
// Numa tabela larga a observação tem de caber numa coluna estreita, e fica
// cortada: "Execução emprei…". Mas é lá que está escrito o que a fatura é — e
// quem está a decidir um pagamento precisa de a ler, não de adivinhar.
//
// Passar o rato mostra-a inteira, num painel que não empurra a tabela nem
// espera o segundo que o `title` do browser demora. Fica preso ao ecrã
// (position: fixed), por isso não é cortado pelo overflow da tabela, e
// encosta-se à esquerda ou à direita conforme o espaço que houver.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";

export default function CelulaObs({ texto, largura = 100, cor = "#B2B6B9",
                                    tamanho = 11, estilo = {} }) {
  const [caixa, setCaixa] = useState(null);   // { x, y, acimaDe }
  const t = String(texto || "").trim();
  if (!t) return <span style={{ color: "#E3D9CC", fontSize: tamanho }}>—</span>;

  const mostrar = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const LARGURA = 380;
    setCaixa({
      x: Math.max(10, Math.min(r.left, vw - LARGURA - 14)),
      // Se não houver espaço por baixo, abre por cima da própria linha.
      y: r.bottom + 190 > vh ? null : r.bottom + 6,
      yCima: vh - r.top + 6,
      largura: LARGURA,
    });
  };

  return (
    <span style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}
      onMouseEnter={mostrar} onMouseLeave={() => setCaixa(null)}>
      <span style={{
        display: "block", maxWidth: largura, overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap",
        color: cor, fontSize: tamanho, cursor: "help", ...estilo,
      }}>
        {t}
      </span>

      {caixa && (
        <span style={{
          position: "fixed", zIndex: 400,
          left: caixa.x,
          ...(caixa.y !== null ? { top: caixa.y } : { bottom: caixa.yCima }),
          width: caixa.largura, maxWidth: "92vw", boxSizing: "border-box",
          background: "#091C2A", color: "#FCF3EB",
          padding: "10px 13px", borderRadius: 9, fontSize: 12, lineHeight: 1.55,
          boxShadow: "0 12px 34px rgba(9,28,42,0.3)",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
          pointerEvents: "none", display: "block", textAlign: "left",
        }}>
          {t}
        </span>
      )}
    </span>
  );
}
