import { useState, useMemo, useEffect } from "react";
import { useFracoes, useVendas } from "./hooks.js";
import { EMPRESAS, GRUPOS, GRUPOS_INFO } from "./empresas.js";
import { precoDaFracao, contaDaVenda, comissaoDaVenda, parcelasDaVenda } from "./vendas.js";
import { fmtEUR, fmtPct as fmtPctCfg, fmtNum, fmtArea, parseNumero } from "./formato.js";

// Empresa a que são imputadas as faturas de comissão geradas a partir das vendas.
const EMPRESA_COMISSOES = EMPRESAS[EMPRESAS.length - 1]?.id || "";

const STATUS_OPTIONS = ["Disponível", "Reservada", "CPCV", "Escriturada"];
const STATUS_STYLES = {
  "Disponível":  { bg:"#FAF6F0", text:"#7E8388",    border:"#DFD5C8" },
  "Reservada":   { bg:"#FBF6EC", text:"#A8762F",  border:"#E3CE9F" },
  "CPCV":        { bg:"#EDF1F5", text:"#1F3A52",  border:"#CBDAE5" },
  "Escriturada": { bg:"#EFF5F1", text:"#1F7A54",  border:"#C9E3D5" },
};

const fmt = v => fmtEUR(v);
const fmtPct = v => fmtPctCfg(v);

const inp = {background:"#F9F5EF",border:"1px solid #EFE8DE",borderRadius:7,padding:"7px 10px",fontSize:12,outline:"none",width:"100%",boxSizing:"border-box"};
const lbl = {fontSize:9,color:"#9DA2A6",fontFamily: "var(--fonte-numero)",textTransform:"uppercase",letterSpacing:"0.07em",display:"block",marginBottom:3};

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
            <div style={{fontSize:16,fontWeight:700,color:"#091C2A",fontFamily: "var(--fonte-titulo)"}}>🤝 Comissão — {venda.cliente}</div>
            <div style={{fontSize:11,color:"#9DA2A6",marginTop:2}}>{fracao?.projeto} · {fracao?.fracao}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9DA2A6"}}>✕</button>
        </div>

        {/* Valores */}
        <div style={{background:"#FAF6F0",borderRadius:10,padding:14,marginBottom:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><div style={lbl}>Valor de Venda</div><div style={{fontSize:14,fontWeight:700,color:"#091C2A",fontFamily: "var(--fonte-numero)"}}>{fmt(venda.valor_venda)}</div></div>
          <div>
            <div style={lbl}>Total Comissões ({fmtPct(mediadores.reduce((s,m)=>s+(parseFloat(m.pct)||0),0))})</div>
            <div style={{fontSize:14,fontWeight:700,color:"#A93226",fontFamily: "var(--fonte-numero)"}}>{fmt(totalComissao)}</div>
          </div>
        </div>

        {/* Múltiplos Mediadores */}
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:700,color:"#091C2A"}}>🤝 Mediadores</div>
            <button onClick={addMediador}
              style={{background:"#EDF1F5",border:"1px solid #CBDAE5",color:"#1F3A52",padding:"4px 12px",borderRadius:6,fontSize:11,cursor:"pointer",fontWeight:600}}>+ Mediador</button>
          </div>
          {mediadores.map((med,mi)=>(
            <div key={mi} style={{background:"#FAF6F0",borderRadius:10,padding:14,marginBottom:10,border:"1px solid #E3D9CC"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:10,marginBottom:10,alignItems:"end"}}>
                <div>
                  <label style={lbl}>Nome do Mediador</label>
                  <input type="text" value={med.nome} onChange={e=>updMed(mi,"nome",e.target.value)} style={inp} placeholder="Nome..."/>
                </div>
                <div>
                  <label style={lbl}>% Comissão</label>
                  <input type="number" value={med.pct} onChange={e=>updMed(mi,"pct",parseFloat(e.target.value)||0)} style={{...inp,width:80,color:"#2C4A63",fontWeight:700}} step="0.1"/>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"flex-end",paddingBottom:2}}>
                  <span style={{fontSize:12,fontFamily: "var(--fonte-numero)",color:"#A93226",fontWeight:700,whiteSpace:"nowrap"}}>{fmt((venda.valor_venda||0)*(med.pct/100))}</span>
                  {mediadores.length>1&&<button onClick={()=>removeMediador(mi)}
                    style={{background:"#FBEDEB",border:"none",color:"#A93226",padding:"5px 8px",borderRadius:5,cursor:"pointer",fontSize:11}}>✕</button>}
                </div>
              </div>
              {/* Parcelas do mediador */}
              <div style={{paddingLeft:8,borderLeft:"2px solid #DFD5C8"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{fontSize:10,color:"#9DA2A6",fontFamily: "var(--fonte-numero)",textTransform:"uppercase"}}>Parcelas</div>
                  <button onClick={()=>addParcela(mi)}
                    style={{background:"#fff",border:"1px solid #D8CCBB",color:"#7E8388",padding:"2px 8px",borderRadius:4,fontSize:10,cursor:"pointer"}}>+ Parcela</button>
                </div>
                {med.parcelas.length===0&&<div style={{color:"#C4C7CA",fontSize:11,padding:"6px 0"}}>Sem parcelas.</div>}
                {med.parcelas.map((p,pi)=>(
                  <div key={pi} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto auto",gap:6,marginBottom:5,alignItems:"end"}}>
                    <input type="text" value={p.desc||""} onChange={e=>updParcela(mi,pi,"desc",e.target.value)} style={{...inp,fontSize:11}} placeholder="Descrição"/>
                    <input type="number" value={p.valor} onChange={e=>updParcela(mi,pi,"valor",e.target.value)} style={{...inp,fontSize:11,color:"#A93226",fontWeight:600}} placeholder="Valor €"/>
                    <input type="date" value={p.data||""} onChange={e=>updParcela(mi,pi,"data",e.target.value)} style={{...inp,fontSize:11}}/>
                    <label style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:"#7E8388",cursor:"pointer",whiteSpace:"nowrap"}}>
                      <input type="checkbox" checked={!!p.pago} onChange={e=>updParcela(mi,pi,"pago",e.target.checked)}/>Pago
                    </label>
                    <button onClick={()=>removeParcela(mi,pi)}
                      style={{background:"#FBEDEB",border:"none",color:"#A93226",padding:"4px 6px",borderRadius:4,cursor:"pointer",fontSize:10}}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"flex-end",gap:16,fontSize:12,fontFamily: "var(--fonte-numero)",borderTop:"1px solid #E7DED2",paddingTop:8}}>
            <span style={{color:"#1F7A54"}}>✓ Pago: {fmt(totalPago)}</span>
            <span style={{color:"#A93226"}}>⏳ Pendente: {fmt(totalPend)}</span>
            <span style={{color:"#091C2A",fontWeight:700}}>Total Comissões: {fmt(totalComissao)}</span>
          </div>
        </div>

        {/* Fatura */}
        <div style={{background:faturaJaCriada?"#EFF5F1":"#FAF6F0",border:`1px solid ${faturaJaCriada?"#C9E3D5":"#DFD5C8"}`,borderRadius:10,padding:"12px 16px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
          <div style={{fontSize:12,color:faturaJaCriada?"#1F7A54":"#7E8388"}}>
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
              style={{background:faturaJaCriada?"#DFD5C8":"#091C2A",color:"#fff",border:"none",padding:"7px 16px",borderRadius:7,fontSize:11,cursor:faturaJaCriada?"default":"pointer",fontWeight:700,opacity:faturaJaCriada?0.6:1,whiteSpace:"nowrap"}}>
              {faturaJaCriada?"✓ Fatura criada":"📄 Gerar Fatura → Contas a Pagar"}
            </button>
          </div>
        </div>

        <div style={{display:"flex",justifyContent:"space-between"}}>
          <button onClick={onClose} style={{background:"#E7DED2",color:"#5C6166",border:"none",padding:"10px 20px",borderRadius:8,fontSize:13,cursor:"pointer"}}>Cancelar</button>
          <button onClick={()=>onSave({
              mediadores,
              mediador: mediadores.map(m=>m.nome).filter(Boolean).join(', '),
              comissao_pct: mediadores.reduce((s,m)=>s+(parseFloat(m.pct)||0),0),
              comissao_valor: totalComissao,
              comissao_parcelas: mediadores.flatMap(m=>m.parcelas.map(p=>({...p,mediador:m.nome}))),
              comissao_paga_sinal: totalPago,
              comissao_pendente_sinal: totalPend,
            })}
            style={{background:"#091C2A",color:"#fff",border:"none",padding:"10px 24px",borderRadius:8,fontSize:13,cursor:"pointer",fontWeight:700}}>
            💾 Guardar Comissão
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EDIT VENDA MODAL ──────────────────────────────────────────────────────────
function EditVendaModal({ venda, fracao, onSave, onClose }) {
  const [f, setF] = useState({ ...venda, parcelas: Array.isArray(venda?.parcelas) ? venda.parcelas : [] });
  const s = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  // ── Sinal e reforços ─────────────────────────────────────────────────────
  // O que o comprador paga antes da escritura. O resto do preço entra no mês
  // da escritura — a conta está em src/vendas.js e mostra-se aqui em baixo,
  // para se perceber o que vai parar ao fluxo antes de guardar.
  const parcelas = f.parcelas || [];
  const porParcela = (lista) => s("parcelas", lista);
  const mudaParcela = (i, campo, valor) =>
    porParcela(parcelas.map((p, k) => (k === i ? { ...p, [campo]: valor } : p)));
  const juntarParcela = () => porParcela([...parcelas, {
    desc: parcelas.length === 0 ? "Sinal" : `${parcelas.length}.º reforço`,
    valor: "", data: "", pago: false }]);
  const apagarParcela = (i) => porParcela(parcelas.filter((_, k) => k !== i));

  const conta = contaDaVenda(f, fracao);
  const com = comissaoDaVenda(f, fracao);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:16,padding:28,width:720,maxWidth:"95vw",maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
          <div style={{fontSize:16,fontWeight:700,color:"#091C2A",fontFamily:"var(--fonte-titulo)"}}>✎ Editar — {fracao?.fracao}</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9DA2A6"}}>✕</button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {[["Cliente","cliente","text"],["NIF","nif","text"],["Email","email","email"],["Telefone","telefone","text"],
            ["Valor de Venda (€)","valor_venda","number"],["Preço Tabela (€)","preco_tabela","number"],
            ["Prev. Escritura","previsao_escritura","date"],["Data Venda","data","date"],
            ["Mediador","mediador","text"],
          ].map(([label,name,type])=>(
            <div key={name} style={{display:"flex",flexDirection:"column",gap:3}}>
              <label style={lbl}>{label}</label>
              <input type={type} value={f[name]||""} onChange={e=>s(name,type==="number"?parseFloat(e.target.value)||0:e.target.value)} style={inp}/>
            </div>
          ))}
        </div>

        {/* ── Como é que o dinheiro entra ─────────────────────────────────── */}
        <div style={{marginTop:22,borderTop:"1px solid #E7DED2",paddingTop:16}}>
          <div style={{fontSize:13,fontWeight:700,color:"#091C2A",marginBottom:4}}>Como o dinheiro entra</div>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,color:"#23292D",cursor:"pointer",marginBottom:12}}>
            <input type="checkbox" checked={!!f.so_na_entrega}
              onChange={e=>{ s("so_na_entrega", e.target.checked); if (e.target.checked) s("parcelas", []); }}
              style={{width:15,height:15,accentColor:"#091C2A"}}/>
            Só na entrega — o projeto recebe tudo no mês da escritura
          </label>

          {!f.so_na_entrega && (
            <>
              {parcelas.length === 0 && (
                <div style={{fontSize:11.5,color:"#9DA2A6",marginBottom:8}}>
                  Sem sinal nem reforços: tudo entra na escritura.
                </div>
              )}
              {parcelas.map((p,i)=>(
                <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 110px 130px 70px 26px",gap:7,marginBottom:7,alignItems:"center"}}>
                  <input value={p.desc||""} placeholder={i===0?"Sinal":`${i}.º reforço`}
                    onChange={e=>mudaParcela(i,"desc",e.target.value)} style={{...inp,padding:"7px 9px",fontSize:12}}/>
                  <input type="number" step="0.01" value={p.valor??""} placeholder="0"
                    onChange={e=>mudaParcela(i,"valor",parseFloat(e.target.value)||0)}
                    style={{...inp,padding:"7px 9px",fontSize:12,textAlign:"right"}}/>
                  <input type="date" value={p.data||""}
                    onChange={e=>mudaParcela(i,"data",e.target.value)} style={{...inp,padding:"7px 9px",fontSize:12}}/>
                  <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:p.pago?"#1F7A54":"#9DA2A6",cursor:"pointer"}}>
                    <input type="checkbox" checked={!!p.pago} onChange={e=>mudaParcela(i,"pago",e.target.checked)}
                      style={{width:13,height:13,accentColor:"#1F7A54"}}/>
                    pago
                  </label>
                  <button onClick={()=>apagarParcela(i)} title="Apagar"
                    style={{background:"none",border:"none",color:"#B2B6B9",cursor:"pointer",fontSize:15,padding:0}}>×</button>
                </div>
              ))}
              <button onClick={juntarParcela}
                style={{background:"transparent",border:"1px dashed #D8CCBB",borderRadius:7,padding:"7px 13px",
                        fontSize:11.5,color:"#7E8388",cursor:"pointer",width:"100%"}}>
                + Juntar sinal ou reforço
              </button>
            </>
          )}

          <div style={{background:"#FAF6F0",borderRadius:9,padding:"10px 13px",fontSize:11.5,marginTop:12}}>
            <LinhaConta k="Preço" v={fmtEUR(conta.preco)} />
            <LinhaConta k="−  já recebido" v={`−${fmtEUR(conta.recebido)}`} />
            {conta.porReceberEmParcelas > 0 &&
              <LinhaConta k="−  reforços por receber" v={`−${fmtEUR(conta.porReceberEmParcelas)}`} />}
            <div style={{height:1,background:"#D8CCBB",margin:"6px 0"}}/>
            <LinhaConta k="=  entra na escritura" v={fmtEUR(conta.naEscritura)} forte />
          </div>
        </div>

        {/* ── A comissão do mediador ──────────────────────────────────────── */}
        <div style={{marginTop:20,borderTop:"1px solid #E7DED2",paddingTop:16}}>
          <div style={{fontSize:13,fontWeight:700,color:"#091C2A",marginBottom:10}}>Comissão do mediador</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              <label style={lbl}>% sobre a venda</label>
              <input type="number" step="0.01" value={f.comissao_pct??""}
                onChange={e=>s("comissao_pct",parseFloat(e.target.value)||0)} style={inp}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              <label style={lbl}>IVA da comissão (%)</label>
              <input type="number" step="0.01" value={f.comissao_taxa_iva??23}
                onChange={e=>s("comissao_taxa_iva",parseFloat(e.target.value)||0)} style={inp}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              <label style={lbl}>Ou valor fixo (€)</label>
              <input type="number" step="0.01" value={f.comissao_valor??""} placeholder="—"
                onChange={e=>s("comissao_valor",parseFloat(e.target.value)||0)} style={inp}/>
            </div>
          </div>
          <div style={{background:"#FAF6F0",borderRadius:9,padding:"10px 13px",fontSize:11.5,marginTop:12}}>
            <LinhaConta k="Comissão" v={fmtEUR(com.base)} />
            <LinhaConta k={`+  IVA a ${com.taxa}%`} v={fmtEUR(com.iva)} />
            <div style={{height:1,background:"#D8CCBB",margin:"6px 0"}}/>
            <LinhaConta k="=  a pagar ao mediador" v={fmtEUR(com.comIva)} forte />
            {com.paga > 0.005 && <LinhaConta k="já pago" v={fmtEUR(com.pagaComIva)} />}
            {com.porPagarComIva > 0.005 && (
              <div style={{fontSize:10.5,color:"#96702A",marginTop:5,lineHeight:1.5}}>
                {fmtEUR(com.porPagarComIva)} são pagos na escritura — é lá que se liquida
                o que faltar ao mediador.
              </div>
            )}
          </div>
        </div>

        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:22}}>
          <button onClick={onClose} style={{background:"#E7DED2",color:"#5C6166",border:"none",padding:"10px 20px",borderRadius:8,fontSize:13,cursor:"pointer"}}>Cancelar</button>
          <button onClick={()=>onSave(f)} style={{background:"#091C2A",color:"#fff",border:"none",padding:"10px 24px",borderRadius:8,fontSize:13,cursor:"pointer",fontWeight:700}}>💾 Guardar</button>
        </div>
      </div>
    </div>
  );
}

// As linhas da tabela levam campos só nossos (_frac, _semVenda) para o modal
// saber de que fração se trata. Esses não existem na base de dados, por isso
// caem aqui antes de gravar.
const limparVenda = (v) => Object.fromEntries(
  Object.entries(v || {}).filter(([k]) => !k.startsWith("_")));

const LinhaConta = ({ k, v, forte }) => (
  <div style={{display:"flex",justifyContent:"space-between",padding:"2px 0"}}>
    <span style={{color:"#7E8388"}}>{k}</span>
    <span style={{fontFamily:"var(--fonte-numero)",fontWeight:forte?700:400,color:"#23292D"}}>{v}</span>
  </div>
);

// ─── TABELA DE VENDAS ──────────────────────────────────────────────────────────
// ─── EXPORTAÇÃO PARA EXCEL ───────────────────────────────────────────────────
let _xlsxLoader = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_xlsxLoader) return _xlsxLoader;
  _xlsxLoader = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    el.onload = () => resolve(window.XLSX);
    el.onerror = () => reject(new Error("Falha a carregar a biblioteca de Excel"));
    document.head.appendChild(el);
  });
  return _xlsxLoader;
}

const FMT_EUR_X = '#,##0.00\\ "€"';
const limparNome = (t) => String(t || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

async function exportarComercialExcel({ linhas, vendaDe, projetoFiltro, statusFiltro }) {
  const XLSX = await loadXLSX();

  // ─ Folha 1: Tabela de vendas (inventário) ─
  const cab = [
    ["TABELA DE VENDAS"],
    ["Projeto", projetoFiltro],
    ["Estado", statusFiltro],
    ["Frações", linhas.length],
    ["Exportado em", new Date().toLocaleString("pt-PT")],
    [],
    ["Projeto", "Fração", "Piso", "Tipologia", "Área (m²)", "Preço", "Venda estimada",
     "Preço/m²", "Status", "Cliente", "Valor venda", "Recebido", "Por receber",
     "Na escritura", "Comissão c/ IVA"],
  ];
  const LINHA_CAB = cab.length;
  const EUROS = [5, 6, 7, 10, 11, 12, 13, 14];

  const dados = linhas.map(f => {
    const v = vendaDe.get(f.id);
    const area = Number(f.area) || 0;
    const preco = Number(f.preco_tabela) || 0;
    // As contas são as mesmas do ecrã e do fluxo — src/vendas.js.
    const conta = v ? contaDaVenda(v, f) : null;
    const com = v ? comissaoDaVenda(v, f) : null;
    return [
      f.projeto || "", f.fracao || "", f.piso || "", f.tipologia || "",
      area, preco, precoDaFracao(f, v), area > 0 ? preco / area : null,
      f.status || "", v?.cliente || "",
      v ? Number(v.valor_venda) || 0 : null,
      conta ? conta.recebido : null,
      conta ? conta.porReceber : null,
      conta ? conta.naEscritura : null,
      com ? com.comIva : null,
    ];
  });

  const soma = (c) => dados.reduce((s, r) => s + (Number(r[c]) || 0), 0);
  const somaArea = soma(4), somaPreco = soma(5);
  const totais = [[], ["TOTAIS", linhas.length, "", "", somaArea, somaPreco, soma(6),
                       somaArea > 0 ? somaPreco / somaArea : null, "", "",
                       soma(10), soma(11), soma(12), soma(13), soma(14)]];

  const ws = XLSX.utils.aoa_to_sheet([...cab, ...dados, ...totais]);
  dados.forEach((_, i) => {
    [4, ...EUROS].forEach(c => {
      const cel = ws[XLSX.utils.encode_cell({ r: LINHA_CAB + i, c })];
      if (cel && cel.t === "n") cel.z = c === 4 ? "#,##0.00" : FMT_EUR_X;
    });
  });
  [4, ...EUROS].forEach(c => {
    const cel = ws[XLSX.utils.encode_cell({ r: LINHA_CAB + dados.length + 1, c })];
    if (cel && cel.t === "n") cel.z = c === 4 ? "#,##0.00" : FMT_EUR_X;
  });
  ws["!cols"] = [{ wch: 34 }, { wch: 9 }, { wch: 7 }, { wch: 12 }, { wch: 11 }, { wch: 15 },
                 { wch: 15 }, { wch: 13 }, { wch: 13 }, { wch: 26 }, { wch: 15 },
                 { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 15 }];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range(
    { r: LINHA_CAB - 1, c: 0 },
    { r: LINHA_CAB + Math.max(dados.length - 1, 0), c: 14 }) };

  // ─ Folha 2: Resumo por estado ─
  const porEstado = {};
  linhas.forEach(f => {
    const k = f.status || "Disponível";
    if (!porEstado[k]) porEstado[k] = { n: 0, area: 0, preco: 0 };
    porEstado[k].n++;
    porEstado[k].area += Number(f.area) || 0;
    porEstado[k].preco += Number(f.preco_tabela) || 0;
  });
  const resumo = [
    ["RESUMO POR ESTADO"], ["Projeto", projetoFiltro], [],
    ["Estado", "Frações", "Área (m²)", "Valor", "% do VGV"],
    ...Object.entries(porEstado).map(([k, v]) => [k, v.n, v.area, v.preco, somaPreco ? v.preco / somaPreco : 0]),
    [], ["TOTAL", linhas.length, somaArea, somaPreco, somaPreco ? 1 : 0],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(resumo);
  for (let r = 4; r < resumo.length; r++) {
    const cp = ws2[XLSX.utils.encode_cell({ r, c: 3 })];
    if (cp && cp.t === "n") cp.z = FMT_EUR_X;
    const cpc = ws2[XLSX.utils.encode_cell({ r, c: 4 })];
    if (cpc && cpc.t === "n") cpc.z = "0.0%";
  }
  ws2["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 11 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tabela de Vendas");
  XLSX.utils.book_append_sheet(wb, ws2, "Resumo por estado");

  const nome = `Comercial_${limparNome(projetoFiltro)}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`;
  XLSX.writeFile(wb, nome, { compression: true });
  return nome;
}

// Célula numérica editável: mostra o número formatado em repouso e o valor
// em bruto enquanto está a ser editada (senão os separadores atrapalham a escrita).
function CelulaNumero({ valor, onGuardar, editavel, formatar, alinhar = "right", estilo = {} }) {
  const [aEditar, setAEditar] = useState(false);
  const [rascunho, setRascunho] = useState("");

  if (!editavel) {
    return <span style={{ fontFamily: "var(--fonte-numero)", ...estilo }}>{formatar(valor)}</span>;
  }

  const base = {
    width: "100%", background: "transparent", border: "1px solid transparent",
    borderRadius: 5, padding: "4px 6px", fontSize: 11, outline: "none",
    textAlign: alinhar, fontFamily: "var(--fonte-numero)", color: "#091C2A", ...estilo,
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
  // Obrigatório escolher um projeto — ver o inventário todo junto não ajuda
  const [filterProj, setFilterProj] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [search, setSearch] = useState("");
  const [editVenda, setEditVenda] = useState(null);
  const [editComissao, setEditComissao] = useState(null);
  const [rascunhos, setRascunhos] = useState({});   // edições por confirmar, por célula

  // Se ainda não há projeto escolhido, assume o primeiro com frações
  useEffect(() => {
    if (!filterProj && fracoes.length) {
      const primeiro = [...new Set(fracoes.map(f => f.projeto).filter(Boolean))][0];
      if (primeiro) setFilterProj(primeiro);
    }
  }, [fracoes, filterProj]);

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
    (f.projeto === filterProj) &&
    (filterStatus === "Todos" || f.status === filterStatus) &&
    (!search || (f.fracao || "").toLowerCase().includes(search.toLowerCase())
             || (f.tipologia || "").toLowerCase().includes(search.toLowerCase())
             || (vendaDe.get(f.id)?.cliente || "").toLowerCase().includes(search.toLowerCase()))
  ), [fracoes, filterProj, filterStatus, search, vendaDe]);

  const totais = useMemo(() => {
    const area = rows.reduce((s, f) => s + (Number(f.area) || 0), 0);
    const preco = rows.reduce((s, f) => s + (Number(f.preco_tabela) || 0), 0);
    // O que se espera encaixar: cada fração pelo melhor número que há sobre
    // ela — o valor da venda, a estimativa, ou o preço de tabela (src/vendas.js).
    const vendaEstimada = rows.reduce(
      (s, f) => s + precoDaFracao(f, vendaDe.get(f.id)), 0);
    return { area, preco, vendaEstimada, precoM2: area > 0 ? preco / area : 0 };
  }, [rows, vendaDe]);

  // Guarda uma célula na base de dados
  const guardar = async (frac, campo, valor) => {
    const numerico = campo === "area" || campo === "preco_tabela";
    const v = numerico ? parseNumero(valor) : valor;
    if ((frac[campo] ?? "") === v) return;
    const res = await onUpsertFracao?.({ ...frac, [campo]: v });
    if (res?.error) alert("Não foi possível guardar:\n\n" + (res.error.message || res.error));
  };

  // Alterar o estado da fração (dropdown na tabela)
  const alterarStatus = async (frac, novo) => {
    const res = await onUpsertFracao?.({ ...frac, status: novo });
    if (res?.error) alert("Não foi possível alterar o estado:\n\n" + (res.error.message || res.error));
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

  const [exportando, setExportando] = useState(false);
  const handleExportar = async () => {
    if (!rows.length) { alert("Não há frações para exportar."); return; }
    setExportando(true);
    try {
      await exportarComercialExcel({
        linhas: rows, vendaDe,
        projetoFiltro: filterProj, statusFiltro: filterStatus,
      });
    } catch (e) {
      alert("Não foi possível exportar: " + (e?.message || e));
    } finally { setExportando(false); }
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
    fontFamily: "inherit", color: "#091C2A", ...extra,
  });
  const foco = (e) => { e.target.style.background = "#fff"; e.target.style.borderColor = "#c7d2e5"; };
  const desfoco = (e) => { e.target.style.background = "transparent"; e.target.style.borderColor = "transparent"; };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar fração, tipologia ou cliente..."
          style={{ flex: "2 1 260px", background: "#fff", border: "1px solid #EFE8DE", borderRadius: 10, padding: "10px 14px", fontSize: 13, outline: "none" }} />
        <select value={filterProj} onChange={e => setFilterProj(e.target.value)}
          style={{ flex: "1 1 200px", background: "#fff", border: "1px solid #EFE8DE", borderRadius: 10, padding: "10px 14px", fontSize: 13, outline: "none" }}>
          {!filterProj && <option value="">— escolhe um projeto —</option>}
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
          style={{ flex: "1 1 150px", background: "#fff", border: "1px solid #EFE8DE", borderRadius: 10, padding: "10px 14px", fontSize: 13, outline: "none" }}>
          {["Todos", ...STATUS_OPTIONS].map(s => <option key={s}>{s}</option>)}
        </select>
        <button onClick={handleExportar} disabled={exportando}
          title="Exportar para Excel o que está filtrado"
          style={{ background: exportando ? "#E3D9CC" : "#091C2A", color: exportando ? "#8E9398" : "#fff", border: "none", padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: exportando ? "default" : "pointer", whiteSpace: "nowrap" }}>
          {exportando ? "A gerar..." : "⬇ Excel"}
        </button>
        {canEdit && (
          <button onClick={novaFracao}
            style={{ background: "#091C2A", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            + Nova fração
          </button>
        )}
      </div>

      {canEdit && rows.length > 0 && (
        <div style={{ fontSize: 11, color: "#9DA2A6" }}>
          Clica numa célula para editar. As alterações são guardadas ao sair do campo.
        </div>
      )}

      {/* Tabela */}
      <div style={{ background: "#fff", border: "1px solid #E7DED2", borderRadius: 14, overflow: "hidden", maxWidth: 1180 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "15%" }} />{/* Projeto   */}
              <col style={{ width: "7%"  }} />{/* Fração    */}
              <col style={{ width: "6%"  }} />{/* Piso      */}
              <col style={{ width: "9%"  }} />{/* Tipologia */}
              <col style={{ width: "9%"  }} />{/* Área      */}
              <col style={{ width: "11%" }} />{/* Preço     */}
              <col style={{ width: "11%" }} />{/* Venda est.*/}
              <col style={{ width: "9%"  }} />{/* Preço/m²  */}
              <col style={{ width: "9%"  }} />{/* Status    */}
              <col style={{ width: "11%" }} />{/* Cliente   */}
              <col style={{ width: "7%"  }} />{/* Ações     */}
            </colgroup>
            <thead>
              <tr style={{ background: "#FAF6F0" }}>
                {[["Projeto","left"],["Fração","center"],["Piso","center"],["Tipologia","center"],
                  ["Área (m²)","right"],["Preço","right"],["Venda estimada","right"],["Preço/m²","right"],
                  ["Status","center"],["Cliente","left"],["Ações","center"]].map(([h,al]) => (
                  <th key={h} style={{ padding: "9px 8px", textAlign: al, color: "#9DA2A6", fontSize: 9, letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "var(--fonte-numero)", borderBottom: "1px solid #E7DED2", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0
                ? <tr><td colSpan={11} style={{ padding: 40, textAlign: "center", color: "#C4C7CA" }}>
                    {filterProj ? "Nenhuma fração encontrada neste projeto." : "Escolhe um projeto no seletor acima."}
                  </td></tr>
                : rows.map(f => {
                  const venda = vendaDe.get(f.id);
                  const area = Number(f.area) || 0;
                  const preco = Number(f.preco_tabela) || 0;
                  const precoM2 = area > 0 ? preco / area : 0;
                  return (
                    <tr key={f.id} style={{ borderBottom: "1px solid #FBF7F1" }}>
                      <td style={{ padding: "6px 8px", color: "#7E8388", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.projeto}>{f.projeto || "—"}</td>

                      <td style={{ padding: "4px 4px", textAlign: "center" }}>
                        {canEdit
                          ? <input value={valorCelula(f, "fracao")} onFocus={foco} onBlur={e => { desfoco(e); confirmar(f, "fracao"); }}
                              onChange={e => escrever(f, "fracao", e.target.value)}
                              style={inputCelula({ fontWeight: 700, textAlign: "center" })} />
                          : <span style={{ fontWeight: 700, color: "#091C2A" }}>{f.fracao || "—"}</span>}
                      </td>

                      <td style={{ padding: "4px 4px", textAlign: "center" }}>
                        {canEdit
                          ? <input value={valorCelula(f, "piso")} onFocus={foco} onBlur={e => { desfoco(e); confirmar(f, "piso"); }}
                              onChange={e => escrever(f, "piso", e.target.value)}
                              style={inputCelula({ color: "#5C6166", textAlign: "center" })} />
                          : <span style={{ color: "#5C6166" }}>{f.piso || "—"}</span>}
                      </td>

                      <td style={{ padding: "4px 4px", textAlign: "center" }}>
                        {canEdit
                          ? <input value={valorCelula(f, "tipologia")} onFocus={foco} onBlur={e => { desfoco(e); confirmar(f, "tipologia"); }}
                              onChange={e => escrever(f, "tipologia", e.target.value)}
                              style={inputCelula({ color: "#2C4A63", textAlign: "center" })} />
                          : <span style={{ background: "#EDF1F5", color: "#2C4A63", fontSize: 9, padding: "1px 6px", borderRadius: 4 }}>{f.tipologia || "—"}</span>}
                      </td>

                      <td style={{ padding: "4px 8px", textAlign: "right" }}>
                        <CelulaNumero valor={area} editavel={canEdit} formatar={v => fmtNum(v)}
                          onGuardar={async v => { const r = await onUpsertFracao?.({ ...f, area: v }); if (r?.error) alert("Não foi possível guardar a área."); }}
                          estilo={{ color: "#5C6166" }} />
                      </td>

                      <td style={{ padding: "4px 8px", textAlign: "right" }}>
                        <CelulaNumero valor={preco} editavel={canEdit} formatar={v => fmt(v)}
                          onGuardar={async v => { const r = await onUpsertFracao?.({ ...f, preco_tabela: v }); if (r?.error) alert("Não foi possível guardar o preço."); }}
                          estilo={{ fontWeight: 700 }} />
                      </td>

                      {/* O que se espera encaixar nesta fração. Numa fração já
                          vendida mostra-se o valor da venda, apagado: o que
                          vale é o negócio feito, não a estimativa. */}
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>
                        {venda && Number(venda.valor_venda) > 0 ? (
                          <span title="Já vendida — vale o valor da venda"
                                style={{ fontFamily: "var(--fonte-numero)", color: "#9DA2A6" }}>
                            {fmt(Number(venda.valor_venda))}
                          </span>
                        ) : (
                          <CelulaNumero valor={Number(f.venda_estimada) || 0} editavel={canEdit}
                            formatar={v => (v > 0 ? fmt(v) : "—")}
                            onGuardar={async v => { const r = await onUpsertFracao?.({ ...f, venda_estimada: v });
                              if (r?.error) alert("Não foi possível guardar a venda estimada."); }}
                            estilo={{ color: (Number(f.venda_estimada) || 0) > 0 ? "#1F3A52" : "#C4C7CA" }} />
                        )}
                      </td>

                      {/* Calculado a partir da área e do preço */}
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--fonte-numero)", color: "#7E8388", whiteSpace: "nowrap" }}
                          title="Calculado: preço ÷ área">
                        {area > 0 ? fmt(precoM2) : "—"}
                      </td>

                      <td style={{ padding: "6px 4px", textAlign: "center" }}>
                        <select value={f.status || "Disponível"} disabled={!canEdit}
                          onChange={e => alterarStatus(f, e.target.value)}
                          style={{ background: "none", border: "none", fontSize: 10, cursor: canEdit ? "pointer" : "default", color: STATUS_STYLES[f.status]?.text || "#7E8388", fontWeight: 600, outline: "none" }}>
                          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </td>

                      <td style={{ padding: "6px 8px", color: "#23292D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={venda?.cliente || ""}>
                        {venda?.cliente || "—"}
                      </td>

                      <td style={{ padding: "6px 4px" }}>
                        <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "center" }}>
                          {canEdit && <>
                            <button onClick={() => setEditVenda(venda ? { ...venda, _frac: f } : { _frac: f, _semVenda: true, fracao_id: f.id, preco_tabela: f.preco_tabela })}
                              title={venda ? "Editar venda" : "Registar venda"}
                              style={{ background: venda ? "#EDF1F5" : "#EFF5F1", border: "none", color: venda ? "#2C4A63" : "#1F7A54", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", fontWeight: 600 }}>
                              {venda ? "✎" : "+"}
                            </button>
                            {venda && (
                              <button onClick={() => setEditComissao({ ...venda, _frac: f })} title="Editar comissão"
                                style={{ background: "#FBF6EC", border: "1px solid #E3CE9F", color: "#A8762F", padding: "3px 7px", borderRadius: 5, fontSize: 10, cursor: "pointer", fontWeight: 600 }}>🤝</button>
                            )}
                            <button onClick={() => apagarFracao(f)} title="Apagar fração"
                              style={{ background: "#FBEDEB", border: "none", color: "#A93226", padding: "3px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>✕</button>
                          </>}
                          {venda?.fatura_criada && <span style={{ fontSize: 9, color: "#1F7A54", border: "1px solid #C9E3D5", background: "#EFF5F1", padding: "2px 5px", borderRadius: 4, fontFamily: "var(--fonte-numero)" }}>✓Fat.</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ background: "#EDF1F5", borderTop: "2px solid #dde3f0" }}>
                  <td colSpan={4} style={{ padding: "10px 8px", fontSize: 10, color: "#2C4A63", fontWeight: 700, whiteSpace: "nowrap" }}>
                    TOTAIS ({fmtNum(rows.length, 0)} {rows.length === 1 ? "fração" : "frações"})
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "var(--fonte-numero)", fontWeight: 700, color: "#5C6166" }}>{fmtNum(totais.area)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "var(--fonte-numero)", fontWeight: 700, color: "#091C2A" }}>{fmt(totais.preco)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "var(--fonte-numero)", fontWeight: 700, color: "#1F3A52" }}
                      title="O que se espera encaixar: as vendidas pelo valor da venda, as outras pela estimativa (ou pelo preço de tabela, na falta dela)">
                    {fmt(totais.vendaEstimada)}
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "var(--fonte-numero)", fontWeight: 700, color: "#7E8388" }} title="Média ponderada">
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
        onSave={bruto => {
          const u = limparVenda(bruto);
          if (editVenda._semVenda) {
            const f = editVenda._frac;
            onUpsertVenda?.({
              ...u,
              id: "v_" + f.id + "_" + Date.now().toString(36),
              fracao_id: f.id, projeto: f.projeto, fracao: f.fracao,
              preco_tabela: u.preco_tabela ?? f.preco_tabela,
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
export default function ComercialView({ currentUser, onAddFatura, empresasVisiveis }) {
  // Um investidor só vê os projetos que lhe foram atribuídos. A base de dados já
  // filtra as linhas por RLS; aqui filtra-se também a lista de projetos, para os
  // nomes dos outros nem aparecerem no seletor.
  // Atenção: uma lista VAZIA é uma restrição válida (investidor sem projetos
  // atribuídos não vê nada). Só se a prop não vier de todo é que se usa tudo.
  const empresas = Array.isArray(empresasVisiveis) ? empresasVisiveis : EMPRESAS;
  const projetosPermitidos = empresas.map(e => e.nome);
  const limitado = Array.isArray(empresasVisiveis) && empresasVisiveis.length < EMPRESAS.length;

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
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: "var(--fonte-titulo)" }}>
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
    </div>
  );
}
