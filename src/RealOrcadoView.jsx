import React, { useState, useMemo } from "react";
import { EMPRESAS, agruparPorGrupo } from "./empresas.js";
import { useMovimentosPeriodo, usePagamentosExtras, useFaturas,
         useOrcamento, useDespesasRecorrentes } from "./hooks.js";
import RealOrcadoTabela from "./RealOrcadoTabela.jsx";
import { COR, RAIO } from "./brand.js";

// ─────────────────────────────────────────────────────────────────────────────
// REAL × ORÇADO — o separador próprio
//
// A tabela vive em src/RealOrcadoTabela.jsx, partilhada com o Investor
// Relations: os dois ecrãs mostram exatamente o mesmo, para não haver duas
// versões da verdade.
//
// Aqui só se vai buscar os dados. O período é de propósito a vida toda do
// projeto: um orçamento compara-se com o acumulado, não com o mês escolhido
// no filtro de um gráfico.
// ─────────────────────────────────────────────────────────────────────────────

const DESDE_SEMPRE = "2000-01-01";

export function useDadosRealOrcado(empresaId, empresas) {
  const empresa = useMemo(
    () => (empresas || EMPRESAS).find(e => e.id === empresaId) || null, [empresas, empresaId]);
  const contaIds = useMemo(
    () => empresa?.contas?.map(c => c.id).filter(Boolean) || [], [empresa]);

  const hoje = new Date().toISOString().slice(0, 10);
  const { movimentos, loading: mLoad } = useMovimentosPeriodo(contaIds, DESDE_SEMPRE, hoje);
  const { faturas, loading: fLoad } = useFaturas();
  const { pagamentos, loading: pLoad } = usePagamentosExtras();
  const { recorrentes } = useDespesasRecorrentes();
  const { orcamento, upsertOrcamento } = useOrcamento();

  return { empresa, movimentos, faturas, pagamentos, recorrentes, orcamento,
           upsertOrcamento, loading: mLoad || fLoad || pLoad, hoje };
}

export default function RealOrcadoView({ empresasVisiveis, currentUser }) {
  const empresas = Array.isArray(empresasVisiveis) ? empresasVisiveis : EMPRESAS;
  const [empSel, setEmpSel] = useState(empresas[0]?.id || "");
  const d = useDadosRealOrcado(empSel, empresas);
  const podeEditar = currentUser?.role === "admin" || currentUser?.role === "gestor";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ background: COR.papel, border: `1px solid ${COR.linha}`,
                    borderRadius: RAIO.grande, padding: "13px 18px", display: "flex",
                    gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select value={empSel} onChange={e => setEmpSel(e.target.value)}
          style={{ background: COR.papel, border: `1px solid ${COR.linhaForte}`,
                   borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none",
                   minWidth: 240, color: COR.texto }}>
          {agruparPorGrupo(empresas).map(b => (
            <optgroup key={b.grupo} label={b.info.nome}>
              {b.empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </optgroup>
          ))}
        </select>
        {d.loading && <span style={{ fontSize: 11, color: COR.textoTenue }}>a carregar…</span>}
        <button onClick={() => window.print()}
          style={{ marginLeft: "auto", background: COR.navy, color: COR.creme, border: "none",
                   borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 600,
                   cursor: "pointer" }}>Imprimir / PDF</button>
      </div>

      <div style={{ background: COR.papel, border: `1px solid ${COR.linha}`,
                    borderRadius: RAIO.grande, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: COR.texto,
                      fontFamily: "var(--fonte-titulo)", marginBottom: 4 }}>
          Real × Orçado
        </div>
        <div style={{ fontSize: 11, color: COR.textoTenue, marginBottom: 16 }}>
          {d.empresa?.nome || "—"} · pelas rubricas da empresa · desde o início do projeto
        </div>
        <RealOrcadoTabela
          empresaId={empSel} nomeEmpresa={d.empresa?.nome}
          movimentos={d.movimentos} faturas={d.faturas} pagamentos={d.pagamentos}
          recorrentes={d.recorrentes} orcamento={d.orcamento}
          podeEditar={podeEditar} onGravarOrcado={d.upsertOrcamento}
          loading={d.loading} hoje={d.hoje} />
      </div>
    </div>
  );
}
