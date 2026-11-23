// O slide do estado das frações (o rent roll da Av. da Igreja).
//
// Os riscos deste slide não são de cálculo, são de composição e de âmbito:
//
//   1. TRANSBORDO. Dezanove frações numa coluna saíam da folha. Agora são
//      duas colunas, mas o número de frações muda com o projeto — se um
//      tiver trinta, tem de continuar a caber ou a dizer que não cabe.
//   2. SOBREPOSIÇÃO. Um estado comprido ("Direito de preferência exercido")
//      parte a célula em duas linhas e a segunda escreve-se por cima da
//      linha seguinte. Corta-se pela largura real da fonte.
//   3. A UNIDADE QUE SOME. O expoente ² não existe nas fontes base-14 com
//      que os leitores compõem o PDF: não sai como "?", desaparece, e
//      "€/m" é outra unidade. Escreve-se "m2".
//   4. ÂMBITO. As frações de um projeto não podem aparecer no report de
//      outro — um investidor da Maria Pia não vê a Av. da Igreja.
//
//   node teste-fracoes-report.mjs
import { construirReportCaixa, estadoDasFracoes } from "./src/reportCaixa.js";
import { gerarReportCaixaPptx } from "./src/reportCaixaPptx.js";
import { LARGURAS } from "./src/larguras.js";

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };
const arred2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// Os números do Av_Igreja_17.11.xlsx, folhas "Rent Roll Atual" e
// "Sales table". São os mesmos que a migração v8 carrega.
const F = [
  ["A - Restaurante",       "Restaurante", "Loja", 292, 822535.21, 1424.32, "Carta enviada",                   1168000],
  ["B - R/C Direito",       "Apart. T2",   "R/C",   89, 250704.23,  575.25, "Enviar carta",                     516200],
  ["C - r/c. Esquerdo",     "Studio",      "R/C",   32,  90140.86,  281.22, "Carta enviada",                    204800],
  ["D - Galeria/restaurante","Apart. T2",  "R/C",   89, 250704.23,  470.07, "Carta enviada",                    516200],
  ["E - 1º Direito",        "Apart.T4",    "1",    158, 445070.42, 1385.62, "Enviar carta",                     821600],
  ["F - 1º Esquerdo",       "Apart. T3",   "1",    130, 366197.18, 1560.09, "Enviar carta",                     734500],
  ["G - 2º Direito",        "Apart. T4",   "2",    158, 445070.42,       0, "Direito de preferência exercido",  821600],
  ["H - 2º Esquerdo",       "Apart. T3",   "2",    130, 366197.18,       0, "Direito de preferência exercido",  734500],
  ["I - 3º Direito",        "Apart. T4",   "3",    158, 445070.42,  655.50, "Negociar saída prévia",            821600],
  ["J - 3º Esquerdo",       "Apart. T3",   "3",    130, 366197.18,       0, "Vazio",                            734500],
  ["L - 4º Direito",        "Apart. T4",   "4",    158, 445070.42,  806.52, "Negociar saída prévia",            821600],
  ["M - 4º Esquerdo",       "Apart. T3",   "4",    130, 366197.18,  977.94, "Enviar carta",                     734500],
  ["N - 5º Direito",        "Apart. T3",   "5",    158, 445070.42,  720.00, "Enviar carta",                     892700],
  ["O - 5º Esquerdo",       "Apart. T3",   "5",    130, 366197.18, 1838.88, "Enviar carta",                     734500],
  ["P - 6º Direito",        "Apart. T3",   "6",    106, 298591.55,  599.00, "Enviar carta",                     598900],
  ["Q - 6º Esquerdo",       "Apart. T3",   "6",    106, 298591.55, 1430.24, "Enviar carta",                     598900],
  ["R - 7º Direito",        "Apart. T3",   "7",    106, 298591.55,  764.75, "Negociar saída prévia",            598900],
  ["S - 7º Esquerdo",       "Apart. T3",   "7",    106, 298591.55, 1532.40, "Enviar carta",                     598900],
  ["T - 8º Andar",          "Apart. T4",   "8",    119, 335211.27, 1800.00, "Enviar carta",                     618800],
].map(([fracao, tipologia, piso, area, preco_aquisicao, renda_mensal, ocupacao, preco_tabela], i) => ({
  id: "spiral-" + i, projeto: "SPV Av Igreja", fracao, tipologia, piso, area,
  preco_aquisicao, renda_mensal, ocupacao, preco_tabela, status: "Disponível",
}));

// O estado como o Felipe o deu em 22/11/2026, que é posterior à folha de
// 17/11: as cartas saíram a 26/10, a F ainda não foi comunicada, a J está
// vazia e a G e a H têm o direito de preferência exercido.
const ESTADO = {
  G: ["Direito de preferência exercido", null],
  H: ["Direito de preferência exercido", null],
  F: ["Por comunicar", null],
  J: ["Vazio", null],
};
for (const f of F) {
  const [o, c] = ESTADO[f.fracao.split("-")[0].trim()] || ["Carta enviada", "2026-10-26"];
  f.ocupacao = o;
  f.data_carta = c;
}

const soSpiral = (p) => (p === "SPV Av Igreja" ? "spiral" : "outra");

console.log("Os totais batem com a folha:");
{
  const x = estadoDasFracoes({ fracoes: F, empresa: "spiral", empresaDe: soSpiral });
  ok(x.n === 19, `${x.n} frações (A a T, sem K)`);
  ok(x.aquisicao === 7000000, `aquisição ${x.aquisicao} € — o preço do CPCV`);
  ok(x.venda === 13271200, `venda de tabela ${x.venda} €`);
  ok(x.rendaMes === 16821.8, `renda ${x.rendaMes} €/mês`);
  ok(x.rendaAno === arred2(16821.8 * 12), `e ${x.rendaAno} €/ano`);
  ok(x.area === 2485, `área ${x.area} m2`);
  // A folha diz 2.277 no total porque a fórmula `=+SUM(E5:E21)+E3` salta o
  // B (89) e o T (119). 89 + 119 = 208. O valor certo é a soma das linhas.
  ok(x.area - 2277 === 208, "208 m2 a mais do que o total da folha, que salta o B e o T");
  ok(x.margem === arred2(13271200 - 7000000), `margem bruta ${x.margem} €`);
  ok(x.aquisicaoM2 === arred2(7000000 / 2485), `aquisição ${x.aquisicaoM2} €/m2`);
  ok(x.nArrendadas === 16 && x.nVazias === 3,
     `${x.nArrendadas} com renda, ${x.nVazias} sem`);
}

console.log("\nO estado de cada fração é o da folha:");
{
  const x = estadoDasFracoes({ fracoes: F, empresa: "spiral", empresaDe: soSpiral });
  const por = Object.fromEntries(x.porOcupacao.map(o => [o.k, o.n]));
  ok(por["Carta enviada"] === 15, `15 com carta enviada (${por["Carta enviada"]})`);
  ok(por["Direito de preferência exercido"] === 2, "2 com preferência exercida (G e H)");
  ok(por["Por comunicar"] === 1, "1 por comunicar (F)");
  ok(por["Vazio"] === 1, "1 vazia (J)");
  ok(15 + 2 + 1 + 1 === x.n, "e as quatro contas somam as 19");
  // A data da carta é uma DATA, não texto colado ao estado: é dela que
  // saem os prazos de oposição à renovação.
  const a = x.linhas.find(l => l.fracao.startsWith("A"));
  ok(a.dataCarta === "2026-10-26", `a carta da A saiu em ${a.dataCarta}`);
  ok(x.linhas.find(l => l.fracao.startsWith("F")).dataCarta === null,
     "e a F, que não foi comunicada, não tem data");
  // As duas com preferência exercida já não rendem: o inquilino vai comprar.
  const g = x.linhas.find(l => l.fracao.startsWith("G"));
  ok(g.renda === 0, "a G não tem renda");
  ok(x.linhas.every(l => l.status === "Disponível"),
     "e nenhuma está vendida — o estado comercial é outro eixo");
}

console.log("\nAs frações de um projeto não entram no report de outro:");
{
  // Isto não é cosmético: o report de um investidor não pode trazer o
  // mapa de vendas de um empreendimento que não é dele.
  const outra = estadoDasFracoes({ fracoes: F, empresa: "genero", empresaDe: soSpiral });
  ok(outra === null, "noutra empresa, não há frações nenhumas");
  const semResolvedor = estadoDasFracoes({ fracoes: F, empresa: "spiral" });
  ok(semResolvedor === null, "e sem resolvedor projeto→empresa também não");
  const semEmpresa = estadoDasFracoes({ fracoes: F, empresa: null });
  ok(semEmpresa?.n === 19, "só em «Todos os Projetos» é que entram todas");
}

console.log("\nNum projeto de venda nova o report NÃO muda:");
{
  // Quase todos os projetos têm frações — é o que se vende. O que só a Av.
  // da Igreja tem é inquilinos. Se o slide saísse por haver frações, todos
  // os outros reports ganhavam uma página com uma coluna "Estado do
  // inquilino" em branco.
  const vendaNova = [
    { id: "g1", projeto: "Maria Pia", fracao: "1A", tipologia: "T2", area: 80,
      preco_tabela: 400000, status: "Disponível" },
    { id: "g2", projeto: "Maria Pia", fracao: "1B", tipologia: "T1", area: 55,
      preco_tabela: 290000, status: "CPCV" },
  ];
  const soMariaPia = (p) => (p === "Maria Pia" ? "genero" : "outra");
  const x = estadoDasFracoes({ fracoes: vendaNova, empresa: "genero", empresaDe: soMariaPia });
  ok(x.n === 2, "as frações existem e contam-se na mesma");
  ok(x.temRentRoll === false, "mas não há rent roll nenhum: nem rendas nem inquilinos");

  const base = { nomeEmpresa: "Género Prudente", hoje: "2026-11-23", saldoAtual: 0,
                 saldoAnterior: 0, movimentos: [], meses: [], nMeses: 7 };
  const g = gerarReportCaixaPptx(construirReportCaixa({
    ...base, fracoes: vendaNova, empresa: "genero", empresaDe: soMariaPia }));
  ok(g.slides.length === 4, `o report fica com ${g.slides.length} slides, como antes`);
  const titulos = g.slides.flat().flatMap(s => {
    const ps = Array.isArray(s.paras) ? s.paras : (s.paras ? [s.paras] : []);
    return ps.flatMap(p => (Array.isArray(p?.runs) ? p.runs : Array.isArray(p) ? p : p ? [p] : []))
             .map(r => String(r?.t || ""));
  });
  ok(!titulos.some(t => /Frações/.test(t)), "e não aparece nenhuma página de frações");

  // Basta uma renda para o prédio passar a ter rent roll.
  const comUm = [...vendaNova, { ...vendaNova[0], id: "g3", fracao: "2A",
    renda_mensal: 750, ocupacao: "Carta enviada" }];
  const y = estadoDasFracoes({ fracoes: comUm, empresa: "genero", empresaDe: soMariaPia });
  ok(y.temRentRoll === true, "com um inquilino que seja, o quadro passa a fazer sentido");
}

console.log("\nO slide só existe quando há frações:");
{
  const base = {
    nomeEmpresa: "Spiral Treasure (SPV Av Igreja)", hoje: "2026-11-22",
    saldoAtual: 575.57, saldoAnterior: 2498.96, movimentos: [], meses: [], nMeses: 7,
  };
  const com = gerarReportCaixaPptx(construirReportCaixa({
    ...base, fracoes: F, empresa: "spiral", empresaDe: soSpiral }));
  const sem = gerarReportCaixaPptx(construirReportCaixa({ ...base }));
  ok(com.slides.length === 5, `com frações: ${com.slides.length} slides`);
  ok(sem.slides.length === 4, `sem frações: ${sem.slides.length} slides`);
  // E a numeração do rodapé acompanha, senão havia dois slides "04.".
  const numeros = (g) => g.slides.map(s => {
    const r = s.filter(x => x.paras).flatMap(x =>
      (Array.isArray(x.paras) ? x.paras : [x.paras]).flatMap(p =>
        Array.isArray(p?.runs) ? p.runs : Array.isArray(p) ? p : p ? [p] : []));
    const n = r.map(y => String(y?.t || "")).find(t => /^\d\d\.$/.test(t));
    return n || "?";
  });
  ok(numeros(com).join(" ") === "01. 02. 03. 04. 05.",
     `numeração com frações: ${numeros(com).join(" ")}`);
  ok(numeros(sem).join(" ") === "01. 02. 03. 04.",
     `e sem: ${numeros(sem).join(" ")}`);
}

const slideDas = (fracoes) => {
  const g = gerarReportCaixaPptx(construirReportCaixa({
    nomeEmpresa: "X", hoje: "2026-11-22", saldoAtual: 0, saldoAnterior: 0,
    movimentos: [], meses: [], nMeses: 7,
    fracoes, empresa: "spiral", empresaDe: soSpiral }));
  return g.slides[3];
};

console.log("\nNada sai da folha, com poucas frações ou com muitas:");
{
  const REGUA = 6.95;
  const muitas = (n) => Array.from({ length: n }, (_, i) => ({
    id: "f" + i, projeto: "SPV Av Igreja", fracao: `Fração número ${i + 1} do bloco`,
    tipologia: "Apart. T3", piso: String(i % 9), area: 100 + i,
    preco_aquisicao: 300000, renda_mensal: i % 3 ? 900 : 0,
    ocupacao: i % 4 ? "Negociar saída prévia com o inquilino" : "Vazio",
    preco_tabela: 600000, status: "Disponível" }));

  for (const n of [1, 2, 7, 19, 24, 30]) {
    const slide = slideDas(n === 19 ? F : muitas(n));
    const fundo = Math.max(0, ...slide.map(x => {
      if (Array.isArray(x.linhas)) return x.y + x.linhas.reduce((s, l) => s + l.altura, 0);
      return (x.y ?? 0) >= REGUA ? 0 : (x.y ?? 0) + (x.cy ?? 0);
    }));
    ok(fundo <= REGUA, `${String(n).padStart(2)} frações → acaba em ${fundo.toFixed(2)} (régua ${REGUA})`);
  }
}

console.log("\nAs duas colunas não se montam uma na outra:");
{
  const slide = slideDas(F);
  const tabs = slide.filter(x => Array.isArray(x.linhas)).sort((a, b) => a.x - b.x);
  ok(tabs.length === 2, `${tabs.length} blocos`);
  const larg = (t) => t.larguras.reduce((a, b) => a + b, 0);
  ok(tabs[0].x + larg(tabs[0]) <= tabs[1].x + 0.001,
     `o da esquerda acaba em ${(tabs[0].x + larg(tabs[0])).toFixed(2)}, `
     + `o da direita começa em ${tabs[1].x.toFixed(2)}`);
  ok(tabs[1].x + larg(tabs[1]) <= 12.63 + 0.001, "e o da direita cabe na margem");
  ok(tabs[0].linhas.length - 1 === 10 && tabs[1].linhas.length - 2 === 9,
     "10 frações à esquerda, 9 à direita");
}

console.log("\nNenhum texto é largo demais para a sua célula:");
{
  // É isto que impede uma célula de partir em duas linhas e escrever por
  // cima da linha seguinte.
  const slide = slideDas(F);
  const larguraDe = (t, fonte, sz) =>
    [...t].reduce((a, c) => a + (LARGURAS[fonte][c] ?? 500), 0) / 1000 * sz;
  let maus = [];
  for (const tab of slide.filter(x => Array.isArray(x.linhas))) {
    for (const linha of tab.linhas) {
      linha.celulas.forEach((c, i) => {
        const t = String(c?.t ?? "");
        if (!t) return;
        const w = larguraDe(t, c.b ? "Helvetica-Bold" : "Helvetica", c.sz || 8.5);
        const cabe = (tab.larguras[i] - 0.10) * 72;
        if (w > cabe) maus.push(`"${t}" (${w.toFixed(0)}pt em ${cabe.toFixed(0)}pt)`);
      });
    }
  }
  ok(maus.length === 0, maus.length ? `transbordam: ${maus.slice(0, 3).join(", ")}`
                                    : "todas as células cabem na sua coluna");
}

console.log("\nA unidade de área não desaparece no PDF:");
{
  // O ² é 0xB2 em WinAnsi e o byte sai certo, mas o glifo não existe nas
  // fontes base-14 e some sem deixar "?". Uma área sem unidade, ou um
  // "€/m" em vez de "€/m2", é um erro que ninguém vê a tempo.
  const g = gerarReportCaixaPptx(construirReportCaixa({
    nomeEmpresa: "X", hoje: "2026-11-22", saldoAtual: 0, saldoAnterior: 0,
    movimentos: [], meses: [], nMeses: 7,
    fracoes: F, empresa: "spiral", empresaDe: soSpiral }));
  // Mede-se no modelo das formas, não nos bytes do ficheiro: o PDF leva o
  // logótipo como PNG comprimido, e esses bytes acertam em 0xB2 e até em
  // parênteses seguidos de "Tj" por acaso. O que se controla é o texto.
  const textos = g.slides.flat().flatMap(x => {
    const dos = [];
    if (Array.isArray(x.linhas))
      for (const l of x.linhas) for (const c of l.celulas) dos.push(String(c?.t ?? ""));
    const ps = Array.isArray(x.paras) ? x.paras : (x.paras ? [x.paras] : []);
    for (const p of ps)
      for (const r of (Array.isArray(p?.runs) ? p.runs : Array.isArray(p) ? p : p ? [p] : []))
        dos.push(String(r?.t ?? ""));
    return dos;
  });
  const comExpoente = textos.filter(t => /[²³]/.test(t));
  ok(comExpoente.length === 0,
     comExpoente.length ? `ainda há expoentes: ${comExpoente.slice(0, 3).join(", ")}`
                        : "nenhum ² nem ³ em texto nenhum do deck");
  ok(textos.some(t => t.includes("m2")), "e a unidade está lá escrita como m2");
}

console.log("\nO PDF e o .pptx saem com o slide lá dentro:");
{
  const g = gerarReportCaixaPptx(construirReportCaixa({
    nomeEmpresa: "Spiral Treasure (SPV Av Igreja)", hoje: "2026-11-22",
    saldoAtual: 575.57, saldoAnterior: 2498.96, movimentos: [], meses: [], nMeses: 7,
    fracoes: F, empresa: "spiral", empresaDe: soSpiral }));
  const s = Buffer.from(g.pdf).toString("latin1");
  ok((s.match(/\/Type\s*\/Page[^s]/g) || []).length === 5, "cinco páginas no PDF");
  ok(s.includes("Restaurante"), "a fração A está no PDF");
  ok(s.includes("13.271.200"), "e o total de venda também");
  ok(g.dados?.length > 10000, `pptx com ${Math.round(g.dados.length / 1024)} KB`);
}

console.log("\nCasos de fronteira:");
{
  ok(estadoDasFracoes({ fracoes: [], empresa: null }) === null, "sem frações, não há bloco");
  ok(estadoDasFracoes({}) === null, "sem argumentos nenhuns também não");
  const semArea = estadoDasFracoes({
    fracoes: [{ projeto: "p", fracao: "X", area: 0, preco_tabela: 1000 }], empresa: null });
  ok(semArea.vendaM2 === 0, "uma fração sem área não divide por zero");
  ok(semArea.linhas[0].eurM2 === 0, "e o €/m2 dela fica a 0");
}

console.log(mau === 0 ? "\n✅ Frações no report OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
