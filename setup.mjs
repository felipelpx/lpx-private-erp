#!/usr/bin/env node
/**
 * LPX Private — ERP · Assistente de instalação
 *
 * Trata de tudo o que não exige as tuas credenciais:
 *   · valida o ambiente (Node, Git)
 *   · escreve o .env com as chaves do Supabase
 *   · instala as dependências
 *   · compila e verifica que as chaves ficaram no build
 *   · prepara o repositório Git
 *   · publica no Netlify (a autenticação é feita por ti, no browser)
 *
 * Correr com:  node setup.mjs
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", red: "\x1b[31m", amber: "\x1b[33m", blue: "\x1b[36m",
};
const ok    = (m) => console.log(`${C.green}  ✓${C.reset} ${m}`);
const fail  = (m) => console.log(`${C.red}  ✗${C.reset} ${m}`);
const warn  = (m) => console.log(`${C.amber}  !${C.reset} ${m}`);
const info  = (m) => console.log(`${C.dim}    ${m}${C.reset}`);
const titulo = (n, m) => console.log(`\n${C.bold}${C.blue}[${n}]${C.reset} ${C.bold}${m}${C.reset}`);

// Leitor de linhas com fila própria. O readline/promises perde linhas quando o
// input chega todo de uma vez (pipe, colar várias linhas); a fila evita isso.
const rl = createInterface({ input, output });
const _fila = [];
const _espera = [];
rl.on("line", (linha) => {
  const resolver = _espera.shift();
  if (resolver) resolver(linha);
  else _fila.push(linha);
});
let _fechado = false;
rl.on("close", () => { _fechado = true; _espera.splice(0).forEach(r => r("")); });

function lerLinha() {
  if (_fila.length) return Promise.resolve(_fila.shift());
  if (_fechado) return Promise.resolve("");
  return new Promise((resolver) => _espera.push(resolver));
}

const perguntar = async (q) => {
  // Só desiste se o input acabou E não há linhas por consumir na fila
  if (_fechado && _fila.length === 0) {
    console.log(`\n${C.red}  ✗${C.reset} Fim inesperado do input. Corre o script num Terminal normal: node setup.mjs`);
    process.exit(1);
  }
  output.write(`${C.blue}  ?${C.reset} ${q}`);
  const linha = await lerLinha();
  return String(linha).trim();
};
const confirmar = async (q) => /^(s|sim|y|yes)?$/i.test(await perguntar(`${q} ${C.dim}[S/n]${C.reset} `));

function correr(cmd, opts = {}) {
  return execSync(cmd, { stdio: opts.silent ? "pipe" : "inherit", encoding: "utf8", ...opts });
}
function tentar(cmd) {
  try { return execSync(cmd, { stdio: "pipe", encoding: "utf8" }).trim(); }
  catch { return null; }
}
function interativo(cmd, args) {
  return spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" }).status === 0;
}

console.log(`
${C.bold}╭──────────────────────────────────────────────╮
│   LPX PRIVATE — ERP · Instalação              │
╰──────────────────────────────────────────────╯${C.reset}`);

// ─── 1. Ambiente ────────────────────────────────────────────────────────────
titulo(1, "Verificar o ambiente");

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 18) {
  fail(`Node ${process.versions.node} é demasiado antigo. Instala a versão LTS em https://nodejs.org`);
  process.exit(1);
}
ok(`Node ${process.versions.node}`);

const temGit = !!tentar("git --version");
temGit ? ok(tentar("git --version")) : warn("Git não encontrado — o passo do GitHub vai ser saltado.");

if (!existsSync("package.json") || !existsSync("src/empresas.js")) {
  fail("Não estás na pasta do projeto.");
  info("Abre o Terminal dentro da pasta 'lpx-private-erp' e corre outra vez.");
  process.exit(1);
}
ok("Pasta do projeto correta");

// ─── 2. Chaves do Supabase ──────────────────────────────────────────────────
titulo(2, "Ligação ao Supabase");

let url = "", key = "";
if (existsSync(".env")) {
  const env = readFileSync(".env", "utf8");
  url = (env.match(/VITE_SUPABASE_URL=(.*)/) || [])[1]?.trim() || "";
  key = (env.match(/VITE_SUPABASE_ANON_KEY=(.*)/) || [])[1]?.trim() || "";
  if (url && key && !url.includes("xxxx")) {
    ok("Já existe um .env configurado");
    info(url);
    if (!(await confirmar("Manter estas chaves?"))) { url = ""; key = ""; }
  }
}

if (!url || !key) {
  console.log(`
  Vai buscá-las ao Supabase:
  ${C.dim}Dashboard → o teu projeto → Project Settings → API${C.reset}
  ${C.amber}Usa a chave "anon / publishable" — nunca a "service_role".${C.reset}
`);
  const desistir = (o) => {
    fail(`Não consegui obter ${o} válido ao fim de várias tentativas.`);
    info("Confirma os valores em Project Settings → API e corre outra vez.");
    process.exit(1);
  };

  for (let i = 0; i < 4 && !/^https:\/\/.+\.supabase\.co$/.test(url); i++) {
    url = (await perguntar("Project URL: ")).replace(/\/$/, "");
    if (!/^https:\/\/.+\.supabase\.co$/.test(url)) fail("Deve ser algo como https://abcdefgh.supabase.co");
  }
  if (!/^https:\/\/.+\.supabase\.co$/.test(url)) desistir("um Project URL");

  for (let i = 0; i < 4 && key.length < 30; i++) {
    key = await perguntar("Chave anon / publishable: ");
    if (/service_role/.test(key)) { fail("Essa é a service_role. Usa a anon / publishable."); key = ""; }
    else if (key.length < 30) fail("A chave parece curta demais.");
  }
  if (key.length < 30) desistir("uma chave");
}

writeFileSync(".env", `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${key}\n`);
ok(".env escrito");

// ─── 3. Testar a ligação ────────────────────────────────────────────────────
titulo(3, "Testar a base de dados");
try {
  const r = await fetch(`${url}/rest/v1/contas?select=id,empresa_nome`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (r.status === 401 || r.status === 403) {
    ok("Supabase respondeu e as tabelas estão protegidas (RLS ativo)");
    info("Só utilizadores autenticados leem dados — é o comportamento correto.");
  } else if (r.ok) {
    const linhas = await r.json();
    if (Array.isArray(linhas) && linhas.length === 16) ok("16 contas bancárias encontradas");
    else if (Array.isArray(linhas)) warn(`Encontrei ${linhas.length} contas — deviam ser 16. Correste o schema.sql todo?`);
  } else if (r.status === 404) {
    fail("As tabelas não existem. Falta correr o supabase/schema.sql no SQL Editor.");
    if (!(await confirmar("Continuar mesmo assim?"))) process.exit(1);
  } else {
    warn(`Resposta inesperada (HTTP ${r.status}). Continuo à mesma.`);
  }
} catch (e) {
  warn(`Não consegui contactar o Supabase (${e.message}). Verifica o URL e a internet.`);
  if (!(await confirmar("Continuar mesmo assim?"))) process.exit(1);
}

// ─── 4. Dependências ────────────────────────────────────────────────────────
titulo(4, "Instalar dependências");
if (existsSync("node_modules")) ok("Já instaladas");
else { info("Isto demora um ou dois minutos..."); correr("npm install"); ok("Dependências instaladas"); }

// ─── 5. Compilar ────────────────────────────────────────────────────────────
titulo(5, "Compilar o site");
correr("npm run build");

// Confirma que as chaves ficaram gravadas no bundle (é onde as pessoas se enganam)
const assets = path.join("dist", "assets");
const bundle = existsSync(assets) ? readdirSync(assets).find(f => f.endsWith(".js")) : null;
if (bundle && readFileSync(path.join(assets, bundle), "utf8").includes(url)) {
  ok("As chaves do Supabase ficaram no build");
} else {
  fail("O build não contém as chaves. Apaga a pasta 'dist' e corre outra vez.");
  process.exit(1);
}

// ─── 6. Git ─────────────────────────────────────────────────────────────────
if (temGit) {
  titulo(6, "Preparar o repositório Git");
  if (existsSync(".git")) ok("O repositório já existe");
  else {
    correr("git init -q");
    correr("git add .");
    // O Git precisa de saber quem assina os commits
    if (!tentar("git config user.email")) {
      info("O Git ainda não sabe quem és (fica registado nos commits).");
      const nome = (await perguntar("O teu nome: ")) || "Felipe";
      const mail = await perguntar("O teu email: ");
      correr(`git config user.name ${JSON.stringify(nome)}`, { silent: true });
      if (mail) correr(`git config user.email ${JSON.stringify(mail)}`, { silent: true });
    }
    try {
      correr('git commit -q -m "ERP LPX Private - versao inicial"', { silent: true });
      correr("git branch -M main", { silent: true });
      ok("Primeiro commit criado no ramo 'main'");
    } catch {
      warn("Não consegui criar o commit. Corre à mão:");
      info('git config user.email "o-teu-email"');
      info('git commit -m "versao inicial"');
    }
  }
  const remoto = tentar("git remote get-url origin");
  if (remoto) { ok(`Remoto: ${remoto}`); }
  else {
    console.log(`
  ${C.dim}Para ligares ao GitHub (opcional agora, recomendado depois):
    1. Cria um repositório PRIVADO em https://github.com/new
    2. git remote add origin <endereço do repositório>
    3. git push -u origin main${C.reset}`);
  }
}

// ─── 7. Netlify ─────────────────────────────────────────────────────────────
titulo(7, "Publicar no Netlify");
console.log(`
  Vou usar a ferramenta oficial do Netlify. Abre-se o browser para
  entrares na TUA conta — a autenticação é feita por ti, eu não vejo
  nem guardo nada.
`);

if (await confirmar("Publicar agora?")) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";

  info("A abrir o browser para autenticação...");
  interativo(npx, ["-y", "netlify-cli@latest", "login"]);

  info("A publicar... escolhe 'Create & configure a new site' quando perguntar.");
  const publicado = interativo(npx, [
    "-y", "netlify-cli@latest", "deploy",
    "--prod", "--dir", "dist", "--functions", "netlify/functions",
  ]);

  if (publicado) {
    console.log(`
${C.green}${C.bold}  O site está no ar.${C.reset}

  O endereço aparece acima, na linha ${C.bold}Website URL${C.reset}.

  ${C.bold}Falta fazer:${C.reset}
  · Dar um nome decente ao site:
    ${C.dim}app.netlify.com → o site → Site configuration → Change site name${C.reset}
  · Criar os utilizadores no Supabase (Authentication → Users) e correr
    o SQL do ficheiro DEPLOY.md, Parte 2.
`);
  } else {
    warn("A publicação não terminou. Podes repetir com:");
    info("npx netlify-cli deploy --prod --dir dist");
  }
} else {
  console.log(`
  Sem problema. Quando quiseres:
  ${C.dim}npx netlify-cli login
  npx netlify-cli deploy --prod --dir dist${C.reset}
`);
}

rl.close();
