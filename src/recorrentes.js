// ─────────────────────────────────────────────────────────────────────────────
// DESPESAS RECORRENTES
//
// A contabilidade, o contrato de limpeza, o seguro: despesas que se repetem
// todos os meses até alguém as parar. Antes criavam-se à mão, uma linha por
// mês, no Fluxo Futuro — e parar uma obrigava a apagar dezenas de linhas.
//
// Aqui guarda-se a REGRA, não as linhas: empresa, valor, com que frequência e
// ATÉ QUANDO. O fluxo expande-a ao desenhar. Mudar a data de fim pára a
// despesa num sítio só, e muda tudo o que vem a seguir.
//
// A regra vive na tabela `despesas_recorrentes`; as ocorrências nunca são
// gravadas. Isso tem uma consequência deliberada: uma ocorrência não se edita
// à parte. Quem precisar de mexer num mês em concreto lança uma previsão
// normal no Fluxo Futuro, que é o sítio das excepções.
// ─────────────────────────────────────────────────────────────────────────────

export const PERIODICIDADES = [
  { v: "mensal",     r: "Mensal",      meses: 1 },
  { v: "bimestral",  r: "Bimestral",   meses: 2 },
  { v: "trimestral", r: "Trimestral",  meses: 3 },
  { v: "semestral",  r: "Semestral",   meses: 6 },
  { v: "anual",      r: "Anual",       meses: 12 },
];

export const MESES_DE = (p) =>
  PERIODICIDADES.find(x => x.v === String(p || "").toLowerCase())?.meses || 1;

export const rotuloPeriodicidade = (p) =>
  PERIODICIDADES.find(x => x.v === String(p || "").toLowerCase())?.r || "Mensal";

const arred2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const ehISO = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || "").slice(0, 10));

// Somar meses a uma data SEM a armadilha clássica do Date: 31 de janeiro mais
// um mês dá 3 de março, porque fevereiro não tem 31. Uma avença lançada a 31
// tem de cair no último dia do mês curto, não a saltar para o mês seguinte.
export function somarMesesData(iso, n) {
  const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const alvoMes = m - 1 + n;
  const ano = a + Math.floor(alvoMes / 12);
  const mes = ((alvoMes % 12) + 12) % 12;
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const dia = Math.min(d, ultimoDia);
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// Teto de segurança: uma regra sem data de fim não pode gerar para sempre.
const LIMITE_OCORRENCIAS = 600;

/**
 * As datas em que uma regra acontece dentro de uma janela.
 *
 * @param regra   a linha de despesas_recorrentes
 * @param janela  { de, ate } em ISO — normalmente o horizonte do fluxo
 * @returns [{ data, valor, descricao, ordem }] por ordem cronológica
 */
export function ocorrenciasDe(regra, { de, ate } = {}) {
  if (!regra || regra.ativa === false) return [];
  if (!ehISO(regra.data_inicio)) return [];

  const passo = MESES_DE(regra.periodicidade);
  const valor = arred2(regra.valor);
  if (!(Math.abs(valor) > 0.005)) return [];

  // A regra pára no mais cedo de: a sua data de fim, ou o fim da janela.
  const fimRegra = ehISO(regra.data_fim) ? String(regra.data_fim).slice(0, 10) : null;
  const fimJanela = ehISO(ate) ? String(ate).slice(0, 10) : null;
  const limite = fimRegra && fimJanela ? (fimRegra < fimJanela ? fimRegra : fimJanela)
                                       : (fimRegra || fimJanela);
  const inicioJanela = ehISO(de) ? String(de).slice(0, 10) : null;

  const out = [];
  for (let i = 0; i < LIMITE_OCORRENCIAS; i++) {
    const data = somarMesesData(regra.data_inicio, i * passo);
    if (limite && data > limite) break;
    if (!limite && i > 0 && !fimJanela) break;      // sem fim nem janela: uma só
    if (inicioJanela && data < inicioJanela) continue;
    out.push({
      data, valor,
      descricao: regra.descricao || "Despesa recorrente",
      ordem: i + 1,
    });
  }
  return out;
}

// Quantas vezes a regra ainda acontece a partir de hoje, e quanto custa até ao
// fim. Serve para o ecrã dizer "faltam 14 × 150 € = 2 100 €" em vez de obrigar
// o utilizador a fazer a conta de cabeça.
export function resumoDaRegra(regra, hoje) {
  const hojeISO = ehISO(hoje) ? String(hoje).slice(0, 10)
                              : new Date().toISOString().slice(0, 10);
  const semFim = !ehISO(regra?.data_fim);
  const oc = ocorrenciasDe(regra, { de: hojeISO, ate: regra?.data_fim || null });
  const total = arred2(oc.reduce((s, o) => s + o.valor, 0));
  return {
    porVir: oc.length,
    total,
    semFim,
    proxima: oc[0]?.data || null,
    ultima: oc.length ? oc[oc.length - 1].data : null,
  };
}

// Validação antes de gravar. Devolve a lista de problemas, vazia quando está
// tudo bem — o ecrã mostra-os em vez de gravar uma regra que não faz nada.
export function validarRegra(r) {
  const erros = [];
  if (!r?.empresa) erros.push("Falta a empresa.");
  if (!String(r?.descricao || "").trim()) erros.push("Falta o descritivo.");
  if (!(Math.abs(Number(r?.valor) || 0) > 0.005)) erros.push("O valor tem de ser diferente de zero.");
  if (!ehISO(r?.data_inicio)) erros.push("Falta a data de início.");
  if (r?.data_fim && !ehISO(r.data_fim)) erros.push("A data de fim não é uma data.");
  if (ehISO(r?.data_inicio) && ehISO(r?.data_fim) &&
      String(r.data_fim).slice(0, 10) < String(r.data_inicio).slice(0, 10))
    erros.push("A data de fim é anterior à de início.");
  return erros;
}

export default { ocorrenciasDe, resumoDaRegra, validarRegra, PERIODICIDADES };
