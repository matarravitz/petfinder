# Plan 001: Add a GitHub Actions CI workflow running tests and build

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 885a023..HEAD -- .github/ package.json .nvmrc`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `885a023`, 2026-07-16

## Why this matters

PetFinder (a React 18 + Vite SPA at the repo root) has `npm test` (212 tests,
Vitest) and `npm run build` (Vite production build) as its two ground-truth
verification commands, but nothing runs them automatically. The `.github/`
directory exists but is completely empty — there is no CI workflow at all.
Today, a broken test or a build-breaking syntax/import error can land on
`master` undetected until someone happens to run one of those commands
locally, or until a production deploy fails. This plan is the safety net
every other plan in this batch (002–009) benefits from: once it lands, every
subsequent change gets an automatic pass/fail signal on push and PR.

## Current state

- `package.json` (repo root) — scripts block:
  ```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "engines": {
    "node": ">=22"
  },
  ```
- `.nvmrc` (repo root) — single line: `22`
- `.github/` exists at the repo root but contains zero files (no
  `workflows/` subdirectory).
- The project has no lint or typecheck script (plain JavaScript, no
  TypeScript, no ESLint installed) — do NOT invent a lint/typecheck CI step;
  only wire up the two commands that actually exist: `npm test` and
  `npm run build`.
- Both commands currently pass cleanly against `HEAD` (`885a023`): 212/212
  tests pass across 34 test files, and `npm run build` completes with no
  errors (it does emit non-fatal Vite chunk-size warnings — that is expected
  and not a failure condition; do not try to "fix" it as part of this plan).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install deps | `npm ci` | exit 0 |
| Run tests | `npm test` | exit 0, `Test Files  34 passed (34)` / `Tests  212 passed (212)` |
| Build | `npm run build` | exit 0, ends with `✓ built in ...` |

(Verified directly against this repo during planning — not guessed.)

## Scope

**In scope** (the only files you should create or modify):
- `.github/workflows/ci.yml` (create)

**Out of scope** (do NOT touch, even though they look related):
- Do not add a lint or typecheck step — no such tooling exists in this repo
  yet (that's a separate, not-yet-selected finding).
- Do not add deployment/publish steps — this plan is verification-only.
- Do not modify `package.json`, `.nvmrc`, or any source file.

## Git workflow

- Branch: create a new branch off `master`, e.g. `plan-001-ci-workflow`
  (this repo's history shows single-purpose commits directly on `master` via
  short imperative messages — see `git log --oneline -5` — a feature branch
  is still fine for isolating this change before merge).
- Commit message style: short, imperative, capitalized, no period — e.g.
  `Add CI workflow running tests and build` (match `git log --oneline -10`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the workflow file

Create `.github/workflows/ci.yml` with this exact content:

```yaml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:

jobs:
  test-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npm test
      - run: npm run build
```

This pins the Node version to whatever `.nvmrc` says (currently `22`),
matching the `engines` requirement in `package.json` and the documented
reason for it (native WebSocket support for `@supabase/supabase-js`
realtime — see `CLAUDE.md`'s Stack section if you want the full context,
not required reading for this step).

**Verify**: `cat .github/workflows/ci.yml` → file exists with the exact
content above. Also run `python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml'))"`
(or any available YAML validator) → exits 0, no parse error. If no YAML
validator is available, visually confirm indentation is consistent (2
spaces) and there are no tabs.

### Step 2: Confirm the two invoked commands still pass locally

This workflow only wires up commands that already exist — confirm they
still pass before committing, so a broken local state doesn't get masked as
"CI wiring" when it's actually a pre-existing failure.

**Verify**: `npm ci && npm test && npm run build` → all three exit 0, test
output ends with `Tests  212 passed (212)`, build output ends with `✓ built
in ...`.

### Step 3: Commit

```bash
git add .github/workflows/ci.yml
git commit -m "Add CI workflow running tests and build"
```

**Verify**: `git log -1 --stat` → shows the commit with exactly one file
added: `.github/workflows/ci.yml`.

## Test plan

This plan adds no application code, so there are no new unit tests to
write. The "test" for this plan is the workflow itself: once pushed to
GitHub, a subsequent push or PR should trigger the `CI / test-and-build`
check and show it passing. If you have `gh` CLI access and the repo has a
remote, you may optionally push the branch and confirm the check appears
and passes (`gh run list` / `gh run watch`) — but do NOT do this unless the
operator has explicitly authorized pushing to the remote; local
verification (Step 2) is sufficient to consider this plan done.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `.github/workflows/ci.yml` exists and matches the content in Step 1
- [ ] `npm test` exits 0 (212 tests passing)
- [ ] `npm run build` exits 0
- [ ] `git status` shows no modified files outside `.github/workflows/ci.yml`
- [ ] `plans/README.md` status row for Plan 001 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- `package.json`'s `scripts` block no longer contains exactly `dev`,
  `build`, `preview`, `test` as described above (the codebase has drifted).
- `npm test` or `npm run build` fails locally on `HEAD` before you've made
  any change — that's a pre-existing regression unrelated to this plan;
  report it rather than trying to fix it here.
- `.github/workflows/` already contains a file when you start (someone else
  added CI in the meantime) — do not overwrite it; report and ask how to
  proceed.

## Maintenance notes

- Any future plan that adds a lint/typecheck/format script to `package.json`
  should also add a corresponding step to this workflow file — it isn't
  automatic.
- If `.nvmrc` is ever bumped past 22, this workflow picks it up automatically
  via `node-version-file` — no change needed here.
- This workflow intentionally does not cache anything beyond npm's own
  dependency cache (`cache: 'npm'` in `setup-node`) — no build-artifact
  caching was added, since `vite build` is fast enough on this repo's current
  size not to need it. Revisit if build times grow.
