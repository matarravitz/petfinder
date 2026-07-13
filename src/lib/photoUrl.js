// Routed through the Vite dev proxy (see vite.config.js) so the browser only
// ever needs this page's own origin, not a separate Supabase port.
export function buildPhotoUrl(storagePath) {
  return `${window.location.origin}/storage/v1/object/public/post-photos/${storagePath}`
}
