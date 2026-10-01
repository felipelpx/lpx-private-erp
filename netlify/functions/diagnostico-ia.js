// ─────────────────────────────────────────────────────────────────────────────
// DIAGNÓSTICO DA LIGAÇÃO À IA
//
// Abre https://<o-teu-site>/.netlify/functions/diagnostico-ia no browser.
// Diz, em texto claro, o que se passa entre o Netlify e a Anthropic:
//
//   · a variável ANTHROPIC_API_KEY chegou à função?
//   · tem o formato certo, sem espaços nem quebras de linha?
//   · a Anthropic aceita-a? E se não, com que erro exatamente?
//
// NÃO devolve a chave. Mostra apenas o comprimento e os últimos 4 caracteres,
// o suficiente para confirmares que a chave que lá está é a que colaste.
//
// É um ficheiro solto: podes apagá-lo quando já não precisares.
// ─────────────────────────────────────────────────────────────────────────────

const MODELO = "claude-sonnet-5-5";   // tem de bater certo com src/ia.js

exports.handler = async function () {
  const resposta = (corpo) => ({
    statusCode: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(corpo, null, 2),
  });

  const chave = process.env.ANTHROPIC_API_KEY;

  if (!chave) {
    return resposta({
      veredicto: "A variável ANTHROPIC_API_KEY não chegou a esta função.",
      o_que_fazer: [
        "Netlify → Site configuration → Environment variables → ANTHROPIC_API_KEY",
        "Nos Scopes, a opção 'Functions' TEM de estar marcada.",
        "O valor tem de estar no contexto 'Production'.",
        "Depois de gravar, faz um deploy novo: Deploys → Trigger deploy.",
      ],
      chave: { configurada: false },
      modelo: MODELO,
    });
  }

  const limpa = chave.trim();
  const detalhes = {
    configurada: true,
    comprimento: chave.length,
    ultimos4: limpa.slice(-4),
    comeca_por_sk_ant: limpa.startsWith("sk-ant-"),
    tem_espacos_ou_quebras: /\s/.test(chave),
  };

  if (!detalhes.comeca_por_sk_ant) {
    return resposta({
      veredicto: "A chave não começa por 'sk-ant-' — foi colada incompleta ou é outra coisa.",
      o_que_fazer: ["Copia a chave inteira em platform.claude.com → Settings → API keys e cola de novo."],
      chave: detalhes, modelo: MODELO,
    });
  }

  // Chamada mínima à API: um token, só para ver o que a Anthropic responde.
  let estado = null, corpo = "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": limpa,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELO, max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    estado = r.status;
    corpo = await r.text();
  } catch (e) {
    return resposta({
      veredicto: "A função não conseguiu sequer falar com a api.anthropic.com.",
      erro_de_rede: String(e && e.message || e),
      chave: detalhes, modelo: MODELO,
    });
  }

  let erroApi = null;
  try { erroApi = JSON.parse(corpo)?.error || null; } catch {}

  const veredictos = {
    200: "Está tudo bem: a chave é válida e o modelo existe. Se o importador continua a falhar, o problema é outro — manda o print do erro.",
    401: "A Anthropic recusou a chave: expirou, foi revogada, ou o deploy ainda está a usar a chave antiga. "
       + "As chaves podem ter prazo (3 horas a 30 dias) e, depois de expirarem, não se reativam. "
       + "Confirma os 'ultimos4' abaixo contra a chave que colaste: se forem diferentes, falta publicar um deploy novo.",
    403: "A chave é válida mas não tem permissão — costuma ser estar noutra workspace.",
    404: "A chave é válida, mas o modelo '" + MODELO + "' não existe ou já não está disponível para esta conta. Troca o identificador em src/ia.js e em diagnostico-ia.js.",
    429: "Limite de pedidos ou de gastos atingido. Espera um pouco, ou vê o limite em platform.claude.com → Billing.",
    400: "Pedido recusado. Vê a mensagem em 'resposta_da_anthropic'.",
    402: "Problema de faturação: sem saldo ou limite de gastos atingido.",
  };

  return resposta({
    veredicto: veredictos[estado] || `A Anthropic respondeu ${estado}. Vê 'resposta_da_anthropic'.`,
    estado_http: estado,
    resposta_da_anthropic: erroApi || (estado === 200 ? "ok" : corpo.slice(0, 400)),
    chave: detalhes,
    modelo: MODELO,
  });
};
