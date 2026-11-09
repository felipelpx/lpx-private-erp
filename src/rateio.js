// ─────────────────────────────────────────────────────────────────────────────
// REPARTIR UMA FATURA POR VÁRIAS CATEGORIAS
//
// Uma fatura do empreiteiro traz obra e trabalhos a mais; uma da Autoridade
// Tributária traz IMI e imposto de selo. Classificá-la toda numa categoria só
// obriga a escolher a que pesa mais e a mentir no resto — e é no resto que
// depois ninguém encontra o dinheiro.
//
// A repartição vive numa coluna `rateio` da própria fatura, uma lista de
// linhas. Cada linha é um valor OU uma percentagem do total da fatura:
//
//     [{ categoria, subcategoria, valor }]        valor em euros
//     [{ categoria, subcategoria, pct }]          percentagem do total
//
// As duas formas convivem na mesma fatura: há faturas em que se sabe o valor
// exato de uma rubrica e o resto é proporção.
//
// ── A regra que não se pode quebrar ─────────────────────────────────────────
// A soma das partes é SEMPRE o total da fatura. Uma repartição que soma menos
// faz desaparecer dinheiro do Fluxo Futuro e do Real × Orçado sem nada que o
// denuncie — a fatura continua na lista, com o seu valor, e a diferença
// evapora-se no meio das rubricas.
//
// Por isso há duas defesas, e são de propósito redundantes:
//   · o ecrã não deixa gravar uma repartição que não fecha, e diz quanto falta;
//   · `partesDaFatura` fecha a conta à força — o que sobrar vai para uma parte
//     final na categoria da própria fatura. Mesmo uma linha estragada na base
//     de dados, vinda de outro sítio, não consegue perder um cêntimo.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const arred2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const abs = (v) => Math.abs(num(v));
const txt = (v) => String(v ?? "").trim();
// Os euros destas mensagens vão direitos para o ecrã, por isso escrevem-se
// como no resto da app: vírgula nos cêntimos, ponto nos milhares.
const eur = (v) => {
  const [i, d] = arred2(v).toFixed(2).split(".");
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d} €`;
};

/** Tem repartição a sério, com pelo menos duas linhas aproveitáveis? */
export function temRateio(f) {
  return linhasUteis(f?.rateio).length > 0;
}

// Uma linha só conta se disser para onde vai e quanto. Linhas vazias são
// ruído do ecrã (a última, por preencher) e não erro: ignoram-se.
function linhasUteis(rateio) {
  if (!Array.isArray(rateio)) return [];
  return rateio.filter(l => l && txt(l.categoria)
    && (num(l.valor) !== 0 || num(l.pct) !== 0));
}

/**
 * As partes de uma repartição, em euros, contra um total.
 *
 * Devolve sempre números positivos: o sinal é de quem consome (uma fatura por
 * pagar é saída, e isso decide-se lá, não aqui).
 */
export function calcularPartes(rateio, total) {
  const bruto = abs(total);
  return linhasUteis(rateio).map(l => {
    const porPct = num(l.pct) !== 0;
    return {
      categoria: txt(l.categoria),
      subcategoria: txt(l.subcategoria),
      descricao: txt(l.descricao),
      pct: porPct ? num(l.pct) : null,
      valor: arred2(porPct ? bruto * num(l.pct) / 100 : abs(l.valor)),
    };
  });
}

/**
 * Confere uma repartição contra o total da fatura, para o ecrã poder dizer o
 * que está mal ANTES de se gravar.
 *
 * @returns { partes, soma, sobra, fecha, erros }
 *          `sobra` é o que falta para o total (negativo = passou-se).
 */
export function conferirRateio(rateio, total) {
  const bruto = abs(total);
  const partes = calcularPartes(rateio, total);
  const soma = arred2(partes.reduce((s, p) => s + p.valor, 0));
  const sobra = arred2(bruto - soma);
  const erros = [];

  const comCategoria = (Array.isArray(rateio) ? rateio : [])
    .filter(l => l && (num(l.valor) !== 0 || num(l.pct) !== 0) && !txt(l.categoria));
  if (comCategoria.length)
    erros.push(`${comCategoria.length} ${comCategoria.length === 1
      ? "linha tem valor mas não tem categoria" : "linhas têm valor mas não têm categoria"}.`);

  if (partes.some(p => p.pct !== null && (p.pct < 0 || p.pct > 100)))
    erros.push("Há percentagens fora de 0–100%.");

  if (partes.length && Math.abs(sobra) >= 0.005)
    erros.push(sobra > 0
      ? `Faltam ${eur(sobra)} para o total da fatura (${eur(bruto)}).`
      : `A repartição passa o total da fatura em ${eur(-sobra)}.`);

  // Repartir por uma categoria só não é repartir — é classificar, e para isso
  // já existe o campo normal. Não é erro, mas o ecrã pode dizê-lo.
  const avisos = [];
  if (partes.length === 1)
    avisos.push("Só há uma categoria: mais vale usar a classificação normal da fatura.");

  return { partes, soma, sobra, fecha: Math.abs(sobra) < 0.005 && erros.length === 0,
           erros, avisos };
}

/**
 * As partes de uma fatura, SEMPRE — tenha ela repartição ou não.
 *
 * É esta a função que o Fluxo Futuro, o Real × Orçado e os mapas chamam, em
 * vez de lerem `f.categoria` à mão. Uma fatura sem repartição devolve uma
 * parte só, igual a ela própria: assim o código de quem consome é o mesmo nos
 * dois casos e não há um caminho que esqueça a repartição.
 *
 * Cada parte leva `_fatura` (a fatura de origem) e `_parte`/`_nPartes`, para
 * o detalhe de uma célula poder dizer de que documento veio e que é um
 * pedaço dele.
 */
export function partesDaFatura(f) {
  const total = abs(f?.valor);
  const inteira = [{
    categoria: txt(f?.categoria), subcategoria: txt(f?.subcategoria),
    descricao: "", valor: total, pct: null,
  }];

  const partes = temRateio(f) ? calcularPartes(f.rateio, total) : inteira;

  // Fechar a conta à força. Ver a nota do topo: uma repartição que não soma o
  // total faria dinheiro desaparecer do fluxo sem nada a denunciar.
  const soma = arred2(partes.reduce((s, p) => s + p.valor, 0));
  const sobra = arred2(total - soma);
  if (partes !== inteira && Math.abs(sobra) >= 0.005) {
    if (sobra > 0) {
      partes.push({ categoria: txt(f?.categoria), subcategoria: txt(f?.subcategoria),
                    descricao: "resto por classificar", valor: sobra, pct: null,
                    _resto: true });
    } else {
      // Passou-se do total: tira-se do fim, que é onde está o arredondamento.
      // Nunca se deixa a soma acima do que a fatura vale.
      let excesso = -sobra;
      for (let i = partes.length - 1; i >= 0 && excesso > 0.004; i--) {
        const corta = Math.min(partes[i].valor, excesso);
        partes[i] = { ...partes[i], valor: arred2(partes[i].valor - corta), _cortado: true };
        excesso = arred2(excesso - corta);
      }
    }
  }

  const vivas = partes.filter(p => p.valor > 0.004);
  const n = vivas.length;
  return vivas.map((p, i) => ({ ...p, _fatura: f, _parte: i + 1, _nPartes: n }));
}

/**
 * O que vai para a base de dados: linhas limpas, sem os campos de trabalho do
 * ecrã. Uma repartição com menos de duas linhas não é repartição — grava-se
 * vazia, para a fatura voltar a ser classificada pelo campo normal.
 */
export function rateioParaGravar(rateio, total) {
  const uteis = linhasUteis(rateio);
  if (uteis.length < 2) return [];
  return uteis.map(l => {
    const base = { categoria: txt(l.categoria), subcategoria: txt(l.subcategoria) };
    if (txt(l.descricao)) base.descricao = txt(l.descricao);
    // Guarda-se COMO foi definido — percentagem ou valor. Converter a % em
    // euros ao gravar fazia a repartição deixar de acompanhar uma correção do
    // valor da fatura, que é metade da razão para usar percentagens.
    if (num(l.pct) !== 0) base.pct = arred2(num(l.pct));
    else base.valor = arred2(abs(l.valor));
    return base;
  });
}

/** Uma linha nova, em branco, para o ecrã acrescentar à lista. */
export const LINHA_VAZIA = { categoria: "", subcategoria: "", valor: "", pct: "" };

/**
 * Reparte o que falta pelas linhas sem valor, para o botão "repartir o resto".
 * Em percentagem quando as outras já estão em percentagem, senão em euros.
 */
export function repartirResto(rateio, total) {
  const linhas = Array.isArray(rateio) ? [...rateio] : [];
  const vazias = linhas.map((l, i) => ({ l, i }))
    .filter(({ l }) => l && txt(l.categoria) && num(l.valor) === 0 && num(l.pct) === 0);
  if (!vazias.length) return linhas;

  const { sobra } = conferirRateio(linhas, total);
  if (sobra <= 0.004) return linhas;

  const porPct = linhas.some(l => num(l?.pct) !== 0);
  const bruto = abs(total);
  let resta = porPct ? arred2(sobra / (bruto || 1) * 100) : sobra;

  vazias.forEach(({ i }, k) => {
    const ultima = k === vazias.length - 1;
    const quota = ultima ? resta
      : arred2(resta / (vazias.length - k));
    resta = arred2(resta - quota);
    linhas[i] = porPct ? { ...linhas[i], pct: quota, valor: "" }
                       : { ...linhas[i], valor: quota, pct: "" };
  });
  return linhas;
}
