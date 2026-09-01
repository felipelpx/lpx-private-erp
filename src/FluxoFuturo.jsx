import React, { useState, useMemo, useEffect } from "react";
import { useVendas, useSaldosAtuais } from "./hooks.js";
import { CATEGORIAS } from "./categorias.js";
import { EMPRESAS as EMPRESAS_CFG, EMPRESAS as EMPRESAS_TODAS } from "./empresas.js";
import { fmtEUR, fmtEUR0, fmtInt } from "./formato.js";

const fmt = (v) => fmtEUR0(v);
// Valor exato com 2 casas decimais (para parcelas individuais)
const fmtFull = (v) => fmtEUR(v);
// Formato pt-PT com 2 decimais para todos os valores monetários no Fluxo Futuro.
// (Antes este helper devolvia "1,3k €" ou "1,30M €"; agora sempre "1 234,56 €")
const fmtK = (v) => {
  return fmtEUR(v);
};
const fmtDate = (s) => {
  if (!s || typeof s !== "string" || s.length < 10) return s || "";
  const m = s.substring(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
};

// Fallback caso o App não passe EMPRESAS — ver src/empresas.js
const EMPRESAS_FALLBACK = EMPRESAS_CFG;

// Mapeia o nome do projeto (usado nas frações/vendas) para o id da empresa.
// Deriva automaticamente de src/empresas.js — basta manter o campo `projeto` alinhado.
const PROJETO_EMPRESA_MAP = Object.fromEntries(
  EMPRESAS_CFG.map(e => [e.projeto || e.nome, e.id])
);
const EMPRESA_DEFAULT = EMPRESAS_CFG[0]?.id || "";


export default function FluxoFuturo({ faturas: faturasTodas, faturasLoading, pagamentosExtras: pagamentosTodos, pagamentosLoading, onAddPagamento, onUpdatePagamento, onDeletePagamento, onUpdateFatura, onDeleteFatura, currentUser, EMPRESAS, caixaUnico }) {
  // Só as empresas visíveis (filtro de grupo / investidor). Itens cuja empresa
  // não corresponde a nenhuma empresa conhecida ficam visíveis para admin e
  // gestor — caso contrário desapareciam do sistema sem aviso.
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
  // Editar, marcar como pago e eliminar: admin e gestor.
  // (Antes era só admin, o que deixava os gestores sem poder corrigir nada.)
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
  const [showForm, setShowForm] = useState(false);
  // Form simples (descrição, empresa, categoria, observação, tipo)
  const [form, setForm] = useState({
    descricao: "", empresa: "", categoria: "Obra", obs: "", tipo: "saida"
  });
  // Define empresa default no form quando a lista ficar disponível
  useEffect(() => {
    if (!form.empresa && EMPRESAS_CAIXA.length > 1) {
      setForm(f => ({ ...f, empresa: EMPRESAS_CAIXA[1].id }));
    }
  }, [EMPRESAS_CAIXA, form.empresa]);

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

  // ─── Editar uma FATURA diretamente a partir do fluxo ───────────────────────
  // As linhas com origem em Contas a Pagar (incluindo as vencidas) não tinham
  // forma de ser corrigidas sem sair deste ecrã.
  const [editFatura, setEditFatura] = useState(null);
  const [editFaturaForm, setEditFaturaForm] = useState(null);

  const openEditFatura = (fat) => {
    setEditFatura(fat);
    setEditFaturaForm({
      fornecedor: fat.fornecedor || "",
      categoria: fat.categoria || "",
      valor: fat.valor ?? "",
      vencimento: fat.vencimento || "",
      status: fat.status || "Pendente",
      obs: fat.obs || "",
    });
  };
  const closeEditFatura = () => { setEditFatura(null); setEditFaturaForm(null); };
  const handleSaveEditFatura = async () => {
    if (!editFatura || !editFaturaForm) return;
    if (!editFaturaForm.vencimento) { alert("Indica a data de vencimento."); return; }
    const res = await onUpdateFatura?.(editFatura.id, {
      ...editFatura,
      fornecedor: editFaturaForm.fornecedor,
      categoria: editFaturaForm.categoria,
      valor: parseFloat(String(editFaturaForm.valor).replace(",", ".")) || 0,
      vencimento: editFaturaForm.vencimento,
      status: editFaturaForm.status,
      obs: editFaturaForm.obs,
    });
    if (res?.error) { alert("Erro a guardar:\n\n" + (res.error.message || res.error)); return; }
    closeEditFatura();
  };
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

  // VENDAS — marcar como pago/recebido = zerar o campo correspondente
  const handleMarkVendaItemPaid = async (venda, vendaTipo) => {
    if (!updateVenda) return;
    const updates = {};
    if (vendaTipo === "falta_receber") updates.falta_receber = 0;
    else if (vendaTipo === "comissao_sinal") updates.comissao_pendente_sinal = 0;
    else if (vendaTipo === "comissao_escritura") updates.comissao_pendente_escritura = 0;
    else return;
    const res = await updateVenda(venda.id, updates);
    if (res?.error) {
      alert("Erro ao marcar como pago:\n\n" + (res.error.message || res.error));
    }
  };
  const handleMarkFaturaPaid = async (fat) => {
    if (!onUpdateFatura) return;
    const res = await onUpdateFatura(fat.id, { status: "Paga" });
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
    if (!f.vencimento) return;
    if (empresa !== "all" && f.empresa !== empresa) return;
    if (f.status === "Paga") return;
    const key = getMesKey(f.vencimento);
    // Se a fatura já está marcada como Vencida, ou se a data passou (independentemente do mês) → bucket "vencidas"
    if (f.status === "Vencida" || f.vencimento < hojeISO) {
      vencidas.saidas += parseFloat(f.valor) || 0;
      vencidas.items.push({
        tipo: "saida",
        desc: f.fornecedor || f.fatura,
        valor: f.valor,
        cat: f.categoria,
        origem: "Vencida",
        vencimento: f.vencimento,
        fatura: f,
      });
      return;
    }
    const m = meses.find(m => m.key === key);
    if (m) {
      m.saidas += parseFloat(f.valor) || 0;
      m.items.push({ tipo: "saida", desc: f.fornecedor || f.fatura, valor: f.valor, cat: f.categoria, origem: "Contas a Pagar", fatura: f });
    }
  });

  // Add vendas receivables (entradas)
  vendas.forEach(v => {
    const projEmpMap = PROJETO_EMPRESA_MAP;
    const empId = projEmpMap[v.projeto];
    if (empresa !== "all" && empId !== empresa) return;
    // A receber na escritura
    if (v.falta_receber > 0 && v.previsao_escritura) {
      const key = getMesKey(v.previsao_escritura);
      if (v.previsao_escritura < hojeISO) {
        vencidas.entradas += v.falta_receber;
        vencidas.items.push({ tipo: "entrada", desc: `${v.fracao} - ${v.cliente}`, valor: v.falta_receber, cat: "Vendas", origem: "Recebível Escritura", vencimento: v.previsao_escritura, venda: v, vendaTipo: "falta_receber" });
      } else {
        const m = meses.find(m => m.key === key);
        if (m) {
          m.entradas += v.falta_receber;
          m.items.push({ tipo: "entrada", desc: `${v.fracao} - ${v.cliente}`, valor: v.falta_receber, cat: "Vendas", origem: "Recebível Escritura", venda: v, vendaTipo: "falta_receber" });
        }
      }
    }
    // Comissão pendente sinal
    if (v.comissao_pendente_sinal > 0 && v.data_pagamento_sinal) {
      const key = getMesKey(v.data_pagamento_sinal);
      if (v.data_pagamento_sinal < hojeISO) {
        vencidas.saidas += v.comissao_pendente_sinal;
        vencidas.items.push({ tipo: "saida", desc: `Comissão sinal - ${v.fracao}`, valor: v.comissao_pendente_sinal, cat: "Comissão", origem: "Comissão Pendente", vencimento: v.data_pagamento_sinal, venda: v, vendaTipo: "comissao_sinal" });
      } else {
        const m = meses.find(m => m.key === key);
        if (m) {
          m.saidas += v.comissao_pendente_sinal;
          m.items.push({ tipo: "saida", desc: `Comissão sinal - ${v.fracao}`, valor: v.comissao_pendente_sinal, cat: "Comissão", origem: "Comissão Pendente", venda: v, vendaTipo: "comissao_sinal" });
        }
      }
    }
    // Comissão pendente escritura
    if (v.comissao_pendente_escritura > 0 && v.data_pagamento_escritura) {
      const key = getMesKey(v.data_pagamento_escritura);
      if (v.data_pagamento_escritura < hojeISO) {
        vencidas.saidas += v.comissao_pendente_escritura;
        vencidas.items.push({ tipo: "saida", desc: `Comissão escritura - ${v.fracao}`, valor: v.comissao_pendente_escritura, cat: "Comissão", origem: "Comissão Pendente", vencimento: v.data_pagamento_escritura, venda: v, vendaTipo: "comissao_escritura" });
      } else {
        const m = meses.find(m => m.key === key);
        if (m) {
          m.saidas += v.comissao_pendente_escritura;
          m.items.push({ tipo: "saida", desc: `Comissão escritura - ${v.fracao}`, valor: v.comissao_pendente_escritura, cat: "Comissão", origem: "Comissão Pendente", venda: v, vendaTipo: "comissao_escritura" });
        }
      }
    }
  });

  // Add pagamentos extras manuais
  (pagamentosExtras || []).forEach(p => {
    if (empresa !== "all" && p.empresa !== empresa) return;
    // Pagamentos já marcados como pagos não entram no fluxo (já saíram da conta real)
    if (p.status === "Paga" || p.status === "Pago") return;
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
        pagamentoId: p.id,
        pagamento: p,
      };

      // Se a parcela cai antes de hoje → bucket "vencidas"
      if (dataParcelaISO < hojeISO) {
        if (p.tipo === "entrada") {
          vencidas.entradas += valor;
          vencidas.items.push({ ...base, tipo: "entrada", vencimento: dataParcelaISO });
        } else {
          vencidas.saidas += valor;
          vencidas.items.push({ ...base, tipo: "saida", vencimento: dataParcelaISO });
        }
        continue;
      }

      const m = meses.find(m => m.key === key);
      if (m) {
        if (p.tipo === "entrada") {
          m.entradas += valor;
          m.items.push({ ...base, tipo: "entrada" });
        } else {
          m.saidas += valor;
          m.items.push({ ...base, tipo: "saida" });
        }
      }
    }
  });

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
  const [view, setView] = useState("mensal"); // mensal | anual
  // Filtros de data (formato YYYY-MM, mensal)
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  // Aplicar filtro de data aos meses para visualização (saldo acumulado mantém-se cumulativo desde o início)
  const mesesFiltrados = useMemo(() => {
    if (!dataInicio && !dataFim) return mesesComSaldo;
    return mesesComSaldo.filter(m => {
      if (dataInicio && m.key < dataInicio) return false;
      if (dataFim && m.key > dataFim) return false;
      return true;
    });
  }, [mesesComSaldo, dataInicio, dataFim]);

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
  const dateToISO = (d) => d.toISOString().slice(0,10);
  const addStep = (d, intervalo, dias) => {
    if (intervalo === "mensal") return new Date(d.getFullYear(), d.getMonth()+1, d.getDate());
    if (intervalo === "trimestral") return new Date(d.getFullYear(), d.getMonth()+3, d.getDate());
    if (intervalo === "anual") return new Date(d.getFullYear()+1, d.getMonth(), d.getDate());
    const days = intervalo === "semanal" ? 7
              : intervalo === "quinzenal" ? 15
              : (parseInt(dias) || 30);
    return new Date(d.getTime() + days * 86400000);
  };
  const gerarParcelas = () => {
    const n = Math.max(1, Math.min(120, parseInt(genN) || 1));
    const total = parseFloat(genValor) || 0;
    const cents = Math.round(total * 100);
    const baseCents = Math.floor(cents / n);
    const remainder = cents - baseCents * n;
    const venc0 = genData || new Date().toISOString().slice(0,10);
    let d = new Date(venc0 + "T00:00:00");
    const novo = [];
    for (let i = 0; i < n; i++) {
      const v = i === 0 ? (baseCents + remainder) / 100 : baseCents / 100;
      novo.push({ data: dateToISO(d), valor: v, obs: "" });
      d = addStep(d, genIntervalo, genDias);
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
    if (parcelasArr.some(p => !p.data)) { alert("Todas as parcelas precisam de data."); return; }

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
    setForm({ descricao: "", empresa: EMPRESA_DEFAULT, categoria: "Obra", obs: "", tipo: "saida" });
    setParcelasArr([]);
    setGenValor(""); setGenData(""); setGenN(1); setGenIntervalo("mensal"); setGenDias(30);
  };

  const maxAbs = Math.max(...mesesComSaldo.map(m => Math.max(m.entradas, m.saidas)), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: "'DM Sans', sans-serif" }}>

      {/* Banner de loading global — mostra enquanto algum hook ainda não terminou. */}
      {stillLoading && (
        <div style={{ background: "linear-gradient(90deg, #fef3c7 0%, #fde68a 50%, #fef3c7 100%)", backgroundSize: "200% 100%", animation: "lpx-shimmer 1.4s linear infinite", border: "1px solid #fcd34d", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#92400e", fontWeight: 600 }}>
          <div style={{ width: 14, height: 14, border: "2px solid #92400e", borderTopColor: "transparent", borderRadius: "50%", animation: "lpx-spin 0.8s linear infinite" }} />
          A carregar dados do Supabase…
          <span style={{ color: "#a16207", fontWeight: 400 }}>
            ({[pagamentosLoading && "pagamentos", faturasLoading && "faturas", vendasLoading && "vendas"].filter(Boolean).join(", ")})
          </span>
          <style>{`
            @keyframes lpx-spin { to { transform: rotate(360deg); } }
            @keyframes lpx-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
          `}</style>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {EMPRESAS_CAIXA.map(e => (
            <button key={e.id} onClick={() => setEmpresa(e.id)}
              style={{ background: empresa === e.id ? "#1a1a2e" : "#fff", color: empresa === e.id ? "#fff" : "#666", border: `1px solid ${empresa === e.id ? "#1a1a2e" : "#eee"}`, padding: "7px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: empresa === e.id ? 700 : 400 }}>
              {e.nome}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {["mensal", "anual"].map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ background: view === v ? "#1a1a2e" : "#f0f0f0", color: view === v ? "#fff" : "#666", border: "none", padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
              {v === "mensal" ? "Mensal" : "Anual"}
            </button>
          ))}
          {view === "mensal" && (
            <>
              <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>De:</span>
              <input type="month" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                style={{ background: "#f0f0f0", border: "none", padding: "6px 8px", borderRadius: 8, fontSize: 11, fontFamily: "monospace", color: "#1a1a2e" }} />
              <span style={{ fontSize: 11, color: "#888" }}>Até:</span>
              <input type="month" value={dataFim} onChange={e => setDataFim(e.target.value)}
                style={{ background: "#f0f0f0", border: "none", padding: "6px 8px", borderRadius: 8, fontSize: 11, fontFamily: "monospace", color: "#1a1a2e" }} />
              {(dataInicio || dataFim) && (
                <button onClick={() => { setDataInicio(""); setDataFim(""); }}
                  title="Limpar filtros de data"
                  style={{ background: "#fee2e2", color: "#dc2626", border: "none", padding: "4px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", fontWeight: 600 }}>✕</button>
              )}
            </>
          )}
          <button onClick={() => setShowForm(true)}
            style={{ background: "#16a34a", color: "#fff", border: "none", padding: "7px 18px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
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
          : "36m";
        const saldoProjetado = ultimoMesFiltrado?.saldo_fim || 0;
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            {[
              { label: "Caixa Atual", value: fmt(saldoAtual), color: saldoAtual >= 0 ? "#16a34a" : "#dc2626" },
              { label: `Vencidas (${vencidas.items.length})`, value: vencidas.saidas > 0 ? fmtK(-vencidas.saidas) : "—", color: vencidas.saidas > 0 ? "#dc2626" : "#aaa", warn: vencidas.saidas > 0 },
              { label: "Caixa Líquido", value: fmt(saldoLiquido), color: saldoLiquido >= 0 ? "#16a34a" : "#dc2626" },
              { label: `Total Saídas (${labelPeriodo})`, value: fmtK(totalSaidasFiltrado), color: "#dc2626" },
              { label: filtroAtivo ? `Saldo no fim do período` : "Saldo Projetado (3a)", value: fmtK(saldoProjetado), color: saldoProjetado >= 0 ? "#16a34a" : "#dc2626" },
            ].map((k, i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: "14px 18px", borderTop: `3px solid ${k.color}` }}>
                <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", letterSpacing: "0.07em", marginBottom: 5 }}>{k.label}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: k.color, fontFamily: "monospace" }}>{k.value}</div>
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
              <h2 style={{ margin: 0, fontSize: 18, fontFamily: "Georgia,serif", color: "#1a1a2e" }}>
                {form.tipo === "entrada" ? "Recebimento Futuro" : "Pagamento Futuro"}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#aaa" }}>✕</button>
            </div>

            {/* Toggle tipo (Saída / Entrada) */}
            <div style={{ display: "flex", gap: 0, marginBottom: 16, background: "#f0f0f0", borderRadius: 10, padding: 4, width: "fit-content" }}>
              <button onClick={() => setForm(f => ({ ...f, tipo: "saida" }))}
                style={{ background: form.tipo === "saida" ? "#dc2626" : "transparent", color: form.tipo === "saida" ? "#fff" : "#888", border: "none", padding: "8px 18px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                ↗ Saída (Pagamento)
              </button>
              <button onClick={() => setForm(f => ({ ...f, tipo: "entrada" }))}
                style={{ background: form.tipo === "entrada" ? "#16a34a" : "transparent", color: form.tipo === "entrada" ? "#fff" : "#888", border: "none", padding: "8px 18px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                ↙ Entrada (Recebimento)
              </button>
            </div>

            {/* Identificação */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase" }}>Descrição *</label>
                <input type="text" value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="ex: Empreitada cofragens"
                  style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase" }}>Empresa</label>
                <select value={form.empresa} onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))}
                  style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }}>
                  {EMPRESAS_CAIXA.filter(e => e.id !== "all").map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase" }}>Categoria</label>
                <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }}>
                  {CATEGORIAS.map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase" }}>Observação geral (opcional)</label>
                <input type="text" value={form.obs}
                  onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                  placeholder="Contexto deste pagamento (aplicado ao todo)"
                  style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }} />
              </div>
            </div>

            {/* Gerador automático */}
            <div style={{ background: "#f8f9fc", borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#666", fontFamily: "monospace", marginBottom: 10 }}>
                🪄 GERAR AUTOMATICAMENTE (depois edita cada linha à mão)
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace" }}>Valor total (€)</label>
                  <input type="number" step="0.01" value={genValor} onChange={e => setGenValor(e.target.value)}
                    style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", width: 140 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace" }}>1ª data</label>
                  <input type="date" value={genData} onChange={e => setGenData(e.target.value)}
                    style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace" }}>Nº parcelas</label>
                  <input type="number" min={1} max={120} value={genN} onChange={e => setGenN(parseInt(e.target.value) || 1)}
                    style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", width: 80 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace" }}>Intervalo</label>
                  <select value={genIntervalo} onChange={e => setGenIntervalo(e.target.value)}
                    style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", width: 150 }}>
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
                    <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace" }}>Dias</label>
                    <input type="number" min={1} value={genDias} onChange={e => setGenDias(parseInt(e.target.value) || 30)}
                      style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", width: 80 }} />
                  </div>
                )}
                <button onClick={gerarParcelas} type="button"
                  style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  ⚡ Gerar / Refazer
                </button>
              </div>
            </div>

            {/* Tabela editável de parcelas */}
            {parcelasArr.length > 0 ? (
              <div style={{ border: "1px solid #e8e8e8", borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f8f9fc" }}>
                      <th style={{ padding: "10px 8px", textAlign: "left", color: "#888", fontWeight: 600, fontFamily: "monospace", fontSize: 10, letterSpacing: 0.5, width: 50 }}>#</th>
                      <th style={{ padding: "10px 8px", textAlign: "left", color: "#888", fontWeight: 600, fontFamily: "monospace", fontSize: 10, letterSpacing: 0.5 }}>Data</th>
                      <th style={{ padding: "10px 8px", textAlign: "right", color: "#888", fontWeight: 600, fontFamily: "monospace", fontSize: 10, letterSpacing: 0.5 }}>Valor (€)</th>
                      <th style={{ padding: "10px 8px", textAlign: "left", color: "#888", fontWeight: 600, fontFamily: "monospace", fontSize: 10, letterSpacing: 0.5 }}>Observação</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcelasArr.map((p, i) => (
                      <tr key={i} style={{ borderTop: i > 0 ? "1px solid #f0f0f0" : "none" }}>
                        <td style={{ padding: "6px 8px", color: "#888", fontFamily: "monospace" }}>{i + 1}/{parcelasArr.length}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <input type="date" value={p.data}
                            onChange={e => updateParcela(i, { data: e.target.value })}
                            style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 6, padding: "6px 8px", fontSize: 12, outline: "none", width: "100%" }} />
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <input type="number" step="0.01" value={p.valor}
                            onChange={e => updateParcela(i, { valor: e.target.value })}
                            style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 6, padding: "6px 8px", fontSize: 12, outline: "none", width: "100%", textAlign: "right", fontWeight: 700, fontFamily: "monospace" }} />
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <input type="text" value={p.obs} placeholder="ex: sinal, à entrega…"
                            onChange={e => updateParcela(i, { obs: e.target.value })}
                            style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 6, padding: "6px 8px", fontSize: 12, outline: "none", width: "100%" }} />
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "center" }}>
                          <button onClick={() => removeParcela(i)} type="button"
                            style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#fafafa", borderTop: "2px solid #e8e8e8" }}>
                      <td colSpan={2} style={{ padding: "10px 8px", fontSize: 11, color: "#888", fontFamily: "monospace" }}>
                        Σ {parcelasArr.length} parcela(s)
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 800, fontFamily: "monospace", color: "#1a1a2e" }}>{fmt(totalParcelas)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div style={{ background: "#fff7ed", border: "1px dashed #fed7aa", color: "#c2410c", padding: 14, borderRadius: 10, fontSize: 12, marginBottom: 14, textAlign: "center" }}>
                Usa o gerador acima para criar as parcelas, ou adiciona uma manualmente abaixo.
              </div>
            )}

            <button onClick={addParcela} type="button"
              style={{ background: "none", border: "1px dashed #6B7C93", color: "#6B7C93", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 20 }}>
              + Adicionar parcela manualmente
            </button>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ background: "#f0f0f0", color: "#666", border: "none", padding: "10px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleAddPagamento}
                disabled={!form.descricao || parcelasArr.length === 0}
                style={{ background: (!form.descricao || parcelasArr.length === 0) ? "#9ca3af" : "#1a1a2e", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 8, fontSize: 13, cursor: (!form.descricao || parcelasArr.length === 0) ? "default" : "pointer", fontWeight: 600 }}>
                Adicionar {parcelasArr.length > 1 ? `${parcelasArr.length} parcelas` : (form.tipo === "entrada" ? "recebimento" : "pagamento")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cashflow table */}
      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0f0", fontWeight: 700, color: "#1a1a2e", fontSize: 13, fontFamily: "Georgia,serif" }}>
          Fluxo de Caixa — {empObj.nome} · {(dataInicio || dataFim)
            ? `${mesesFiltrados.length} ${mesesFiltrados.length === 1 ? "mês" : "meses"} filtrados`
            : `Próximos ${view === "mensal" ? "36 meses" : "3 anos"}`}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8f9fc" }}>
                {["Período", "Entradas", "Saídas", "Líquido", "Saldo Fim Mês", "Barra"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#aaa", fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "monospace", borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Linha de Vencidas (faturas com data_vencimento < mês atual e status != "Paga") */}
              {view === "mensal" && (vencidas.saidas > 0 || vencidas.entradas > 0) && [
                <tr key="vencidas-row"
                  onClick={() => setExpandedMes(expandedMes === "__vencidas__" ? null : "__vencidas__")}
                  style={{ borderBottom: "2px solid #dc2626", cursor: "pointer", background: "#fef2f2" }}>
                  <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 700, color: "#dc2626", whiteSpace: "nowrap" }}>
                    {expandedMes === "__vencidas__" ? "▼ " : "▶ "}⚠️ Vencidas ({vencidas.items.length})
                  </td>
                  <td style={{ padding: "10px 16px", color: "#16a34a", fontFamily: "monospace", fontWeight: vencidas.entradas > 0 ? 700 : 400 }}>
                    {vencidas.entradas > 0 ? "+" + fmtK(vencidas.entradas).replace("-", "") : "—"}
                  </td>
                  <td style={{ padding: "10px 16px", color: "#dc2626", fontFamily: "monospace", fontWeight: 700 }}>
                    {fmtK(-vencidas.saidas)}
                  </td>
                  <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 700, color: (vencidas.entradas - vencidas.saidas) >= 0 ? "#16a34a" : "#dc2626" }}>
                    {fmtK(vencidas.entradas - vencidas.saidas)}
                  </td>
                  <td style={{ padding: "10px 16px", fontFamily: "monospace", color: "#888", fontStyle: "italic" }}>
                    (pendente)
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ background: "#dc2626", height: 6, width: Math.min(100, (vencidas.saidas / maxAbs) * 100) + "%", borderRadius: 3, opacity: 0.8 }}></div>
                  </td>
                </tr>,
                ...(expandedMes === "__vencidas__" ? vencidas.items.map((item, j) => (
                  <tr key={`venc_${j}`} style={{ background: "#fff8f8", borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "7px 16px 7px 32px", color: "#dc2626", fontSize: 11, fontWeight: 600 }}>
                      {fmtDate(item.vencimento)} ⚠
                    </td>
                    <td colSpan={2} style={{ padding: "7px 16px", color: "#444", fontSize: 11 }}>
                      <span style={{ color: "#888", marginRight: 6 }}>{item.origem}</span>{item.desc || "—"}
                    </td>
                    <td colSpan={2} style={{ padding: "7px 16px", fontFamily: "monospace", fontSize: 11, color: item.tipo === "entrada" ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                      {item.tipo === "entrada" ? "+" : "-"}{fmtFull(item.valor || 0)}
                    </td>
                    <td style={{ padding: "7px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ background: "#fee2e2", color: "#dc2626", fontSize: 9, padding: "1px 6px", borderRadius: 3, fontFamily: "monospace" }}>{item.cat || "—"}</span>
                        {isAdmin && item.origem === "Manual" && item.pagamento && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(item.pagamento); }}
                              title="Marcar como Pago (sai do fluxo)"
                              style={{ background: "#dcfce7", border: "none", color: "#16a34a", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", marginLeft: 4, fontWeight: 700 }}>✓</button>
                            <button onClick={(e) => { e.stopPropagation(); openEdit(item.pagamento); }}
                              title="Editar pagamento"
                              style={{ background: "#f0f4ff", border: "none", color: "#4a6fa5", padding: "3px 7px", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>✎</button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeletePagamento(item.pagamento); }}
                              title="Eliminar pagamento"
                              style={{ background: "#fff0f0", border: "none", color: "#dc2626", padding: "3px 7px", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>✕</button>
                          </>
                        )}
                        {isAdmin && (item.origem === "Vencida" || item.origem === "Contas a Pagar") && item.fatura && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); handleMarkFaturaPaid(item.fatura); }}
                              title="Marcar fatura como Paga"
                              style={{ background: "#dcfce7", border: "none", color: "#16a34a", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", marginLeft: 4, fontWeight: 700 }}>✓</button>
                            <button onClick={(e) => { e.stopPropagation(); openEditFatura(item.fatura); }}
                              title="Editar fatura"
                              style={{ background: "#f0f4ff", border: "none", color: "#4a6fa5", padding: "3px 7px", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>✎</button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteFatura(item.fatura); }}
                              title="Eliminar fatura"
                              style={{ background: "#fff0f0", border: "none", color: "#dc2626", padding: "3px 7px", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>✕</button>
                          </>
                        )}
                        {isAdmin && (item.origem === "Recebível Escritura" || item.origem === "Comissão Pendente") && item.venda && (
                          <button onClick={(e) => { e.stopPropagation(); handleMarkVendaItemPaid(item.venda, item.vendaTipo); }}
                            title={item.tipo === "entrada" ? "Marcar como Recebido (sai do fluxo)" : "Marcar como Pago (sai do fluxo)"}
                            style={{ background: "#dcfce7", border: "none", color: "#16a34a", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", marginLeft: 4, fontWeight: 700 }}>✓</button>
                        )}
                      </div>
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
                      style={{ borderBottom: "1px solid #fafafa", cursor: m.items?.length > 0 ? "pointer" : "default", background: isNegativo ? "#fff8f8" : i % 2 === 0 ? "#fff" : "#fafafa" }}
                      onMouseEnter={e => { if (!isNegativo) e.currentTarget.style.background = "#f0f4ff"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isNegativo ? "#fff8f8" : i % 2 === 0 ? "#fff" : "#fafafa"; }}>
                      <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 600, color: "#1a1a2e", whiteSpace: "nowrap" }}>
                        {m.items?.length > 0 ? (isExpanded ? "▼ " : "▶ ") : "  "}{m.label || m.ano}
                      </td>
                      <td style={{ padding: "10px 16px", color: "#16a34a", fontFamily: "monospace", fontWeight: m.entradas > 0 ? 700 : 400 }}>
                        {m.entradas > 0 ? "+" + fmtK(m.entradas) : "—"}
                      </td>
                      <td style={{ padding: "10px 16px", color: m.saidas > 0 ? "#dc2626" : "#aaa", fontFamily: "monospace", fontWeight: m.saidas > 0 ? 700 : 400 }}>
                        {m.saidas > 0 ? fmtK(-m.saidas) : "—"}
                      </td>
                      <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 700, color: m.liquido >= 0 ? "#16a34a" : "#dc2626" }}>
                        {m.liquido >= 0 ? "+" + fmtK(m.liquido) : fmtK(m.liquido)}
                      </td>
                      <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 700, color: isNegativo ? "#dc2626" : "#1a1a2e" }}>
                        {isNegativo ? "⚠ " : ""}{fmtK(m.saldo_fim)}
                      </td>
                      <td style={{ padding: "10px 16px", minWidth: 120 }}>
                        <div style={{ display: "flex", gap: 2, height: 14, alignItems: "center" }}>
                          {m.entradas > 0 && <div style={{ width: `${(m.entradas / maxAbs) * 60}px`, height: 8, background: "#16a34a", borderRadius: 2, opacity: 0.8 }} />}
                          {m.saidas > 0 && <div style={{ width: `${(m.saidas / maxAbs) * 60}px`, height: 8, background: "#dc2626", borderRadius: 2, opacity: 0.8 }} />}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && m.items?.map((item, j) => (
                      <tr key={`${i}_${j}`} style={{ background: "#f8f9ff", borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "7px 16px 7px 32px", color: "#888", fontSize: 11 }}>{item.origem}</td>
                        <td colSpan={2} style={{ padding: "7px 16px", color: "#444", fontSize: 11 }}>{item.desc}</td>
                        <td colSpan={2} style={{ padding: "7px 16px", fontFamily: "monospace", fontSize: 11, color: item.tipo === "entrada" ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                          {item.tipo === "entrada" ? "+" : "-"}{fmtFull(item.valor)}
                        </td>
                        <td style={{ padding: "7px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ background: "#f0f4ff", color: "#4a6fa5", fontSize: 9, padding: "1px 6px", borderRadius: 3, fontFamily: "monospace" }}>{item.cat}</span>
                            {isAdmin && item.origem === "Manual" && item.pagamento && (
                              <>
                                <button onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(item.pagamento); }}
                                  title="Marcar como Pago (sai do fluxo)"
                                  style={{ background: "#dcfce7", border: "none", color: "#16a34a", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", marginLeft: 4, fontWeight: 700 }}>✓</button>
                                <button onClick={(e) => { e.stopPropagation(); openEdit(item.pagamento); }}
                                  title="Editar pagamento"
                                  style={{ background: "#f0f4ff", border: "none", color: "#4a6fa5", padding: "3px 7px", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>✎</button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeletePagamento(item.pagamento); }}
                                  title="Eliminar pagamento"
                                  style={{ background: "#fff0f0", border: "none", color: "#dc2626", padding: "3px 7px", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>✕</button>
                              </>
                            )}
                            {isAdmin && (item.origem === "Contas a Pagar" || item.origem === "Vencida") && item.fatura && (
                              <>
                                <button onClick={(e) => { e.stopPropagation(); handleMarkFaturaPaid(item.fatura); }}
                                  title="Marcar fatura como Paga"
                                  style={{ background: "#dcfce7", border: "none", color: "#16a34a", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", marginLeft: 4, fontWeight: 700 }}>✓</button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteFatura(item.fatura); }}
                                  title="Eliminar fatura"
                                  style={{ background: "#fff0f0", border: "none", color: "#dc2626", padding: "3px 7px", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>✕</button>
                              </>
                            )}
                          </div>
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

      {/* Modal editar pagamento manual */}
      {/* Modal — editar fatura a partir do fluxo */}
      {editFatura && editFaturaForm && (
        <div onClick={(e) => { if (e.target === e.currentTarget) closeEditFatura(); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 22, width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", fontFamily: "Georgia,serif" }}>Editar fatura</div>
                <div style={{ fontSize: 10, color: "#bbb", fontFamily: "monospace", marginTop: 2 }}>{editFatura.fatura || editFatura.id}</div>
              </div>
              <button onClick={closeEditFatura} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#aaa" }}>✕</button>
            </div>

            {[["Fornecedor", "fornecedor", "text"],
              ["Categoria", "categoria", "text"],
              ["Valor (€)", "valor", "number"],
              ["Vencimento", "vencimento", "date"],
              ["Observações", "obs", "text"]].map(([rot, campo, tipo]) => (
              <div key={campo}>
                <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>{rot}</div>
                <input type={tipo} value={editFaturaForm[campo]}
                  onChange={e => setEditFaturaForm(f => ({ ...f, [campo]: e.target.value }))}
                  style={{ width: "100%", background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "9px 11px", fontSize: 13, outline: "none" }} />
              </div>
            ))}

            <div>
              <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>Estado</div>
              <select value={editFaturaForm.status}
                onChange={e => setEditFaturaForm(f => ({ ...f, status: e.target.value }))}
                style={{ width: "100%", background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "9px 11px", fontSize: 13, outline: "none" }}>
                {["Pendente", "Aprovada", "Paga", "Vencida", "Em disputa", "Rejeitada"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button onClick={() => { handleDeleteFatura(editFatura); closeEditFatura(); }}
                style={{ background: "#fff0f0", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 16px", borderRadius: 9, fontSize: 12, cursor: "pointer" }}>
                Eliminar
              </button>
              <div style={{ flex: 1 }} />
              <button onClick={closeEditFatura}
                style={{ background: "#f4f5f7", border: "none", color: "#666", padding: "10px 18px", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={handleSaveEditFatura}
                style={{ background: "#1a1a2e", border: "none", color: "#fff", padding: "10px 22px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {editPagamento && editForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 600, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontFamily: "Georgia,serif", color: "#1a1a2e" }}>Editar Pagamento</h2>
              <button onClick={closeEdit} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#aaa" }}>✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase" }}>Descrição *</label>
                <input type="text" value={editForm.descricao}
                  onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))}
                  style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase" }}>Tipo</label>
                <select value={editForm.tipo} onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))}
                  style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }}>
                  <option value="saida">Saída</option>
                  <option value="entrada">Entrada</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase" }}>Valor (€)</label>
                <input type="number" step="0.01" value={editForm.valor}
                  onChange={e => setEditForm(f => ({ ...f, valor: e.target.value }))}
                  style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "monospace", fontWeight: 700 }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase" }}>Data Início</label>
                <input type="date" value={editForm.data_inicio}
                  onChange={e => setEditForm(f => ({ ...f, data_inicio: e.target.value }))}
                  style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase" }}>Nº Parcelas</label>
                <input type="number" min={1} max={120} value={editForm.parcelas}
                  onChange={e => setEditForm(f => ({ ...f, parcelas: e.target.value }))}
                  style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase" }}>Periodicidade</label>
                <select value={editForm.periodicidade} onChange={e => setEditForm(f => ({ ...f, periodicidade: e.target.value }))}
                  style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }}>
                  <option value="unica">Única</option>
                  <option value="mensal">Mensal</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase" }}>Empresa</label>
                <select value={editForm.empresa} onChange={e => setEditForm(f => ({ ...f, empresa: e.target.value }))}
                  style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }}>
                  {EMPRESAS_CAIXA.filter(e => e.id !== "all").map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>

              <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", textTransform: "uppercase" }}>Categoria</label>
                <select value={editForm.categoria} onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value }))}
                  style={{ background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }}>
                  {CATEGORIAS.map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 20, padding: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 11, color: "#92400e", lineHeight: 1.5 }}>
              💡 Este pagamento foi criado como parcela única. Aqui podes ajustar o valor, a data, ou transformá-lo num pagamento recorrente (mensal/trimestral/anual).
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
              <button onClick={() => { handleDeletePagamento(editPagamento); closeEdit(); }}
                style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "10px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                ✕ Eliminar
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={closeEdit} style={{ background: "#f0f0f0", color: "#666", border: "none", padding: "10px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
                <button onClick={handleSaveEdit}
                  style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
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
