# PetFinder

A React SPA for reuniting lost pets with owners: post a missing/found pet with photos and location, browse nearby posts, mark resolved when reunited. Unrelated to the `catfinder` game project — don't confuse the two.

**Maintenance rule:** whenever you make an important change (schema, architecture, conventions, design tokens, gotchas, new dependency, changed workflow), update the relevant section of this file in the same session. Don't wait to be asked. This file must stay current automatically as the project evolves.

## Roadmap

Building **web-first**; a native app version is planned for later and has not been started. Ideas that are app-specific (not applicable to the web build, or that intentionally diverge from a web decision) go in `docs/future-app-ideas.md`, not implemented now — check that file before assuming a web-version UX pattern should also apply to a future app version.

## Docs conventions

Each feature gets its own markdown file under `docs/features/<feature-name>.md` (not the default `docs/superpowers/specs/` brainstorming location) — one file per feature, kept up to date as that feature evolves, rather than one-off dated spec snapshots.

**These feature files follow the same maintenance rule as this file:** whenever you make an important or big change to a feature (new capability, behavior change, new component, changed UX flow), update its `docs/features/<feature-name>.md` in the same session — don't wait to be asked, and don't let it silently drift out of sync with the code. This applies to the living per-feature doc, not the one-time `-plan.md` implementation-plan snapshots (e.g. `photo-autofill-plan.md`, `messaging-plan.md`) — those are frozen historical task lists from the implementation pass and aren't meant to be kept current.

## Stack

React 18.3.1 + Vite, plain JavaScript (no TypeScript), React Router v6. Supabase (Postgres + Auth + Storage + Realtime) via local dev stack (Supabase CLI + Docker). Vitest + React Testing Library for tests. Hand-written CSS custom-properties design system (no Tailwind/CSS-in-JS) in `src/features/layout/theme.css`. `@tensorflow/tfjs` + `@tensorflow-models/coco-ssd` + `@tensorflow-models/mobilenet` run client-side photo analysis (species/breed detection) for the in-progress photo auto-fill feature (`src/features/posts/photoAnalysis/`).

Node **must be >=22** (`.nvmrc`, `package.json engines`) — `@supabase/supabase-js` realtime needs native WebSocket support. Run `nvm use` or `nvm exec 22 <cmd>` before any `node`/`npm` command if your shell defaults to an older version.

## Commands

```bash
npm run dev       # vite dev server, port 5173
npm run build     # production build
npm test          # vitest run (all tests, single run)
npm run preview   # preview a production build

supabase start    # start local Supabase stack (Postgres/Auth/Storage/Realtime), from repo root
supabase stop

nvm exec 22 node scripts/seed-test-posts.mjs   # idempotent: seeds sample posts with real photos
                                                 # (placedog.net / cataas.com / loremflickr.com)
nvm exec 22 node scripts/verify-schema.mjs     # sanity-checks schema/RLS: creates a throwaway
                                                 # auth user + profile + post, then cleans up
```

## Environment

`.env.local` (gitignored, not committed) needs:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321       # only used by scripts/*.mjs (browser code uses window.location.origin — see Gotchas)
VITE_SUPABASE_ANON_KEY=<from `supabase status`>
SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`>  # scripts/*.mjs only; never expose to the browser
```

## Architecture

```
public/favicon.svg           # paw-print favicon, reuses PawPrintIcon's exact path data
index.html                   # links favicon.svg; <title>PetFinder</title>
src/
  App.jsx                    # routes: / /browse /login /signup /post/new /post/:id /my-posts /messages
  features/
    auth/                    # AuthContext, LoginPage, SignupPage — password show/hide toggle,
                              # confirm-password field (signup only), .auth-page/.auth-card/
                              # .password-input CSS pattern, redirect-after-login (see Gotchas)
    home/HomePage.jsx        # hero, "how it works", recently-posted preview, reunited-count stat
    layout/
      Layout.jsx             # header/nav (active-tab via useLocation)
      theme.css              # THE single global stylesheet — all design tokens live here
      PawPrintIcon.jsx       # one hand-drawn SVG touch, used sparingly (see Design system below)
    messages/                # in-site chat — MOCK DATA ONLY, no backend (see docs/features/messaging.md)
      MessagesPage.jsx       # split-pane inbox at /messages; owns conversations state, reads
                              # location.state to open/create a thread (see Gotchas)
      ConversationList.jsx / ConversationRow.jsx   # list pane; row has select + delete buttons
                              # as siblings, not nested (see Gotchas); delete is icon-only (TrashIcon)
      TrashIcon.jsx           # inline SVG, same hand-drawn-icon pattern as PawPrintIcon
      ThreadPane.jsx / MessageBubble.jsx           # thread pane; bubbles styled by fromMe
      mockConversations.js   # createInitialConversations() factory + formatPostReference()
    posts/
      BrowseFeedPage.jsx     # type/species filters, radius slider, "show all" toggle; filters
                              # live in the URL (useSearchParams), not just state — see Gotchas
      PostCard.jsx           # whole card is a single <Link> to /post/:id (see Gotchas)
      CreatePostForm.jsx     # report a missing/found pet
      LocationPicker.jsx     # Leaflet map + live geocoding search (see Gotchas)
      PostDetailPage.jsx     # fixed-grid detail fields, resolve action, Contact publisher button
                              # (navigates to /messages with location.state — see Gotchas)
      MyPostsDashboard.jsx    # owner's own posts at /my-posts, split into Active/Resolved sections,
                              # reuses PostCard; own auth guard (see Gotchas), not just the nav link
      photoAnalysis/          # client-side species/breed/color detection (TF.js), see Gotchas
        models.js              # shared memoized TF.js model loaders (coco-ssd, mobilenet) — analyzePhoto.js
                                # and getPhotoEmbedding.js both import from here, not their own copies
        getPhotoEmbedding.js    # MobileNet embedding vector for cross-post match suggestions
        cosineSimilarity.js     # pure vector-similarity helper used by matchPosts.js
      postsApi.js            # listPosts/getPost/createPost/resolvePost/deletePost/listPostsByOwner/
                              # listCandidatePostsForMatching
      matchPosts.js           # pure hybrid scoring (visual + location + date) for match suggestions
      buildPostPayload.js    # pure function: form state -> DB insert payload
      filterPosts.js         # pure function: filterAndSortPosts(posts, filters)
  lib/
    supabaseClient.js        # createClient(window.location.origin, ...) — see Gotchas
    photoUrl.js              # builds public storage URLs off window.location.origin
    geolocation.js           # wraps navigator.geolocation in a Promise
    distance.js              # haversine distance helper
    useScrollRestoration.js  # site-wide hook (wired once in Layout.jsx) that saves/restores scroll
                              # position across browser back/forward — see Gotchas
  testUtils/fakeSupabase.js  # chainable/thenable fake supabase client for tests
supabase/migrations/         # 0001_init (schema+RLS), 0002_storage, 0003_grants (see Gotchas),
                              # 0004_posts_phone_number, 0005_photo_embedding
scripts/seed-test-posts.mjs  # seeds demo posts with real fetched photos
scripts/verify-schema.mjs    # schema/RLS sanity check (see Commands)
```

## Database schema (posts table, see `supabase/migrations/0001_init.sql`)

`type` (enum: missing/found) · `species` · `breed` · `color` · `size` · `collar` (bool) + `collar_description` · `microchipped` (enum: yes/no/unknown) · `distinctive_markings` · `pet_name` · `reward_amount` (numeric, missing-only) · `phone_number` (nullable text, optional) · `photo_embedding` (nullable `jsonb`, ~1024-number MobileNet feature vector, computed client-side at post-creation time — see `docs/features/post-matching.md`) · `location_lat`/`location_lng`/`location_text` · `date_lost_or_found` · `status` (enum: active/resolved) · `owner_id` → `profiles`. RLS: everyone can read; only owners can insert/update/delete their own posts.

There is **no `messages`/`conversations` table** — the in-site chat feature is mock-data-only (see Architecture above and `docs/features/messaging.md`). Don't assume a schema exists for it.

`buildPostPayload(formValues, ownerId)` is the single place form state maps to this schema — check it before adding a new form field.

## Design system — read before touching colors

`src/features/layout/theme.css` is hand-authored, no framework. Current palette is **"Soft Sage & Earth"** — muted sage primary (`#4b5f52`) + warm clay/terracotta accent (`#c46b4d`) + warm off-white background (`#f7f5f0`), with white text on both primary and accent (both are dark enough for it). Fraunces (serif, display/headings) + Nunito Sans (body) via Google Fonts `@import`.

**This palette has been explicitly chosen and re-confirmed by the user twice** — once original ("i like it"), and again after trying and rejecting an "Ochre & Slate" alternative ("the color is uglyyyyyy... i did like the warm feeling but it turn out not good"). Do not change `--color-primary`/`--color-accent`/`--color-bg` without an explicit new request, and if asked for new options, present alternatives (e.g. via AskUserQuestion with hex previews) rather than applying changes speculatively.

If the primary color is ever changed to something lighter than the sage, re-check whether `--color-primary-contrast` needs to flip from white to a dark tone, and check `.app-nav-link`/`.app-nav-auth` in `theme.css`, which have some hardcoded `rgba(255,255,255,...)` values that assume a dark primary background.

Other established conventions: photo-forward post cards, "Posted by X" attribution, reunited-count stat on the home page, one `PawPrintIcon` touch (used once, not repeated everywhere) — these came out of an explicit "make it feel less AI-made/templated" pass and should be preserved.

## Testing

Vitest + `@testing-library/react` + `@testing-library/user-event`. `vi.mock()` per module. `src/testUtils/fakeSupabase.js` provides a chainable/thenable fake supabase client (`createFakeQuery`/`createFakeSupabase`) — use it instead of hand-rolling mocks for supabase calls.

`CreatePostForm.test.jsx` mocks `LocationPicker.jsx` with a stub button (calls `onChange` with a fixed lat/lng/text) rather than rendering the real map — keep this mock in sync if `LocationPicker`'s props ever change.

`URL.createObjectURL`/`revokeObjectURL` aren't implemented in jsdom — stub via `vi.stubGlobal('URL', {...})` if a test needs photo preview URLs, and don't manually `vi.unstubAllGlobals()` before RTL's unmount cleanup runs (it'll throw when the component's cleanup calls `revokeObjectURL`).

jsdom has no canvas rendering backend (no `canvas` npm package installed), so `HTMLCanvasElement#getContext('2d')` returns `null` by default — `src/setupTests.js` stubs it globally to return an object with a no-op `putImageData`. Extend that stub (don't add a per-test one) if a future test needs more canvas 2D methods (e.g. `drawImage`, `getImageData`).

Modules with module-scoped memoized state (e.g. `analyzePhoto.js`'s cached TF.js model promises) leak that state across `test()` blocks within the same file — Vitest only isolates module instances per test *file*, not per test case. `analyzePhoto.test.js` resets via `vi.resetModules()` + a dynamic `await import('./analyzePhoto.js')` in `beforeEach`; reuse this pattern for any other module that memoizes at module scope.

Destructive-action confirmations use the browser's native `window.confirm()` (no custom modal component exists in this app) — test with `vi.spyOn(window, 'confirm').mockReturnValue(true/false)`, and `.mockRestore()` it at the end of the test (see `ConversationRow.test.jsx`, `ConversationList.test.jsx`, `MessagesPage.test.jsx` for the pattern).

Router-state assertions (e.g. redirect-after-login) need an actual `<Routes>`/`<Route>` pair inside `MemoryRouter`, not just the component alone — render both the source and destination routes and assert on the destination's content after the action (see `LoginPage.test.jsx`/`SignupPage.test.jsx`).

**No global mock-clearing is configured** (no `clearMocks`/`restoreMocks` in `vite.config.js`'s `test` block, no shared `beforeEach`) — a `vi.fn()`'s call count/history persists across every `test()` in the same file unless you clear it yourself. This has caused real false-failures more than once (count-based assertions like `.not.toHaveBeenCalled()`/`toHaveBeenCalledTimes(n)` picking up calls from earlier tests in the file). Call `someMock.mockClear()` at the top of any test that asserts on call counts, or `vi.clearAllMocks()` in a file-level `beforeEach` if most tests in the file need it (see `analyzePhoto.test.js`, `getPhotoEmbedding.test.js`, or the `postsApi.createPost.mockClear()`/`postsApi.listPosts.mockClear()` precedents in `CreatePostForm.test.jsx`/`BrowseFeedPage.test.jsx`).

**Testing same-instance in-app navigation** (a component that stays mounted while a route param/search-param changes, e.g. `/post/pA` → `/post/pB`, or filters surviving `/browse` → `/post/:id` → back): a plain two-call `render()` doesn't reproduce this — each call mounts a fresh instance, trivially "fixing" state bugs that only occur when React Router reuses the same mounted component. Use `createMemoryRouter`/`RouterProvider` instead, and drive navigation with `router.navigate(path)` / `router.navigate(-1)` (wrap in `act()` if asserting on state that settles after an async effect) — see `PostDetailPage.test.jsx`'s stale-match-state regression test or `BrowseFeedPage.test.jsx`'s filter-persistence test.

## Gotchas

- **Remote VM access**: the app runs on a remote VM, accessed via `ssh -L 5173:localhost:5173 ubuntu@<vm-ip>`. Only port 5173 needs tunneling — `vite.config.js`'s `server.proxy` forwards `/rest/v1`, `/auth/v1`, `/storage/v1`, `/realtime/v1`, `/functions/v1` to `http://127.0.0.1:54321` (local Supabase), so `supabaseClient.js` and `photoUrl.js` both use `window.location.origin` instead of a separate hardcoded Supabase URL. Don't revert this to a direct Supabase URL/port.
- **react-leaflet version pin**: must stay on `react-leaflet@4` (not v5, which requires React 19). This project is on React 18.3.1.
- **LocationPicker is a `<div>`, not a nested `<form>`**: the address-search box must not become its own `<form onSubmit>` — it's nested inside `CreatePostForm`'s outer `<form>`, and a nested form is invalid HTML (React logs a `validateDOMNesting` console error). Use a `type="button"` + onClick/onKeyDown instead.
- **LocationPicker live search**: search is debounced (~450ms, 3+ chars) via a `useEffect` watching `query`, calling Nominatim (`nominatim.openstreetmap.org`, free, no API key, ~1 req/sec rate-limit policy). A `skipNextAutoSearch` ref guards against the debounce re-firing right after a result is selected or a map pin is dropped (both call `setQuery` with the final text) — keep this guard if you touch the search flow.
- **PostCard is a single `<Link>`**: the whole card (photo + body) navigates to `/post/:id`; don't add a nested `<a>`/`<Link>` inside it (invalid HTML, breaks click-anywhere UX). "View details" is plain styled text, not its own link.
- **Playwright map clicks**: `page.mouse.click(x, y)` does not register with Leaflet's click handler in this app. Use `page.locator('.leaflet-container').click({ position, force: true })` instead.
- **Chip/segmented `aria-checked` vs `aria-pressed`**: CSS selectors for active state must cover both (`[aria-checked='true']`, `[aria-pressed='true']`) — some controls use one, some the other.
- **No DB trigger creates `profiles` rows**: `AuthContext.signUp` (`src/features/auth/AuthContext.jsx`) calls `auth.signUp` then inserts the `profiles` row itself in the same function. Order matters — the RLS policy on `profiles` insert requires `auth.uid() = id`, which only holds once the auth user exists.
- **New tables need explicit grants**: `supabase/migrations/0003_grants.sql` exists because tables created via raw SQL migrations (rather than the Supabase Dashboard) don't automatically get anon/authenticated/service_role privileges on this Supabase CLI/Postgres image — RLS policies alone aren't enough, every API query 403s with `permission denied for table ... (42501)` without them. If you add a new table in a later migration and hit that error, add the same `grant`/`alter default privileges` pattern.
- **`supabase db reset` wipes seeded data**: it drops and replays every migration from scratch — fine for schema changes, but it also deletes anything inserted outside a migration, including the demo posts from `scripts/seed-test-posts.mjs`. After running `db reset` (e.g. to apply a new migration locally), re-run `nvm exec 22 node scripts/seed-test-posts.mjs` or the browse/home pages will look empty. This already happened once (Task 1 of the messaging feature ran `db reset` and silently wiped all seeded posts).
- **Redirect-after-login pattern**: any nav link/action that should work whether or not the user is logged in (e.g. "Messages") should still render when logged out, but point at `/login` with router state `{ from: '<target path>' }` instead of hiding itself. `LoginPage`/`SignupPage` both read `location.state?.from` and `navigate(from)` after a successful sign in/up (falling back to `/`), and forward that same state through the Log in ↔ Sign up switch link so either auth path redirects correctly. Reuse this pattern for future protected actions rather than inventing a new one.
- **Pages that need a real per-user query (not just a nav-link gate) must guard themselves too, and must wait on `useAuth()`'s `loading` flag before redirecting.** `MyPostsDashboard.jsx` is the first page to do this: the nav link alone only stops users who click through it — visiting the URL directly while logged out bypasses it entirely. Naively redirecting whenever `!user` also mis-fires on every load for a genuinely logged-in user, because `AuthContext`'s initial `supabase.auth.getSession()` call is async — `user` is briefly `null` before it resolves. Gate the redirect on `!authLoading && !user`, not just `!user` (see `MyPostsDashboard.jsx`'s effect). No other page currently reads `loading` from `useAuth()`; reuse this pattern for future pages that need real auth-gated data, not just nav visibility.
- **`ConversationRow` is a wrapper div with two sibling buttons, not one button**: it needs both a "select this conversation" click target and a "delete" click target, and a `<button>` cannot contain another `<button>` (invalid HTML — same class of bug as the `PostCard`/`Link` nesting issue above). `.conversation-row` (div) → `.conversation-row-select` (button) + `.conversation-row-delete` (button), siblings, not nested.
- **`.conversation-row-delete` is icon-only (`TrashIcon.jsx`), no visible text**: it has no `getByText('Delete')` target — query it via `getByRole('button', { name: 'Delete conversation with <name>' })` (the `aria-label`), as the existing tests in `ConversationRow.test.jsx` do.
- **`MessagesPage`'s `setActiveId` call is deliberately nested inside the `setConversations` updater** (in the `location.state`-driven open/create effect) — looks like it could be pulled out, but don't: `src/main.jsx` wraps the app in `<StrictMode>`, which double-invokes effects in dev, and only reading the just-created conversation back out of `prev` (the updater's own argument) lets the second invocation take the "already exists" branch instead of creating a duplicate thread. Pulling `setActiveId` out and computing `existing` from the `conversations` state variable directly would reintroduce a duplicate-conversation bug under StrictMode.
- **`@tensorflow-models/coco-ssd`/`mobilenet` need `@tensorflow/tfjs` imported first, or `model.load()` throws `"No backend found in registry."`** — those packages only depend on `@tensorflow/tfjs-core` (tensor APIs), not a backend implementation; the CPU/WebGL backends are registered as a side effect of importing the `@tensorflow/tfjs` umbrella package. `analyzePhoto.js`'s `ensureTfjsBackend()` dynamic-imports `@tensorflow/tfjs` before either model's `load()` call, memoized alongside the model promises so it only happens once per page. This bug shipped once already: every test mocks `coco-ssd`/`mobilenet` entirely, so real TF.js internals (including backend registration) are never exercised by the test suite — this class of bug only surfaces by actually running the feature in a browser. If you touch `photoAnalysis/analyzePhoto.js`, verify in a real browser, not just `npm test`.
- **Page-level filter/UI state should live in the URL (`useSearchParams`), not just `useState`, if the page can be navigated away from and back to**: React Router unmounts a page's component when the route changes (e.g. `/browse` → `/post/:id`) and mounts a fresh instance on return, silently resetting any plain `useState`. `BrowseFeedPage.jsx` hit this — filters reset on browser back — fixed by reading initial filter state from `useSearchParams()` and syncing changes back via `setSearchParams(params, { replace: true })` (`replace`, not push, so every filter tweak doesn't grow browser history). This is also what makes the browser back button restore the exact filters that were active before navigating away — it's just returning to the same URL. Reuse this pattern for other filter/search UIs rather than inventing a new one.
- **`setSearchParams(params, { replace: true })` must skip the call when `params` already equals the current `searchParams`** — react-router mints a brand new `location.key` on *every* `navigate`/`setSearchParams` call, push or replace, regardless of whether the resulting URL actually changed. `BrowseFeedPage.jsx`'s filter-sync effect originally called `setSearchParams` unconditionally on every render of that effect (including right on mount, writing back the same params it had just read), which silently broke `useScrollRestoration`'s key-based lookup (see below) by invalidating the just-restored key before the async posts fetch had a chance to render and get scrolled to. Always compare `params.toString() !== searchParams.toString()` before calling `setSearchParams`, in this file or any future one that does URL-synced state.
- **`useScrollRestoration.js` (wired once in `Layout.jsx`) restores scroll position across browser back/forward** (e.g. clicking a post from `/browse`, then going back) — keyed by react-router's per-history-entry `location.key` in `sessionStorage`, not by URL. Two non-obvious things if you touch it: (1) it saves scroll position on a **capture-phase `click` listener on `document`** (checking `event.target.closest('a')`), not in a `useEffect` cleanup on unmount — by the time any React effect cleanup runs (even `useLayoutEffect`'s), the new route's DOM has already been committed and the browser may have already clamped `window.scrollY` to fit the new, still-loading (shorter) page, so reading `window.scrollY` that late is unreliable; capturing it at click time, before React Router's own handling of that click runs, is the only reliable point. (2) restoring is polled via a `MutationObserver` (with a timeout fallback) rather than applied immediately, since the target page's content (e.g. `BrowseFeedPage`'s posts) may still be loading asynchronously and the page might not be tall enough yet to scroll to the saved position.
- **A grid child's `grid-area: <name>` doesn't fall back to auto-placement if a later media query drops `grid-template-areas` to `none`** — Chromium collapses every such child into the same cell instead (all get identical position). If a `.field-*`-style pattern (named-area assignment) needs a different layout at a breakpoint, explicitly reset `grid-area: auto` on the children within that same media query rather than only changing the parent's `grid-template-columns`/`grid-template-areas` (see `.post-detail-fields`'s `@media (max-width: 640px)` block in `theme.css`).
- **`postsApi.deletePost` does not clean up Storage files.** `post_photos` rows cascade-delete with the post (`references posts(id) on delete cascade` in `0001_init.sql`), but that only removes the Postgres rows — the actual image files stay orphaned in the `post-photos` Storage bucket. Not handled yet; fine at demo scale, but worth knowing before this app has real usage/storage costs.
- **The "Mark as resolved" flow is a neutral `.status-update-prompt` card (`PostDetailPage.jsx`), not a plain button** — reworked twice from a bare `<button>Mark as resolved</button>` based on user feedback. First pass: a celebratory `.resolve-prompt` card ("Did you find Milo? 🎉") with a small muted "remove instead" link underneath — rejected as "so sad," because stacking a quiet "give up" option directly under a celebration reads as emotional whiplash regardless of wording, and the muted/gray/small treatment made removal look like a consolation prize. Current version: one plainly-neutral card ("Is this post still active?") with two equally-weighted buttons side by side — `.status-update-confirm-button` (accent, "Mark as found"/"Mark as reunited" via `isMissing`) and `.status-update-remove-button` (outlined secondary, same visual recipe as `.possible-matches-recheck-button`, "Remove post" → `deletePost` via `window.confirm`, this app's standard destructive-action pattern). Neither button leads or presumes an outcome — don't reintroduce a single-button "resolve or nothing" pattern, and don't reintroduce a visual/tonal asymmetry between the two outcomes here.
