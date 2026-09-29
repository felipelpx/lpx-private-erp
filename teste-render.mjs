// Smoke test de renderização: monta as vistas em servidor (react-dom/server)
// com hooks e supabase simulados. Apanha erros de runtime — variáveis usadas
// antes de existirem, props em falta, JSX inválido — que o `npm run build`
// não vê, porque compilar não é executar.
//
//   node teste-render.mjs
import { build } from "esbuild";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";

// Pasta temporária dentro do projeto: assim o bundle encontra o react instalado
const dir = mkdtempSync(join(process.cwd(), "node_modules", ".lpx-ssr-"));

// ── Stubs ───────────────────────────────────────────────────────────────────
writeFileSync(join(dir, "stub-supabase.js"), `
const resposta = { data: [], error: null };
const q = {
  select: () => q, insert: () => q, update: () => q, delete: () => q, upsert: () => q,
  eq: () => q, in: () => q, gte: () => q, lte: () => q, neq: () => q,
  order: () => q, range: () => q, limit: () => q, single: () => Promise.resolve(resposta),
  then: (r) => Promise.resolve(resposta).then(r),
};
export const supabase = {
  from: () => q,
  channel: () => ({ on: function () { return this; }, subscribe: function () { return this; } }),
  removeChannel: () => {},
  auth: {
    getSession: () => Promise.resolve({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
    signOut: () => Promise.resolve({}),
  },
  storage: { from: () => ({ list: () => Promise.resolve(resposta), createSignedUrl: () => Promise.resolve(resposta), upload: () => Promise.resolve(resposta) }) },
};
export default supabase;
`);

const MOVS = [
  { id: "m1", conta_id: "adseq_bcp", empresa_id: "adseq", banco: "BCP", data: "2026-09-01", movimento: "TRF PRESTADOR X", valor: -12500, saldo: 40000, categoria: "Obras", detalhes: "" },
  { id: "m2", conta_id: "adseq_bcp", empresa_id: "adseq", banco: "BCP", data: "2026-09-12", movimento: "ENTRADA SOCIO", valor: 50000, saldo: 90000, categoria: "Aportes", detalhes: "" },
];

writeFileSync(join(dir, "stub-hooks.js"), `
const MOVS = ${JSON.stringify(MOVS)};
const QUESTOES = [
  { id: "q1", movimento_id: "m1", conta_id: "adseq_bcp", empresa: "adseq", banco: "BCP",
    mov_data: "2026-09-01", mov_descricao: "TRF PRESTADOR X", mov_valor: -12500,
    autor_id: "u3", autor_nome: "Mauricio", autor_email: "m@x.pt",
    texto: "A que obra corresponde?", status: "aberto", lido_por: [],
    created_at: "2026-09-02T10:00:00Z", updated_at: "2026-09-02T10:00:00Z" },
  { id: "q2", movimento_id: "m2", empresa: "adseq", mov_data: "2026-09-12",
    mov_descricao: "ENTRADA SOCIO", mov_valor: 50000, autor_id: "u3", autor_nome: "Mauricio",
    texto: "Este aporte é de quem?", status: "respondido", resposta: "Da Palatine.",
    respondido_por: "Rodrigo", respondido_em: "2026-09-03T09:00:00Z",
    lido_por: ["u1"], created_at: "2026-09-02T11:00:00Z", updated_at: "2026-09-03T09:00:00Z" },
];
const PAGS = [
  { id: "p1", empresa: "adseq", tipo: "saida", categoria: "Obras", valor: -80000, data: "2026-10-05", status: "Prevista", descricao: "Empreitada" },
  { id: "p2", empresa: "adseq", tipo: "entrada", categoria: "Vendas", valor: 250000, data: "2026-11-05", status: "Prevista", descricao: "Escritura T2" },
  { id: "p3", empresa: "adseq", tipo: "saida", categoria: "Licenças", valor: -15000, data: "2026-12-05", status: "Prevista", descricao: "Camara" },
];
const FATURAS = [
  { id: "f1", empresa: "adseq", fornecedor: "Construtora", fatura: "2026/118", valor: 12500,
    vencimento: "2026-09-01", previsao_pagamento: "2026-09-01", status: "Pendente em dia", categoria: "Obras" },
];
const FRACOES = [
  { id: "x1", projeto: "adseq", fracao: "A", piso: "1", tipologia: "T2", area: 88, preco: 420000, status: "Disponível" },
  { id: "x2", projeto: "adseq", fracao: "B", piso: "1", tipologia: "T1", area: 62, preco: 310000, status: "CPCV" },
  { id: "x3", projeto: "adseq", fracao: "C", piso: "2", tipologia: "T3", area: 120, preco: 590000, status: "Escriturada" },
];

export const useAuth = () => ({ user: null, profile: null, loading: false, signIn: async()=>({}), signOut: async()=>{} });
export const useContas = () => ({ contas: [], updateSaldo: async()=>{}, upsertConta: async()=>{} });
export const useFaturas = () => ({ faturas: FATURAS, loading: false, addFatura: async()=>({}), addFaturas: async()=>({}), updateFatura: async()=>({}), deleteFatura: async()=>({}) });
export const usePagamentosExtras = () => ({ pagamentos: PAGS, loading: false, addPagamento: async()=>({}), updatePagamento: async()=>({}), deletePagamento: async()=>({}) });
export const useOrcamento = () => ({ orcamento: [], loading: false, upsertOrcamento: async()=>({}) });
export const useMovimentosCounts = () => ({ counts: {}, reload: ()=>{} });
export const useProfiles = () => ({ profiles: [], loading: false, updateProfile: async()=>({}) });
export const useMovimentosByConta = () => ({ movimentos: MOVS, loading: false, reload: ()=>{}, total: MOVS.length });
export const useMovimentosPeriodo = () => ({ movimentos: MOVS, loading: false });
export const useSaldosAtuais = () => ({ saldos: { adseq_bcp: 90000 }, reload: ()=>{} });
export const useSaldosNaData = () => ({ saldos: { adseq_bcp: 40000 }, loading: false });
export const useFracoes = () => ({ fracoes: FRACOES, loading: false, upsertFracao: async()=>({}), deleteFracao: async()=>({}) });
export const useVendas = () => ({ vendas: [], loading: false, addVenda: async()=>({}), updateVenda: async()=>({}), deleteVenda: async()=>({}) });
export const useRecebiveis = () => ({ recebiveis: [], loading: false, addRecebivel: async()=>({}), updateRecebivel: async()=>({}), deleteRecebivel: async()=>({}) });
export const useFotos = () => ({ fotos: [], loading: false });
export const useQuestionamentos = () => ({ questionamentos: QUESTOES, loading: false, error: null, reload: ()=>{},
  addQuestionamento: async()=>({ error: null }), updateQuestionamento: async()=>({ error: null }),
  deleteQuestionamento: async()=>({ error: null }), marcarLida: async()=>{} });
export const QUESTOES_TESTE = QUESTOES;
export const MOVS_TESTE = MOVS;
`);

// ── Entrada do teste ────────────────────────────────────────────────────────
writeFileSync(join(dir, "entrada.jsx"), `
import React from "react";
import { renderToString } from "react-dom/server";
import IRView from "SRC/IRView.jsx";
import ExtratosView from "SRC/ExtratosView.jsx";
import Questoes, { ModalQuestionar, porLer } from "SRC/Questoes.jsx";
import ContasReceber from "SRC/ContasReceber.jsx";
import ComercialView from "SRC/ComercialView.jsx";
import { RealOrcado } from "SRC/RealOrcadoView.jsx";
import { EMPRESAS } from "SRC/empresas.js";
import { QUESTOES_TESTE, MOVS_TESTE } from "SRC/hooks.js";

const emp = EMPRESAS.filter(e => e.id === "adseq");
const gestor = { id: "u1", nome: "Rodrigo", email: "r@lpxprivate.com", role: "gestor", approval_level: 1, can_create_mapas: true, empresas: [] };
const investidor = { id: "u3", nome: "Mauricio", email: "m@lpxprivate.com", role: "investidor", approval_level: 0, can_create_mapas: false, empresas: ["adseq"] };

const casos = [
  ["IRView (gestor)",       <IRView currentUser={gestor} empresasVisiveis={emp} />],
  ["IRView (investidor)",   <IRView currentUser={investidor} empresasVisiveis={emp} />],
  ["Extratos (investidor)", <ExtratosView EMPRESAS={emp} extrato={[]} caixaUnico={{}} setCaixaUnico={()=>{}}
      currentUser={investidor} movCounts={{}} faturas={[]} pagamentosExtras={[]}
      questionamentos={QUESTOES_TESTE} addQuestionamento={async()=>({error:null})} onVerQuestoes={()=>{}} />],
  ["Extratos (gestor)",     <ExtratosView EMPRESAS={emp} extrato={[]} caixaUnico={{}} setCaixaUnico={()=>{}}
      currentUser={gestor} movCounts={{}} faturas={[]} pagamentosExtras={[]}
      questionamentos={QUESTOES_TESTE} addQuestionamento={async()=>({error:null})} onVerQuestoes={()=>{}} />],
  ["Questões (gestor)",     <Questoes currentUser={gestor} questionamentos={QUESTOES_TESTE} loading={false} error={null}
      updateQuestionamento={async()=>({})} deleteQuestionamento={async()=>({})} marcarLida={async()=>{}} empresasVisiveis={emp} />],
  ["Questões (investidor)", <Questoes currentUser={investidor} questionamentos={[QUESTOES_TESTE[1]]} loading={false} error={null}
      updateQuestionamento={async()=>({})} deleteQuestionamento={async()=>({})} marcarLida={async()=>{}} empresasVisiveis={emp} />],
  ["Questões (sem tabela)", <Questoes currentUser={gestor} questionamentos={[]} loading={false}
      error={'relation "public.questionamentos" does not exist'}
      updateQuestionamento={async()=>({})} deleteQuestionamento={async()=>({})} marcarLida={async()=>{}} empresasVisiveis={emp} />],
  ["Modal questionar",      <ModalQuestionar movimento={MOVS_TESTE[0]} empresa="adseq" banco="BCP" contaId="adseq_bcp"
      currentUser={investidor} existentes={[QUESTOES_TESTE[0]]} onClose={()=>{}} onEnviar={async()=>({error:null})} />],
  ["Contas a Receber",      <ContasReceber currentUser={gestor} empresasVisiveis={emp} />],
  ["Comercial",             <ComercialView currentUser={gestor} onAddFatura={async()=>({})} empresasVisiveis={emp} />],
  ["Real x Orçado",         <RealOrcado empresasAtivas={emp} />],
];

let mau = 0;
for (const [nome, el] of casos) {
  try {
    const html = renderToString(el);
    console.log(\`  ✓ \${nome.padEnd(24)} \${String(html.length).padStart(7)} bytes\`);
  } catch (e) {
    mau++;
    console.log(\`  ✗ \${nome}: \${e && e.message}\`);
    if (e && e.stack) console.log(String(e.stack).split("\\n").slice(1, 4).join("\\n"));
  }
}

// porLer: o contador do sino
const c1 = porLer(QUESTOES_TESTE, gestor);
const c2 = porLer(QUESTOES_TESTE, investidor);
console.log(\`  \${c1 === 1 ? "✓" : "✗"} porLer(gestor) = \${c1} (esperado 1)\`);
console.log(\`  \${c2 === 0 ? "✓" : "✗"} porLer(investidor) = \${c2} (esperado 0)\`);
if (c1 !== 1 || c2 !== 0) mau++;

process.exit(mau ? 1 : 0);
`.replace(/SRC\//g, pathToFileURL(join(process.cwd(), "src")).pathname + "/"));

await build({
  entryPoints: [join(dir, "entrada.jsx")],
  bundle: true, platform: "node", format: "esm", outfile: join(dir, "saida.mjs"),
  jsx: "automatic", logLevel: "error",
  external: ["react", "react-dom", "react-dom/server"],
  plugins: [{
    name: "stubs",
    setup(b) {
      // Substitui o acesso real ao Supabase por dados fixos
      b.onResolve({ filter: /(^|\/)supabase\.js$/ }, () => ({ path: join(dir, "stub-supabase.js") }));
      b.onResolve({ filter: /(^|\/)hooks\.js$/ }, () => ({ path: join(dir, "stub-hooks.js") }));
    },
  }],
  define: { "import.meta.env.VITE_SUPABASE_URL": '"https://x.supabase.co"', "import.meta.env.VITE_SUPABASE_ANON_KEY": '"anon"' },
});

console.log("Renderização em servidor:");
const { default: _ } = await import(pathToFileURL(join(dir, "saida.mjs")).href).catch(e => {
  console.error("  ✗ falhou a importar o bundle:", e.message);
  process.exit(1);
});
rmSync(dir, { recursive: true, force: true });
