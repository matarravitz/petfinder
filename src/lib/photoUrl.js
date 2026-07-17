// Routed through the Vite dev proxy (see vite.config.js) so the browser only
// ever needs this page's own origin, not a separate Supabase port — dev only.
// A production build has no proxy layer, so it needs the real Supabase
// project URL directly (see supabaseClient.js's PROD branch, same reasoning).
export function buildPhotoUrl(storagePath) {
  const origin = import.meta.env.PROD ? import.meta.env.VITE_SUPABASE_URL : window.location.origin
  return `${origin}/storage/v1/object/public/post-photos/${storagePath}`
}
