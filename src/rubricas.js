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
// A ordem das duas verificações é deliberada: uma rubrica que ESTÁ no plano da
// empresa nunca é escondida, mesmo chamando-se "Ajuste" ou "Transferências" —
// se o plano operacional a tem, o gráfico tem de a ter, ou deixa de ser o
// fluxo que o Felipe conhece. A limpeza dos ajustes só apanha o que anda fora
// do plano, que é onde ela nasceu.
export function rubricaDe(empresaId, categoria, subcategoria) {
  const bruta = String(categoria || "").trim();
  if (!bruta) return ocultarNoGrafico(categoria, subcategoria) ? null : SEM_RUBRICA;
  const doPlano = rubricasDa(empresaId).find(c => chaveRubrica(c) === chaveRubrica(bruta));
  if (doPlano) return doPlano;
  return ocultarNoGrafico(categoria, subcategoria) ? null : bruta;
}

// ─── Agrupar movimentos por rubrica ──────────────────────────────────────────
// Devolve as rubricas com movimento, pela ordem do plano, cada uma com o que
// entrou, o que saiu e o líquido. As que o plano não conhece vão no fim,
// marcadas, para se verem e se corrigirem.
//
// `excluidas` é o que ficou de fora e porquê — o rodapé do gráfico precisa
// disso para dizer o que não está lá.
export function agruparPorRubrica(movimentos, { empresaId } = {}) {
  const porRubrica = new Map();
  let excluido = 0, nExcluidos = 0;
  const nomesExcluidos = new Set();

  (movimentos || []).forEach(m => {
    const v = Number(m?.valor) || 0;
    const r = rubricaDe(empresaId, m?.categoria, m?.subcategoria);
    if (r === null) {
      excluido += v; nExcluidos++;
      if (m?.categoria) nomesExcluidos.add(String(m.categoria).trim());
      return;
    }
    const a = porRubrica.get(r) || { rubrica: r, entrada: 0, saida: 0, n: 0 };
    if (v >= 0) a.entrada += v; else a.saida += v;
    a.n++;
    porRubrica.set(r, a);
  });

  const linhas = [...porRubrica.values()].map(a => ({
    ...a,
    entrada: arred2(a.entrada),
    saida: arred2(a.saida),
    liquido: arred2(a.entrada + a.saida),
    noPlano: rubricaNoPlano(empresaId, a.rubrica),
    ordem: ordemDaRubrica(empresaId, a.rubrica),
  })).sort((x, y) => x.ordem - y.ordem ||
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
// Entradas primeiro, depois saídas, cada bloco pela ordem do plano. Uma
// rubrica com os dois sinais aparece duas vezes — é o bruto que interessa ver,
// não o líquido: 1 M € de funding libertado e 300 k € de amortização não são
// a mesma coisa que 700 k € de "funding".
//
// Só nesse caso é que o rótulo leva o sufixo; uma rubrica que só tenha um
// sinal fica com o nome limpo.
export function passosDaCascata(agregado) {
  const temAmbos = (l) => Math.abs(l.entrada) > 0.005 && Math.abs(l.saida) > 0.005;
  const entradas = agregado.linhas.filter(l => Math.abs(l.entrada) > 0.005)
    .map(l => ({ nome: temAmbos(l) ? `${l.rubrica} (entradas)` : l.rubrica,
                 rubrica: l.rubrica, valor: l.entrada, noPlano: l.noPlano, n: l.n }));
  const saidas = agregado.linhas.filter(l => Math.abs(l.saida) > 0.005)
    .map(l => ({ nome: temAmbos(l) ? `${l.rubrica} (saídas)` : l.rubrica,
                 rubrica: l.rubrica, valor: l.saida, noPlano: l.noPlano, n: l.n }));
  return [...entradas, ...saidas];
}

export default { rubricasDa, rubricaDe, agruparPorRubrica, passosDaCascata };
