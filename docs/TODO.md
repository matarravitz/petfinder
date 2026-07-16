# To-do / deferred work

Cross-cutting backlog items that came up during feature work but were explicitly deferred rather than built. Each item should say which feature/discussion it came from and why it was deferred, so it doesn't need to be re-litigated from scratch later.

## Backfill `photo_embedding` for existing posts

Posts created before the `post-matching.md` feature ships (including everything from `scripts/seed-test-posts.mjs`) will have `photo_embedding: null` and only participate in match scoring on fields (location/date), not visual similarity, until edited/resaved.

**From:** `post-matching.md` (2026-07-15). Needs either a one-off backfill script (fetch each post's cover photo, run it through the same embedding step, patch the row) or an update to the seed script for future reseeds.

## pgvector / server-side similarity search

If the number of active posts ever grows large enough that the fields-first prefilter + client-side cosine similarity in `matchPosts.js` becomes a real performance bottleneck, consider a `pgvector` column + index for server-side nearest-neighbor search instead.

**From:** `post-matching.md` (2026-07-15). Not needed at current/expected scale — noted so it isn't reinvented under pressure later.

## Real notification system

No push/email notifications exist anywhere in the app today. `messaging.md`'s chat is mock-data/in-memory only, and `post-matching.md`'s match suggestions are pull-based (only shown when the owner views their own post) specifically because this doesn't exist yet.

**From:** `messaging.md` (original non-goal) and reconfirmed by `post-matching.md` (2026-07-15). Would unblock: real-time "someone messaged you" alerts, "a possible match was found for your post" alerts.
