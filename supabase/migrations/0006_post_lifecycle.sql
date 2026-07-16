-- renewed_at: base timestamp the 2-month expiry window is computed from (see
-- src/features/posts/postExpiry.js). Defaults to created_at at insert time
-- (both default to now() within the same insert statement); reset to now()
-- whenever the owner responds "still looking" to the expiring-soon notice.
alter table posts add column renewed_at timestamptz not null default now();

-- bumped_at: drives Browse's default sort order (newest/most-recently-bumped
-- first) and the once-per-24h "bump to top" cooldown (see
-- src/features/posts/postBump.js). Defaults to created_at at insert time.
alter table posts add column bumped_at timestamptz not null default now();
