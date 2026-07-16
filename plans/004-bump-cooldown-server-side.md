# Plan 004: Enforce the 24-hour bump cooldown server-side

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 885a023..HEAD -- supabase/migrations/ src/features/posts/postsApi.js src/features/posts/postsApi.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `885a023`, 2026-07-16

## Why this matters

PetFinder lets a post owner "bump" their post to the top of Browse's default
sort order (`bumped_at`-based) once every 24 hours (`BUMP_COOLDOWN_HOURS` in
`src/features/posts/postBump.js`). This cooldown is currently enforced
**only** in the UI — the button is disabled client-side once `canBump()`
returns false — but the actual database write (`bumpPost` in `postsApi.js`)
has no server-side check at all. The `posts` table's UPDATE row-level
security policy only verifies the caller owns the post, never that enough
time has passed. This means anyone bypassing the UI (calling the Supabase
REST API directly, or just editing the disabled attribute in devtools) can
bump a post as often as they like, keeping it permanently at the top of
Browse and defeating the fairness the feature is meant to provide for every
other listing. This plan moves the cooldown check into the RLS policy itself
so it's enforced regardless of what client makes the request.

## Current state

- `src/features/posts/postBump.js` — full file (client-side-only check):
  ```js
  export const BUMP_COOLDOWN_HOURS = 24

  const MS_PER_HOUR = 60 * 60 * 1000

  export function canBump(post, now) {
    return now - new Date(post.bumped_at) >= BUMP_COOLDOWN_HOURS * MS_PER_HOUR
  }

  export function hoursUntilNextBump(post, now) {
    const remainingMs = BUMP_COOLDOWN_HOURS * MS_PER_HOUR - (now - new Date(post.bumped_at))
    return Math.max(0, Math.ceil(remainingMs / MS_PER_HOUR))
  }
  ```
- `src/features/posts/postsApi.js:79-82` — current `bumpPost` (no
  server-side gate):
  ```js
  // Moves a post to the top of Browse's default sort (see listPosts) by
  // resetting bumped_at to now — rate-limited client-side to once per
  // BUMP_COOLDOWN_HOURS (see postBump.js).
  export async function bumpPost(supabase, postId) {
    const { error } = await supabase.from('posts').update({ bumped_at: new Date().toISOString() }).eq('id', postId)
    if (error) throw error
  }
  ```
- `supabase/migrations/0001_init.sql:55-56` — the current UPDATE policy on
  `posts` (ownership-only, no timing check):
  ```sql
  create policy "owners can update their own posts" on posts
    for update using (auth.uid() = owner_id);
  ```
  This single UPDATE policy governs every kind of post update in the app
  (resolve, renew, bump, and — if ever added — edit). Adding a timing
  constraint directly to this policy would break `resolvePost`/`renewPost`,
  which have no reason to respect a bump cooldown. This plan does **not**
  modify this policy; instead it adds cooldown enforcement inside a
  dedicated Postgres function that `bumpPost` calls, which is the safer,
  narrower change (see Step 1).
- `src/features/posts/MyPostsDashboard.jsx:62-67,123` — the only UI call
  site for `bumpPost`, already gated behind the client-side `canBump` check
  via the `disabled={!bumpAllowed}` button attribute — this plan does not
  need to change this file; the client-side gate is a legitimate UX
  affordance (instant feedback) and should stay, it just isn't sufficient on
  its own.
- `src/features/posts/postsApi.test.js:70-74` — existing `bumpPost` test:
  ```js
  test('bumpPost updates bumped_at to move the post to the top', async () => {
    const postsQuery = createFakeQuery({ data: null, error: null })
    const supabase = createFakeSupabase({ posts: postsQuery })
    await expect(bumpPost(supabase, 'p1')).resolves.toBeUndefined()
  })
  ```
- `supabase/migrations/0006_post_lifecycle.sql` is the most recent existing
  migration (confirms next free number is `0007`, or higher if Plans
  002/003 already claimed `0007`/`0008` — check `ls supabase/migrations/`
  before creating this plan's migration file).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run tests | `npm test` | exit 0, all pass |
| Run just postsApi tests | `npm test -- postsApi` | exit 0 |
| Apply migrations locally | `supabase db reset` | exits 0 |
| Sanity-check schema/RLS | `nvm exec 22 node scripts/verify-schema.mjs` | prints `OK` |

## Scope

**In scope** (the only files you should create or modify):
- `supabase/migrations/000X_bump_cooldown_function.sql` (create — pick the
  next free number via `ls supabase/migrations/`)
- `src/features/posts/postsApi.js` (modify `bumpPost` only)
- `src/features/posts/postsApi.test.js` (modify the `bumpPost` test, add one
  more)

**Out of scope** (do NOT touch, even though they look related):
- Do not modify the `posts` table's general UPDATE RLS policy — it must
  keep working for `resolvePost`/`renewPost`, which have no cooldown.
- Do not change `postBump.js` (`canBump`/`hoursUntilNextBump`) — the
  client-side check stays as a UX affordance; this plan adds a
  server-side backstop alongside it, not a replacement.
- Do not change `MyPostsDashboard.jsx`'s bump button UI.

## Git workflow

- Branch: `plan-004-bump-cooldown-server-side` off `master`.
- Commit message style: short, imperative, no period — e.g. `Enforce bump
  cooldown server-side via a Postgres function`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a SECURITY DEFINER function that enforces the cooldown

Check the next free migration number first (`ls supabase/migrations/`), then
create `supabase/migrations/000X_bump_cooldown_function.sql`:

```sql
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
```

The `interval '24 hours'` here must match `BUMP_COOLDOWN_HOURS` (24) in
`postBump.js` — if that constant is ever changed, this function's interval
needs to change too (see Maintenance notes).

**Verify**: `cat supabase/migrations/000X_bump_cooldown_function.sql` → file
exists with the content above (X = the number you picked).

### Step 2: Call the function from bumpPost instead of a raw update

Replace `bumpPost` in `src/features/posts/postsApi.js` (currently lines
79-82) with:

```js
// Moves a post to the top of Browse's default sort (see listPosts) by
// resetting bumped_at to now. Calls the bump_post() Postgres function
// (see supabase/migrations/000X_bump_cooldown_function.sql) rather than a
// plain update — the function enforces both ownership and the
// BUMP_COOLDOWN_HOURS cooldown (see postBump.js) server-side, so this can't
// be bypassed by calling the API directly. The client-side canBump() check
// still runs first (in MyPostsDashboard.jsx) purely for instant UI feedback
// (disabling the button) — this server-side check is the actual guarantee.
export async function bumpPost(supabase, postId) {
  const { error } = await supabase.rpc('bump_post', { post_id: postId })
  if (error) throw error
}
```

**Verify**: `grep -n "bump_post\|rpc" src/features/posts/postsApi.js` → shows
`bumpPost` calling `supabase.rpc('bump_post', { post_id: postId })`.

### Step 3: Update the postsApi test for bumpPost

Replace the existing test in `src/features/posts/postsApi.test.js` (the
`createFakeSupabase` test double has no built-in `.rpc()` support — check
`src/testUtils/fakeSupabase.js`'s `createFakeSupabase` function; if it
doesn't already return an `rpc` method, add one as part of this step,
matching the existing style):

First, check whether `createFakeSupabase` needs an `rpc` stub added. Its
current shape:

```js
export function createFakeSupabase(routes) {
  return {
    from: (table) => routes[table],
    storage: {
      from: (bucket) =>
        routes.storage?.[bucket] ?? { upload: () => Promise.resolve({ error: null }) },
    },
  }
}
```

Add an `rpc` method so tests can assert on it:

```js
export function createFakeSupabase(routes) {
  return {
    from: (table) => routes[table],
    storage: {
      from: (bucket) =>
        routes.storage?.[bucket] ?? { upload: () => Promise.resolve({ error: null }) },
    },
    rpc: routes.rpc ?? (() => Promise.resolve({ error: null })),
  }
}
```

This is additive (a default no-op that resolves successfully) — it doesn't
change behavior for any existing test that doesn't pass `routes.rpc`.

Then replace the `bumpPost` test in `postsApi.test.js`:

```js
test('bumpPost calls the bump_post RPC with the post id', async () => {
  const rpcFn = vi.fn(() => Promise.resolve({ error: null }))
  const supabase = createFakeSupabase({ rpc: rpcFn })
  await expect(bumpPost(supabase, 'p1')).resolves.toBeUndefined()
  expect(rpcFn).toHaveBeenCalledWith('bump_post', { post_id: 'p1' })
})

test('bumpPost throws when the RPC returns an error', async () => {
  const rpcFn = vi.fn(() => Promise.resolve({ error: new Error('cooldown active') }))
  const supabase = createFakeSupabase({ rpc: rpcFn })
  await expect(bumpPost(supabase, 'p1')).rejects.toThrow('cooldown active')
})
```

(Same `vi` import note as Plan 003 — confirm `vi` is available; add
`import { vi } from 'vitest'` at the top if not already present.)

**Verify**: `npm test -- postsApi` and `npm test -- fakeSupabase` → all
pass, including the two new `bumpPost` tests and any existing
`fakeSupabase.test.js` tests (check that file still passes since you
modified the shared test util — `src/testUtils/fakeSupabase.test.js`).

### Step 4: Apply the migration locally and confirm the function behaves correctly

If the local Supabase stack is available:

```bash
supabase db reset
nvm exec 22 node scripts/seed-test-posts.mjs
nvm exec 22 node scripts/verify-schema.mjs
```

**Verify**: All three exit 0 with no errors. `scripts/verify-schema.mjs`
prints `OK`. If you have the ability to test via `psql` or the Supabase
Studio SQL editor against the local instance, you may additionally confirm:
calling `select bump_post('<a real post id>')` as the post's owner within
24h of its `bumped_at` leaves `bumped_at` unchanged (query the row before
and after); calling it as a different authenticated user also leaves it
unchanged. This manual check is optional but recommended if you have DB
access — not a blocking done-criterion.

If the local Supabase stack is not available, skip this step and note it
was skipped in your final report.

### Step 5: Commit

```bash
git add supabase/migrations/000X_bump_cooldown_function.sql src/features/posts/postsApi.js src/features/posts/postsApi.test.js src/testUtils/fakeSupabase.js
git commit -m "Enforce bump cooldown server-side via a Postgres function"
```

**Verify**: `git log -1 --stat` → shows exactly the four files above.

## Test plan

- `src/testUtils/fakeSupabase.js`: add an `rpc` stub to `createFakeSupabase`
  (additive, default no-op).
- `src/features/posts/postsApi.test.js`: replace the single `bumpPost` test
  with two — one confirming the RPC is called with the right arguments, one
  confirming an RPC error propagates as a thrown error (matching the
  existing `if (error) throw error` pattern used by every other function in
  this file).
- Regression: `npm test` → all existing tests still pass (the `rpc` addition
  to `createFakeSupabase` must not break any test that doesn't use it).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `supabase/migrations/000X_bump_cooldown_function.sql` exists, defines
      `bump_post(post_id uuid)` as `security definer`, checks both
      `owner_id = auth.uid()` and the 24-hour cooldown, and grants execute
      to `authenticated`
- [ ] `bumpPost` in `postsApi.js` calls `supabase.rpc('bump_post', ...)`
      instead of a raw `.update()`
- [ ] `npm test` exits 0, includes the two new `bumpPost` tests passing
- [ ] `supabase db reset` succeeds with no SQL errors (or explicitly noted
      as skipped)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `postBump.js`'s `BUMP_COOLDOWN_HOURS` is not `24` when you read it (the
  codebase has drifted — update the migration's `interval` to match
  whatever the live constant is, and note the discrepancy in your report).
- `supabase/migrations/0001_init.sql`'s UPDATE policy on `posts` has changed
  from the ownership-only check shown above (e.g. some other plan already
  added a timing constraint to it) — re-read it before writing the function,
  since a conflicting constraint there could make this function's own check
  redundant or, worse, contradictory.
- `supabase db reset` fails with an error unrelated to a fixable syntax typo
  — report it as an environment issue.

## Maintenance notes

- `BUMP_COOLDOWN_HOURS` now effectively exists in two places: the
  JavaScript constant in `postBump.js` (used for the client-side UI gate and
  the `hoursUntilNextBump` countdown display) and the hardcoded
  `interval '24 hours'` in this migration (the actual enforcement). If
  `BUMP_COOLDOWN_HOURS` is ever changed, whoever changes it must also write
  a new migration updating (or replacing) `bump_post()`'s interval — there
  is no single source of truth across the JS/SQL boundary. Leave a comment
  pointing this out in `postBump.js` if you have the opportunity.
- This same `security definer` function pattern (an RPC that enforces a
  business-rule constraint that plain RLS `using`/`with check` clauses can't
  express cleanly alongside other required updates on the same table) is
  reusable if a future feature needs a similar narrowly-scoped server-side
  rule — e.g. a future rate limit on `renewPost`.
