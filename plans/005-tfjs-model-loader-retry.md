# Plan 005: Fix TF.js model loaders permanently caching a failed load

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 885a023..HEAD -- src/features/posts/photoAnalysis/models.js`
> If the in-scope file changed since this plan was written, compare the
> "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `885a023`, 2026-07-16

## Why this matters

`src/features/posts/photoAnalysis/models.js` memoizes the loaded TF.js
models (coco-ssd for species detection, MobileNet for breed/color/embedding)
in module-scoped promise variables, so the multi-MB model weights only
download once per page session. The memoization guard is `if
(!cocoModelPromise)` / `if (!mobilenetModelPromise)` — but a JavaScript
`Promise` object is truthy regardless of whether it resolved or rejected. If
the first load ever fails (a transient network blip while downloading the
model weights — plausible on a slow connection, which is exactly when a
lost/found pet report is likely to be filed from a phone in the field), the
*rejected* promise gets cached, and the guard never re-fires. Every
subsequent call to `analyzePhoto` or `getPhotoEmbedding` — including on
future page loads within the same session, or a user retrying after the
error message says "Photo analysis failed. You can still fill in the fields
manually." — replays the same stale rejection forever, with no way to
recover short of a full page reload. This plan makes a failed load clear its
own cache entry so the next call retries.

## Current state

- `src/features/posts/photoAnalysis/models.js` — full file, current
  content:
  ```js
  // @tensorflow-models/coco-ssd and @tensorflow-models/mobilenet only depend on
  // @tensorflow/tfjs-core (tensor APIs), not a backend implementation. Without
  // importing the @tensorflow/tfjs umbrella package first (which registers the
  // CPU/WebGL backends as a side effect), model.load() throws "No backend found
  // in registry." Dynamic-imported here (not at module top) so it code-splits
  // alongside coco-ssd/mobilenet instead of loading on every page.
  let tfjsBackendPromise = null
  let cocoModelPromise = null
  let mobilenetModelPromise = null

  export function ensureTfjsBackend() {
    if (!tfjsBackendPromise) {
      tfjsBackendPromise = import('@tensorflow/tfjs')
    }
    return tfjsBackendPromise
  }

  export function getCocoModel() {
    if (!cocoModelPromise) {
      cocoModelPromise = ensureTfjsBackend()
        .then(() => import('@tensorflow-models/coco-ssd'))
        .then((module) => module.load())
    }
    return cocoModelPromise
  }

  export function getMobilenetModel() {
    if (!mobilenetModelPromise) {
      mobilenetModelPromise = ensureTfjsBackend()
        .then(() => import('@tensorflow-models/mobilenet'))
        .then((module) => module.load())
    }
    return mobilenetModelPromise
  }
  ```
- This module is consumed by `src/features/posts/photoAnalysis/analyzePhoto.js`
  (species/breed/color auto-fill) and
  `src/features/posts/photoAnalysis/getPhotoEmbedding.js` (cross-post match
  embeddings) — neither needs to change for this fix; both just call
  `getCocoModel()`/`getMobilenetModel()` and this plan only changes what
  happens on failure inside `models.js` itself.
- `src/features/posts/photoAnalysis/analyzePhoto.test.js:1-33` — the
  existing test pattern for this module family, which resets module-scoped
  state between test cases (this repo's tests only isolate module instances
  per test *file*, not per `test()` block — see `CLAUDE.md`'s Testing
  section):
  ```js
  import { beforeEach, describe, expect, test, vi } from 'vitest'
  import * as cocoSsd from '@tensorflow-models/coco-ssd'
  import * as mobilenet from '@tensorflow-models/mobilenet'
  import { cropToImageData, loadImageElement } from './imageCanvas.js'

  vi.mock('@tensorflow/tfjs', () => ({}))
  vi.mock('@tensorflow-models/coco-ssd', () => ({ load: vi.fn() }))
  vi.mock('@tensorflow-models/mobilenet', () => ({ load: vi.fn() }))
  vi.mock('./imageCanvas.js', () => ({
    loadImageElement: vi.fn(() => Promise.resolve({})),
    cropToImageData: vi.fn(),
  }))

  // ...

  let analyzePhoto

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    ;({ analyzePhoto } = await import('./analyzePhoto.js'))
  })
  ```
  There is currently no `models.test.js` file — this plan creates one,
  following the same `vi.mock`/`vi.resetModules()`/dynamic-`await import()`
  pattern shown above, since `models.js` also has module-scoped memoized
  state that must be reset between test cases within the same file.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run tests | `npm test` | exit 0, all pass |
| Run just the new test file | `npm test -- models` | exit 0 |

## Scope

**In scope** (the only files you should create or modify):
- `src/features/posts/photoAnalysis/models.js` (modify)
- `src/features/posts/photoAnalysis/models.test.js` (create)

**Out of scope** (do NOT touch, even though they look related):
- Do not modify `analyzePhoto.js` or `getPhotoEmbedding.js` — they don't
  need to change; the fix is entirely inside `models.js`'s own promise
  caching.
- Do not modify `CreatePostForm.jsx`'s photo-analysis UI/error-handling —
  its `catch { setAnalysisError(...) }` block already handles a rejected
  promise correctly today; this plan only fixes what happens to the *next*
  call after a failure, not the current call's error display.
- Do not touch `ensureTfjsBackend`'s current export shape (it's called by
  both `getCocoModel` and `getMobilenetModel`) beyond adding the same
  retry-on-failure fix to it too (see Step 1 — all three functions have the
  identical bug and should all be fixed the same way).

## Git workflow

- Branch: `plan-005-tfjs-model-retry` off `master`.
- Commit message style: short, imperative, no period — e.g. `Retry TF.js
  model load after a failure instead of caching the rejection`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the failing test first

Create `src/features/posts/photoAnalysis/models.test.js`:

```js
import { beforeEach, describe, expect, test, vi } from 'vitest'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import * as mobilenet from '@tensorflow-models/mobilenet'

vi.mock('@tensorflow/tfjs', () => ({}))
vi.mock('@tensorflow-models/coco-ssd', () => ({ load: vi.fn() }))
vi.mock('@tensorflow-models/mobilenet', () => ({ load: vi.fn() }))

// models.js memoizes each loaded model in a module-scoped promise variable
// (intentional in production — avoids re-downloading multi-MB model weights
// on every call). That state leaks between test cases sharing one module
// instance within this file, so each test resets the module registry and
// re-imports fresh, same pattern as analyzePhoto.test.js.
let getCocoModel
let getMobilenetModel

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  ;({ getCocoModel, getMobilenetModel } = await import('./models.js'))
})

describe('getCocoModel', () => {
  test('retries after a failed load instead of replaying the same rejection', async () => {
    cocoSsd.load
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ detect: vi.fn() })

    await expect(getCocoModel()).rejects.toThrow('network error')
    const model = await getCocoModel()
    expect(model).toEqual({ detect: expect.any(Function) })
    expect(cocoSsd.load).toHaveBeenCalledTimes(2)
  })

  test('caches a successful load and does not call load() again', async () => {
    cocoSsd.load.mockResolvedValue({ detect: vi.fn() })

    const first = await getCocoModel()
    const second = await getCocoModel()

    expect(first).toBe(second)
    expect(cocoSsd.load).toHaveBeenCalledTimes(1)
  })
})

describe('getMobilenetModel', () => {
  test('retries after a failed load instead of replaying the same rejection', async () => {
    mobilenet.load
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ classify: vi.fn() })

    await expect(getMobilenetModel()).rejects.toThrow('network error')
    const model = await getMobilenetModel()
    expect(model).toEqual({ classify: expect.any(Function) })
    expect(mobilenet.load).toHaveBeenCalledTimes(2)
  })
})
```

**Verify**: `npm test -- models` → both "retries after a failed load" tests
FAIL (the "caches a successful load" test passes, since that path already
works today) — this confirms the test correctly reproduces the bug against
the current, unfixed `models.js`. Expected failure message: the second
`getCocoModel()`/`getMobilenetModel()` call rejects again instead of
resolving, so `await getCocoModel()` throws and the `expect(model).toEqual`
assertion is never reached, or `cocoSsd.load`/`mobilenet.load`'s call count
is `1` instead of the expected `2`.

### Step 2: Fix models.js

Replace the full content of `src/features/posts/photoAnalysis/models.js`
with:

```js
// @tensorflow-models/coco-ssd and @tensorflow-models/mobilenet only depend on
// @tensorflow/tfjs-core (tensor APIs), not a backend implementation. Without
// importing the @tensorflow/tfjs umbrella package first (which registers the
// CPU/WebGL backends as a side effect), model.load() throws "No backend found
// in registry." Dynamic-imported here (not at module top) so it code-splits
// alongside coco-ssd/mobilenet instead of loading on every page.
//
// Each promise below is cleared back to null on rejection (via .catch) so a
// transient failure (e.g. a network blip downloading the multi-MB model
// weights) doesn't permanently poison every future call in this page
// session — without the .catch, a rejected promise is still truthy, so the
// `if (!xPromise)` guard would never re-fire and every subsequent call would
// replay the same stale rejection until a full page reload.
let tfjsBackendPromise = null
let cocoModelPromise = null
let mobilenetModelPromise = null

export function ensureTfjsBackend() {
  if (!tfjsBackendPromise) {
    tfjsBackendPromise = import('@tensorflow/tfjs').catch((err) => {
      tfjsBackendPromise = null
      throw err
    })
  }
  return tfjsBackendPromise
}

export function getCocoModel() {
  if (!cocoModelPromise) {
    cocoModelPromise = ensureTfjsBackend()
      .then(() => import('@tensorflow-models/coco-ssd'))
      .then((module) => module.load())
      .catch((err) => {
        cocoModelPromise = null
        throw err
      })
  }
  return cocoModelPromise
}

export function getMobilenetModel() {
  if (!mobilenetModelPromise) {
    mobilenetModelPromise = ensureTfjsBackend()
      .then(() => import('@tensorflow-models/mobilenet'))
      .then((module) => module.load())
      .catch((err) => {
        mobilenetModelPromise = null
        throw err
      })
  }
  return mobilenetModelPromise
}
```

**Verify**: `npm test -- models` → all tests in `models.test.js` now pass,
including both "retries after a failed load" cases.

### Step 3: Run the full suite

**Verify**: `npm test` → `Tests  216 passed (216)` (212 existing + 4 new in
`models.test.js`). Also confirm no regression in the modules that consume
`models.js`: `npm test -- analyzePhoto getPhotoEmbedding` → both still pass
(they mock `@tensorflow-models/coco-ssd`/`mobilenet` directly rather than
`models.js`, so this change shouldn't affect them, but confirm anyway).

### Step 4: Commit

```bash
git add src/features/posts/photoAnalysis/models.js src/features/posts/photoAnalysis/models.test.js
git commit -m "Retry TF.js model load after a failure instead of caching the rejection"
```

**Verify**: `git log -1 --stat` → shows exactly the two files above.

## Test plan

- New file `src/features/posts/photoAnalysis/models.test.js`, following the
  `vi.mock` + `vi.resetModules()` + dynamic `await import()` pattern from
  `analyzePhoto.test.js`. Cases:
  - `getCocoModel` retries after a failed load (the regression test for this
    bug) — first call rejects, second call succeeds, `load()` called twice.
  - `getCocoModel` caches a successful load — two calls both resolve to the
    same reference, `load()` called only once (confirms the fix doesn't
    break the existing "only download once" memoization behavior).
  - `getMobilenetModel` retries after a failed load (same shape as the
    `getCocoModel` case, for the sibling function).
- Regression: full `npm test` run, 216 tests passing (212 existing + 4 new).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `src/features/posts/photoAnalysis/models.test.js` exists with the 4
      test cases above
- [ ] Before the fix (Step 1 only), the two "retries after a failed load"
      tests fail against the unmodified `models.js`
- [ ] After the fix (Step 2), all 4 new tests pass
- [ ] `npm test` exits 0 with 216 tests passing total
- [ ] `grep -c "catch" src/features/posts/photoAnalysis/models.js` → returns
      `3` (one `.catch` per memoized promise: backend, coco, mobilenet)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The current `models.js` content doesn't match the "Current state" excerpt
  above (drift — re-read the live file; the fix pattern still applies but
  you'll need to adapt the exact lines).
- Step 1's test doesn't fail against the unmodified code the way described
  (if it passes immediately, something about the mock setup differs from
  what this plan assumed — investigate before writing the fix, since a test
  that doesn't actually reproduce the bug isn't a real regression test).

## Maintenance notes

- If a fourth memoized model/resource is ever added to this module, apply
  the same `.catch(() => { xPromise = null; throw err })` pattern
  immediately — don't let a new memoized promise slip in without it.
- This fix does not add retry *limits* or backoff — a persistently failing
  network will simply fail every call, each one re-attempting the download
  from scratch. That's the same behavior as before this fix for the *first*
  call; this plan only fixes what happens on the *second and subsequent*
  calls after a failure. If retry storms ever become a real problem (e.g.
  users mashing "Analyze Photo" against a genuinely offline connection),
  that would be a separate follow-up (backoff/circuit-breaker), not part of
  this fix.
