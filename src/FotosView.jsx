import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "./supabase.js";
import { EMPRESAS } from "./empresas.js";
import { fmtData, fmtTamanho, fmtInt } from "./formato.js";

// ─────────────────────────────────────────────────────────────────────────────
// FOTOS DE OBRA — galeria por projeto
//
// Os ficheiros vivem no bucket "fotos" do Supabase Storage (privado); a tabela
// `fotos` guarda os metadados. O acesso é servido por URLs assinados de curta
// duração, para que um investidor não consiga adivinhar o caminho das fotos
// de outro projeto.
// ─────────────────────────────────────────────────────────────────────────────

const BUCKET = "fotos";
const MAX_LADO = 1800;      // px — reduz antes de enviar
const QUALIDADE = 0.82;

// Reduz a imagem no browser: uploads mais rápidos e menos custo de storage
function reduzirImagem(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      if (w > MAX_LADO || h > MAX_LADO) {
        const escala = MAX_LADO / Math.max(w, h);
        w = Math.round(w * escala); h = Math.round(h * escala);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Falha a processar a imagem")),
        "image/jpeg", QUALIDADE
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Ficheiro de imagem inválido")); };
    img.src = url;
  });
}

export default function FotosView({ currentUser, empresasVisiveis }) {
  const empresas = empresasVisiveis && empresasVisiveis.length ? empresasVisiveis : EMPRESAS;
  const podeEditar = currentUser?.role === "admin" || currentUser?.role === "gestor";

  const [fotos, setFotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [urls, setUrls] = useState({});
  const [lightbox, setLightbox] = useState(null);
  const [aEnviar, setAEnviar] = useState(null);
  const [empresaUpload, setEmpresaUpload] = useState(empresas[0]?.id || "");
  // Fotos acabadas de enviar, à espera de legenda e data
  const [porLegendar, setPorLegendar] = useState([]);
  const [aGuardar, setAGuardar] = useState(false);
  const inputRef = useRef(null);

  const carregar = async () => {
    setLoading(true); setErro("");
    const { data, error } = await supabase
      .from("fotos").select("*").order("data", { ascending: false }).order("created_at", { ascending: false });
    if (error) setErro(error.message);
    else setFotos((data || []).filter(f => empresas.some(e => e.id === f.empresa_id)));
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [empresasVisiveis]);

  const visiveis = useMemo(
    () => filtro === "todos" ? fotos : fotos.filter(f => f.empresa_id === filtro),
    [fotos, filtro]
  );

  // URLs assinados (1h) para as fotos em ecrã
  useEffect(() => {
    const emFalta = visiveis.filter(f => f.path && !urls[f.path]).map(f => f.path);
    if (!emFalta.length) return;
    let cancelado = false;
    (async () => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(emFalta, 3600);
      if (cancelado || !data) return;
      setUrls(u => {
        const novo = { ...u };
        data.forEach(d => { if (d.signedUrl) novo[d.path] = d.signedUrl; });
        return novo;
      });
    })();
    return () => { cancelado = true; };
  }, [visiveis, urls]);

  const nomeEmpresa = (id) => empresas.find(e => e.id === id)?.nome || id;

  // Envia primeiro; a legenda e a data são preenchidas depois, foto a foto.
  const enviar = async (ficheiros) => {
    const lista = Array.from(ficheiros || []).filter(f => f.type.startsWith("image/"));
    if (!lista.length) return;
    if (!empresaUpload) { alert("Escolhe o projeto."); return; }

    const hoje = new Date().toISOString().slice(0, 10);
    const novas = [];

    for (let i = 0; i < lista.length; i++) {
      const file = lista[i];
      setAEnviar({ atual: i + 1, total: lista.length, nome: file.name });
      try {
        const blob = await reduzirImagem(file);
        const path = `${empresaUpload}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

        const { error: upErr } = await supabase.storage.from(BUCKET)
          .upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw upErr;

        const { data: linha, error: dbErr } = await supabase.from("fotos").insert({
          empresa_id: empresaUpload,
          path,
          legenda: "",
          data: hoje,
          tamanho: blob.size,
          criado_por: currentUser?.id || null,
        }).select().single();
        if (dbErr) {
          await supabase.storage.from(BUCKET).remove([path]); // não deixa órfãos
          throw dbErr;
        }

        novas.push({
          ...linha,
          _preview: URL.createObjectURL(blob),   // pré-visualização imediata
          _nomeOriginal: file.name,
          legenda: "",
          data: hoje,
        });
      } catch (e) {
        alert(`Erro ao enviar "${file.name}": ${e?.message || e}`);
        break;
      }
    }

    setAEnviar(null);
    if (inputRef.current) inputRef.current.value = "";
    if (novas.length) setPorLegendar(p => [...p, ...novas]);
    carregar();
  };

  const alterarPendente = (id, campo, valor) =>
    setPorLegendar(lista => lista.map(f => f.id === id ? { ...f, [campo]: valor } : f));

  // Aplica a data da primeira foto a todas as restantes
  const aplicarDataATodas = () => {
    const primeira = porLegendar[0]?.data;
    if (!primeira) return;
    setPorLegendar(lista => lista.map(f => ({ ...f, data: primeira })));
  };

  const guardarLegendas = async () => {
    setAGuardar(true);
    try {
      for (const f of porLegendar) {
        const { error } = await supabase.from("fotos")
          .update({ legenda: f.legenda || "", data: f.data })
          .eq("id", f.id);
        if (error) throw error;
      }
      porLegendar.forEach(f => f._preview && URL.revokeObjectURL(f._preview));
      setPorLegendar([]);
      carregar();
    } catch (e) {
      alert("Erro a guardar: " + (e?.message || e));
    } finally {
      setAGuardar(false);
    }
  };

  // Remove uma foto ainda na fase de legendagem (apaga mesmo)
  const descartarPendente = async (foto) => {
    if (!confirm("Apagar esta foto?")) return;
    await supabase.storage.from(BUCKET).remove([foto.path]);
    await supabase.from("fotos").delete().eq("id", foto.id);
    foto._preview && URL.revokeObjectURL(foto._preview);
    setPorLegendar(lista => lista.filter(f => f.id !== foto.id));
    carregar();
  };

  const apagar = async (foto) => {
    if (!confirm("Apagar esta foto?")) return;
    await supabase.storage.from(BUCKET).remove([foto.path]);
    const { error } = await supabase.from("fotos").delete().eq("id", foto.id);
    if (error) { alert("Erro: " + error.message); return; }
    setLightbox(null);
    carregar();
  };

  const contagem = (id) => fotos.filter(f => f.empresa_id === id).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Filtro por projeto */}
      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: "14px 18px" }}>
        <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 10 }}>
          Projeto
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setFiltro("todos")}
            style={{
              background: filtro === "todos" ? "#1a1a2e" : "#fff",
              color: filtro === "todos" ? "#fff" : "#666",
              border: "1px solid " + (filtro === "todos" ? "#1a1a2e" : "#e8e8e8"),
              borderRadius: 20, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600,
            }}>
            Todos <span style={{ opacity: 0.6 }}>({fotos.length})</span>
          </button>
          {empresas.map(e => {
            const activo = filtro === e.id;
            const n = contagem(e.id);
            return (
              <button key={e.id} onClick={() => setFiltro(e.id)}
                style={{
                  background: activo ? "#1a1a2e" : "#fff",
                  color: activo ? "#fff" : n ? "#666" : "#bbb",
                  border: "1px solid " + (activo ? "#1a1a2e" : "#e8e8e8"),
                  borderRadius: 20, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600,
                }}>
                {e.projeto || e.nome} <span style={{ opacity: 0.6 }}>({n})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Envio de fotos — escolher projeto e enviar; legenda vem a seguir */}
      {podeEditar && (
        <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", fontFamily: "Georgia,serif", marginBottom: 14 }}>
            Adicionar fotos
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 260px" }}>
              <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>Projeto</div>
              <select value={empresaUpload} onChange={e => setEmpresaUpload(e.target.value)}
                style={{ width: "100%", background: "#f8f8f8", border: "1px solid #eee", borderRadius: 8, padding: "8px 10px", fontSize: 12, outline: "none" }}>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
            <button onClick={() => inputRef.current?.click()} disabled={!!aEnviar}
              style={{ background: aEnviar ? "#e8e8e8" : "#16a34a", color: aEnviar ? "#999" : "#fff", border: "none", padding: "9px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: aEnviar ? "default" : "pointer" }}>
              {aEnviar ? `A enviar ${aEnviar.atual}/${aEnviar.total}...` : "Escolher fotos"}
            </button>
            <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
              onChange={e => enviar(e.target.files)} />
          </div>
          <div style={{ fontSize: 10, color: "#bbb", marginTop: 8 }}>
            Podes escolher várias de uma vez. Depois de enviadas, preenches a legenda e a data de cada uma.
            As imagens são reduzidas para {MAX_LADO}px antes do envio.
          </div>
          {aEnviar && (
            <div style={{ fontSize: 11, color: "#666", marginTop: 8, fontFamily: "monospace" }}>
              {aEnviar.nome}
            </div>
          )}
        </div>
      )}

      {/* Legendagem das fotos acabadas de enviar */}
      {porLegendar.length > 0 && (
        <div style={{ background: "#fff", border: "2px solid #16a34a", borderRadius: 12, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", fontFamily: "Georgia,serif" }}>
                {fmtInt(porLegendar.length)} {porLegendar.length === 1 ? "foto enviada" : "fotos enviadas"}
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                Preenche a legenda e a data de cada uma. Já estão guardadas — isto é só para as identificar.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {porLegendar.length > 1 && (
                <button onClick={aplicarDataATodas}
                  style={{ background: "#fff", border: "1px solid #e0e0e0", color: "#666", padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
                  Usar a 1.ª data em todas
                </button>
              )}
              <button onClick={guardarLegendas} disabled={aGuardar}
                style={{ background: aGuardar ? "#e8e8e8" : "#16a34a", color: aGuardar ? "#999" : "#fff", border: "none", padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: aGuardar ? "default" : "pointer" }}>
                {aGuardar ? "A guardar..." : "Concluir"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {porLegendar.map(f => (
              <div key={f.id} style={{ display: "flex", gap: 12, alignItems: "center", background: "#fafbfc", borderRadius: 10, padding: 10, flexWrap: "wrap" }}>
                <img src={f._preview} alt=""
                  style={{ width: 86, height: 64, objectFit: "cover", borderRadius: 7, flexShrink: 0, background: "#eee" }} />
                <div style={{ flex: "2 1 240px", minWidth: 200 }}>
                  <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 3 }}>Legenda</div>
                  <input value={f.legenda} autoFocus={porLegendar[0]?.id === f.id}
                    onChange={e => alterarPendente(f.id, "legenda", e.target.value)}
                    placeholder="ex: fachada nascente, piso 2"
                    style={{ width: "100%", background: "#fff", border: "1px solid #e8e8e8", borderRadius: 7, padding: "7px 10px", fontSize: 12, outline: "none" }} />
                </div>
                <div style={{ flex: "0 0 140px" }}>
                  <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 3 }}>Data</div>
                  <input type="date" value={f.data}
                    onChange={e => alterarPendente(f.id, "data", e.target.value)}
                    style={{ width: "100%", background: "#fff", border: "1px solid #e8e8e8", borderRadius: 7, padding: "6px 9px", fontSize: 12, outline: "none", fontFamily: "monospace" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span style={{ fontSize: 9, color: "#bbb", fontFamily: "monospace" }}>{fmtTamanho(f.tamanho)}</span>
                  <button onClick={() => descartarPendente(f)} title="Apagar esta foto"
                    style={{ background: "#fff0f0", border: "none", color: "#dc2626", padding: "4px 9px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>
                    Apagar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Galeria */}
      {erro && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 14, fontSize: 12, color: "#dc2626" }}>
          {erro}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 50, textAlign: "center", color: "#888", fontSize: 13 }}>A carregar fotos…</div>
      ) : visiveis.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: 50, textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>📷</div>
          <div style={{ fontSize: 14, color: "#1a1a2e", fontWeight: 600 }}>
            {filtro === "todos" ? "Ainda não há fotos" : `Sem fotos de ${nomeEmpresa(filtro)}`}
          </div>
          {podeEditar && <div style={{ fontSize: 12, color: "#aaa", marginTop: 6 }}>Usa o painel acima para adicionar.</div>}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
          {visiveis.map(f => (
            <div key={f.id} onClick={() => setLightbox(f)}
              style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, overflow: "hidden", cursor: "pointer" }}>
              <div style={{ aspectRatio: "4/3", background: "#f4f5f7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {urls[f.path]
                  ? <img src={urls[f.path]} alt={f.legenda || ""} loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  : <span style={{ fontSize: 10, color: "#ccc", fontFamily: "monospace" }}>a carregar…</span>}
              </div>
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.legenda || "(sem legenda)"}
                </div>
                <div style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace", marginTop: 3, display: "flex", justifyContent: "space-between" }}>
                  <span>{nomeEmpresa(f.empresa_id).split(" (")[0]}</span>
                  <span>{fmtData(f.data)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: "94vw", maxHeight: "94vh", display: "flex", flexDirection: "column", gap: 10 }}>
            {urls[lightbox.path] && (
              <img src={urls[lightbox.path]} alt={lightbox.legenda || ""}
                style={{ maxWidth: "94vw", maxHeight: "78vh", objectFit: "contain", borderRadius: 10 }} />
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, color: "#fff" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{lightbox.legenda || "(sem legenda)"}</div>
                <div style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace", marginTop: 3 }}>
                  {nomeEmpresa(lightbox.empresa_id)} · {fmtData(lightbox.data)} · {fmtTamanho(lightbox.tamanho)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {urls[lightbox.path] && (
                  <a href={urls[lightbox.path]} target="_blank" rel="noopener noreferrer" download
                    style={{ background: "#ffffff22", color: "#fff", textDecoration: "none", padding: "7px 14px", borderRadius: 7, fontSize: 12 }}>
                    Abrir
                  </a>
                )}
                {podeEditar && (
                  <button onClick={() => apagar(lightbox)}
                    style={{ background: "#dc2626", color: "#fff", border: "none", padding: "7px 14px", borderRadius: 7, fontSize: 12, cursor: "pointer" }}>
                    Apagar
                  </button>
                )}
                <button onClick={() => setLightbox(null)}
                  style={{ background: "#ffffff22", color: "#fff", border: "none", padding: "7px 14px", borderRadius: 7, fontSize: 12, cursor: "pointer" }}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
