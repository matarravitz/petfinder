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
