# Design: Production deployment (Supabase Cloud + Vercel)

**Status:** draft, pending approval.
**Scope:** get PetFinder live on the public internet. Does NOT include the moderation/reporting feature (separate design) or a custom domain (deferred — using Vercel's free subdomain for now, can attach a custom domain later with no migration).

## Decisions made

- **Backend:** Supabase Cloud (managed), not self-hosted. Free tier is sufficient for a small live app; no server ops (backups/updates/patching handled by Supabase).
- **Frontend hosting:** Vercel. Zero-config for Vite, auto-deploys on push to the GitHub repo already set up (`matarravitz/petfinder`), automatic HTTPS.
- **Domain:** Vercel's free `*.vercel.app` subdomain for now. A custom domain can be attached later without downtime or re-deployment — not a blocker.
- **No demo/seed data in production.** `scripts/seed-test-posts.mjs` stays a local-dev-only tool; production launches with an empty database, real users populate it.

## Architecture change required

**Problem:** `src/lib/supabaseClient.js` and `src/lib/photoUrl.js` currently use `window.location.origin` instead of a direct Supabase URL, specifically because local dev runs through an SSH tunnel to a VM, and `vite.config.js`'s `server.proxy` forwards `/rest/v1`, `/auth/v1`, `/storage/v1`, `/realtime/v1`, `/functions/v1` to the local Supabase stack on that same origin. This proxy only exists in Vite's **dev server** — a Vercel-hosted static production build has no proxy layer at all, so the browser must talk directly to Supabase Cloud's real project URL over CORS (which Supabase Cloud is already designed for).

**Fix:** make the Supabase URL environment-aware, so local dev is completely unaffected:

```js
// src/lib/supabaseClient.js
const supabaseUrl = import.meta.env.PROD
  ? import.meta.env.VITE_SUPABASE_URL
  : window.location.origin
```

Same change in `src/lib/photoUrl.js`. `import.meta.env.PROD` is a Vite built-in (`true` in a production build, `false` in `vite dev`) — no new env var needed to toggle it. Local dev keeps using the existing SSH-tunnel-friendly `window.location.origin` path unchanged; only the Vercel production build reads `VITE_SUPABASE_URL`.

This is the only source-code change in this plan — everything else is configuration/setup.

## Setup steps (high level — full detail goes in the implementation plan)

1. **Create the Supabase Cloud project** (via supabase.com dashboard) — note the project URL and anon key.
2. **Apply the schema**: `supabase link` this repo to the new project, then push all 9 existing migrations (`0001` through `0009`) via `supabase db push`. This is the same schema your local dev stack already runs, migrations transfer as-is.
3. **Configure Auth redirect URLs** in the Supabase dashboard to include the Vercel production URL (and `localhost:5173` for continued local dev) — without this, signup-confirmation/password-reset email links will point at the wrong place. (Local dev currently never sends real emails — it uses Supabase's local Inbucket test server — so this is a genuinely new production concern, not something CLAUDE.md's current docs cover.)
4. **Deploy to Vercel**: connect the `matarravitz/petfinder` GitHub repo, set the build command (`npm run build`) and output directory (`dist`) — Vercel usually auto-detects both for Vite.
5. **Set Vercel environment variables**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the new Supabase Cloud project. **`SUPABASE_SERVICE_ROLE_KEY` must NOT be added here** — it's only used by local `scripts/*.mjs`, and anything prefixed `VITE_` gets bundled into the client-side JS, so a service-role key there would be a critical, publicly-exposed credential leak.
6. **Set Node version on Vercel** to match `.nvmrc`/`package.json engines` (>=22) — Vercel reads `engines` automatically in most cases, worth confirming in project settings.
7. **Verify**: run `scripts/verify-schema.mjs` against the production project (using its service-role key, kept local/secret, never in Vercel) to confirm RLS/grants are correctly applied. Then do a real manual pass — sign up, create a post with a photo, browse, resolve — against the live Vercel URL.

## What this does NOT include (explicitly out of scope for this design)

- The moderation/reporting feature (separate design, per your earlier decision to do infra first).
- A custom domain (deferred, no blocker to attach one later).
- Upload validation hardening (file type/size limits on the `post-photos` bucket) — already tracked in `docs/TODO.md` as a deferred audit finding; worth reconsidering once real public traffic exists, not a hard launch blocker.
- Any change to the existing local dev workflow (`supabase start`, SSH tunnel, `npm run dev`) — all of that continues to work exactly as documented in `CLAUDE.md`.

## Testing

No new automated tests — this is infrastructure/config, not application logic. The "test" is the manual verification pass in setup step 7, plus confirming the existing `npm test`/`npm run build` (already CI-gated) still pass unchanged, since the only code change (`supabaseClient.js`/`photoUrl.js`) is behind an `import.meta.env.PROD` check that's `false` during `vitest run` (Vitest doesn't set `PROD`), so existing tests exercise the same `window.location.origin` path they always have.
