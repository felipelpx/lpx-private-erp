// ─────────────────────────────────────────────────────────────────────────────
// APURAMENTO TRIMESTRAL DE IVA
//
// Duas regras governam tudo o que está aqui:
//
//   1. O que conta é a DATA DE EMISSÃO da fatura, nunca a do pagamento. Uma
//      fatura emitida a 28/09 e paga a 15/10 é IVA de setembro, do 3.º
//      trimestre. O estado de pagamento não entra no cálculo em lado nenhum.
//
//   2. O IVA é o que está na fatura. Só quando a fatura não traz o montante,
//      mas traz base e taxa, é calculado — e fica assinalado, para se poder
//      distinguir o que é documento do que é dedução nossa.
//
// Módulo sem React e sem acesso a dados: recebe linhas, devolve contas. É
// assim que pode ser testado sem browser nem base de dados.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Datas-limite de pagamento ───────────────────────────────────────────────
// Dia 25 do segundo mês a seguir ao fim do trimestre:
//   1T → 25 de maio · 2T → 25 de agosto · 3T → 25 de novembro · 4T → 25 de
//   fevereiro do ano seguinte.
// Se a AT mudar o prazo, muda-se aqui e em mais lado nenhum.
export const REGRA_DATA_LIMITE = { diaLimite: 25, mesesAposFimDoTrimestre: 2 };

export const TRIMESTRES = [1, 2, 3, 4];

// Trimestre de uma data (1 a 4). Devolve null para data inválida.
export function trimestreDe(data) {
  const m = mesDe(data);
  return m ? Math.floor((m - 1) / 3) + 1 : null;
}

export function mesDe(data) {
  const s = String(data || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const m = Number(s.slice(5, 7));
  return m >= 1 && m <= 12 ? m : null;
}

export function anoDe(data) {
  const s = String(data || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? Number(s.slice(0, 4)) : null;
}

// "3T26" — o formato que já usamos nos mapas de controlo.
export const rotuloTrimestre = (ano, tri) => `${tri}T${String(ano).slice(-2)}`;

// Os três meses de um trimestre, em números (1 a 12).
export const mesesDoTrimestre = (tri) => [tri * 3 - 2, tri * 3 - 1, tri * 3];

export const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
                          "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const NOME_MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun",
                               "jul", "ago", "set", "out", "nov", "dez"];

// Data-limite de pagamento, em ISO. O mês pode saltar de ano — o 4T paga-se em
// fevereiro do ano seguinte.
export function dataLimite(ano, tri) {
  const { diaLimite, mesesAposFimDoTrimestre } = REGRA_DATA_LIMITE;
  const mesFim = tri * 3;                                  // 3, 6, 9, 12
  const indice = mesFim + mesesAposFimDoTrimestre - 1;     // base 0
  const anoLimite = ano + Math.floor(indice / 12);
  const mesLimite = (indice % 12) + 1;
  return `${anoLimite}-${String(mesLimite).padStart(2, "0")}-${String(diaLimite).padStart(2, "0")}`;
}

// Último dia do trimestre, em ISO — para saber se já terminou.
export function fimDoTrimestre(ano, tri) {
  const mesFim = tri * 3;
  const dia = new Date(ano, mesFim, 0).getDate();          // dia 0 do mês seguinte
  return `${ano}-${String(mesFim).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export const ESTADOS_TRIMESTRE = {
  curso:      { txt: "Em curso",  cor: "#64748b", fundo: "#f1f5f9" },
  aberto:     { txt: "Em aberto", cor: "#b45309", fundo: "#fef3c7" },
  vencido:    { txt: "Vencido",   cor: "#dc2626", fundo: "#fee2e2" },
  pago:       { txt: "Pago",      cor: "#15803d", fundo: "#f0fdf4" },
};

// Estado de um trimestre. `hoje` injetável para os testes não dependerem do dia.
export function estadoTrimestre(ano, tri, pagamento, hoje = hojeISO()) {
  if (pagamento && pagamento.data_pagamento) return "pago";
  if (hoje <= fimDoTrimestre(ano, tri)) return "curso";
  return hoje > dataLimite(ano, tri) ? "vencido" : "aberto";
}

export function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Valores ────────────────────────────────────────────────────────────────
export const arred2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;

// O IVA de um documento. Devolve também de onde veio o número, porque a
// diferença entre "li na fatura" e "deduzi" tem de chegar ao ecrã.
export function ivaDoDocumento(doc) {
  const lido = Number(doc?.valor_iva);
  if (Number.isFinite(lido) && lido !== 0) {
    return { iva: arred2(lido), estimado: !!doc?.iva_estimado };
  }
  const base = Number(doc?.valor_base);
  const taxa = Number(doc?.taxa_iva);
  if (Number.isFinite(base) && base !== 0 && Number.isFinite(taxa) && taxa > 0) {
    return { iva: arred2(base * taxa / 100), estimado: true };
  }
  return { iva: 0, estimado: !!doc?.iva_estimado };
}

// ─── Agregação ──────────────────────────────────────────────────────────────
// `docs` são linhas da view vw_iva_documentos (ou o equivalente montado no
// cliente). Devolve a estrutura que o ecrã desenha: trimestres → meses → docs.
//
// Nada aqui olha para o estado de pagamento: é de propósito.
export function apurar(docs, { empresa = "todas", ano = null, trimestre = "todos" } = {}) {
  const linhas = (docs || [])
    .filter(d => d && d.data_fatura)
    .filter(d => empresa === "todas" || d.empresa === empresa)
    .map(d => {
      const { iva, estimado } = ivaDoDocumento(d);
      const a = anoDe(d.data_fatura), m = mesDe(d.data_fatura);
      return { ...d, iva, estimado, ano: a, mes: m, trimestre: trimestreDe(d.data_fatura) };
    })
    .filter(d => d.ano && d.mes)
    .filter(d => ano == null || d.ano === ano)
    .filter(d => trimestre === "todos" || d.trimestre === Number(trimestre));

  const porTrimestre = new Map();
  linhas.forEach(d => {
    const chave = `${d.ano}-${d.trimestre}`;
    if (!porTrimestre.has(chave)) {
      porTrimestre.set(chave, {
        ano: d.ano, trimestre: d.trimestre,
        rotulo: rotuloTrimestre(d.ano, d.trimestre),
        dataLimite: dataLimite(d.ano, d.trimestre),
        aPagar: 0, aAbater: 0, saldo: 0, docs: [], meses: new Map(),
      });
    }
    const t = porTrimestre.get(chave);
    t.docs.push(d);
    if (!t.meses.has(d.mes)) t.meses.set(d.mes, { mes: d.mes, aPagar: 0, aAbater: 0, saldo: 0, docs: [] });
    const mm = t.meses.get(d.mes);
    mm.docs.push(d);
    if (d.tipo === "cliente") { t.aPagar += d.iva; mm.aPagar += d.iva; }
    else                      { t.aAbater += d.iva; mm.aAbater += d.iva; }
  });

  const trimestres = [...porTrimestre.values()].map(t => {
    // Os três meses aparecem sempre, mesmo vazios: um mês sem faturas é
    // informação, não um buraco na tabela.
    const meses = mesesDoTrimestre(t.trimestre).map(m => {
      const mm = t.meses.get(m) || { mes: m, aPagar: 0, aAbater: 0, docs: [] };
      return {
        mes: m, nome: NOMES_MES[m - 1], curto: NOME_MES_CURTO[m - 1],
        aPagar: arred2(mm.aPagar), aAbater: arred2(mm.aAbater),
        saldo: arred2(mm.aPagar - mm.aAbater),
        docs: mm.docs, semFaturas: mm.docs.length === 0,
      };
    });
    return {
      ...t, meses,
      aPagar: arred2(t.aPagar), aAbater: arred2(t.aAbater),
      saldo: arred2(t.aPagar - t.aAbater),
    };
  }).sort((a, b) => a.ano - b.ano || a.trimestre - b.trimestre);

  const total = trimestres.reduce((s, t) => ({
    aPagar: arred2(s.aPagar + t.aPagar),
    aAbater: arred2(s.aAbater + t.aAbater),
    saldo: arred2(s.saldo + t.saldo),
  }), { aPagar: 0, aAbater: 0, saldo: 0 });

  return { linhas, trimestres, total, anos: [...new Set(linhas.map(d => d.ano))].sort((a, b) => b - a) };
}

// Os 12 meses de um ano, para a vista "Por mês" — inclusive os vazios.
export function porMes(apuramento, ano) {
  const mapa = new Map();
  apuramento.linhas.filter(d => d.ano === ano).forEach(d => {
    if (!mapa.has(d.mes)) mapa.set(d.mes, { aPagar: 0, aAbater: 0, docs: [] });
    const m = mapa.get(d.mes);
    m.docs.push(d);
    if (d.tipo === "cliente") m.aPagar += d.iva; else m.aAbater += d.iva;
  });
  return Array.from({ length: 12 }, (_, i) => {
    const m = mapa.get(i + 1) || { aPagar: 0, aAbater: 0, docs: [] };
    return {
      mes: i + 1, nome: NOMES_MES[i], curto: NOME_MES_CURTO[i],
      trimestre: Math.floor(i / 3) + 1,
      aPagar: arred2(m.aPagar), aAbater: arred2(m.aAbater),
      saldo: arred2(m.aPagar - m.aAbater),
      docs: m.docs, semFaturas: m.docs.length === 0,
    };
  });
}

// O próximo trimestre a pagar: o mais antigo que já fechou e ainda não foi
// pago. É o que interessa ver no cartão de topo.
export function proximoVencimento(trimestres, pagamentos = [], hoje = hojeISO()) {
  const pago = (t) => pagamentos.some(p =>
    p.ano === t.ano && p.trimestre === t.trimestre && p.data_pagamento);
  return trimestres
    .filter(t => !pago(t) && t.saldo > 0 && hoje > fimDoTrimestre(t.ano, t.trimestre))
    .sort((a, b) => a.dataLimite.localeCompare(b.dataLimite))[0] || null;
}
