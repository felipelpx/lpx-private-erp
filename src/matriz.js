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

// Os meses como aparecem nas descrições: por extenso ("Setembro") e abreviados
// ("set"), que é o que o plano de obra escreve — `rotuloMes` dá "out/26".
const MESES_PT =
  "jan(?:eiro)?|fev(?:ereiro)?|mar(?:[çc]o)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|" +
  "jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?";
const ANO = "\\d{4}|\\d{2}";

// O mês colado ao fim do nome, em qualquer das formas que o ERP produz:
//   "- Setembro 2026" · "— out/26" · "Outubro/2026" · "· 2026-09" · "- 09/2026"
// Um ano sozinho NÃO conta: "IMI 2025" e "IMI 2026" são despesas diferentes,
// não duas parcelas da mesma.
const FIM_COM_MES = new RegExp(
  "(?:[-–—·:,]\\s*)?(?:\\(\\s*)?(?:" +
    `\\d{4}\\s*[/.-]\\s*\\d{1,2}` +                                  // 2026-09
    `|(?:${MESES_PT})(?:\\s*[/.-]\\s*|\\s+de\\s+|\\s+)?(?:${ANO})?` + // set/26
    `|\\d{1,2}\\s*[/.-]\\s*(?:${ANO})` +                             // 09/2026
  ")(?:\\s*\\))?\\s*$", "i");

/**
 * O nome pelo qual duas parcelas se reconhecem como a mesma despesa.
 * Tira o que varia de parcela para parcela e deixa o que identifica a despesa.
 */
export function nomeDaDespesa(descricao) {
  let s = String(descricao || "").trim();
  s = s.replace(/\[→?\s*fatura[^\]]*\]/gi, " ");   // [→ fatura FT 123]
  s = s.replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, " "); // (2/5)
  s = s.replace(/\b\d+\s*\/\s*\d+\b/g, " ");       // 2/5 solto
  s = s.replace(/\s{2,}/g, " ").trim();
  s = s.replace(FIM_COM_MES, " ");
  s = s.replace(/[\s·\-–—:,/]+$/g, " ");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s || String(descricao || "").trim() || "(sem descrição)";
}

export const chaveDaLinha = (item, rubrica) =>
  `${item?.tipo === "entrada" ? "e" : "s"}|` +
  `${String(rubrica ?? item?.cat ?? "").trim().toLowerCase()}|` +
  nomeDaDespesa(item?.desc).toLowerCase();

/**
 * Constrói a matriz a partir dos meses já calculados pelo fluxo.
 *
 * @param meses     os meses do fluxo, cada um com { key, label, items[] }
 * @param maxMeses  quantas colunas mostrar (o utilizador acrescenta e tira)
 * @param de, ate   "AAAA-MM", os mesmos filtros da vista mensal
 * @param comVazios incluir meses sem um único lançamento
 * @param rubricaDoItem  como se chama a linha a que um lançamento pertence.
 *        Por omissão é a categoria em cru; nos projetos HDG o ecrã passa aqui
 *        a linha da FO (ver src/rubricasHDG.js), para a grelha mostrar as
 *        mesmas despesas que o fluxo operacional.
 */
export function construirMatriz({ meses = [], maxMeses = 6, de = "", ate = "",
                                  comVazios = false, rubricaDoItem = null } = {}) {
  const rubricaDe_ = typeof rubricaDoItem === "function"
    ? (it) => { try { return rubricaDoItem(it) || it?.cat || ""; } catch { return it?.cat || ""; } }
    : (it) => it?.cat || "";
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

  // As COLUNAS são os meses à vista; o TOTAL é do fluxo inteiro.
  //
  // Antes não era: a linha só se construía a partir das colunas visíveis, e o
  // total era a soma delas. Numa obra de 18 meses com uma janela de 20 que
  // começava mais cedo, um mês caía fora e o total ficava 184 252,87 € abaixo
  // do plano de obra — sem nada no ecrã a dizer que faltava alguma coisa.
  // Uma coluna chamada "total" tem de ser o total.
  const dentro = new Set(chaves);
  const linhas = new Map();
  candidatos.forEach(m => {
    (m.items || []).forEach(item => {
      const rubrica = String(rubricaDe_(item) || "").trim();
      const k = chaveDaLinha(item, rubrica);
      if (!linhas.has(k)) linhas.set(k, {
        chave: k,
        tipo: item.tipo === "entrada" ? "entrada" : "saida",
        categoria: rubrica || "Sem categoria",
        nome: nomeDaDespesa(item.desc),
        valores: Object.fromEntries(chaves.map(c => [c, 0])),
        itens: Object.fromEntries(chaves.map(c => [c, []])),
        total: 0, foraDaJanela: 0,
      });
      const linha = linhas.get(k);
      const v = Math.abs(num(item.valor));
      if (dentro.has(m.key)) {
        linha.valores[m.key] = arred2(linha.valores[m.key] + v);
        linha.itens[m.key].push(item);
      } else {
        // O que fica para lá da janela conta no total, e diz-se quanto é.
        linha.foraDaJanela = arred2(linha.foraDaJanela + v);
      }
      linha.total = arred2(linha.total + v);
    });
  });

  // O mês em que uma linha começa a ter valor — é por aí que as linhas se
  // ordenam dentro do grupo. Numa grelha de meses, ler no sentido do tempo é
  // o que se espera; ordenar por valor fazia fevereiro aparecer antes de
  // outubro sem razão nenhuma.
  const primeiroMes = (linha) => {
    const i = chaves.findIndex(c => Math.abs(num(linha.valores[c])) > 0.005);
    return i < 0 ? chaves.length : i;
  };

  // Por secção (entradas, saídas) e, dentro dela, por categoria. As
  // categorias vão da que mais pesa para a que menos pesa: numa reunião
  // olha-se para o que pesa, não para o alfabeto.
  const seccao = (tipo, titulo) => {
    const todas = [...linhas.values()].filter(l => l.tipo === tipo);
    // Uma despesa que não tem nada nos meses à vista não vira linha vazia na
    // grelha — mas o que ela vale não desaparece: vai para o total de fora da
    // janela, que o rodapé mostra.
    const naJanela = (l) => chaves.some(c => Math.abs(num(l.valores[c])) > 0.005);
    const minhas = todas.filter(naJanela);
    const soLaFora = arred2(todas.filter(l => !naJanela(l))
      .reduce((s, l) => s + l.total, 0));
    const porCategoria = new Map();
    minhas.forEach(l => {
      if (!porCategoria.has(l.categoria)) porCategoria.set(l.categoria, {
        categoria: l.categoria, linhas: [],
        valores: Object.fromEntries(chaves.map(c => [c, 0])), total: 0,
        foraDaJanela: 0,
      });
      const g = porCategoria.get(l.categoria);
      g.linhas.push(l);
      chaves.forEach(c => { g.valores[c] = arred2(g.valores[c] + l.valores[c]); });
      g.total = arred2(g.total + l.total);
      g.foraDaJanela = arred2((g.foraDaJanela || 0) + l.foraDaJanela);
    });
    const grupos = [...porCategoria.values()]
      .map(g => ({ ...g, linhas: g.linhas.sort((a, b) =>
        primeiroMes(a) - primeiroMes(b) ||
        b.total - a.total ||
        a.nome.localeCompare(b.nome, "pt")) }))
      .sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria, "pt"));

    const valores = Object.fromEntries(chaves.map(c =>
      [c, arred2(grupos.reduce((s, g) => s + g.valores[c], 0))]));
    return {
      tipo, titulo, grupos, valores,
      // O total da secção é do fluxo inteiro: inclui o que está nas colunas,
      // o que ficou para lá delas, e as despesas que só existem lá fora.
      total: arred2(grupos.reduce((s, g) => s + g.total, 0) + soLaFora),
      foraDaJanela: arred2(grupos.reduce((s, g) => s + (g.foraDaJanela || 0), 0) + soLaFora),
      nLinhas: minhas.length,
      nLinhasForaDaJanela: todas.length - minhas.length,
    };
  };

  const entradas = seccao("entrada", "Entradas");
  const saidas = seccao("saida", "Saídas");

  const liquido = Object.fromEntries(chaves.map(c =>
    [c, arred2(entradas.valores[c] - saidas.valores[c])]));

  return {
    colunas, chaves, porMostrar,
    // Quanto é que fica para lá das colunas à vista — o ecrã diz-no, para
    // ninguém ler o total como se fosse só o que está na grelha.
    foraDaJanela: arred2(entradas.foraDaJanela + saidas.foraDaJanela),
    mesesForaDaJanela: porMostrar,
    seccoes: [entradas, saidas].filter(s => s.nLinhas > 0),
    entradas, saidas, liquido,
    totalLiquido: arred2(entradas.total - saidas.total),
    // As linhas que a grelha mostra. As que só existem para lá das colunas à
    // vista contam no total, mas não são linhas no ecrã.
    nLinhas: entradas.nLinhas + saidas.nLinhas,
    nLinhasTotal: linhas.size,
  };
}

export default construirMatriz;
