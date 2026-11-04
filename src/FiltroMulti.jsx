// ─────────────────────────────────────────────────────────────────────────────
// FILTRO DE MUITAS ESCOLHAS — o botão e o painel
//
// Um botão que abre uma lista de caixas. Nada escolhido quer dizer TUDO: é a
// regra de src/filtros.js, e é o que impede o ecrã de ficar vazio quando se
// limpa a seleção.
//
// Fecha ao clicar fora e com o Escape. Não é um `<select multiple>` porque
// esse obriga a Ctrl+clique para escolher dois, e ninguém descobre isso
// sozinho — o que é exatamente o problema que este componente veio resolver.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useMemo } from "react";
import { alternar, rotuloDoFiltro } from "./filtros.js";

const semAcento = (s) => String(s || "").normalize("NFD")
  .replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * @param opcoes     [{ valor, rotulo, grupo? }] — `grupo` junta-as debaixo de
 *                   um título, como os optgroup do select que isto substitui.
 * @param escolhidos array de valores
 * @param onMudar    (novaLista) => void
 * @param rotuloVazio  o que o botão diz quando não há nada escolhido
 * @param comPesquisa  mostrar a caixa de pesquisa (por omissão, acima de 8)
 */
export default function FiltroMulti({
  opcoes = [], escolhidos = [], onMudar,
  rotuloVazio = "Todos", singular = "escolhido", plural = "escolhidos",
  titulo = null, comPesquisa = null, largura = 280, disabled = false,
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const caixa = useRef(null);

  // Fechar ao clicar fora e no Escape. Sem isto, o painel ficava aberto por
  // cima da tabela e tapava as linhas que se queria ver.
  useEffect(() => {
    if (!aberto) return;
    const foraDaqui = (e) => { if (caixa.current && !caixa.current.contains(e.target)) setAberto(false); };
    const teclas = (e) => { if (e.key === "Escape") { setAberto(false); e.stopPropagation(); } };
    document.addEventListener("mousedown", foraDaqui);
    document.addEventListener("keydown", teclas);
    return () => {
      document.removeEventListener("mousedown", foraDaqui);
      document.removeEventListener("keydown", teclas);
    };
  }, [aberto]);

  const lista = Array.isArray(opcoes) ? opcoes.filter(Boolean) : [];
  const sel = Array.isArray(escolhidos) ? escolhidos : [];
  const mostrarBusca = comPesquisa === null ? lista.length > 8 : !!comPesquisa;

  const filtradas = useMemo(() => {
    const q = semAcento(busca).trim();
    if (!q) return lista;
    return lista.filter(o => semAcento(o.rotulo ?? o.valor).includes(q)
                          || semAcento(o.grupo).includes(q));
  }, [lista, busca]);

  // Agrupadas, mantendo a ordem em que vieram.
  const grupos = useMemo(() => {
    const m = new Map();
    filtradas.forEach(o => {
      const g = String(o.grupo || "");
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(o);
    });
    return [...m.entries()];
  }, [filtradas]);

  const nomeDe = (v) => lista.find(o => String(o.valor) === String(v))?.rotulo;
  const rotulo = rotuloDoFiltro(sel, { vazio: rotuloVazio, nomeDe, singular, plural });
  const ativo = sel.length > 0;

  const trocar = (valor) => onMudar?.(alternar(sel, valor));

  return (
    <div ref={caixa} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" disabled={disabled}
        onClick={() => setAberto(a => !a)}
        title={ativo
          ? sel.map(v => nomeDe(v) || v).join(", ")
          : `${rotuloVazio} — clica para escolher`}
        style={{
          background: ativo ? "#091C2A" : "#fff",
          color: ativo ? "#fff" : "#5C6166",
          border: `1px solid ${ativo ? "#091C2A" : "#D8CCBB"}`,
          borderRadius: 20, padding: "6px 12px", fontSize: 12,
          cursor: disabled ? "default" : "pointer", fontWeight: 600,
          opacity: disabled ? 0.5 : 1, maxWidth: 260, whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis", fontFamily: "inherit",
        }}>
        {titulo && <span style={{ fontWeight: 400, opacity: 0.75 }}>{titulo}: </span>}
        {rotulo}
        <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 9 }}>▾</span>
      </button>

      {ativo && !disabled && (
        <button type="button" title="Limpar esta seleção"
          onClick={(e) => { e.stopPropagation(); onMudar?.([]); }}
          style={{ marginLeft: 4, background: "#E7DED2", border: "none",
                   borderRadius: "50%", width: 18, height: 18, fontSize: 9,
                   color: "#5C6166", cursor: "pointer", lineHeight: 1 }}>✕</button>
      )}

      {aberto && !disabled && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60,
          background: "#fff", border: "1px solid #E7DED2", borderRadius: 10,
          boxShadow: "0 10px 30px rgba(10,10,15,0.14)", width: largura,
          maxHeight: 360, display: "flex", flexDirection: "column",
        }}>
          {mostrarBusca && (
            <div style={{ padding: 8, borderBottom: "1px solid #F0EAE1" }}>
              <input autoFocus value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Procurar..."
                style={{ width: "100%", boxSizing: "border-box", background: "#F9F5EF",
                         border: "1px solid #EFE8DE", borderRadius: 7, padding: "6px 9px",
                         fontSize: 12, outline: "none", fontFamily: "inherit" }} />
            </div>
          )}

          <div style={{ overflowY: "auto", padding: "4px 0", flex: 1 }}>
            {/* Nada escolhido é TUDO — e diz-se, em vez de se deixar adivinhar. */}
            <label style={linhaEstilo(sel.length === 0)}>
              <input type="checkbox" checked={sel.length === 0} readOnly
                onClick={(e) => { e.preventDefault(); onMudar?.([]); }}
                style={{ accentColor: "#091C2A", cursor: "pointer" }} />
              <span style={{ fontWeight: 600 }}>{rotuloVazio}</span>
            </label>

            {grupos.map(([g, opts]) => (
              <div key={g || "_"}>
                {g && (
                  <div style={{ padding: "7px 12px 3px", fontSize: 9.5, color: "#9DA2A6",
                                textTransform: "uppercase", letterSpacing: "0.07em",
                                fontFamily: "var(--fonte-numero)" }}>
                    {g}
                  </div>
                )}
                {opts.map(o => {
                  const marcada = sel.includes(String(o.valor));
                  return (
                    <label key={o.valor} style={linhaEstilo(marcada)}>
                      <input type="checkbox" checked={marcada}
                        onChange={() => trocar(o.valor)}
                        style={{ accentColor: "#091C2A", cursor: "pointer" }} />
                      <span>{o.rotulo ?? o.valor}</span>
                    </label>
                  );
                })}
              </div>
            ))}

            {filtradas.length === 0 && (
              <div style={{ padding: "14px 12px", fontSize: 11.5, color: "#9DA2A6",
                            textAlign: "center" }}>
                Nada com esse nome.
              </div>
            )}
          </div>

          {filtradas.length > 1 && (
            <div style={{ borderTop: "1px solid #F0EAE1", padding: 7, display: "flex", gap: 6 }}>
              <button type="button"
                onClick={() => onMudar?.([...new Set([...sel, ...filtradas.map(o => String(o.valor))])])}
                style={botaoPequeno}>
                Escolher {busca ? "as encontradas" : "todas"}
              </button>
              <button type="button" onClick={() => onMudar?.([])} style={botaoPequeno}>
                Limpar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const linhaEstilo = (marcada) => ({
  display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
  fontSize: 12.5, color: "#23292D", cursor: "pointer",
  background: marcada ? "#F7F5F1" : "transparent",
});

const botaoPequeno = {
  flex: 1, background: "transparent", border: "1px solid #E7DED2", borderRadius: 7,
  padding: "5px 8px", fontSize: 11, color: "#5C6166", cursor: "pointer",
  fontFamily: "inherit",
};
