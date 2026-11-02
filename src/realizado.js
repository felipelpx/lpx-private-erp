// ─────────────────────────────────────────────────────────────────────────────
// FLUXO REALIZADO — o que já passou pela conta, mês a mês
//
// O Fluxo Futuro responde a "quanto vai sair em novembro?". Isto responde à
// outra metade da pergunta: "quanto saiu, afinal?". Mesma grelha, mesmas
// rubricas, mesmas três secções — só que a origem não são previsões, é o
// extrato. Nada aqui se prevê: já aconteceu.
//
// O trabalho é só de tradução. A matriz (src/matriz.js) já sabe desenhar
// qualquer coisa que venha na forma `{ key, label, items[] }`; aqui pegam-se
// nos movimentos do extrato e põem-se nessa forma. Assim o realizado e o
// futuro partilham a aritmética, o agrupamento por despesa e a separação
// receitas / custos / funding, em vez de terem duas implementações que
// divergem ao primeiro ajuste.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const arred2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;

const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun",
                   "jul", "ago", "set", "out", "nov", "dez"];

export const mesDe = (data) => String(data || "").slice(0, 7);

export function rotuloMes(mes) {
  const [a, m] = String(mes).split("-").map(Number);
  return m ? `${NOMES_MES[m - 1]}/${String(a).slice(-2)}` : String(mes);
}

/**
 * Os meses realizados, na forma que a matriz entende.
 *
 * @param movimentos  linhas do extrato: { data, movimento, valor, categoria,
 *                    subcategoria, empresa_id, conta_id, banco }
 * @param rubricaDoMovimento  em que rubrica é que o movimento cai. Devolver
 *        `null` deixa-o de fora — é assim que os ajustes e as transferências
 *        entre contas da mesma empresa não entram: entram e saem pelo mesmo
 *        valor e não são fluxo do projeto.
 * @param de, ate  "AAAA-MM", os mesmos filtros da vista do futuro.
 * @param comVazios  incluir meses sem um único movimento.
 *
 * O sinal vem do extrato: valor negativo é saída, positivo é entrada. Não se
 * adivinha pelo nome da rubrica — uma devolução do empreiteiro é uma entrada
 * numa rubrica de custo, e tem de contar como tal.
 */
export function mesesRealizados({ movimentos = [], rubricaDoMovimento = null,
                                  de = "", ate = "", comVazios = false } = {}) {
  const rubricaDe_ = typeof rubricaDoMovimento === "function"
    ? (m) => { try { return rubricaDoMovimento(m); } catch { return m?.categoria || ""; } }
    : (m) => m?.categoria || "";

  const porMes = new Map();
  let nIgnorados = 0, valorIgnorado = 0;

  (movimentos || []).forEach((m) => {
    if (!m) return;
    const mes = mesDe(m.data);
    if (!/^\d{4}-\d{2}$/.test(mes)) return;
    if (de && mes < de) return;
    if (ate && mes > ate) return;

    const rubrica = rubricaDe_(m);
    if (rubrica === null || rubrica === undefined) {
      nIgnorados++; valorIgnorado = arred2(valorIgnorado + num(m.valor));
      return;
    }

    const v = num(m.valor);
    if (!porMes.has(mes)) porMes.set(mes, {
      key: mes, label: rotuloMes(mes), items: [],
      entradas: 0, saidas: 0,
    });
    const bucket = porMes.get(mes);
    bucket.items.push({
      tipo: v >= 0 ? "entrada" : "saida",
      valor: Math.abs(v),
      cat: String(rubrica || "").trim() || "Sem categoria",
      desc: m.movimento || m.detalhes || "(sem descrição)",
      // `origem` é o que a matriz mostra antes da descrição, na gaveta da
      // célula. Aqui diz sempre de que conta veio — num quadro de realizado,
      // saber o banco é metade da conferência.
      origem: m.banco || "Extrato",
      data: m.data,
      vencimento: m.data,
      natureza: "realizado",
      movimento: m,
    });
    if (v >= 0) bucket.entradas = arred2(bucket.entradas + v);
    else bucket.saidas = arred2(bucket.saidas + Math.abs(v));
  });

  // Do mais recente para o mais antigo: num quadro de realizado olha-se
  // primeiro para o mês que acabou, não para o primeiro da obra.
  let meses = [...porMes.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  if (!comVazios) {
    const comCoisas = meses.filter((x) => x.items.length > 0);
    if (comCoisas.length) meses = comCoisas;
  }

  return {
    meses,
    nMovimentos: (movimentos || []).length,
    nUsados: meses.reduce((s, x) => s + x.items.length, 0),
    nIgnorados, valorIgnorado,
    primeiroMes: meses.length ? meses[meses.length - 1].key : null,
    ultimoMes: meses.length ? meses[0].key : null,
  };
}

export default mesesRealizados;
