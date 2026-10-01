// ─────────────────────────────────────────────────────────────────────────────
// Proxy para a API da Anthropic (leitura automática de faturas)
//
// A chave NUNCA vai para o browser: fica só aqui, no servidor, lida da
// variável de ambiente ANTHROPIC_API_KEY (Netlify → Site configuration →
// Environment variables). Ver README para as instruções de configuração.
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: "Method Not Allowed" };

  // .trim() porque uma quebra de linha ou um espaço colados por engano no
  // painel do Netlify fazem a Anthropic devolver 401 — e o valor parece bem
  // escrito a olho nu, o que torna a causa difícil de encontrar.
  const chave = (process.env.ANTHROPIC_API_KEY || "").trim();

  // Diagnóstico claro em vez de deixar a Anthropic devolver um 401 críptico
  if (!chave) {
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json", ...CORS },
      body: JSON.stringify({
        error: {
          type: "config_error",
          message: "Falta a chave da API. Cria uma em platform.claude.com → Settings → API keys, define ANTHROPIC_API_KEY em Netlify → Site configuration → Environment variables e faz um novo deploy.",
        },
      }),
    };
  }

  if (!chave.startsWith("sk-ant-")) {
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json", ...CORS },
      body: JSON.stringify({
        error: {
          type: "config_error",
          message: "A ANTHROPIC_API_KEY não parece válida (deve começar por 'sk-ant-'). Confirma que copiaste a chave completa, sem espaços.",
        },
      }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();

    // Traduz os erros mais comuns para linguagem acionável
    if (response.status === 401) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json", ...CORS },
        body: JSON.stringify({
          error: {
            type: "authentication_error",
            message: "A chave da API foi rejeitada: expirou, foi revogada ou está incompleta. "
              + "As chaves da Anthropic podem ter prazo (3 horas a 30 dias, ou sem prazo) e, depois de expirarem, não se reativam. "
              + "Cria uma nova em platform.claude.com → Settings → API keys (escolhe \"Never\" na expiração), "
              + "atualiza ANTHROPIC_API_KEY em Netlify → Site configuration → Environment variables, e faz um novo deploy.",
          },
        }),
      };
    }
    if (response.status === 404) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", ...CORS },
        body: JSON.stringify({
          error: {
            type: "modelo_invalido",
            message: "A chave funciona, mas o modelo pedido não existe ou já não está disponível. "
              + "Atualiza MODELO_IA em src/ia.js com um identificador válido (platform.claude.com → Docs → Models).",
          },
        }),
      };
    }
    if (response.status === 403) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json", ...CORS },
        body: JSON.stringify({
          error: {
            type: "permission_error",
            message: "A chave é válida mas não tem permissão para este pedido. "
              + "Confirma em platform.claude.com a que workspace a chave está associada.",
          },
        }),
      };
    }
    if (response.status === 429) {
      return {
        statusCode: 429,
        headers: { "Content-Type": "application/json", ...CORS },
        body: JSON.stringify({
          error: { type: "rate_limit", message: "Demasiados pedidos seguidos. Espera um momento e tenta de novo." },
        }),
      };
    }
    if (response.status === 402 || (response.status === 400 && /credit balance|billing/i.test(text))) {
      return {
        statusCode: 402,
        headers: { "Content-Type": "application/json", ...CORS },
        body: JSON.stringify({
          error: { type: "sem_saldo", message: "A conta da Anthropic não tem saldo ou atingiu o limite de gastos. Vê em platform.claude.com → Billing." },
        }),
      };
    }

    return {
      statusCode: response.status,
      headers: { "Content-Type": "application/json", ...CORS },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", ...CORS },
      body: JSON.stringify({ error: { type: "proxy_error", message: err.message } }),
    };
  }
};
