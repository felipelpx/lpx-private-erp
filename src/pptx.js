// ─────────────────────────────────────────────────────────────────────────────
// PPTX — escrever um .pptx sem bibliotecas
//
// Um .pptx é um ZIP com XML lá dentro. Isto escreve-o à mão.
//
// Porquê, em vez de carregar uma biblioteca de um CDN como o Excel faz: um
// script externo que não carrega dá um botão que não faz nada e não diz
// porquê. Aqui não há nada para carregar — e, mais importante, pude gerar o
// ficheiro e abri-lo para conferir antes de to mandar, o que com um CDN em
// browser não conseguia fazer.
//
// O ZIP é SEM COMPRESSÃO (método 0). O formato aceita-o, o PowerPoint lê-o, e
// poupa trazer um compressor para dentro do browser. Um report de quatro
// slides de texto dá uns 60 KB.
//
// Funciona em Node e no browser: só usa TextEncoder e Uint8Array.
// ─────────────────────────────────────────────────────────────────────────────

const EMU = 914400;                       // EMU por polegada
export const pol = (v) => Math.round(Number(v) * EMU);
export const pt = (v) => Math.round(Number(v) * 100);   // centésimas de ponto

const enc = new TextEncoder();
const bytes = (s) => enc.encode(s);

// ─── XML ────────────────────────────────────────────────────────────────────
export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
    // Caracteres de controlo não são válidos em XML 1.0 e fazem o PowerPoint
    // recusar o ficheiro inteiro com "precisa de ser reparado".
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

// ─── ZIP ────────────────────────────────────────────────────────────────────
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Junta ficheiros num ZIP sem compressão. */
export function zip(ficheiros) {
  const partes = [];
  const central = [];
  let desloc = 0;

  const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

  ficheiros.forEach(({ nome, dados }) => {
    const n = bytes(nome);
    const d = dados instanceof Uint8Array ? dados : bytes(String(dados));
    const c = crc32(d);

    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0),                      // hora/data: fixas, dá ficheiros iguais
      ...u32(c), ...u32(d.length), ...u32(d.length),
      ...u16(n.length), ...u16(0),
    ];
    partes.push(new Uint8Array(local), n, d);

    central.push([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0),
      ...u32(c), ...u32(d.length), ...u32(d.length),
      ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(desloc),
    ]);
    central.push(n);
    desloc += local.length + n.length + d.length;
  });

  const dirPartes = [];
  let dirTam = 0;
  central.forEach(x => {
    const a = x instanceof Uint8Array ? x : new Uint8Array(x);
    dirPartes.push(a); dirTam += a.length;
  });

  const fim = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(ficheiros.length), ...u16(ficheiros.length),
    ...u32(dirTam), ...u32(desloc), ...u16(0),
  ]);

  const todas = [...partes, ...dirPartes, fim];
  const total = todas.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  todas.forEach(a => { out.set(a, i); i += a.length; });
  return out;
}

// ─── Formas ─────────────────────────────────────────────────────────────────
let _id = 1;
const proximoId = () => ++_id;

const corpoTexto = (paras, { anchor = "t", margem = 0.06, wrap = true } = {}) => `
  <p:txBody>
    <a:bodyPr wrap="${wrap ? "square" : "none"}" lIns="${pol(margem)}" tIns="${pol(0.02)}"
              rIns="${pol(margem)}" bIns="${pol(0.02)}" anchor="${anchor}">
      <a:spAutoFit/>
    </a:bodyPr>
    <a:lstStyle/>
    ${paras}
  </p:txBody>`;

/**
 * Um parágrafo.
 * @param partes  string, ou [{ t, cor, sz, b, i, fonte, esp }]
 */
export function par(partes, { align = "l", espacoAntes = 0, entreLinhas = null } = {}) {
  const lista = Array.isArray(partes) ? partes : [{ t: partes }];
  return { _par: true, runs: lista, align, espacoAntes, entreLinhas };
}

/** O mesmo parágrafo, agora em XML do PowerPoint. */
function parXml(pr) {
  const { runs: lista, align = "l", espacoAntes = 0, entreLinhas = null } = pr || {};
  const runs = (lista || []).map(r => {
    const espaco = r.esp ? ` spc="${Math.round(r.esp * 100)}"` : "";
    return `<a:r><a:rPr lang="pt-PT" sz="${pt(r.sz ?? 11)}" b="${r.b ? 1 : 0}"`
      + `${r.i ? ' i="1"' : ""}${espaco} dirty="0">`
      + `<a:solidFill><a:srgbClr val="${(r.cor || "1A1A1A").replace("#", "")}"/></a:solidFill>`
      + `<a:latin typeface="${esc(r.fonte || "Calibri")}"/>`
      + `<a:cs typeface="${esc(r.fonte || "Calibri")}"/>`
      + `</a:rPr><a:t>${esc(r.t ?? "")}</a:t></a:r>`;
  }).join("");
  const lnSpc = entreLinhas
    ? `<a:lnSpc><a:spcPct val="${Math.round(entreLinhas * 100000)}"/></a:lnSpc>` : "";
  return `<a:p><a:pPr algn="${align}">${lnSpc}`
    + `<a:spcBef><a:spcPts val="${pt(espacoAntes)}"/></a:spcBef></a:pPr>${runs}</a:p>`;
}

/** Parágrafos (um, vários, ou já em XML) → XML. */
function parasXml(paras) {
  const lista = Array.isArray(paras) ? paras : [paras];
  return lista.filter(Boolean)
    .map(x => (typeof x === "string" ? x : parXml(x))).join("");
}

/** Caixa de texto. */
export function texto(x, y, cx, cy, paras, opts = {}) {
  return { tipo: "texto", x, y, cx, cy, paras, opts };
}

function textoXml({ x, y, cx, cy, paras, opts = {} }) {
  const id = proximoId();
  const ps = parasXml(paras);
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="T${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="${pol(x)}" y="${pol(y)}"/><a:ext cx="${pol(cx)}" cy="${pol(cy)}"/></a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
    ${corpoTexto(ps, opts)}</p:sp>`;
}

/** Retângulo, com ou sem texto. */
export function caixa(x, y, cx, cy, o = {}) {
  return { tipo: "caixa", x, y, cx, cy, ...o };
}

function caixaXml({ x, y, cx, cy, fill = null, linha = null, larguraLinha = 0.75,
                    raio = null, paras = "", opts = {} }) {
  const id = proximoId();
  const geom = raio
    ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round(raio * 50000)}"/></a:avLst></a:prstGeom>`
    : `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`;
  const preench = fill
    ? `<a:solidFill><a:srgbClr val="${fill.replace("#", "")}"/></a:solidFill>`
    : `<a:noFill/>`;
  const contorno = linha
    ? `<a:ln w="${Math.round(larguraLinha * 12700)}"><a:solidFill><a:srgbClr val="${linha.replace("#", "")}"/></a:solidFill></a:ln>`
    : `<a:ln><a:noFill/></a:ln>`;
  const ps = parasXml(paras);
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="C${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="${pol(x)}" y="${pol(y)}"/><a:ext cx="${pol(cx)}" cy="${pol(cy)}"/></a:xfrm>
      ${geom}${preench}${contorno}</p:spPr>
    ${ps ? corpoTexto(ps, opts) : "<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>"}</p:sp>`;
}

/** Linha horizontal. */
export function regua(x, y, cx, cor = "D9CFC0", largura = 1) {
  return { tipo: "regua", x, y, cx, cor, largura };
}

function reguaXml({ x, y, cx, cor = "D9CFC0", largura = 1 }) {
  const id = proximoId();
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="L${id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>
    <p:spPr><a:xfrm><a:off x="${pol(x)}" y="${pol(y)}"/><a:ext cx="${pol(cx)}" cy="0"/></a:xfrm>
      <a:prstGeom prst="line"><a:avLst/></a:prstGeom>
      <a:ln w="${Math.round(largura * 12700)}"><a:solidFill><a:srgbClr val="${cor.replace("#", "")}"/></a:solidFill></a:ln>
    </p:spPr></p:cxnSp>`;
}

/**
 * Tabela.
 * @param larguras  larguras das colunas, em polegadas
 * @param linhas    [{ altura, celulas: [{ t, cor, sz, b, align, fill }] }]
 */
export function tabela(x, y, larguras, linhas) {
  return { tipo: "tabela", x, y, larguras, linhas };
}

function tabelaXml({ x, y, larguras, linhas }) {
  const id = proximoId();
  const gridCols = larguras.map(w => `<a:gridCol w="${pol(w)}"/>`).join("");
  const corpo = linhas.map(l => {
    const cels = (l.celulas || []).map(c => {
      const fill = c.fill
        ? `<a:solidFill><a:srgbClr val="${c.fill.replace("#", "")}"/></a:solidFill>`
        : `<a:noFill/>`;
      // Uma célula pode levar uma segunda linha (`t2`): serve para pôr o nome
      // em cima e a descrição por baixo, mais pequena e mais clara, sem gastar
      // uma coluna inteira numa tabela que já está apertada.
      const p = parXml(par([{ t: c.t, cor: c.cor, sz: c.sz ?? 9, b: c.b, fonte: c.fonte }],
                           { align: c.align || "l" }))
        + (c.t2
            ? parXml(par([{ t: c.t2, cor: c.cor2 || "8A8F93", sz: c.sz2 ?? 7.2, fonte: c.fonte }],
                         { align: c.align || "l", entreLinhas: 0.92 }))
            : "");
      // As bordas verticais saem TODAS: o deck de referência não as tem, e
      // sem as desligar à mão o PowerPoint e o LibreOffice desenham as do
      // estilo por omissão, que transformam a tabela numa grelha de Excel.
      return `<a:tc><a:txBody><a:bodyPr lIns="${pol(0.08)}" rIns="${pol(0.08)}"
                 tIns="${pol(0.03)}" bIns="${pol(0.03)}" anchor="ctr"/><a:lstStyle/>${p}</a:txBody>
        <a:tcPr marL="0" marR="0" marT="0" marB="0" anchor="ctr">
          <a:lnL><a:noFill/></a:lnL><a:lnR><a:noFill/></a:lnR><a:lnT><a:noFill/></a:lnT>
          <a:lnB w="6350"><a:solidFill><a:srgbClr val="${(c.linhaBaixo || "EFE6D8").replace("#", "")}"/></a:solidFill></a:lnB>
          ${fill}</a:tcPr></a:tc>`;
    }).join("");
    return `<a:tr h="${pol(l.altura ?? 0.26)}">${cels}</a:tr>`;
  }).join("");
  const alturaTotal = linhas.reduce((s, l) => s + (l.altura ?? 0.26), 0);
  const largTotal = larguras.reduce((s, w) => s + w, 0);
  return `<p:graphicFrame><p:nvGraphicFramePr>
      <p:cNvPr id="${id}" name="Tab${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
    <p:xfrm><a:off x="${pol(x)}" y="${pol(y)}"/><a:ext cx="${pol(largTotal)}" cy="${pol(alturaTotal)}"/></p:xfrm>
    <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
      <a:tbl><a:tblPr firstRow="0" bandRow="0"/><a:tblGrid>${gridCols}</a:tblGrid>${corpo}</a:tbl>
    </a:graphicData></a:graphic></p:graphicFrame>`;
}

/**
 * Uma imagem. O `rel` é o id da relação do slide — ver `media` em
 * construirPptx, que é quem mete o ficheiro dentro do .pptx e cria a relação.
 */
export function imagem(x, y, cx, cy, rel = "rId2") {
  return { tipo: "imagem", x, y, cx, cy, rel };
}

function imagemXml({ x, y, cx, cy, rel = "rId2" }) {
  const id = proximoId();
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Img${id}"/>
      <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
    <p:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
    <p:spPr><a:xfrm><a:off x="${pol(x)}" y="${pol(y)}"/><a:ext cx="${pol(cx)}" cy="${pol(cy)}"/></a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

// ─── O ficheiro ─────────────────────────────────────────────────────────────
const CABECALHO = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
         + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
         + 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

// Cada peça do slide é um objeto (ver texto/caixa/regua/tabela/imagem). Era
// aqui que elas eram já XML: passaram a ser dados para o PDF poder desenhar
// as MESMAS peças sem ninguém escrever a disposição duas vezes (ver src/pdf.js).
function formaXml(f) {
  if (!f) return "";
  if (typeof f === "string") return f;          // XML à mão, se alguém precisar
  switch (f.tipo) {
    case "texto":  return textoXml(f);
    case "caixa":  return caixaXml(f);
    case "regua":  return reguaXml(f);
    case "tabela": return tabelaXml(f);
    case "imagem": return imagemXml(f);
    default: return "";
  }
}

const slideXml = (formas) => CABECALHO
  + `<p:sld ${NS}><p:cSld><p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>
        <a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${(formas || []).map(formaXml).join("\n")}
    </p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"
      accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5"
      accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>`;

const TEMA = CABECALHO + `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="LPX">
  <a:themeElements>
    <a:clrScheme name="LPX"><a:dk1><a:srgbClr val="14212B"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="23292D"/></a:dk2><a:lt2><a:srgbClr val="FCF3EB"/></a:lt2>
      <a:accent1><a:srgbClr val="BAA685"/></a:accent1><a:accent2><a:srgbClr val="8C8275"/></a:accent2>
      <a:accent3><a:srgbClr val="1F7A54"/></a:accent3><a:accent4><a:srgbClr val="A93226"/></a:accent4>
      <a:accent5><a:srgbClr val="2C4A63"/></a:accent5><a:accent6><a:srgbClr val="D8CCB8"/></a:accent6>
      <a:hlink><a:srgbClr val="2C4A63"/></a:hlink><a:folHlink><a:srgbClr val="8C8275"/></a:folHlink></a:clrScheme>
    <a:fontScheme name="LPX"><a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="LPX">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme></a:themeElements></a:theme>`;

const vazioTree = `<p:cSld><p:spTree>
  <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
  <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>
    <a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld>`;

const MASTER = CABECALHO + `<p:sldMaster ${NS}>${vazioTree}
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2"
    accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6"
    hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;

const LAYOUT = CABECALHO + `<p:sldLayout ${NS} type="blank" preserve="1">${vazioTree}
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

/**
 * Monta o .pptx.
 * @param slides  array de arrays de formas (o XML que as funções acima dão)
 * @param meta    { titulo, autor }
 * @returns Uint8Array
 */
export function construirPptx(slides, { titulo = "Report", autor = "LPX Private",
                                        media = [] } = {}) {
  _id = 1;
  const n = slides.length;
  const idx = Array.from({ length: n }, (_, i) => i + 1);
  // As imagens partilhadas por todos os slides (o logótipo). Cada slide fica
  // com uma relação para cada uma, a começar no rId2 — o rId1 é o layout.
  const imgs = (media || []).map((m, i) => ({
    ext: (m.ext || "png").toLowerCase(),
    dados: m.dados,
    nome: `image${i + 1}.${(m.ext || "png").toLowerCase()}`,
    rel: `rId${i + 2}`,
  }));
  const extensoes = [...new Set(imgs.map(i => i.ext))];
  const TIPO_MEDIA = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
                       gif: "image/gif", svg: "image/svg+xml" };

  const ficheiros = [
    { nome: "[Content_Types].xml", dados: CABECALHO
      + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        ${extensoes.map(e => `<Default Extension="${e}" ContentType="${TIPO_MEDIA[e] || "application/octet-stream"}"/>`).join("")}
        <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
        <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
        <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
        <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
        <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
        <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
        ${idx.map(i => `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}
      </Types>` },

    { nome: "_rels/.rels", dados: CABECALHO
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
        <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
      </Relationships>` },

    { nome: "docProps/core.xml", dados: CABECALHO
      + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
          xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <dc:title>${esc(titulo)}</dc:title><dc:creator>${esc(autor)}</dc:creator>
        <cp:lastModifiedBy>${esc(autor)}</cp:lastModifiedBy></cp:coreProperties>` },

    { nome: "docProps/app.xml", dados: CABECALHO
      + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
          xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
        <Application>LPX Private ERP</Application><Slides>${n}</Slides></Properties>` },

    { nome: "ppt/presentation.xml", dados: CABECALHO
      + `<p:presentation ${NS} saveSubsetFonts="1">
        <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
        <p:sldIdLst>${idx.map(i => `<p:sldId id="${255 + i}" r:id="rId${i + 1}"/>`).join("")}</p:sldIdLst>
        <p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>
      </p:presentation>` },

    { nome: "ppt/_rels/presentation.xml.rels", dados: CABECALHO
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
        ${idx.map(i => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`).join("")}
        <Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
      </Relationships>` },

    { nome: "ppt/slideMasters/slideMaster1.xml", dados: MASTER },
    { nome: "ppt/slideMasters/_rels/slideMaster1.xml.rels", dados: CABECALHO
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
      </Relationships>` },

    { nome: "ppt/slideLayouts/slideLayout1.xml", dados: LAYOUT },
    { nome: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", dados: CABECALHO
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
      </Relationships>` },

    { nome: "ppt/theme/theme1.xml", dados: TEMA },
  ];

  imgs.forEach(im => ficheiros.push({ nome: `ppt/media/${im.nome}`, dados: im.dados }));

  slides.forEach((formas, i) => {
    ficheiros.push({ nome: `ppt/slides/slide${i + 1}.xml`, dados: slideXml(formas) });
    ficheiros.push({ nome: `ppt/slides/_rels/slide${i + 1}.xml.rels`, dados: CABECALHO
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
        ${imgs.map(im => `<Relationship Id="${im.rel}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${im.nome}"/>`).join("")}
      </Relationships>` });
  });

  return zip(ficheiros);
}

export default construirPptx;
