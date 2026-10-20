import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useVendas, useSaldosAtuais, useRecebiveis, useObraPlanos,
         useDespesasRecorrentes, useFracoes } from "./hooks.js";
import ModalPlanoObra, { BotaoPlanoObra } from "./ObraPlano.jsx";
import ModalRecorrentes, { BotaoRecorrentes } from "./Recorrentes.jsx";
import { ocorrenciasDe } from "./recorrentes.js";
import { linhasDeFluxo as linhasDeVendasBase, soReceita,
         contaDaVenda, comissaoDaVenda } from "./vendas.js";
import { CATEGORIAS } from "./categorias.js";
import { categoriasDa, comOValorAtual } from "./categoriasEmpresa.js";
import { faturaPaga, faturaAtrasada, statusFatura } from "./status.js";
import { fmtEUR as fmtEuro } from "./formato.js";
import { labelEmpresa, EMPRESAS as EMPRESAS_TODAS } from "./empresas.js";
import { temFunding, pctFunding, linhaFunding, ERRO_SEM_COLUNAS, faltamColunas, CATEGORIA_FUNDING } from "./funding.js";
import { construirMatriz } from "./matriz.js";
import { opcoesDeRubrica, rubricaDe } from "./rubricas.js";
import MatrizFluxo, { BotaoFunding, AcoesDoItem } from "./MatrizFluxo.jsx";

const fmt = (v) => fmtEuro(v, 0);
// Valor exato com 2 casas decimais (para parcelas individuais)
const fmtFull = (v) => fmtEuro(v);
// Formato pt-PT com 2 decimais para todos os valores monetários no Fluxo Futuro.
// (Antes este helper devolvia "1,3k €" ou "1,30M €"; agora sempre "1 234,56 €")
const fmtK = (v) => fmtEuro(v);
const fmtDate = (s) => {
  if (!s || typeof s !== "string" || s.length < 10) return s || "";
  const m = s.substring(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
};

// Fallback caso o App não passe EMPRESAS — vem da configuração da LPX.
// (A versão portada da Rio Capital trazia aqui as empresas da Rio.)
const EMPRESAS_FALLBACK = EMPRESAS_TODAS;

// Nome do projeto (usado nas frações/vendas) → id da empresa.
// Deriva de src/empresas.js; aceita o nome completo ou só o projeto.
const PROJETO_EMPRESA_MAP = Object.fromEntries(
  EMPRESAS_TODAS.flatMap(e => [[e.nome, e.id], [e.projeto, e.id], [e.razaoSocial, e.id]])
    .filter(([k]) => k)
);

// ─── Botão de funding de uma despesa ────────────────────────────────────────
// Desligado é um contorno cinzento; ligado fica verde e mostra a percentagem
// financiada, editável ali mesmo (o banco raramente financia 100%).
export default function FluxoFuturo({ faturas: faturasTodas, faturasLoading, pagamentosExtras: pagamentosTodos, pagamentosLoading, onAddPagamento, onUpdatePagamento, onDeletePagamento, onAddPagamentos, onApagarPagamentos, onUpdateFatura, onDeleteFatura, currentUser, EMPRESAS, caixaUnico }) {
  // Só as empresas visíveis (filtro de grupo LPX/HDG e perfil investidor).
  // Itens cuja empresa não corresponda a nenhuma conhecida ficam visíveis para
  // admin e gestor, para não desaparecerem do sistema sem aviso.
  const idsVisiveis = (EMPRESAS || []).map(e => e.id);
  const podeVerOrfaos = currentUser?.role === "admin" || currentUser?.role === "gestor";
  const pertence = (x) => {
    if (!x?.empresa) return podeVerOrfaos;
    if (idsVisiveis.includes(x.empresa)) return true;
    return podeVerOrfaos && !EMPRESAS_TODAS.some(e => e.id === x.empresa);
  };
  const faturas = (faturasTodas || []).filter(pertence);
  const pagamentosExtras = (pagamentosTodos || []).filter(pertence);

  const { vendas, loading: vendasLoading, updateVenda } = useVendas();
  const { fracoes } = useFracoes();
  // Contas a Receber: faturas emitidas a clientes e entradas previstas. Até
  // aqui o Fluxo Futuro não as via, e o dinheiro a entrar por esta via não
  // aparecia na projeção de tesouraria.
  const { recebiveis: recebiveisTodos } = useRecebiveis();
  const recebiveis = (recebiveisTodos || []).filter(pertence);
  // Editar, marcar como pago e eliminar: admin e gestor (opção da LPX).
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "gestor";
  const stillLoading = !!(pagamentosLoading || faturasLoading || vendasLoading);

  // Constrói a lista das empresas dinamicamente, com saldo somado das contas em caixaUnico.
  // Inclui as 13 empresas reais (vindas de App.jsx); 'all' = soma de todas.
  // Todos os ids de contas (para puxar último saldo real dos movimentos)
  const allContaIds = useMemo(() => {
    const base = (EMPRESAS && EMPRESAS.length > 0 ? EMPRESAS : EMPRESAS_FALLBACK);
    const out = [];
    base.forEach(e => {
      const contas = (caixaUnico && caixaUnico[e.id]) || e.contas || [];
      contas.forEach(c => { if (c.id || c.conta_id) out.push(c.id || c.conta_id); });
    });
    return out;
  }, [EMPRESAS, caixaUnico]);
  const { saldos: saldosAtuais } = useSaldosAtuais(allContaIds);

  const EMPRESAS_CAIXA = useMemo(() => {
    const base = (EMPRESAS && EMPRESAS.length > 0 ? EMPRESAS : EMPRESAS_FALLBACK).map(e => {
      const contas = (caixaUnico && caixaUnico[e.id]) || e.contas || [];
      // Para cada conta, usar o saldo real do último movimento (saldosAtuais) com fallback para c.saldo
      const saldo = contas.reduce((s, c) => {
        const cid = c.id || c.conta_id;
        const saldoReal = saldosAtuais && saldosAtuais[cid];
        return s + (saldoReal != null ? saldoReal : (parseFloat(c.saldo) || 0));
      }, 0);
      return { id: e.id, nome: e.nome, saldo };
    });
    const total = base.reduce((s, e) => s + e.saldo, 0);
    return [{ id: "all", nome: "Todos os Projetos", saldo: total }, ...base];
  }, [EMPRESAS, caixaUnico, saldosAtuais]);

  const [empresa, setEmpresa] = useState("all");
  // Real = tem fatura emitida (ou recebível contratado). Previsto = estimativa
  // lançada à mão que ainda não tem documento.
  const [natureza, setNatureza] = useState("todos");   // todos | real | previsto
  const [mostrarVazios, setMostrarVazios] = useState(false);
  const [converter, setConverter] = useState(null);    // previsão a converter em fatura
  const [aproximar, setAproximar] = useState(false);   // painel de aproximação em lote

  // ── Plano de obra ────────────────────────────────────────────────────────
  // Só existe para os projetos com obra, e só quando um está escolhido: um
  // plano é de um projeto, não do consolidado.
  const [planoAberto, setPlanoAberto] = useState(false);
  const { planos: obraPlanos, guardarPlano } = useObraPlanos();

  // ── Despesas recorrentes ─────────────────────────────────────────────────
  // A regra fica gravada; é aqui que se expande para o fluxo (ver mais abaixo
  // e src/recorrentes.js). Como nenhuma linha é gravada, parar uma despesa é
  // mexer na data de fim de um registo só.
  const [recorrentesAberto, setRecorrentesAberto] = useState(false);
  const { recorrentes, guardarRecorrente, apagarRecorrente } = useDespesasRecorrentes();
  const planoDaEmpresa = (obraPlanos || []).find(p => p.empresa === empresa) || null;
  const grupoDaEmpresa = EMPRESAS_TODAS.find(e => e.id === empresa)?.grupo || "LPX";
  const nomeDaEmpresa = EMPRESAS_TODAS.find(e => e.id === empresa)?.nome || empresa;
  // As contas deste projeto: é pelo extrato delas que o plano descobre o que
  // já foi pago em obra e o funding que o banco já libertou.
  const contasDaEmpresa = useMemo(() => {
    if (empresa === "all") return [];
    const base = (EMPRESAS && EMPRESAS.length > 0 ? EMPRESAS : EMPRESAS_FALLBACK);
    const e = base.find(x => x.id === empresa);
    const contas = (caixaUnico && caixaUnico[empresa]) || e?.contas || [];
    return contas.map(c => c.id || c.conta_id).filter(Boolean);
  }, [empresa, EMPRESAS, caixaUnico]);

  // Aplicar: apaga o que foi dito que ia apagar e cria as linhas novas. A
  // ordem importa — apagar primeiro, senão os ids determinísticos chocam com
  // os do recálculo anterior.
  const aplicarPlanoObra = async ({ plano, aCriar, idsAApagar }) => {
    if (idsAApagar?.length) {
      const r = await onApagarPagamentos?.(idsAApagar);
      if (r?.error) return r;
    }
    if (aCriar?.length) {
      const r = await onAddPagamentos?.(aCriar);
      if (r?.error) return r;
    }
    return await guardarPlano(plano);
  };
  const [escolhas, setEscolhas] = useState({});        // { pagamentoId: faturaId | "" }
  const [aAplicar, setAAplicar] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // Form simples (descrição, empresa, categoria, observação, tipo)
  const [form, setForm] = useState({
    descricao: "", empresa: "", categoria: "Obra", obs: "", tipo: "saida"
  });
  // Empresa por defeito do formulário: a que está filtrada no topo; se o
  // filtro estiver em "Todos os Projetos", a primeira empresa da lista.
  // Também corrige um valor que não exista na lista — um <select> com um valor
  // inválido MOSTRA a 1.ª opção mas GRAVA o valor inválido, o que fazia as
  // previsões irem parar a uma empresa que não se via no ecrã.
  const empresaPorDefeito = () => {
    const reais = EMPRESAS_CAIXA.filter(e => e.id !== "all");
    if (empresa !== "all" && reais.some(e => e.id === empresa)) return empresa;
    return reais[0]?.id || "";
  };
  useEffect(() => {
    const reais = EMPRESAS_CAIXA.filter(e => e.id !== "all");
    const valida = reais.some(e => e.id === form.empresa);
    if (!valida && reais.length) {
      setForm(f => ({ ...f, empresa: empresaPorDefeito() }));
    }
  }, [EMPRESAS_CAIXA, form.empresa]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ao mudar de projeto no topo, o formulário acompanha (se estiver fechado)
  useEffect(() => {
    if (!showForm && empresa !== "all") setForm(f => ({ ...f, empresa }));
  }, [empresa]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parcelas editáveis [{data, valor, obs}]
  const [parcelasArr, setParcelasArr] = useState([]);
  // Gerador automático
  const [genValor, setGenValor] = useState("");
  const [genData, setGenData] = useState("");
  const [genN, setGenN] = useState(1);
  const [genIntervalo, setGenIntervalo] = useState("mensal");
  const [genDias, setGenDias] = useState(30);

  // Edição de pagamento manual existente
  const [editPagamento, setEditPagamento] = useState(null); // objeto completo do pagamentos_extras
  const [editForm, setEditForm] = useState(null);

  const openEdit = (pag) => {
    setEditPagamento(pag);
    setEditForm({
      descricao: pag.descricao || "",
      empresa: pag.empresa || "",
      categoria: pag.categoria || "Obra",
      valor: pag.valor ?? "",
      data_inicio: pag.data_inicio || "",
      parcelas: pag.parcelas ?? 1,
      periodicidade: pag.periodicidade || "unica",
      tipo: pag.tipo || "saida",
    });
  };
  const closeEdit = () => { setEditPagamento(null); setEditForm(null); };
  const handleSaveEdit = async () => {
    if (!editPagamento || !editForm) return;
    if (!editForm.descricao) { alert("Indica uma descrição."); return; }
    if (!editForm.data_inicio) { alert("Indica a data."); return; }
    const res = await onUpdatePagamento?.(editPagamento.id, {
      descricao: editForm.descricao,
      empresa: editForm.empresa,
      categoria: editForm.categoria,
      valor: parseFloat(editForm.valor) || 0,
      data_inicio: editForm.data_inicio,
      parcelas: parseInt(editForm.parcelas) || 1,
      periodicidade: editForm.periodicidade,
      tipo: editForm.tipo,
    });
    if (res?.error) {
      alert("Erro a guardar:\n\n" + (res.error.message || res.error));
      return;
    }
    closeEdit();
  };
  const handleDeletePagamento = async (pag) => {
    if (!window.confirm(`Eliminar pagamento "${pag.descricao}"?\nEsta acção não pode ser desfeita.`)) return;
    const res = await onDeletePagamento?.(pag.id);
    if (res?.error) {
      alert("Erro a eliminar:\n\n" + (res.error.message || res.error));
      return;
    }
    if (!res?.data || res.data.length === 0) {
      alert("Nenhum pagamento foi eliminado.\n\nProvavelmente falta uma política DELETE no Supabase para a tabela 'pagamentos_extras'.");
    }
  };

  // Marcar um pagamento manual como Pago (sai do fluxo, não impacta caixa)
  const handleMarkAsPaid = async (pag) => {
    if (!onUpdatePagamento) return;
    const res = await onUpdatePagamento(pag.id, { status: "Paga" });
    if (res?.error) {
      const msg = (res.error.message || "") + (res.error.details ? " · " + res.error.details : "");
      if (msg.toLowerCase().includes('column') && msg.includes('status')) {
        alert("⚠️ A coluna 'status' ainda não existe em 'pagamentos_extras'.\n\nAbre /setup-pagamentos-status.html para instruções de setup (1 minuto).");
      } else {
        alert("Erro ao marcar como pago:\n\n" + msg);
      }
      return;
    }
  };
  // Reverter "Pago" → "Pendente" (volta a entrar no fluxo)
  const handleMarkAsPending = async (pag) => {
    if (!onUpdatePagamento) return;
    const res = await onUpdatePagamento(pag.id, { status: "Pendente" });
    if (res?.error) {
      alert("Erro:\n\n" + (res.error.message || res.error));
    }
  };

  // ── Funding bancário ──────────────────────────────────────────────────────
  // Liga/desliga o financiamento da despesa. A marcação fica no registo
  // (previsão ou fatura), por isso sobrevive à conversão previsão → fatura.
  const gravaFunding = async (item, patch) => {
    const fonte = item.pagamento || item.fatura;
    if (!fonte) return;
    const res = item.pagamento
      ? await onUpdatePagamento?.(fonte.id, patch)
      : await onUpdateFatura?.(fonte.id, patch);
    if (res?.error) {
      alert(faltamColunas(res.error) ? ERRO_SEM_COLUNAS
        : "Erro a guardar o funding:\n\n" + (res.error.message || res.error));
    }
  };
  const alternaFunding = (item) => {
    const fonte = item.pagamento || item.fatura;
    const liga = !temFunding(fonte);
    gravaFunding(item, { funding: liga, funding_pct: liga ? (Number(fonte?.funding_pct) || 100) : 100 });
  };
  const defineFundingPct = (item, valor) => {
    const p = Math.min(100, Math.max(0, Number(valor) || 0));
    gravaFunding(item, { funding: true, funding_pct: p });
  };

  // ── Converter previsão em custo real ──────────────────────────────────────
  // Quando chega a fatura de algo que estava previsto, a previsão tem de sair
  // do fluxo — senão o mês fica com o valor a dobrar. Marca-se o pagamento
  // manual como "Convertida" e regista-se na descrição a fatura que o
  // substituiu, para haver rasto.
  const handleConverter = async (pag, fatura) => {
    if (!onUpdatePagamento) return;
    const ref = fatura ? (fatura.fatura || fatura.fornecedor || `#${fatura.id}`) : null;
    const res = await onUpdatePagamento(pag.id, {
      status: "Convertida",
      descricao: ref ? `${pag.descricao} [→ fatura ${ref}]` : pag.descricao,
    });
    if (res?.error) {
      const msg = (res.error.message || "") + (res.error.details ? " · " + res.error.details : "");
      if (msg.toLowerCase().includes("column") && msg.includes("status")) {
        alert("⚠️ A coluna 'status' ainda não existe em 'pagamentos_extras'.\n\nAbre /setup-pagamentos-status.html para instruções de setup (1 minuto).");
      } else {
        alert("Erro ao converter:\n\n" + msg);
      }
      return;
    }
    // O funding acompanha a despesa: se a previsão estava marcada como
    // financiada, a fatura que a substitui herda a marcação — senão a entrada
    // do banco desaparecia do fluxo no dia em que chega a fatura.
    if (fatura && temFunding(pag) && !temFunding(fatura)) {
      const r = await onUpdateFatura?.(fatura.id, {
        funding: true, funding_pct: pctFunding(pag),
      });
      if (r?.error && !faltamColunas(r.error)) {
        alert("A previsão foi convertida, mas não foi possível passar o funding para a fatura:\n\n"
          + (r.error.message || r.error));
      }
    }
    setConverter(null);
  };

  // Faturas candidatas a substituir uma previsão: mesma empresa, por pagar e
  // com vencimento próximo da data prevista. Ordenadas pela diferença de valor.
  const candidatasFatura = (pag) => {
    if (!pag) return [];
    const alvo = parseFloat(pag.valor) || 0;
    const base = pag.data_inicio ? new Date(pag.data_inicio + "T00:00:00").getTime() : null;
    return (faturas || [])
      .filter(f => !faturaPaga(f))
      .filter(f => !pag.empresa || f.empresa === pag.empresa)
      .filter(f => {
        if (!base || !f.vencimento) return true;
        const dif = Math.abs(new Date(f.vencimento + "T00:00:00").getTime() - base);
        return dif <= 120 * 86400000;          // ±4 meses
      })
      .sort((a, b) => Math.abs((a.valor || 0) - alvo) - Math.abs((b.valor || 0) - alvo))
      .slice(0, 12);
  };

  // ── Aproximação automática de previsões a faturas ─────────────────────────
  // Para cada previsão em aberto procura-se a fatura por pagar mais parecida.
  // A pontuação pesa três sinais: proximidade do valor, proximidade da data e
  // palavras comuns na descrição. Nada é convertido sem o utilizador confirmar.
  const palavras = (t) => new Set(
    String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/).filter(w => w.length > 3)
  );

  const pontua = (pag, f) => {
    const vp = Math.abs(parseFloat(pag.valor) || 0);
    const vf = Math.abs(parseFloat(f.valor) || 0);
    const maior = Math.max(vp, vf, 1);
    const difRel = Math.abs(vp - vf) / maior;
    const sValor = Math.max(0, 1 - difRel * 4);          // 0 se diferir >25%

    let sData = 0.5;
    if (pag.data_inicio && f.vencimento) {
      const dias = Math.abs(new Date(f.vencimento + "T00:00:00") - new Date(pag.data_inicio + "T00:00:00")) / 86400000;
      sData = Math.max(0, 1 - dias / 90);                 // 0 a partir de 3 meses
    }

    const a = palavras(pag.descricao), b = palavras((f.fornecedor || "") + " " + (f.fatura || ""));
    let comuns = 0; a.forEach(w => { if (b.has(w)) comuns++; });
    const sTexto = a.size ? Math.min(1, comuns / Math.min(a.size, 3)) : 0;

    const mesmaEmpresa = !pag.empresa || !f.empresa || pag.empresa === f.empresa;
    return (sValor * 0.5 + sData * 0.25 + sTexto * 0.25) * (mesmaEmpresa ? 1 : 0.4);
  };

  const sugestoes = useMemo(() => {
    const abertas = (faturas || []).filter(f => !faturaPaga(f));
    const previsoes = (pagamentosExtras || []).filter(p =>
      p.tipo !== "entrada" && !["Paga", "Pago", "Convertida"].includes(p.status)
    );
    return previsoes.map(p => {
      const ranking = abertas
        .map(f => ({ fatura: f, score: pontua(p, f) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      return { pagamento: p, melhor: ranking[0] || null, ranking };
    }).sort((a, b) => (b.melhor?.score || 0) - (a.melhor?.score || 0));
  }, [faturas, pagamentosExtras]);

  const aplicarAproximacoes = async () => {
    const pares = Object.entries(escolhas).filter(([, fid]) => fid);
    if (!pares.length) return;
    setAAplicar(true);
    let erros = 0;
    for (const [pid, fid] of pares) {
      const pag = (pagamentosExtras || []).find(p => String(p.id) === String(pid));
      const fat = (faturas || []).find(f => String(f.id) === String(fid));
      if (!pag) continue;
      const ref = fat ? (fat.fatura || fat.fornecedor || `#${fat.id}`) : null;
      const res = await onUpdatePagamento(pag.id, {
        status: "Convertida",
        descricao: ref ? `${pag.descricao} [→ fatura ${ref}]` : pag.descricao,
      });
      if (res?.error) erros++;
    }
    setAAplicar(false);
    setEscolhas({});
    if (erros) alert(`${erros} ${erros === 1 ? "previsão não foi convertida" : "previsões não foram convertidas"}. Verifica a coluna 'status' em pagamentos_extras.`);
    else setAproximar(false);
  };

  // VENDAS — marcar como recebido/pago.
  //
  // Antes isto ZERAVA o campo, e o valor original perdia-se: no mês seguinte
  // já ninguém sabia quanto tinha sido o sinal. Agora marca-se a parcela como
  // paga, ou regista-se o recebimento, e o valor fica na história.
  const handleMarkVendaItemPaid = async (venda, origem, item) => {
    if (!updateVenda || !venda) return;
    const atual = (vendas || []).find(v => v.id === venda.id) || venda;
    let updates = null;

    if (origem === "Sinal / reforço") {
      const lista = Array.isArray(atual.parcelas) ? atual.parcelas : [];
      const i = typeof item?.parcela === "number" ? item.parcela : -1;
      if (i < 0 || !lista[i]) return;
      updates = { parcelas: lista.map((p, k) => (k === i ? { ...p, pago: true } : p)) };
    } else if (origem === "Escritura") {
      // Recebida a escritura, a venda está recebida por inteiro.
      const f = (fracoes || []).find(x => x.id === atual.fracao_id) || null;
      updates = { recebemos: contaDaVenda(atual, f).preco };
    } else if (origem === "Comissão na escritura") {
      const f = (fracoes || []).find(x => x.id === atual.fracao_id) || null;
      const c = comissaoDaVenda(atual, f);
      if (!(c.porPagar > 0.005)) return;
      updates = { comissao_parcelas: [
        ...(Array.isArray(atual.comissao_parcelas) ? atual.comissao_parcelas : []),
        { desc: "Liquidada na escritura", valor: c.porPagar,
          data: new Date().toISOString().slice(0, 10), pago: true },
      ]};
    }
    if (!updates) return;

    const res = await updateVenda(venda.id, updates);
    if (res?.error) {
      alert("Erro ao marcar como pago:\n\n" + (res.error.message || res.error));
    }
  };
  const handleMarkFaturaPaid = async (fat) => {
    if (!onUpdateFatura) return;
    const res = await onUpdateFatura(fat.id, { status: "Pago" });
    if (res?.error) {
      alert("Erro ao marcar fatura como paga:\n\n" + (res.error.message || res.error));
      return;
    }
    if (!res?.data || res.data.length === 0) {
      alert("Nada foi alterado (provavelmente falta política UPDATE no RLS para 'faturas').");
    }
  };
  const handleDeleteFatura = async (fat) => {
    if (!onDeleteFatura) return;
    if (!window.confirm(`Eliminar fatura "${fat.fornecedor || fat.fatura}" (${fmtFull(fat.valor)})?\n\nEsta acção não pode ser desfeita.`)) return;
    const res = await onDeleteFatura(fat.id);
    if (res?.error) {
      alert("Erro ao eliminar:\n\n" + (res.error.message || res.error));
      return;
    }
    if (!res?.data || res.data.length === 0) {
      alert("Nada foi eliminado (provavelmente falta política DELETE no RLS para 'faturas').");
    }
  };

  // Tudo o que se pode fazer a um lançamento, num sítio só — o <AcoesDoItem>
  // recebe isto e é igual em toda a página.
  const acoesDoItem = useMemo(() => ({
    marcarPago: (pag) => handleMarkAsPaid(pag),
    converter: (pag) => setConverter(pag),
    editar: (pag) => openEdit(pag),
    apagar: (pag) => handleDeletePagamento(pag),
    marcarFaturaPaga: (fat) => handleMarkFaturaPaid(fat),
    apagarFatura: (fat) => handleDeleteFatura(fat),
    marcarVendaPaga: (venda, origem, item) => handleMarkVendaItemPaid(venda, origem, item),
    alternarFunding: (item) => alternaFunding(item),
    definirFundingPct: (item, v) => defineFundingPct(item, v),
    abrirRecorrentes: () => setRecorrentesAberto(true),
  }), [faturas, pagamentosExtras]);

  const empObj = EMPRESAS_CAIXA.find(e => e.id === empresa) || EMPRESAS_CAIXA[0];
  const saldoAtual = empresa === "all"
    ? EMPRESAS_CAIXA.filter(e => e.id !== "all").reduce((s, e) => s + e.saldo, 0)
    : empObj.saldo;

  // Build monthly cashflow for next 36 months
  const hoje = new Date();
  const meses = Array.from({ length: 36 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("pt-PT", { month: "short", year: "numeric" }),
      ano: d.getFullYear(),
      mes: d.getMonth() + 1,
      entradas: 0,
      saidas: 0,
      items: [],
    };
  });

  // Uma saída financiada pelo banco traz atrás de si a entrada do banco, no
  // mesmo mês: é isso que a neutraliza no caixa do projeto.
  const comFunding = (bucket, fonte, saida, extra = {}) => {
    const linha = linhaFunding(fonte, saida);
    if (!linha) return;
    bucket.entradas += linha.valor;
    bucket.items.push({ ...linha, ...extra });
  };

  const getMesKey = (dateStr) => {
    if (!dateStr) return null;
    return dateStr.substring(0, 7);
  };

  // Bucket especial para faturas com data_vencimento anterior ao mês atual (vencidas/atrasadas).
  // Mostram-se no topo do fluxo como uma linha separada e impactam o caixa em "Atrasadas".
  const hojeISO = hoje.toISOString().slice(0, 10);
  const mesAtualKey = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const vencidas = { entradas: 0, saidas: 0, items: [] };

  // Add contas a pagar (saídas)
  faturas.forEach(f => {
    // A data que conta no fluxo é a previsão de pagamento, quando existe: é
    // quando o dinheiro sai mesmo. Sem previsão, usa-se o vencimento.
    const dataFluxo = f.previsao_pagamento || f.vencimento;
    if (!dataFluxo) return;
    if (empresa !== "all" && f.empresa !== empresa) return;
    if (faturaPaga(f)) return;
    const key = getMesKey(dataFluxo);
    // Se a fatura já está marcada como Vencida, ou se a data passou (independentemente do mês) → bucket "vencidas"
    if (faturaAtrasada(f)) {
      const saida = {
        tipo: "saida",
        desc: f.fornecedor || f.fatura,
        valor: f.valor,
        cat: f.categoria,
        origem: "Vencida",
        natureza: "real",
        vencimento: dataFluxo,
        fatura: f,
      };
      vencidas.saidas += parseFloat(f.valor) || 0;
      vencidas.items.push(saida);
      comFunding(vencidas, f, saida, { vencimento: dataFluxo, fatura: f });
      return;
    }
    const m = meses.find(m => m.key === key);
    if (m) {
      const saida = { tipo: "saida", desc: f.fornecedor || f.fatura, valor: f.valor, cat: f.categoria, origem: "Contas a Pagar", natureza: "real", fatura: f };
      m.saidas += parseFloat(f.valor) || 0;
      m.items.push(saida);
      comFunding(m, f, saida, { fatura: f });
    }
  });

  // Add vendas: sinal, reforços, a escritura e a comissão do mediador.
  // A aritmética toda vive em src/vendas.js — aqui só se despejam as linhas
  // que ela devolve, para o Fluxo Futuro, o Investor Relations e o Real ×
  // Orçado não contarem histórias diferentes.
  // Quando o plano de obra já lançou a venda da escritura ("Venda —
  // escritura", que vale o que falta receber da tabela de vendas), as entradas
  // de venda desta empresa já estão no fluxo por essa via: lançá-las outra vez
  // aqui dava o dobro. A comissão do mediador não vem no plano, essa fica.
  const vendaJaNoPlano = new Set((pagamentosExtras || [])
    .filter(p => p?.plano_tipo === "venda"
              && !["Paga", "Pago", "Convertida"].includes(p?.status))
    .map(p => p?.empresa).filter(Boolean));

  linhasDeVendasBase({ vendas, fracoes }).forEach(l => {
    const v = (vendas || []).find(x => x.id === l.vendaId);
    const empId = PROJETO_EMPRESA_MAP[v?.projeto];
    if (empresa !== "all" && empId !== empresa) return;
    if (l.tipo === "entrada" && vendaJaNoPlano.has(empId)) return;
    const base = { desc: l.descricao, valor: l.valor, cat: l.categoria,
                   origem: l.origem, natureza: "real", vendaId: l.vendaId,
                   venda: v, parcela: l.parcela };
    if (l.data < hojeISO) {
      if (l.tipo === "entrada") vencidas.entradas += l.valor;
      else vencidas.saidas += l.valor;
      vencidas.items.push({ ...base, tipo: l.tipo, vencimento: l.data });
      return;
    }
    const m = meses.find(x => x.key === getMesKey(l.data));
    if (!m) return;
    if (l.tipo === "entrada") m.entradas += l.valor;
    else m.saidas += l.valor;
    m.items.push({ ...base, tipo: l.tipo });
  });

  // Add recebíveis (faturas emitidas a clientes e entradas previstas)
  // Só o que ainda está por receber: o que já entrou está no extrato.
  soReceita(recebiveis).forEach(r => {
    if (empresa !== "all" && r.empresa !== empresa) return;
    if (["Recebido", "Cancelado", "Anulada"].includes(r.status)) return;
    const data = r.data_prevista || r.data_fatura;
    if (!data) return;
    const valor = Math.abs(parseFloat(r.valor) || 0);
    if (!valor) return;
    const ehFatura = !!(r.numero_fatura && r.data_fatura);
    const base = {
      desc: ehFatura
        ? `${r.numero_fatura} — ${r.cliente || r.descricao || "cliente"}`
        : (r.descricao || r.cliente || "Entrada prevista"),
      valor,
      cat: ehFatura ? "Faturação" : "Vendas",
      origem: ehFatura ? "Fatura emitida" : "Contas a Receber",
      natureza: ehFatura ? "real" : "previsto",
      recebivel: r,
    };
    if (data < hojeISO) {
      vencidas.entradas += valor;
      vencidas.items.push({ ...base, tipo: "entrada", vencimento: data });
      return;
    }
    const m = meses.find(m => m.key === getMesKey(data));
    if (m) { m.entradas += valor; m.items.push({ ...base, tipo: "entrada" }); }
  });

  // Add pagamentos extras manuais
  (pagamentosExtras || []).forEach(p => {
    if (empresa !== "all" && p.empresa !== empresa) return;
    // Pagamentos já marcados como pagos não entram no fluxo (já saíram da conta real)
    if (p.status === "Paga" || p.status === "Pago") return;
    // Convertido em custo real: a fatura já entrou pelo Contas a Pagar, por isso
    // a previsão sai do fluxo para não duplicar o valor.
    if (p.status === "Convertida") return;
    const nParcelas = parseInt(p.parcelas) || 1;
    const startDate = new Date(p.data_inicio);
    for (let i = 0; i < nParcelas; i++) {
      const d = new Date(startDate);
      if (p.periodicidade === "mensal") d.setMonth(d.getMonth() + i);
      else if (p.periodicidade === "trimestral") d.setMonth(d.getMonth() + i * 3);
      else if (p.periodicidade === "anual") d.setFullYear(d.getFullYear() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const dataParcelaISO = `${key}-${String(d.getDate()).padStart(2, "0")}`;
      const valor = parseFloat(p.valor) / nParcelas;
      const base = {
        desc: p.descricao + (nParcelas > 1 ? ` (${i+1}/${nParcelas})` : ""),
        valor,
        cat: p.categoria,
        origem: "Manual",
        natureza: "previsto",
        pagamentoId: p.id,
        pagamento: p,
      };

      // Se a parcela cai antes de hoje → bucket "vencidas"
      if (dataParcelaISO < hojeISO) {
        if (p.tipo === "entrada") {
          vencidas.entradas += valor;
          vencidas.items.push({ ...base, tipo: "entrada", vencimento: dataParcelaISO });
        } else {
          const saida = { ...base, tipo: "saida", vencimento: dataParcelaISO };
          vencidas.saidas += valor;
          vencidas.items.push(saida);
          comFunding(vencidas, p, saida, { vencimento: dataParcelaISO, pagamento: p, pagamentoId: p.id });
        }
        continue;
      }

      const m = meses.find(m => m.key === key);
      if (m) {
        if (p.tipo === "entrada") {
          m.entradas += valor;
          m.items.push({ ...base, tipo: "entrada" });
        } else {
          const saida = { ...base, tipo: "saida" };
          m.saidas += valor;
          m.items.push(saida);
          comFunding(m, p, saida, { pagamento: p, pagamentoId: p.id });
        }
      }
    }
  });

  // ── Despesas recorrentes ─────────────────────────────────────────────────
  // A regra não tem linhas gravadas: expande-se aqui, para a janela do fluxo.
  // Cada ocorrência entra como uma previsão normal, com a marca de onde veio,
  // para o detalhe do mês poder dizer "recorrente" e levar ao painel.
  const fimDoFluxo = meses.length
    ? `${meses[meses.length - 1].key}-28`
    : hojeISO;
  (recorrentes || []).forEach(r => {
    if (empresa !== "all" && r.empresa !== empresa) return;
    if (r.ativa === false) return;
    ocorrenciasDe(r, { de: hojeISO, ate: fimDoFluxo }).forEach(oc => {
      const m = meses.find(x => x.key === oc.data.slice(0, 7));
      if (!m) return;
      const base = {
        desc: r.descricao,
        valor: Math.abs(oc.valor),
        cat: r.categoria || "",
        subcategoria: r.subcategoria || "",
        origem: "Recorrente",
        natureza: "previsto",
        recorrenteId: r.id,
        recorrente: r,
        vencimento: oc.data,
      };
      if (r.tipo === "entrada") {
        m.entradas += base.valor;
        m.items.push({ ...base, tipo: "entrada" });
      } else {
        m.saidas += base.valor;
        m.items.push({ ...base, tipo: "saida" });
      }
    });
  });

  // ── Filtro Real / Previsto ────────────────────────────────────────────────
  // Os totais são recalculados a partir dos itens que sobrevivem ao filtro,
  // para que o gráfico e o saldo acumulado reflictam a mesma seleção.
  if (natureza !== "todos") {
    const passa = (it) => (it.natureza || "previsto") === natureza;
    const recalcula = (b) => {
      b.items = b.items.filter(passa);
      b.entradas = b.items.filter(i => i.tipo === "entrada").reduce((t, i) => t + (parseFloat(i.valor) || 0), 0);
      b.saidas = b.items.filter(i => i.tipo === "saida").reduce((t, i) => t + (parseFloat(i.valor) || 0), 0);
    };
    meses.forEach(recalcula);
    recalcula(vencidas);
  }

  // Calculate running balance — começa com o saldo atual, mas se houver vencidas
  // (pagamentos atrasados ainda por liquidar), o caixa "real" já está comprometido.
  // Mostramos isso descontando à entrada do mês 1.
  let saldoAcumulado = saldoAtual - (vencidas.saidas - vencidas.entradas);
  const mesesComSaldo = meses.map(m => {
    const liquido = m.entradas - m.saidas;
    saldoAcumulado += liquido;
    return { ...m, liquido, saldo_fim: saldoAcumulado };
  });

  // Saldo "real disponível" depois de pagar vencidas
  const saldoLiquido = saldoAtual - (vencidas.saidas - vencidas.entradas);

  const [expandedMes, setExpandedMes] = useState(null);
  // A matriz é a vista por omissão: é a que responde à pergunta de quem abre o
  // fluxo — quanto custa cada despesa, mês a mês. As outras ficam a um clique.
  const [view, setView] = useState("matriz"); // matriz | mensal | anual
  // Quantas colunas de mês a matriz mostra. O utilizador acrescenta e tira.
  const [mesesMatriz, setMesesMatriz] = useState(6);
  // Filtros de data (formato YYYY-MM, mensal)
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  // Aplicar filtro de data aos meses para visualização (saldo acumulado mantém-se cumulativo desde o início)
  const mesesFiltrados = useMemo(() => {
    let lista = mesesComSaldo;
    if (dataInicio || dataFim) {
      lista = lista.filter(m => {
        if (dataInicio && m.key < dataInicio) return false;
        if (dataFim && m.key > dataFim) return false;
        return true;
      });
    }
    // Por defeito mostram-se apenas os meses com lançamentos: projectar 36 meses
    // vazios só afasta a informação útil. O mês corrente aparece sempre.
    if (!mostrarVazios) {
      const comMovimento = lista.filter(m => m.items.length > 0 || m.key === mesAtualKey);
      if (comMovimento.length) lista = comMovimento;
    }
    return lista;
  }, [mesesComSaldo, dataInicio, dataFim, mostrarVazios, mesAtualKey]);

  // A matriz usa os mesmos meses da vista mensal — os mesmos lançamentos, a
  // mesma aritmética; só a arrumação é outra. Ver src/matriz.js.
  // A linha a que cada lançamento pertence. Nas empresas LPX é a categoria com
  // que foi classificado; nos projetos HDG é a despesa da FO — ver
  // src/rubricasHDG.js. Como em "Todos os Projetos" convivem os dois mundos,
  // a empresa vem do próprio lançamento.
  const rubricaDoItem = useCallback((it) => {
    const emp = it?.pagamento?.empresa || it?.fatura?.empresa
             || it?.recorrente?.empresa || (empresa !== "all" ? empresa : "");
    const sub = it?.pagamento?.subcategoria || it?.fatura?.subcategoria || "";
    return rubricaDe(emp, it?.cat, sub) || it?.cat || "";
  }, [empresa]);

  const matriz = useMemo(() => construirMatriz({
    meses: mesesComSaldo, maxMeses: mesesMatriz,
    de: dataInicio, ate: dataFim, comVazios: mostrarVazios,
    rubricaDoItem,
  }), [mesesComSaldo, mesesMatriz, dataInicio, dataFim, mostrarVazios, rubricaDoItem]);

  const anoGroups = useMemo(() => {
    const groups = {};
    mesesComSaldo.forEach(m => {
      if (!groups[m.ano]) groups[m.ano] = { ano: m.ano, entradas: 0, saidas: 0, items: [], meses: [] };
      groups[m.ano].entradas += m.entradas;
      groups[m.ano].saidas += m.saidas;
      groups[m.ano].items.push(...m.items);
      groups[m.ano].meses.push(m);
    });
    return Object.values(groups).map(g => ({ ...g, liquido: g.entradas - g.saidas, saldo_fim: g.meses[g.meses.length - 1]?.saldo_fim || 0 }));
  }, [mesesComSaldo]);

  // Helpers parcelas
  //
  // Três cuidados que o gerador antigo não tinha:
  //  1. Data em hora LOCAL. toISOString() converte para UTC e, em Lisboa no
  //     verão, "30/09 00:00" passava a "29/09 23:00" — a 1.ª parcela recuava um dia.
  //  2. Fim de mês. 30/01 + 1 mês = "30/02", que não existe; o JavaScript saltava
  //     para 02/03 e todas as parcelas seguintes escorregavam para dia 1 ou 2.
  //     Agora o dia fica preso ao último dia do mês (30/02 → 28/02).
  //  3. Cada parcela calcula-se a partir da data INICIAL e do seu índice, não da
  //     parcela anterior — assim um fevereiro curto não arrasta as seguintes.
  const dateToISO = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const ultimoDiaDoMes = (ano, mes) => new Date(ano, mes + 1, 0).getDate();

  // Soma `meses` a uma data, prendendo o dia ao fim do mês quando necessário
  const somaMeses = (base, meses, diaOriginal) => {
    const alvo = new Date(base.getFullYear(), base.getMonth() + meses, 1);
    const dia = Math.min(diaOriginal, ultimoDiaDoMes(alvo.getFullYear(), alvo.getMonth()));
    return new Date(alvo.getFullYear(), alvo.getMonth(), dia);
  };

  // Data da parcela i (0 = a primeira), sempre a partir da data inicial
  const dataParcela = (inicio, i, intervalo, dias) => {
    const dia = inicio.getDate();
    if (intervalo === "mensal")     return somaMeses(inicio, i, dia);
    if (intervalo === "trimestral") return somaMeses(inicio, i * 3, dia);
    if (intervalo === "anual")      return somaMeses(inicio, i * 12, dia);
    const passo = intervalo === "semanal" ? 7
                : intervalo === "quinzenal" ? 15
                : (parseInt(dias) || 30);
    return new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i * passo);
  };

  // Compatibilidade: próxima data depois de `d` (usado ao acrescentar à mão)
  const addStep = (d, intervalo, dias) => dataParcela(d, 1, intervalo, dias);

  // Aceita "77953,17", "77.953,17" e "77953.17"
  const lerValor = (t) => {
    let x = String(t ?? "").trim().replace(/[^\d.,-]/g, "");
    if (x.includes(",") && x.includes(".")) x = x.replace(/\./g, "").replace(",", ".");
    else if (x.includes(",")) x = x.replace(",", ".");
    const n = parseFloat(x);
    return isFinite(n) ? n : 0;
  };

  const gerarParcelas = () => {
    const n = Math.max(1, Math.min(120, parseInt(genN) || 1));
    const total = lerValor(genValor);
    const cents = Math.round(total * 100);
    const baseCents = Math.floor(cents / n);
    const remainder = cents - baseCents * n;
    const venc0 = genData || dateToISO(new Date());
    const inicio = new Date(venc0 + "T00:00:00");
    const novo = [];
    for (let i = 0; i < n; i++) {
      const v = i === 0 ? (baseCents + remainder) / 100 : baseCents / 100;
      novo.push({ data: dateToISO(dataParcela(inicio, i, genIntervalo, genDias)), valor: v, obs: "" });
    }
    setParcelasArr(novo);
  };
  const addParcela = () => {
    const last = parcelasArr[parcelasArr.length - 1];
    const baseDate = last?.data ? new Date(last.data + "T00:00:00") : new Date();
    const next = addStep(baseDate, genIntervalo, genDias);
    setParcelasArr([...parcelasArr, { data: dateToISO(next), valor: 0, obs: "" }]);
  };
  const removeParcela = (i) => setParcelasArr(parcelasArr.filter((_, idx) => idx !== i));
  const updateParcela = (i, patch) =>
    setParcelasArr(parcelasArr.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  const totalParcelas = parcelasArr.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);

  const handleAddPagamento = async () => {
    if (!form.descricao) { alert("Indica uma descrição."); return; }
    if (parcelasArr.length === 0) { alert("Adiciona pelo menos uma parcela."); return; }
    const semData = parcelasArr
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !p.data || isNaN(new Date(p.data + "T00:00:00")));
    if (semData.length) {
      const lista = semData.map(({ i }) => `${i + 1}/${parcelasArr.length}`).join(", ");
      alert(
        `${semData.length === 1 ? "A parcela" : "As parcelas"} ${lista} ${semData.length === 1 ? "tem" : "têm"} uma data inválida ou vazia.\n\n` +
        "Atenção: o calendário deixa escrever datas que não existem (ex.: 30/02 ou 31/04) " +
        "e trata-as como vazias. Usa o último dia do mês."
      );
      return;
    }

    const baseId = "pe_" + Date.now();
    const n = parcelasArr.length;
    // Cada parcela é um pagamento individual com parcelas=1, periodicidade='unica'
    // para que o consumo existente em FluxoFuturo continue a funcionar.
    const itens = parcelasArr.map((p, i) => ({
      id: `${baseId}_p${i+1}`,
      tipo: form.tipo,
      descricao: n > 1
        ? `${form.descricao} (${i+1}/${n})${p.obs ? ` · ${p.obs}` : ""}`
        : `${form.descricao}${p.obs ? ` · ${p.obs}` : (form.obs ? ` · ${form.obs}` : "")}`,
      empresa: form.empresa,
      categoria: form.categoria,
      valor: Math.round((parseFloat(p.valor) || 0) * 100) / 100,
      data_inicio: p.data,
      parcelas: 1,
      periodicidade: "unica",
    }));
    // onAddPagamento pode aceitar 1 só. Chamamos N vezes em paralelo.
    await Promise.all(itens.map(it => onAddPagamento?.(it)));

    setShowForm(false);
    setForm({ descricao: "", empresa: empresaPorDefeito(), categoria: "Obra", obs: "", tipo: "saida" });
    setParcelasArr([]);
    setGenValor(""); setGenData(""); setGenN(1); setGenIntervalo("mensal"); setGenDias(30);
  };

  const maxAbs = Math.max(...mesesComSaldo.map(m => Math.max(m.entradas, m.saidas)), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: "var(--fonte-titulo)" }}>

      {/* Banner de loading global — mostra enquanto algum hook ainda não terminou. */}
      {stillLoading && (
        <div style={{ background: "linear-gradient(90deg, #F6ECD6 0%, #E3CE9F 50%, #F6ECD6 100%)", backgroundSize: "200% 100%", animation: "rio-shimmer 1.4s linear infinite", border: "1px solid #fcd34d", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#7A5A22", fontWeight: 600 }}>
          <div style={{ width: 14, height: 14, border: "2px solid #7A5A22", borderTopColor: "transparent", borderRadius: "50%", animation: "rio-spin 0.8s linear infinite" }} />
          A carregar dados do Supabase…
          <span style={{ color: "#8A6727", fontWeight: 400 }}>
            ({[pagamentosLoading && "pagamentos", faturasLoading && "faturas", vendasLoading && "vendas"].filter(Boolean).join(", ")})
          </span>
          <style>{`
            @keyframes rio-spin { to { transform: rotate(360deg); } }
            @keyframes rio-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
          `}</style>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {EMPRESAS_CAIXA.map(e => (
            <button key={e.id} onClick={() => setEmpresa(e.id)}
              style={{ background: empresa === e.id ? "#091C2A" : "#fff", color: empresa === e.id ? "#fff" : "#5C6166", border: `1px solid ${empresa === e.id ? "#091C2A" : "#EFE8DE"}`, padding: "7px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: empresa === e.id ? 700 : 400 }}>
              {e.nome}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {[["matriz", "Matriz"], ["mensal", "Mensal"], ["anual", "Anual"]].map(([v, lbl]) => (
            <button key={v} onClick={() => setView(v)}
              title={v === "matriz" ? "Uma linha por despesa, uma coluna por mês" : undefined}
              style={{ background: view === v ? "#091C2A" : "#E7DED2", color: view === v ? "#fff" : "#5C6166", border: "none", padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
              {lbl}
            </button>
          ))}
          {isAdmin && (
            <button onClick={() => setAproximar(true)}
              title="Procurar faturas que correspondam às despesas previstas"
              style={{ background: "#F6ECD6", border: "1px solid #E3CE9F", color: "#96702A", padding: "7px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
              ⇄ Aproximar previsões a faturas
            </button>
          )}
          {isAdmin && (
            <BotaoPlanoObra empresa={empresa} plano={planoDaEmpresa}
              faturas={faturas} grupo={grupoDaEmpresa}
              onAbrir={() => setPlanoAberto(true)} />
          )}
          <BotaoRecorrentes empresa={empresa} recorrentes={recorrentes}
            onAbrir={() => setRecorrentesAberto(true)} />
          {/* Real (com fatura) vs Previsto (estimativa lançada à mão) */}
          <div style={{ display: "flex", gap: 2, background: "#E7DED2", borderRadius: 8, padding: 2, marginLeft: 4 }}>
            {[["todos", "Tudo"], ["real", "Custo real"], ["previsto", "Forecast"]].map(([v, lbl]) => (
              <button key={v} onClick={() => setNatureza(v)}
                title={v === "real" ? "Faturas emitidas e recebíveis contratados"
                  : v === "previsto" ? "Previsões lançadas à mão, ainda sem fatura" : "Tudo"}
                style={{ background: natureza === v ? "#fff" : "transparent", color: natureza === v ? "#091C2A" : "#7E8388", border: "none", padding: "5px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontWeight: natureza === v ? 700 : 400, boxShadow: natureza === v ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
                {lbl}
              </button>
            ))}
          </div>
          {(view === "mensal" || view === "matriz") && (
            <>
              <label title="Por defeito só aparecem os meses com lançamentos"
                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#7E8388", cursor: "pointer" }}>
                <input type="checkbox" checked={mostrarVazios} onChange={e => setMostrarVazios(e.target.checked)} />
                meses vazios
              </label>
              <span style={{ fontSize: 11, color: "#7E8388", marginLeft: 8 }}>De:</span>
              <input type="month" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                style={{ background: "#E7DED2", border: "none", padding: "6px 8px", borderRadius: 8, fontSize: 11, fontFamily: "var(--fonte-numero)", color: "#091C2A" }} />
              <span style={{ fontSize: 11, color: "#7E8388" }}>Até:</span>
              <input type="month" value={dataFim} onChange={e => setDataFim(e.target.value)}
                style={{ background: "#E7DED2", border: "none", padding: "6px 8px", borderRadius: 8, fontSize: 11, fontFamily: "var(--fonte-numero)", color: "#091C2A" }} />
              {(dataInicio || dataFim) && (
                <button onClick={() => { setDataInicio(""); setDataFim(""); }}
                  title="Limpar filtros de data"
                  style={{ background: "#F6DED9", color: "#A93226", border: "none", padding: "4px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", fontWeight: 600 }}>✕</button>
              )}
            </>
          )}
          <button onClick={() => setShowForm(true)}
            style={{ background:"#091C2A", color: "#fff", border: "none", padding: "7px 18px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
            + Pagamento / Recebimento
          </button>
        </div>
      </div>

      {/* Saldo atual KPI */}
      {(() => {
        const filtroAtivo = !!(dataInicio || dataFim);
        const ultimoMesFiltrado = mesesFiltrados[mesesFiltrados.length - 1];
        const totalSaidasFiltrado = mesesFiltrados.reduce((s, m) => s + m.saidas, 0);
        const totalEntradasFiltrado = mesesFiltrados.reduce((s, m) => s + m.entradas, 0);
        const labelPeriodo = filtroAtivo
          ? (mesesFiltrados.length === 1 ? mesesFiltrados[0].label : `${mesesFiltrados[0]?.label || ""}—${ultimoMesFiltrado?.label || ""}`)
          : `${mesesFiltrados.length}m`;
        const saldoProjetado = ultimoMesFiltrado?.saldo_fim || 0;
        // Parte das saídas do período que o banco financia
        const totalFunding = mesesFiltrados.reduce((s, m) =>
          s + (m.items || []).filter(i => i._funding).reduce((t, i) => t + (parseFloat(i.valor) || 0), 0), 0);
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
            {[
              { label: "Caixa Atual", value: fmt(saldoAtual), color: saldoAtual >= 0 ? "#1F7A54" : "#A93226" },
              { label: `Vencidas (${vencidas.items.length})`, value: vencidas.saidas > 0 ? fmtK(-vencidas.saidas) : "—", color: vencidas.saidas > 0 ? "#A93226" : "#9DA2A6", warn: vencidas.saidas > 0 },
              { label: "Caixa Líquido", value: fmt(saldoLiquido), color: saldoLiquido >= 0 ? "#1F7A54" : "#A93226" },
              { label: `Total Saídas (${labelPeriodo})`, value: fmtK(totalSaidasFiltrado), color: "#A93226" },
              { label: "Financiado (banco)", value: totalFunding > 0 ? fmtK(totalFunding) : "—",
                color: totalFunding > 0 ? "#2C4A63" : "#9DA2A6",
                dica: "Entradas do banco geradas pelas despesas marcadas com 🏦 — neutralizam a saída no caixa do projeto" },
              { label: filtroAtivo ? `Saldo no fim do período` : "Saldo Projetado (3a)", value: fmtK(saldoProjetado), color: saldoProjetado >= 0 ? "#1F7A54" : "#A93226" },
            ].map((k, i) => (
              <div key={i} title={k.dica} style={{ background: "#fff", border: "1px solid #E7DED2", borderRadius: 12, padding: "14px 18px", borderTop: `3px solid ${k.color}` }}>
                <div style={{ fontSize: 10, color: "#9DA2A6", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", letterSpacing: "0.07em", marginBottom: 5 }}>{k.label}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: k.color, fontFamily: "var(--fonte-numero)" }}>{k.value}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Modal add pagamento */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 820, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontFamily: "var(--fonte-titulo)", color: "#091C2A" }}>
                {form.tipo === "entrada" ? "Recebimento Futuro" : "Pagamento Futuro"}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9DA2A6" }}>✕</button>
            </div>

            {/* Toggle tipo (Saída / Entrada) */}
            <div style={{ display: "flex", gap: 0, marginBottom: 16, background: "#E7DED2", borderRadius: 10, padding: 4, width: "fit-content" }}>
              <button onClick={() => setForm(f => ({ ...f, tipo: "saida" }))}
                style={{ background: form.tipo === "saida" ? "#A93226" : "transparent", color: form.tipo === "saida" ? "#fff" : "#7E8388", border: "none", padding: "8px 18px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                ↗ Saída (Pagamento)
              </button>
              <button onClick={() => setForm(f => ({ ...f, tipo: "entrada" }))}
                style={{ background: form.tipo === "entrada" ? "#1F7A54" : "transparent", color: form.tipo === "entrada" ? "#fff" : "#7E8388", border: "none", padding: "8px 18px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                ↙ Entrada (Recebimento)
              </button>
            </div>

            {/* Identificação */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)", textTransform: "uppercase" }}>Descrição *</label>
                <input type="text" value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="ex: Empreitada cofragens"
                  style={{ background: "#F9F5EF", border: "1px solid #EFE8DE", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)", textTransform: "uppercase" }}>Empresa</label>
                <select value={form.empresa} onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))}
                  style={{ background: "#F9F5EF", border: "1px solid #EFE8DE", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }}>
                  {EMPRESAS_CAIXA.filter(e => e.id !== "all").map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)", textTransform: "uppercase" }}>Categoria</label>
                <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  style={{ background: "#F9F5EF", border: "1px solid #EFE8DE", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }}>
                  {comOValorAtual(opcoesDeRubrica(form.empresa), form.categoria)
                    .map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)", textTransform: "uppercase" }}>Observação geral (opcional)</label>
                <input type="text" value={form.obs}
                  onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                  placeholder="Contexto deste pagamento (aplicado ao todo)"
                  style={{ background: "#F9F5EF", border: "1px solid #EFE8DE", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }} />
              </div>
            </div>

            {/* Gerador automático */}
            <div style={{ background: "#FAF6F0", borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#5C6166", fontFamily: "var(--fonte-numero)", marginBottom: 10 }}>
                🪄 GERAR AUTOMATICAMENTE (depois edita cada linha à mão)
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)" }}>Valor total (€)</label>
                  <input type="number" step="0.01" value={genValor} onChange={e => setGenValor(e.target.value)}
                    style={{ background: "#fff", border: "1px solid #E3D9CC", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", width: 140 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)" }}>1ª data</label>
                  <input type="date" value={genData} onChange={e => setGenData(e.target.value)}
                    style={{ background: "#fff", border: "1px solid #E3D9CC", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)" }}>Nº parcelas</label>
                  <input type="number" min={1} max={120} value={genN} onChange={e => setGenN(parseInt(e.target.value) || 1)}
                    style={{ background: "#fff", border: "1px solid #E3D9CC", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", width: 80 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)" }}>Intervalo</label>
                  <select value={genIntervalo} onChange={e => setGenIntervalo(e.target.value)}
                    style={{ background: "#fff", border: "1px solid #E3D9CC", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", width: 150 }}>
                    <option value="mensal">Mensal</option>
                    <option value="quinzenal">Quinzenal (15d)</option>
                    <option value="semanal">Semanal (7d)</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="anual">Anual</option>
                    <option value="personalizado">Personalizado…</option>
                  </select>
                </div>
                {genIntervalo === "personalizado" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)" }}>Dias</label>
                    <input type="number" min={1} value={genDias} onChange={e => setGenDias(parseInt(e.target.value) || 30)}
                      style={{ background: "#fff", border: "1px solid #E3D9CC", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", width: 80 }} />
                  </div>
                )}
                <button onClick={gerarParcelas} type="button"
                  style={{ background: "#091C2A", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  ⚡ Gerar / Refazer
                </button>
              </div>
            </div>

            {/* Tabela editável de parcelas */}
            {parcelasArr.length > 0 ? (
              <div style={{ border: "1px solid #E3D9CC", borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#FAF6F0" }}>
                      <th style={{ padding: "10px 8px", textAlign: "left", color: "#7E8388", fontWeight: 600, fontFamily: "var(--fonte-numero)", fontSize: 10, letterSpacing: 0.5, width: 50 }}>#</th>
                      <th style={{ padding: "10px 8px", textAlign: "left", color: "#7E8388", fontWeight: 600, fontFamily: "var(--fonte-numero)", fontSize: 10, letterSpacing: 0.5 }}>Data</th>
                      <th style={{ padding: "10px 8px", textAlign: "right", color: "#7E8388", fontWeight: 600, fontFamily: "var(--fonte-numero)", fontSize: 10, letterSpacing: 0.5 }}>Valor (€)</th>
                      <th style={{ padding: "10px 8px", textAlign: "left", color: "#7E8388", fontWeight: 600, fontFamily: "var(--fonte-numero)", fontSize: 10, letterSpacing: 0.5 }}>Observação</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcelasArr.map((p, i) => (
                      <tr key={i} style={{ borderTop: i > 0 ? "1px solid #E7DED2" : "none" }}>
                        <td style={{ padding: "6px 8px", color: "#7E8388", fontFamily: "var(--fonte-numero)" }}>{i + 1}/{parcelasArr.length}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <input type="date" value={p.data}
                            onChange={e => updateParcela(i, { data: e.target.value })}
                            title={p.data ? "" : "Data inválida ou vazia — verifica se o dia existe nesse mês"}
                            style={{ background: p.data ? "#F9F5EF" : "#FBEDEB", border: p.data ? "1px solid #EFE8DE" : "1px solid #f87171", borderRadius: 6, padding: "6px 8px", fontSize: 12, outline: "none", width: "100%" }} />
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <input type="number" step="0.01" value={p.valor}
                            onChange={e => updateParcela(i, { valor: e.target.value })}
                            style={{ background: "#F9F5EF", border: "1px solid #EFE8DE", borderRadius: 6, padding: "6px 8px", fontSize: 12, outline: "none", width: "100%", textAlign: "right", fontWeight: 700, fontFamily: "var(--fonte-numero)" }} />
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <input type="text" value={p.obs} placeholder="ex: sinal, à entrega…"
                            onChange={e => updateParcela(i, { obs: e.target.value })}
                            style={{ background: "#F9F5EF", border: "1px solid #EFE8DE", borderRadius: 6, padding: "6px 8px", fontSize: 12, outline: "none", width: "100%" }} />
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "center" }}>
                          <button onClick={() => removeParcela(i)} type="button"
                            style={{ background: "#FBEDEB", border: "1px solid #EFCFC9", color: "#A93226", padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#FBF7F1", borderTop: "2px solid #E3D9CC" }}>
                      <td colSpan={2} style={{ padding: "10px 8px", fontSize: 11, color: "#7E8388", fontFamily: "var(--fonte-numero)" }}>
                        Σ {parcelasArr.length} parcela(s)
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 800, fontFamily: "var(--fonte-numero)", color: "#091C2A" }}>{fmt(totalParcelas)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div style={{ background: "#FBF6EC", border: "1px dashed #E8D2AE", color: "#9C4A22", padding: 14, borderRadius: 10, fontSize: 12, marginBottom: 14, textAlign: "center" }}>
                Usa o gerador acima para criar as parcelas, ou adiciona uma manualmente abaixo.
              </div>
            )}

            <button onClick={addParcela} type="button"
              style={{ background: "none", border: "1px dashed #BAA685", color: "#BAA685", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 20 }}>
              + Adicionar parcela manualmente
            </button>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ background: "#E7DED2", color: "#5C6166", border: "none", padding: "10px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleAddPagamento}
                disabled={!form.descricao || parcelasArr.length === 0}
                style={{ background: (!form.descricao || parcelasArr.length === 0) ? "#9DA2A6" : "#091C2A", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 8, fontSize: 13, cursor: (!form.descricao || parcelasArr.length === 0) ? "default" : "pointer", fontWeight: 600 }}>
                Adicionar {parcelasArr.length > 1 ? `${parcelasArr.length} parcelas` : (form.tipo === "entrada" ? "recebimento" : "pagamento")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* A matriz: despesas × meses */}
      {view === "matriz" && (
        <div style={{ background: "#fff", border: "1px solid #E7DED2", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #E7DED2", fontWeight: 700, color: "#091C2A", fontSize: 13, fontFamily: "var(--fonte-titulo)" }}>
            Despesas × meses — {empObj.nome}
            <span style={{ fontWeight: 400, color: "#9DA2A6", fontSize: 11, marginLeft: 8 }}>
              {matriz.nLinhas} {matriz.nLinhas === 1 ? "despesa" : "despesas"} ·{" "}
              {matriz.colunas.length} {matriz.colunas.length === 1 ? "mês" : "meses"}
            </span>
          </div>
          <MatrizFluxo matriz={matriz} isAdmin={isAdmin} acoes={acoesDoItem}
            nMeses={mesesMatriz} onNMeses={setMesesMatriz} comVazios={mostrarVazios}
            onNovaDespesa={() => setShowForm(true)} />
        </div>
      )}

      {/* Cashflow table */}
      {view !== "matriz" && (
      <div style={{ background: "#fff", border: "1px solid #E7DED2", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E7DED2", fontWeight: 700, color: "#091C2A", fontSize: 13, fontFamily: "var(--fonte-titulo)" }}>
          Fluxo de Caixa — {empObj.nome} · {(dataInicio || dataFim)
            ? `${mesesFiltrados.length} ${mesesFiltrados.length === 1 ? "mês" : "meses"} filtrados`
            : view === "mensal"
              ? `${mesesFiltrados.length} ${mesesFiltrados.length === 1 ? "mês" : "meses"} com lançamentos`
              : "Próximos 3 anos"}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#FAF6F0" }}>
                {["Período", "Entradas", "Saídas", "Líquido", "Saldo Fim Mês", "Barra"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#9DA2A6", fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", borderBottom: "1px solid #E7DED2", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Linha de Vencidas (faturas com data_vencimento < mês atual e status != "Paga") */}
              {view === "mensal" && (vencidas.saidas > 0 || vencidas.entradas > 0) && [
                <tr key="vencidas-row"
                  onClick={() => setExpandedMes(expandedMes === "__vencidas__" ? null : "__vencidas__")}
                  style={{ borderBottom: "2px solid #A93226", cursor: "pointer", background: "#FBEDEB" }}>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--fonte-numero)", fontWeight: 700, color: "#A93226", whiteSpace: "nowrap" }}>
                    {expandedMes === "__vencidas__" ? "▼ " : "▶ "}⚠️ Vencidas ({vencidas.items.length})
                  </td>
                  <td style={{ padding: "10px 16px", color: "#1F7A54", fontFamily: "var(--fonte-numero)", fontWeight: vencidas.entradas > 0 ? 700 : 400 }}>
                    {vencidas.entradas > 0 ? "+" + fmtK(vencidas.entradas).replace("-", "") : "—"}
                  </td>
                  <td style={{ padding: "10px 16px", color: "#A93226", fontFamily: "var(--fonte-numero)", fontWeight: 700 }}>
                    {fmtK(-vencidas.saidas)}
                  </td>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--fonte-numero)", fontWeight: 700, color: (vencidas.entradas - vencidas.saidas) >= 0 ? "#1F7A54" : "#A93226" }}>
                    {fmtK(vencidas.entradas - vencidas.saidas)}
                  </td>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--fonte-numero)", color: "#7E8388", fontStyle: "italic" }}>
                    (pendente)
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ background: "#A93226", height: 6, width: Math.min(100, (vencidas.saidas / maxAbs) * 100) + "%", borderRadius: 3, opacity: 0.8 }}></div>
                  </td>
                </tr>,
                ...(expandedMes === "__vencidas__" ? vencidas.items.map((item, j) => (
                  <tr key={`venc_${j}`} style={{ background: "#FDF3F1", borderBottom: "1px solid #E7DED2" }}>
                    <td style={{ padding: "7px 16px 7px 32px", color: "#A93226", fontSize: 11, fontWeight: 600 }}>
                      {fmtDate(item.vencimento)} ⚠
                    </td>
                    <td colSpan={2} style={{ padding: "7px 16px", color: "#3A4044", fontSize: 11 }}>
                      <span style={{ background: (item.natureza || "previsto") === "real" ? "#E6EDF3" : "#F6ECD6", color: (item.natureza || "previsto") === "real" ? "#2C4A63" : "#96702A", fontSize: 9, padding: "1px 5px", borderRadius: 3, marginRight: 6, fontFamily: "var(--fonte-numero)" }}>{(item.natureza || "previsto") === "real" ? "REAL" : "PREV"}</span><span style={{ background: (item.natureza || "previsto") === "real" ? "#E6EDF3" : "#F6ECD6", color: (item.natureza || "previsto") === "real" ? "#2C4A63" : "#96702A", fontSize: 9, padding: "1px 5px", borderRadius: 3, marginRight: 6, fontFamily: "var(--fonte-numero)" }}>{(item.natureza || "previsto") === "real" ? "REAL" : "PREV"}</span><span style={{ color: "#7E8388", marginRight: 6 }}>{item.origem}</span>{item.desc || "—"}
                    </td>
                    <td colSpan={2} style={{ padding: "7px 16px", fontFamily: "var(--fonte-numero)", fontSize: 11, color: item.tipo === "entrada" ? "#1F7A54" : "#A93226", fontWeight: 600 }}>
                      {item.tipo === "entrada" ? "+" : "-"}{fmtFull(item.valor || 0)}
                    </td>
                    <td style={{ padding: "7px 16px" }}>
                      <AcoesDoItem item={item} isAdmin={isAdmin} acoes={acoesDoItem}
                        corDaCategoria="#F6DED9" corDoTexto="#A93226" />
                    </td>
                  </tr>
                )) : [])
              ]}

              {(view === "mensal" ? mesesFiltrados : anoGroups).map((m, i) => {
                const isNegativo = m.saldo_fim < 0;
                const isExpanded = expandedMes === (m.key || m.ano);
                return (
                  <React.Fragment key={m.key || m.ano || i}>
                    <tr
                      onClick={() => setExpandedMes(isExpanded ? null : (m.key || m.ano))}
                      style={{ borderBottom: "1px solid #FBF7F1", cursor: m.items?.length > 0 ? "pointer" : "default", background: isNegativo ? "#FDF3F1" : i % 2 === 0 ? "#fff" : "#FBF7F1" }}
                      onMouseEnter={e => { if (!isNegativo) e.currentTarget.style.background = "#EDF1F5"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isNegativo ? "#FDF3F1" : i % 2 === 0 ? "#fff" : "#FBF7F1"; }}>
                      <td style={{ padding: "10px 16px", fontFamily: "var(--fonte-numero)", fontWeight: 600, color: "#091C2A", whiteSpace: "nowrap" }}>
                        {m.items?.length > 0 ? (isExpanded ? "▼ " : "▶ ") : "  "}{m.label || m.ano}
                      </td>
                      <td style={{ padding: "10px 16px", color: "#1F7A54", fontFamily: "var(--fonte-numero)", fontWeight: m.entradas > 0 ? 700 : 400 }}>
                        {m.entradas > 0 ? "+" + fmtK(m.entradas) : "—"}
                      </td>
                      <td style={{ padding: "10px 16px", color: m.saidas > 0 ? "#A93226" : "#9DA2A6", fontFamily: "var(--fonte-numero)", fontWeight: m.saidas > 0 ? 700 : 400 }}>
                        {m.saidas > 0 ? fmtK(-m.saidas) : "—"}
                      </td>
                      <td style={{ padding: "10px 16px", fontFamily: "var(--fonte-numero)", fontWeight: 700, color: m.liquido >= 0 ? "#1F7A54" : "#A93226" }}>
                        {m.liquido >= 0 ? "+" + fmtK(m.liquido) : fmtK(m.liquido)}
                      </td>
                      <td style={{ padding: "10px 16px", fontFamily: "var(--fonte-numero)", fontWeight: 700, color: isNegativo ? "#A93226" : "#091C2A" }}>
                        {isNegativo ? "⚠ " : ""}{fmtK(m.saldo_fim)}
                      </td>
                      <td style={{ padding: "10px 16px", minWidth: 120 }}>
                        <div style={{ display: "flex", gap: 2, height: 14, alignItems: "center" }}>
                          {m.entradas > 0 && <div style={{ width: `${(m.entradas / maxAbs) * 60}px`, height: 8, background:"#091C2A", borderRadius: 2, opacity: 0.8 }} />}
                          {m.saidas > 0 && <div style={{ width: `${(m.saidas / maxAbs) * 60}px`, height: 8, background: "#A93226", borderRadius: 2, opacity: 0.8 }} />}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && m.items?.map((item, j) => (
                      <tr key={`${i}_${j}`} style={{ background: "#FAF6F0", borderBottom: "1px solid #E7DED2" }}>
                        <td style={{ padding: "7px 16px 7px 32px", color: "#7E8388", fontSize: 11 }}>{item.origem}</td>
                        <td colSpan={2} style={{ padding: "7px 16px", color: "#3A4044", fontSize: 11 }}>{item.desc}</td>
                        <td colSpan={2} style={{ padding: "7px 16px", fontFamily: "var(--fonte-numero)", fontSize: 11, color: item.tipo === "entrada" ? "#1F7A54" : "#A93226", fontWeight: 600 }}>
                          {item.tipo === "entrada" ? "+" : "-"}{fmtFull(item.valor)}
                        </td>
                        <td style={{ padding: "7px 16px" }}>
                          <AcoesDoItem item={item} isAdmin={isAdmin} acoes={acoesDoItem} />
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Painel de aproximação em lote */}
      {recorrentesAberto && (
        <ModalRecorrentes
          empresa={empresa} nomeEmpresa={nomeDaEmpresa}
          recorrentes={recorrentes} currentUser={currentUser}
          onGuardar={guardarRecorrente} onApagar={apagarRecorrente}
          onFechar={() => setRecorrentesAberto(false)} />
      )}

      {planoAberto && (
        <ModalPlanoObra
          empresa={empresa} grupo={grupoDaEmpresa} nomeEmpresa={nomeDaEmpresa}
          plano={planoDaEmpresa} faturas={faturas} pagamentos={pagamentosExtras}
          contaIds={contasDaEmpresa}
          currentUser={currentUser}
          onGuardar={guardarPlano}
          onAplicar={aplicarPlanoObra}
          onFechar={() => setPlanoAberto(false)} />
      )}

      {aproximar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 215, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setAproximar(false); }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 26, width: 940, maxWidth: "96vw", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--fonte-titulo)", color: "#091C2A" }}>
              Aproximar previsões a faturas
            </div>
            <div style={{ fontSize: 12, color: "#7E8388", margin: "5px 0 16px", lineHeight: 1.5 }}>
              Para cada despesa prevista procurámos a fatura por pagar mais parecida, comparando valor,
              data e descrição. Escolhe a fatura correta (ou deixa em branco) e confirma — as previsões
              marcadas saem do fluxo e ficam só as faturas, sem duplicar valores.
            </div>

            <div style={{ flex: 1, overflowY: "auto", border: "1px solid #EFE8DE", borderRadius: 10 }}>
              {sugestoes.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "#9DA2A6" }}>
                  Não há despesas previstas em aberto.
                </div>
              ) : sugestoes.map(({ pagamento: p, ranking }) => {
                const escolhido = escolhas[p.id] || "";
                const conf = ranking[0]?.score || 0;
                const nivel = conf >= 0.75 ? { txt: "provável", cor: "#1F7A54", fundo: "#E2EFE8" }
                  : conf >= 0.45 ? { txt: "possível", cor: "#96702A", fundo: "#F6ECD6" }
                  : { txt: "sem par claro", cor: "#9DA2A6", fundo: "#F2EDE5" };
                return (
                  <div key={p.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #F7F2EA", background: escolhido ? "#EFF5F1" : "#fff" }}>
                    <div style={{ flex: "1 1 40%", minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#091C2A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.descricao}
                      </div>
                      <div style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)", marginTop: 2 }}>
                        {fmtFull(p.valor)} · {fmtDate(p.data_inicio)} · {labelEmpresa(p.empresa)}
                      </div>
                    </div>
                    <span style={{ background: nivel.fundo, color: nivel.cor, fontSize: 10, padding: "3px 9px", borderRadius: 20, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {nivel.txt}
                    </span>
                    <div style={{ flex: "1 1 45%", minWidth: 0 }}>
                      <select value={escolhido} onChange={e => setEscolhas(x => ({ ...x, [p.id]: e.target.value }))}
                        style={{ width: "100%", background: "#F9F5EF", border: "1px solid #e4e4ea", borderRadius: 8, padding: "8px 10px", fontSize: 11, outline: "none" }}>
                        <option value="">— não converter —</option>
                        {ranking.map(({ fatura: f, score }) => (
                          <option key={f.id} value={f.id}>
                            {(f.fornecedor || f.fatura || "—").slice(0, 46)} · {fmtFull(f.valor)} · venc. {fmtDate(f.vencimento)} ({Math.round(score * 100)}%)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <div style={{ fontSize: 12, color: "#7E8388" }}>
                {Object.values(escolhas).filter(Boolean).length} de {sugestoes.length} marcadas para converter
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setAproximar(false); setEscolhas({}); }}
                  style={{ background: "#E7DED2", border: "none", color: "#5C6166", padding: "10px 18px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={aplicarAproximacoes} disabled={aAplicar || !Object.values(escolhas).filter(Boolean).length}
                  style={{ background: Object.values(escolhas).filter(Boolean).length ? "#091C2A" : "#D8CCBB", border: "none", color: "#fff", padding: "10px 20px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                  {aAplicar ? "A converter…" : "Converter marcadas"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal converter previsão em custo real */}
      {converter && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setConverter(null); }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 26, width: 620, maxHeight: "84vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "var(--fonte-titulo)", color: "#091C2A", marginBottom: 4 }}>
              Converter previsão em custo real
            </div>
            <div style={{ fontSize: 12, color: "#7E8388", marginBottom: 16, lineHeight: 1.5 }}>
              <strong style={{ color: "#3A4044" }}>{converter.descricao}</strong> · {fmtFull(converter.valor)} · {fmtDate(converter.data_inicio)}
              <br />A previsão sai do fluxo para não somar em duplicado com a fatura.
            </div>

            {candidatasFatura(converter).length > 0 ? (
              <>
                <div style={{ fontSize: 11, color: "#7E8388", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--fonte-numero)", marginBottom: 8 }}>
                  Faturas por pagar que podem corresponder
                </div>
                <div style={{ border: "1px solid #EFE8DE", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                  {candidatasFatura(converter).map(f => {
                    const dif = (parseFloat(f.valor) || 0) - (parseFloat(converter.valor) || 0);
                    return (
                      <div key={f.id} onClick={() => handleConverter(converter, f)}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid #F7F2EA", cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#EDF1F5"}
                        onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: "#091C2A", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {f.fornecedor || f.fatura || "—"}
                          </div>
                          <div style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)" }}>
                            {f.fatura ? f.fatura + " · " : ""}venc. {fmtDate(f.vencimento)} · {f.categoria || "—"}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <div style={{ fontSize: 12, fontFamily: "var(--fonte-numero)", fontWeight: 700, color: "#091C2A" }}>{fmtFull(f.valor)}</div>
                          <div style={{ fontSize: 10, fontFamily: "var(--fonte-numero)", color: Math.abs(dif) < 0.005 ? "#1F7A54" : "#96702A" }}>
                            {Math.abs(dif) < 0.005 ? "valor igual" : (dif > 0 ? "+" : "") + fmtFull(dif)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{ background: "#FBF6EC", border: "1px solid #E3CE9F", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#8A6727", marginBottom: 16, lineHeight: 1.5 }}>
                Não há faturas por pagar desta empresa com vencimento próximo. Importa a fatura
                primeiro (Importar → Fatura) e volta aqui, ou converte sem associar.
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setConverter(null)}
                style={{ background: "#E7DED2", border: "none", color: "#5C6166", padding: "9px 18px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={() => handleConverter(converter, null)}
                title="Retira a previsão do fluxo sem indicar qual a fatura"
                style={{ background: "#091C2A", border: "none", color: "#fff", padding: "9px 18px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                Converter sem associar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar pagamento manual */}
      {editPagamento && editForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 600, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontFamily: "var(--fonte-titulo)", color: "#091C2A" }}>Editar Pagamento</h2>
              <button onClick={closeEdit} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9DA2A6" }}>✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)", textTransform: "uppercase" }}>Descrição *</label>
                <input type="text" value={editForm.descricao}
                  onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))}
                  style={{ background: "#F9F5EF", border: "1px solid #EFE8DE", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)", textTransform: "uppercase" }}>Tipo</label>
                <select value={editForm.tipo} onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))}
                  style={{ background: "#F9F5EF", border: "1px solid #EFE8DE", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }}>
                  <option value="saida">Saída</option>
                  <option value="entrada">Entrada</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)", textTransform: "uppercase" }}>Valor (€)</label>
                <input type="number" step="0.01" value={editForm.valor}
                  onChange={e => setEditForm(f => ({ ...f, valor: e.target.value }))}
                  style={{ background: "#F9F5EF", border: "1px solid #EFE8DE", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "var(--fonte-numero)", fontWeight: 700 }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)", textTransform: "uppercase" }}>Data Início</label>
                <input type="date" value={editForm.data_inicio}
                  onChange={e => setEditForm(f => ({ ...f, data_inicio: e.target.value }))}
                  style={{ background: "#F9F5EF", border: "1px solid #EFE8DE", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)", textTransform: "uppercase" }}>Nº Parcelas</label>
                <input type="number" min={1} max={120} value={editForm.parcelas}
                  onChange={e => setEditForm(f => ({ ...f, parcelas: e.target.value }))}
                  style={{ background: "#F9F5EF", border: "1px solid #EFE8DE", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)", textTransform: "uppercase" }}>Periodicidade</label>
                <select value={editForm.periodicidade} onChange={e => setEditForm(f => ({ ...f, periodicidade: e.target.value }))}
                  style={{ background: "#F9F5EF", border: "1px solid #EFE8DE", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }}>
                  <option value="unica">Única</option>
                  <option value="mensal">Mensal</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)", textTransform: "uppercase" }}>Empresa</label>
                <select value={editForm.empresa} onChange={e => setEditForm(f => ({ ...f, empresa: e.target.value }))}
                  style={{ background: "#F9F5EF", border: "1px solid #EFE8DE", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }}>
                  {EMPRESAS_CAIXA.filter(e => e.id !== "all").map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>

              <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#9DA2A6", fontFamily: "var(--fonte-numero)", textTransform: "uppercase" }}>Categoria</label>
                <select value={editForm.categoria} onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value }))}
                  style={{ background: "#F9F5EF", border: "1px solid #EFE8DE", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }}>
                  {comOValorAtual(opcoesDeRubrica(form.empresa), form.categoria)
                    .map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 20, padding: 12, background: "#FBF6EC", border: "1px solid #E3CE9F", borderRadius: 8, fontSize: 11, color: "#7A5A22", lineHeight: 1.5 }}>
              💡 Este pagamento foi criado como parcela única. Aqui podes ajustar o valor, a data, ou transformá-lo num pagamento recorrente (mensal/trimestral/anual).
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
              <button onClick={() => { handleDeletePagamento(editPagamento); closeEdit(); }}
                style={{ background: "#FBEDEB", color: "#A93226", border: "1px solid #EFCFC9", padding: "10px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                ✕ Eliminar
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={closeEdit} style={{ background: "#E7DED2", color: "#5C6166", border: "none", padding: "10px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
                <button onClick={handleSaveEdit}
                  style={{ background: "#091C2A", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                  Guardar alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
