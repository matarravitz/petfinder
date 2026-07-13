import { createClient } from '@supabase/supabase-js'

// In dev, the Vite server proxies /rest, /auth, /storage, /realtime, /functions
// through to the local Supabase stack, so the browser only ever needs to reach
// this page's own origin — no separate Supabase port to tunnel/expose.
export const supabase = createClient(window.location.origin, import.meta.env.VITE_SUPABASE_ANON_KEY)
