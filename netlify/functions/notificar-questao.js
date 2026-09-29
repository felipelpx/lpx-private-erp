// ─────────────────────────────────────────────────────────────────────────────
// Notificação por email aos gestores quando um investidor questiona um
// lançamento do extrato.
//
// É OPCIONAL. Sem as variáveis de ambiente abaixo, a função responde 200 com
// { enviado: false } e o ERP continua a avisar os gestores dentro da aplicação
// (contador no separador "Questões" + aviso no ecrã em tempo real).
//
// Para ligar o email, define em Netlify → Site configuration → Environment
// variables e faz um novo deploy:
//
//   RESEND_API_KEY             chave da Resend (resend.com), começa por re_
//   NOTIFICACOES_DE            remetente verificado, ex.: erp@lpxprivate.com
//   SUPABASE_URL               https://<projeto>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  chave service_role do Supabase
//
// A service_role vive SÓ aqui, no servidor. Nunca a ponhas numa variável
// VITE_*: essas vão dentro do bundle e ficam visíveis no browser.
// Em alternativa à leitura no Supabase, podes fixar os destinatários em
//   NOTIFICACOES_PARA = felipe@lpxprivate.com,rodrigo@lpxprivate.com
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (statusCode, body) => ({
  statusCode, headers: { "Content-Type": "application/json", ...CORS }, body: JSON.stringify(body),
});

const escapar = (t) => String(t == null ? "" : t)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const euros = (v) => {
  const n = Number(v);
  if (!isFinite(n)) return "—";
  const s = Math.abs(n).toFixed(2).split(".");
  return (n < 0 ? "-" : "") + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + s[1] + " €";
};

// Destinatários: lista fixa, ou os perfis admin/gestor no Supabase
async function destinatarios() {
  const fixos = (process.env.NOTIFICACOES_PARA || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (fixos.length) return fixos;

  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return [];

  const r = await fetch(
    `${url.replace(/\/$/, "")}/rest/v1/profiles?select=email,role&role=in.(admin,gestor)`,
    { headers: { apikey: chave, Authorization: `Bearer ${chave}` } }
  );
  if (!r.ok) return [];
  const linhas = await r.json();
  return (Array.isArray(linhas) ? linhas : []).map(p => p.email).filter(Boolean);
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  let q = {};
  try { q = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "JSON inválido" }); }
  if (!q.texto) return json(400, { error: "Falta o texto da questão" });

  const apiKey = process.env.RESEND_API_KEY;
  const de = process.env.NOTIFICACOES_DE;
  if (!apiKey || !de) {
    // Não é um erro: o aviso dentro da aplicação já foi dado.
    return json(200, { enviado: false, motivo: "email_nao_configurado" });
  }

  let para = [];
  try { para = await destinatarios(); } catch (e) { console.error("destinatarios:", e); }
  if (!para.length) return json(200, { enviado: false, motivo: "sem_destinatarios" });

  const html = `
    <div style="font-family:Georgia,serif;color:#1a1a2e;max-width:560px">
      <p style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8a8f99;margin:0 0 6px">
        LPX Private · ERP
      </p>
      <h2 style="font-size:18px;margin:0 0 14px">Nova questão de investidor</h2>
      <table style="width:100%;border-collapse:collapse;background:#f8f9fc;border-radius:8px">
        <tr><td style="padding:10px 12px;font-size:13px;color:#666">Lançamento</td>
            <td style="padding:10px 12px;font-size:13px">${escapar(q.mov_descricao) || "—"}</td></tr>
        <tr><td style="padding:10px 12px;font-size:13px;color:#666">Data</td>
            <td style="padding:10px 12px;font-size:13px">${escapar(q.mov_data) || "—"}</td></tr>
        <tr><td style="padding:10px 12px;font-size:13px;color:#666">Valor</td>
            <td style="padding:10px 12px;font-size:13px">${euros(q.mov_valor)}</td></tr>
        <tr><td style="padding:10px 12px;font-size:13px;color:#666">Empresa</td>
            <td style="padding:10px 12px;font-size:13px">${escapar(q.empresa) || "—"}</td></tr>
      </table>
      <p style="font-size:14px;line-height:1.6;margin:18px 0 6px">${escapar(q.texto)}</p>
      <p style="font-size:12px;color:#8a8f99;margin:0">— ${escapar(q.autor) || "Investidor"}</p>
      <p style="font-size:12px;color:#8a8f99;margin:22px 0 0">
        Responde no separador <strong>Questões</strong> do ERP.
      </p>
    </div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: de, to: para,
        subject: `Nova questão de ${q.autor || "investidor"} — ${q.empresa || "ERP LPX"}`,
        html,
      }),
    });
    if (!r.ok) {
      const detalhe = await r.text();
      console.error("resend:", r.status, detalhe);
      return json(200, { enviado: false, motivo: "erro_no_envio", estado: r.status });
    }
    return json(200, { enviado: true, destinatarios: para.length });
  } catch (e) {
    console.error("notificar-questao:", e);
    return json(200, { enviado: false, motivo: "excecao" });
  }
};
