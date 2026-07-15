# Feature: Cross-post match suggestions

**Status:** implemented.
**Last updated:** 2026-07-15

## Goal

When someone posts a missing or found pet, help them find the corresponding post on the other side (missing↔found) without manually browsing/filtering. A missing-cat poster should be nudged toward a found-cat post that's actually their pet, and vice versa. Entirely pull-based (no push notifications) and entirely client-side ML (no backend inference, no LLM vision API) — consistent with `photo-autofill.md`'s existing constraints.

This was explicitly called out as a non-goal in `photo-autofill.md`'s first pass ("No cross-post photo matching or notifications... tracked as a future track, not this one"). This doc is that future track.

## Non-goals (this pass)

- No push/email notifications when a new match appears — blocked on a real notification system that doesn't exist yet (same gap noted in `messaging.md`). Matches are surfaced only when the post owner views their own post.
- No "My Posts" dashboard — tracked in `docs/TODO.md`, not built here. Today a user finds their own post the same way anyone else does (browse or a direct link); this feature's matches only surface on `PostDetailPage`, not a new page.
- No backfilling `photo_embedding` for posts created before this feature ships (including seeded demo posts) — they simply have `photo_embedding: null` and participate in matching on fields only, until edited/resaved. Tracked in `docs/TODO.md`.
- No pgvector / server-side vector search — the fields-first prefilter is expected to keep the candidate set small enough for plain client-side cosine similarity. Tracked in `docs/TODO.md` as a future optimization if scale ever requires it.
- No cross-species matching — a missing cat is only ever matched against found cats, never found dogs.
- No matching for resolved posts — matches only compute/display for posts with `status = 'active'`.

## Data model changes

Add `photo_embedding` (nullable `jsonb`, a ~1024-number float array) to `posts`, via `supabase/migrations/0005_photo_embedding.sql`. Nullable so existing rows keep working — see Non-goals re: backfilling. No new grants needed (existing table-level grants on `posts` already cover new columns).

`buildPostPayload.js` passes `photo_embedding` through the same way it passes other optional/computed fields, sourced from the embedding computed during the create flow (see below) — `null` if computation failed or never completed.

## Embedding computation

Reuses the already-loaded MobileNet model from the photo-autofill pipeline (`analyzePhoto.js`), but calls its embedding mode instead of (or alongside) its classification mode: `model.infer(imageElement, true)` returns a ~1024-dimension feature vector instead of ImageNet class probabilities. Runs on the same cover photo (`files[0]`) that `analyzePhoto.js` already uses.

Unlike breed/species/color auto-fill, this is **not gated behind the "Analyze Photo" button** — it needs to run for every post regardless of whether the user opts into auto-fill, since matching depends on both sides of a pair having an embedding. It starts automatically in the background as soon as the first photo is selected in `CreatePostForm`, running in parallel while the user fills out the rest of the form. On submit, the form awaits that in-flight promise; if it hasn't resolved yet, submission waits briefly for it, and if it fails or the browser lacks TF.js support, submission proceeds anyway with `photo_embedding: null` — same progressive-enhancement principle as the rest of photo analysis (nothing here ever blocks posting).

## Matching algorithm

Pure, unit-testable scoring function (new module, e.g. `src/features/posts/matchPosts.js`), same pattern as `filterPosts.js`.

**Prefilter (hard filters, plain Postgrest query — cuts the candidate set before any scoring):**
- `type` = opposite of the current post's type (missing → search found, found → search missing)
- `species` = current post's species (exact match)
- `status = 'active'`
- excludes the current post itself

**Scoring (client-side, over the prefiltered candidate set):** a weighted blend of up to three signals, each normalized to roughly 0-1:
- **Visual similarity** (weight 0.5 when available): cosine similarity of `photo_embedding` vectors, via a small pure `cosineSimilarity.js` helper (unit tested directly: identical vectors → 1, orthogonal → 0).
- **Location proximity** (weight 0.3): `haversineDistanceKm` (existing `src/lib/distance.js`), scored as `max(0, 1 - distanceKm / radiusCapKm)` — closer scores higher, capped at a `radiusCapKm` of **50** (matches `BrowseFeedPage`'s current default radius, which today is only a local `useState(50)` literal, not an exported constant — this is a plain local constant in `matchPosts.js`, not an import from `BrowseFeedPage`).
- **Date proximity** (weight 0.2): exponential decay over the number of days between the two posts' `date_lost_or_found` values. Not a hard cutoff — a pet can be found weeks after going missing, so a large date gap should lower the score, not exclude the candidate.

If either post in a pair has `photo_embedding: null`, drop the visual-similarity term entirely and **renormalize the remaining weights** (location 0.6 / date 0.4) rather than scoring it as 0 or excluding the candidate — an old post without an embedding should still be able to surface as a fields-only match, just a weaker one.

Combined score must be **≥ 0.5** to be shown at all (tunable constant, same "not exposed to the user" pattern as the existing confidence thresholds in `analyzePhoto.js`). Show at most the top **5** candidates, sorted by score descending.

## UI & placement

New "Possible Matches" section on `PostDetailPage.jsx`, visible **only to the post owner** (`user && user.id === post.owner_id`, same conditional shape as the existing owner-only "Mark as resolved" button) and **only for active posts** — resolved posts never show this section.

- **Automatic first check:** runs once, automatically, the first time the owner opens their own post's detail page — no button needed to trigger the initial check. This is pull-based/automatic-on-view, not a push notification, so it satisfies "automatic" without needing a background job or notification system.
- **Manual re-check:** a "Check for new matches" button below the results re-runs the same query (covers new posts that appeared after the initial check — e.g. a found post created a week after a missing post).
- **Result display:** a small horizontal row of candidate cards, visually reusing the existing `PostCard` photo-forward look and single-`Link`-per-card pattern (see `PostCard`'s "whole card is a Link" gotcha — don't nest another `Link` inside these either). Each card shows a soft qualitative label rather than a raw score — e.g. **"Strong match"** for score ≥ 0.75, **"Possible match"** for 0.5-0.75 — so it reads as a nudge to go check, not a scientific verdict.
- **Empty state:** quiet, non-error styling — "No possible matches found yet." No animation, no alarming icon; this is a nice-to-have surface, not a required step in posting/resolving.
- Clicking a candidate card navigates to that post's `PostDetailPage` like any other post link — no special "confirm this is your pet" flow in this pass; the owner uses the existing "Contact publisher" button on that post if they think it's a match, and existing "Mark as resolved" once it's confirmed off-platform. No new cross-post linking/merging behavior.

## Error handling

- Embedding computation failing at post-creation time never blocks submission (see Embedding computation above) — the post is created with `photo_embedding: null`.
- If the matching query itself fails (network/Supabase error) when `PostDetailPage` loads, fail into the same quiet empty state, optionally with a small inline "Couldn't check for matches right now" note — never a blocking error, since viewing the post itself must keep working regardless.

## Testing

- `matchPosts.js` — pure function, unit tested with plain fixtures (candidate list + current post → scored/sorted/thresholded results), same pattern as `filterPosts.test.js`. Cover: visual+location+date all present, embedding missing on one/both sides (renormalization), below-threshold candidates excluded, more than 5 above-threshold candidates truncated to 5.
- `cosineSimilarity.js` — unit tested directly: identical vectors → 1, orthogonal vectors → 0, opposite vectors → -1.
- Embedding computation itself mocked in `CreatePostForm.test.jsx`, same way `analyzePhoto.js`'s classification pipeline is already mocked — no real TF.js inference in jsdom.
- `PostDetailPage.test.jsx` — new cases: owner sees the Possible Matches section (mocked match-fetching), non-owner never sees it, resolved post never shows it, empty state renders when no matches, "Check for new matches" button re-triggers the query.

## Follow-up (tracked in `docs/TODO.md`, explicitly out of scope here)

- "My Posts" dashboard with a match-count badge per post.
- Backfilling `photo_embedding` for posts created before this feature (existing posts + `scripts/seed-test-posts.mjs`).
- pgvector-based server-side similarity search, if the naive client-side approach becomes a real scale bottleneck.
- Push/email notifications when a new match appears for one of your posts (blocked on a real notification system).
