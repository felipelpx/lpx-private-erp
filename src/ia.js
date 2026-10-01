// ─────────────────────────────────────────────────────────────────────────────
// Modelo usado na leitura automática de faturas.
//
// Fica aqui, num sítio só, porque os identificadores de modelo mudam com o
// tempo: quando um é descontinuado, a API responde 404 e o importador deixa de
// funcionar. Trocar aqui chega — a função de diagnóstico usa o mesmo valor.
//
// O identificador tem de ser exatamente o da API (ver platform.claude.com →
// Docs → Models). "claude-sonnet-5" NÃO é válido; o Sonnet é "claude-sonnet-5-5".
// ─────────────────────────────────────────────────────────────────────────────
export const MODELO_IA = "claude-sonnet-5-5";
