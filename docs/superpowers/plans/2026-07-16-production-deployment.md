# Production Deployment Implementation Plan

> **For agentic workers:** This plan mixes code/CLI steps with steps only the human operator can perform (browser dashboards, account logins). Each step is tagged **[ASSISTANT]** or **[USER]**. Do not attempt a [USER] step yourself — present it clearly and wait for confirmation it's done before continuing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PetFinder is live on the public internet: a real Supabase Cloud project backing a Vercel-hosted production build, reachable at a `*.vercel.app` URL.

**Architecture:** Supabase Cloud (managed Postgres/Auth/Storage) + Vercel (static Vite build, auto-deployed from `matarravitz/petfinder` on git push). One environment-aware code change so the browser talks directly to Supabase Cloud in production while local dev keeps its existing SSH-tunnel-proxy setup unchanged.

**Tech Stack:** No new dependencies. Supabase CLI (already installed, used for local dev) handles linking/migrating the production project.

## Global Constraints

- `SUPABASE_SERVICE_ROLE_KEY` (production or local) must never be added to Vercel's environment variables or any `VITE_`-prefixed variable — anything `VITE_`-prefixed ships in the client bundle.
- Local dev workflow (`supabase start`, SSH tunnel, `npm run dev`, `.env.local`) must keep working exactly as documented in `CLAUDE.md` — no change to local behavior.
- No demo/seed data goes into the production database.
- Full spec: `docs/superpowers/specs/2026-07-16-production-deployment-design.md`.

---

### Task 1: Create the Supabase Cloud project

**Files:** none (external setup only).

- [x] **Step 1 [USER]:** Go to https://supabase.com, sign up or log in, create a new project (any name/region you like — e.g. "petfinder-production"). Choose a database password and **save it somewhere safe** (you likely won't need it directly, Supabase manages connections, but it's good practice to keep).
- [x] **Step 2 [USER]:** Once the project finishes provisioning (a minute or two), go to Project Settings → API. You'll need three values from this page for later steps: the **Project URL**, the **anon/public key**, and the **service_role key**. Keep this tab open or copy these somewhere for the next tasks — tell me the Project URL and anon key when you have them (those two are safe to share in chat). **Do not paste the service_role key into chat** — you'll use it directly yourself in Task 4.

**Verify:** You can see "Project is ready" (or equivalent) in the Supabase dashboard, and have the Project URL + anon key on hand.

**Done 2026-07-17.** Project ref `ulfathyhapwphaqtujjr`, URL `https://ulfathyhapwphaqtujjr.supabase.co`, under the `matarravitz` Supabase account.

---

### Task 2: Link this repo to the production project and push the schema

**Files:** none (CLI operations against the existing `supabase/migrations/*.sql` files, unchanged).

- [x] **Step 1 [USER]:** The Supabase CLI needs to authenticate as you. Run this yourself (it opens a browser login flow) rather than through the assistant:
  ```
  supabase login
  ```
  If running on a headless VM with no browser, Supabase CLI will print a URL and a code — open that URL on any device, log in, and confirm. Alternatively, generate a personal access token at https://supabase.com/dashboard/account/tokens and run `supabase login --token <token>` yourself (still don't paste the token into chat).

  **Verify:** `supabase projects list` shows your new project.

- [x] **Step 2 [ASSISTANT]:** Once logged in, link this repo to the project and push all 9 existing migrations:
  ```bash
  cd /home/ubuntu/Projects/petfinder
  supabase link --project-ref <project-ref-from-project-url>
  supabase db push
  ```
  (The project ref is the subdomain portion of the Project URL, e.g. `abcdefghijklmnop` from `https://abcdefghijklmnop.supabase.co`.)

  **Verify:** `supabase db push` reports all 9 migrations (`0001` through `0009`) applied with no errors. In the Supabase dashboard's Table Editor, confirm the `posts`, `profiles`, `post_photos` tables exist with the expected columns.

  **Gotcha hit 2026-07-17:** `supabase db push` failed with "Access token not provided" even though `supabase login` had already succeeded (proven by `projects list`/`link` working) — this CLI version (`2.109.1`) doesn't persist a token that `db push` itself reads. Fix: generate a personal access token at the URL above, save it to `~/.supabase_access_token` (outside the repo, gitignored by location), and `export SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase_access_token)` before `db push`/`migration list`. Documented in `CLAUDE.md`'s new Deployment section.

- [x] **Step 3 [ASSISTANT]:** Confirm grants/RLS are correct against the real project (same script used for local dev, just pointed at production). This needs a temporary local file with the production service-role key — see the note below.

  **Verify [USER, one-time setup]:** Create `/home/ubuntu/Projects/petfinder/.env.production.local` yourself (this filename matches Vite's convention for a git-ignored env file — confirm `.gitignore` covers `.env*.local`, add it if not) with:
  ```
  VITE_SUPABASE_URL=<your project URL>
  SUPABASE_SERVICE_ROLE_KEY=<your service role key>
  ```
  Do this yourself directly on the VM (edit the file, don't paste the key into chat). Once it exists, tell the assistant it's ready.

  **Verify [ASSISTANT]:** Run `scripts/verify-schema.mjs` against it:
  ```bash
  cd /home/ubuntu/Projects/petfinder
  export $(cat .env.production.local | xargs)
  nvm exec 22 node scripts/verify-schema.mjs
  ```
  Expected: `Schema check passed. Cleaning up...` then `OK`.

  **Gotcha hit 2026-07-17:** the plan's original one-liner (`env $(cat ...) nvm exec ...`) fails with `env: 'nvm': Permission denied` — `nvm` is a shell function (sourced via `.bashrc`), not a real executable, so `env` can't exec it directly. Use plain `export` in the same shell invocation instead, as corrected above.

  **Done 2026-07-17:** `Schema check passed. Cleaning up... OK` — confirmed against the real `ulfathyhapwphaqtujjr` project.

---

### Task 3: Configure Supabase Auth redirect URLs

**Files:** none (dashboard setting only).

- [ ] **Step 1 [USER]:** In the Supabase dashboard, go to Authentication → URL Configuration. Set the **Site URL** to your future Vercel URL (you'll get the exact `*.vercel.app` URL in Task 5 — you can come back and set this after, or set a placeholder now and update it once you know the real URL). Add both the Vercel URL and `http://localhost:5173` to the **Redirect URLs** allowlist, so both production and local dev auth flows work.

**Verify:** The Redirect URLs list includes `http://localhost:5173/**` and (once known) your production URL.

---

### Task 4: Make the Supabase client URL environment-aware

**Files:**
- Modify: `src/lib/supabaseClient.js`
- Modify: `src/lib/photoUrl.js`
- Test: existing tests in `src/lib/photoUrl.test.js` (confirm unaffected, no new test needed — see reasoning below)

**Interfaces:**
- Consumes: Vite's built-in `import.meta.env.PROD` (boolean, `true` in production build) and a new `import.meta.env.VITE_SUPABASE_URL` (only read when `PROD` is true).
- Produces: no change to either module's exports — `supabase` client instance and `buildPhotoUrl` keep the same shape/signature.

- [x] **Step 1 [ASSISTANT]: Read the current implementation**

  `src/lib/supabaseClient.js` currently:
  ```js
  import { createClient } from '@supabase/supabase-js'

  export const supabase = createClient(window.location.origin, import.meta.env.VITE_SUPABASE_ANON_KEY)
  ```

- [x] **Step 2 [ASSISTANT]: Make the base URL environment-aware**

  ```js
  import { createClient } from '@supabase/supabase-js'

  // Local dev runs through an SSH tunnel + Vite's dev-server proxy (see
  // vite.config.js), which forwards /rest/v1, /auth/v1, etc. to the local
  // Supabase stack on the same origin — window.location.origin is correct
  // there. That proxy doesn't exist in a production Vercel build (no dev
  // server, no backend at all besides Supabase Cloud), so production must
  // talk to the real Supabase project URL directly instead.
  const supabaseUrl = import.meta.env.PROD ? import.meta.env.VITE_SUPABASE_URL : window.location.origin

  export const supabase = createClient(supabaseUrl, import.meta.env.VITE_SUPABASE_ANON_KEY)
  ```

  **Verify:** `grep -n "PROD" src/lib/supabaseClient.js` → one match.

- [x] **Step 3 [ASSISTANT]: Read and apply the same change to photoUrl.js**

  Read the current content of `src/lib/photoUrl.js` first (it builds public storage URLs the same way, off `window.location.origin`), then apply the identical `import.meta.env.PROD` conditional so both files stay consistent.

  **Verify:** `grep -n "PROD" src/lib/photoUrl.js` → one match.

- [x] **Step 4 [ASSISTANT]: Confirm existing tests are unaffected**

  Vitest does not set `import.meta.env.PROD` to `true` during `vitest run` (it defaults to `false`, matching dev mode), so every existing test exercising these modules continues to hit the `window.location.origin` branch exactly as before — no test changes needed.

  **Verify:** `npm test -- photoUrl supabaseClient` → all existing tests still pass, same count as before this change.

- [x] **Step 5 [ASSISTANT]: Full suite + build**

  **Verify:** `npm test` → all tests pass (228, unchanged). `npm run build` → exit 0.

- [x] **Step 6 [ASSISTANT]: Commit**

  ```bash
  git add src/lib/supabaseClient.js src/lib/photoUrl.js
  git commit -m "Use a direct Supabase URL in production, keep the dev-proxy origin locally"
  git push
  ```

  **Done 2026-07-17.** Commit `60c76c5`, pushed to `origin/master`.

---

### Task 5: Deploy to Vercel

**Files:** none (Vercel dashboard + env vars).

- [ ] **Step 1 [USER]:** Go to https://vercel.com, sign up or log in (GitHub login is easiest since the repo is already on GitHub), and import the `matarravitz/petfinder` repository as a new project. Vercel should auto-detect it as a Vite app (build command `npm run build` / `vite build`, output directory `dist`) — confirm these are set correctly before deploying, adjust if Vercel guessed wrong.

- [ ] **Step 2 [USER]:** Before the first deploy (or right after, then redeploy), add environment variables in the Vercel project's Settings → Environment Variables:
  - `VITE_SUPABASE_URL` = the Project URL from Task 1
  - `VITE_SUPABASE_ANON_KEY` = the anon key from Task 1
  - Do **not** add `SUPABASE_SERVICE_ROLE_KEY` here — it isn't needed by the frontend at all, and this variable name isn't `VITE_`-prefixed so it wouldn't be reachable in the browser bundle anyway, but there's no reason to add it to Vercel at all.

- [ ] **Step 3 [USER]:** Check Vercel project Settings → General for a Node.js version setting and confirm it's set to 22.x (or "Auto" if Vercel resolves it from `package.json`'s `engines` field, which this repo already has).

- [ ] **Step 4 [USER]:** Trigger a deploy (either automatic from the Task 4 push, or manually via "Redeploy" if env vars were added after the first attempt). Once it succeeds, copy the live `*.vercel.app` URL.

- [ ] **Step 5 [USER]:** Go back to Task 3's Supabase Auth URL Configuration and update the Site URL / Redirect URLs with the real Vercel URL now that you have it.

**Verify:** Vercel shows a successful deploy; visiting the `*.vercel.app` URL loads the PetFinder home page.

---

### Task 6: Smoke test the live deployment

**Files:** none.

- [ ] **Step 1 [ASSISTANT]:** Once you share the live URL, the assistant can drive a real smoke test against it directly (sign up, create a post with a photo, browse, resolve) using browser automation, rather than asking you to click through it manually.

**Verify:** Sign-up succeeds and a confirmation email flow works (or auto-confirms, depending on your Supabase Auth settings), a post can be created with a photo (confirming Storage + the new RLS policies from migrations 0007/0008 work against the real project), the post appears on Browse, and resolving it works.

---

## Test plan

No new automated/unit tests — this plan is infrastructure and one small environment-conditional code change already covered by existing tests (Task 4, Step 4). The real verification is: `scripts/verify-schema.mjs` against production (Task 2), and a live manual/assisted smoke test (Task 6).

## Done criteria

- [ ] Supabase Cloud project exists with all 9 migrations applied (`supabase db push` clean)
- [ ] `scripts/verify-schema.mjs` passes against production
- [ ] `src/lib/supabaseClient.js`/`photoUrl.js` use `import.meta.env.PROD` to pick the right URL; `npm test` (228 tests) and `npm run build` both still pass
- [ ] Vercel project deployed successfully from `matarravitz/petfinder`, env vars set (anon key only, no service-role key)
- [ ] Supabase Auth redirect URLs include the real production URL
- [ ] Live smoke test passes: signup, create post with photo, browse, resolve

## Maintenance notes

- If a custom domain is added later, update Supabase Auth's redirect URLs again to include it (in addition to, not instead of, the `*.vercel.app` URL, unless the vercel.app URL is being fully retired).
- `.env.production.local` (Task 2) contains a live service-role key — never commit it (confirm it's covered by `.gitignore`'s `.env*.local` pattern), and delete it once no longer needed for verification, or keep it for future production-schema-check runs after new migrations.
- The moderation/reporting feature (deferred, separate design) and upload-validation hardening (tracked in `docs/TODO.md`) both become more relevant once this is genuinely public — revisit priority after this plan lands.
