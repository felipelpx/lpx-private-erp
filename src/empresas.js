// ─────────────────────────────────────────────────────────────────────────────
// EMPRESAS E CONTAS BANCÁRIAS — LPX Private
//
// ÚNICA FONTE DE VERDADE. Alterar aqui propaga para:
//   · Extratos / Caixa Único      (App.jsx → ExtratosView)
//   · Fluxo Futuro                (FluxoFuturo.jsx)
//   · Importar Extrato            (ImportarExtrato.jsx)
//   · Importar Fatura             (ImportarFatura.jsx)
//   · Contas a Pagar              (App.jsx)
//
// CONVENÇÃO DO conta_id:  <empresa.id>_<banco em minúsculas e sem espaços>
//   ex.: "lpx" + "Revolut"  →  "lpx_revolut"
// Se alterares um id de conta, tens de alterar também na base de dados
// (tabelas `contas` e `movimentos`).
// ─────────────────────────────────────────────────────────────────────────────

// Helper: constrói o id da conta a partir do id da empresa + nome do banco.
export const buildContaId = (empresaId, banco) =>
  empresaId + "_" + String(banco).toLowerCase().replace(/\s/g, "");

// Definição compacta: para cada empresa, o id, o nome e a lista de bancos.
const DEF = [
  { id: "favcloset", nome: "Favorite Closet",    projeto: "Amadeu 07",           grupo: "LPX", bancos: ["BCP", "RED"] },
  { id: "simplify",  nome: "Simplify Rubric",    projeto: "Alto dos 7 Moinhos",  grupo: "LPX", bancos: ["BCP", "RED"] },
  { id: "enchanted", nome: "Enchanted Vortex",   projeto: "Developer A07",       grupo: "LPX", bancos: ["BCP"] },
  { id: "blessed",   nome: "BlessedLegion",      projeto: "Developer 7M",        grupo: "LPX", bancos: ["BCP"] },
  { id: "pearl",     nome: "Pearl Syntax",       projeto: "Aura Properties",     grupo: "LPX", bancos: ["BCP"] },
  { id: "genero",    nome: "Genero Prudente",    projeto: "Maria Pia",           grupo: "LPX", bancos: ["BCP"] },
  { id: "fluffy",    nome: "Fluffy Rithm",       projeto: "Tax SPV",             grupo: "LPX", bancos: ["BCP"] },
  { id: "adseq",     nome: "Admirable Sequence", projeto: "Cinq Etoiles",        grupo: "HDG", bancos: ["BCP", "RED"] },
  { id: "infinite",  nome: "Infinite Change",    projeto: "Paço D'arcos",        grupo: "HDG", bancos: ["BCP", "RED"] },
  { id: "lpx",       nome: "LPX Private",        projeto: "Holding",             grupo: "LPX", bancos: ["BCP", "Revolut", "CGD"] },
];

// ─── GRUPOS ──────────────────────────────────────────────────────────────────
// Cada empresa pertence a um grupo. Para acrescentar um grupo novo basta usar
// outro valor em `grupo` acima e registá-lo em GRUPOS_INFO.
export const GRUPOS_INFO = {
  LPX: { nome: "LPX",  descricao: "Grupo LPX",             cor: "#1a1a2e" },
  HDG: { nome: "HDG",  descricao: "Grupo HDG",             cor: "#4a6fa5" },
};

// Lista de grupos existentes, pela ordem em que aparecem em DEF
export const GRUPOS = [...new Set(DEF.map((e) => e.grupo))];

// Nome apresentado na interface: razão social + projeto entre parênteses.
export const nomeCompleto = (e) => e.projeto ? `${e.nome} (${e.projeto})` : e.nome;

// Agrupa uma lista de empresas por grupo, preservando a ordem de GRUPOS.
export const agruparPorGrupo = (empresas) =>
  GRUPOS
    .map((g) => ({ grupo: g, info: GRUPOS_INFO[g] || { nome: g, cor: "#888" },
                   empresas: empresas.filter((e) => e.grupo === g) }))
    .filter((bloco) => bloco.empresas.length > 0);



// Forma completa usada pelo App / Extratos / Fluxo Futuro.
// Saldos a zero — a app passa a ler o saldo real do último movimento importado.
export const EMPRESAS = DEF.map((e) => ({
  id: e.id,
  nome: `${e.nome} (${e.projeto})`,  // apresentado na UI
  razaoSocial: e.nome,               // razão social isolada
  grupo: e.grupo,
  nipc: "",
  projeto: e.projeto,
  contas: e.bancos.map((banco) => ({
    id: buildContaId(e.id, banco),
    banco,
    iban: "",
    saldo: 0,
    sheet: `${e.nome} ${banco}`, // nome da folha no Excel de importação
  })),
}));

// Forma usada pelo ecrã "Importar Extrato" (lista de bancos por empresa).
export const EMPRESAS_IMPORT = DEF.map((e) => ({
  id: e.id,
  grupo: e.grupo,
  nome: `${e.nome} (${e.projeto})`,
  contas: e.bancos,
}));

// Forma simples (id + nome) usada pelo ecrã "Importar Fatura".
export const EMPRESAS_SIMPLE = DEF.map((e) => ({ id: e.id, grupo: e.grupo, nome: `${e.nome} (${e.projeto})` }));

// Lista de projetos (usada nos filtros de Fotos e Comercial)
export const PROJETOS = DEF.map((e) => ({ id: e.id, projeto: e.projeto, empresa: e.nome, grupo: e.grupo }));

// Cores por banco (usadas nos chips da UI).
export const BANCO_COLORS = {
  "BCP": "#002FA7",
  "RED": "#D93B3B",
  "Revolut": "#6772E5",
  "CGD": "#00A859",
};

export default EMPRESAS;
