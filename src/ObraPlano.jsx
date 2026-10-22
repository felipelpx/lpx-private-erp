import React, { useState, useMemo, useEffect } from "react";
import { fmtEUR, fmtData } from "./formato.js";
import {
  planearObra, planearAplicacao, gastoEmObra, sugerirAvenca, planoDesatualizado,
  compararPrazos, categoriasDoMotor, classificacaoDe, temObra, rotuloMes,
  obraRealizada, fundingLibertado, PLANO_VAZIO, TIPOS, ROTULO_TIPO,
} from "./obra.js";
import { useMovimentosPeriodo, useFracoes, useVendas, useRecebiveis } from "./hooks.js";
import { vgvPorReceber } from "./vendas.js";
import { categoriasDa } from "./categoriasEmpresa.js";
import { CATEGORIAS } from "./categorias.js";
import { hojeISO, arred2 } from "./iva.js";

// ─────────────────────────────────────────────────────────────────────────────
// PLANO DE OBRA
//
// Um ecrã de inputs com uma pré-visualização ao lado. Nada é gravado até se
// carregar em aplicar, e o que vai ser apagado é dito antes, com nomes e
// valores — porque apagar previsões de outra pessoa sem as mostrar é como
// este género de automatismo costuma correr mal.
// ─────────────────────────────────────────────────────────────────────────────

const COR = { tinta: "#091C2A", cinza: "#6E7378", alerta: "#A93226",
              bom: "#1B6A49", banco: "#2C4A63", aviso: "#96702A",
              // superfícies da marca, para o quadro de conferência do IVA
              ouroTenue: "#F6ECD6", alertaLinha: "#E3CE9F", negativoForte: "#8E2A20" };

const Rotulo = ({ children, dica }) => (
  <div title={dica} style={{ fontSize: 10, color: "#9DA2A6", textTransform: "uppercase",
                             fontFamily: "var(--fonte-numero)", letterSpacing: "0.06em", marginBottom: 4 }}>
    {children}
  </div>
);

const campo = {
  width: "100%", boxSizing: "border-box", background: "#F9F5EF",
  border: "1px solid #E3D9CC", borderRadius: 8, padding: "9px 11px",
  fontSize: 13, outline: "none",
};

const Caixa = ({ titulo, children, nota }) => (
  <div style={{ border: "1px solid #E7DED2", borderRadius: 12, padding: "14px 16px" }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: COR.tinta, marginBottom: nota ? 2 : 10 }}>{titulo}</div>
    {nota && <div style={{ fontSize: 10.5, color: "#9DA2A6", marginBottom: 10, lineHeight: 1.5 }}>{nota}</div>}
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
  </div>
);

// Um número com unidade. Guarda texto para não lutar com o cursor enquanto se
// escreve; a conversão é feita na leitura.
function Numero({ rotulo, valor, onMudar, sufixo = "€", dica, sugestao, onSugestao }) {
  return (
    <div>
      <Rotulo dica={dica}>{rotulo}</Rotulo>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="number" value={valor ?? ""} onChange={e => onMudar(e.target.value)}
          style={{ ...campo, textAlign: "right", fontFamily: "var(--fonte-numero)" }} />
        <span style={{ fontSize: 11, color: "#9DA2A6", fontFamily: "var(--fonte-numero)", minWidth: 16 }}>{sufixo}</span>
      </div>
      {sugestao != null && (
        <button onClick={() => onSugestao(sugestao.valor)}
          title={sugestao.rotulo || `Média do que já pagaste nesta rubrica, em ${sugestao.meses} ${sugestao.meses === 1 ? "mês" : "meses"} com fatura`}
          style={{ marginTop: 5, background: "#EDF1F5", border: "none", color: COR.banco,
                   padding: "3px 9px", borderRadius: 6, fontSize: 10.5, cursor: "pointer" }}>
          usar {fmtEUR(sugestao.valor)} {sugestao.rotulo ? `(${sugestao.rotulo})` : "(média das faturas)"}
        </button>
      )}
    </div>
  );
}

const nomeDoTipo = (t) => ROTULO_TIPO[t] || t;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const campoFecho = {
  width: "100%", boxSizing: "border-box", background: "#fff",
  border: "1px solid #E7DED2", borderRadius: 6, padding: "6px 8px",
  fontSize: 11.5, outline: "none", color: "#23292D",
};

// ─── O ecrã ──────────────────────────────────────────────────────────────────
export default function ModalPlanoObra({
  empresa, grupo = "LPX", nomeEmpresa, plano: planoGravado,
  faturas = [], pagamentos = [], contaIds = [], currentUser,
  onGuardar, onAplicar, onFechar, hoje = hojeISO(),
}) {
  const [f, setF] = useState(() => ({ ...PLANO_VAZIO, ...(planoGravado || {}), empresa }));
  const [aGravar, setAGravar] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [simular, setSimular] = useState("");       // data de fim alternativa

  const muda = (k) => (v) => setF(x => ({ ...x, [k]: v }));

  const cats = useMemo(() => categoriasDoMotor(grupo), [grupo]);
  const catObra = classificacaoDe("obra", grupo).categoria;
  const catFisc = classificacaoDe("fiscalizacao", grupo).categoria;
  const catCso  = classificacaoDe("cso", grupo).categoria;

  // O extrato do projeto: é dele que sai o que já foi pago e o funding que o
  // banco já libertou. Sem ele, continua tudo a funcionar pelas faturas.
  const { movimentos, loading: movLoading } = useMovimentosPeriodo(contaIds);
  const { fracoes } = useFracoes();
  const { vendas } = useVendas();
  const { recebiveis } = useRecebiveis();

  const realizado = useMemo(
    () => obraRealizada(movimentos, faturas, {
      empresa, categorias: [catObra], taxaIva: f.taxa_iva_obra }),
    [movimentos, faturas, empresa, catObra, f.taxa_iva_obra]);

  const bancoJaLibertou = useMemo(
    () => fundingLibertado(movimentos, {
      categorias: [classificacaoDe("funding", grupo).categoria, "Funding banco"],
      subcategorias: grupo === "HDG" ? [classificacaoDe("funding", grupo).subcategoria] : [],
    }), [movimentos, grupo]);

  // O que consome o budget é o que já foi INCORRIDO, pago ou não: uma fatura
  // por pagar já está no fluxo, prevê-la outra vez contaria duas vezes.
  const gasto = realizado.jaIncorrido;

  // ── As despesas de fecho ─────────────────────────────────────────────────
  // Uma lista pequena e editável, cada linha com a sua rubrica — é assim que
  // a comissão de venda cai em "Comissão" e a licença em "Legais", em vez de
  // ficarem todas num balde chamado "Obra".
  const planoDeContas = useMemo(
    () => categoriasDa(empresa) || CATEGORIAS, [empresa]);
  const fechos = Array.isArray(f.despesas_fecho) ? f.despesas_fecho : [];
  const totalFecho = fechos.reduce((s, d) => s + Math.abs(num(d?.valor)), 0);
  const porFecho = (lista) => setF(x => ({ ...x, despesas_fecho: lista }));
  const mudaFecho = (i, campo, valor) =>
    porFecho(fechos.map((d, k) => (k === i ? { ...d, [campo]: valor } : d)));
  const juntarFecho = () => porFecho([...fechos, { descricao: "", valor: "", categoria: "" }]);
  const apagarFecho = (i) => porFecho(fechos.filter((_, k) => k !== i));

  // O que falta receber na escritura, sugerido ao utilizador: o total da
  // tabela de vendas, menos o que já foi recebido, menos o que já está
  // lançado no Contas a Receber. Pôr aqui o VGV inteiro seria contar duas
  // vezes os sinais que já entraram e os recebíveis que já estão no fluxo.
  const vgv = useMemo(() => vgvPorReceber({
    fracoes, vendas, recebiveis, movimentos,
    projeto: nomeEmpresa, empresaId: empresa,
  }), [fracoes, vendas, recebiveis, movimentos, nomeEmpresa, empresa]);
  const vgvDoProjeto = vgv.porReceber;

  // Campo vazio = segue a tabela de vendas. Um plano antigo que tenha lá
  // gravado o VGV BRUTO (a tabela toda, antes de descontar o que já se
  // recebeu) está desatualizado por construção — nesse caso volta ao
  // automático sozinho, senão o fluxo continuava a receber na escritura
  // dinheiro que já entrou na conta.
  const vendaBrutaGravada = vgv.total > 0.005
    && Math.abs(num(f.valor_venda) - vgv.total) < 1
    && vgv.recebido > 0.005;
  const vendaAutomatica = !(num(f.valor_venda) > 0.005) || vendaBrutaGravada;
  useEffect(() => {
    if (vendaBrutaGravada) setF(x => ({ ...x, valor_venda: 0 }));
  }, [vendaBrutaGravada]);

  const sugFisc = useMemo(
    () => sugerirAvenca(faturas, { empresa, categorias: [catFisc] }), [faturas, empresa, catFisc]);
  const sugCso = useMemo(
    () => sugerirAvenca(faturas, { empresa, categorias: [catCso] }), [faturas, empresa, catCso]);

  // A venda da escritura segue a tabela de vendas enquanto ninguém escrever um
  // número à mão: assim, vender mais uma fração ou receber mais um sinal muda o
  // fluxo sozinho, sem ser preciso vir aqui corrigir o campo.
  const resultado = useMemo(
    () => planearObra(f, { gastoObra: gasto, hoje, grupo, vendaNaEscritura: vgvDoProjeto }),
    [f, gasto, hoje, grupo, vgvDoProjeto]);
  const { linhas, resumo, avisos } = resultado;

  const aplicacao = useMemo(() => planearAplicacao({
    linhas, pagamentosExistentes: pagamentos, empresa, grupo,
    primeiroMes: resumo.primeiroMes, hoje, plano: f,
  }), [linhas, pagamentos, empresa, grupo, resumo.primeiroMes, hoje,
       f.data_fim, f.meses_ate_escritura]);

  const comparacao = useMemo(() => {
    if (!simular || !f.data_fim || simular === f.data_fim) return null;
    try { return compararPrazos(f, { gastoObra: gasto, hoje, grupo,
                                     vendaNaEscritura: vgvDoProjeto }, simular); }
    catch { return null; }
  }, [simular, f, gasto, hoje, grupo, vgvDoProjeto]);

  const desatualizado = planoDesatualizado(planoGravado, gasto);
  const podeAplicar = linhas.length > 0 && !aGravar;

  const aplicar = async () => {
    setAGravar(true);
    try {
      const r = await onAplicar({
        plano: { ...f, empresa, id: empresa,
                 calculado_em: new Date().toISOString(), gasto_no_calculo: gasto,
                 updated_by: currentUser?.nome || "" },
        aCriar: aplicacao.aCriar,
        idsAApagar: aplicacao.idsAApagar,
        aReagendar: aplicacao.aReagendar,
      });
      if (r?.error) {
        alert(/obra_planos|plano_obra|plano_tipo|subcategoria|column/i.test(r.error.message || "")
          ? "Falta a base do plano de obra.\n\nCorre no Supabase obra-1-tabela-planos.sql e obra-2-marcas-nas-previsoes.sql."
          : "Não foi possível aplicar:\n\n" + (r.error.message || r.error));
        return;
      }
      setConfirmar(false);
      onFechar?.();
    } finally { setAGravar(false); }
  };

  const guardarSoInputs = async () => {
    setAGravar(true);
    try {
      const r = await onGuardar({ ...f, empresa, id: empresa, updated_by: currentUser?.nome || "" });
      if (r?.error) alert("Não foi possível guardar:\n\n" + (r.error.message || r.error));
      else onFechar?.();
    } finally { setAGravar(false); }
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onFechar?.(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(10,10,15,0.55)", display: "flex",
               alignItems: "center", justifyContent: "center", zIndex: 320, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 1080,
                    maxHeight: "92vh", display: "flex", flexDirection: "column" }}>

        {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #E7DED2",
                      display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: COR.tinta, fontFamily: "var(--fonte-titulo)" }}>
              Plano de obra — {nomeEmpresa || empresa}
            </div>
            <div style={{ fontSize: 11, color: "#9DA2A6", marginTop: 3 }}>
              Tudo o que está agarrado ao prazo. Mudar a data de fim recalcula o fluxo.
            </div>
          </div>
          {desatualizado && (
            <span title="Entraram faturas de obra desde o último recálculo: as previsões já não batem certo com o que falta gastar."
              style={{ background: "#F6ECD6", color: COR.aviso, fontSize: 10.5, fontWeight: 700,
                       padding: "4px 10px", borderRadius: 20, fontFamily: "var(--fonte-numero)" }}>
              desatualizado
            </span>
          )}
          <button onClick={onFechar} style={{ marginLeft: "auto", background: "none", border: "none",
                                              fontSize: 20, cursor: "pointer", color: "#B2B6B9" }}>✕</button>
        </div>

        {/* ── Corpo ─────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) 1fr",
                      gap: 18, padding: 22, overflowY: "auto" }}>

          {/* Inputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Caixa titulo="Prazo" nota="É daqui que tudo se move.">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <Rotulo>Início da obra</Rotulo>
                  <input type="date" value={f.data_inicio || ""} style={campo}
                    onChange={e => muda("data_inicio")(e.target.value)} />
                </div>
                <div>
                  <Rotulo>Fim da obra</Rotulo>
                  <input type="date" value={f.data_fim || ""} style={campo}
                    onChange={e => muda("data_fim")(e.target.value)} />
                </div>
              </div>

              {/* Obra a decorrer: o ERP já tem os números, não se escrevem. */}
              {realizado.primeiroGasto && !f.data_inicio && (
                <button onClick={() => muda("data_inicio")(realizado.primeiroGasto)}
                  title="Procura no projeto o primeiro gasto de obra e usa essa data como início"
                  style={{ background: "#EDF1F5", border: "none", color: "#2C4A63", padding: "8px 12px",
                           borderRadius: 8, fontSize: 11.5, cursor: "pointer", fontWeight: 600,
                           textAlign: "left", lineHeight: 1.5 }}>
                  Obra já iniciada — procurar no projeto
                  <div style={{ fontWeight: 400, fontSize: 10.5, opacity: 0.8, marginTop: 2 }}>
                    Primeiro gasto de obra: {fmtData(realizado.primeiroGasto)}
                  </div>
                </button>
              )}
              {realizado.primeiroGasto && f.data_inicio &&
               f.data_inicio.slice(0, 10) !== realizado.primeiroGasto && (
                <div style={{ fontSize: 10.5, color: "#9DA2A6", lineHeight: 1.5 }}>
                  O primeiro gasto de obra no projeto é de {fmtData(realizado.primeiroGasto)}.{" "}
                  <button onClick={() => muda("data_inicio")(realizado.primeiroGasto)}
                    style={{ background: "none", border: "none", color: COR.banco, cursor: "pointer",
                             padding: 0, fontSize: 10.5, textDecoration: "underline" }}>usar essa data</button>
                </div>
              )}
            </Caixa>

            <Caixa titulo="Obra" nota="O budget é sem IVA, mas o IVA de obra é obra: a conta fecha-se em bruto. A fatura do empreiteiro sai pela base; o IVA é autoliquidado e entregue no apuramento do trimestre.">
              <Numero rotulo="Budget da empreitada (sem IVA)" valor={f.budget_obra}
                onMudar={muda("budget_obra")} />
              <Numero rotulo="Taxa de IVA da obra" sufixo="%" valor={f.taxa_iva_obra}
                onMudar={muda("taxa_iva_obra")} />
              <div style={{ background: "#FAF6F0", borderRadius: 9, padding: "10px 12px", fontSize: 11.5 }}>
                <Linha k="Budget (sem IVA)" v={fmtEUR(resumo.budget)}
                  dica="O orçamento da empreitada como está contratado, pela base." />
                <Linha k={`+  IVA a ${num(f.taxa_iva_obra)}%`}
                  v={fmtEUR(resumo.budgetBruto - resumo.budget)}
                  dica="O IVA de obra é obra: entra no custo do projeto, não é um imposto a recuperar." />
                <div style={{ height: 1, background: "#D8CCBB", margin: "7px 0" }} />
                <Linha k="=  Total a gastar" v={fmtEUR(resumo.budgetBruto)} forte
                  dica="Budget mais o IVA da obra. É contra este valor que se mede o que já foi pago." />
                <div style={{ height: 11 }} />
                <Linha k="Já pago (extrato, com IVA)" v={movLoading ? "a ler..." : fmtEUR(realizado.pagoExtrato)}
                  dica={`${realizado.nMovimentos} movimentos de ${catObra} no extrato do projeto. É o que saiu mesmo da conta — obra e IVA de obra juntos.`} />
                <Linha k="+  Faturado por pagar (com IVA)" v={fmtEUR(realizado.porPagarBruto)}
                  dica={`Faturas de ${catObra} registadas no Contas a Pagar e ainda por liquidar, pelo total. Como ainda não saíram da conta, não estão na linha de cima.`} />
                <div style={{ height: 1, background: "#D8CCBB", margin: "7px 0" }} />
                <Linha k="=  Incorrido" v={fmtEUR(gasto)} forte
                  dica={realizado.fonte === "extrato"
                    ? "O que saiu da conta mais o que está faturado por pagar, tudo com IVA. Cada euro conta uma vez: uma fatura paga já está no extrato, uma por pagar ainda não."
                    : `Sem movimentos de ${catObra} no extrato, vale o que as faturas dizem, pelo total.`} />
                <Linha k="       obra realizada" v={fmtEUR(resumo.gastoBase)} suave
                  dica="A parte do incorrido que é empreitada, sem IVA." />
                <Linha k="       IVA de obra realizado" v={fmtEUR(resumo.gastoIva)} suave
                  dica={`A parte do incorrido que é IVA, à taxa de ${num(f.taxa_iva_obra)}%. Já foi pago, mas continua a contar como obra.`} />
                <div style={{ height: 1, background: "#D8CCBB", margin: "7px 0" }} />
                <Linha k="=  Falta gastar" v={fmtEUR(resumo.porGastarBruto)} forte
                  dica="Total a gastar menos o incorrido — desconta o que já foi pago tanto de obra como de IVA de obra." />
                <Linha k="       obra futura" v={fmtEUR(resumo.porGastar)} suave
                  dica="Espalha-se pelos meses que faltam, pela base: a fatura do empreiteiro sai sem IVA." />
                <Linha k="       IVA de obra futuro" v={fmtEUR(resumo.ivaPorGastar)} suave
                  dica="Entra nos apuramentos trimestrais, nos dias 25 — e não na data da fatura." />
              </div>

              {/* A conferência que o Felipe pediu: as duas pontas do IVA de obra
                  têm de somar o IVA do budget, sempre. */}
              <div style={{ background: COR.ouroTenue, border: `1px solid ${COR.alertaLinha}`,
                            borderRadius: 9, padding: "9px 12px", fontSize: 11 }}>
                <Linha k="IVA de obra realizado" v={fmtEUR(resumo.gastoIva)} />
                <Linha k="+  IVA de obra futuro" v={fmtEUR(resumo.ivaPorGastar)} />
                <div style={{ height: 1, background: COR.alertaLinha, margin: "6px 0" }} />
                <Linha k={`=  IVA de obra total (${num(f.taxa_iva_obra)}% do budget)`}
                  v={fmtEUR(resumo.ivaDoBudget)} forte />
                {Math.abs((resumo.gastoIva + resumo.ivaPorGastar) - resumo.ivaDoBudget) > 0.02 && (
                  <div style={{ fontSize: 10.5, color: COR.negativoForte, marginTop: 5, lineHeight: 1.5 }}>
                    As duas pontas não fecham no IVA do budget — já se gastou mais do que o
                    orçamento com IVA, por isso não sobra IVA nenhum por lançar.
                  </div>
                )}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12 }}>
                <input type="checkbox" checked={f.recuperar_iva !== false}
                  onChange={e => muda("recuperar_iva")(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: COR.tinta }} />
                O banco financia também o IVA, no dia do apuramento
              </label>

              {/* A percentagem do IVA é independente da da obra: há bancos que
                  financiam a empreitada a 80% e o IVA a 100%. Em branco segue
                  a da obra, que é o que sempre aconteceu. */}
              {f.recuperar_iva !== false && (
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap",
                              paddingLeft: 23 }}>
                  <span style={{ fontSize: 11, color: "#7E8388" }}>Financia</span>
                  <input value={f.funding_iva_pct ?? ""}
                    onChange={e => muda("funding_iva_pct")(e.target.value)}
                    inputMode="decimal"
                    placeholder={String(num(f.funding_pct) || 0)}
                    title="Percentagem do IVA que o banco liberta. Em branco, usa a mesma da obra."
                    style={{ width: 62, boxSizing: "border-box", textAlign: "right",
                             background: COR.papel, border: "1px solid #E3D9CC", borderRadius: 6,
                             padding: "5px 8px", fontSize: 12, outline: "none",
                             fontVariantNumeric: "tabular-nums" }} />
                  <span style={{ fontSize: 11, color: "#7E8388" }}>% do IVA</span>
                  <span style={{ fontSize: 10.5, color: "#9DA2A6" }}>
                    {f.funding_iva_pct === "" || f.funding_iva_pct === null || f.funding_iva_pct === undefined
                      ? `em branco = o mesmo da obra (${num(f.funding_pct) || 0}%)`
                      : num(f.funding_iva_pct) === num(f.funding_pct)
                        ? "igual ao da obra"
                        : `a obra é financiada a ${num(f.funding_pct) || 0}%`}
                  </span>
                </div>
              )}
            </Caixa>

            <Caixa titulo="Avenças mensais" nota="Cobradas enquanto a obra durar, e com IVA: ao contrário da empreitada, estes serviços não são autoliquidados. Esticar o prazo custa mais meses destas.">
              <Numero rotulo="Fiscalização / mês (sem IVA)" valor={f.fiscalizacao_mensal}
                onMudar={muda("fiscalizacao_mensal")}
                sugestao={sugFisc} onSugestao={muda("fiscalizacao_mensal")} />
              <Numero rotulo="CSO / mês (sem IVA)" valor={f.cso_mensal} onMudar={muda("cso_mensal")}
                sugestao={sugCso} onSugestao={muda("cso_mensal")} />
              <Numero rotulo="Taxa de IVA destes serviços" sufixo="%" valor={f.taxa_iva_servicos}
                onMudar={muda("taxa_iva_servicos")} />
              {(num(f.fiscalizacao_mensal) > 0 || num(f.cso_mensal) > 0) && (
                <div style={{ fontSize: 11, color: "#7E8388", fontFamily: "var(--fonte-numero)" }}>
                  Sai por mês: {fmtEUR((num(f.fiscalizacao_mensal) + num(f.cso_mensal))
                    * (1 + num(f.taxa_iva_servicos) / 100))} com IVA
                </div>
              )}
            </Caixa>

            <Caixa titulo="Financiamento" nota="Dois pagamentos, duas libertações: a base no vencimento da fatura, o IVA no dia 25 do apuramento. Os juros correm sobre o saldo médio do mês.">
              <Numero rotulo="Funding do banco" sufixo="%" valor={f.funding_pct}
                onMudar={muda("funding_pct")}
                dica="Percentagem que o banco liberta — aplica-se à base da fatura e, na data do apuramento, ao IVA." />
              <Numero rotulo="Comissão de avaliação (por libertação)" valor={f.comissao_avaliacao}
                onMudar={muda("comissao_avaliacao")} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Numero rotulo="Euribor" sufixo="%" valor={f.euribor} onMudar={muda("euribor")} />
                <Numero rotulo="Spread" sufixo="%" valor={f.spread} onMudar={muda("spread")} />
              </div>
              <Numero rotulo="Dívida já libertada hoje" valor={f.divida_inicial}
                onMudar={muda("divida_inicial")}
                dica="O que o banco já libertou. É sobre isto que começam a contar os juros."
                sugestao={bancoJaLibertou.total > 0
                  ? { valor: bancoJaLibertou.total, meses: bancoJaLibertou.n, rotulo: "do extrato" } : null}
                onSugestao={muda("divida_inicial")} />
              {bancoJaLibertou.total > 0 && (
                <div style={{ fontSize: 10.5, color: "#9DA2A6", lineHeight: 1.5, marginTop: -4 }}>
                  {bancoJaLibertou.n} {bancoJaLibertou.n === 1 ? "libertação encontrada" : "libertações encontradas"} no
                  extrato{bancoJaLibertou.ultimo ? `, a última a ${fmtData(bancoJaLibertou.ultimo)}` : ""}.
                </div>
              )}
              <div style={{ fontSize: 11, color: "#7E8388", fontFamily: "var(--fonte-numero)" }}>
                Taxa all-in: {arred2((Number(f.euribor) || 0) + (Number(f.spread) || 0))}% ao ano
              </div>
            </Caixa>

            {/* ── A escritura ───────────────────────────────────────────── */}
            <Caixa titulo="Escritura"
                   nota="O projeto não acaba quando a obra acaba: vende-se, paga-se o banco e fecham-se contas. Tudo isto cai no mês da escritura.">
              <Numero rotulo="Escritura — meses após o fim da obra" sufixo="meses"
                valor={f.meses_ate_escritura} onMudar={muda("meses_ate_escritura")}
                dica="Zero quer dizer no próprio mês em que a obra acaba." />
              {resumo.mesEscritura && (
                <div style={{ fontSize: 11, color: COR.banco, fontFamily: "var(--fonte-numero)",
                              marginTop: -4 }}>
                  Cai em {rotuloMes(resumo.mesEscritura)}
                </div>
              )}
              {vendaAutomatica ? (
                <div>
                  <div style={{ fontSize: 9, color: "#9DA2A6", fontFamily: "var(--fonte-numero)",
                                textTransform: "uppercase", letterSpacing: "0.07em",
                                marginBottom: 3 }}>
                    Vendas na escritura
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: COR.navy,
                                  fontFamily: "var(--fonte-numero)" }}>
                      {fmtEUR(vgvDoProjeto)}
                    </div>
                    <button onClick={() => muda("valor_venda")(vgvDoProjeto)}
                      style={{ background: "none", border: "none", padding: 0, fontSize: 11,
                               color: "#7E8388", cursor: "pointer", textDecoration: "underline" }}>
                      escrever à mão
                    </button>
                  </div>
                  <div style={{ fontSize: 10.5, color: "#7E8388", marginTop: 3, lineHeight: 1.5 }}>
                    Segue a tabela de vendas: muda sozinho quando se vende mais uma fração
                    ou entra mais um sinal.
                  </div>
                </div>
              ) : (
                <>
                  <Numero rotulo="Vendas na escritura" valor={f.valor_venda}
                    onMudar={muda("valor_venda")}
                    dica="Escrito à mão. Entra no fluxo como receita no mês acima."
                    sugestao={vgvDoProjeto > 0 && Math.abs(num(f.valor_venda) - vgvDoProjeto) > 0.5
                      ? { valor: vgvDoProjeto, rotulo: "o que falta receber" } : null}
                    onSugestao={muda("valor_venda")} />
                  <button onClick={() => muda("valor_venda")(0)}
                    style={{ background: "none", border: "none", padding: 0, fontSize: 11,
                             color: "#7E8388", cursor: "pointer", textDecoration: "underline",
                             alignSelf: "flex-start", marginTop: -4 }}>
                    voltar a seguir a tabela de vendas
                  </button>
                  {vgvDoProjeto > 0 && Math.abs(num(f.valor_venda) - vgvDoProjeto) > 0.5 && (
                    <div style={{ fontSize: 10.5, color: "#96702A", lineHeight: 1.5, marginTop: -2 }}>
                      Este número foi escrito à mão e já não bate com a tabela de vendas
                      ({fmtEUR(vgvDoProjeto)}). O fluxo usa o que está escrito.
                    </div>
                  )}
                </>
              )}
              {vgv.total > 0 && (
                <div style={{ background: "#FAF6F0", borderRadius: 9, padding: "9px 12px",
                              fontSize: 11, marginTop: -2 }}>
                  <Linha k="Tabela de vendas" v={fmtEUR(vgv.total)}
                    dica={`${vgv.nFracoes} frações, ${vgv.nVendidas} vendidas. As vendidas pelo valor da venda, as outras pela venda estimada.`} />
                  <Linha k="−  já recebido" v={`−${fmtEUR(vgv.recebido)}`}
                    dica={vgv.realizado > 0.005
                      ? `${fmtEUR(vgv.realizado)} já entraram na conta por conta de vendas (extrato). Conta-se o maior entre isso e os sinais registados nas fichas das vendas — nunca a soma, para não contar o mesmo dinheiro duas vezes.`
                      : "Sinais e reforços já pagos, e o que estiver registado como recebido."} />
                  <Linha k="−  no Contas a Receber" v={`−${fmtEUR(vgv.naCarteira)}`}
                    dica="Já está no fluxo por essa via — contá-lo aqui seria contá-lo duas vezes." />
                  <div style={{ height: 1, background: "#D8CCBB", margin: "6px 0" }} />
                  <Linha k="=  falta receber" v={fmtEUR(vgv.porReceber)} forte />
                </div>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12 }}>
                <input type="checkbox" checked={f.amortizar_divida !== false}
                  onChange={e => muda("amortizar_divida")(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: COR.tinta }} />
                Pagar toda a dívida ao banco na escritura
              </label>
              <div style={{ fontSize: 10.5, color: "#9DA2A6", lineHeight: 1.5 }}>
                Enquanto não se vende, a dívida continua a vencer juros — a fiscalização
                e o CSO param com a obra, os juros não.
              </div>

              {/* As despesas de fecho, cada uma na sua rubrica */}
              <div style={{ borderTop: "1px solid #E7DED2", paddingTop: 10, marginTop: 2 }}>
                <Rotulo dica="Licença de utilização, certificações, comissão de venda, o que for. Cada uma vai para a sua rubrica, para cair no sítio certo do Real × Orçado.">
                  Despesas de fecho de obra
                </Rotulo>
                {(f.despesas_fecho || []).map((d, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 92px 24px",
                                        gap: 6, marginBottom: 6, alignItems: "center" }}>
                    <input value={d.descricao || ""} placeholder="Licença de utilização"
                      onChange={e => mudaFecho(i, "descricao", e.target.value)}
                      style={{ ...campoFecho }} />
                    <input value={d.valor ?? ""} placeholder="0" type="number" step="0.01"
                      onChange={e => mudaFecho(i, "valor", e.target.value)}
                      style={{ ...campoFecho, textAlign: "right" }} />
                    <button onClick={() => apagarFecho(i)} title="Apagar esta despesa"
                      style={{ background: "none", border: "none", color: "#B2B6B9",
                               cursor: "pointer", fontSize: 15, padding: 0 }}>×</button>
                    <select value={d.categoria || ""} onChange={e => mudaFecho(i, "categoria", e.target.value)}
                      style={{ ...campoFecho, gridColumn: "1 / -1" }}>
                      <option value="">Rubrica — usar a da obra</option>
                      {planoDeContas.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                ))}
                <button onClick={juntarFecho}
                  style={{ background: "transparent", border: "1px dashed #D8CCBB", borderRadius: 7,
                           padding: "6px 12px", fontSize: 11.5, color: "#7E8388", cursor: "pointer",
                           width: "100%" }}>
                  + Juntar despesa de fecho
                </button>
                {totalFecho > 0 && (
                  <div style={{ fontSize: 11, color: "#7E8388", marginTop: 6,
                                fontFamily: "var(--fonte-numero)" }}>
                    Total de fecho: {fmtEUR(totalFecho)}
                  </div>
                )}
              </div>
            </Caixa>
          </div>

          {/* Pré-visualização */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {avisos.length > 0 && (
              <div style={{ background: "#FBF6EC", border: "1px solid #E3CE9F", borderRadius: 10,
                            padding: "11px 14px", fontSize: 11.5, color: "#7A5A22", lineHeight: 1.7 }}>
                {avisos.map((a, i) => <div key={i}>{a}</div>)}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <Cartao rotulo="Meses por correr" valor={String(resumo.meses)}
                nota={resumo.primeiroMes ? `${rotuloMes(resumo.primeiroMes)} → ${rotuloMes(resumo.ultimoMes)}` : "—"} />
              <Cartao rotulo="Custo até ao fim" valor={fmtEUR(resumo.custoTotal)} cor={COR.alerta}
                nota="o que sai mesmo do bolso: já líquido do funding" />
              <Cartao rotulo="Dívida no fim" valor={fmtEUR(resumo.dividaFinal)} cor={COR.banco}
                nota="inicial + libertações de base e de IVA" />
            </div>

            <div style={{ border: "1px solid #E7DED2", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F9F4EC" }}>
                    {["O que o motor vai lançar", "Linhas", "Por mês", "Total"].map((h, i) => (
                      <th key={h} style={{ padding: "9px 14px", textAlign: i === 0 ? "left" : "right",
                                           color: "#9DA2A6", fontSize: 9.5, textTransform: "uppercase",
                                           fontFamily: "var(--fonte-numero)", borderBottom: "1px solid #E7DED2" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIPOS.map(t => {
                    const ls = linhas.filter(l => l.plano_tipo === t);
                    if (!ls.length) return null;
                    const total = resumo.totais[t];
                    const entrada = ls[0].tipo === "entrada";
                    return (
                      <tr key={t} style={{ borderBottom: "1px solid #FBF7F1" }}>
                        <td style={{ padding: "8px 14px" }}>
                          {nomeDoTipo(t)}
                          {entrada && <span style={{ marginLeft: 6, background: "#E2EFE8", color: COR.bom,
                            fontSize: 8.5, fontFamily: "var(--fonte-numero)", fontWeight: 700,
                            padding: "1px 5px", borderRadius: 3 }}>entrada</span>}
                        </td>
                        <td style={{ padding: "8px 14px", textAlign: "right", color: "#7E8388", fontFamily: "var(--fonte-numero)" }}>{ls.length}</td>
                        <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "var(--fonte-numero)", color: "#7E8388" }}>
                          {ls.length ? fmtEUR(Math.abs(total) / ls.length) : "—"}
                        </td>
                        <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "var(--fonte-numero)",
                                     fontWeight: 700, color: entrada ? COR.bom : COR.tinta }}>
                          {entrada ? "+" : ""}{fmtEUR(Math.abs(total))}
                        </td>
                      </tr>
                    );
                  })}
                  {linhas.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: 26, textAlign: "center", color: "#C4C7CA", fontSize: 12 }}>
                      Preenche o prazo e o budget para ver o plano.
                    </td></tr>
                  )}
                  {linhas.length > 0 && (
                    <tr style={{ background: COR.tinta }}>
                      <td style={{ padding: "9px 14px", color: "#fff", fontWeight: 700 }}>Custo total até ao fim da obra</td>
                      <td style={{ padding: "9px 14px", textAlign: "right", color: "#8B98A3", fontFamily: "var(--fonte-numero)" }}>{linhas.length}</td>
                      <td />
                      <td style={{ padding: "9px 14px", textAlign: "right", color: "#D99A91",
                                   fontFamily: "var(--fonte-numero)", fontWeight: 800 }}>{fmtEUR(resumo.custoTotal)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* E se o prazo escorregar? */}
            {linhas.length > 0 && (
              <div style={{ border: "1px solid #E7DED2", borderRadius: 12, padding: "13px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: COR.tinta, marginBottom: 3 }}>
                  E se a obra escorregar?
                </div>
                <div style={{ fontSize: 10.5, color: "#9DA2A6", marginBottom: 10, lineHeight: 1.5 }}>
                  Experimenta uma data de fim diferente. Não grava nada — é só para ver o custo.
                </div>
                <input type="date" value={simular} onChange={e => setSimular(e.target.value)}
                  style={{ ...campo, width: 180 }} />
                {comparacao && (
                  <div style={{ marginTop: 10, background: comparacao.custoAMais > 0 ? "#FBEDEB" : "#EFF5F1",
                                border: `1px solid ${comparacao.custoAMais > 0 ? "#EFCFC9" : "#C9E3D5"}`,
                                borderRadius: 10, padding: "11px 14px" }}>
                    <div style={{ fontSize: 13, color: comparacao.custoAMais > 0 ? COR.alerta : COR.bom,
                                  fontWeight: 700 }}>
                      {comparacao.mesesAMais > 0 ? "+" : ""}{comparacao.mesesAMais} meses
                      {" → "}
                      {comparacao.custoAMais > 0 ? "+" : ""}{fmtEUR(comparacao.custoAMais)} de custo
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 7,
                                  fontSize: 11, color: "#6E7378", fontFamily: "var(--fonte-numero)" }}>
                      {[["fiscalização", "fiscalizacao"], ["CSO", "cso"],
                        ["juros", "juros"], ["avaliações", "comissao"], ["obra", "obra"]].map(([r, k]) => (
                        <span key={k}>{r} {comparacao.diferencas[k] > 0 ? "+" : ""}{fmtEUR(comparacao.diferencas[k])}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 10.5, color: "#8E9398", marginTop: 7, lineHeight: 1.5 }}>
                      A obra em si não muda — é o mesmo budget diluído por mais meses. O que custa
                      são as avenças e os juros a correrem mais tempo.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Rodapé: o que vai acontecer ───────────────────────────────── */}
        <div style={{ borderTop: "1px solid #E7DED2", padding: "14px 24px" }}>
          {!confirmar ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11.5, color: "#7E8388", lineHeight: 1.6 }}>
                Aplicar cria <strong style={{ color: COR.tinta }}>{aplicacao.resumo.criar} previsões</strong>
                {aplicacao.idsAApagar.length > 0 && <>
                  {" e apaga "}
                  <strong style={{ color: COR.alerta }}>{aplicacao.idsAApagar.length}</strong>
                  {" que lá estão"}
                </>}.
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button onClick={onFechar}
                  style={{ background: "none", border: "1px solid #E3D9CC", borderRadius: 8,
                           padding: "9px 16px", fontSize: 12, color: "#6E7378", cursor: "pointer" }}>Cancelar</button>
                <button onClick={guardarSoInputs} disabled={aGravar}
                  title="Guarda os valores sem mexer no Fluxo Futuro"
                  style={{ background: "#F6F0E8", border: "none", borderRadius: 8, padding: "9px 16px",
                           fontSize: 12, color: "#4A5055", cursor: "pointer", fontWeight: 600 }}>
                  Guardar sem aplicar
                </button>
                <button onClick={() => setConfirmar(true)} disabled={!podeAplicar}
                  style={{ background: podeAplicar ? COR.tinta : "#E3D9CC",
                           color: podeAplicar ? "#fff" : "#9DA2A6", border: "none", borderRadius: 8,
                           padding: "9px 22px", fontSize: 12, fontWeight: 700,
                           cursor: podeAplicar ? "pointer" : "default" }}>
                  Recalcular o fluxo
                </button>
              </div>
            </div>
          ) : (
            <Confirmacao aplicacao={aplicacao} aGravar={aGravar}
              onVoltar={() => setConfirmar(false)} onAplicar={aplicar} cats={cats} />
          )}
        </div>
      </div>
    </div>
  );
}

// `suave` é para as decomposições: a linha de cima manda, estas abrem-na.
const Linha = ({ k, v, forte, suave, dica }) => (
  <div title={dica} style={{ display: "flex", justifyContent: "space-between",
                             padding: suave ? "1px 0" : "2px 0",
                             fontSize: suave ? "0.92em" : undefined }}>
    <span style={{ color: suave ? "#9DA2A6" : "#7E8388" }}>{k}</span>
    <span style={{ fontFamily: "var(--fonte-numero)", fontWeight: forte ? 700 : 400,
                   color: suave ? "#7E8388" : COR.tinta }}>{v}</span>
  </div>
);

const Cartao = ({ rotulo, valor, nota, cor }) => (
  <div style={{ border: "1px solid #E7DED2", borderRadius: 11, padding: "11px 14px" }}>
    <Rotulo>{rotulo}</Rotulo>
    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--fonte-numero)", color: cor || COR.tinta }}>{valor}</div>
    {nota && <div style={{ fontSize: 9.5, color: "#B2B6B9", marginTop: 3, lineHeight: 1.4 }}>{nota}</div>}
  </div>
);

// ─── A confirmação ───────────────────────────────────────────────────────────
// Antes de apagar o trabalho de alguém, mostra-se o que vai desaparecer: a
// descrição, a data e o valor, linha a linha.
function Confirmacao({ aplicacao, aGravar, onVoltar, onAplicar, cats }) {
  const { aApagarManuais, aApagarDoMotor, jaPagas = [], aReagendar = [], resumo } = aplicacao;
  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: COR.tinta, fontWeight: 700 }}>Antes de aplicar:</div>
        <div style={{ fontSize: 11.5, color: "#7E8388" }}>
          entram <strong style={{ color: COR.bom }}>{resumo.criar}</strong> previsões novas
          {" · "}saem <strong style={{ color: COR.alerta }}>{resumo.apagarManuais}</strong> previsões tuas
          {" · "}substituem-se <strong>{resumo.apagarMotor}</strong> de um recálculo anterior
          {resumo.protegidas > 0 && <> · ficam intactas <strong>{resumo.protegidas}</strong> já pagas ou convertidas</>}
          {resumo.jaPagas > 0 && <> · não entram <strong style={{ color: "#8E2A20" }}>{resumo.jaPagas}</strong> que já estão liquidadas</>}
          {resumo.reagendar > 0 && <> · mudam de data <strong>{resumo.reagendar}</strong> agarradas ao plano</>}
        </div>
      </div>

      {aReagendar.length > 0 && (
        <div style={{ background: "#F4F6FA", border: "1px solid #D7DEEA", borderRadius: 10,
                      padding: "11px 14px", marginBottom: 10, maxHeight: 150, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#2B3C56", marginBottom: 6 }}>
            Estas estão agarradas ao plano e vão mudar de data — não se apagam, só se mexem:
          </div>
          {aReagendar.map(d => (
            <div key={d.id} style={{ fontSize: 11, color: "#3A4C68", display: "flex", gap: 10,
                                     justifyContent: "space-between", padding: "2px 0" }}>
              <span>{d.descricao || d.categoria || "—"}
                <span style={{ color: "#73839B" }}> · {d.rotulo}</span>
              </span>
              <span style={{ fontFamily: "var(--fonte-numero)" }}>
                {fmtData(d.de)} → <strong>{fmtData(d.para)}</strong>
              </span>
            </div>
          ))}
        </div>
      )}

      {jaPagas.length > 0 && (
        <div style={{ background: "#F3F6F4", border: "1px solid #D6E0DA", borderRadius: 10,
                      padding: "11px 14px", marginBottom: 10, maxHeight: 150, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#2C4A3C", marginBottom: 6 }}>
            O motor calculou estas, mas elas já estão pagas ou convertidas em fatura
            ({fmtEUR(resumo.valorJaPagas)}) — fica o que já aconteceu, não a previsão:
          </div>
          {jaPagas.map(p => (
            <div key={p.id} style={{ fontSize: 11, color: "#3C5B4C", display: "flex", gap: 10,
                                     justifyContent: "space-between", padding: "2px 0" }}>
              <span>{fmtData(p.data_inicio)} · {p.descricao || "—"}
                <span style={{ color: "#6B8578" }}> · já {String(p.existente?.status || "").toLowerCase()}</span>
              </span>
              <span style={{ fontFamily: "var(--fonte-numero)" }}>{fmtEUR(p.valor)}</span>
            </div>
          ))}
        </div>
      )}

      {aApagarManuais.length > 0 && (
        <div style={{ background: "#FBEDEB", border: "1px solid #EFCFC9", borderRadius: 10,
                      padding: "11px 14px", marginBottom: 10, maxHeight: 150, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#8E2A20", marginBottom: 6 }}>
            Estas previsões que lançaste vão desaparecer ({fmtEUR(resumo.valorManuais)}):
          </div>
          {aApagarManuais.map(p => (
            <div key={p.id} style={{ fontSize: 11, color: "#6E241C", display: "flex", gap: 10,
                                     justifyContent: "space-between", padding: "2px 0" }}>
              <span>{fmtData(p.data_inicio)} · {p.categoria} · {p.descricao || "—"}</span>
              <span style={{ fontFamily: "var(--fonte-numero)" }}>{fmtEUR(p.valor)}</span>
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: "#8E2A20", marginTop: 7, lineHeight: 1.5 }}>
            Só saem previsões das categorias que o motor passa a gerir ({cats.join(", ")}),
            e só de hoje para a frente. Tudo o resto fica como está.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onVoltar} disabled={aGravar}
          style={{ background: "none", border: "1px solid #E3D9CC", borderRadius: 8,
                   padding: "9px 16px", fontSize: 12, color: "#6E7378", cursor: "pointer" }}>Voltar</button>
        <button onClick={onAplicar} disabled={aGravar}
          style={{ background: aGravar ? "#C4C7CA" : COR.alerta, color: "#fff", border: "none",
                   borderRadius: 8, padding: "9px 22px", fontSize: 12, fontWeight: 700,
                   cursor: aGravar ? "default" : "pointer" }}>
          {aGravar ? "A aplicar..." : "Sim, aplicar ao fluxo"}
        </button>
      </div>
    </div>
  );
}

// ─── O gatilho, para o cabeçalho do Fluxo Futuro ─────────────────────────────
export function BotaoPlanoObra({ empresa, plano, faturas = [], grupo = "LPX", onAbrir }) {
  if (!temObra(empresa)) return null;
  const gasto = gastoEmObra(faturas, {
    empresa, categorias: [classificacaoDe("obra", grupo).categoria],
    taxaIva: plano?.taxa_iva_obra ?? 23,
  });
  const desatualizado = planoDesatualizado(plano, gasto);
  const semPlano = !plano || !plano.data_fim;

  return (
    <button onClick={onAbrir}
      title={semPlano ? "Definir o prazo e o budget da obra deste projeto"
           : desatualizado ? "Entraram faturas de obra desde o último recálculo"
           : "Rever o plano de obra e recalcular o fluxo"}
      style={{ background: desatualizado ? "#F6ECD6" : semPlano ? "#F6F0E8" : "#EDF1F5",
               color: desatualizado ? COR.aviso : semPlano ? "#5C6166" : "#2C4A63",
               border: "none", padding: "8px 14px", borderRadius: 8, fontSize: 12,
               cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
      {desatualizado ? "⚠ Plano de obra" : "Plano de obra"}
      {!semPlano && plano.data_fim && (
        <span style={{ marginLeft: 7, fontFamily: "var(--fonte-numero)", fontSize: 10.5, opacity: 0.75 }}>
          fim {fmtData(plano.data_fim)}
        </span>
      )}
    </button>
  );
}
