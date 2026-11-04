// ─────────────────────────────────────────────────────────────────────────────
// FILTROS DE MUITAS ESCOLHAS
//
// Um filtro que só deixa escolher UMA coisa obriga a ver o mesmo ecrã várias
// vezes para responder a uma pergunta só — "quanto é que devo à Fiscalização
// nos três projetos do Amadeu?" dava três voltas e uma soma à mão.
//
// A regra, e é a mesma em todos: NADA ESCOLHIDO QUER DIZER TUDO. É o
// contrário de "nada escolhido, nada aparece", que é o que uma lista de
// caixas costuma fazer e que deixaria o ecrã vazio à primeira limpeza.
//
// Isto aqui é só a aritmética, sem React: é o que permite testá-la direta.
// ─────────────────────────────────────────────────────────────────────────────

const texto = (v) => String(v ?? "").trim();

/** Mete ou tira um valor da lista. É o que um clique numa caixa faz. */
export function alternar(lista, valor) {
  const atual = Array.isArray(lista) ? lista : [];
  const v = texto(valor);
  if (!v) return atual;
  return atual.includes(v) ? atual.filter(x => x !== v) : [...atual, v];
}

/**
 * Passa no filtro?
 *
 * @param escolhidos  o que está selecionado. Vazio = tudo passa.
 * @param valor       o valor da linha
 * @param igual       como se comparam (por omissão, texto exato). É por aqui
 *                    que o "Pendente" apanha o "Pendente atrasado" e o
 *                    "Pendente em dia" — ver `comparaStatus`.
 */
export function passaNoFiltro(escolhidos, valor, igual = null) {
  const lista = Array.isArray(escolhidos) ? escolhidos.filter(Boolean) : [];
  if (lista.length === 0) return true;              // nada escolhido = tudo
  const cmp = typeof igual === "function" ? igual : (a, b) => texto(a) === texto(b);
  return lista.some(e => { try { return !!cmp(e, valor); } catch { return false; } });
}

/**
 * O "Pendente" do Contas a Pagar é um botão só para dois estados — "Pendente
 * em dia" e "Pendente atrasado". Cada linha continua a dizer qual é; o filtro
 * é que não obriga a escolher entre os dois.
 */
export const comparaStatus = (escolhido, status) =>
  texto(escolhido) === "Pendente"
    ? texto(status).startsWith("Pendente")
    : texto(escolhido) === texto(status);

/**
 * O que escrever no botão do filtro.
 *
 * Com uma escolha diz o nome dela — esconder "Favorite Closet" atrás de
 * "1 projeto" seria tirar informação a troco de nada. Com várias, diz
 * quantas, que é o que cabe.
 */
export function rotuloDoFiltro(escolhidos, { vazio = "Todos", nomeDe = null,
                                            singular = "escolhido",
                                            plural = "escolhidos" } = {}) {
  const lista = Array.isArray(escolhidos) ? escolhidos.filter(Boolean) : [];
  if (lista.length === 0) return vazio;
  if (lista.length === 1) {
    const n = typeof nomeDe === "function" ? nomeDe(lista[0]) : null;
    return texto(n) || texto(lista[0]);
  }
  return `${lista.length} ${lista.length === 1 ? singular : plural}`;
}

/**
 * Limpa de uma lista de escolhas o que já não existe.
 *
 * Um projeto deixa de estar visível para o utilizador (mudou de grupo, ou
 * perdeu-lhe o acesso) e a escolha fica lá presa: o ecrã mostrava-se vazio
 * sem nada a explicar porquê. Guardar uma escolha que não existe é guardar um
 * filtro invisível.
 */
export function limparEscolhasMortas(escolhidos, validos) {
  const lista = Array.isArray(escolhidos) ? escolhidos : [];
  const ok = new Set((Array.isArray(validos) ? validos : []).map(texto));
  const limpa = lista.filter(x => ok.has(texto(x)));
  // Devolve a MESMA lista quando nada mudou, para não disparar renders em ciclo.
  return limpa.length === lista.length ? lista : limpa;
}

export default { alternar, passaNoFiltro, comparaStatus, rotuloDoFiltro,
                 limparEscolhasMortas };
