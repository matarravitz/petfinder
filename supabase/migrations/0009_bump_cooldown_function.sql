-- bumpPost() (see src/features/posts/postsApi.js) previously called a plain
-- `update posts set bumped_at = now() ...`, which only the ownership-scoped
-- RLS UPDATE policy gated — with no server-side check on the 24h cooldown
-- (postBump.js's BUMP_COOLDOWN_HOURS), only enforced client-side via the
-- disabled button state. A direct REST call could bump a post as often as
-- desired. This function moves the cooldown check server-side: it silently
-- no-ops (does not raise) if the post isn't owned by the caller or is still
-- within cooldown, matching the RLS convention where a disallowed update
-- simply matches zero rows rather than erroring.
create or replace function bump_post(post_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update posts
  set bumped_at = now()
  where id = post_id
    and owner_id = auth.uid()
    and bumped_at <= now() - interval '24 hours';
$$;

grant execute on function bump_post(uuid) to authenticated;
