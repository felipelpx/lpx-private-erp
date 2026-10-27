// ─────────────────────────────────────────────────────────────────────────────
// MARCA — LPX Private
//
// Único sítio a alterar para mudar a identidade visual da app. Os valores
// vêm do manual de identidade (lpx-identidade-visual-v2):
//
//     #091C2A  navy      #BAA685  ouro      #FCF3EB  creme      #23292D  grafite
//     Títulos: Zalando Sans SemiExpanded ExtraLight
//     Texto:   Inter ExtraLight
//
// A regra da marca é a contenção: fundo claro e quente, muito espaço, traço
// fino, e o ouro usado com conta — é um acento, não uma cor de preenchimento.
// Cor forte só onde carrega significado (um saldo negativo, um atraso).
// ─────────────────────────────────────────────────────────────────────────────

// Marca a versão publicada. Serve para confirmar, no próprio ecrã, se o
// deploy chegou — aparece ao lado do nome do utilizador na barra de cima.
// O número que aparece no cabeçalho. Serve para se saber, de um relance,
// qual é a versão que está mesmo publicada no site.
export const VERSAO = "v106";

// ─── Paleta ──────────────────────────────────────────────────────────────────
export const COR = {
  // Da marca
  navy:    "#091C2A",
  ouro:    "#BAA685",
  creme:   "#FCF3EB",
  grafite: "#23292D",

  // Derivadas do ouro, para estados e superfícies
  ouroEscuro: "#96702A",
  ouroClaro:  "#D6C8AE",
  ouroTenue:  "#F6ECD6",

  // Superfícies — todas quentes, para assentarem no creme
  papel:      "#FFFFFF",
  fundo:      "#F6F0E8",
  fundoSuave: "#FAF6F0",
  fundoTenue: "#FDFAF6",

  // Traço: a marca vive de linhas finas, nunca de caixas pesadas
  linha:      "#E7DED2",
  linhaSuave: "#F1E9DE",
  linhaForte: "#D8CCBB",

  // Texto
  texto:       "#23292D",
  textoSuave:  "#6E7378",
  textoTenue:  "#9DA2A6",
  textoApagado:"#C4C7CA",
  sobreEscuro: "#FCF3EB",
  sobreEscuroTenue: "#8B98A3",

  // Significado — dessaturadas o suficiente para conviverem com o creme,
  // saturadas o suficiente para se lerem de relance numa tabela de números.
  positivo:       "#1F7A54",
  positivoForte:  "#1B6A49",
  positivoFundo:  "#EAF3EE",
  positivoLinha:  "#C9E3D5",

  negativo:       "#A93226",
  negativoForte:  "#8E2A20",
  negativoFundo:  "#FBEDEB",
  negativoLinha:  "#EFCFC9",

  alerta:       "#96702A",
  alertaForte:  "#7A5A22",
  alertaFundo:  "#FBF6EC",
  alertaLinha:  "#E3CE9F",

  info:         "#2C4A63",
  infoForte:    "#1F3A52",
  infoFundo:    "#EDF1F5",
  infoLinha:    "#D3DDE6",
};

// ─── Tipografia ──────────────────────────────────────────────────────────────
// Os nomes das variáveis estão definidos em src/estilo.css. Usar as variáveis
// (e não a lista de fontes) para que uma troca de fonte seja um sítio só.
export const FONTE = {
  titulo: "var(--fonte-titulo)",   // Zalando Sans SemiExpanded
  texto:  "var(--fonte-texto)",    // Inter
  numero: "var(--fonte-numero)",   // Inter com algarismos tabulares
};

// ─── Forma ───────────────────────────────────────────────────────────────────
export const RAIO = { pequeno: 6, medio: 10, grande: 14, pilula: 999 };

// Sombras quase invisíveis: a separação faz-se com a linha, não com a sombra.
export const SOMBRA = {
  nenhuma: "none",
  cartao:  "0 1px 2px rgba(9,28,42,0.04)",
  flutua:  "0 10px 30px rgba(9,28,42,0.10)",
  modal:   "0 24px 64px rgba(9,28,42,0.22)",
};

export const BRAND = {
  nome: "LPX Private",
  nomeCurto: "LPX",
  subtitulo: "GESTÃO FINANCEIRA · ERP",
  tagline: "Dashboard Financeiro",

  // O logótipo é desenhado em SVG (ver src/Logo.jsx) e herda a cor do texto.
  // O PNG antigo fica para onde não se pode usar SVG.
  logo: "/logo-lpx.png",

  // Compatibilidade com o código anterior — tudo aponta para a paleta nova.
  dark: COR.navy,
  navy: COR.navy,
  accent: COR.ouro,
  accentHex: "BAA685",
  bg: COR.fundo,
};

export default BRAND;
