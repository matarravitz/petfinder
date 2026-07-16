# Plan 006: Batch expired-post deletion into a single request

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 885a023..HEAD -- src/features/posts/postsApi.js src/features/posts/postsApi.test.js src/features/posts/MyPostsDashboard.jsx src/features/posts/MyPostsDashboard.test.jsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (Plan 003 also modifies `deletePost` in
  `postsApi.js` — if executing both, see Maintenance notes for how they
  interact; there is no hard ordering requirement)
- **Category**: perf
- **Planned at**: commit `885a023`, 2026-07-16

## Why this matters

PetFinder has no backend scheduler, so expired active posts (older than
`EXPIRY_DAYS` since their `renewed_at`) are deleted lazily: the next time
the *owner's own* `/my-posts` dashboard loads, `MyPostsDashboard.jsx` sweeps
any expired posts it finds. Today that sweep issues one `deletePost` call
**per expired post**, wrapped in `Promise.all` — so N expired posts means N
separate round trips to Supabase, run in parallel with no atomicity and no
per-item failure isolation. If any single delete in that batch fails
(network blip, a row already removed by another tab), `Promise.all` rejects
as a whole, which is caught by the page's outer `.catch` and replaces the
**entire** My Posts page — including the owner's still-valid posts — with a
generic error message. This plan replaces the N-call sweep with a single
batched delete, which is both fewer round trips and, as a direct
consequence, immune to the "one bad delete takes down the whole page"
failure mode (a single request either succeeds or fails as one unit, and a
failure here now only affects the sweep, not any of the already-fetched
`posts` state).

## Current state

- `src/features/posts/MyPostsDashboard.jsx:21-46` — the effect containing
  the sweep (full current content of the effect):
  ```js
  useEffect(() => {
    // Wait for the initial session check (AuthContext's `loading`) before
    // deciding to redirect — otherwise a genuinely logged-in user briefly
    // bounces to /login on every load, before their session has resolved.
    if (authLoading) return
    if (!user) {
      navigate('/login', { state: { from: '/my-posts' } })
      return
    }
    listPostsByOwner(supabase, user.id)
      .then(async (fetchedPosts) => {
        // Lazy expiry sweep: this app has no backend scheduler (see
        // postExpiry.js), so an expired active post only actually gets
        // deleted the next time the owner's own dashboard loads. Browse
        // already hides expired posts immediately regardless (see
        // filterPosts.js) — this is what makes that eventually consistent.
        const now = new Date()
        const expired = fetchedPosts.filter((post) => post.status === 'active' && isExpired(post, now))
        if (expired.length > 0) {
          await Promise.all(expired.map((post) => deletePost(supabase, post.id)))
        }
        const expiredIds = new Set(expired.map((post) => post.id))
        setPosts(fetchedPosts.filter((post) => !expiredIds.has(post.id)))
      })
      .catch((err) => setError(err.message))
  }, [user, authLoading, navigate])
  ```
  Note: the posts are already filtered out of the UI (`setPosts(...filter(post
  => !expiredIds.has(post.id)))`) regardless of whether the delete
  succeeded — this plan changes how the *delete* happens, not this
  already-correct "hide immediately" behavior.
- `src/features/posts/postsApi.js:54-57` — current `deletePost` (single-id
  delete, used both by this sweep and by the per-post "Remove" button
  elsewhere in the same file):
  ```js
  export async function deletePost(supabase, postId) {
    const { error } = await supabase.from('posts').delete().eq('id', postId)
    if (error) throw error
  }
  ```
  **Important**: if Plan 003 (storage delete policy + cleanup) has already
  landed when you execute this plan, `deletePost` will instead look like the
  version Plan 003 introduces (reads `post_photos`, removes storage files,
  then deletes the post row) — that's fine and does not conflict with this
  plan, since this plan adds a **new**, separate function (`deletePosts`,
  plural) rather than modifying `deletePost` itself. Re-read whatever
  `deletePost`'s current form is before writing `deletePosts` in Step 1, so
  the new function's photo-cleanup behavior (if Plan 003 landed first)
  matches.
- `src/testUtils/fakeSupabase.js` — the shared fake Supabase client's
  chainable query stub does not currently support `.in()`:
  ```js
  export function createFakeQuery(result) {
    const query = {
      select: () => query,
      order: () => query,
      eq: () => query,
      neq: () => query,
      insert: () => query,
      update: () => query,
      delete: () => query,
      single: () => Promise.resolve(result),
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    }
    return query
  }
  ```
  This plan adds `in: () => query` to this shared stub (Step 2) so tests
  using `.in()` (this plan's new `deletePosts` function) work — this is an
  additive change and does not affect any existing test.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run tests | `npm test` | exit 0, all pass |
| Run just the affected files | `npm test -- postsApi MyPostsDashboard fakeSupabase` | exit 0 |

## Scope

**In scope** (the only files you should create or modify):
- `src/features/posts/postsApi.js` (add a new `deletePosts` function; do
  not remove or rename the existing `deletePost` — it's still used by the
  per-post "Remove" button)
- `src/testUtils/fakeSupabase.js` (add `.in()` support to the shared query
  stub)
- `src/features/posts/MyPostsDashboard.jsx` (modify only the sweep block
  inside the effect at lines 21-46 — specifically the `if (expired.length >
  0) { ... }` block)
- `src/features/posts/postsApi.test.js` (add tests for `deletePosts`)
- `src/features/posts/MyPostsDashboard.test.jsx` (update/add sweep tests)

**Out of scope** (do NOT touch, even though they look related):
- Do not add `try/catch`/error-message changes to `handleRenew`,
  `handleRemove`, or `handleBump` (the per-button handlers later in the same
  file, lines 48-67) — that is a separate, already-planned fix (see Plan
  007); this plan touches only the sweep effect.
- Do not change `deletePost` itself (the singular-post function used by the
  "Remove" button) — this plan adds a new plural function alongside it, it
  does not replace or refactor the existing one.
- Do not change `filterPosts.js` or how Browse hides expired posts — that
  client-side-immediate-hide behavior is already correct and out of scope
  here.

## Git workflow

- Branch: `plan-006-batch-expired-deletion` off `master`.
- Commit message style: short, imperative, no period — e.g. `Batch expired
  post deletion into a single request`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a batched deletePosts function to postsApi.js

Read the current `deletePost` function in `src/features/posts/postsApi.js`
first (it may be the original single-delete version, or Plan 003's
photo-cleanup version — see Current state above) and add a new function
right after it:

If `deletePost` is still the original (no storage cleanup):

```js
// Batched sibling of deletePost, used by MyPostsDashboard's lazy expiry
// sweep (see postExpiry.js) — deletes every id in one request instead of
// one deletePost call per expired post, both for efficiency and so a sweep
// with multiple expired posts either succeeds or fails as a single unit
// rather than partially succeeding across N parallel calls.
export async function deletePosts(supabase, postIds) {
  if (postIds.length === 0) return
  const { error } = await supabase.from('posts').delete().in('id', postIds)
  if (error) throw error
}
```

If Plan 003 has already landed and `deletePost` now reads `post_photos` and
removes storage files before deleting the post row, mirror that same
photo-cleanup behavior in `deletePosts` (batched across all ids instead of
one at a time):

```js
export async function deletePosts(supabase, postIds) {
  if (postIds.length === 0) return

  const { data: photos, error: photosError } = await supabase
    .from('post_photos')
    .select('storage_path')
    .in('post_id', postIds)
  if (photosError) throw photosError

  const storagePaths = (photos || []).map((photo) => photo.storage_path)
  if (storagePaths.length > 0) {
    const { error: removeError } = await supabase.storage.from('post-photos').remove(storagePaths)
    if (removeError) throw removeError
  }

  const { error } = await supabase.from('posts').delete().in('id', postIds)
  if (error) throw error
}
```

Pick whichever variant matches the `deletePost` you actually find in the
file — do not guess; read it first.

**Verify**: `grep -n "export async function deletePosts" src/features/posts/postsApi.js`
→ returns one match.

### Step 2: Add .in() support to the shared fake Supabase test client

`src/testUtils/fakeSupabase.js`'s `createFakeQuery` needs an `in` method for
the new function's tests (and any future test) to use `.in()` in a
chainable way. Add it alongside the existing `eq`/`neq`:

```js
export function createFakeQuery(result) {
  const query = {
    select: () => query,
    order: () => query,
    eq: () => query,
    neq: () => query,
    in: () => query,
    insert: () => query,
    update: () => query,
    delete: () => query,
    single: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return query
}
```

**Verify**: `npm test -- fakeSupabase` → `src/testUtils/fakeSupabase.test.js`
still passes (this file directly tests `createFakeQuery`/`createFakeSupabase`
— confirm the addition didn't break its existing assertions).

### Step 3: Update the sweep in MyPostsDashboard.jsx

Replace the `if (expired.length > 0) { ... }` block inside the effect
(current line 39-41) so the sweep uses the new batched function and doesn't
let a sweep failure take down the whole page. Full updated effect:

```js
useEffect(() => {
  // Wait for the initial session check (AuthContext's `loading`) before
  // deciding to redirect — otherwise a genuinely logged-in user briefly
  // bounces to /login on every load, before their session has resolved.
  if (authLoading) return
  if (!user) {
    navigate('/login', { state: { from: '/my-posts' } })
    return
  }
  listPostsByOwner(supabase, user.id)
    .then(async (fetchedPosts) => {
      // Lazy expiry sweep: this app has no backend scheduler (see
      // postExpiry.js), so expired active posts only actually get deleted
      // the next time the owner's own dashboard loads. Browse already hides
      // expired posts immediately regardless (see filterPosts.js) — this is
      // what makes that eventually consistent. The sweep itself is a single
      // batched delete (not one call per post) so a transient failure here
      // can't take down the whole page — it's caught locally and only
      // affects whether the sweep's own cleanup happened, not the posts
      // list that's about to render.
      const now = new Date()
      const expired = fetchedPosts.filter((post) => post.status === 'active' && isExpired(post, now))
      const expiredIds = new Set(expired.map((post) => post.id))
      if (expired.length > 0) {
        try {
          await deletePosts(supabase, expired.map((post) => post.id))
        } catch {
          // Non-fatal: the posts are still hidden from view below (and
          // already hidden from Browse via filterPosts.js) even if the
          // actual delete failed — the next dashboard load will retry.
        }
      }
      setPosts(fetchedPosts.filter((post) => !expiredIds.has(post.id)))
    })
    .catch((err) => setError(err.message))
}, [user, authLoading, navigate])
```

Also update the import at the top of the file — replace `deletePost` with
both `deletePost` (still needed by `handleRemove` below) and `deletePosts`:

```js
import { listPostsByOwner, deletePost, deletePosts, renewPost, bumpPost } from './postsApi.js'
```

**Verify**: `grep -n "deletePosts\|import.*postsApi" src/features/posts/MyPostsDashboard.jsx`
→ shows the updated import line and the sweep calling `deletePosts`.

### Step 4: Update MyPostsDashboard tests

`src/features/posts/MyPostsDashboard.test.jsx` currently mocks
`postsApi.js` like this (near the top of the file):

```js
vi.mock('./postsApi.js', () => ({
  listPostsByOwner: vi.fn(() => Promise.resolve([])),
  deletePost: vi.fn(() => Promise.resolve()),
  renewPost: vi.fn(() => Promise.resolve()),
  bumpPost: vi.fn(() => Promise.resolve()),
}))
```

Add a `deletePosts` mock:

```js
vi.mock('./postsApi.js', () => ({
  listPostsByOwner: vi.fn(() => Promise.resolve([])),
  deletePost: vi.fn(() => Promise.resolve()),
  deletePosts: vi.fn(() => Promise.resolve()),
  renewPost: vi.fn(() => Promise.resolve()),
  bumpPost: vi.fn(() => Promise.resolve()),
}))
```

Then find (or add, if none exists yet) the test(s) covering the lazy expiry
sweep and update/add assertions. Read the rest of
`MyPostsDashboard.test.jsx` (it already has `daysAgo`/`hoursAfterBump`-style
helpers near the top, per the file's existing `MS_PER_DAY`/`daysAgo` helper)
to find the exact existing expiry-sweep test(s) and adjust them to assert
`postsApi.deletePosts` is called once with an array of the expired posts'
ids (not `postsApi.deletePost` called N times). If no sweep test currently
exists, add one:

```js
test('sweeps expired active posts in a single batched delete call', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValue([
    { id: 'expired-1', status: 'active', renewed_at: daysAgo(61), bumped_at: daysAgo(61) },
    { id: 'expired-2', status: 'active', renewed_at: daysAgo(90), bumped_at: daysAgo(90) },
    { id: 'still-active', status: 'active', renewed_at: daysAgo(1), bumped_at: daysAgo(1) },
  ])

  renderDashboard()

  await waitFor(() => expect(postsApi.deletePosts).toHaveBeenCalledWith(expect.anything(), ['expired-1', 'expired-2']))
  expect(postsApi.deletePost).not.toHaveBeenCalled()
})

test('does not fail the whole page when the sweep delete fails', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValue([
    { id: 'expired-1', status: 'active', renewed_at: daysAgo(61), bumped_at: daysAgo(61) },
  ])
  postsApi.deletePosts.mockRejectedValueOnce(new Error('network error'))

  renderDashboard()

  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
})
```

Adjust the exact `renewed_at`/`bumped_at`/day-offset values and helper names
to match whatever helpers already exist in the file — read it fully before
writing these tests so they compile against the file's actual existing
setup (`daysAgo`, `MS_PER_DAY`, etc. as seen in the file's current head).

**Verify**: `npm test -- MyPostsDashboard` → all tests pass, including the
new/updated sweep tests.

### Step 5: Run the full suite

**Verify**: `npm test` → all tests pass (exact count depends on how many
tests you added/modified in Steps 2 and 4 — the binding requirement is zero
failures, not a specific number).

### Step 6: Commit

```bash
git add src/features/posts/postsApi.js src/testUtils/fakeSupabase.js src/features/posts/MyPostsDashboard.jsx src/features/posts/postsApi.test.js src/features/posts/MyPostsDashboard.test.jsx
git commit -m "Batch expired post deletion into a single request"
```

**Verify**: `git log -1 --stat` → shows exactly the five files above.

## Test plan

- `src/features/posts/postsApi.test.js`: add a test for `deletePosts`
  confirming it calls `.from('posts').delete().in('id', postIds)` with the
  full id array (structural pattern: existing `deletePost` test), plus a
  test confirming it's a no-op (no Supabase call) when given an empty array.
- `src/features/posts/MyPostsDashboard.test.jsx`: update/add the lazy-sweep
  test to assert `deletePosts` is called once with all expired ids (not
  `deletePost` called per-post), and add a test confirming a sweep failure
  doesn't render the page's error state.
- Regression: full `npm test` run, all passing.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `deletePosts(supabase, postIds)` exists in `postsApi.js`, using
      `.delete().in('id', postIds)`
- [ ] `MyPostsDashboard.jsx`'s sweep calls `deletePosts` once with the full
      array of expired ids, wrapped in its own try/catch that does not set
      the page-level `error` state
- [ ] `npm test` exits 0, all tests pass including new/updated sweep tests
- [ ] `grep -n "Promise.all" src/features/posts/MyPostsDashboard.jsx`
      returns no matches (confirms the old N-call pattern is gone)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The sweep effect in `MyPostsDashboard.jsx` doesn't match the "Current
  state" excerpt above (drift — re-read the live file).
- `deletePost`'s current implementation is neither of the two variants
  described in Step 1 (something else has changed it) — report before
  guessing at `deletePosts`'s shape.
- `MyPostsDashboard.test.jsx`'s existing structure (mock setup, helper
  functions) differs enough from what's described here that the example
  test code in Step 4 won't compile as-is — adapt it to match the file's
  actual current helpers rather than force-fitting; if genuinely unclear
  how to adapt, report rather than guessing.

## Maintenance notes

- If Plan 003 (storage delete policy + `deletePost` photo cleanup) is
  executed in the same session as this plan, double-check after both land
  that `deletePosts` (this plan) and `deletePost` (Plan 003) apply
  consistent photo-cleanup behavior — a future person deleting one post via
  the "Remove" button and a future sweep deleting several expired posts
  should both actually remove the associated storage files, not just one of
  the two paths.
- This plan does not change `deletePost` (singular) at all — it remains in
  use by `handleRemove` (the per-post "Remove" button). Do not consolidate
  the two into one function; `deletePosts` exists specifically for the
  bulk-sweep case.
