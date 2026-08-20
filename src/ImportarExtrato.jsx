import { useState, useRef } from "react";
import { CATEGORIAS } from "./categorias.js";
import { supabase } from "./supabase.js";
import { EMPRESAS_IMPORT, buildContaId as buildContaIdCfg } from "./empresas.js";

// Constrói o conta_id seguindo a mesma convenção do App.jsx
function buildContaId(empresaId, bancoNome) {
  if (!empresaId || !bancoNome) return null;
  return buildContaIdCfg(empresaId, bancoNome);
}

// Lista de empresas + bancos — ver src/empresas.js
const EMPRESAS = EMPRESAS_IMPORT;


function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Parse Excel/CSV using SheetJS via CDN (loaded dynamically)
async function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // Use simple CSV/text parsing for xlsx
        const data = e.target.result;
        
        // Try to load XLSX library
        if (!window.XLSX) {
          await new Promise((res, rej) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            script.onload = res;
            script.onerror = rej;
            document.head.appendChild(script);
          });
        }
        
        const workbook = window.XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        // raw:true preserves numeric values exactly (no string conversion that loses precision)
        const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: null });
        
        resolve(rows);
      } catch(err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── Parser unificado para XLSX/XLS/CSV/PDF ──────────────────────────────
// Devolve sempre `rows: any[][]` que depois é entregue a `parseMovimentos`.

function parseCSVText(text) {
  if (!text) return [];
  text = text.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const counts = {
    ";": (firstLine.match(/;/g) || []).length,
    ",": (firstLine.match(/,/g) || []).length,
    "\t": (firstLine.match(/\t/g) || []).length,
  };
  const sep = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  const rows = [];
  for (const line of lines) {
    const cells = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuote = false;
        else cur += ch;
      } else {
        if (ch === '"') inQuote = true;
        else if (ch === sep) { cells.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    cells.push(cur);
    rows.push(cells.map(c => c.trim()));
  }
  return rows;
}

async function readTextWithFallback(file) {
  const buf = await file.arrayBuffer();
  for (const enc of ["utf-8", "latin1", "utf-16le"]) {
    try {
      const dec = new TextDecoder(enc, { fatal: true });
      const text = dec.decode(buf);
      if (text.includes("\uFFFD")) continue;
      return text;
    } catch { /* try next */ }
  }
  return new TextDecoder("latin1").decode(buf);
}

async function parsePDFText(file) {
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = res;
      script.onerror = rej;
      document.head.appendChild(script);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const buckets = {};
    content.items.forEach(it => {
      if (!it.str || !it.str.trim()) return;
      const y = Math.round(it.transform[5]);
      let key = null;
      for (const k of Object.keys(buckets)) {
        if (Math.abs(parseInt(k) - y) <= 2) { key = k; break; }
      }
      if (!key) key = String(y);
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push({ x: it.transform[4], str: it.str });
    });
    Object.keys(buckets)
      .sort((a, b) => parseFloat(b) - parseFloat(a))
      .forEach(k => {
        const sorted = buckets[k].sort((a, b) => a.x - b.x);
        lines.push(sorted.map(s => s.str).join("  "));
      });
  }
  return lines;
}

function parseRevolutPDF(lines) {
  const rows = [["Data", "Descrição", "Valor", "Saldo"]];
  const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
  const dateRe = /^(\d{1,2})\s+([a-z]{3})\.?\s+(\d{4})\b/i;
  const moneyRe = /€\s*([\d\s.]+(?:[.,]\d{2})?)/g;

  let current = null;
  const flush = () => {
    if (!current) return;
    const fullText = current.textLines.join(" ");
    const matches = [...fullText.matchAll(moneyRe)];
    const nums = matches.map(m => parseFloat(m[1].replace(/\s/g, "").replace(",", "."))).filter(n => !isNaN(n));
    const saldo = nums[nums.length - 1] ?? 0;
    const valorAbs = nums.length >= 2 ? nums[nums.length - 2] : 0;
    let valor = valorAbs;
    const upper = fullText.toUpperCase();
    if (/\bMOA\b|\bMOR\b|RECEBI|ADICIONAD|ENTRADA|CRÉDIT/.test(upper)) valor = +valorAbs;
    else if (/\bMOS\b|\bFEE\b|\bATM\b|\bCAR\b|TAXA|SAÍDA|DÉBIT|PARA /.test(upper)) valor = -valorAbs;
    const desc = fullText.replace(moneyRe, " ").replace(/\s+/g, " ").trim().substring(0, 200);
    rows.push([current.dataISO, desc, valor, saldo]);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (/^(Tipos de transação|Resumo do saldo|Transações de|Extrato da conta|Relatar perda|© \d{4}|Page |Nome da conta|Moeda|^IBAN|^BIC|Saldo inicial|Saldo de fechamento|Saídas\s+Entradas|^Tipo\b|^\d+\/\d+$)/i.test(line)) continue;

    const m = line.match(dateRe);
    if (m) {
      flush();
      const dia = parseInt(m[1]);
      const mes = MESES[m[2].toLowerCase().replace(".", "")] || null;
      const ano = parseInt(m[3]);
      current = {
        dataISO: mes ? `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}` : "",
        textLines: [line.slice(m[0].length).trim()],
      };
    } else if (current) {
      current.textLines.push(line);
    }
  }
  flush();
  return rows;
}

async function parseAnyFile(file) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".pdf")) {
    const lines = await parsePDFText(file);
    return { rows: parseRevolutPDF(lines), preParsedRevolut: true };
  }
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const text = await readTextWithFallback(file);
    return { rows: parseCSVText(text) };
  }
  return { rows: await parseExcelFile(file) };
}

function parseMovimentos(rows) {
  if (!rows || rows.length < 2) return [];

  // Find header row — BNI has "Nº conta" in row 1, header in row 2
  let headerRow = 0;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const cells = (rows[i] || []).map(c => (c||'').toString().toLowerCase().trim());
    const hasData  = cells.some(c => c.includes('data') || c === 'date');
    const hasDesc  = cells.some(c => c.includes('descri') || c.includes('histor'));
    const hasVal   = cells.some(c => c === 'valor' || c === 'montante' || c.includes('débit') || c.includes('crédit'));
    if (hasData && (hasDesc || hasVal)) { headerRow = i; break; }
  }

  const headers = (rows[headerRow] || []).map(h => (h||'').toString().toLowerCase().trim());
  console.log('Header row:', headerRow, '| Headers:', headers);

  // Column detection
  // Aceita "Data Operação" (Banco Invest), "Data Lançamento" (BCP), "Data Mov." (BNI), "Data Valor", "Data"
  const dataCol  = headers.findIndex(h =>
    h === 'data lançamento' || h === 'data lancamento' || h === 'data movimento' ||
    h === 'data operação' || h === 'data operacao' ||
    h === 'data mov.' || h === 'data' ||
    h.startsWith('data l') || h.startsWith('data m') || h.startsWith('data o') || h.startsWith('data v'));
  const descCol  = headers.findIndex(h => h.includes('descri') || h.includes('histor'));
  const valCol   = headers.findIndex(h => h === 'valor' || h === 'montante' || h === 'débito/crédito' || h === 'debito/credito');
  const saldoCol = headers.findIndex(h => h.includes('saldo'));
  const debCol   = headers.findIndex(h => (h.includes('débit') || h.includes('debit')) && !h.includes('crédit') && !h.includes('credit'));
  const credCol  = headers.findIndex(h => (h.includes('crédit') || h.includes('credit')) && !h.includes('débit') && !h.includes('debit'));
  const obsCol   = headers.findIndex(h => h === 'notas' || h.includes('observ') || h.includes('detalhe'));

  // Parse PT number format: "346.267,06" → 346267.06, "-1,19" → -1.19
  const safeFloat = (v) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    let s = v.toString().trim().replace(/[€$£\s]/g, '');
    // PT: dot=thousands, comma=decimal: "346.267,06"
    if (s.includes('.') && s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',') && !s.includes('.')) {
      s = s.replace(',', '.');
    }
    const f = parseFloat(s);
    return isNaN(f) ? null : f;
  };

  const normalizeDate = (v) => {
    if (v == null || v === '') return '';
    if (v instanceof Date) {
      return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
    }
    if (typeof v === 'number' && v > 40000) {
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    }
    const s = v.toString().trim();
    // YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
    // YYYYMMDD (CGD)
    if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    // DD/MM/YYYY or DD-MM-YYYY
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(s)) {
      const sep = s.includes('/') ? '/' : '-';
      const [d, m, y] = s.split(sep);
      return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    return s.substring(0, 10);
  };

  const movimentos = [];

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.every(c => c == null || c === '')) continue;

    const data = normalizeDate(dataCol >= 0 ? row[dataCol] : null);
    if (!data || data < '2015-01-01' || data > '2035-12-31') continue;

    const desc = descCol >= 0 ? (row[descCol]||'').toString().trim() : '';
    if (!desc || ['descrição','descrição','historial','nan','null','undefined'].includes(desc.toLowerCase())) continue;

    let valor = null;
    if (valCol >= 0) {
      valor = safeFloat(row[valCol]);
    } else if (debCol >= 0 || credCol >= 0) {
      const debRaw  = debCol  >= 0 ? safeFloat(row[debCol])  : null;
      const credRaw = credCol >= 0 ? safeFloat(row[credCol]) : null;
      // Banco Invest preenche a coluna que não se aplica com 0 (não com vazio) — tratamos 0 como ausente.
      const deb  = (debRaw  == null || debRaw  === 0) ? null : debRaw;
      const cred = (credRaw == null || credRaw === 0) ? null : credRaw;
      if (cred != null && deb == null) {
        valor = Math.abs(cred);                  // entrada → positivo
      } else if (deb != null && cred == null) {
        valor = -Math.abs(deb);                  // débito = saída → negativo
      } else if (cred != null && deb != null) {
        // Caso raro com ambos preenchidos — saldo líquido
        valor = Math.abs(cred) - Math.abs(deb);
      }
    }
    if (valor == null) continue;

    const saldo = saldoCol >= 0 ? (safeFloat(row[saldoCol]) ?? 0) : 0;
    const obs   = obsCol   >= 0 && row[obsCol] ? row[obsCol].toString().trim() : '';

    movimentos.push({
      data,
      movimento: desc,
      valor:  Math.round(valor * 100) / 100,
      saldo:  Math.round(saldo * 100) / 100,
      categoria: '',
      detalhes: ['nan','none','não','nao'].includes((obs||'').toLowerCase()) ? '' : obs,
    });
  }

  // BCP & BNI export newest-first → first item is most recent → correct order for display
  console.log(`Parsed ${movimentos.length} movements`);
  return movimentos;
}


const fmt = (v) => new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0) + " €";

export default function ImportarExtrato({ onSaveMovimentos, onGoToExtrato }) {
  const [step, setStep] = useState(0);
  const [empresa, setEmpresa] = useState(null);
  const [banco, setBanco] = useState("");
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [movimentos, setMovimentos] = useState([]);
  const [erro, setErro] = useState("");
  const [saveResult, setSaveResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const empObj = EMPRESAS.find(e => e.id === empresa?.id);

  const handleFile = (f) => { setFile(f); setErro(""); };

  const handleParse = async () => {
    if (!file) return;
    setLoading(true);
    setErro("");
    try {
      let movs = [];
      const name = file.name.toLowerCase();
      if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.pdf')) {
        const { rows, preParsedRevolut } = await parseAnyFile(file);
        if (preParsedRevolut) {
          // PDF Revolut já vem com cabeçalho ["Data","Descrição","Valor","Saldo"]
          movs = parseMovimentos(rows);
        } else {
          movs = parseMovimentos(rows);
        }
      } else {
        throw new Error("Formato não suportado. Usa Excel (.xlsx), CSV ou PDF (Revolut).");
      }
      
      if (movs.length === 0) {
        throw new Error("Não foi possível ler movimentos. Verifica o formato do ficheiro ou se a aba/cabeçalho são reconhecíveis.");
      }

      // ─── Detetar duplicados em relação ao que já está no Supabase para esta conta
      // Chave usada na deduplicação: data + movimento + valor + saldo (mesma que o saveMovimentos)
      let existingKeys = new Set();
      const contaId = buildContaId(empresa?.id, banco);
      if (contaId) {
        try {
          // Para contas com muitos movimentos paginamos. Limite alto: cobre +30k movs.
          let all = [], from = 0;
          while (true) {
            const { data, error } = await supabase
              .from('movimentos')
              .select('data, movimento, valor, saldo')
              .eq('conta_id', contaId)
              .range(from, from + 999);
            if (error) {
              console.warn("Falha ao buscar movimentos existentes para dedupe:", error.message);
              break;
            }
            if (!data?.length) break;
            all = all.concat(data);
            if (data.length < 1000) break;
            from += 1000;
          }
          existingKeys = new Set(all.map(m => `${m.data}_${m.movimento}_${m.valor}_${m.saldo}`));
        } catch (e) {
          console.warn("Erro a verificar duplicados:", e);
        }
      }

      // Aprovar apenas os NOVOS por defeito. Duplicados ficam visíveis mas desmarcados.
      const tagged = movs.map((m, i) => {
        const key = `${m.data}_${m.movimento}_${m.valor}_${m.saldo}`;
        const jaExiste = existingKeys.has(key);
        return {
          ...m,
          id: `imp_${i}`,
          aprovado: !jaExiste,
          catEditada: m.categoria || "",
          _jaExiste: jaExiste,
        };
      });
      setMovimentos(tagged);
      setStep(2);
    } catch(e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  };

  const updateCat = (id, cat) => setMovimentos(ms => ms.map(m => m.id === id ? { ...m, catEditada: cat } : m));
  const toggleAprov = (id) => setMovimentos(ms => ms.map(m => m.id === id ? { ...m, aprovado: !m.aprovado } : m));
  // "Aprovar todos os novos" — não toca nos duplicados (que ficam desmarcados)
  const aprovarTodos = () => setMovimentos(ms => ms.map(m => m._jaExiste ? m : { ...m, aprovado: true }));

  const aprovados = movimentos.filter(m => m.aprovado);
  const duplicados = movimentos.filter(m => m._jaExiste);
  const novos = movimentos.filter(m => !m._jaExiste);
  const [esconderDuplicados, setEsconderDuplicados] = useState(false);
  const movimentosVisiveis = esconderDuplicados ? movimentos.filter(m => !m._jaExiste) : movimentos;

  const handleSave = async () => {
    const toSave = aprovados.map(m => ({ ...m, categoria: m.catEditada || m.categoria }));
    setSaving(true);
    try {
      const result = await onSaveMovimentos?.({ empresa: empresa.id, banco, movimentos: toSave });
      setSaveResult(result || { ok: true, inserted: toSave.length, skipped: 0, error: "" });
    } catch (e) {
      setSaveResult({ ok: false, inserted: 0, skipped: 0, error: e?.message || String(e) });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setStep(0); setFile(null); setMovimentos([]); setErro(""); setSaveResult(null);
    setEmpresa(null); setBanco("");
  };

  // ── Step 0: Empresa & Banco ────────────────────────────────────────────────
  if (step === 0) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", fontFamily: "Georgia,serif", marginBottom: 4 }}>📄 Importar Extrato Bancário</div>
        <div style={{ fontSize: 13, color: "#888" }}>Seleciona a empresa e o banco, faz upload do extrato (Excel, CSV ou PDF Revolut) e os movimentos são adicionados ao Caixa Único.</div>
      </div>

      <div>
        <label style={{ fontSize: 11, color: "#888", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 10 }}>Empresa (SPV)</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
          {EMPRESAS.map(e => (
            <div key={e.id} onClick={() => { setEmpresa(e); setBanco(""); }}
              style={{ background: empresa?.id === e.id ? "#1a1a2e" : "#fff", border: `2px solid ${empresa?.id === e.id ? "#1a1a2e" : "#eee"}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", transition: "all 0.15s" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: empresa?.id === e.id ? "#6B7C93" : "#1a1a2e" }}>{e.nome}</div>
              <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                {e.contas.map(b => <span key={b} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: empresa?.id === e.id ? "#ffffff22" : "#f0f0f0", color: empresa?.id === e.id ? "#ddd" : "#888", fontFamily: "monospace" }}>{b}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {empresa && (
        <div>
          <label style={{ fontSize: 11, color: "#888", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 10 }}>Conta Bancária</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {empObj?.contas.map(b => (
              <button key={b} onClick={() => setBanco(b)}
                style={{ background: banco === b ? "#1a1a2e" : "#fff", color: banco === b ? "#6B7C93" : "#666", border: `2px solid ${banco === b ? "#1a1a2e" : "#eee"}`, padding: "8px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: banco === b ? 700 : 400 }}>
                {b}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => setStep(1)} disabled={!empresa || !banco}
          style={{ background: empresa && banco ? "#1a1a2e" : "#e0e0e0", color: empresa && banco ? "#fff" : "#aaa", border: "none", padding: "12px 32px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: empresa && banco ? "pointer" : "default" }}>
          Continuar →
        </button>
      </div>
    </div>
  );

  // ── Step 1: Upload ─────────────────────────────────────────────────────────
  if (step === 1) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: "#f8f9fc", borderRadius: 10, padding: "12px 16px", display: "flex", gap: 16, alignItems: "center" }}>
        <div><span style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace" }}>EMPRESA</span><div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{empresa?.nome}</div></div>
        <div style={{ width: 1, height: 32, background: "#e0e0e0" }} />
        <div><span style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace" }}>BANCO</span><div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{banco}</div></div>
        <button onClick={() => setStep(0)} style={{ marginLeft: "auto", background: "none", border: "1px solid #eee", borderRadius: 6, padding: "4px 12px", fontSize: 11, color: "#aaa", cursor: "pointer" }}>Alterar</button>
      </div>

      <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${dragging ? "#1a1a2e" : file ? "#16a34a" : "#ddd"}`, borderRadius: 16, padding: "52px 24px", textAlign: "center", cursor: "pointer", background: file ? "#f0fdf4" : "#fafafa", transition: "all 0.2s" }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt,.pdf" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
        {file ? (
          <>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#16a34a" }}>{file.name}</div>
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB · Clica para trocar</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 48, marginBottom: 14 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", marginBottom: 8 }}>Arrasta o extrato aqui</div>
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 14 }}>ou clica para selecionar</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {["Excel (.xlsx)", "CSV", "PDF (Revolut)"].map(f => <span key={f} style={{ background: "#fff", border: "1px solid #e0e0e0", color: "#888", fontSize: 11, padding: "4px 12px", borderRadius: 20, fontFamily: "monospace" }}>{f}</span>)}
            </div>
          </>
        )}
      </div>

      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ fontSize: 12, color: "#92400e", fontWeight: 600, marginBottom: 4 }}>💡 Formatos reconhecidos automaticamente</div>
        <div style={{ fontSize: 11, color: "#a16207", lineHeight: 1.7 }}>
          • <strong>BCP Millennium</strong> (.xlsx) — Data Lançamento, Descrição, Montante, Saldo<br/>
          • <strong>BNI</strong> (.xlsx) — Data movimento, Descrição, Valor, Saldo<br/>
          • <strong>Banco Invest</strong> (.xlsx) — Data Operação, Descrição, Débito, Crédito, Saldo<br/>
          • <strong>CGD</strong> (.csv) — Data (YYYYMMDD), Descrição, Montante, Saldo<br/>
          • <strong>Revolut</strong> (.pdf) — Extrato de conta gerado pela app
        </div>
      </div>

      {erro && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", color: "#dc2626", fontSize: 13 }}>⚠️ {erro}</div>}

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button onClick={() => setStep(0)} style={{ background: "none", border: "1px solid #eee", padding: "12px 24px", borderRadius: 10, fontSize: 14, color: "#888", cursor: "pointer" }}>← Voltar</button>
        <button onClick={handleParse} disabled={!file || loading}
          style={{ background: file && !loading ? "#1a1a2e" : "#e0e0e0", color: file && !loading ? "#fff" : "#aaa", border: "none", padding: "12px 32px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: file && !loading ? "pointer" : "default", display: "flex", alignItems: "center", gap: 10 }}>
          {loading ? "A processar..." : "📊 Processar Extrato →"}
        </button>
      </div>
    </div>
  );

  // ── Step 2: Revisão ────────────────────────────────────────────────────────
  if (step === 2 && !saveResult) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e", fontFamily: "Georgia,serif" }}>Rever Movimentos</div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
              {empresa?.nome} · {banco} · {movimentos.length} movimentos lidos
              {duplicados.length > 0 && (
                <span style={{ color: "#92400e", fontWeight: 600, marginLeft: 6 }}>
                  · {duplicados.length} já existem no extrato (desmarcados)
                </span>
              )}
            </div>
          </div>
          <button onClick={reset} style={{ background: "none", border: "1px solid #eee", padding: "7px 16px", borderRadius: 8, fontSize: 12, color: "#888", cursor: "pointer" }}>← Novo upload</button>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
          {[
            { label: "Total lidos", value: movimentos.length, color: "#1a1a2e", fmt: v => v },
            { label: "Novos", value: novos.length, color: "#16a34a", fmt: v => v },
            { label: "Já existentes", value: duplicados.length, color: "#92400e", fmt: v => v },
            { label: "Entradas (novos)", value: aprovados.filter(m => m.valor > 0).reduce((s, m) => s + m.valor, 0), color: "#16a34a", fmt: fmt },
            { label: "Saídas (novos)", value: Math.abs(aprovados.filter(m => m.valor < 0).reduce((s, m) => s + m.valor, 0)), color: "#dc2626", fmt: fmt },
          ].map((k, i) => (
            <div key={i} style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 10, padding: "12px 16px", borderTop: `3px solid ${k.color}` }}>
              <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontFamily: "monospace" }}>{k.fmt(k.value)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, color: "#888" }}>
            Verifica e ajusta as categorias antes de guardar
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {duplicados.length > 0 && (
              <button onClick={() => setEsconderDuplicados(v => !v)}
                title={esconderDuplicados ? "Mostrar movimentos já existentes (cinzentos)" : "Esconder movimentos já existentes"}
                style={{ background: esconderDuplicados ? "#1a1a2e" : "#fff", border: "1px solid #e5e5e5", color: esconderDuplicados ? "#fff" : "#666", padding: "7px 14px", borderRadius: 8, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                {esconderDuplicados ? "👁️ Mostrar todos" : "🙈 Esconder duplicados"}
              </button>
            )}
            <button onClick={aprovarTodos} style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a", padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>✓ Aprovar todos os novos</button>
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8f9fc" }}>
                  {["✓", "Data", "Descrição", "Valor", "Saldo", "Categoria", "Observação", "Estado"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#aaa", fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "monospace", borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movimentosVisiveis.map((m, i) => {
                  const dup = m._jaExiste;
                  const rowBg = dup ? "#f3f4f6" : (m.aprovado ? "" : "#fff8f8");
                  const rowOpacity = dup ? 0.65 : 1;
                  return (
                  <tr key={m.id} style={{ borderBottom: "1px solid #fafafa", background: rowBg, opacity: rowOpacity }}>
                    <td style={{ padding: "9px 12px" }}>
                      <input type="checkbox" checked={m.aprovado} onChange={() => toggleAprov(m.id)} style={{ cursor: "pointer", width: 16, height: 16 }} />
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <input type="date" value={m.data||""} onChange={e=>setMovimentos(ms=>ms.map(mv=>mv.id===m.id?{...mv,data:e.target.value}:mv))}
                        style={{background:"#f8f8f8",border:"1px solid #eee",borderRadius:6,padding:"4px 7px",fontSize:11,outline:"none",fontFamily:"monospace",width:"115px"}}/>
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <input type="text" value={m.movimento||""} onChange={e=>setMovimentos(ms=>ms.map(mv=>mv.id===m.id?{...mv,movimento:e.target.value}:mv))}
                        style={{background:"#f8f8f8",border:"1px solid #eee",borderRadius:6,padding:"4px 7px",fontSize:11,outline:"none",width:"200px"}}/>
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <input type="number" value={m.valor||0} onChange={e=>setMovimentos(ms=>ms.map(mv=>mv.id===m.id?{...mv,valor:parseFloat(e.target.value)||0}:mv))}
                        style={{background:"#f8f8f8",border:"1px solid #eee",borderRadius:6,padding:"4px 7px",fontSize:11,outline:"none",fontFamily:"monospace",width:"90px",color:m.valor>=0?"#16a34a":"#dc2626",fontWeight:700}} step="0.01"/>
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <input type="number" value={m.saldo||0} onChange={e=>setMovimentos(ms=>ms.map(mv=>mv.id===m.id?{...mv,saldo:parseFloat(e.target.value)||0}:mv))}
                        style={{background:"#f8f8f8",border:"1px solid #eee",borderRadius:6,padding:"4px 7px",fontSize:11,outline:"none",fontFamily:"monospace",width:"90px"}} step="0.01"/>
                    </td>
                    <td style={{ padding: "9px 12px", minWidth: 160 }}>
                      <select value={m.catEditada} onChange={e => updateCat(m.id, e.target.value)}
                        style={{ width: "100%", background: "#f8f8f8", border: "1px solid #eee", borderRadius: 6, padding: "4px 8px", fontSize: 11, outline: "none" }}>
                        <option value="">-- sem categoria --</option>
                        {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "9px 12px", minWidth: 140 }}>
                      <input
                        type="text"
                        value={m.detalhes || ""}
                        onChange={e => setMovimentos(ms => ms.map(mv => mv.id === m.id ? { ...mv, detalhes: e.target.value } : mv))}
                        style={{ width: "100%", background: "#f8f8f8", border: "1px solid #eee", borderRadius: 6, padding: "4px 8px", fontSize: 11, outline: "none", fontFamily: "inherit" }}
                        placeholder="Observação..."
                      />
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      {dup ? (
                        <span title="Este movimento já existe no extrato (mesma data, descrição, valor e saldo). Marca a caixa se mesmo assim quiseres reinserir."
                          style={{ background: "#e0e7ff", color: "#3730a3", fontSize: 10, padding: "2px 8px", borderRadius: 12, fontFamily: "monospace", fontWeight: 700 }}>
                          🔁 Já existe
                        </span>
                      ) : (
                        <span style={{ background: m.aprovado ? "#f0fdf4" : "#fff8f8", color: m.aprovado ? "#16a34a" : "#dc2626", fontSize: 10, padding: "2px 8px", borderRadius: 12, fontFamily: "monospace" }}>
                          {m.aprovado ? "Aprovado" : "Ignorado"}
                        </span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button onClick={() => setStep(1)} disabled={saving} style={{ background: "none", border: "1px solid #eee", padding: "12px 24px", borderRadius: 10, fontSize: 14, color: "#888", cursor: saving ? "default" : "pointer" }}>← Voltar</button>
          <button onClick={handleSave} disabled={aprovados.length === 0 || saving}
            style={{ background: aprovados.length > 0 && !saving ? "#16a34a" : "#e0e0e0", color: "#fff", border: "none", padding: "12px 32px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: aprovados.length > 0 && !saving ? "pointer" : "default" }}>
            {saving ? "⏳ A guardar..." : `💾 Guardar ${aprovados.length} movimentos no Caixa Único`}
          </button>
        </div>
      </div>
    );
  }

  // ── Done ────────────────────────────────────────────────────────────────────
  const r = saveResult || { ok: true, inserted: aprovados.length, skipped: 0, error: "" };
  return (
    <div style={{ textAlign: "center", padding: "60px 0" }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>{r.ok ? "✅" : "⚠️"}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: r.ok ? "#1a1a2e" : "#b91c1c", fontFamily: "Georgia,serif", marginBottom: 8 }}>
        {r.ok ? "Extrato importado!" : "Erro a guardar"}
      </div>
      <div style={{ fontSize: 14, color: "#444", marginBottom: 8 }}>
        <strong style={{ color: "#16a34a" }}>{r.inserted}</strong> movimentos inseridos
        {r.skipped > 0 && <> · <strong style={{ color: "#888" }}>{r.skipped}</strong> ignorados (duplicados)</>}
      </div>
      <div style={{ fontSize: 13, color: "#888", marginBottom: r.error ? 16 : 32 }}>
        <strong>{empresa?.nome}</strong> · {banco}
      </div>
      {r.error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: "12px 16px", borderRadius: 10, fontSize: 12, fontFamily: "monospace", marginBottom: 24, maxWidth: 600, marginLeft: "auto", marginRight: "auto", textAlign: "left" }}>
          {r.error}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button onClick={reset} style={{ background: "#fff", color: "#1a1a2e", border: "1px solid #e0e0e0", padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          + Importar outro extrato
        </button>
        {r.ok && onGoToExtrato && (
          <button onClick={onGoToExtrato} style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "12px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Ver no Extrato →
          </button>
        )}
      </div>
    </div>
  );
}
