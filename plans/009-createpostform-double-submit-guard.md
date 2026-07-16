# Plan 009: Add a double-submit guard to CreatePostForm

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 885a023..HEAD -- src/features/posts/CreatePostForm.jsx src/features/posts/CreatePostForm.test.jsx`
> If the in-scope file changed since this plan was written, compare the
> "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `885a023`, 2026-07-16

## Why this matters

`CreatePostForm.jsx`'s submit button has no double-submit guard — unlike
its sibling forms `LoginPage.jsx` and `SignupPage.jsx`, which both track a
`submitting` boolean, disable their submit button while `true`, and swap in
a busy label. `CreatePostForm`'s `handleSubmit` performs a *multi-step*
sequence (insert the post row, then upload each photo file, then insert
each `post_photos` row — see `createPost` in `postsApi.js`), which makes a
double-click here more consequential than on the simpler auth forms: a user
double-clicking "Create post" (slow connection, habit, or a slow first paint
after clicking) can trigger `handleSubmit` twice concurrently, each running
the full insert-then-upload-then-insert sequence, resulting in two duplicate
post rows and duplicate photo uploads for the same submission. This plan
adds the same `submitting` guard pattern already established and tested in
`LoginPage.jsx`/`SignupPage.jsx`.

## Current state

- `src/features/posts/CreatePostForm.jsx:109-121` — current state
  declarations (no `submitting` state):
  ```js
  export default function CreatePostForm() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [form, setForm] = useState(initialForm)
    const [location, setLocation] = useState(null)
    const [files, setFiles] = useState([])
    const [previewUrls, setPreviewUrls] = useState([])
    const [error, setError] = useState(null)
    const [analyzing, setAnalyzing] = useState(false)
    const [analysisError, setAnalysisError] = useState(null)
    const [undetectedFields, setUndetectedFields] = useState([])
    const [autoFilledFields, setAutoFilledFields] = useState(new Set())
  ```
- `src/features/posts/CreatePostForm.jsx:223-253` — current `handleSubmit`
  (no guard):
  ```js
  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    if (!location) {
      setError('Please choose a location on the map before posting.')
      return
    }
    try {
      const photoEmbedding = photoEmbeddingPromiseRef.current
        ? await photoEmbeddingPromiseRef.current
        : null
      const effectiveBreed = form.breed === 'other' ? form.breedOther : form.breed
      const effectiveColor = form.color === 'other' ? form.colorOther : form.color
      const payload = buildPostPayload(
        {
          ...form,
          breed: effectiveBreed,
          color: effectiveColor,
          locationText: location.text,
          locationLat: location.lat,
          locationLng: location.lng,
          photoEmbedding,
        },
        user.id
      )
      const post = await createPost(supabase, payload, files)
      navigate(`/post/${post.id}`)
    } catch (err) {
      setError(err.message)
    }
  }
  ```
- `src/features/posts/CreatePostForm.jsx:624-626` — current submit button
  (no `disabled` attribute):
  ```jsx
  <button type="submit" className="form-submit">
    Create post
  </button>
  ```
- `src/features/auth/LoginPage.jsx:14,16-27,78-80` — the exemplar pattern
  from a sibling form to match exactly:
  ```js
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate(from)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }
  ```
  ```jsx
  <button type="submit" className="form-submit auth-submit" disabled={submitting}>
    {submitting ? 'Logging in…' : 'Log in'}
  </button>
  ```
  Note the pattern: `setSubmitting(false)` is called in the `catch` block
  (so the button re-enables after a failure, letting the user retry), but
  is deliberately **not** called after a success — `LoginPage` navigates
  away on success, so there's no need to re-enable a button on a page that's
  about to unmount. `CreatePostForm` follows the identical shape: it also
  navigates away (`navigate(`/post/${post.id}`)`) on success.
- `src/features/posts/CreatePostForm.test.jsx:1-50` — existing test file
  head, showing the mock setup this plan's new test must match (mocks
  `postsApi.js`'s `createPost` to resolve immediately by default):
  ```js
  vi.mock('./postsApi.js', () => ({ createPost: vi.fn(() => Promise.resolve({ id: 'p1' })) }))
  ```
  and the existing happy-path test's structure (submits via
  `userEvent.click(screen.getByText('Create post'))`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run tests | `npm test` | exit 0, all pass |
| Run just this file's tests | `npm test -- CreatePostForm` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/features/posts/CreatePostForm.jsx` (add `submitting` state, guard
  `handleSubmit`, disable the submit button)
- `src/features/posts/CreatePostForm.test.jsx` (add a test for the guard)

**Out of scope** (do NOT touch, even though they look related):
- Do not touch the photo-analysis (`handleAnalyzePhoto`) submit-adjacent
  logic — that's a separate button (`Analyze Photo`) with its own
  `analyzing` state already guarding it; this plan only touches the main
  form-submit button.
- Do not add a guard to `LoginPage.jsx`/`SignupPage.jsx` — they already have
  one; this plan only brings `CreatePostForm` up to the same standard.
- Do not change `createPost`/`postsApi.js` — the fix is entirely a
  client-side UI guard against re-entrant calls, not a server-side
  idempotency mechanism (out of scope for this plan; note as a possible
  future hardening in Maintenance notes).

## Git workflow

- Branch: `plan-009-createpostform-submit-guard` off `master`.
- Commit message style: short, imperative, no period — e.g. `Add
  double-submit guard to CreatePostForm`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add submitting state

In `src/features/posts/CreatePostForm.jsx`, add `submitting` state
alongside the existing state declarations (current lines 109-121):

```js
export default function CreatePostForm() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [location, setLocation] = useState(null)
  const [files, setFiles] = useState([])
  const [previewUrls, setPreviewUrls] = useState([])
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)
  const [undetectedFields, setUndetectedFields] = useState([])
  const [autoFilledFields, setAutoFilledFields] = useState(new Set())
```

**Verify**: `grep -n "submitting" src/features/posts/CreatePostForm.jsx` →
shows the new state declaration (one match so far).

### Step 2: Guard handleSubmit

Replace `handleSubmit` (current lines 223-253) with:

```js
async function handleSubmit(event) {
  event.preventDefault()
  setError(null)
  if (!location) {
    setError('Please choose a location on the map before posting.')
    return
  }
  if (submitting) return
  setSubmitting(true)
  try {
    const photoEmbedding = photoEmbeddingPromiseRef.current
      ? await photoEmbeddingPromiseRef.current
      : null
    const effectiveBreed = form.breed === 'other' ? form.breedOther : form.breed
    const effectiveColor = form.color === 'other' ? form.colorOther : form.color
    const payload = buildPostPayload(
      {
        ...form,
        breed: effectiveBreed,
        color: effectiveColor,
        locationText: location.text,
        locationLat: location.lat,
        locationLng: location.lng,
        photoEmbedding,
      },
      user.id
    )
    const post = await createPost(supabase, payload, files)
    navigate(`/post/${post.id}`)
  } catch (err) {
    setError(err.message)
    setSubmitting(false)
  }
}
```

Two things to note, matching `LoginPage.jsx`'s exact shape: (1) the
`if (submitting) return` early-exit is a belt-and-suspenders guard against a
second `handleSubmit` invocation slipping through before the button's
`disabled` attribute (Step 3) has re-rendered — the disabled attribute
is the primary defense, this is the backstop; (2) `setSubmitting(false)` is
only called in the `catch` block, not after a successful `navigate(...)`,
since the component is about to unmount on success.

**Verify**: `grep -n "submitting" src/features/posts/CreatePostForm.jsx` →
now shows multiple matches: the state declaration, the early-return guard,
`setSubmitting(true)`, and `setSubmitting(false)` in the catch block.

### Step 3: Disable the submit button and show a busy label

Replace the submit button (current lines 624-626) with:

```jsx
<button type="submit" className="form-submit" disabled={submitting}>
  {submitting ? 'Creating post…' : 'Create post'}
</button>
```

**Verify**: `grep -n "disabled={submitting}" src/features/posts/CreatePostForm.jsx`
→ one match.

### Step 4: Add a test for the guard

Read the top of `src/features/posts/CreatePostForm.test.jsx` first (shown in
Current state above) to match its existing mock/render conventions exactly.
Add a test using a controllable (not auto-resolving) promise for
`createPost`, so the test can assert on the disabled/busy state *during* the
pending submission — model this on how `MyPostsDashboard.test.jsx` or
`CreatePostForm.test.jsx`'s own analyzing-related tests (if any) hold a
promise open, or use this direct approach:

```js
test('disables the submit button and prevents a second submission while creating a post', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  let resolveCreatePost
  postsApi.createPost.mockReturnValue(
    new Promise((resolve) => {
      resolveCreatePost = resolve
    })
  )

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await userEvent.click(screen.getByRole('radio', { name: 'Missing pet' }))
  await userEvent.selectOptions(screen.getByLabelText('Species'), 'cat')
  await userEvent.click(screen.getByText('Pick a location (test stub)'))
  await userEvent.type(screen.getByLabelText('Date lost/found'), '2026-07-01')

  const submitButton = screen.getByText('Create post')
  await userEvent.click(submitButton)

  expect(await screen.findByRole('button', { name: 'Creating post…' })).toBeDisabled()
  expect(postsApi.createPost).toHaveBeenCalledTimes(1)

  // A second click while still pending must not trigger a second call —
  // the button is disabled, so this simulates the guard, not just the UI.
  await userEvent.click(screen.getByRole('button', { name: 'Creating post…' }))
  expect(postsApi.createPost).toHaveBeenCalledTimes(1)

  resolveCreatePost({ id: 'p1' })
})
```

Match the exact field-filling steps (`getByRole('radio', ...)`,
`getByLabelText('Species')`, the `LocationPicker` stub button text, etc.) to
whatever the file's existing happy-path test already uses — copy that
test's setup steps rather than retyping them from memory, since the exact
label text must match the real component.

**Verify**: `npm test -- CreatePostForm` → all tests pass, including the new
one.

### Step 5: Run the full suite and commit

```bash
npm test
git add src/features/posts/CreatePostForm.jsx src/features/posts/CreatePostForm.test.jsx
git commit -m "Add double-submit guard to CreatePostForm"
```

**Verify**: `npm test` → exit 0, all tests pass. `git log -1 --stat` → shows
exactly the two files above.

## Test plan

- `src/features/posts/CreatePostForm.test.jsx`: one new test using a
  manually-controlled (not auto-resolving) `createPost` mock promise,
  asserting: (a) the submit button shows the busy label and is disabled
  while the create-post call is pending, (b) a second click while pending
  does not trigger a second `createPost` call, (c) resolving the promise
  lets the test complete cleanly (avoids an unresolved-promise warning).
- Regression: full `npm test` run — existing `CreatePostForm.test.jsx`
  happy-path and error-path tests (which rely on `createPost` resolving
  immediately via the default mock) must still pass unmodified, confirming
  the new `submitting` state doesn't interfere with the normal flow.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `CreatePostForm.jsx` has a `submitting` state, guards `handleSubmit`
      against re-entry, sets it `true` before the async work and `false`
      only in the `catch` block (not after success)
- [ ] The submit button has `disabled={submitting}` and shows `'Creating
      post…'` while `submitting` is `true`
- [ ] `npm test` exits 0, all tests pass including the new double-submit
      test
- [ ] The new test explicitly asserts `createPost` was called exactly once
      even after two clicks
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `handleSubmit` or the submit button's current JSX don't match the
  "Current state" excerpts (drift — re-read the live file).
- The existing `CreatePostForm.test.jsx`'s field-filling steps (radio/select/
  location-stub/date labels) have changed from what's shown above — copy the
  *actual* current happy-path test's steps rather than the ones quoted in
  this plan, which may have drifted.
- Any existing `CreatePostForm.test.jsx` test starts failing after this
  change and the cause isn't obviously the new `submitting` guard
  interfering with a synchronous assumption elsewhere in that test — report
  rather than modifying unrelated tests to force a pass.

## Maintenance notes

- This is a client-side-only guard — it prevents a double-click from the
  same browser tab/session, but does not add server-side idempotency (e.g.
  an idempotency key on `createPost`). Two genuinely separate submissions
  (different tabs, a retried request after a timeout where the first
  request actually succeeded server-side) can still create duplicate posts.
  If that ever becomes a real problem, it would need a server-side
  idempotency mechanism — a larger, separate piece of work, not part of
  this plan.
- Any future form in this app that performs a multi-step or otherwise
  slow/expensive submit should follow this same `submitting`
  state + disabled button + busy label pattern (now consistent across
  `LoginPage`, `SignupPage`, and `CreatePostForm`).
