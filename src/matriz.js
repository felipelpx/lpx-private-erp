// ─────────────────────────────────────────────────────────────────────────────
// MATRIZ DO FLUXO — despesas × meses
//
// A vista mensal responde a "quanto sai em novembro?". Esta responde a "quanto
// é que esta despesa me custa, mês a mês?" — que é a pergunta de quem está a
// planear, e é como as folhas de forecast estão feitas desde sempre: uma linha
// por despesa, uma coluna por mês.
//
// O trabalho todo está em perceber que CINCO LANÇAMENTOS SÃO A MESMA DESPESA.
// O fluxo guarda cada parcela por si — "Contabilidade (Ingtrust) (1/4) · Avença
// mensal - Setembro 2026", depois (2/4) com Outubro, e por aí fora. Numa
// matriz, isso são cinco linhas de uma coluna cada: ilegível. Aqui tira-se o
// número da parcela e o mês do nome, e as cinco voltam a ser uma linha com
// cinco valores — que é o que elas sempre foram.
//
// Nada se inventa: cada célula continua a saber exatamente que lançamentos a
// compõem, para o ecrã os poder abrir e tratar um a um.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const arred2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;

const MESES_PT = "janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|" +
                 "setembro|outubro|novembro|dezembro";

/**
 * O nome pelo qual duas parcelas se reconhecem como a mesma despesa.
 * Tira o que varia de parcela para parcela e deixa o que identifica a despesa.
 */
export function nomeDaDespesa(descricao) {
  let s = String(descricao || "").trim();
  s = s.replace(/\[→?\s*fatura[^\]]*\]/gi, " ");   // [→ fatura FT 123]
  s = s.replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, " "); // (2/5)
  s = s.replace(/\b\d+\s*\/\s*\d+\b/g, " ");       // 2/5 solto
  // O mês no fim do nome: "- Setembro 2026", "· out/26", "— 2026-09"
  const fim = `(?:[-–—·:]\\s*)?(?:(?:${MESES_PT})|\\d{1,2})[\\s/.-]*(?:de\\s*)?(?:\\d{2,4})?\\s*$`;
  s = s.replace(new RegExp(fim, "i"), " ");
  s = s.replace(/[\s·\-–—:,]+$/g, " ");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s || String(descricao || "").trim() || "(sem descrição)";
}

export const chaveDaLinha = (item) =>
  `${item?.tipo === "entrada" ? "e" : "s"}|${String(item?.cat || "").trim().toLowerCase()}|` +
  nomeDaDespesa(item?.desc).toLowerCase();

/**
 * Constrói a matriz a partir dos meses já calculados pelo fluxo.
 *
 * @param meses     os meses do fluxo, cada um com { key, label, items[] }
 * @param maxMeses  quantas colunas mostrar (o utilizador acrescenta e tira)
 * @param de, ate   "AAAA-MM", os mesmos filtros da vista mensal
 * @param comVazios incluir meses sem um único lançamento
 */
export function construirMatriz({ meses = [], maxMeses = 6, de = "", ate = "",
                                  comVazios = false } = {}) {
  let candidatos = (meses || []).filter(Boolean);
  if (de)  candidatos = candidatos.filter(m => m.key >= de);
  if (ate) candidatos = candidatos.filter(m => m.key <= ate);
  if (!comVazios) {
    const comCoisas = candidatos.filter(m => (m.items || []).length > 0);
    if (comCoisas.length) candidatos = comCoisas;
  }
  const colunas = candidatos.slice(0, Math.max(1, Math.round(num(maxMeses) || 1)));
  const chaves = colunas.map(c => c.key);
  // Quantos meses ficaram de fora, para o ecrã poder oferecer mais
  const porMostrar = Math.max(0, candidatos.length - colunas.length);

  const linhas = new Map();
  colunas.forEach(m => {
    (m.items || []).forEach(item => {
      const k = chaveDaLinha(item);
      if (!linhas.has(k)) linhas.set(k, {
        chave: k,
        tipo: item.tipo === "entrada" ? "entrada" : "saida",
        categoria: String(item.cat || "").trim() || "Sem categoria",
        nome: nomeDaDespesa(item.desc),
        valores: Object.fromEntries(chaves.map(c => [c, 0])),
        itens: Object.fromEntries(chaves.map(c => [c, []])),
        total: 0,
      });
      const linha = linhas.get(k);
      const v = Math.abs(num(item.valor));
      linha.valores[m.key] = arred2(linha.valores[m.key] + v);
      linha.itens[m.key].push(item);
      linha.total = arred2(linha.total + v);
    });
  });

  // Por secção (entradas, saídas) e, dentro dela, por categoria. Maior
  // primeiro: numa reunião olha-se para o que pesa, não para o alfabeto.
  const seccao = (tipo, titulo) => {
    const minhas = [...linhas.values()].filter(l => l.tipo === tipo);
    const porCategoria = new Map();
    minhas.forEach(l => {
      if (!porCategoria.has(l.categoria)) porCategoria.set(l.categoria, {
        categoria: l.categoria, linhas: [],
        valores: Object.fromEntries(chaves.map(c => [c, 0])), total: 0,
      });
      const g = porCategoria.get(l.categoria);
      g.linhas.push(l);
      chaves.forEach(c => { g.valores[c] = arred2(g.valores[c] + l.valores[c]); });
      g.total = arred2(g.total + l.total);
    });
    const grupos = [...porCategoria.values()]
      .map(g => ({ ...g, linhas: g.linhas.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt")) }))
      .sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria, "pt"));

    const valores = Object.fromEntries(chaves.map(c =>
      [c, arred2(grupos.reduce((s, g) => s + g.valores[c], 0))]));
    return {
      tipo, titulo, grupos, valores,
      total: arred2(grupos.reduce((s, g) => s + g.total, 0)),
      nLinhas: minhas.length,
    };
  };

  const entradas = seccao("entrada", "Entradas");
  const saidas = seccao("saida", "Saídas");

  const liquido = Object.fromEntries(chaves.map(c =>
    [c, arred2(entradas.valores[c] - saidas.valores[c])]));

  return {
    colunas, chaves, porMostrar,
    seccoes: [entradas, saidas].filter(s => s.nLinhas > 0),
    entradas, saidas, liquido,
    totalLiquido: arred2(entradas.total - saidas.total),
    nLinhas: linhas.size,
  };
}

export default construirMatriz;
