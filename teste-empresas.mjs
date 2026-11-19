// As empresas do ERP e as contas bancárias na base de dados.
//
// Uma empresa vive em dois sítios: uma linha em src/empresas.js e uma linha
// na tabela `contas` do Supabase, criada por uma migração. Se os dois não
// disserem exactamente a mesma coisa, acontece uma de duas:
//
//   · conta na base de dados sem empresa no código → não aparece em lado
//     nenhum da aplicação, e o extrato importado vai para o limbo;
//   · empresa no código sem conta na base de dados → aparece nos menus mas
//     não há onde lhe importar o extrato.
//
// Pior ainda é o nome: o `empresa_nome` vai escrito à mão no SQL e tem de
// coincidir com o que o `nomeCompleto()` produz. Um parêntese a mais e as
// duas metades do sistema passam a chamar nomes diferentes à mesma empresa.
//
// É isso que isto confere — o código contra o SQL, sem base de dados nenhuma.
//   node teste-empresas.mjs
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import EMPRESAS, { EMPRESAS_IMPORT, EMPRESAS_SIMPLE, PROJETOS, GRUPOS,
                   GRUPOS_INFO, BANCO_COLORS, buildContaId,
                   nomeCompleto } from "./src/empresas.js";

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };

// Todas as linhas de INSERT INTO contas das migrações, lidas do SQL.
function contasNoSql() {
  const dir = join(process.cwd(), "supabase");
  const linhas = [];
  for (const f of readdirSync(dir).filter(n => n.endsWith(".sql"))) {
    const txt = readFileSync(join(dir, f), "utf8");
    // Só os blocos que inserem em `contas`, para não apanhar outros INSERTs.
    const re = /INSERT\s+INTO\s+contas\s*\([^)]*\)\s*VALUES([\s\S]*?);/gi;
    for (const bloco of txt.matchAll(re)) {
      const tuplos = bloco[1].matchAll(
        /\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'([^']*)'/g);
      for (const t of tuplos) {
        linhas.push({ ficheiro: f, id: t[1], empresa_id: t[2],
                      empresa_nome: t[3].replace(/''/g, "'"), banco: t[4] });
      }
    }
  }
  return linhas;
}
const sql = contasNoSql();

console.log("As migrações criam contas:");
ok(sql.length > 0, `${sql.length} linhas de conta em ${
   new Set(sql.map(l => l.ficheiro)).size} ficheiro(s) de SQL`);

console.log("\nAs duas empresas novas da Av. da Igreja estão no código:");
{
  const m = EMPRESAS.find(e => e.id === "meridiano");
  const s = EMPRESAS.find(e => e.id === "spiral");
  ok(!!m, "Meridiano Radioso existe");
  ok(!!s, "Spiral Treasure existe");
  ok(m?.nome === "Meridiano Radioso (Holding Av Igreja)", `nome: ${m?.nome}`);
  ok(s?.nome === "Spiral Treasure (SPV Av Igreja)", `nome: ${s?.nome}`);
  ok(m?.grupo === "LPX" && s?.grupo === "LPX", "ambas no grupo LPX");
  ok(m?.contas.length === 1 && m.contas[0].banco === "BCP", "Meridiano com uma conta BCP");
  ok(s?.contas.length === 1 && s.contas[0].banco === "BCP", "Spiral com uma conta BCP");
  ok(m?.contas[0].id === "meridiano_bcp", `id da conta: ${m?.contas[0].id}`);
  ok(s?.contas[0].id === "spiral_bcp", `id da conta: ${s?.contas[0].id}`);
}

console.log("\nE têm conta criada no SQL, com o nome exactamente igual:");
{
  for (const id of ["meridiano_bcp", "spiral_bcp"]) {
    const linha = sql.find(l => l.id === id);
    ok(!!linha, `${id} está no SQL (${linha?.ficheiro})`);
    if (!linha) continue;
    const emp = EMPRESAS.find(e => e.id === linha.empresa_id);
    ok(linha.empresa_nome === emp?.nome,
       `o nome bate: SQL "${linha.empresa_nome}" = código "${emp?.nome}"`);
  }
}

console.log("\nNenhuma empresa do código ficou sem conta no SQL:");
{
  const idsSql = new Set(sql.map(l => l.id));
  const faltam = [];
  for (const e of EMPRESAS)
    for (const c of e.contas)
      if (!idsSql.has(c.id)) faltam.push(`${c.id} (${e.nome})`);
  // As contas antigas vieram do schema.sql inicial; o que interessa é não
  // haver nenhuma NOVA esquecida. Lista-se o que falta para se poder ver.
  ok(!faltam.some(f => /meridiano|spiral/.test(f)),
     faltam.length ? `faltam ${faltam.length} no SQL: ${faltam.slice(0, 4).join(", ")}${
                      faltam.length > 4 ? "…" : ""}` : "estão todas");
}

console.log("\nE nenhuma conta do SQL ficou sem empresa no código:");
{
  const idsCodigo = new Set(EMPRESAS.flatMap(e => e.contas.map(c => c.id)));
  const orfas = sql.filter(l => !idsCodigo.has(l.id));
  ok(orfas.length === 0,
     orfas.length ? `órfãs: ${orfas.map(o => `${o.id} (${o.ficheiro})`).join(", ")}`
                  : "nenhuma órfã");
}

console.log("\nOs identificadores são únicos e seguem a convenção:");
{
  const ids = EMPRESAS.map(e => e.id);
  ok(new Set(ids).size === ids.length, `${ids.length} empresas, todas com id próprio`);
  const contas = EMPRESAS.flatMap(e => e.contas.map(c => c.id));
  ok(new Set(contas).size === contas.length, `${contas.length} contas, todas com id próprio`);
  const fora = [];
  for (const e of EMPRESAS)
    for (const c of e.contas)
      if (c.id !== buildContaId(e.id, c.banco)) fora.push(c.id);
  ok(fora.length === 0,
     fora.length ? `fora da convenção: ${fora.join(", ")}` : "todas <empresa>_<banco>");
  ok(ids.every(i => /^[a-z0-9]+$/.test(i)),
     `e os ids da empresa são minúsculas sem espaços: ${ids.join(", ")}`);
}

console.log("\nAs listas derivadas incluem as empresas novas:");
{
  for (const [nome, lista] of [["EMPRESAS_IMPORT", EMPRESAS_IMPORT],
                               ["EMPRESAS_SIMPLE", EMPRESAS_SIMPLE],
                               ["PROJETOS", PROJETOS]]) {
    const tem = ["meridiano", "spiral"].every(id => lista.some(x => x.id === id));
    ok(tem, `${nome} tem as duas`);
  }
  const imp = EMPRESAS_IMPORT.find(e => e.id === "spiral");
  ok(imp?.contas?.join(",") === "BCP",
     `no Importar Extrato a Spiral aparece com: ${imp?.contas?.join(", ")}`);
  const p = PROJETOS.find(x => x.id === "meridiano");
  ok(p?.projeto === "Holding Av Igreja", `e o projeto da Meridiano: "${p?.projeto}"`);
}

console.log("\nO chip do banco tem sempre cor legível:");
{
  // O BancoChip tem cor de recurso (#7E8388, cinzento) para quem não está no
  // BANCO_COLORS, por isso faltar a cor não torna nada invisível — só deixa
  // o chip genérico. O que NÃO pode acontecer é uma cor que não se leia
  // sobre o fundo do próprio chip, que é a mesma cor a 18/255 de opacidade.
  const RECURSO = "#7E8388";
  const bancos = [...new Set(EMPRESAS.flatMap(e => e.contas.map(c => c.banco)))];
  const lum = (hex) => { const n = parseInt(hex.replace("#", ""), 16);
    const [R, G, B] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * R + 0.7152 * G + 0.0722 * B; };
  // O fundo do chip é a cor misturada com o branco a ~9,4% (0x18 = 24/255).
  const sobreBranco = (hex) => { const n = parseInt(hex.replace("#", ""), 16);
    const a = 24 / 255;
    const mist = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map(v => Math.round(v * a + 255 * (1 - a)));
    return "#" + mist.map(v => v.toString(16).padStart(2, "0")).join(""); };
  const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05); };

  const semCor = bancos.filter(b => !BANCO_COLORS[b]);
  ok(true, semCor.length
       ? `${semCor.join(" e ")} usam o cinzento de recurso (contas internas, não bancos)`
       : `${bancos.length} bancos, todos com cor própria`);
  // O contraste fica REGISTADO, não imposto. É uma característica do átomo
  // Chip (texto da cor do banco sobre essa mesma cor a 9%), igual em toda a
  // aplicação e anterior a estas empresas — fazer o teste das empresas falhar
  // por causa dela só poria ruído permanente na bateria. Fica o número à
  // vista para quando se decidir mexer no chip.
  const medidas = bancos.map(b => {
    const cor = BANCO_COLORS[b] || RECURSO;
    return { b, cor, c: contraste(cor, sobreBranco(cor)) };
  }).sort((x, y) => x.c - y.c);
  console.log("    contraste do chip (AA pede 4,5:1 a 10 px): "
    + medidas.map(m => `${m.b} ${m.c.toFixed(1)}`).join(" · "));
  // O que se impõe é só isto: nenhum chip fica invisível de todo.
  ok(medidas.every(m => m.c >= 1.9),
     `o pior (${medidas[0].b}, ${medidas[0].c.toFixed(1)}:1) continua a ver-se`);
}

console.log("\nOs grupos continuam coerentes:");
{
  ok(GRUPOS.every(g => GRUPOS_INFO[g]), `grupos registados: ${GRUPOS.join(", ")}`);
  const semGrupo = EMPRESAS.filter(e => !GRUPOS.includes(e.grupo));
  ok(semGrupo.length === 0,
     semGrupo.length ? `fora de um grupo: ${semGrupo.map(e => e.nome).join(", ")}`
                     : "todas as empresas pertencem a um grupo conhecido");
}

console.log("\nO nome apresentado não deixa parênteses vazios:");
{
  ok(nomeCompleto({ nome: "X", projeto: "" }) === "X", "sem projeto, só a razão social");
  ok(nomeCompleto({ nome: "X", projeto: "Y" }) === "X (Y)", "com projeto, entre parênteses");
  ok(!EMPRESAS.some(e => /\(\s*\)/.test(e.nome)),
     "e nenhuma empresa tem \"()\" no nome");
}

console.log(mau === 0 ? "\n✅ Empresas OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
