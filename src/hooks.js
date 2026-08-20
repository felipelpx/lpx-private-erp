import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

// ─── HELPER: generic realtime table hook ─────────────────────────────────────
function useRealtimeTable(table, queryFn) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const { data: result, error: queryError } = await queryFn()
      if (queryError) {
        console.error(`useRealtimeTable[${table}] query error:`, queryError)
        setError(queryError.message || String(queryError))
      } else {
        setError(null)
        if (result) setData(result)
      }
    } catch(e) {
      console.error(`useRealtimeTable[${table}] exception:`, e)
      setError(e?.message || String(e))
    }
    setLoading(false)
  }, [table])

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 6000)
    load().finally(() => clearTimeout(timeout))
    // Channel name único por instância — evita colisão quando o mesmo hook é
    // usado em vários componentes (ex.: useProfiles em App + Utilizadores).
    const ch = supabase.channel(`realtime-${table}-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch); clearTimeout(timeout) }
  }, [table, load])

  return { data, loading, error, reload: load }
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export function useAuth() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const loadProfile = async (id) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single()
    setProfile(data)
    setLoading(false)
  }

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })
  const signOut = () => supabase.auth.signOut()
  return { user, profile, loading, signIn, signOut }
}

// ─── PROFILES ─────────────────────────────────────────────────────────────────
export function useProfiles() {
  const { data, loading } = useRealtimeTable('profiles',
    () => supabase.from('profiles').select('*').order('nome'))
  const upsertProfile = (p) => supabase.from('profiles').upsert(p)
  return { profiles: data, loading, upsertProfile }
}

// ─── CONTAS (saldos) ──────────────────────────────────────────────────────────
export function useContas() {
  const { data, loading } = useRealtimeTable('contas',
    () => supabase.from('contas').select('*'))
  const updateSaldo = (id, saldo) =>
    supabase.from('contas').update({ saldo, updated_at: new Date().toISOString() }).eq('id', id)
  const upsertConta = (conta) =>
    supabase.from('contas').upsert({ ...conta, updated_at: new Date().toISOString() })
  return { contas: data, loading, updateSaldo, upsertConta }
}

// ─── MOVIMENTOS por conta (com paginação) ────────────────────────────────────
export function useMovimentosByConta(contaId) {
  const [movimentos, setMovimentos] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!contaId) return
    setLoading(true)
    let all = [], from = 0
    while (true) {
      const { data, error } = await supabase
        .from('movimentos').select('*')
        .eq('conta_id', contaId)
        // seq DESC NULLS LAST → imports recentes (com seq) primeiro;
        // antigos sem seq usam data DESC como tiebreaker
        .order('seq', { ascending: false, nullsFirst: false })
        .order('data', { ascending: false })
        .range(from, from + 999)
      if (error || !data?.length) break
      all = [...all, ...data]
      if (data.length < 1000) break
      from += 1000
    }
    setMovimentos(all)
    setLoading(false)
  }, [contaId])

  useEffect(() => {
    load()
    if (!contaId) return
    const ch = supabase.channel(`realtime-movimentos-${contaId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'movimentos',
        filter: `conta_id=eq.${contaId}`
      }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [contaId, load])

  const saveMovimentos = async (novos, cId) => {
    const id = cId || contaId
    if (!id || !novos?.length) return 0
    const { data: existing } = await supabase.from('movimentos')
      .select('data, movimento, valor, saldo').eq('conta_id', id)
    const keys = new Set((existing || []).map(m => `${m.data}_${m.movimento}_${m.valor}_${m.saldo}`))
    const toInsert = novos
      .filter(m => !keys.has(`${m.data}_${m.movimento}_${m.valor}_${m.saldo}`))
      .map((m, idx) => ({
        conta_id: id,
        empresa_id: m.empresa_id || id.split('_')[0],
        banco: m.banco || '',
        data: m.data, movimento: m.movimento, valor: m.valor,
        saldo: m.saldo || 0,
        categoria: m.catEditada || m.categoria || '',
        detalhes: m.detalhes || '',
        seq: m.seq !== undefined ? m.seq : idx  // preserve Excel order
      }))
    for (let i = 0; i < toInsert.length; i += 200)
      await supabase.from('movimentos').insert(toInsert.slice(i, i + 200))
    return toInsert.length
  }

  const deleteMovimento = (id) => supabase.from('movimentos').delete().eq('id', id)
  const updateMovimento = async (id, updates) => {
    const { data, error } = await supabase.from('movimentos').update(updates).eq('id', id).select()
    if (error) console.error('updateMovimento error:', error)
    return { data, error }
  }

  return { movimentos, loading, saveMovimentos, deleteMovimento, updateMovimento, reload: load }
}

// ─── FATURAS ──────────────────────────────────────────────────────────────────
export function useFaturas() {
  const { data, loading } = useRealtimeTable('faturas',
    () => supabase.from('faturas').select('*').order('created_at', { ascending: false }))
  const addFatura = async (f) => {
    const { data, error } = await supabase.from('faturas').insert([f]).select()
    if (error) console.error('addFatura error:', error)
    return { data, error }
  }
  const addFaturas = async (arr) => {
    if (!arr?.length) return { data: [], error: null }
    const { data, error } = await supabase.from('faturas').insert(arr).select()
    if (error) console.error('addFaturas error:', error)
    return { data, error }
  }
  const updateFatura = async (id, u) => {
    // Remover o id do payload (primary key, não atualizável)
    const { id: _ignoreId, ...rest } = u || {};
    const { data, error } = await supabase.from('faturas')
      .update(rest).eq('id', id).select()
    if (error) console.error('updateFatura error:', error)
    return { data, error }
  }
  const deleteFatura = async (id) => {
    const { data, error } = await supabase.from('faturas').delete().eq('id', id).select();
    if (error) console.error('deleteFatura error:', error);
    return { data, error };
  };
  return { faturas: data, loading, addFatura, addFaturas, updateFatura, deleteFatura }
}

// ─── PAGAMENTOS EXTRAS ────────────────────────────────────────────────────────
export function usePagamentosExtras() {
  const { data, loading } = useRealtimeTable('pagamentos_extras',
    () => supabase.from('pagamentos_extras').select('*').order('data_inicio'))
  const addPagamento = async (p) => {
    const { data, error } = await supabase.from('pagamentos_extras').insert([p]).select()
    if (error) console.error('addPagamento error:', error)
    return { data, error }
  }
  const updatePagamento = async (id, u) => {
    const { data, error } = await supabase.from('pagamentos_extras')
      .update(u).eq('id', id).select()
    if (error) console.error('updatePagamento error:', error)
    return { data, error }
  }
  const deletePagamento = async (id) => {
    const { data, error } = await supabase.from('pagamentos_extras')
      .delete().eq('id', id).select()
    if (error) console.error('deletePagamento error:', error)
    return { data, error }
  }
  return { pagamentos: data, loading, addPagamento, updatePagamento, deletePagamento }
}

// ─── MAPAS DE PAGAMENTO ──────────────────────────────────────────────────────
export function useMapasPagamento() {
  const { data: mapas, loading, reload } = useRealtimeTable('mapas_pagamento',
    () => supabase.from('mapas_pagamento').select('*').order('created_at', { ascending: false }))

  const addMapa = async (mapa, itens) => {
    // 1. Cria o cabeçalho do mapa
    const { data: created, error: e1 } = await supabase.from('mapas_pagamento').insert([mapa]).select()
    if (e1) { console.error('addMapa cabeçalho:', e1); return { data: null, error: e1 } }
    const mapaId = created?.[0]?.id
    if (!mapaId) return { data: null, error: { message: "Cabeçalho criado mas sem id (RLS?)" } }
    // 2. Insere itens com o mapa_id
    const itensComMapaId = (itens || []).map(it => ({ ...it, mapa_id: mapaId }))
    const { data: itensInseridos, error: e2 } = await supabase.from('mapas_pagamento_itens').insert(itensComMapaId).select()
    if (e2) { console.error('addMapa itens:', e2); return { data: created[0], error: e2 } }
    await reload()
    return { data: { mapa: created[0], itens: itensInseridos || [] }, error: null }
  }

  const updateMapa = async (id, u) => {
    const { id: _i, ...rest } = u || {}
    const { data, error } = await supabase.from('mapas_pagamento').update(rest).eq('id', id).select()
    if (error) console.error('updateMapa error:', error)
    if (!error) await reload()
    return { data, error }
  }

  const deleteMapa = async (id) => {
    // ON DELETE CASCADE apaga os itens automaticamente
    const { data, error } = await supabase.from('mapas_pagamento').delete().eq('id', id).select()
    if (error) console.error('deleteMapa error:', error)
    if (!error) await reload()
    return { data, error }
  }

  return { mapas, loading, reload, addMapa, updateMapa, deleteMapa }
}

// ─── Itens de um mapa de pagamento (paginação simples por mapa_id) ─────────
export function useMapaItens(mapaId) {
  const [itens, setItens] = useState([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    if (!mapaId) { setItens([]); setLoading(false); return }
    const { data, error } = await supabase
      .from('mapas_pagamento_itens').select('*').eq('mapa_id', mapaId).order('created_at')
    if (!error && data) setItens(data)
    setLoading(false)
  }, [mapaId])
  useEffect(() => {
    setLoading(true)
    load()
    if (!mapaId) return
    const ch = supabase.channel(`mp-itens-${mapaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mapas_pagamento_itens', filter: `mapa_id=eq.${mapaId}` }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [mapaId, load])
  return { itens, loading, reload: load }
}

// ─── FRACOES ──────────────────────────────────────────────────────────────────
export function useFracoes() {
  const [fracoes, setFracoes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 5000)
    supabase.from('fracoes').select('*').order('projeto').order('fracao')
      .then(({ data }) => {
        if (data) setFracoes(data)
        setLoading(false)
        clearTimeout(timeout)
      })
      .catch(() => { setLoading(false); clearTimeout(timeout) })
    const ch = supabase.channel('realtime-fracoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fracoes' }, () => {
        supabase.from('fracoes').select('*').order('projeto').order('fracao')
          .then(({ data }) => { if (data) setFracoes(data) })
      }).subscribe()
    return () => { supabase.removeChannel(ch); clearTimeout(timeout) }
  }, [])

  const upsertFracao = (f) =>
    supabase.from('fracoes').upsert({ ...f, updated_at: new Date().toISOString() })
  const deleteFracao = (id) => supabase.from('fracoes').delete().eq('id', id)
  return { fracoes, loading, upsertFracao, deleteFracao }
}

// ─── VENDAS ───────────────────────────────────────────────────────────────────
export function useVendas() {
  const [vendas, setVendas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 5000)
    supabase.from('vendas').select('*').order('data', { ascending: false })
      .then(({ data }) => {
        if (data) setVendas(data)
        setLoading(false)
        clearTimeout(timeout)
      })
      .catch(() => { setLoading(false); clearTimeout(timeout) })
    const ch = supabase.channel('realtime-vendas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendas' }, () => {
        supabase.from('vendas').select('*').order('data', { ascending: false })
          .then(({ data }) => { if (data) setVendas(data) })
      }).subscribe()
    return () => { supabase.removeChannel(ch); clearTimeout(timeout) }
  }, [])

  const upsertVenda = (v) => {
    const { _frac, ...rest } = v
    return supabase.from('vendas').upsert({ ...rest, updated_at: new Date().toISOString() })
  }
  const updateVenda = async (id, u) => {
    const { id: _i, ...rest } = u || {}
    const { data, error } = await supabase.from('vendas').update(rest).eq('id', id).select()
    if (error) console.error('updateVenda error:', error)
    return { data, error }
  }
  const deleteVenda = (id) => supabase.from('vendas').delete().eq('id', id)
  return { vendas, loading, upsertVenda, updateVenda, deleteVenda }
}

// ─── ORCAMENTO ────────────────────────────────────────────────────────────────
export function useOrcamento() {
  const { data, loading } = useRealtimeTable('orcamento',
    () => supabase.from('orcamento').select('*').order('empresa_id').order('categoria'))
  const upsertOrcamento = (row) =>
    supabase.from('orcamento').upsert({ ...row, updated_at: new Date().toISOString() })
  const deleteOrcamento = (id) => supabase.from('orcamento').delete().eq('id', id)
  return { orcamento: data, loading, upsertOrcamento, deleteOrcamento }
}

// ─── MOVIMENTOS COUNTS por conta — fonte de verdade pós-import ───────────────
// Retorna { [conta_id]: count } com reatividade em tempo real.
// Usado pelo ExtratosView para mostrar o nº REAL de movimentos por conta,
// independentemente do snapshot estático em caixa_unico_v2.json.
export function useMovimentosCounts() {
  const [counts, setCounts] = useState({})

  const load = useCallback(async () => {
    try {
      // Trazer apenas conta_id (paginado) e agregar no cliente
      let all = [], from = 0
      while (true) {
        const { data, error } = await supabase
          .from('movimentos').select('conta_id')
          .range(from, from + 999)
        if (error || !data?.length) break
        all = all.concat(data)
        if (data.length < 1000) break
        from += 1000
      }
      const agg = {}
      for (const r of all) agg[r.conta_id] = (agg[r.conta_id] || 0) + 1
      setCounts(agg)
    } catch (e) { console.warn('useMovimentosCounts error:', e) }
  }, [])

  useEffect(() => {
    load()
    const ch = supabase.channel('realtime-movimentos-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimentos' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { counts, reload: load }
}

// ─── SALDOS ATUAIS por conta — saldo do movimento MAIS RECENTE ───────────────
// Retorna { [conta_id]: saldo } usando o saldo do último movimento (seq mais alto
// e/ou data mais recente) de cada conta. Reativo a alterações na tabela.
export function useSaldosAtuais(contaIds = []) {
  const [saldos, setSaldos] = useState({})
  // estabilizar a lista de ids como string para evitar re-runs infinitos
  const idsKey = JSON.stringify((contaIds || []).slice().sort())

  const load = useCallback(async () => {
    try {
      const ids = JSON.parse(idsKey)
      if (!ids.length) { setSaldos({}); return }
      const out = {}
      // Faz queries em paralelo, uma por conta — cada uma pede o último mov
      await Promise.all(ids.map(async (cid) => {
        const { data, error } = await supabase
          .from('movimentos').select('saldo')
          .eq('conta_id', cid)
          .order('seq', { ascending: false, nullsFirst: false })
          .order('data', { ascending: false })
          .limit(1)
        if (!error && data?.[0]) out[cid] = parseFloat(data[0].saldo) || 0
      }))
      setSaldos(out)
    } catch (e) { console.warn('useSaldosAtuais error:', e) }
  }, [idsKey])

  useEffect(() => {
    load()
    const ch = supabase.channel(`realtime-saldos-atuais-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimentos' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { saldos, reload: load }
}

// ─── SALDOS NUMA DATA específica ─────────────────────────────────────────────
// Para cada conta_id, busca o saldo do ÚLTIMO movimento até à data dada (inclusive).
// Útil para comparações Data Anterior vs Data Atual.
export function useSaldosNaData(contaIds = [], dataISO) {
  const [saldos, setSaldos] = useState({})
  const [loading, setLoading] = useState(false)
  const idsKey = JSON.stringify((contaIds || []).slice().sort())

  const load = useCallback(async () => {
    try {
      const ids = JSON.parse(idsKey)
      if (!ids.length || !dataISO) { setSaldos({}); return }
      setLoading(true)
      const out = {}
      await Promise.all(ids.map(async (cid) => {
        const { data, error } = await supabase
          .from('movimentos').select('saldo, data, seq')
          .eq('conta_id', cid)
          .lte('data', dataISO)
          .order('data', { ascending: false })
          .order('seq', { ascending: false, nullsFirst: false })
          .limit(1)
        if (!error && data?.[0]) out[cid] = parseFloat(data[0].saldo) || 0
        else out[cid] = 0
      }))
      setSaldos(out)
      setLoading(false)
    } catch (e) {
      console.warn('useSaldosNaData error:', e)
      setLoading(false)
    }
  }, [idsKey, dataISO])

  useEffect(() => { load() }, [load])

  return { saldos, loading, reload: load }
}

// ─── ENTIDADES ────────────────────────────────────────────────────────────────
export function useEntidades() {
  const { data, loading } = useRealtimeTable('entidades',
    () => supabase.from('entidades').select('*').order('tipo').order('nome'))

  const addEntidade = async (e) => {
    const { error } = await supabase.from('entidades').insert([{ ...e, id: 'ent_' + Date.now() }])
    if (error) console.warn('addEntidade error:', error)
  }
  const updateEntidade = async (id, u) => {
    await supabase.from('entidades').update({ ...u, updated_at: new Date().toISOString() }).eq('id', id)
  }
  const deleteEntidade = async (id) => {
    await supabase.from('entidades').delete().eq('id', id)
  }
  return { entidades: data, loading, addEntidade, updateEntidade, deleteEntidade }
}
