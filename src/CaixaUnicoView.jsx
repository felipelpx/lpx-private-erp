import React, { useState, useMemo, useEffect, useRef } from "react";
import { EMPRESAS, agruparPorGrupo } from "./empresas.js";
import { useCaixaUnico } from "./hooks.js";
import { fmtEUR, fmtData } from "./formato.js";
import { CATEGORIAS } from "./categorias.js";
import { categoriasDa, subcategoriasDa, usaSubcategoria, foraDoPlano } from "./categoriasEmpresa.js";
import { COR, FONTE, RAIO } from "./brand.js";

// ─────────────────────────────────────────────────────────────────────────────
// CAIXA ÚNICO
//
// Todos os lançamentos, de todas as empresas e de todos os bancos, numa lista
// só. Não substitui o extrato: é a mesma linha, vista de outro sítio. O que
// se altera aqui altera o extrato, porque é a mesma linha da mesma tabela.
//
// Serve para o que o extrato não serve: procurar uma despesa sem saber em que
// projeto está, ver tudo o que foi para uma rubrica no ano, conferir um mês
// inteiro do grupo de uma assentada.
// ─────────────────────────────────────────────────────────────────────────────

const MEMORIA = "lpx_caixa_unico_filtros";
const POR_PAGINA = 200;

const MESES = ["janeiro","fevereiro","março","abril","maio","junho",
               "julho","agosto","setembro","outubro","novembro","dezembro"];

const Rotulo = ({ children }) => (
  <div style={{ fontSize: 9, color: COR.textoTenue, textTransform: "uppercase",
                letterSpacing: "0.12em", marginBottom: 5, fontWeight: 500 }}>{children}</div>
);

const campo = {
  width: "100%", boxSizing: "border-box", background: COR.papel,
  border: `1px solid ${COR.linha}`, borderRadius: RAIO.pequeno,
  padding: "8px 10px", fontSize: 12.5, outline: "none", color: COR.texto,
};

const th = {
  padding: "10px 12px", textAlign: "left", color: COR.textoTenue, fontSize: 9,
  letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 500,
  borderBottom: `1px solid ${COR.linha}`, whiteSpace: "nowrap", background: COR.fundoSuave,
};
const td = { padding: "7px 12px", fontSize: 12, color: COR.texto, verticalAlign: "middle" };
const tdNum = { ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

// O nome já traz o projeto entre parênteses (ver src/empresas.js).
const nomeEmpresa = (id) => EMPRESAS.find(x => x.id === id)?.nome || id || "—";
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ─── Filtro de várias escolhas ───────────────────────────────────────────────
// Um <select multiple> nativo obriga a carregar no Ctrl e não cabe na linha dos
// outros filtros. Isto é um botão que abre uma lista de caixas de visto: vê-se
// o que está escolhido sem abrir, e escolhe-se com um clique de cada vez.
//
// `opcoes` são strings ou { v, r } (valor e rótulo) — para o mês, em que o
// valor é "01" e o rótulo é "janeiro".
function Varios({ opcoes, valores, onMudar, nadaSelecionado = "Todos", procuravel }) {
  const [aberto, setAberto] = useState(false);
  const [procura, setProcura] = useState("");
  const caixa = useRef(null);
  const sel = Array.isArray(valores) ? valores : (valores ? [valores] : []);
  const ops = opcoes.map(o => (typeof o === "string" ? { v: o, r: o } : o));

  // Fechar ao clicar fora ou com Esc: a lista tapa o resto dos filtros.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => { if (caixa.current && !caixa.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  const trocar = (v) => onMudar(sel.includes(v) ? sel.filter(x => x !== v) : [...sel, v]);

  const rotuloDe = (v) => ops.find(o => o.v === v)?.r ?? v;
  const resumo = sel.length === 0 ? nadaSelecionado
               : sel.length === 1 ? rotuloDe(sel[0])
               : `${sel.length} selecionados`;

  const visiveis = procura
    ? ops.filter(o => semAcento(o.r).includes(semAcento(procura)))
    : ops;

  return (
    <div ref={caixa} style={{ position: "relative" }}>
      <button type="button" onClick={() => setAberto(a => !a)}
        title={sel.length > 1 ? sel.map(rotuloDe).join(", ") : undefined}
        style={{ ...campo, textAlign: "left", cursor: "pointer", display: "flex",
                 alignItems: "center", gap: 6, lineHeight: 1.3,
                 borderColor: sel.length ? COR.ouro : COR.linha,
                 color: sel.length ? COR.texto : COR.textoTenue }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {resumo}
        </span>
        <span style={{ color: COR.textoApagado, fontSize: 9 }}>▾</span>
      </button>

      {aberto && (
        <div style={{ position: "absolute", zIndex: 40, top: "calc(100% + 4px)", left: 0,
                      minWidth: "100%", maxWidth: 320, background: COR.papel,
                      border: `1px solid ${COR.linhaForte}`, borderRadius: RAIO.medio,
                      boxShadow: "0 10px 30px rgba(9,28,42,0.10)", padding: 6 }}>
          {procuravel && ops.length > 12 && (
            <input autoFocus value={procura} onChange={e => setProcura(e.target.value)}
              placeholder="procurar..." style={{ ...campo, padding: "6px 8px", fontSize: 11.5,
                                                 marginBottom: 4 }} />
          )}
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {visiveis.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 11.5, color: COR.textoTenue }}>
                Nada com esse nome.
              </div>
            )}
            {visiveis.map(o => (
              <label key={o.v} style={{ display: "flex", alignItems: "center", gap: 8,
                                        padding: "5px 8px", borderRadius: 4, cursor: "pointer",
                                        fontSize: 12, color: COR.texto,
                                        background: sel.includes(o.v) ? COR.fundoSuave : "transparent" }}>
                <input type="checkbox" checked={sel.includes(o.v)} onChange={() => trocar(o.v)}
                  style={{ width: 14, height: 14, accentColor: COR.navy, flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.r}</span>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, borderTop: `1px solid ${COR.linhaSuave}`,
                        marginTop: 4, paddingTop: 6 }}>
            <button type="button" onClick={() => onMudar(visiveis.map(o => o.v))}
              style={botaoMini}>Todos</button>
            <button type="button" onClick={() => onMudar([])} style={botaoMini}>Limpar</button>
            <button type="button" onClick={() => setAberto(false)}
              style={{ ...botaoMini, marginLeft: "auto" }}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}

const botaoMini = {
  background: "transparent", border: `1px solid ${COR.linha}`, borderRadius: 4,
  padding: "4px 9px", fontSize: 11, color: COR.textoSuave, cursor: "pointer",
};

// ─── Célula que grava sozinha ────────────────────────────────────────────────
function Celula({ valor, opcoes, aviso, onGravar, livre, dica }) {
  const [v, setV] = useState(valor || "");
  const [estado, setEstado] = useState("");          // "" | gravando | ok | erro
  const ultimo = useRef(valor || "");

  useEffect(() => {
    if (valor !== ultimo.current) { setV(valor || ""); ultimo.current = valor || ""; }
  }, [valor]);

  const gravar = async (novo) => {
    if (novo === ultimo.current) return;
    setEstado("gravando");
    const r = await onGravar(novo);
    if (r?.error) { setEstado("erro"); setV(ultimo.current); }
    else { ultimo.current = novo; setEstado("ok"); setTimeout(() => setEstado(""), 1200); }
  };

  const borda = estado === "erro" ? COR.negativo : estado === "ok" ? COR.positivo : COR.linha;
  const base = { ...campo, padding: "5px 8px", fontSize: 11.5, borderColor: borda,
                 background: estado === "gravando" ? COR.fundoSuave : COR.papel };

  if (livre) {
    return <input value={v} title={dica} placeholder="Observação..."
      onChange={e => setV(e.target.value)} onBlur={e => gravar(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} style={base} />;
  }
  return (
    <select value={v} title={dica} onChange={e => { setV(e.target.value); gravar(e.target.value); }}
      style={{ ...base, cursor: "pointer", color: v ? COR.texto : COR.textoTenue }}>
      <option value="">—</option>
      {v && !opcoes.includes(v) && <option value={v}>{v}{aviso ? " (fora do plano)" : ""}</option>}
      {opcoes.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

const Cartao = ({ rotulo, valor, cor, nota }) => (
  <div style={{ background: COR.papel, border: `1px solid ${COR.linha}`,
                borderRadius: RAIO.grande, padding: "14px 18px" }}>
    <Rotulo>{rotulo}</Rotulo>
    <div style={{ fontSize: 19, fontWeight: 600, color: cor || COR.texto,
                  fontVariantNumeric: "tabular-nums" }}>{valor}</div>
    {nota && <div style={{ fontSize: 10, color: COR.textoApagado, marginTop: 3 }}>{nota}</div>}
  </div>
);

// ─── O ecrã ──────────────────────────────────────────────────────────────────
export default function CaixaUnicoView({ currentUser, empresasVisiveis = [] }) {
  const { movimentos, loading, error, reload, atualizarMovimento } = useCaixaUnico();
  const empresas = empresasVisiveis.length ? empresasVisiveis : EMPRESAS;
  const podeEditar = currentUser?.role === "admin" || currentUser?.role === "gestor";

  const [f, setF] = useState(() => {
    try { return normalizar({ ...vazio(), ...JSON.parse(localStorage.getItem(MEMORIA) || "{}") }); }
    catch { return vazio(); }
  });
  const [limite, setLimite] = useState(POR_PAGINA);
  const [exportando, setExportando] = useState(false);
  useEffect(() => { try { localStorage.setItem(MEMORIA, JSON.stringify(f)); } catch {} }, [f]);
  useEffect(() => { setLimite(POR_PAGINA); }, [f]);

  const muda = (k) => (v) => setF(x => ({ ...x, [k]: v }));

  // Só o que a pessoa pode ver. Um movimento de uma empresa desconhecida fica
  // visível para admin e gestor, para não desaparecer sem aviso.
  const ids = empresas.map(e => e.id);
  const todos = useMemo(() => (movimentos || []).filter(m =>
    ids.includes(m.empresa_id) ||
    (podeEditar && !EMPRESAS.some(e => e.id === m.empresa_id))), [movimentos, ids.join(), podeEditar]);

  // Escolhida uma empresa, as outras caixas passam a mostrar só o que existe
  // nela: não faz sentido oferecer o plano de contas do grupo inteiro para
  // filtrar uma SPV. Em "Todas", volta a lista toda.
  const doAmbito = useMemo(
    () => (f.empresa ? todos.filter(m => m.empresa_id === f.empresa) : todos),
    [todos, f.empresa]);

  const bancos = useMemo(() => [...new Set(doAmbito.map(m => m.banco).filter(Boolean))].sort(), [doAmbito]);
  const anos = useMemo(() => [...new Set(doAmbito.map(m => String(m.data || "").slice(0, 4)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a)), [doAmbito]);
  const categorias = useMemo(() => [...new Set(doAmbito.map(m => m.categoria).filter(Boolean))].sort(), [doAmbito]);
  const subcategorias = useMemo(() => [...new Set(doAmbito
    .filter(m => f.categoria.length === 0 || f.categoria.includes(m.categoria))
    .map(m => m.subcategoria).filter(Boolean))].sort(), [doAmbito, f.categoria.join("|")]);

  // Trocar de empresa deixaria filtros pendurados em valores que a empresa
  // nova não tem — a lista vinha vazia sem se perceber porquê. Largam-se.
  useEffect(() => {
    setF(x => {
      const podar = (k, validos) => x[k].filter(v => validos.includes(v));
      const novo = {
        ...x,
        banco: bancos.includes(x.banco) ? x.banco : "",
        categoria: podar("categoria", categorias),
        subcategoria: podar("subcategoria", subcategorias),
        ano: podar("ano", anos),
      };
      const igual = novo.banco === x.banco &&
        ["categoria", "subcategoria", "ano"].every(k => novo[k].length === x[k].length);
      return igual ? x : novo;
    });
  }, [f.empresa, bancos.join("|"), categorias.join("|"), anos.join("|"), subcategorias.join("|")]);

  const lista = useMemo(() => {
    const procura = semAcento(f.procura).trim();
    return todos.filter(m => {
      if (f.empresa && m.empresa_id !== f.empresa) return false;
      if (f.banco && m.banco !== f.banco) return false;
      // Lista vazia é "todas". Com várias escolhidas, basta bater numa.
      if (f.categoria.length && !f.categoria.includes(m.categoria)) return false;
      if (f.subcategoria.length && !f.subcategoria.includes(m.subcategoria)) return false;
      const d = String(m.data || "").slice(0, 10);
      if (f.ano.length && !f.ano.includes(d.slice(0, 4))) return false;
      if (f.mes.length && !f.mes.includes(d.slice(5, 7))) return false;
      if (f.de && d < f.de) return false;
      if (f.ate && d > f.ate) return false;
      if (f.sinal === "entradas" && !(m.valor > 0)) return false;
      if (f.sinal === "saidas" && !(m.valor < 0)) return false;
      if (procura) {
        const alvo = semAcento(`${m.movimento} ${m.detalhes} ${m.categoria} ${m.subcategoria}`);
        if (!alvo.includes(procura)) return false;
      }
      return true;
    });
  }, [todos, f]);

  const total = useMemo(() => lista.reduce((s, m) => ({
    entradas: s.entradas + (m.valor > 0 ? m.valor : 0),
    saidas:   s.saidas   + (m.valor < 0 ? m.valor : 0),
  }), { entradas: 0, saidas: 0 }), [lista]);

  const haFiltro = Object.entries(f).some(([k, v]) =>
    k !== "sinal" && (Array.isArray(v) ? v.length > 0 : Boolean(v))) || f.sinal !== "todos";

  const exportar = async () => {
    if (exportando) return;
    setExportando(true);
    try {
      const { exportarCaixaUnico } = await import("./caixaUnicoExcel.js");
      await exportarCaixaUnico(lista, { nomeEmpresa, filtros: f });
    } catch (e) {
      alert("Não foi possível exportar: " + (e?.message || e));
    } finally { setExportando(false); }
  };

  const semTabela = /movimentos|does not exist|schema cache/i.test(error || "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div style={{ background: COR.papel, border: `1px solid ${COR.linha}`, borderRadius: RAIO.grande,
                    padding: "18px 22px", display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 300, color: COR.navy, fontFamily: FONTE.titulo }}>
            Caixa Único
          </div>
          <div style={{ fontSize: 11.5, color: COR.textoTenue, marginTop: 4 }}>
            Todos os lançamentos, de todas as empresas e bancos. O que alterares aqui altera o extrato original.
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={reload} disabled={loading}
            style={{ background: COR.fundoSuave, border: `1px solid ${COR.linha}`, color: COR.textoSuave,
                     padding: "8px 14px", borderRadius: RAIO.pequeno, fontSize: 12,
                     cursor: loading ? "default" : "pointer" }}>
            {loading ? "A carregar..." : "↻ Atualizar"}
          </button>
          <button onClick={exportar} disabled={exportando || !lista.length}
            style={{ background: lista.length ? COR.navy : COR.linha, color: lista.length ? COR.creme : COR.textoTenue,
                     border: "none", padding: "8px 16px", borderRadius: RAIO.pequeno, fontSize: 12,
                     fontWeight: 500, cursor: lista.length ? "pointer" : "default", letterSpacing: "0.03em" }}>
            {exportando ? "A gerar..." : "↓ Exportar Excel"}
          </button>
        </div>
      </div>

      {/* ── Filtros ────────────────────────────────────────────────────────── */}
      <div style={{ background: COR.papel, border: `1px solid ${COR.linha}`, borderRadius: RAIO.grande,
                    padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(138px, 1fr))", gap: 12 }}>
          <div>
            <Rotulo>Empresa</Rotulo>
            <select value={f.empresa} onChange={e => muda("empresa")(e.target.value)} style={campo}>
              <option value="">Todas</option>
              {agruparPorGrupo(empresas).map(b => (
                <optgroup key={b.grupo} label={b.info.nome}>
                  {b.empresas.map(e => <option key={e.id} value={e.id}>{nomeEmpresa(e.id)}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <Rotulo>Banco</Rotulo>
            <select value={f.banco} onChange={e => muda("banco")(e.target.value)} style={campo}>
              <option value="">Todos</option>
              {bancos.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <Rotulo>Categoria</Rotulo>
            {/* Ao largar uma categoria, largam-se as subcategorias que já não
                existem na escolha — senão o filtro fica vazio sem se perceber. */}
            <Varios opcoes={categorias} valores={f.categoria} nadaSelecionado="Todas" procuravel
              onMudar={(v) => setF(x => ({ ...x, categoria: v,
                subcategoria: x.subcategoria.filter(sub => v.length === 0 ||
                  todos.some(m => v.includes(m.categoria) && m.subcategoria === sub)) }))} />
          </div>
          <div>
            <Rotulo>Subcategoria</Rotulo>
            <Varios opcoes={subcategorias} valores={f.subcategoria} nadaSelecionado="Todas" procuravel
              onMudar={muda("subcategoria")} />
          </div>
          <div>
            <Rotulo>Ano</Rotulo>
            <Varios opcoes={anos} valores={f.ano} onMudar={muda("ano")} />
          </div>
          <div>
            <Rotulo>Mês</Rotulo>
            <Varios valores={f.mes} onMudar={muda("mes")}
              opcoes={MESES.map((m, i) => ({ v: String(i + 1).padStart(2, "0"), r: m }))} />
          </div>
          <div>
            <Rotulo>Data de</Rotulo>
            <input type="date" value={f.de} onChange={e => muda("de")(e.target.value)} style={campo} />
          </div>
          <div>
            <Rotulo>Data até</Rotulo>
            <input type="date" value={f.ate} onChange={e => muda("ate")(e.target.value)} style={campo} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", minWidth: 220 }}>
            <Rotulo>Procurar na descrição</Rotulo>
            <input value={f.procura} onChange={e => muda("procura")(e.target.value)}
              placeholder="descrição, observação, categoria..." style={campo} />
          </div>
          <div>
            <Rotulo>Sinal</Rotulo>
            <div style={{ display: "flex", background: COR.fundoSuave, borderRadius: RAIO.pequeno, padding: 2, gap: 2 }}>
              {[["todos", "Tudo"], ["entradas", "Entradas"], ["saidas", "Saídas"]].map(([k, r]) => (
                <button key={k} onClick={() => muda("sinal")(k)}
                  style={{ background: f.sinal === k ? COR.navy : "transparent",
                           color: f.sinal === k ? COR.creme : COR.textoSuave, border: "none",
                           padding: "7px 14px", borderRadius: 4, fontSize: 11.5,
                           fontWeight: f.sinal === k ? 500 : 400, cursor: "pointer" }}>{r}</button>
              ))}
            </div>
          </div>
          {haFiltro && (
            <button onClick={() => setF(vazio())}
              style={{ background: "none", border: `1px solid ${COR.linha}`, color: COR.textoSuave,
                       padding: "8px 14px", borderRadius: RAIO.pequeno, fontSize: 11.5, cursor: "pointer" }}>
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* ── Totais ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        <Cartao rotulo="Lançamentos" valor={lista.length.toLocaleString("pt-PT")}
          nota={haFiltro ? `de ${todos.length.toLocaleString("pt-PT")} no total` : "sem filtros"} />
        <Cartao rotulo="Entradas" valor={fmtEUR(total.entradas)} cor={COR.positivo} />
        <Cartao rotulo="Saídas" valor={fmtEUR(total.saidas)} cor={COR.negativo} />
        <Cartao rotulo="Líquido" valor={fmtEUR(total.entradas + total.saidas)}
          cor={total.entradas + total.saidas >= 0 ? COR.positivo : COR.negativo} />
      </div>

      {semTabela && (
        <div style={{ background: COR.alertaFundo, border: `1px solid ${COR.alertaLinha}`, borderRadius: RAIO.medio,
                      padding: "12px 16px", fontSize: 12, color: COR.alertaForte }}>
          Não foi possível ler os movimentos: {error}
        </div>
      )}

      {/* ── A lista ────────────────────────────────────────────────────────── */}
      <div style={{ background: COR.papel, border: `1px solid ${COR.linha}`, borderRadius: RAIO.grande,
                    overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
            <thead>
              <tr>
                {["Data", "Empresa", "Banco", "Descrição", "Valor", "Saldo",
                  "Categoria", "Subcategoria", "Observação"].map(h => (
                  <th key={h} style={{ ...th, textAlign: /Valor|Saldo/.test(h) ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: COR.textoApagado, fontSize: 12 }}>
                  A carregar todos os lançamentos...
                </td></tr>
              )}
              {!loading && lista.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: COR.textoTenue, fontSize: 12.5 }}>
                  {todos.length === 0
                    ? "Ainda não há lançamentos importados."
                    : "Nenhum lançamento com estes filtros."}
                </td></tr>
              )}
              {!loading && lista.slice(0, limite).map(m => {
                const plano = categoriasDa(m.empresa_id) || CATEGORIAS;
                const comSub = usaSubcategoria(m.empresa_id);
                return (
                  <tr key={m.id} style={{ borderBottom: `1px solid ${COR.linhaSuave}` }}>
                    <td style={{ ...td, color: COR.textoSuave, whiteSpace: "nowrap" }}>{fmtData(m.data)}</td>
                    <td style={{ ...td, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis",
                                 whiteSpace: "nowrap", color: COR.textoSuave }}
                        title={nomeEmpresa(m.empresa_id)}>
                      {nomeEmpresa(m.empresa_id)}
                    </td>
                    <td style={td}>
                      <span style={{ background: COR.fundoSuave, border: `1px solid ${COR.linha}`,
                                     color: COR.textoSuave, fontSize: 9.5, padding: "2px 7px",
                                     borderRadius: 4, letterSpacing: "0.04em" }}>{m.banco || "—"}</span>
                    </td>
                    <td style={{ ...td, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis",
                                 whiteSpace: "nowrap" }} title={m.movimento}>{m.movimento}</td>
                    <td style={{ ...tdNum, color: m.valor < 0 ? COR.negativo : COR.positivo, fontWeight: 600 }}>
                      {fmtEUR(m.valor)}
                    </td>
                    <td style={{ ...tdNum, color: COR.textoTenue }}>{fmtEUR(m.saldo)}</td>
                    <td style={{ ...td, minWidth: 170 }}>
                      <Celula valor={m.categoria} opcoes={plano}
                        aviso={foraDoPlano(m.empresa_id, m.categoria)}
                        dica={`Plano de contas da ${nomeEmpresa(m.empresa_id)}`}
                        onGravar={podeEditar ? (v) => atualizarMovimento(m.id, {
                          categoria: v,
                          ...(comSub && !subcategoriasDa(m.empresa_id, v).includes(m.subcategoria)
                            ? { subcategoria: "" } : {}),
                        }) : async () => ({ error: { message: "sem permissão" } })} />
                    </td>
                    <td style={{ ...td, minWidth: 160 }}>
                      {comSub ? (
                        <Celula valor={m.subcategoria} opcoes={subcategoriasDa(m.empresa_id, m.categoria)}
                          onGravar={podeEditar ? (v) => atualizarMovimento(m.id, { subcategoria: v })
                            : async () => ({ error: { message: "sem permissão" } })} />
                      ) : (
                        <span style={{ color: COR.textoApagado, fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, minWidth: 190 }}>
                      <Celula livre valor={m.detalhes}
                        onGravar={podeEditar ? (v) => atualizarMovimento(m.id, { detalhes: v })
                          : async () => ({ error: { message: "sem permissão" } })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && lista.length > limite && (
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${COR.linha}`, textAlign: "center" }}>
            <button onClick={() => setLimite(l => l + POR_PAGINA * 2)}
              style={{ background: COR.fundoSuave, border: `1px solid ${COR.linha}`, color: COR.textoSuave,
                       padding: "9px 20px", borderRadius: RAIO.pequeno, fontSize: 12, cursor: "pointer" }}>
              Mostrar mais — {(lista.length - limite).toLocaleString("pt-PT")} por ver
            </button>
          </div>
        )}
      </div>

      {!podeEditar && lista.length > 0 && (
        <div style={{ fontSize: 11, color: COR.textoTenue, textAlign: "center" }}>
          Estás a ver em modo de leitura. Classificar lançamentos é para admin e gestor.
        </div>
      )}
    </div>
  );
}

function vazio() {
  return { empresa: "", banco: "", categoria: [], subcategoria: [],
           ano: [], mes: [], de: "", ate: "", procura: "", sinal: "todos" };
}

// Os filtros guardados antes de isto aceitar várias escolhas traziam uma string
// em categoria, subcategoria, ano e mês. Lê-se à mesma: uma escolha só.
const LISTAS = ["categoria", "subcategoria", "ano", "mes"];
export function normalizar(f) {
  const out = { ...f };
  LISTAS.forEach(k => {
    const v = out[k];
    out[k] = Array.isArray(v) ? v.filter(Boolean) : (v ? [String(v)] : []);
  });
  return out;
}
