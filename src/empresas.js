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
  { id: "favcloset", nome: "Favorite Closet",   nipc: "", projeto: "Favorite Closet",   bancos: ["BCP", "RED"] },
  { id: "simplify",  nome: "Simplify Rubric",   nipc: "", projeto: "Simplify Rubric",   bancos: ["BCP", "RED"] },
  { id: "enchanted", nome: "Enchanted Vortex",  nipc: "", projeto: "Enchanted Vortex",  bancos: ["BCP"] },
  { id: "blessed",   nome: "Blessed Legion",    nipc: "", projeto: "Blessed Legion",    bancos: ["BCP"] },
  { id: "pearl",     nome: "Pearl Syntax",      nipc: "", projeto: "Pearl Syntax",      bancos: ["BCP"] },
  { id: "genero",    nome: "Género Prudente",   nipc: "", projeto: "Género Prudente",   bancos: ["BCP"] },
  { id: "fluffy",    nome: "Fluffy Rithm",      nipc: "", projeto: "Fluffy Rithm",      bancos: ["BCP"] },
  { id: "adseq",     nome: "Admirable Sequence",nipc: "", projeto: "Admirable Sequence",bancos: ["BCP", "RED"] },
  { id: "infinite",  nome: "Infinite Change",   nipc: "", projeto: "Infinite Change",   bancos: ["BCP", "RED"] },
  { id: "lpx",       nome: "LPX Private",       nipc: "", projeto: "LPX Private",       bancos: ["BCP", "Revolut", "CGD"] },
];

// Forma completa usada pelo App / Extratos / Fluxo Futuro.
// Saldos a zero — a app passa a ler o saldo real do último movimento importado.
export const EMPRESAS = DEF.map((e) => ({
  id: e.id,
  nome: e.nome,
  nipc: e.nipc,
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
  nome: e.nome,
  contas: e.bancos,
}));

// Forma simples (id + nome) usada pelo ecrã "Importar Fatura".
export const EMPRESAS_SIMPLE = DEF.map((e) => ({ id: e.id, nome: e.nome }));

// Cores por banco (usadas nos chips da UI).
export const BANCO_COLORS = {
  "BCP": "#002FA7",
  "RED": "#D93B3B",
  "Revolut": "#6772E5",
  "CGD": "#00A859",
};

export default EMPRESAS;
