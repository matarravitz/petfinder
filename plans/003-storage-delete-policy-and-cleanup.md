# Plan 003: Add a storage DELETE policy and clean up photo files on post deletion

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
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none (see Plan 002's Maintenance notes for migration-number
  sequencing if executing both in one session)
- **Category**: security
- **Planned at**: commit `885a023`, 2026-07-16

## Why this matters

When a post is deleted (`deletePost` in `src/features/posts/postsApi.js`),
only the Postgres rows are removed — the `post_photos` table cascade-deletes
automatically, but the actual image files in the `post-photos` Supabase
Storage bucket are never touched. Worse, there is currently no `delete`
policy at all on `storage.objects` for this bucket, so even if the client
tried to clean up, RLS would reject it — nobody, not even the post's owner,
has permission to delete a photo file today. Because the bucket is public,
this means any photo ever uploaded (which may show a home, yard, vehicle, or
other identifying detail) remains permanently retrievable at its storage URL
after the post — and the user's expectation that deleting a post removes
their data — is gone. This plan adds an ownership-scoped DELETE policy and
wires `deletePost` to actually remove the files.

## Current state

- `src/features/posts/postsApi.js:51-57` — current `deletePost`:
  ```js
  // post_photos rows cascade-delete with the post (see supabase/migrations/0001_init.sql's
  // `references posts(id) on delete cascade`); this does not remove the underlying files
  // from the post-photos storage bucket.
  export async function deletePost(supabase, postId) {
    const { error } = await supabase.from('posts').delete().eq('id', postId)
    if (error) throw error
  }
  ```
- `supabase/migrations/0002_storage.sql` — full current content (no delete
  policy exists):
  ```sql
  insert into storage.buckets (id, name, public)
  values ('post-photos', 'post-photos', true)
  on conflict (id) do nothing;

  create policy "anyone can view post photos" on storage.objects
    for select using (bucket_id = 'post-photos');

  create policy "authenticated users can upload post photos" on storage.objects
    for insert with check (bucket_id = 'post-photos' and auth.role() = 'authenticated');
  ```
- `supabase/migrations/0001_init.sql:66-69` — the ownership-scoped delete
  policy pattern already used on the `post_photos` metadata table (mirror
  this shape for the new storage policy):
  ```sql
  create policy "owners can delete photos on their posts" on post_photos
    for delete using (
      exists (select 1 from posts where posts.id = post_id and posts.owner_id = auth.uid())
    );
  ```
- Storage paths are always `${post.id}/${file.name}` — see
  `src/features/posts/postsApi.js:33`.
- To know *which* storage paths belong to a post before deleting it, query
  the `post_photos` table (it still exists at the moment `deletePost` is
  called — the cascade delete happens as part of the same `posts` delete
  statement, so read `post_photos` first, then delete the post, then remove
  the files — or read `post_photos` and delete both the storage files and
  the post; order matters, see Step 2 below).
- `src/features/posts/postsApi.test.js:51-55` — the existing test for
  `deletePost`:
  ```js
  test('deletePost deletes the post by id', async () => {
    const postsQuery = createFakeQuery({ data: null, error: null })
    const supabase = createFakeSupabase({ posts: postsQuery })
    await expect(deletePost(supabase, 'p1')).resolves.toBeUndefined()
  })
  ```
- `src/testUtils/fakeSupabase.js` — the shared fake Supabase client:
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
  Note `createFakeSupabase`'s default storage stub only implements
  `upload` — a test that needs `.remove()` must pass its own
  `storage: { 'post-photos': { upload: ..., remove: ... } }` in `routes`
  (same pattern the existing `createPost` test already uses for `upload`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run tests | `npm test` | exit 0, all pass including new `deletePost` cases |
| Run just postsApi tests | `npm test -- postsApi` | exit 0 |
| Apply migrations locally | `supabase db reset` | exits 0 |
| Sanity-check schema/RLS | `nvm exec 22 node scripts/verify-schema.mjs` | prints `OK` |

## Scope

**In scope** (the only files you should create or modify):
- `supabase/migrations/0008_storage_delete_policy.sql` (create — use `0008`
  if Plan 002 already claimed `0007`; otherwise use the next free number
  after checking `ls supabase/migrations/`)
- `src/features/posts/postsApi.js` (modify `deletePost`)
- `src/features/posts/postsApi.test.js` (modify/add tests for `deletePost`)

**Out of scope** (do NOT touch, even though they look related):
- Do not touch the `select` or `insert` policies on `storage.objects` —
  read access is intentional; the insert policy is covered by Plan 002.
- Do not write a one-off cleanup script for *already-orphaned* files from
  posts deleted before this fix — that is explicitly a separate, unplanned
  follow-up (note it in `docs/TODO.md` instead of doing it here; this plan
  only fixes the deletion path going forward).
- Do not change the `post_photos` table's own RLS policies — they are
  already correctly scoped.

## Git workflow

- Branch: `plan-003-storage-delete-cleanup` off `master`.
- Commit message style: short, imperative, no period — e.g. `Delete storage
  files when a post is deleted`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the DELETE policy migration

First check the next free migration number:

**Verify**: `ls supabase/migrations/` → note the highest-numbered file: if
Plan 002 has already landed, `0007_storage_insert_ownership.sql` will be
present and you should name this migration `0008_storage_delete_policy.sql`;
otherwise `0007_storage_delete_policy.sql`. Use whichever number is next
free — do not skip a number or reuse one.

Create the file with this content (adjust the filename per the check above,
content is otherwise unchanged):

```sql
-- No delete policy existed on storage.objects at all for the post-photos
-- bucket — not even the post's own owner could remove a photo file, even
-- though post_photos (the metadata table) already has an owner-scoped
-- delete policy. This adds the storage-level equivalent so deletePost() can
-- actually clean up files (see postsApi.js).
create policy "owners can delete photos on their own posts" on storage.objects
  for delete using (
    bucket_id = 'post-photos'
    and exists (
      select 1 from posts
      where posts.id::text = (storage.foldername(name))[1]
        and posts.owner_id = auth.uid()
    )
  );
```

**Verify**: `cat supabase/migrations/000X_storage_delete_policy.sql` (X = the
number you picked) → file exists with the content above.

### Step 2: Wire deletePost to remove the storage files

Update `src/features/posts/postsApi.js`. Replace the current `deletePost`
(lines 51-57) with:

```js
// Reads the post's photo storage paths before deleting the post (post_photos
// rows cascade-delete with the post — see supabase/migrations/0001_init.sql's
// `references posts(id) on delete cascade` — so they must be read first),
// then removes both the storage files and the post row. If the storage
// bucket has never had a photo for this post, storagePaths is empty and
// storage.remove([]) below is a harmless no-op call.
export async function deletePost(supabase, postId) {
  const { data: photos, error: photosError } = await supabase
    .from('post_photos')
    .select('storage_path')
    .eq('post_id', postId)
  if (photosError) throw photosError

  const storagePaths = (photos || []).map((photo) => photo.storage_path)
  if (storagePaths.length > 0) {
    const { error: removeError } = await supabase.storage.from('post-photos').remove(storagePaths)
    if (removeError) throw removeError
  }

  const { error } = await supabase.from('posts').delete().eq('id', postId)
  if (error) throw error
}
```

Order matters: read the photo paths and remove the storage files *before*
deleting the post row, because once the post row is deleted, the
`post_photos` rows cascade-delete too and the storage paths would be lost.

**Verify**: `grep -n "storage.remove\|post_photos" src/features/posts/postsApi.js`
→ shows the new `deletePost` reading `post_photos` and calling
`.storage.from('post-photos').remove(storagePaths)`.

### Step 3: Update the fake-client-based test for deletePost

`src/features/posts/postsApi.test.js` currently has:

```js
test('deletePost deletes the post by id', async () => {
  const postsQuery = createFakeQuery({ data: null, error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  await expect(deletePost(supabase, 'p1')).resolves.toBeUndefined()
})
```

This test's `createFakeSupabase({ posts: postsQuery })` has no `post_photos`
route, so the new `deletePost`'s `.from('post_photos').select(...)` call
would hit `routes['post_photos']`, which is `undefined` — calling
`.select()` on `undefined` throws. Replace the test with two tests: one
covering the "has photos" path and one covering the "no photos" path.

Replace the existing test with:

```js
test('deletePost removes the post\'s storage files before deleting the post row', async () => {
  const postsQuery = createFakeQuery({ data: null, error: null })
  const photosQuery = createFakeQuery({ data: [{ storage_path: 'p1/dog.jpg' }], error: null })
  const removeFn = vi.fn(() => Promise.resolve({ error: null }))
  const supabase = createFakeSupabase({
    posts: postsQuery,
    post_photos: photosQuery,
    storage: { 'post-photos': { upload: vi.fn(), remove: removeFn } },
  })

  await expect(deletePost(supabase, 'p1')).resolves.toBeUndefined()
  expect(removeFn).toHaveBeenCalledWith(['p1/dog.jpg'])
})

test('deletePost skips the storage remove call when the post has no photos', async () => {
  const postsQuery = createFakeQuery({ data: null, error: null })
  const photosQuery = createFakeQuery({ data: [], error: null })
  const removeFn = vi.fn(() => Promise.resolve({ error: null }))
  const supabase = createFakeSupabase({
    posts: postsQuery,
    post_photos: photosQuery,
    storage: { 'post-photos': { upload: vi.fn(), remove: removeFn } },
  })

  await expect(deletePost(supabase, 'p1')).resolves.toBeUndefined()
  expect(removeFn).not.toHaveBeenCalled()
})
```

Note: `vi` is not currently imported at the top of `postsApi.test.js` — check
the top of the file; if `vi` is not imported (Vitest globals are enabled
project-wide per `vite.config.js`'s `test` block, so `vi` is likely already
a global — confirm by checking whether other test files in this repo import
`vi` explicitly, e.g. `MyPostsDashboard.test.jsx` does `import { vi } from
'vitest'` at the top). If `postsApi.test.js` doesn't already import `vi` and
using it bare fails, add `import { vi } from 'vitest'` at the top of the
file.

**Verify**: `npm test -- postsApi` → all tests in `postsApi.test.js` pass,
including the two new `deletePost` tests.

### Step 4: Run the full suite and (if available) apply the migration locally

```bash
npm test
supabase db reset   # skip if local Supabase stack unavailable; note it if so
nvm exec 22 node scripts/verify-schema.mjs
```

**Verify**: `npm test` → `Tests  213 passed (213)` (212 existing minus 1
replaced plus 2 new = 213). `supabase db reset` exits 0 with no SQL errors.
`scripts/verify-schema.mjs` prints `OK`.

### Step 5: Commit

```bash
git add supabase/migrations/000X_storage_delete_policy.sql src/features/posts/postsApi.js src/features/posts/postsApi.test.js
git commit -m "Delete storage files when a post is deleted"
```

**Verify**: `git log -1 --stat` → shows exactly the three files above.

## Test plan

- New tests in `src/features/posts/postsApi.test.js` (structural pattern:
  the existing `createPost` test's use of a custom `storage:` route in
  `createFakeSupabase`):
  - `deletePost` removes the post's storage files before deleting the post
    row (happy path, one photo).
  - `deletePost` skips the storage `.remove()` call when the post has no
    photos (empty-array edge case — confirms no wasted/erroring call).
- Regression: full `npm test` run, 213 tests passing (212 existing + 2 new −
  1 replaced test, net +1... note the exact final count may differ by one
  depending on how you count the replacement; the binding requirement is
  "no test regressions, and both new cases pass," not a specific total).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `supabase/migrations/000X_storage_delete_policy.sql` exists with a
      `for delete` policy on `storage.objects` scoped by post ownership
- [ ] `deletePost` in `postsApi.js` reads `post_photos`, calls
      `storage.from('post-photos').remove(...)`, then deletes the post row,
      in that order
- [ ] `npm test` exits 0, includes the two new `deletePost` test cases
      passing
- [ ] `supabase db reset` succeeds with no SQL errors (or explicitly noted
      as skipped due to environment constraints)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The current `deletePost` implementation in `postsApi.js` doesn't match the
  "Current state" excerpt (drift — re-read the live file before continuing).
- `storage.foldername` is not available in the local Postgres/Supabase image
  you're testing against (it should be — it's a standard Supabase Storage
  helper function — but if `supabase db reset` fails specifically citing
  `function storage.foldername(text) does not exist`, that's an environment
  problem worth reporting rather than working around).
- You find another call site that constructs storage paths differently from
  `${post.id}/${file.name}` — that would mean this plan's path-parsing
  assumption is wrong for some photos; report before proceeding.

## Maintenance notes

- This plan intentionally does NOT clean up storage files for posts that
  were already deleted before this fix landed — those are already-orphaned
  files with no reliable programmatic way to find their owning post (the
  `post_photos` rows are gone). If a full cleanup of legacy orphans is ever
  wanted, it needs a separate one-off script that lists all objects in the
  bucket and cross-references them against remaining `post_photos` rows —
  track that as a follow-up in `docs/TODO.md`, don't build it here.
- If a future feature adds a way to remove a single photo from a post
  without deleting the whole post (e.g. an edit flow), it should reuse this
  same delete-then-select pattern (read the specific `post_photos` row,
  remove its storage file, delete the row) rather than duplicating the
  logic inline.
