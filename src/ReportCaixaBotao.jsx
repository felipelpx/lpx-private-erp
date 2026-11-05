// ─────────────────────────────────────────────────────────────────────────────
// O BOTÃO DO REPORT DE CAIXA
//
// Carrega-se, vai buscar o extrato da última semana (só nessa altura — ver
// lerCaixaSemana), monta os quatro slides e descarrega o .pptx.
//
// Os meses e o saldo vêm de fora, do Fluxo Futuro: são os MESMOS que estão na
// matriz. Se este botão fosse buscar o fluxo por outro caminho, o report e o
// ecrã acabavam a dizer coisas diferentes na mesma reunião.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { lerCaixaSemana } from "./hooks.js";
import { construirReportCaixa, hoje7DiasAntes } from "./reportCaixa.js";
import { gerarReportCaixaPptx } from "./reportCaixaPptx.js";

export default function BotaoReportCaixa({
  nomeEmpresa, contaIds = [], meses = [], saldoAtual = 0, vencido = 0,
  hoje = new Date().toISOString().slice(0, 10), dias = 7, nMeses = 6,
  rubricaDoItem = null,
  // As faturas do Contas a Pagar e o id da empresa: o slide 1 mostra o que
  // está por pagar, e isso é o Contas a Pagar — não o "vencido" do caixa,
  // que junta quatro origens e desconta o funding.
  faturas = [], empresa = null,
}) {
  const [aGerar, setAGerar] = useState(false);

  const gerar = async () => {
    if (aGerar) return;
    setAGerar(true);
    try {
      const de = hoje7DiasAntes(hoje, dias);
      const { saldoAnterior, movimentos, erro } = await lerCaixaSemana(contaIds, de, hoje);

      // Um erro a ler o extrato não pode dar um report silenciosamente errado:
      // ou se diz, ou não se gera.
      if (erro) {
        const seguir = window.confirm(
          "Não foi possível ler parte do extrato da semana:\n\n" + erro +
          "\n\nO report da semana vai sair incompleto. Gerar mesmo assim?");
        if (!seguir) return;
      }

      const r = construirReportCaixa({
        nomeEmpresa, hoje, dias, nMeses,
        saldoAtual, saldoAnterior, movimentos, meses, vencido, rubricaDoItem,
        faturas, empresa,
      });

      const { dados, nome } = gerarReportCaixaPptx(r);
      const blob = new Blob([dados], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      // Sem isto o blob fica na memória do separador até se fechar.
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      console.error("report de caixa:", e);
      alert("Não foi possível gerar o report:\n\n" + (e?.message || e));
    } finally {
      setAGerar(false);
    }
  };

  const semContas = !contaIds || contaIds.length === 0;

  return (
    <button onClick={gerar} disabled={aGerar || semContas}
      title={semContas
        ? "Escolhe um projeto: o report de caixa lê o extrato das contas dele."
        : `Report de caixa em PowerPoint: a última semana, o mês, os próximos ${nMeses} meses e os pontos de atenção.`}
      style={{
        background: aGerar ? "#8E9398" : "transparent",
        border: `1px solid ${semContas ? "#E7DED2" : "#BAA685"}`,
        color: aGerar ? "#fff" : (semContas ? "#C4C7CA" : "#96702A"),
        padding: "6px 13px", borderRadius: 20, fontSize: 12,
        cursor: (aGerar || semContas) ? "default" : "pointer", fontWeight: 600,
        whiteSpace: "nowrap", fontFamily: "inherit",
      }}>
      {aGerar ? "A preparar…" : "Report de caixa"}
    </button>
  );
}
