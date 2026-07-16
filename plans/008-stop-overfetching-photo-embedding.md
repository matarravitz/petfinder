# Plan 008: Stop over-fetching the photo_embedding column on list queries

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 885a023..HEAD -- src/features/posts/postsApi.js src/features/posts/postsApi.test.js`
> If the in-scope file changed since this plan was written, compare the
> "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (touches different functions in `postsApi.js` than
  Plans 003/004/006 — `listPosts`/`listPostsByOwner` vs. `deletePost`/
  `deletePosts`/`bumpPost` — no line overlap)
- **Category**: perf
- **Planned at**: commit `885a023`, 2026-07-16

## Why this matters

`posts.photo_embedding` is a `jsonb` column storing a ~1024-number MobileNet
feature vector, computed client-side at post-creation time and used only by
the cross-post match-suggestion feature (`matchPosts.js`, queried via
`listCandidatePostsForMatching`). `listPosts` (used by the Browse feed) and
`listPostsByOwner` (used by My Posts) both `select('*', ...)`, which
includes this column on every row — even though neither `BrowseFeedPage.jsx`
nor `MyPostsDashboard.jsx` nor `PostCard.jsx` ever reads `photo_embedding`.
Every visit to `/browse` or `/my-posts` therefore downloads a sizeable,
entirely unused embedding array per post with a photo, for no reason. This
plan narrows the column list on those two queries to exclude
`photo_embedding`, leaving `listCandidatePostsForMatching` (which actually
needs it) untouched.

## Current state

- `src/features/posts/postsApi.js:1-12` — `listPosts` (over-fetches):
  ```js
  // Ordered by bumped_at (not created_at) so a "bump to top" (see postBump.js)
  // actually moves a post to the front — bumped_at defaults to created_at at
  // insert time, so this is equivalent to created_at ordering until a post is
  // ever bumped.
  export async function listPosts(supabase) {
    const { data, error } = await supabase
      .from('posts')
      .select('*, post_photos(*), profiles(display_name)')
      .order('bumped_at', { ascending: false })
    if (error) throw error
    return data
  }
  ```
- `src/features/posts/postsApi.js:59-67` — `listPostsByOwner` (over-fetches,
  same pattern):
  ```js
  export async function listPostsByOwner(supabase, ownerId) {
    const { data, error } = await supabase
      .from('posts')
      .select('*, post_photos(*), profiles(display_name)')
      .eq('owner_id', ownerId)
      .order('bumped_at', { ascending: false })
    if (error) throw error
    return data
  }
  ```
- `supabase/migrations/0001_init.sql:11-31` — the full `posts` table column
  list (needed to write an explicit column list excluding only
  `photo_embedding`):
  ```sql
  create table posts (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references profiles(id) on delete cascade,
    type post_type not null,
    species text not null,
    breed text,
    color text,
    size text,
    collar boolean not null default false,
    collar_description text,
    microchipped microchip_status not null default 'unknown',
    distinctive_markings text,
    pet_name text,
    reward_amount numeric,
    location_lat double precision not null,
    location_lng double precision not null,
    location_text text not null,
    date_lost_or_found date not null,
    status post_status not null default 'active',
    created_at timestamptz not null default now()
  );
  ```
  Plus columns added in later migrations: `phone_number` (text, nullable —
  `0004_posts_phone_number.sql`), `photo_embedding` (jsonb, nullable — the
  column being excluded, `0005_photo_embedding.sql`), `renewed_at`
  (timestamptz — `0006_post_lifecycle.sql`), `bumped_at` (timestamptz —
  `0006_post_lifecycle.sql`).
- `src/features/posts/postsApi.js:84-94` — `listCandidatePostsForMatching`,
  which DOES need `photo_embedding` and must NOT be changed by this plan:
  ```js
  export async function listCandidatePostsForMatching(supabase, { type, species, excludePostId }) {
    const { data, error } = await supabase
      .from('posts')
      .select('*, post_photos(*), profiles(display_name)')
      .eq('type', type)
      .eq('species', species)
      .eq('status', 'active')
      .neq('id', excludePostId)
    if (error) throw error
    return data
  }
  ```
- Confirmed via repo-wide search: no consumer of `listPosts` or
  `listPostsByOwner`'s return value reads `.photo_embedding` anywhere in
  `src/features/posts/BrowseFeedPage.jsx`, `PostCard.jsx`,
  `MyPostsDashboard.jsx`, or `filterPosts.js`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run tests | `npm test` | exit 0, all pass |
| Run just postsApi tests | `npm test -- postsApi` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/features/posts/postsApi.js` (modify `listPosts` and
  `listPostsByOwner` only — do not touch `listCandidatePostsForMatching`,
  `getPost`, `createPost`, or any other function in this file)
- `src/features/posts/postsApi.test.js` (update the `select` assertions if
  any existing test checks the exact select string — see Step 2)

**Out of scope** (do NOT touch, even though they look related):
- Do not change `listCandidatePostsForMatching` — it needs `photo_embedding`
  for `matchPosts.js`'s scoring.
- Do not change `getPost` (used by `PostDetailPage.jsx`, which also doesn't
  display `photo_embedding` directly, but IS the page that triggers the
  matching check via a *separate* call to
  `listCandidatePostsForMatching` — `getPost`'s own select is out of scope
  for this plan; only narrow the two functions named above).
- Do not add a TypeScript-style explicit return type or otherwise refactor
  beyond the `select(...)` string change.

## Git workflow

- Branch: `plan-008-narrow-list-select` off `master`.
- Commit message style: short, imperative, no period — e.g. `Stop
  over-fetching photo_embedding on Browse and My Posts queries`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Narrow the select in listPosts and listPostsByOwner

Replace `listPosts` (current lines 1-12) with:

```js
// Ordered by bumped_at (not created_at) so a "bump to top" (see postBump.js)
// actually moves a post to the front — bumped_at defaults to created_at at
// insert time, so this is equivalent to created_at ordering until a post is
// ever bumped.
//
// Explicit column list (excluding photo_embedding) rather than select('*')
// — photo_embedding is a ~1024-number jsonb vector only needed by
// listCandidatePostsForMatching (see below), never read by Browse/PostCard,
// so including it here ships an unused, sizeable payload on every post row.
const POST_LIST_COLUMNS =
  'id, owner_id, type, species, breed, color, size, collar, collar_description, microchipped, ' +
  'distinctive_markings, pet_name, reward_amount, phone_number, location_lat, location_lng, ' +
  'location_text, date_lost_or_found, status, created_at, renewed_at, bumped_at, ' +
  'post_photos(*), profiles(display_name)'

export async function listPosts(supabase) {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_LIST_COLUMNS)
    .order('bumped_at', { ascending: false })
  if (error) throw error
  return data
}
```

Replace `listPostsByOwner` (current lines 59-67) with:

```js
export async function listPostsByOwner(supabase, ownerId) {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_LIST_COLUMNS)
    .eq('owner_id', ownerId)
    .order('bumped_at', { ascending: false })
  if (error) throw error
  return data
}
```

`POST_LIST_COLUMNS` is defined once (above `listPosts`) and reused by both
functions, so the column list only needs to be kept in sync with the schema
in one place.

**Verify**: `grep -n "POST_LIST_COLUMNS\|photo_embedding" src/features/posts/postsApi.js`
→ shows `POST_LIST_COLUMNS` defined once and used by both `listPosts` and
`listPostsByOwner`; `listCandidatePostsForMatching` still has its own
separate `select('*', ...)` untouched (confirm `photo_embedding` is not
excluded there).

### Step 2: Check and update any existing test assertions on the select string

Read `src/features/posts/postsApi.test.js`'s `listPosts` and
`listPostsByOwner` tests (current lines 14-19 and 57-62 as shown in Current
state above — but re-read the live file, since earlier plans in this batch
may have added tests above/below these). Both currently assert only on the
*returned data*, not on what columns were requested:

```js
test('listPosts returns the query result data', async () => {
  const postsQuery = createFakeQuery({ data: [{ id: 'p1' }], error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  const result = await listPosts(supabase)
  expect(result).toEqual([{ id: 'p1' }])
})
```

`createFakeQuery`'s `select: () => query` stub doesn't record its arguments,
so this test doesn't need to change — it will keep passing regardless of
what string `listPosts` passes to `.select(...)`, since the fake ignores the
argument entirely. No test changes are strictly required by this narrowing.
Confirm this by running the existing tests unmodified first.

**Verify**: `npm test -- postsApi` → all existing tests still pass with no
modifications needed.

### Step 3 (optional but recommended): Add a test asserting photo_embedding is excluded

To make the fix's intent explicit and guard against a future regression
(e.g. someone reverting to `select('*', ...)`), add one test that inspects
the actual select string. This requires `createFakeQuery`'s `select` stub
to record what it was called with — check
`src/testUtils/fakeSupabase.js`'s current `select: () => query` (it
currently discards its argument). Rather than modifying the shared test
util (out of scope for this plan — that's a shared file other plans may
also be touching), write this as a direct string-content test instead:

```js
test('listPosts excludes photo_embedding from the selected columns', () => {
  // POST_LIST_COLUMNS is not exported — this test reads the module source
  // directly rather than importing an internal constant, to avoid coupling
  // the test to an implementation detail beyond "the string passed to
  // .select() doesn't mention photo_embedding".
  const source = require('node:fs').readFileSync(
    new URL('./postsApi.js', import.meta.url),
    'utf-8'
  )
  const listPostsBody = source.slice(source.indexOf('export async function listPosts'))
  expect(listPostsBody.split('export async function listPostsByOwner')[0]).not.toMatch(/photo_embedding/)
})
```

If `require` is unavailable in this ESM test environment (check how other
tests in this repo read files, if any — most don't need to), skip this
optional step rather than fighting the module system; the core fix (Step 1)
and the passing existing suite (Step 2) are the binding requirements. A
simpler alternative that avoids filesystem reads entirely: export
`POST_LIST_COLUMNS` from `postsApi.js` and assert on it directly:

```js
// in postsApi.js, change:
const POST_LIST_COLUMNS = ...
// to:
export const POST_LIST_COLUMNS = ...
```

```js
// in postsApi.test.js:
import { POST_LIST_COLUMNS } from './postsApi.js'

test('the shared list-query column selection excludes photo_embedding', () => {
  expect(POST_LIST_COLUMNS).not.toMatch(/photo_embedding/)
  expect(POST_LIST_COLUMNS).toMatch(/post_photos/)
})
```

Prefer this second approach — it's simpler and doesn't depend on Node's
filesystem/module APIs being available in the test environment.

**Verify**: `npm test -- postsApi` → the new test passes.

### Step 4: Run the full suite and commit

```bash
npm test
git add src/features/posts/postsApi.js src/features/posts/postsApi.test.js
git commit -m "Stop over-fetching photo_embedding on Browse and My Posts queries"
```

**Verify**: `npm test` → exit 0, all tests pass. `git log -1 --stat` → shows
exactly the two files above.

## Test plan

- `src/features/posts/postsApi.test.js`: confirm existing `listPosts`/
  `listPostsByOwner` tests still pass unmodified (they assert on returned
  data, not the select string, per Step 2).
- Add one new test asserting `POST_LIST_COLUMNS` (exported) does not
  contain `photo_embedding` and does contain `post_photos` (confirms the
  narrowing didn't accidentally drop a column that's actually needed).
- Regression: full `npm test` run, all passing.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `listPosts` and `listPostsByOwner` both use a shared
      `POST_LIST_COLUMNS` string that excludes `photo_embedding`
- [ ] `listCandidatePostsForMatching` is unchanged and still selects
      `photo_embedding` (via its own `select('*', ...)`)
- [ ] `npm test` exits 0, all tests pass including the new column-list
      assertion
- [ ] `grep -n "photo_embedding" src/features/posts/postsApi.js` → only
      appears in `listCandidatePostsForMatching`'s implicit `select('*')`
      (i.e. not explicitly excluded there, since `*` still includes it) and
      NOT in `POST_LIST_COLUMNS`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `listPosts`/`listPostsByOwner`'s current implementation doesn't match the
  "Current state" excerpts (drift — re-read the live file; the posts table
  may have gained a new column since this plan was written, in which case
  add it to `POST_LIST_COLUMNS` too).
- Any consumer of `listPosts`/`listPostsByOwner` DOES turn out to read
  `.photo_embedding` (re-check with `grep -rn "photo_embedding" src/features/posts/BrowseFeedPage.jsx src/features/posts/PostCard.jsx src/features/posts/MyPostsDashboard.jsx src/features/posts/filterPosts.js` before proceeding) —
  if any match is found, STOP, this plan's core assumption is wrong.
- The `posts` table has columns beyond what's listed in "Current state"
  that you can't account for (check all files under `supabase/migrations/`
  for `alter table posts add column` statements) — include every real
  column except `photo_embedding` in `POST_LIST_COLUMNS`, don't guess.

## Maintenance notes

- `POST_LIST_COLUMNS` must be updated whenever a new column is added to
  `posts` via a future migration — it will NOT automatically pick up new
  columns the way `select('*')` did. Whoever adds a new `posts` column
  should grep for `POST_LIST_COLUMNS` and decide whether Browse/My-Posts
  need to display it.
- If a future feature needs `photo_embedding` on the Browse feed or My
  Posts dashboard (unlikely, but possible if e.g. a "find similar posts"
  feature is added there), add it back to `POST_LIST_COLUMNS` at that point
  rather than reverting to `select('*')`.
