import { useState, useMemo, useEffect } from "react";
import { useFracoes, useVendas } from "./hooks.js";
import { EMPRESAS, GRUPOS, GRUPOS_INFO } from "./empresas.js";
import { fmtEUR, fmtPct as fmtPctCfg, fmtNum, fmtArea, parseNumero } from "./formato.js";

// Empresa a que são imputadas as faturas de comissão geradas a partir das vendas.
const EMPRESA_COMISSOES = EMPRESAS[EMPRESAS.length - 1]?.id || "";

const STATUS_OPTIONS = ["Disponível", "Reservada", "CPCV", "Escriturada"];
const STATUS_STYLES = {
  "Disponível":  { bg:"#f8f9fc", text:"#888",    border:"#e0e0e0" },
  "Reservada":   { bg:"#fffbeb", text:"#d97706",  border:"#fde68a" },
  "CPCV":        { bg:"#eff6ff", text:"#2563eb",  border:"#bfdbfe" },
  "Escriturada": { bg:"#f0fdf4", text:"#16a34a",  border:"#bbf7d0" },
};

const fmt = v => fmtEUR(v);
const fmtPct = v => fmtPctCfg(v);

const inp = {background:"#f8f8f8",border:"1px solid #eee",borderRadius:7,padding:"7px 10px",fontSize:12,outline:"none",width:"100%",boxSizing:"border-box"};
const lbl = {fontSize:9,color:"#aaa",fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.07em",display:"block",marginBottom:3};

// ─── COMISSÃO MODAL ────────────────────────────────────────────────────────────
function ComissaoModal({ venda, fracao, onSave, onClose, onGerarFatura }) {
  // Multiple mediadores support
  const [mediadores, setMediadores] = useState(
    venda.mediadores?.length > 0 ? venda.mediadores :
    [{ nome: venda.mediador||"", pct: venda.comissao_pct||0, parcelas: venda.comissao_parcelas?.length > 0 ? venda.comissao_parcelas : [
      ...(venda.comissao_paga_sinal > 0 ? [{ valor: venda.comissao_paga_sinal, data: venda.data_pagamento_sinal||"", pago: true, desc:"Sinal" }] : []),
      ...(venda.comissao_paga_escritura > 0 ? [{ valor: venda.comissao_paga_escritura, data: venda.data_pagamento_escritura||"", pago: true, desc:"Escritura" }] : []),
      ...(venda.comissao_pendente_sinal > 0 ? [{ valor: venda.comissao_pendente_sinal, data: venda.data_pagamento_sinal||"", pago: false, desc:"Sinal pend." }] : []),
      ...(venda.comissao_pendente_escritura > 0 ? [{ valor: venda.comissao_pendente_escritura, data: venda.data_pagamento_escritura||"", pago: false, desc:"Escritura pend." }] : []),
    ]}]
  );

  const totalComissao = mediadores.reduce((s,m) => s + (venda.valor_venda||0) * ((parseFloat(m.pct)||0)/100), 0);
  const totalPago = mediadores.reduce((s,m) => s + m.parcelas.filter(p=>p.pago).reduce((ps,p)=>ps+(parseFloat(p.valor)||0),0), 0);
  const totalPend = mediadores.reduce((s,m) => s + m.parcelas.filter(p=>!p.pago).reduce((ps,p)=>ps+(parseFloat(p.valor)||0),0), 0);
  const faturaJaCriada = venda.fatura_criada;

  const addMediador = () => setMediadores(ms=>[...ms,{nome:"",pct:0,parcelas:[]}]);
  const removeMediador = (i) => setMediadores(ms=>ms.filter((_,idx)=>idx!==i));
  const updMed = (i,f,v) => setMediadores(ms=>ms.map((m,idx)=>idx===i?{...m,[f]:v}:m));
  const addParcela = (mi) => setMediadores(ms=>ms.map((m,idx)=>idx===mi?{...m,parcelas:[...m.parcelas,{valor:"",data:"",pago:false,desc:""}]}:m));
  const updParcela = (mi,pi,f,v) => setMediadores(ms=>ms.map((m,midx)=>midx===mi?{...m,parcelas:m.parcelas.map((p,pidx)=>pidx===pi?{...p,[f]:v}:p)}:m));
  const removeParcela = (mi,pi) => setMediadores(ms=>ms.map((m,midx)=>midx===mi?{...m,parcelas:m.parcelas.filter((_,pidx)=>pidx!==pi)}:m));

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:16,padding:28,width:620,maxWidth:"95vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:"#1a1a2e",fontFamily:"Georgia,serif"}}>🤝 Comissão — {venda.cliente}</div>
            <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{fracao?.projeto} · {fracao?.fracao}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#aaa"}}>✕</button>
        </div>

        {/* Valores */}
        <div style={{background:"#f8f9fc",borderRadius:10,padding:14,marginBottom:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><div style={lbl}>Valor de Venda</div><div style={{fontSize:14,fontWeight:700,color:"#1a1a2e",fontFamily:"monospace"}}>{fmt(venda.valor_venda)}</div></div>
          <div>
            <div style={lbl}>Total Comissões ({fmtPct(mediadores.reduce((s,m)=>s+(parseFloat(m.pct)||0),0))})</div>
            <div style={{fontSize:14,fontWeight:700,color:"#dc2626",fontFamily:"monospace"}}>{fmt(totalComissao)}</div>
          </div>
        </div>

        {/* Múltiplos Mediadores */}
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:700,color:"#1a1a2e"}}>🤝 Mediadores</div>
            <button onClick={addMediador}
              style={{background:"#f0f4ff",border:"1px solid #bfdbfe",color:"#2563eb",padding:"4px 12px",borderRadius:6,fontSize:11,cursor:"pointer",fontWeight:600}}>+ Mediador</button>
          </div>
          {mediadores.map((med,mi)=>(
            <div key={mi} style={{background:"#f8f9fc",borderRadius:10,padding:14,marginBottom:10,border:"1px solid #e8e8e8"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:10,marginBottom:10,alignItems:"end"}}>
                <div>
                  <label style={lbl}>Nome do Mediador</label>
                  <input type="text" value={med.nome} onChange={e=>updMed(mi,"nome",e.target.value)} style={inp} placeholder="Nome..."/>
                </div>
                <div>
                  <label style={lbl}>% Comissão</label>
                  <input type="number" value={med.pct} onChange={e=>updMed(mi,"pct",parseFloat(e.target.value)||0)} style={{...inp,width:80,color:"#4a6fa5",fontWeight:700}} step="0.1"/>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"flex-end",paddingBottom:2}}>
                  <span style={{fontSize:12,fontFamily:"monospace",color:"#dc2626",fontWeight:700,whiteSpace:"nowrap"}}>{fmt((venda.valor_venda||0)*(med.pct/100))}</span>
                  {mediadores.length>1&&<button onClick={()=>removeMediador(mi)}
                    style={{background:"#fff0f0",border:"none",color:"#dc2626",padding:"5px 8px",borderRadius:5,cursor:"pointer",fontSize:11}}>✕</button>}
                </div>
              </div>
              {/* Parcelas do mediador */}
              <div style={{paddingLeft:8,borderLeft:"2px solid #e0e0e0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{fontSize:10,color:"#aaa",fontFamily:"monospace",textTransform:"uppercase"}}>Parcelas</div>
                  <button onClick={()=>addParcela(mi)}
                    style={{background:"#fff",border:"1px solid #ddd",color:"#888",padding:"2px 8px",borderRadius:4,fontSize:10,cursor:"pointer"}}>+ Parcela</button>
                </div>
                {med.parcelas.length===0&&<div style={{color:"#ccc",fontSize:11,padding:"6px 0"}}>Sem parcelas.</div>}
                {med.parcelas.map((p,pi)=>(
                  <div key={pi} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto auto",gap:6,marginBottom:5,alignItems:"end"}}>
                    <input type="text" value={p.desc||""} onChange={e=>updParcela(mi,pi,"desc",e.target.value)} style={{...inp,fontSize:11}} placeholder="Descrição"/>
                    <input type="number" value={p.valor} onChange={e=>updParcela(mi,pi,"valor",e.target.value)} style={{...inp,fontSize:11,color:"#dc2626",fontWeight:600}} placeholder="Valor €"/>
                    <input type="date" value={p.data||""} onChange={e=>updParcela(mi,pi,"data",e.target.value)} style={{...inp,fontSize:11}}/>
                    <label style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:"#888",cursor:"pointer",whiteSpace:"nowrap"}}>
                      <input type="checkbox" checked={!!p.pago} onChange={e=>updParcela(mi,pi,"pago",e.target.checked)}/>Pago
                    </label>
                    <button onClick={()=>removeParcela(mi,pi)}
                      style={{background:"#fff0f0",border:"none",color:"#dc2626",padding:"4px 6px",borderRadius:4,cursor:"pointer",fontSize:10}}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"flex-end",gap:16,fontSize:12,fontFamily:"monospace",borderTop:"1px solid #f0f0f0",paddingTop:8}}>
            <span style={{color:"#16a34a"}}>✓ Pago: {fmt(totalPago)}</span>
            <span style={{color:"#dc2626"}}>⏳ Pendente: {fmt(totalPend)}</span>
            <span style={{color:"#1a1a2e",fontWeight:700}}>Total Comissões: {fmt(totalComissao)}</span>
          </div>
        </div>

        {/* Fatura */}
        <div style={{background:faturaJaCriada?"#f0fdf4":"#f8f9fc",border:`1px solid ${faturaJaCriada?"#bbf7d0":"#e0e0e0"}`,borderRadius:10,padding:"12px 16px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
          <div style={{fontSize:12,color:faturaJaCriada?"#16a34a":"#888"}}>
            {faturaJaCriada?"✅ Fatura já criada em Contas a Pagar":"⏳ Fatura ainda não criada em Contas a Pagar"}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>onGerarFatura({
                ...venda,
                mediadores,
                mediador: mediadores.map(m=>m.nome).filter(Boolean).join(', '),
                comissao_pct: mediadores.reduce((s,m)=>s+(parseFloat(m.pct)||0),0),
                comissao_valor: totalComissao,
                comissao_parcelas: mediadores.flatMap(m=>m.parcelas.map(p=>({...p,mediador:m.nome}))),
              })}
              disabled={faturaJaCriada}
              style={{background:faturaJaCriada?"#e0e0e0":"#1a1a2e",color:"#fff",border:"none",padding:"7px 16px",borderRadius:7,fontSize:11,cursor:faturaJaCriada?"default":"pointer",fontWeight:700,opacity:faturaJaCriada?0.6:1,whiteSpace:"nowrap"}}>
              {faturaJaCriada?"✓ Fatura criada":"📄 Gerar Fatura → Contas a Pagar"}
            </button>
          </div>
        </div>

        <div style={{display:"flex",justifyContent:"space-between"}}>
          <button onClick={onClose} style={{background:"#f0f0f0",color:"#666",border:"none",padding:"10px 20px",borderRadius:8,fontSize:13,cursor:"pointer"}}>Cancelar</button>
          <button onClick={()=>onSave({
              mediadores,
              mediador: mediadores.map(m=>m.nome).filter(Boolean).join(', '),
              comissao_pct: mediadores.reduce((s,m)=>s+(parseFloat(m.pct)||0),0),
              comissao_valor: totalComissao,
              comissao_parcelas: mediadores.flatMap(m=>m.parcelas.map(p=>({...p,mediador:m.nome}))),
              comissao_paga_sinal: totalPago,
              comissao_pendente_sinal: totalPend,
            })}
            style={{background:"#16a34a",color:"#fff",border:"none",padding:"10px 24px",borderRadius:8,fontSize:13,cursor:"pointer",fontWeight:700}}>
            💾 Guardar Comissão
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EDIT VENDA MODAL ──────────────────────────────────────────────────────────
function EditVendaModal({ venda, fracao, onSave, onClose }) {
  const [f, setF] = useState({...venda});
  const s = (k,v) => setF(prev=>({...prev,[k]:v}));
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:16,padding:28,width:620,maxWidth:"95vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
          <div style={{fontSize:16,fontWeight:700,color:"#1a1a2e",fontFamily:"Georgia,serif"}}>✎ Editar — {fracao?.fracao}</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#aaa"}}>✕</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {[["Cliente","cliente","text"],["NIF","nif","text"],["Email","email","email"],["Telefone","telefone","text"],
            ["Valor de Venda (€)","valor_venda","number"],["Preço Tabela (€)","preco_tabela","number"],
            ["Recebido (€)","recebemos","number"],["Prev. Escritura","previsao_escritura","date"],
            ["Mediador","mediador","text"],["Data Venda","data","date"],
          ].map(([label,name,type])=>(
            <div key={name} style={{display:"flex",flexDirection:"column",gap:3}}>
              <label style={lbl}>{label}</label>
              <input type={type} value={f[name]||""} onChange={e=>s(name,type==="number"?parseFloat(e.target.value)||0:e.target.value)} style={inp}/>
            </div>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}>
          <button onClick={onClose} style={{background:"#f0f0f0",color:"#666",border:"none",padding:"10px 20px",borderRadius:8,fontSize:13,cursor:"pointer"}}>Cancelar</button>
          <button onClick={()=>onSave(f)} style={{background:"#1a1a2e",color:"#fff",border:"none",padding:"10px 24px",borderRadius:8,fontSize:13,cursor:"pointer",fontWeight:700}}>💾 Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ─── TABELA DE VENDAS ──────────────────────────────────────────────────────────
// Célula numérica editável: mostra o número formatado em repouso e o valor
// em bruto enquanto está a ser editada (senão os separadores atrapalham a escrita).
function CelulaNumero({ valor, onGuardar, editavel, formatar, alinhar = "right", estilo = {} }) {
  const [aEditar, setAEditar] = useState(false);
  const [rascunho, setRascunho] = useState("");

  if (!editavel) {
    return <span style={{ fontFamily: "monospace", ...estilo }}>{formatar(valor)}</span>;
  }

  const base = {
    width: "100%", background: "transparent", border: "1px solid transparent",
    borderRadius: 5, padding: "4px 6px", fontSize: 11, outline: "none",
    textAlign: alinhar, fontFamily: "monospace", color: "#1a1a2e", ...estilo,
  };

  return (
    <input
      value={aEditar ? rascunho : formatar(valor)}
      onFocus={(e) => {
        setRascunho(valor === 0 || valor == null ? "" : String(valor).replace(".", ","));
        setAEditar(true);
        e.target.style.background = "#fff";
        e.target.style.borderColor = "#c7d2e5";
      }}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={(e) => {
        setAEditar(false);
        e.target.style.background = "transparent";
        e.target.style.borderColor = "transparent";
        const n = parseNumero(rascunho);
        if (n !== (Number(valor) || 0)) onGuardar(n);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
      inputMode="decimal"
      style={base}
    />
  );
}

function TabelaVendas({ fracoes, vendas, canEdit, onAddFatura, onUpdateFracao, onUpdateVenda, onUpsertVenda, onUpsertFracao, onDeleteFracao, projetosDisponiveis }) {
  const [filterProj, setFilterProj] = useState("Todos");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [search, setSearch] = useState("");
  const [editVenda, setEditVenda] = useState(null);
  const [editComissao, setEditComissao] = useState(null);
  const [rascunhos, setRascunhos] = useState({});   // edições por confirmar, por célula

  const projetos = useMemo(
    () => ["Todos", ...new Set([...(projetosDisponiveis||[]), ...fracoes.map(f => f.projeto)].filter(Boolean))],
    [fracoes, projetosDisponiveis]
  );

  // Venda associada a cada fração (para os botões de venda/comissão)
  const vendaDe = useMemo(() => {
    const m = new Map();
    vendas.forEach(v => { if (v.fracao_id) m.set(v.fracao_id, v); });
    return m;
  }, [vendas]);

  const rows = useMemo(() => fracoes.filter(f =>
    (filterProj === "Todos" || f.projeto === filterProj) &&
    (filterStatus === "Todos" || f.status === filterStatus) &&
    (!search || (f.fracao || "").toLowerCase().includes(search.toLowerCase())
             || (f.tipologia || "").toLowerCase().includes(search.toLowerCase())
             || (vendaDe.get(f.id)?.cliente || "").toLowerCase().includes(search.toLowerCase()))
  ), [fracoes, filterProj, filterStatus, search, vendaDe]);

  const totais = useMemo(() => {
    const area = rows.reduce((s, f) => s + (Number(f.area) || 0), 0);
    const preco = rows.reduce((s, f) => s + (Number(f.preco_tabela) || 0), 0);
    return { area, preco, precoM2: area > 0 ? preco / area : 0 };
  }, [rows]);

  // Guarda uma célula na base de dados
  const guardar = (frac, campo, valor) => {
    const numerico = campo === "area" || campo === "preco_tabela";
    const v = numerico ? parseNumero(valor) : valor;
    if ((frac[campo] ?? "") === v) return;
    onUpsertFracao?.({ ...frac, [campo]: v });
  };

  const valorCelula = (frac, campo) => {
    const chave = frac.id + ":" + campo;
    return rascunhos[chave] !== undefined ? rascunhos[chave] : (frac[campo] ?? "");
  };
  const escrever = (frac, campo, valor) =>
    setRascunhos(r => ({ ...r, [frac.id + ":" + campo]: valor }));
  const confirmar = (frac, campo) => {
    const chave = frac.id + ":" + campo;
    if (rascunhos[chave] === undefined) return;
    guardar(frac, campo, rascunhos[chave]);
    setRascunhos(r => { const c = { ...r }; delete c[chave]; return c; });
  };

  const novaFracao = () => {
    const projeto = filterProj !== "Todos" ? filterProj : projetos[1];
    if (!projeto) { alert("Escolhe primeiro um projeto no filtro."); return; }
    onUpsertFracao?.({
      id: "fr_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      projeto, fracao: "", tipologia: "", piso: "", andar: "",
      area: 0, preco_tabela: 0, status: "Disponível", notas: "",
    });
  };

  const apagarFracao = (frac) => {
    if (vendaDe.get(frac.id)) { alert("Esta fração tem uma venda associada. Apaga a venda primeiro."); return; }
    if (!confirm(`Apagar a fração ${frac.fracao || "(sem nome)"}?`)) return;
    onDeleteFracao?.(frac.id);
  };

  const handleGerarFatura = (venda) => {
    const frac = fracoes.find(f => f.id === venda.fracao_id);
    onAddFatura?.({
      id: "fat_com_" + venda.id, empresa: EMPRESA_COMISSOES,
      projeto: frac?.projeto || "",
      fatura: `COM-${venda.id.slice(-6).toUpperCase()}`,
      fornecedor: venda.mediador || "Mediador",
      categoria: "Comissão", valor: venda.comissao_valor || 0,
      vencimento: (venda.comissao_parcelas || []).find(p => !p.pago)?.data || "",
      status: "Pendente",
      obs: `Comissão ${frac?.fracao || ""} · ${venda.cliente || ""}`,
    });
    onUpdateVenda?.(venda.id, { fatura_criada: true });
  };

  // Estilo comum das células editáveis
  const inputCelula = (extra = {}) => ({
    width: "100%", background: "transparent", border: "1px solid transparent",
    borderRadius: 5, padding: "4px 6px", fontSize: 11, outline: "none",
    fontFamily: "inherit", color: "#1a1a2e", ...extra,
  });
  const foco = (e) => { e.target.style.background = "#fff"; e.target.style.borderColor = "#c7d2e5"; };
  const desfoco = (e) => { e.target.style.background = "transparent"; e.target.style.borderColor = "transparent"; };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar fração, tipologia ou cliente..."
          style={{ flex: "2 1 260px", background: "#fff", border: "1px solid #eee", borderRadius: 10, padding: "10px 14px", fontSize: 13, outline: "none" }} />
        <select value={filterProj} onChange={e => setFilterProj(e.target.value)}
          style={{ flex: "1 1 200px", background: "#fff", border: "1px solid #eee", borderRadius: 10, padding: "10px 14px", fontSize: 13, outline: "none" }}>
          <option>Todos</option>
          {GRUPOS.map(g => {
            const nomes = EMPRESAS.filter(e => e.grupo === g && projetos.includes(e.nome)).map(e => e.nome);
            return nomes.length ? (
              <optgroup key={g} label={GRUPOS_INFO[g]?.nome || g}>
                {nomes.map(n => <option key={n}>{n}</option>)}
              </optgroup>
            ) : null;
          })}
          {/* projetos que não correspondem a nenhuma empresa */}
          {projetos.filter(p => p !== "Todos" && !EMPRESAS.some(e => e.nome === p)).map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ flex: "1 1 150px", background: "#fff", border: "1px solid #eee", borderRadius: 10, padding: "10px 14px", fontSize: 13, outline: "none" }}>
          {["Todos", ...STATUS_OPTIONS].map(s => <option key={s}>{s}</option>)}
        </select>
        {canEdit && (
          <button onClick={novaFracao}
            style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            + Nova fração
          </button>
        )}
      </div>

      {canEdit && rows.length > 0 && (
        <div style={{ fontSize: 11, color: "#aaa" }}>
          Clica numa célula para editar. As alterações são guardadas ao sair do campo.
        </div>
      )}

      {/* Tabela */}
      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 14, overflow: "hidden", maxWidth: 1180 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "17%" }} />{/* Projeto   */}
              <col style={{ width: "7%"  }} />{/* Fração    */}
              <col style={{ width: "6%"  }} />{/* Piso      */}
              <col style={{ width: "9%"  }} />{/* Tipologia */}
              <col style={{ width: "9%"  }} />{/* Área      */}
              <col style={{ width: "12%" }} />{/* Preço     */}
              <col style={{ width: "11%" }} />{/* Preço/m²  */}
              <col style={{ width: "10%" }} />{/* Status    */}
              <col style={{ width: "12%" }} />{/* Cliente   */}
              <col style={{ width: "7%"  }} />{/* Ações     */}
            </colgroup>
            <thead>
              <tr style={{ background: "#f8f9fc" }}>
                {[["Projeto","left"],["Fração","center"],["Piso","center"],["Tipologia","center"],
                  ["Área (m²)","right"],["Preço","right"],["Preço/m²","right"],
                  ["Status","center"],["Cliente","left"],["Ações","center"]].map(([h,al]) => (
                  <th key={h} style={{ padding: "9px 8px", textAlign: al, color: "#aaa", fontSize: 9, letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "monospace", borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0
                ? <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "#ccc" }}>Nenhuma fração encontrada.</td></tr>
                : rows.map(f => {
                  const venda = vendaDe.get(f.id);
                  const area = Number(f.area) || 0;
                  const preco = Number(f.preco_tabela) || 0;
                  const precoM2 = area > 0 ? preco / area : 0;
                  return (
                    <tr key={f.id} style={{ borderBottom: "1px solid #fafafa" }}>
                      <td style={{ padding: "6px 8px", color: "#888", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.projeto}>{f.projeto || "—"}</td>

                      <td style={{ padding: "4px 4px", textAlign: "center" }}>
                        {canEdit
                          ? <input value={valorCelula(f, "fracao")} onFocus={foco} onBlur={e => { desfoco(e); confirmar(f, "fracao"); }}
                              onChange={e => escrever(f, "fracao", e.target.value)}
                              style={inputCelula({ fontWeight: 700, textAlign: "center" })} />
                          : <span style={{ fontWeight: 700, color: "#1a1a2e" }}>{f.fracao || "—"}</span>}
                      </td>

                      <td style={{ padding: "4px 4px", textAlign: "center" }}>
                        {canEdit
                          ? <input value={valorCelula(f, "piso")} onFocus={foco} onBlur={e => { desfoco(e); confirmar(f, "piso"); }}
                              onChange={e => escrever(f, "piso", e.target.value)}
                              style={inputCelula({ color: "#666", textAlign: "center" })} />
                          : <span style={{ color: "#666" }}>{f.piso || "—"}</span>}
                      </td>

                      <td style={{ padding: "4px 4px", textAlign: "center" }}>
                        {canEdit
                          ? <input value={valorCelula(f, "tipologia")} onFocus={foco} onBlur={e => { desfoco(e); confirmar(f, "tipologia"); }}
                              onChange={e => escrever(f, "tipologia", e.target.value)}
                              style={inputCelula({ color: "#4a6fa5", textAlign: "center" })} />
                          : <span style={{ background: "#f0f4ff", color: "#4a6fa5", fontSize: 9, padding: "1px 6px", borderRadius: 4 }}>{f.tipologia || "—"}</span>}
                      </td>

                      <td style={{ padding: "4px 8px", textAlign: "right" }}>
                        <CelulaNumero valor={area} editavel={canEdit} formatar={v => fmtNum(v)}
                          onGuardar={v => onUpsertFracao?.({ ...f, area: v })}
                          estilo={{ color: "#666" }} />
                      </td>

                      <td style={{ padding: "4px 8px", textAlign: "right" }}>
                        <CelulaNumero valor={preco} editavel={canEdit} formatar={v => fmt(v)}
                          onGuardar={v => onUpsertFracao?.({ ...f, preco_tabela: v })}
                          estilo={{ fontWeight: 700 }} />
                      </td>

                      {/* Calculado a partir da área e do preço */}
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: "#888", whiteSpace: "nowrap" }}
                          title="Calculado: preço ÷ área">
                        {area > 0 ? fmt(precoM2) : "—"}
                      </td>

                      <td style={{ padding: "6px 4px", textAlign: "center" }}>
                        <select value={f.status || "Disponível"} disabled={!canEdit}
                          onChange={e => onUpsertFracao?.({ ...f, status: e.target.value })}
                          style={{ background: "none", border: "none", fontSize: 10, cursor: canEdit ? "pointer" : "default", color: STATUS_STYLES[f.status]?.text || "#888", fontWeight: 600, outline: "none" }}>
                          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </td>

                      <td style={{ padding: "6px 8px", color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={venda?.cliente || ""}>
                        {venda?.cliente || "—"}
                      </td>

                      <td style={{ padding: "6px 4px" }}>
                        <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "center" }}>
                          {canEdit && <>
                            <button onClick={() => setEditVenda(venda ? { ...venda, _frac: f } : { _frac: f, _semVenda: true, fracao_id: f.id, preco_tabela: f.preco_tabela })}
                              title={venda ? "Editar venda" : "Registar venda"}
                              style={{ background: venda ? "#f0f4ff" : "#f0fdf4", border: "none", color: venda ? "#4a6fa5" : "#16a34a", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", fontWeight: 600 }}>
                              {venda ? "✎" : "+"}
                            </button>
                            {venda && (
                              <button onClick={() => setEditComissao({ ...venda, _frac: f })} title="Editar comissão"
                                style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#d97706", padding: "3px 7px", borderRadius: 5, fontSize: 10, cursor: "pointer", fontWeight: 600 }}>🤝</button>
                            )}
                            <button onClick={() => apagarFracao(f)} title="Apagar fração"
                              style={{ background: "#fff0f0", border: "none", color: "#dc2626", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>✕</button>
                          </>}
                          {venda?.fatura_criada && <span style={{ fontSize: 9, color: "#16a34a", border: "1px solid #bbf7d0", background: "#f0fdf4", padding: "2px 5px", borderRadius: 4, fontFamily: "monospace" }}>✓Fat.</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ background: "#f0f4ff", borderTop: "2px solid #dde3f0" }}>
                  <td colSpan={4} style={{ padding: "10px 8px", fontSize: 10, color: "#4a6fa5", fontWeight: 700, whiteSpace: "nowrap" }}>
                    TOTAIS ({fmtNum(rows.length, 0)} {rows.length === 1 ? "fração" : "frações"})
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#666" }}>{fmtNum(totais.area)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#1a1a2e" }}>{fmt(totais.preco)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#888" }} title="Média ponderada">
                    {totais.area > 0 ? fmt(totais.precoM2) : "—"}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {editVenda && <EditVendaModal venda={editVenda} fracao={editVenda._frac}
        onSave={u => {
          if (editVenda._semVenda) {
            const f = editVenda._frac;
            onUpsertVenda?.({
              id: "v_" + f.id + "_" + Date.now().toString(36),
              fracao_id: f.id, projeto: f.projeto, fracao: f.fracao,
              preco_tabela: f.preco_tabela, ...u,
            });
          } else {
            onUpdateVenda?.(editVenda.id, u);
          }
          setEditVenda(null);
        }}
        onClose={() => setEditVenda(null)} />}
      {editComissao && <ComissaoModal venda={editComissao} fracao={editComissao._frac}
        onSave={u => { onUpdateVenda?.(editComissao.id, u); setEditComissao(null); }}
        onClose={() => setEditComissao(null)}
        onGerarFatura={v => { handleGerarFatura(v); setEditComissao(null); }} />}
    </div>
  );
}

// ─── GESTÃO DE COMISSÕES ───────────────────────────────────────────────────────
function GestaoComissoes({ vendas, fracoes, canEdit, onAddFatura, onUpdateVenda }) {
  const [filterStatus, setFilterStatus] = useState("Todas");
  const [editComissao, setEditComissao] = useState(null);

  const comissoes = useMemo(()=>vendas.filter(v=>(v.comissao_valor||0)>0).map(v=>{
    const frac=fracoes.find(f=>f.id===v.fracao_id);
    const comPago=(v.comissao_paga_sinal||0)+(v.comissao_paga_escritura||0);
    const comPend=(v.comissao_pendente_sinal||0)+(v.comissao_pendente_escritura||0);
    const comPct=v.comissao_valor&&v.valor_venda?(v.comissao_valor/v.valor_venda*100):(v.comissao_pct||0);
    const status=comPend===0&&comPago>0?"Paga":comPago>0?"Parcial":"Pendente";
    return {...v,_frac:frac,_comPago:comPago,_comPend:comPend,_comPct:comPct,status};
  }),[vendas,fracoes]);

  const filtered=filterStatus==="Todas"?comissoes:comissoes.filter(c=>c.status===filterStatus);
  const handleGerarFatura=(venda)=>{
    const frac=fracoes.find(f=>f.id===venda.fracao_id);
    onAddFatura?.({
      id:"fat_com_"+venda.id,empresa:EMPRESA_COMISSOES,projeto:frac?.projeto||"",
      fatura:`COM-${venda.id.slice(-6).toUpperCase()}`,fornecedor:venda.mediador||"Mediador",
      categoria:"Comissão",tipo_projeto:frac?.projeto||"",valor:venda.comissao_valor||0,
      vencimento:(venda.comissao_parcelas||[]).find(p=>!p.pago)?.data||"",status:"Pendente",
      obs:`Comissão venda — ${frac?.fracao||""} — ${venda.cliente||""}`,anexo_nome:"",anexo_b64:"",
    });
    onUpdateVenda?.(venda.id, {fatura_criada:true});
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {[
          {label:"Total Comissões",value:fmt(comissoes.reduce((s,c)=>s+(c.comissao_valor||0),0)),color:"#1a1a2e"},
          {label:"Pagas",value:fmt(comissoes.reduce((s,c)=>s+c._comPago,0)),color:"#16a34a"},
          {label:"Pendentes",value:fmt(comissoes.reduce((s,c)=>s+c._comPend,0)),color:"#dc2626"},
        ].map((k,i)=>(
          <div key={i} style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:12,padding:"14px 18px",borderTop:`3px solid ${k.color}`}}>
            <div style={{fontSize:9,color:"#aaa",textTransform:"uppercase",fontFamily:"monospace",marginBottom:5}}>{k.label}</div>
            <div style={{fontSize:20,fontWeight:800,color:k.color,fontFamily:"monospace"}}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8}}>
        {["Todas","Pendente","Parcial","Paga"].map(s=>(
          <button key={s} onClick={()=>setFilterStatus(s)}
            style={{background:filterStatus===s?"#1a1a2e":"#fff",color:filterStatus===s?"#fff":"#888",border:`1px solid ${filterStatus===s?"#1a1a2e":"#eee"}`,padding:"6px 14px",borderRadius:8,fontSize:12,cursor:"pointer"}}>
            {s}
          </button>
        ))}
      </div>
      <div style={{background:"#fff",border:"1px solid #f0f0f0",borderRadius:14,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead>
              <tr style={{background:"#f8f9fc"}}>
                {["Fração","Cliente","Mediador","Valor Venda","% Com.","Total Com.","Pago","Pendente","Parcelas","Estado","Fatura","Ações"].map(h=>(
                  <th key={h} style={{padding:"9px 12px",textAlign:"left",color:"#aaa",fontSize:9,letterSpacing:"0.07em",textTransform:"uppercase",fontFamily:"monospace",borderBottom:"1px solid #f0f0f0",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0
                ?<tr><td colSpan={12} style={{padding:"40px",textAlign:"center",color:"#ccc"}}>Nenhuma comissão.</td></tr>
                :filtered.map(c=>(
                  <tr key={c.id} style={{borderBottom:"1px solid #fafafa"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#f8f9fc"}
                    onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <td style={{padding:"9px 12px",fontWeight:700,color:"#1a1a2e",whiteSpace:"nowrap",fontSize:10}}>{c._frac?.projeto} · {c._frac?.fracao}</td>
                    <td style={{padding:"9px 12px",color:"#333"}}>{c.cliente}</td>
                    <td style={{padding:"9px 12px",color:"#888",fontSize:10}}>{c.mediador||"—"}</td>
                    <td style={{padding:"9px 12px",fontFamily:"monospace",color:"#1a1a2e"}}>{fmt(c.valor_venda)}</td>
                    <td style={{padding:"9px 12px",fontFamily:"monospace",color:"#4a6fa5"}}>{fmtPct(c._comPct)}</td>
                    <td style={{padding:"9px 12px",fontFamily:"monospace",fontWeight:700,color:"#dc2626"}}>{fmt(c.comissao_valor)}</td>
                    <td style={{padding:"9px 12px",fontFamily:"monospace",color:"#16a34a"}}>{c._comPago>0?fmt(c._comPago):"—"}</td>
                    <td style={{padding:"9px 12px",fontFamily:"monospace",color:c._comPend>0?"#dc2626":"#aaa",fontWeight:c._comPend>0?700:400}}>{c._comPend>0?fmt(c._comPend):"—"}</td>
                    <td style={{padding:"9px 12px",color:"#888"}}>{(c.comissao_parcelas||[]).length||"—"}</td>
                    <td style={{padding:"9px 12px"}}>
                      <span style={{background:c.status==="Paga"?"#f0fdf4":c.status==="Parcial"?"#eff6ff":"#fffbeb",
                        color:c.status==="Paga"?"#16a34a":c.status==="Parcial"?"#2563eb":"#d97706",
                        fontSize:9,padding:"2px 8px",borderRadius:20,fontFamily:"monospace",fontWeight:600}}>{c.status}</span>
                    </td>
                    <td style={{padding:"9px 12px"}}>
                      {c.fatura_criada
                        ?<span style={{fontSize:9,color:"#16a34a",border:"1px solid #bbf7d0",background:"#f0fdf4",padding:"2px 7px",borderRadius:4}}>✓ Criada</span>
                        :<span style={{fontSize:9,color:"#aaa",border:"1px solid #eee",padding:"2px 7px",borderRadius:4}}>Não criada</span>
                      }
                    </td>
                    <td style={{padding:"9px 12px"}}>
                      {canEdit&&<button onClick={()=>setEditComissao(c)}
                        style={{background:"#fffbeb",border:"1px solid #fde68a",color:"#d97706",padding:"3px 8px",borderRadius:5,fontSize:10,cursor:"pointer",fontWeight:600}}>✎ Editar</button>}
                    </td>
                  </tr>
                ))}
            </tbody>
            {filtered.length>0&&(
              <tfoot>
                <tr style={{background:"#f0f4ff",borderTop:"2px solid #dde3f0"}}>
                  <td colSpan={5} style={{padding:"9px 12px",fontSize:10,color:"#4a6fa5",fontWeight:700}}>TOTAL ({filtered.length})</td>
                  <td style={{padding:"9px 12px",fontFamily:"monospace",fontWeight:700,color:"#dc2626"}}>{fmt(filtered.reduce((s,c)=>s+(c.comissao_valor||0),0))}</td>
                  <td style={{padding:"9px 12px",fontFamily:"monospace",fontWeight:700,color:"#16a34a"}}>{fmt(filtered.reduce((s,c)=>s+c._comPago,0))}</td>
                  <td style={{padding:"9px 12px",fontFamily:"monospace",fontWeight:700,color:"#dc2626"}}>{fmt(filtered.reduce((s,c)=>s+c._comPend,0))}</td>
                  <td colSpan={4}/>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {editComissao&&<ComissaoModal venda={editComissao} fracao={editComissao._frac}
        onSave={u=>{onUpdateVenda?.(editComissao.id,u);setEditComissao(null);}}
        onClose={()=>setEditComissao(null)}
        onGerarFatura={v=>{handleGerarFatura(v);setEditComissao(null);}}/>}
    </div>
  );
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────
export default function ComercialView({ currentUser, onAddFatura, empresasVisiveis }) {
  // Um investidor só vê os projetos que lhe foram atribuídos. A base de dados já
  // filtra as linhas por RLS; aqui filtra-se também a lista de projetos, para os
  // nomes dos outros nem aparecerem no seletor.
  // Atenção: uma lista VAZIA é uma restrição válida (investidor sem projetos
  // atribuídos não vê nada). Só se a prop não vier de todo é que se usa tudo.
  const empresas = Array.isArray(empresasVisiveis) ? empresasVisiveis : EMPRESAS;
  const projetosPermitidos = empresas.map(e => e.nome);
  const limitado = Array.isArray(empresasVisiveis) && empresasVisiveis.length < EMPRESAS.length;

  const [subTab, setSubTab] = useState("tabela");
  const { fracoes: fracoesTodas, loaded: fracoesLoaded, upsertFracao, deleteFracao } = useFracoes();
  const { vendas: vendasTodas, loaded: vendasLoaded, upsertVenda, deleteVenda } = useVendas();

  const fracoes = limitado ? fracoesTodas.filter(f => projetosPermitidos.includes(f.projeto)) : fracoesTodas;
  const vendas  = limitado ? vendasTodas.filter(v => {
    const f = fracoesTodas.find(x => x.id === v.fracao_id);
    return projetosPermitidos.includes(f?.projeto || v.projeto);
  }) : vendasTodas;

  const canEdit = currentUser?.role === "admin" || currentUser?.role === "gestor";

  // Wrap setters to also persist to Supabase
  const setFracoes = (updater) => {
    // Only used for local status changes — persist each change
  };

  const updateFracao = (id, changes) => {
    const frac = fracoes.find(f => f.id === id);
    if (frac) upsertFracao({ ...frac, ...changes });
  };

  const updateVenda = (id, changes) => {
    const v = vendas.find(v => v.id === id);
    if (v) upsertVenda({ ...v, ...changes });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", gap: 4, background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: 6, width: "fit-content" }}>
        {[["tabela", "📋 Tabela de Vendas"], ["comissoes", "🤝 Gestão de Comissões"]].map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)}
            style={{ background: subTab === id ? "#1a1a2e" : "none", color: subTab === id ? "#fff" : "#888", border: "none", padding: "9px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: subTab === id ? 700 : 400 }}>
            {label}
          </button>
        ))}
      </div>
      {subTab === "tabela" && (
        <TabelaVendas
          fracoes={fracoes} vendas={vendas} canEdit={canEdit}
          onAddFatura={onAddFatura}
          onUpdateFracao={updateFracao}
          onUpdateVenda={updateVenda}
          onUpsertVenda={upsertVenda}
          onUpsertFracao={upsertFracao}
          onDeleteFracao={deleteFracao}
          projetosDisponiveis={projetosPermitidos}
        />
      )}
      {subTab === "comissoes" && (
        <GestaoComissoes
          vendas={vendas} fracoes={fracoes} canEdit={canEdit}
          onAddFatura={onAddFatura}
          onUpdateVenda={updateVenda}
        />
      )}
    </div>
  );
}
