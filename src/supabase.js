import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// LIGAÇÃO AO SUPABASE — LPX Private
//
// IMPORTANTE: este ERP tem de apontar para um projeto Supabase NOVO e SEPARADO
// do da Rio Capital. Caso contrário partilha a mesma base de dados.
//
// 1. Cria um projeto novo em https://supabase.com/dashboard
// 2. Corre o SQL de /setup-base-dados.html (schema + empresas/contas)
// 3. Preenche as variáveis abaixo (ou define-as no Netlify em
//    Site settings → Environment variables):
//        VITE_SUPABASE_URL
//        VITE_SUPABASE_ANON_KEY
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://SUBSTITUIR.supabase.co'
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'SUBSTITUIR_PELA_PUBLISHABLE_KEY'

if (SUPABASE_URL.includes('SUBSTITUIR') || SUPABASE_KEY.includes('SUBSTITUIR')) {
  console.warn(
    '[LPX ERP] Supabase por configurar. Define VITE_SUPABASE_URL e ' +
    'VITE_SUPABASE_ANON_KEY (.env local ou variáveis de ambiente do Netlify).'
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
