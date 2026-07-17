import { createClient } from '@supabase/supabase-js'

// In dev, the Vite server proxies /rest, /auth, /storage, /realtime, /functions
// through to the local Supabase stack, so the browser only ever needs to reach
// this page's own origin — no separate Supabase port to tunnel/expose. That
// proxy only exists in Vite's dev server; a production build (e.g. on Vercel)
// has no proxy layer at all, so it must talk to the real Supabase project URL
// directly instead — see docs/superpowers/specs/2026-07-16-production-deployment-design.md.
const supabaseUrl = import.meta.env.PROD ? import.meta.env.VITE_SUPABASE_URL : window.location.origin

export const supabase = createClient(supabaseUrl, import.meta.env.VITE_SUPABASE_ANON_KEY)
