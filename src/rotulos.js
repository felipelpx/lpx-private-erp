// ─── POSICIONAMENTO DE RÓTULOS ───────────────────────────────────────────────
// Os valores desenhados nos gráficos falhavam de três maneiras diferentes, e
// cada uma precisa da sua resposta:
//
//   1. Rótulos em cima uns dos outros → deteção de colisão entre caixas, com
//      posições alternativas por candidato (acima, abaixo, mais acima…).
//   2. Rótulos tapados pelas linhas e barras → contorno branco por baixo do
//      texto (paint-order) e as linhas entregues como obstáculos, para que o
//      rótulo procure primeiro um sítio que não as cruze.
//   3. Falta de espaço quando há muitos meses → cada gráfico alarga o viewBox
//      em função do número de pontos (`larguraGrafico`), passando a haver
//      espaço real em vez de espremer tudo em 900 px.
//
//   cand = { x, y, texto, fontSize, cor, ancora, rot, alternativas: [dy…] }
//
// Com rot = -90 o texto fica na vertical: ocupa ~8 px de largura em vez de 30,
// que é o que permite mostrar entradas e saídas lado a lado sem se tocarem.

// Largura do viewBox: nunca menos do que `minimo`, e `porPonto` px por ponto.
export const larguraGrafico = (n, porPonto, minimo) =>
  Math.max(minimo, Math.round(60 + n * porPonto));

// Caixa envolvente do rótulo, já com a ancoragem e a rotação aplicadas.
export function caixaDe(c, dy) {
  const fs = c.fontSize || 8;
  const comp = String(c.texto).length * fs * 0.63;  // comprimento do texto
  const esp = fs * 1.05;                            // espessura da linha de texto
  const anc = c.ancora || "middle";
  if ((c.rot || 0) === -90) {
    const yb = c.y + dy;                            // cresce para cima
    const cy = anc === "start" ? yb - comp / 2 : anc === "end" ? yb + comp / 2 : yb;
    return { cx: c.x, cy, w: esp, h: comp };
  }
  const cx = anc === "start" ? c.x + comp / 2 : anc === "end" ? c.x - comp / 2 : c.x;
  return { cx, cy: c.y + dy - esp * 0.34, w: comp, h: esp };
}

// Interseção caixa × segmento de reta (recorte por faixas, Liang–Barsky).
export function cortaSegmento(b, [p, q]) {
  const x0 = b.cx - b.w / 2, x1 = b.cx + b.w / 2;
  const y0 = b.cy - b.h / 2, y1 = b.cy + b.h / 2;
  const dx = q.x - p.x, dy = q.y - p.y;
  let t0 = 0, t1 = 1;
  const faixa = (pp, qq) => {
    if (pp === 0) return qq >= 0;                   // paralelo: fora se já está fora
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return faixa(-dx, p.x - x0) && faixa(dx, x1 - p.x) &&
         faixa(-dy, p.y - y0) && faixa(dy, y1 - p.y);
}

export function colocarRotulos(cands, { margemX = 2, margemY = 2, linhas = [], limites = null } = {}) {
  const postos = [];
  const bate = (a, b) =>
    Math.abs(a.cx - b.cx) * 2 < (a.w + b.w) + margemX * 2 &&
    Math.abs(a.cy - b.cy) * 2 < (a.h + b.h) + margemY * 2;

  // Uma posição que caia fora do viewBox corta o texto ao meio: não serve.
  const cabe = (b) => !limites ||
    (b.cx - b.w / 2 >= limites.x0 && b.cx + b.w / 2 <= limites.x1 &&
     b.cy - b.h / 2 >= limites.y0 && b.cy + b.h / 2 <= limites.y1);

  const segs = [];
  linhas.forEach(pts => {
    for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
  });

  cands.filter(Boolean).forEach(c => {
    const opcoes = c.alternativas && c.alternativas.length ? c.alternativas : [0];
    let livre = null, sobreLinha = null;
    for (const dy of opcoes) {
      const caixa = caixaDe(c, dy);
      if (!cabe(caixa)) continue;                            // sai do viewBox
      if (postos.some(p => bate(caixa, p))) continue;        // tapar outro valor: nunca
      if (segs.some(s => cortaSegmento(caixa, s))) {
        if (!sobreLinha) sobreLinha = { caixa, dy };         // cruzar a linha: só em último caso
        continue;
      }
      livre = { caixa, dy };
      break;
    }
    const esc = livre || sobreLinha;
    if (!esc) return;                                        // não coube: fica só o tooltip
    postos.push({
      ...esc.caixa, ax: c.x, ay: c.y + esc.dy, texto: c.texto, cor: c.cor,
      fontSize: c.fontSize || 8, ancora: c.ancora || "middle", rot: c.rot || 0,
    });
  });
  return postos;
}

