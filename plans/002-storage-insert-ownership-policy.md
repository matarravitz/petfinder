# Plan 002: Scope the post-photos storage INSERT policy to post ownership

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 885a023..HEAD -- supabase/migrations/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (sequence after Plan 003 if executing both, purely to
  avoid a migration-numbering collision — see Maintenance notes)
- **Category**: security
- **Planned at**: commit `885a023`, 2026-07-16

## Why this matters

PetFinder stores post photos in a public Supabase Storage bucket called
`post-photos`. The bucket's row-level security INSERT policy currently only
checks that the caller is *some* authenticated user — it does not check that
the object path being written actually belongs to a post that user owns.
Contrast this with the `post_photos` metadata table (a separate Postgres
table tracking which storage paths belong to which post), whose own INSERT
policy already does check ownership. This means any signed-up user — even
one who has never created a post — can write arbitrary files to any path in
the bucket, including paths shaped like another user's post folder,
completely bypassing the ownership model the rest of the schema enforces.
This plan tightens the storage policy to match the ownership check the
`post_photos` table policy already uses.

## Current state

- `supabase/migrations/0002_storage.sql` — the entire file, current content:
  ```sql
  insert into storage.buckets (id, name, public)
  values ('post-photos', 'post-photos', true)
  on conflict (id) do nothing;

  create policy "anyone can view post photos" on storage.objects
    for select using (bucket_id = 'post-photos');

  create policy "authenticated users can upload post photos" on storage.objects
    for insert with check (bucket_id = 'post-photos' and auth.role() = 'authenticated');
  ```
  The INSERT policy (last block) is the one this plan replaces — it has no
  ownership check at all.
- `supabase/migrations/0001_init.sql:62-65` — the equivalent, correctly
  ownership-scoped policy on the `post_photos` table, which this plan's new
  storage policy should mirror in spirit:
  ```sql
  create policy "owners can insert photos on their posts" on post_photos
    for insert with check (
      exists (select 1 from posts where posts.id = post_id and posts.owner_id = auth.uid())
    );
  ```
- Storage object paths are always written as `${post.id}/${file.name}` — see
  `src/features/posts/postsApi.js:33`:
  ```js
  const storagePath = `${post.id}/${file.name}`
  ```
  So the first path segment (before the first `/`) is always a `posts.id`
  UUID. Postgres's `storage.foldername(name)` function (built into every
  Supabase project) returns an array of path segments for an object name —
  `(storage.foldername(name))[1]` gives the first segment, i.e. the post id.
- `supabase/migrations/0006_post_lifecycle.sql` is the most recent migration
  (confirms `0007` is the next free migration number as of this plan).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run tests | `npm test` | exit 0, `Tests  212 passed (212)` |
| Apply migrations locally | `supabase db reset` | exits 0, replays all migrations including the new one |
| Sanity-check schema/RLS | `nvm exec 22 node scripts/verify-schema.mjs` | prints `OK` |

`supabase db reset` requires the local Supabase stack to be running
(`supabase start` first) and **wipes any seeded data** — if you run it,
re-seed afterward with `nvm exec 22 node scripts/seed-test-posts.mjs`
(documented in `CLAUDE.md`'s Gotchas section). If the local Supabase stack
is not available in your environment, skip the `supabase db reset`
verification step and rely on the SQL being syntactically reviewed instead —
note this explicitly in your final report if you had to skip it.

## Scope

**In scope** (the only files you should create or modify):
- `supabase/migrations/0007_storage_insert_ownership.sql` (create)

**Out of scope** (do NOT touch, even though they look related):
- Do not touch the `select` (view) policy on `storage.objects` — public
  read access to post photos is intentional (posts are public listings).
- Do not add a `delete` policy on `storage.objects` here — that is a
  separate concern, covered by Plan 003. If Plan 003 has not landed yet when
  you execute this plan, that's fine; the two are independent.
- Do not modify `supabase/migrations/0002_storage.sql` directly — Supabase
  migrations are append-only; fix forward with a new migration file, never
  edit an already-applied one.
- Do not touch `src/features/posts/postsApi.js` or any application code —
  the existing upload path (`${post.id}/${file.name}`) already produces
  paths compatible with the new policy; no client-side change is needed.

## Git workflow

- Branch: `plan-002-storage-insert-ownership` off `master`.
- Commit message style: short, imperative, no period — e.g. `Scope
  post-photos upload policy to post ownership`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the new migration

Create `supabase/migrations/0007_storage_insert_ownership.sql`:

```sql
-- Replaces the "authenticated users can upload post photos" policy from
-- 0002_storage.sql, which only checked auth.role() = 'authenticated' with
-- no ownership check — any signed-up user could write to any post's photo
-- folder. This scopes uploads to the caller actually owning the post whose
-- id is the object path's first segment (paths are always written as
-- `${post.id}/${file.name}`, see postsApi.js's createPost).
drop policy "authenticated users can upload post photos" on storage.objects;

create policy "owners can upload photos to their own posts" on storage.objects
  for insert with check (
    bucket_id = 'post-photos'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from posts
      where posts.id::text = (storage.foldername(name))[1]
        and posts.owner_id = auth.uid()
    )
  );
```

**Verify**: `cat supabase/migrations/0007_storage_insert_ownership.sql` →
file exists with the exact content above.

### Step 2: Apply the migration locally and verify it doesn't break existing flows

If the local Supabase stack is available:

```bash
supabase db reset
nvm exec 22 node scripts/seed-test-posts.mjs
nvm exec 22 node scripts/verify-schema.mjs
```

**Verify**: `supabase db reset` exits 0 with no SQL errors (a `postgres`
column/policy error here means the migration has a syntax problem — fix and
re-run, don't proceed past a failing reset).
`scripts/verify-schema.mjs` prints `Schema check passed. Cleaning up...`
followed by `OK` and exits 0 — this script creates a real post as its own
owner via the service-role key (which bypasses RLS, so it doesn't directly
exercise the new policy, but confirms the migration didn't break the schema
or existing policies).

If the local Supabase stack is not available in your environment, skip this
step, note it was skipped in your final report, and rely on Step 3's test
instead.

### Step 3: Add a regression test confirming createPost still works end-to-end against the fake client

The existing `postsApi.test.js` already has a passing test for `createPost`
that exercises the upload path — this migration doesn't change any
JavaScript, so no application-level test changes are strictly required.
Instead, confirm the existing suite still passes (this is the safety net
that would catch an accidental regression if a future change altered how
`storagePath` is constructed):

**Verify**: `npm test -- postsApi` → all `postsApi.test.js` tests pass,
including `createPost inserts the post, uploads photos, and inserts photo
rows`.

### Step 4: Commit

```bash
git add supabase/migrations/0007_storage_insert_ownership.sql
git commit -m "Scope post-photos upload policy to post ownership"
```

**Verify**: `git log -1 --stat` → shows exactly one file added.

## Test plan

- No new JavaScript test is needed — this is a database policy change with
  no corresponding application-code change (the upload path shape already
  matches what the new policy expects).
- The real verification is `scripts/verify-schema.mjs` (Step 2) plus a
  manual/local confirmation that the local Supabase stack accepts the new
  policy SQL without error. If you have the ability to test via the
  Supabase Studio SQL editor or `psql` against the local instance, you may
  additionally confirm directly: as a non-owner authenticated user, an
  insert to `storage.objects` with a `name` starting with another user's
  `post.id` is rejected (`new row violates row-level security policy`). This
  manual check is optional but recommended if you have DB access; it is not
  a blocking done-criterion since it requires two distinct authenticated
  sessions to set up.
- Regression: `npm test` → all 212 existing tests still pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `supabase/migrations/0007_storage_insert_ownership.sql` exists with the
      content from Step 1
- [ ] `npm test` exits 0, all existing tests pass (no new tests required by
      this plan)
- [ ] `supabase db reset` succeeds with no SQL errors (or explicitly noted as
      skipped due to environment constraints)
- [ ] `grep -n "authenticated users can upload post photos" supabase/migrations/0007*.sql`
      returns the `drop policy` line (confirms the old policy is dropped, not
      left dangling alongside the new one)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `supabase/migrations/0002_storage.sql`'s policy text doesn't match the
  "Current state" excerpt above (the codebase has drifted — the policy name
  in your `drop policy` statement must match exactly what's live, or the
  migration will fail with "policy does not exist").
- `supabase db reset` fails with an error unrelated to a syntax typo you can
  fix (e.g. a permissions error, a missing extension) — that signals an
  environment problem, not a plan problem; report it.
- Uploaded storage paths are ever NOT shaped as `${post.id}/...` somewhere
  else in the codebase you discover during this work (e.g. a second upload
  call site with a different path scheme) — if so, the new policy would
  incorrectly reject legitimate uploads from that path; report before
  proceeding.

## Maintenance notes

- Plan 003 (storage DELETE policy) also adds a policy to `storage.objects`
  in a new migration file. If both plans are executed in the same session,
  sequence this one (002) first and let Plan 003 pick the next free
  migration number (`0008`) to avoid a numbering collision — check
  `ls supabase/migrations/` immediately before creating Plan 003's file.
- If a future feature ever needs to upload files to `post-photos` under a
  path that is *not* `${post.id}/...` (e.g. a user avatar), this policy
  will reject it — that future work needs its own bucket or its own more
  general policy, not a loosening of this one.
- `scripts/seed-test-posts.mjs` uses the service-role key, which bypasses
  RLS entirely — it will keep working regardless of this policy change. Only
  browser-side (anon/authenticated-role) uploads are affected.
