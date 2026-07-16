# Plan 007: Add error handling to post-mutation button handlers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 885a023..HEAD -- src/features/posts/MyPostsDashboard.jsx src/features/posts/MyPostsDashboard.test.jsx src/features/posts/PostDetailPage.jsx src/features/posts/PostDetailPage.test.jsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none (touches different lines of `MyPostsDashboard.jsx`
  than Plan 006 — the sweep effect vs. these per-button handlers — no
  conflict either order)
- **Category**: bug
- **Planned at**: commit `885a023`, 2026-07-16

## Why this matters

Four user-triggered post-mutation actions — renew, remove, and bump on
`MyPostsDashboard.jsx`, and resolve on `PostDetailPage.jsx` — perform an
`await` on a Supabase write with **no error handling at all**. Every read
path in this same feature area (`BrowseFeedPage.jsx`'s `listPosts` call,
`PostDetailPage.jsx`'s `getPost` call, `MyPostsDashboard.jsx`'s
`listPostsByOwner` call) already follows a consistent `.then(...).catch((err)
=> setError(err.message))` pattern — these four handlers are the outliers.
If any of these four calls fails (network drop, a stale/already-deleted
post, an RLS rejection), the promise rejects with no `.catch` anywhere in
the call chain, producing an unhandled promise rejection: the button appears
to do nothing, the UI never updates, and — worst case for "Remove," which
already asks for a native `confirm()` — a user can walk away believing their
post was deleted when the request may have silently failed. This plan adds
the same `try/catch` + `setError` pattern these files already use elsewhere.

## Current state

- `src/features/posts/MyPostsDashboard.jsx:48-67` — the three handlers this
  plan fixes (current content, no error handling):
  ```js
  async function handleRenew(postId) {
    await renewPost(supabase, postId)
    setPosts((prev) =>
      prev.map((post) => (post.id === postId ? { ...post, renewed_at: new Date().toISOString() } : post))
    )
  }

  async function handleRemove(postId) {
    const confirmed = window.confirm('Remove this post? This cannot be undone.')
    if (!confirmed) return
    await deletePost(supabase, postId)
    setPosts((prev) => prev.filter((post) => post.id !== postId))
  }

  async function handleBump(postId) {
    await bumpPost(supabase, postId)
    setPosts((prev) =>
      prev.map((post) => (post.id === postId ? { ...post, bumped_at: new Date().toISOString() } : post))
    )
  }
  ```
- `src/features/posts/MyPostsDashboard.jsx:19,69-71` — the existing `error`
  state and how it's rendered (this plan reuses the same state, doesn't add
  a new one):
  ```js
  const [error, setError] = useState(null)
  // ...
  if (authLoading || !user) return <p>Loading...</p>
  if (error) return <p role="alert">{error}</p>
  if (!posts) return <p>Loading...</p>
  ```
  **Important**: this existing `error` state, when set, replaces the
  **entire page** with an error message (`if (error) return <p
  role="alert">{error}</p>` short-circuits everything else). That's
  appropriate for the initial `listPostsByOwner` fetch failing (there's
  nothing to show without it), but would be **too aggressive** for a single
  renew/remove/bump action failing — the user's other posts are still
  valid and should stay visible. This plan therefore does NOT reuse the
  page-level `error` state for these three handlers; instead it adds a
  separate, narrower `actionError` state that renders as a small inline
  message without hiding the rest of the page. See Step 1.
- `src/features/posts/PostDetailPage.jsx:78-81` — the fourth handler this
  plan fixes:
  ```js
  async function handleResolve() {
    await resolvePost(supabase, post.id)
    setPost((prev) => ({ ...prev, status: 'resolved' }))
  }
  ```
  This file already has a page-level `error` state (`src/features/posts/PostDetailPage.jsx:16`)
  used the same way (`if (error) return <p role="alert">{error}</p>` at line
  72) — same reasoning applies: don't hijack it for a resolve failure, since
  the rest of the post detail page (photos, fields, contact button) should
  stay visible even if "Mark as found" fails. This file also already has a
  narrower, non-page-hiding error pattern to follow: `matchesError` (lines
  20, 52-53, 184) — model the new `resolveError` state on that existing
  pattern.
- `src/features/posts/PostDetailPage.jsx:184,198-205` — the existing
  `matchesError` inline-error pattern to mirror:
  ```jsx
  {matchesError && <p className="possible-matches-error">{matchesError}</p>}
  ```
  and the catch block that sets it (lines 52-53):
  ```js
  } catch {
    setMatchesError("Couldn't check for matches right now.")
  }
  ```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run tests | `npm test` | exit 0, all pass |
| Run just the affected files | `npm test -- MyPostsDashboard PostDetailPage` | exit 0 |

## Scope

**In scope** (the only files you should create or modify):
- `src/features/posts/MyPostsDashboard.jsx` (modify `handleRenew`,
  `handleRemove`, `handleBump` only — lines 48-67; do not touch the sweep
  effect above them, lines 21-46)
- `src/features/posts/MyPostsDashboard.test.jsx` (add tests for the three
  handlers' error paths)
- `src/features/posts/PostDetailPage.jsx` (modify `handleResolve` only —
  lines 78-81)
- `src/features/posts/PostDetailPage.test.jsx` (add a test for the resolve
  error path)

**Out of scope** (do NOT touch, even though they look related):
- Do not touch the lazy expiry sweep effect in `MyPostsDashboard.jsx`
  (lines 21-46) — its failure-isolation is handled separately by Plan 006
  (which replaces its `Promise.all` with a single batched call).
- Do not touch `checkForMatches` in `PostDetailPage.jsx` — it already has
  correct error handling (`matchesError`), used here only as a pattern to
  copy, not a target to modify.
- Do not add a global error-boundary or toast-notification system — that's
  a much larger change than this plan's scope; use the same inline
  `role="alert"` paragraph pattern already established in this codebase.

## Git workflow

- Branch: `plan-007-mutation-error-handling` off `master`.
- Commit message style: short, imperative, no period — e.g. `Add error
  handling to post renew/remove/bump/resolve actions`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add actionError state and wrap the three handlers in MyPostsDashboard.jsx

Add a new state variable near the existing `error` state (around line 19):

```js
const [error, setError] = useState(null)
const [actionError, setActionError] = useState(null)
```

Replace the three handlers (current lines 48-67) with:

```js
async function handleRenew(postId) {
  setActionError(null)
  try {
    await renewPost(supabase, postId)
    setPosts((prev) =>
      prev.map((post) => (post.id === postId ? { ...post, renewed_at: new Date().toISOString() } : post))
    )
  } catch (err) {
    setActionError(err.message)
  }
}

async function handleRemove(postId) {
  const confirmed = window.confirm('Remove this post? This cannot be undone.')
  if (!confirmed) return
  setActionError(null)
  try {
    await deletePost(supabase, postId)
    setPosts((prev) => prev.filter((post) => post.id !== postId))
  } catch (err) {
    setActionError(err.message)
  }
}

async function handleBump(postId) {
  setActionError(null)
  try {
    await bumpPost(supabase, postId)
    setPosts((prev) =>
      prev.map((post) => (post.id === postId ? { ...post, bumped_at: new Date().toISOString() } : post))
    )
  } catch (err) {
    setActionError(err.message)
  }
}
```

Then render `actionError` near the top of the page's JSX, right after the
`<h2>My Posts</h2>` heading (so it's visible regardless of which section
the failing action was in):

```jsx
<h2>My Posts</h2>

{actionError && (
  <p className="my-posts-action-error" role="alert">
    {actionError}
  </p>
)}
```

**Verify**: `grep -n "actionError" src/features/posts/MyPostsDashboard.jsx`
→ shows the state declaration, all three handlers setting it, and the JSX
rendering it.

### Step 2: Wrap handleResolve in PostDetailPage.jsx

Add a new state variable near the existing `matchesError` state (around
line 20):

```js
const [matchesError, setMatchesError] = useState(null)
const [resolveError, setResolveError] = useState(null)
```

Replace `handleResolve` (current lines 78-81) with:

```js
async function handleResolve() {
  setResolveError(null)
  try {
    await resolvePost(supabase, post.id)
    setPost((prev) => ({ ...prev, status: 'resolved' }))
  } catch (err) {
    setResolveError(err.message)
  }
}
```

Then render `resolveError` inside the `.status-update-prompt` block (current
lines 209-216), right after the opening `<p className="status-update-question">`:

```jsx
{isOwner && post.status !== 'resolved' && (
  <div className="status-update-prompt">
    <p className="status-update-question">Is this post still active?</p>
    {resolveError && (
      <p className="status-update-error" role="alert">
        {resolveError}
      </p>
    )}
    <button type="button" className="status-update-confirm-button" onClick={handleResolve}>
      {isMissing ? 'Mark as found' : 'Mark as reunited'}
    </button>
  </div>
)}
```

**Verify**: `grep -n "resolveError" src/features/posts/PostDetailPage.jsx` →
shows the state declaration, `handleResolve` setting it, and the JSX
rendering it.

### Step 3: Add tests for the new error paths in MyPostsDashboard

Read the top of `src/features/posts/MyPostsDashboard.test.jsx` first (it
already mocks `postsApi.js` and `useAuth`, and has `daysAgo`/similar
helpers — match its existing conventions). Add three tests:

```js
test('shows an inline error and does not remove the post from state when renew fails', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValue([
    { id: 'p1', status: 'active', renewed_at: daysAgo(1), bumped_at: daysAgo(1) },
  ])
  postsApi.renewPost.mockRejectedValueOnce(new Error('network error'))

  renderDashboard()

  const renewButton = await screen.findByRole('button', { name: /still looking/i })
  await userEvent.click(renewButton)

  expect(await screen.findByRole('alert')).toHaveTextContent('network error')
})

test('shows an inline error when remove fails, after confirming', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValue([
    { id: 'p1', status: 'active', renewed_at: daysAgo(1), bumped_at: daysAgo(1) },
  ])
  postsApi.deletePost.mockRejectedValueOnce(new Error('network error'))
  vi.spyOn(window, 'confirm').mockReturnValue(true)

  renderDashboard()

  const removeButton = await screen.findByRole('button', { name: 'Remove' })
  await userEvent.click(removeButton)

  expect(await screen.findByRole('alert')).toHaveTextContent('network error')
  window.confirm.mockRestore()
})

test('shows an inline error when bump fails', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValue([
    { id: 'p1', status: 'active', renewed_at: daysAgo(1), bumped_at: daysAgo(30) },
  ])
  postsApi.bumpPost.mockRejectedValueOnce(new Error('network error'))

  renderDashboard()

  const bumpButton = await screen.findByRole('button', { name: /bump this post/i })
  await userEvent.click(bumpButton)

  expect(await screen.findByRole('alert')).toHaveTextContent('network error')
})
```

Adjust exact button `name` matchers and helper function calls
(`daysAgo`/`hoursAfterBump`/etc.) to match whatever already exists in the
file — read it fully first; these are illustrative and must compile against
the file's actual existing structure (e.g. confirm the exact accessible
name of the renew/remove/bump buttons by reading the JSX in
`MyPostsDashboard.jsx` directly rather than guessing).

**Verify**: `npm test -- MyPostsDashboard` → all tests pass, including the
three new ones.

### Step 4: Add a test for the resolve error path in PostDetailPage

Read `src/features/posts/PostDetailPage.test.jsx` first to match its
existing mock setup (`postsApi.js`, `useAuth`, `useParams` mocking
conventions). Add:

```js
test('shows an inline error and keeps the post active when resolve fails', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  postsApi.getPost.mockResolvedValue({
    id: 'p1',
    owner_id: 'owner-1',
    status: 'active',
    type: 'missing',
    species: 'cat',
  })
  postsApi.resolvePost.mockRejectedValueOnce(new Error('network error'))

  renderPostDetailPage() // or however this file's existing tests render the page — match it

  const resolveButton = await screen.findByRole('button', { name: /mark as found/i })
  await userEvent.click(resolveButton)

  expect(await screen.findByRole('alert')).toHaveTextContent('network error')
})
```

Adjust the render helper name, mock shape, and button matcher to whatever
`PostDetailPage.test.jsx` already uses — read the file fully first.

**Verify**: `npm test -- PostDetailPage` → all tests pass, including the new
one.

### Step 5: Run the full suite and commit

```bash
npm test
git add src/features/posts/MyPostsDashboard.jsx src/features/posts/MyPostsDashboard.test.jsx src/features/posts/PostDetailPage.jsx src/features/posts/PostDetailPage.test.jsx
git commit -m "Add error handling to post renew/remove/bump/resolve actions"
```

**Verify**: `npm test` → exit 0, all tests pass. `git log -1 --stat` → shows
exactly the four files above.

## Test plan

- `MyPostsDashboard.test.jsx`: three new tests, one per handler
  (renew/remove/bump), each mocking the corresponding `postsApi` function to
  reject once and asserting an inline `role="alert"` element appears with
  the error message, and that the post is NOT removed/mutated from state.
- `PostDetailPage.test.jsx`: one new test for `handleResolve`'s failure
  path, mirroring the existing `matchesError` test pattern already in that
  file if one exists (check for a test asserting
  `"Couldn't check for matches right now."` renders and follow its
  structure).
- Regression: full `npm test` run, all passing.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `handleRenew`, `handleRemove`, `handleBump` in `MyPostsDashboard.jsx`
      each wrap their Supabase call in try/catch and set `actionError` on
      failure
- [ ] `handleResolve` in `PostDetailPage.jsx` wraps its Supabase call in
      try/catch and sets `resolveError` on failure
- [ ] Neither `actionError` nor `resolveError` hides the rest of the page
      (confirm the JSX places them as inline elements, not as an early
      `return`)
- [ ] `npm test` exits 0, all tests pass including the 4 new tests
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The current handlers in either file don't match the "Current state"
  excerpts above (drift — re-read the live files).
- The existing test files' mock setup for `postsApi.js`/`useAuth`/routing
  differs significantly enough from what Steps 3-4 assume that the example
  test code won't compile — adapt to the file's real structure; if genuinely
  unclear, report rather than guessing at a shape that might silently test
  the wrong thing.

## Maintenance notes

- Any future post-mutation action (e.g. an eventual "edit post" save
  handler) should follow this same try/catch + narrow inline-error-state
  pattern, not the page-hiding `error` state used for the initial data
  fetch.
- `actionError`/`resolveError` are never explicitly cleared except at the
  start of the next attempt of the *same* action — a stale error from a
  failed renew stays visible until the user retries renew (or navigates
  away). That's an accepted, minor UX rough edge for this pass; a future
  polish pass could add a dismiss button or auto-clear timer if it becomes
  annoying in practice.
