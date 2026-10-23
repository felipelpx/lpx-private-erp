// ─────────────────────────────────────────────────────────────────────────────
// RUBRICAS
//
// O plano de contas de cada empresa, tal como está no Categorias.xlsx, usado
// como eixo único dos ecrãs de Investor Relations: a cascata do fluxo de
// caixa, os centros de custo e o Real × Orçado falam todos a mesma língua.
//
// Antes, os gráficos passavam pelo src/nomenclatura.js, que colapsava dezenas
// de categorias em três baldes ("Aporte sócios", "Funding banco", …). Dava um
// gráfico arrumado mas que não era o fluxo operacional de ninguém: as rubricas
// do ecrã não eram as rubricas das planilhas. Aqui não se renomeia nada — a
// rubrica de um movimento é a categoria com que ele está classificado, e a
// ordem é a ordem do plano da empresa.
//
// O que continua de fora são os movimentos que não são fluxo do projeto:
// ajustes e transferências entre contas do mesmo grupo, que entram e saem pelo
// mesmo valor. Ficam contados à parte e dizem-se no rodapé, nunca em silêncio.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIAS } from "./categorias.js";
import { categoriasDa } from "./categoriasEmpresa.js";
import { ocultarNoGrafico } from "./nomenclatura.js";
import { EMPRESAS } from "./empresas.js";
import { LINHAS_FO_HDG, linhaDoFluxoHDG, GRUPOS_FO_HDG } from "./rubricasHDG.js";

import { rubricaNoFluxo } from "./obra.js";
// Os projetos HDG têm FO hierárquicas e a linha do fluxo é a DESPESA, não o
// bloco que a contém. Ver src/rubricasHDG.js.
const HDG = new Set(EMPRESAS.filter(e => e.grupo === "HDG").map(e => e.id));
export const ehProjetoHDG = (empresaId) => HDG.has(empresaId);

export const SEM_RUBRICA = "Sem categoria";

// Comparação à prova de acentos, underscores e espaços a mais: no extrato
// convivem "Soft_Costs", "Soft Costs" e "soft costs".
export const chaveRubrica = (t) => String(t || "").trim()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/_/g, " ").replace(/\s+/g, " ").toLowerCase();

const arred2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;

// ─── A lista de rubricas de uma empresa ──────────────────────────────────────
// Pela ordem do plano, que é a ordem do Excel — e é essa ordem que o
// utilizador espera ver no gráfico e na tabela.
//
// O Excel traz, em pelo menos um plano, a mesma rubrica escrita de duas
// maneiras ("Impostos e taxas" e "Impostos e Taxas"). São a mesma coisa e os
// movimentos de uma caem na outra, por isso a lista sai sem o duplicado —
// senão a tabela do Real × Orçado mostrava duas linhas iguais, uma a zero.
export function rubricasDa(empresaId) {
  // Num projeto HDG o eixo é a linha da FO, não a categoria do extrato.
  if (ehProjetoHDG(empresaId)) return LINHAS_FO_HDG;
  const proprias = categoriasDa(empresaId);
  const lista = proprias && proprias.length ? proprias : CATEGORIAS;
  const vistas = new Set();
  return lista.filter(c => {
    const k = chaveRubrica(c);
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

// Posição de uma rubrica no plano. Quem não está no plano vai para o fim,
// mas aparece — esconder um gasto porque está mal classificado seria pior.
export function ordemDaRubrica(empresaId, rubrica) {
  const i = rubricasDa(empresaId).findIndex(c => chaveRubrica(c) === chaveRubrica(rubrica));
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
}

export function rubricaNoPlano(empresaId, rubrica) {
  return rubricasDa(empresaId).some(c => chaveRubrica(c) === chaveRubrica(rubrica));
}

// ─── A rubrica de um movimento ───────────────────────────────────────────────
// Devolve null quando o movimento não é fluxo do projeto.
//
// Quando a categoria do movimento bate numa rubrica do plano, devolve-se o
// nome como o plano o escreve (e não como o extrato o escreveu), para que
// "Soft_Costs" e "Soft Costs" sejam uma linha só no gráfico.
//
// Um ajuste sai SEMPRE, mesmo sendo uma rubrica do plano: não é dinheiro que
// o projeto ganhou ou gastou, é uma correção de lançamento. Entra e sai pelo
// mesmo valor e só suja a leitura. O mesmo para as transferências entre
// contas do mesmo grupo. O que ficou de fora diz-se no rodapé, nunca em
// silêncio — e no extrato continua lá, intacto.
export function rubricaDe(empresaId, categoria, subcategoria) {
  if (ocultarNoGrafico(categoria, subcategoria)) return null;
  // HDG: a subcategoria é que é a linha da FO; e o que foi lançado com o
  // vocabulário LPX ("Obra", "Fee Gestão") traduz-se para a linha certa.
  if (ehProjetoHDG(empresaId)) {
    const linha = linhaDoFluxoHDG(categoria, subcategoria);
    if (linha) return linha;
  }
  const bruta = String(categoria || "").trim();
  if (!bruta) return SEM_RUBRICA;
  const doPlano = rubricasDa(empresaId).find(c => chaveRubrica(c) === chaveRubrica(bruta));
  return doPlano || bruta;
}

// A mesma pergunta, para uma rubrica sem movimento associado: serve para as
// listas não semearem uma linha de ajustes que nunca vai ter nada.
export const ehAjuste = (rubrica) => ocultarNoGrafico(rubrica, "");

// ─── Famílias de rubricas ────────────────────────────────────────────────────
// Um plano de contas tem nove linhas de "Aporte <investidor>" e cinco de
// "Mútuo <quem>". Isso serve para classificar um lançamento, mas num gráfico
// para investidor são catorze barras a dizer a mesma coisa: entrou capital.
//
// Isto é uma camada de APRESENTAÇÃO, e só dos gráficos. A classificação do
// extrato, do Caixa Único e do Real × Orçado continua rubrica a rubrica — não
// se perde detalhe nenhum, só se junta na hora de desenhar.
// Rubricas que no gráfico levam outro nome. O plano de contas diz "Funding";
// num quadro para investidor isso é o desembolso do banco, e é assim que se
// chama. O nome na base de dados não muda.
export const RENOMEAR = {
  funding: "Funding Banco",
  "funding banco": "Funding Banco",
  "funding bancario": "Funding Banco",
  financiamento: "Funding Banco",
};

export function nomeDeApresentacao(rubrica) {
  return RENOMEAR[chaveRubrica(rubrica)] || rubrica;
}

export const FAMILIAS = [
  { nome: "Aportes e Mútuos", teste: (k) =>
      /^(aporte|mutuo|suprimento)/.test(k) || / - aporte\/resgate$/.test(k) },
  { nome: "Resgates", teste: (k) => /^(resgate|devolucao)/.test(k) },
];

// A família de uma rubrica, ou a própria rubrica quando não pertence a nenhuma.
export function familiaDe(rubrica) {
  const k = chaveRubrica(rubrica);
  const f = FAMILIAS.find(x => x.teste(k));
  return f ? f.nome : nomeDeApresentacao(rubrica);
}

export const ehFamilia = (nome) => FAMILIAS.some(f => f.nome === nome);

// ─── Capital e financiamento ────────────────────────────────────────────────
// O bloco que abre todos os planos: aportes, resgates, mútuos, funding e
// amortização. Não é operação do projeto — é como o projeto é pago. O Real ×
// Orçado mostra a operação, e por isso corta este bloco de cima.
const CAPITAL = /^(aporte|resgate|mutuo|suprimento|funding|financiamento|amortizacao|devolucao)/;

export function ehCapital(rubrica) {
  const k = chaveRubrica(rubrica);
  return CAPITAL.test(k) || / - aporte\/resgate$/.test(k);
}

// ─── Movimentos entre contas da mesma empresa ───────────────────────────────
// "Intra-Group (TRF)" e "Transferências" não são receita nem custo: é
// dinheiro a mudar de conta dentro da mesma empresa. Aparecem no extrato
// porque saem de um lado e entram no outro, mas no Real × Orçado inflavam as
// entradas com um valor que nunca entrou no projeto — 13 000 € nas entradas
// da Infinite Change contra um orçado vazio, sem nada a explicá-lo.
//
// O gráfico já os escondia pela subcategoria ("movimento entre contas do
// mesmo grupo"); faltava a rubrica ter nome próprio.
const TRANSFERENCIA_INTERNA = /^(intra[\s-]?group|transferencia)/;

export function ehTransferenciaInterna(rubrica) {
  return TRANSFERENCIA_INTERNA.test(chaveRubrica(rubrica));
}

// ─── A terceira secção ──────────────────────────────────────────────────────
// Receitas, custos e funding são três coisas diferentes, e uma folha que
// mete o funding no meio dos custos não se consegue ler: a amortização
// aparece ao lado da obra como se fosse mais uma despesa do projeto, e o
// líquido do mês confunde "o projeto deu dinheiro" com "o banco desembolsou".
//
// Daí a terceira secção, no fluxo e no Real × Orçado: i) receitas,
// ii) custos, iii) funding. Nas empresas LPX o bloco é o Funding e a
// Amortização (mais aportes, resgates e mútuos, que já viviam à parte); nos
// projetos HDG é o grupo "Financiamento" da FO inteiro — Inflow - Obra,
// Inflow - Terreno, Outlow - Repagamento, Outflow - Juros e Outflow - Taxas
// e comissões. É a própria FO que os junta ali, e os juros de um empréstimo
// são custo do financiamento, não custo da obra.
// Do bloco "Financiamento" da FO, só o CAPITAL é que é funding: o desembolso
// do banco e a amortização. Os juros e as comissões bancárias são CUSTO — o
// preço do dinheiro, que sai da conta e não volta —, e é assim que já estavam
// nas empresas LPX, onde "Juros" e "Encargos financeiros" são rubricas de
// custo. Tê-los no funding punha o mesmo encargo em secções diferentes
// conforme a empresa, e tirava-os do total de custos onde eles pesam.
const CUSTO_APESAR_DO_BLOCO = /^(outflow - juros|outflow - taxas e comissoes)$/;

const FINANCIAMENTO_HDG = new Set(
  (GRUPOS_FO_HDG.find(g => g.grupo === "Financiamento")?.linhas || [])
    .map(chaveRubrica)
    .filter(k => !CUSTO_APESAR_DO_BLOCO.test(k)));

export function ehFunding(rubrica) {
  if (ehCapital(rubrica)) return true;
  return FINANCIAMENTO_HDG.has(chaveRubrica(rubrica));
}

// Onde é que a operação começa no plano desta empresa: a seguir ao bloco de
// capital que abre a lista. Na Favorite Closet é o "Vendas", que vem depois
// de nove aportes, nove resgates, cinco mútuos, a amortização e o funding.
export function inicioDaOperacao(empresaId) {
  const plano = rubricasDa(empresaId);
  const i = plano.findIndex(c => !ehCapital(c));
  return i < 0 ? 0 : i;
}

// ─── As categorias que fazem sentido numa FATURA ────────────────────────────
// O Contas a Pagar é de faturas de fornecedores. Aportes, resgates, mútuos,
// funding e amortizações não são faturas de ninguém — são movimentos de
// capital —, e vendas e comissões recebidas também não.
//
// Até aqui o formulário oferecia a lista GLOBAL, igual para todas as
// empresas. Nos projetos HDG isso era simplesmente outro plano de contas: o
// utilizador escolhia "Obra" numa empresa cujo plano fala de "Obras >
// Gastos com Obras", e a fatura entrava fora do plano.
const FORA_DA_FATURA = new Set([
  "vendas", "comissao", "receita", "receitas de comissao",
  "development fee (receitas)", "outras receitas", "ajuste", "reservas",
  "socios", "socios (suprimento)",
]);

export function categoriasDeFatura(empresaId) {
  const plano = categoriasDa(empresaId);
  if (!plano || !plano.length) return CATEGORIAS;
  return plano.filter(c => !ehCapital(c) && !FORA_DA_FATURA.has(chaveRubrica(c)));
}

// ─── Agrupar movimentos por rubrica ──────────────────────────────────────────
// Devolve as rubricas com movimento, pela ordem do plano, cada uma com o que
// entrou, o que saiu e o líquido. As que o plano não conhece vão no fim,
// marcadas, para se verem e se corrigirem.
//
// `excluidas` é o que ficou de fora e porquê — o rodapé do gráfico precisa
// disso para dizer o que não está lá.
// O IVA da obra lido como obra. Vive em src/obra.js, que é onde o plano e o
// Fluxo Futuro já o liam assim; aqui só se aplica a mesma regra, para o
// gráfico não contar de uma maneira e a tabela de outra.
const ehIvaDeObraNaObra = (empresaId, rubrica, descricao) =>
  rubricaNoFluxo(ehProjetoHDG(empresaId) ? "HDG" : "LPX", rubrica, descricao);

export function agruparPorRubrica(movimentos, { empresaId, agrupar = false } = {}) {
  const porRubrica = new Map();
  let excluido = 0, nExcluidos = 0;
  const nomesExcluidos = new Set();

  (movimentos || []).forEach(m => {
    const v = Number(m?.valor) || 0;
    const r0 = rubricaDe(empresaId, m?.categoria, m?.subcategoria);
    if (r0 === null) {
      excluido += v; nExcluidos++;
      if (m?.categoria) nomesExcluidos.add(String(m.categoria).trim());
      return;
    }
    // O IVA da obra é obra, aqui como nos outros ecrãs. Sem isto o gráfico
    // mostrava uma barra de "IVA de obra" ao lado de uma linha da tabela que
    // já o tinha dentro — os dois a dizerem números diferentes sobre o mesmo
    // movimento, que é a classe de bug que isto toda veio corrigir.
    const r1 = ehIvaDeObraNaObra(empresaId, r0, m?.movimento || m?.detalhes || "");
    // Com `agrupar`, catorze rubricas de capital tornam-se uma barra só. A
    // rubrica original fica guardada em `inclui`, para a dica poder dizer o
    // que está lá dentro — juntar não é esconder.
    const r = agrupar ? familiaDe(r1) : r1;
    const a = porRubrica.get(r) || { rubrica: r, entrada: 0, saida: 0, n: 0, inclui: new Set() };
    if (v >= 0) a.entrada += v; else a.saida += v;
    a.n++;
    a.inclui.add(r0);
    porRubrica.set(r, a);
  });

  const linhas = [...porRubrica.values()].map(a => {
    const familia = agrupar && ehFamilia(a.rubrica);
    // A família ocupa o lugar da primeira das suas rubricas no plano, para
    // continuar a sair pela ordem do Excel.
    const ordem = familia
      ? Math.min(...[...a.inclui].map(r => ordemDaRubrica(empresaId, r)))
      : ordemDaRubrica(empresaId, a.rubrica);
    return {
      rubrica: a.rubrica, n: a.n,
      entrada: arred2(a.entrada),
      saida: arred2(a.saida),
      liquido: arred2(a.entrada + a.saida),
      // Quem decide se está no plano são as rubricas de ORIGEM, não o nome
      // que a barra leva: "Funding Banco" e "Aportes e Mútuos" são nomes de
      // apresentação e não existem no Excel — sem isto saíam marcados a
      // vermelho como se fossem classificações erradas.
      noPlano: [...a.inclui].every(r => rubricaNoPlano(empresaId, r)),
      familia,
      inclui: [...a.inclui].sort((x, y) =>
        ordemDaRubrica(empresaId, x) - ordemDaRubrica(empresaId, y)),
      ordem,
    };
  }).sort((x, y) => x.ordem - y.ordem ||
                    String(x.rubrica).localeCompare(String(y.rubrica), "pt"));

  return {
    linhas,
    entradas: arred2(linhas.reduce((s, l) => s + l.entrada, 0)),
    saidas:   arred2(linhas.reduce((s, l) => s + l.saida, 0)),
    excluido: arred2(excluido),
    nExcluidos,
    nomesExcluidos: [...nomesExcluidos].sort((a, b) => a.localeCompare(b, "pt")),
  };
}

// ─── Os passos da cascata ────────────────────────────────────────────────────
// Uma barra por rubrica, pelo LÍQUIDO. Uma rubrica que tenha entradas e
// saídas — o funding, que o banco liberta e o projeto amortiza — vale o que
// sobra: é esse o efeito no caixa, e é isso que uma cascata conta.
//
// O bruto não se perde: vai na dica de cada barra, para quem quiser abrir.
//
// Primeiro as que somam, depois as que subtraem, e dentro de cada bloco da
// maior para a menor — a cascata sobe em degrau e depois desce.
export function passosDaCascata(agregado) {
  const passos = agregado.linhas
    .filter(l => Math.abs(l.liquido) > 0.005)
    .map(l => ({
      nome: l.rubrica, rubrica: l.rubrica, valor: l.liquido,
      noPlano: l.noPlano, n: l.n,
      familia: !!l.familia, inclui: l.inclui || [],
      // Só vale a pena falar em bruto quando os dois lados existem.
      bruto: (Math.abs(l.entrada) > 0.005 && Math.abs(l.saida) > 0.005)
        ? { entrada: l.entrada, saida: l.saida } : null,
    }));
  // Dentro de cada bloco, da maior para a menor: numa cascata lê-se o que
  // pesa primeiro, e as barras ficam em degrau em vez de serra.
  const porGrandeza = (a, b) => Math.abs(b.valor) - Math.abs(a.valor);
  return [...passos.filter(p => p.valor > 0).sort(porGrandeza),
          ...passos.filter(p => p.valor < 0).sort(porGrandeza)];
}

export default { rubricasDa, rubricaDe, agruparPorRubrica, passosDaCascata };


// ─── O que os formulários de previsão oferecem ───────────────────────────────
// Uma previsão, uma recorrente ou uma fatura entram no fluxo, por isso têm de
// ser classificadas com a mesma régua dos ecrãs de fluxo: nas empresas LPX é
// o plano de contas, nos projetos HDG são as linhas da FO.
export function opcoesDeRubrica(empresaId) {
  if (ehProjetoHDG(empresaId)) return LINHAS_FO_HDG;
  return categoriasDa(empresaId) || CATEGORIAS;
}
