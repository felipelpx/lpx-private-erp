// ─────────────────────────────────────────────────────────────────────────────
// O MESMO DECK, EM PDF
//
// Lê exactamente as mesmas peças que o .pptx — os objetos devolvidos por
// texto(), caixa(), regua(), tabela() e imagem() em src/pptx.js. É por isso
// que isto existe: a disposição está escrita UMA vez, em src/reportCaixaPptx.js,
// e há dois desenhadores a lê-la. Duas disposições separadas divergiam ao
// primeiro ajuste, e ninguém daria por isso até alguém comparar os dois
// ficheiros lado a lado numa reunião.
//
// Escrito à mão, como o .pptx, e pela mesma razão: um PDF é um formato de
// texto com objetos numerados e um stream de operadores. Não precisa de
// biblioteca nenhuma, e assim não há uma dependência externa a decidir se o
// report sai ou não.
//
// ── O que um PDF precisa ────────────────────────────────────────────────────
//   · objetos numerados, cada um "N 0 obj … endobj"
//   · uma tabela xref com a posição de cada um, em bytes
//   · um trailer a apontar para o catálogo
//
// As fontes são as 14 padrão (Helvetica, Times), que não se embebem: estão em
// qualquer leitor. O Times faz as vezes do Georgia nos títulos — é a mesma
// família de serifas e é o que há sem embeber ficheiros de fonte.
// ─────────────────────────────────────────────────────────────────────────────

import { logoRgbIdat, LOGO_RGB_LARGURA, LOGO_RGB_ALTURA } from "./logoRgb.js";
import { LARGURAS } from "./larguras.js";

const PT = 72;                       // pontos por polegada

// ─── Larguras dos caracteres ────────────────────────────────────────────────
// As tabelas vêm das métricas oficiais das fontes (ver src/larguras.js, que é
// gerado, não escrito à mão). Sem larguras certas não há alinhamento à
// direita, e numa coluna de euros isso vê-se logo.
function larguraTexto(t, tamanho, fonte) {
  const tab = LARGURAS[fonte] || LARGURAS["Helvetica"];
  let m = 0;
  for (const ch of String(t ?? "")) {
    let w = tab[ch];
    if (w === undefined) {
      // Um carácter que a fonte não tem sai como "?" no ficheiro (ver
      // paraPdf), por isso conta-se a largura do "?" — a linha fica com a
      // largura que vai mesmo ter, em vez de encolher e desalinhar a coluna.
      w = tab["?"] ?? 500;
    }
    m += w;
  }
  return m / 1000 * tamanho;
}

// ─── Texto para dentro do PDF ───────────────────────────────────────────────
// Os leitores esperam WinAnsiEncoding: um byte por carácter, Latin-1 com
// algumas trocas. O euro é 0x80, e os travessões e reticências vivem nos
// 0x91–0x97. Fora disso, vai o Latin-1 direto.
const WINANSI = { "€":0x80, "‚":0x82, "ƒ":0x83, "„":0x84, "…":0x85, "†":0x86, "‡":0x87,
  "ˆ":0x88, "‰":0x89, "Š":0x8A, "‹":0x8B, "Œ":0x8C, "Ž":0x8E, "'":0x91, "'":0x92,
  "“":0x93, "”":0x94, "•":0x95, "–":0x96, "—":0x97, "˜":0x98, "™":0x99,
  "š":0x9A, "›":0x9B, "œ":0x9C, "ž":0x9E, "Ÿ":0x9F };

function paraPdf(t) {
  let out = "";
  for (const ch of String(t ?? "")) {
    let b = WINANSI[ch];
    if (b === undefined) {
      const c = ch.codePointAt(0);
      // O menos tipográfico não existe em WinAnsi: usa-se o hífen, senão
      // um saldo negativo saía sem sinal nenhum.
      b = ch === "−" ? 0x2D : (c <= 0xFF ? c : 0x3F);
    }
    out += (b === 0x28 || b === 0x29 || b === 0x5C ? "\\" : "") + String.fromCharCode(b);
  }
  return out;
}

const nomeFonte = (f, negrito) => {
  const serif = /georgia|times|garamond|serif/i.test(f || "");
  if (serif) return negrito ? "F2" : "F1";
  return negrito ? "F4" : "F3";
};
const fonteReal = (f, negrito) => {
  const serif = /georgia|times|garamond|serif/i.test(f || "");
  return serif ? (negrito ? "Times-Bold" : "Times-Roman")
               : (negrito ? "Helvetica-Bold" : "Helvetica");
};

const cor = (c) => {
  const h = String(c || "1A1A1A").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(x => x + x).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
    .map(v => v.toFixed(3)).join(" ");
};

// ─── Desenhar uma peça ──────────────────────────────────────────────────────
// Todas as medidas das peças estão em POLEGADAS e a contar do canto superior
// esquerdo; o PDF conta do inferior esquerdo, em pontos.
function desenhar(f, H, ops, usouLogo) {
  if (!f || typeof f === "string") return;
  const X = (v) => (v * PT).toFixed(2);
  const Y = (v) => ((H - v) * PT).toFixed(2);

  switch (f.tipo) {
    case "caixa": {
      const { x, y, cx, cy, fill, linha, larguraLinha = 0.75 } = f;
      if (fill) ops.push(`${cor(fill)} rg ${X(x)} ${Y(y + cy)} ${(cx * PT).toFixed(2)} ${(cy * PT).toFixed(2)} re f`);
      if (linha) ops.push(`${cor(linha)} RG ${(larguraLinha).toFixed(2)} w `
        + `${X(x)} ${Y(y + cy)} ${(cx * PT).toFixed(2)} ${(cy * PT).toFixed(2)} re S`);
      if (f.paras) desenharParas(f.paras, x, y, cx, cy, f.opts || {}, H, ops);
      break;
    }
    case "regua": {
      ops.push(`${cor(f.cor)} RG ${(f.largura || 1).toFixed(2)} w `
        + `${X(f.x)} ${Y(f.y)} m ${X(f.x + f.cx)} ${Y(f.y)} l S`);
      break;
    }
    case "texto":
      desenharParas(f.paras, f.x, f.y, f.cx, f.cy, f.opts || {}, H, ops);
      break;
    case "tabela":
      desenharTabela(f, H, ops);
      break;
    case "imagem":
      // Uma só imagem no deck (o logótipo). O `q … cm … Q` põe a imagem na
      // caixa certa: o PDF desenha-a sempre num quadrado unitário.
      usouLogo.valor = true;
      ops.push(`q ${(f.cx * PT).toFixed(2)} 0 0 ${(f.cy * PT).toFixed(2)} `
        + `${X(f.x)} ${Y(f.y + f.cy)} cm /Im1 Do Q`);
      break;
  }
}

// O texto de uma caixa.
//
// Com quebra de linha, porque o PowerPoint quebra: uma conclusão comprida
// cabia no .pptx e saía do papel no PDF, e os dois ficheiros deixavam de
// dizer o mesmo. Parte-se nos espaços, à largura útil da caixa.
function quebrar(paras, cx, margem) {
  const util = cx - 2 * margem;
  const linhas = [];                     // [{ pedacos, align, espacoAntes, entreLinhas }]

  (Array.isArray(paras) ? paras : [paras])
    .filter(p => p && p._par)
    .forEach(p => {
      let atual = { pedacos: [], align: p.align, espacoAntes: p.espacoAntes || 0,
                    entreLinhas: p.entreLinhas, largura: 0 };
      const empurrar = () => {
        linhas.push(atual);
        atual = { pedacos: [], align: p.align, espacoAntes: 0,
                  entreLinhas: p.entreLinhas, largura: 0 };
      };

      (p.runs || []).forEach(r => {
        const sz = r.sz ?? 11;
        const fonte = fonteReal(r.fonte, r.b);
        // As palavras levam o seu espaço atrás, para o espaço não ficar
        // pendurado no fim da linha quando se quebra ali.
        const palavras = String(r.t ?? "").split(/(\s+)/).filter(x => x !== "");
        palavras.forEach(w => {
          const larg = larguraTexto(w, sz, fonte) / PT;
          const soEspaco = /^\s+$/.test(w);
          if (!soEspaco && atual.largura + larg > util && atual.pedacos.length) empurrar();
          if (soEspaco && atual.pedacos.length === 0) return;   // não começa linha com espaço
          atual.pedacos.push({ ...r, t: w, sz, fonte, larg });
          atual.largura += larg;
        });
      });
      if (atual.pedacos.length || linhas.length === 0) empurrar();
    });

  return linhas;
}

function desenharParas(paras, x, y, cx, cy, opts, H, ops) {
  const margem = opts.margem ?? 0.1;
  const linhas = quebrar(paras, cx, margem).filter(l => l.pedacos.length);
  if (!linhas.length) return;

  const alturaDe = (l) => {
    const maior = Math.max(...l.pedacos.map(pz => pz.sz), 1);
    return maior * (l.entreLinhas || 1.2) / PT + l.espacoAntes / PT;
  };
  const alturas = linhas.map(alturaDe);
  const total = alturas.reduce((s, a) => s + a, 0);

  const ancora = opts.anchor || "t";
  let topo = y + margem;
  if (ancora === "ctr") topo = y + (cy - total) / 2 + alturas[0] * 0.08;
  else if (ancora === "b") topo = y + cy - total - margem;

  linhas.forEach((l, i) => {
    const maior = Math.max(...l.pedacos.map(pz => pz.sz), 1);
    // A linha de base assenta a 0,78 do corpo abaixo do topo nestas fontes.
    const base = topo + l.espacoAntes / PT + maior * 0.78 / PT;

    const util = cx - 2 * margem;
    let cursor = x + margem;
    if (l.align === "r") cursor = x + cx - margem - l.largura;
    else if (l.align === "ctr") cursor = x + margem + (util - l.largura) / 2;

    l.pedacos.forEach(r => {
      if (!String(r.t).trim()) { cursor += r.larg; return; }
      ops.push(`BT /${nomeFonte(r.fonte, r.b)} ${r.sz.toFixed(2)} Tf `
        + `${cor(r.cor)} rg ${(cursor * PT).toFixed(2)} ${((H - base) * PT).toFixed(2)} Td `
        + `(${paraPdf(r.t)}) Tj ET`);
      cursor += r.larg;
    });
    topo += alturas[i];
  });
}

function desenharTabela({ x, y, larguras, linhas }, H, ops) {
  const X = (v) => (v * PT).toFixed(2);
  const Y = (v) => ((H - v) * PT).toFixed(2);
  let cursorY = y;

  (linhas || []).forEach(l => {
    const altura = l.altura ?? 0.26;
    let cursorX = x;
    (l.celulas || []).forEach((c, i) => {
      const w = larguras[i] ?? 1;
      if (c.fill)
        ops.push(`${cor(c.fill)} rg ${X(cursorX)} ${Y(cursorY + altura)} `
          + `${(w * PT).toFixed(2)} ${(altura * PT).toFixed(2)} re f`);

      // Só a borda de baixo, como no .pptx: as verticais transformavam a
      // tabela numa grelha de Excel.
      ops.push(`${cor(c.linhaBaixo || "EFE6D8")} RG 0.5 w `
        + `${X(cursorX)} ${Y(cursorY + altura)} m ${X(cursorX + w)} ${Y(cursorY + altura)} l S`);

      const paras = [{ _par: true, align: c.align || "l",
        runs: [{ t: c.t, cor: c.cor, sz: c.sz ?? 9, b: c.b, fonte: c.fonte }] }];
      if (c.t2) paras.push({ _par: true, align: c.align || "l", entreLinhas: 0.92,
        runs: [{ t: c.t2, cor: c.cor2 || "8A8F93", sz: c.sz2 ?? 7.2, fonte: c.fonte }] });

      desenharParas(paras, cursorX, cursorY, w, altura,
                    { anchor: "ctr", margem: 0.08 }, H, ops);
      cursorX += w;
    });
    cursorY += altura;
  });
}

// ─── O ficheiro ─────────────────────────────────────────────────────────────
export function construirPdf(slides, { largura = 13.333, altura = 7.5,
                                       titulo = "Report", autor = "LPX Private" } = {}) {
  const usouLogo = { valor: false };
  const conteudos = slides.map(formas => {
    const ops = [];
    (formas || []).forEach(f => desenhar(f, altura, ops, usouLogo));
    return ops.join("\n");
  });

  const objetos = [];
  const novo = (corpo) => { objetos.push(corpo); return objetos.length; };

  // Os objetos têm de existir antes de se apontar para eles, por isso o
  // catálogo e o pages ficam para o fim, com os números reservados.
  const nCat = 1, nPages = 2;
  objetos.push(null, null);               // reservados

  const nFontes = [
    novo(`<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>`),
    novo(`<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>`),
    novo(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`),
    novo(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`),
  ];

  // A imagem: o IDAT do PNG entra tal e qual. Um PNG RGB sem entrelaçamento
  // É um stream FlateDecode com preditores PNG — ver src/logoRgb.js.
  let nImg = null;
  if (usouLogo.valor) {
    const idat = logoRgbIdat();
    nImg = novo({
      dic: `<< /Type /XObject /Subtype /Image /Width ${LOGO_RGB_LARGURA} `
         + `/Height ${LOGO_RGB_ALTURA} /ColorSpace /DeviceRGB /BitsPerComponent 8 `
         + `/Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 `
         + `/BitsPerComponent 8 /Columns ${LOGO_RGB_LARGURA} >> /Length ${idat.length} >>`,
      stream: idat,
    });
  }

  const recursos = `<< /Font << /F1 ${nFontes[0]} 0 R /F2 ${nFontes[1]} 0 R `
    + `/F3 ${nFontes[2]} 0 R /F4 ${nFontes[3]} 0 R >>`
    + (nImg ? ` /XObject << /Im1 ${nImg} 0 R >>` : "") + ` >>`;

  const nPaginas = [];
  conteudos.forEach(c => {
    // O mesmo aqui: o stream da página leva os bytes WinAnsi tal e qual, e o
    // /Length tem de contar ESSES bytes, não os de uma versão em UTF-8.
    const bytes = new Uint8Array(c.length);
    for (let i = 0; i < c.length; i++) bytes[i] = c.charCodeAt(i) & 0xFF;
    const nC = novo({ dic: `<< /Length ${bytes.length} >>`, stream: bytes });
    nPaginas.push(novo(`<< /Type /Page /Parent ${nPages} 0 R `
      + `/MediaBox [0 0 ${(largura * PT).toFixed(2)} ${(altura * PT).toFixed(2)}] `
      + `/Resources ${recursos} /Contents ${nC} 0 R >>`));
  });

  objetos[nCat - 1] = `<< /Type /Catalog /Pages ${nPages} 0 R >>`;
  objetos[nPages - 1] = `<< /Type /Pages /Count ${nPaginas.length} `
    + `/Kids [${nPaginas.map(n => `${n} 0 R`).join(" ")}] >>`;

  const info = novo(`<< /Title (${paraPdf(titulo)}) /Author (${paraPdf(autor)}) `
    + `/Producer (LPX Private ERP) >>`);

  // ── Montagem, a contar bytes para a xref ──────────────────────────────────
  const partes = [];
  let pos = 0;
  // Um byte por carácter, SEM passar por UTF-8.
  //
  // `paraPdf` já devolve uma cadeia cujos códigos SÃO os bytes que o PDF há
  // de levar (WinAnsi). Passá-la por um TextEncoder voltava a codificá-los em
  // UTF-8 e cada acento saía em dois bytes: o "Últimos" do título aparecia
  // "Ãšltimos" e o "€" aparecia "Â€". O resto do ficheiro é ASCII, por isso
  // esta conversão é exata para tudo.
  const bytesDe = (t) => {
    const b = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i) & 0xFF;
    return b;
  };
  const escrever = (x) => {
    const b = typeof x === "string" ? bytesDe(x) : x;
    partes.push(b); pos += b.length;
  };

  escrever("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const posicoes = [];
  objetos.forEach((o, i) => {
    posicoes[i] = pos;
    escrever(`${i + 1} 0 obj\n`);
    if (o && o.stream) {
      escrever(o.dic + "\nstream\n");
      escrever(o.stream);
      escrever("\nendstream");
    } else {
      escrever(o);
    }
    escrever("\nendobj\n");
  });

  const posXref = pos;
  let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  posicoes.forEach(p => { xref += String(p).padStart(10, "0") + " 00000 n \n"; });
  escrever(xref);
  escrever(`trailer\n<< /Size ${objetos.length + 1} /Root ${nCat} 0 R `
    + `/Info ${info} 0 R >>\nstartxref\n${posXref}\n%%EOF\n`);

  const total = partes.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { saida.set(p, i); i += p.length; }
  return saida;
}
