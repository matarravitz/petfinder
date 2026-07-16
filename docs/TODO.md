# To-do / deferred work

Cross-cutting backlog items that came up during feature work but were explicitly deferred rather than built. Each item should say which feature/discussion it came from and why it was deferred, so it doesn't need to be re-litigated from scratch later.

## Backfill `photo_embedding` for existing posts

Posts created before the `post-matching.md` feature ships (including everything from `scripts/seed-test-posts.mjs`) will have `photo_embedding: null` and only participate in match scoring on fields (location/date), not visual similarity, until edited/resaved.

**From:** `post-matching.md` (2026-07-15). Needs either a one-off backfill script (fetch each post's cover photo, run it through the same embedding step, patch the row) or an update to the seed script for future reseeds.

## pgvector / server-side similarity search

If the number of active posts ever grows large enough that the fields-first prefilter + client-side cosine similarity in `matchPosts.js` becomes a real performance bottleneck, consider a `pgvector` column + index for server-side nearest-neighbor search instead.

**From:** `post-matching.md` (2026-07-15). Not needed at current/expected scale — noted so it isn't reinvented under pressure later.

## Make expired-post deletion truly automatic once this app has a backend

Post expiry/auto-removal (`postExpiry.js`, `MyPostsDashboard.jsx`) is currently lazy, not truly automatic: an expired active post is hidden from Browse immediately (computed client-side), but the row is only actually deleted the next time the *owner's own* dashboard happens to load — this app has no backend scheduler at all (no cron, no Edge Functions), so nothing runs unless a browser is open on the right page. If a post's owner never revisits the app, its row lingers (invisible, but not deleted) indefinitely.

**Do this:** once this app has any real backend component, add a Supabase Edge Function that runs `deletePost`-equivalent logic (delete active posts where `renewed_at + 60 days < now()`) on a `pg_cron` schedule (e.g. daily) — independent of anyone visiting the site. At that point the client-side lazy sweep in `MyPostsDashboard.jsx` can stay as a fast-path (no harm in both existing), but the cron job becomes the actual guarantee.

**From:** post-lifecycle feature discussion (2026-07-16) — explicitly chosen as the lazy/client-side approach for the first pass, since real backend infrastructure would be the first of its kind in this project and wasn't asked for at the time. Revisit once this app gets a backend for any other reason, or before a production deployment with real storage/DB costs makes lingering undeleted rows matter.

## Real notification system

No push/email notifications exist anywhere in the app today. `messaging.md`'s chat is mock-data/in-memory only, and `post-matching.md`'s match suggestions are pull-based (only shown when the owner views their own post) specifically because this doesn't exist yet.

**From:** `messaging.md` (original non-goal) and reconfirmed by `post-matching.md` (2026-07-15). Would unblock: real-time "someone messaged you" alerts, "a possible match was found for your post" alerts.

## Deferred from the 2026-07-16 codebase audit

A standard-depth, nine-category `/improve`-skill audit ran on 2026-07-16 (commit `885a023`) across correctness, security, performance, test coverage, tech debt, dependencies, DX, docs, and direction. 9 of 23 findings (the top-leverage batch) were turned into plans in `plans/` — see `plans/README.md`. The rest are listed here, still worth doing, just deprioritized by leverage rather than rejected. Re-audit these before assuming they're still accurate if significant time has passed.

**Bugs/tests:**
- **Stale "Analyze Photo" result can overwrite the currently-selected photo.** `CreatePostForm.jsx`'s `handleAnalyzePhoto` reads `files[0]` once, then `await`s the (multi-second, on first use) TF.js analysis — if the user swaps to a different photo while that's pending, the eventual `setForm` calls apply unconditionally with no staleness check, silently auto-filling fields from a photo the user already replaced. Needs a staleness guard (capture the analyzed `File` reference, compare before applying results).
- **`LocationPicker.jsx` has no tests** despite `CLAUDE.md`'s own Gotchas section flagging its debounce/`skipNextAutoSearch` guard as easy to accidentally break. The one thing the project's docs say is fragile has zero regression coverage.
- **`imageCanvas.js` (`loadImageElement`/`cropToImageData`) is never exercised by a real test** — every consumer test (`analyzePhoto.test.js`, `getPhotoEmbedding.test.js`) mocks the whole module, so the actual object-URL/crop-math implementation has no coverage.
- **`models.js` needs broader test coverage** beyond the retry-after-failure regression test added when the TF.js model-loader bug was fixed (see `plans/005-tfjs-model-loader-retry.md`) — `ensureTfjsBackend` and both getters' full happy-path behavior isn't directly tested.

**Performance:**
- **No route-based code splitting.** `App.jsx` statically imports every route; `leaflet`/`react-leaflet` (only needed on `/post/new`) and the 629-line `CreatePostForm` ship in the single initial bundle loaded by every visitor, including anonymous ones on `/`, `/login`, `/browse`. Confirmed via a real `vite build` — the 590KB entry chunk contains `leaflet`. (Note: the TF.js models themselves already code-split correctly via dynamic `import()` in `photoAnalysis/models.js` — this item is specifically about route-level splitting, which doesn't exist at all.)
- **Browse radius slider recomputes filter/sort unmemoized on every tick.** `BrowseFeedPage.jsx` calls `filterAndSortPosts` directly in the render body with no `useMemo`, and the `<input type="range">` fires on every drag tick — the full haversine+sort pass re-runs many times per second while dragging. Masked today by small post counts; scales with catalog size.
- **`listPosts`/`listPostsByOwner` have no pagination** — every Browse/My-Posts load fetches the entire matching post set, unbounded, regardless of what's actually shown after client-side filtering.

**Security:**
- **Post-photo uploads have no client- or bucket-level type/size validation.** The file input only sets `accept="image/*"` (a picker hint, not an enforced constraint); the `post-photos` bucket has no `allowed_mime_types`/`file_size_limit` beyond the project-wide 50MiB default, and objects are served same-origin with the app. An arbitrary file (including HTML/SVG) up to 50MiB is uploadable to a public, same-origin bucket today.
- **`0003_grants.sql` grants broader-than-needed privileges** (`grant all` including `TRUNCATE`/`TRIGGER`/routines, plus a blanket `alter default privileges` covering all future tables/routines) — narrower explicit grants (`select, insert, update, delete`) would close a latent, forward-looking exposure where any future SQL function becomes silently callable by `anon` via PostgREST unless someone remembers to `REVOKE` it. Needs care: must be validated against `scripts/verify-schema.mjs` before landing, since this migration exists specifically to prevent 42501 permission errors.

**DX & tooling:**
- **No ESLint installed** — six `// eslint-disable-next-line react-hooks/exhaustive-deps` comments across the codebase reference a linter that doesn't exist in `package.json`, giving false confidence that those cases were reviewed by tooling rather than just commented as if they were.
- **No README.md or `.env.example`** — onboarding requires reverse-engineering a setup sequence from `CLAUDE.md` (a dense reference doc, not an onboarding walkthrough) and hand-crafting `.env.local` from scratch with no template to diff against.
- **Node ≥22 requirement is documented but unenforced** — reproduced directly: `npm test` and `npm run build` both pass silently on Node 20.20.2 despite `package.json`'s `engines` field and `.nvmrc` both requiring 22. No `.npmrc` with `engine-strict=true` exists to hard-fail on the wrong version.

**Tech debt:**
- **`CreatePostForm.jsx` is a 629-line god component** — 3x the next-largest file in the app (`PostDetailPage.jsx` at 219 lines). Mixes static domain-data constants, form/auto-fill state logic, async photo-analysis orchestration, and ~350 lines of JSX in one file. The auto-fill/manual-conflict logic is subtle (has its own prior-bug-fix comments) — any extraction needs care to avoid reintroducing that class of bug.

**Dependencies (watch-item, no action needed now):**
- **`@tensorflow-models/coco-ssd`/`mobilenet` are ~2.7 years stale** relative to `@tensorflow/tfjs` (last published 2023-11 vs. 2025-01). Not currently broken — just flagged so a future `@tensorflow/tfjs` major-version bump re-validates these two packages first rather than assuming compatibility.

**Direction (product options, not bugs — see `plans/README.md`'s note that these were deprioritized, not rejected):**
- **No edit-post flow.** Posts can be created, bumped, renewed, resolved, and deleted, but never edited — the `posts` UPDATE RLS policy already permits it (`0001_init.sql`); the gap is entirely in the app layer (`postsApi.js` has no `updatePost`, no route/form exists). Open question if built: whether an edit re-triggers `photo_embedding` computation/matching.
- **Messaging has no persistence.** `src/features/messages/` is mock-data/in-memory only (see `messaging.md`) — every conversation resets on page reload. Supabase's Auth/Postgres/RLS/Realtime are already running and unused for this. This is the prerequisite substrate the "real notification system" item above would need anyway. Largest-scope item in this list if picked up.
- **No moderation/reporting surface** on a fully public post model that can include real phone numbers (`posts` RLS: `for select using (true)`, no admin/role concept exists in `profiles`). A minimal `post_reports` table + RLS + a "Report this post" action would be cheap; a real admin review workflow is a separate, bigger question.
- **No match-count badge on My Posts** — explicitly self-identified as an open follow-up in `docs/features/post-matching.md`'s own Follow-up section (deferred on purpose when `MyPostsDashboard` shipped, to avoid running the matching pipeline per post just to render a list). The scoring infra already exists; cheapest version is a single batched check on dashboard mount, not N per-post calls.

**From:** `/improve` skill audit, 2026-07-16, commit `885a023`. Full findings table (including the 9 selected for `plans/`) was presented to the user in-session; not preserved elsewhere, so this is the durable record of the deferred half.
