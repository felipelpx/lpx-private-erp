// ─────────────────────────────────────────────────────────────────────────────
// ESCREVER NA BASE SEM PERDER O RESTO
//
// O ecrã e a base de dados andam em passos diferentes: o ecrã já grava um campo
// novo e a migração só corre dias depois. O PostgREST responde a isso
// rejeitando o UPDATE INTEIRO. O que se via era o diálogo a fechar como se
// tivesse guardado, com o número velho na tabela — uma coluna em falta apagava
// em silêncio a alteração toda.
//
// Aqui tira-se a coluna de que ele se queixa e tenta-se outra vez, até o resto
// passar. O que ficou por gravar vem em `ignoradas`, para quem chama o DIZER,
// em vez de o esconder.
//
// Sem React e sem o cliente do Supabase de propósito: assim testa-se isto em
// Node, direto, que é onde as avarias de gravação se apanham depressa.
// ─────────────────────────────────────────────────────────────────────────────

const PADROES_COLUNA_EM_FALTA = [
  /Could not find the '([^']+)' column/i,     // PostgREST, PGRST204
  /column "([^"]+)" of relation/i,            // Postgres, 42703
  /column ([a-z0-9_]+) does not exist/i,
];

/** O nome da coluna de que o erro se queixa, ou null se o erro for outro. */
export function colunaEmFalta(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`;
  for (const re of PADROES_COLUNA_EM_FALTA) {
    const m = msg.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

/** Campos auxiliares do React (`_frac`, `_semVenda`) nunca são colunas. */
export const semAuxiliares = (o) => Object.fromEntries(
  Object.entries(o || {}).filter(([k]) => !k.startsWith("_")));

/**
 * Executa a escrita, tirando as colunas que a base diz não ter.
 *
 * @param executar  (corpo) => Promise<{ data, error }> — a chamada ao Supabase
 * @param payload   o que se quer gravar
 * @returns { data, error, ignoradas, semEfeito }
 *
 * `semEfeito` é a armadilha calada: um UPDATE recusado pelo RLS devolve
 * `data: []` com `error: null`. Não é sucesso — é uma recusa sem erro. Já
 * custou caro uma vez, no apagar das previsões do plano de obra.
 */
export async function escreverTolerante(executar, payload, maxTentativas = 8) {
  const ignoradas = [];
  const corpo = { ...payload };

  for (let i = 0; i <= maxTentativas; i++) {
    if (Object.keys(corpo).length === 0) {
      return { data: null, ignoradas, semEfeito: false,
               error: { message: "Nenhum dos campos existe na base de dados." } };
    }

    const r = await executar(corpo);
    const data = r?.data, error = r?.error;

    if (!error) {
      const semEfeito = Array.isArray(data) && data.length === 0;
      return { data, error: null, ignoradas, semEfeito };
    }

    const col = colunaEmFalta(error);
    // Um erro que não seja de coluna em falta — ou de uma coluna que já não
    // está no corpo — não se resolve a tentar outra vez.
    if (!col || !(col in corpo)) return { data, error, ignoradas, semEfeito: false };

    delete corpo[col];
    ignoradas.push(col);
  }

  return { data: null, ignoradas, semEfeito: false,
           error: { message: "Demasiadas colunas em falta; nada foi gravado." } };
}

/**
 * Mete (ou substitui) uma linha numa lista, pelo id. É a atualização local que
 * se faz ANTES de a base responder, para o ecrã não continuar a mostrar o
 * número velho enquanto se espera pelo realtime — que pode nem estar ligado
 * naquela tabela.
 *
 * Funde em vez de substituir: a resposta de um UPDATE traz a linha inteira,
 * mas o que se aplica antes de gravar traz só os campos mexidos.
 */
export function aplicarNaLista(lista, linha) {
  const atual = Array.isArray(lista) ? lista : [];
  if (!linha?.id) return atual;
  return atual.some(x => x?.id === linha.id)
    ? atual.map(x => (x?.id === linha.id ? { ...x, ...linha } : x))
    : [linha, ...atual];
}

export default escreverTolerante;
