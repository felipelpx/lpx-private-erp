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

      const { dados, nome, pdf, nomePdf } = gerarReportCaixaPptx(r);

      // Os dois ficheiros, do mesmo clique: o .pptx para quem vai apresentar
      // ou mexer, o PDF para anexar a um email sem o deck se desformatar na
      // máquina de quem o abre. Saem das MESMAS peças (ver src/pdf.js), por
      // isso não podem divergir.
      const descarregar = (bytes, nomeFicheiro, tipo) => {
        const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
        const a = document.createElement("a");
        a.href = url; a.download = nomeFicheiro;
        document.body.appendChild(a); a.click(); a.remove();
        // Sem isto o blob fica na memória do separador até se fechar.
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      };

      descarregar(dados, nome,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      // Um pequeno intervalo entre os dois: há browsers que tratam dois
      // downloads disparados no mesmo instante como um só e deixam cair o
      // segundo sem dizer nada.
      await new Promise(ok => setTimeout(ok, 350));
      descarregar(pdf, nomePdf, "application/pdf");
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
