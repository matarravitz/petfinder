# Cross-post Match Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a post owner views their own active missing/found post, show them the most likely matching posts from the opposite list (missing↔found), scored by a blend of photo similarity, location proximity, and date proximity — per `docs/features/post-matching.md`.

**Architecture:** A new nullable `photo_embedding` column stores a MobileNet embedding vector computed client-side at post-creation time (reusing the same lazily-loaded model as breed detection, via a newly extracted shared `models.js`). A pure scoring module (`matchPosts.js`) blends visual cosine similarity with location/date proximity over a Postgrest-prefiltered candidate set. `PostDetailPage` runs this automatically once for the owner and exposes a manual re-check button.

**Tech Stack:** React 18.3.1, plain JS, Vitest + `@testing-library/react` + `@testing-library/user-event`, Supabase Postgres. No new dependencies — reuses the already-installed `@tensorflow-models/mobilenet`.

## Global Constraints

- Client-side only — no Supabase Edge Function, no LLM/AI vision API call of any kind. (spec: Goal)
- No push/email notifications — matches are pull-based, computed only when the post owner views their own post. (spec: Non-goals)
- No "My Posts" dashboard in this pass — tracked in `docs/TODO.md`. (spec: Non-goals)
- No backfilling `photo_embedding` for pre-existing posts — they simply score fields-only until resaved. (spec: Non-goals)
- No pgvector / server-side vector search — plain client-side cosine similarity over a Postgrest-prefiltered candidate set. (spec: Non-goals)
- Never cross-species — a missing cat only ever matches found cats. (spec: Non-goals)
- Never match/display for resolved posts. (spec: Non-goals)
- Embedding computation must never block post submission — on failure or timeout it resolves to `null`, same progressive-enhancement principle as the rest of photo analysis. (spec: Embedding computation)
- Combined match score must be ≥ `0.5` to display at all; show at most the top `5` candidates, sorted descending. (spec: Matching algorithm)
- Visual weight `0.5`, location weight `0.3`, date weight `0.2` when both posts have an embedding; renormalized to location `0.6` / date `0.4` when either is missing an embedding — never scored as 0 or excluded outright. (spec: Matching algorithm)
- Location score radius cap: `50` km (matches `BrowseFeedPage`'s current default, which today is only a local `useState(50)` literal — this constant is defined locally in `matchPosts.js`, not imported). (spec: Matching algorithm)
- "Possible Matches" section shown only to the post owner, only for `status === 'active'` posts. (spec: UI & placement)
- Score labels: `"Strong match"` for score ≥ `0.75`, `"Possible match"` for `0.5`–`0.75`. (spec: UI & placement)

---

### Task 1: Migration — add `photo_embedding` column

**Files:**
- Create: `supabase/migrations/0005_photo_embedding.sql`

**Interfaces:**
- Produces: nullable `photo_embedding jsonb` column on `posts`, consumed by Task 6 (`buildPostPayload.js`) and Task 7 (`postsApi.js` reads it back via `select('*')`).

- [ ] **Step 1: Write the migration**

```sql
alter table posts add column photo_embedding jsonb;
```

Save as `supabase/migrations/0005_photo_embedding.sql`. This follows the exact pattern of `0004_posts_phone_number.sql` (`alter table posts add column phone_number text;`) — a single additive, nullable column. No new grants are needed: `0003_grants.sql`'s `alter default privileges ... grant all on tables` already covers columns added to existing tables.

- [ ] **Step 2: Apply the migration locally**

Run: `supabase db reset`
Expected: migrations `0001`–`0005` replay cleanly, no errors.

**Reminder:** `supabase db reset` wipes seeded demo posts (documented gotcha in `CLAUDE.md`). After this step, run `nvm exec 22 node scripts/seed-test-posts.mjs` to restore demo data before manually testing later tasks in a browser.

- [ ] **Step 3: Verify the column exists**

Run: `nvm exec 22 node scripts/verify-schema.mjs`
Expected: script completes without a `permission denied` or missing-column error (it doesn't need to touch `photo_embedding` directly — this just confirms the migration didn't break the existing schema/RLS sanity check).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_photo_embedding.sql
git commit -m "Add nullable photo_embedding column to posts"
```

---

### Task 2: Extract shared TF.js model-loading module

**Files:**
- Create: `src/features/posts/photoAnalysis/models.js`
- Modify: `src/features/posts/photoAnalysis/analyzePhoto.js`
- Test: `src/features/posts/photoAnalysis/analyzePhoto.test.js` (no code changes — existing tests must still pass unmodified, proving the refactor is behavior-preserving)

**Interfaces:**
- Produces: `ensureTfjsBackend(): Promise<Module>`, `getCocoModel(): Promise<CocoSsdModel>`, `getMobilenetModel(): Promise<MobilenetModel>` — all three memoized at module scope. Consumed by `analyzePhoto.js` (this task) and `getPhotoEmbedding.js` (Task 4).

This is a pure extraction — `analyzePhoto.js` currently defines `ensureTfjsBackend`/`getCocoModel`/`getMobilenetModel` as private module-scoped functions. Task 4 needs `getMobilenetModel` too, and it must be the **same memoized promise** so the model is only downloaded once — so these move into their own shared module first.

- [ ] **Step 1: Run the existing test suite to confirm the baseline is green**

Run: `npx vitest run src/features/posts/photoAnalysis/analyzePhoto.test.js`
Expected: all 4 existing tests PASS (this is the baseline you'll diff against after the refactor).

- [ ] **Step 2: Create `models.js` with the extracted functions**

```js
// src/features/posts/photoAnalysis/models.js

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

- [ ] **Step 3: Update `analyzePhoto.js` to import from `models.js`**

Remove these lines from `src/features/posts/photoAnalysis/analyzePhoto.js` (currently lines 16-49):

```js
let tfjsBackendPromise = null
let cocoModelPromise = null
let mobilenetModelPromise = null

// @tensorflow-models/coco-ssd and @tensorflow-models/mobilenet only depend on
// @tensorflow/tfjs-core (tensor APIs), not a backend implementation. Without
// importing the @tensorflow/tfjs umbrella package first (which registers the
// CPU/WebGL backends as a side effect), model.load() throws "No backend found
// in registry." Dynamic-imported here (not at module top) so it code-splits
// alongside coco-ssd/mobilenet instead of loading on every page.
function ensureTfjsBackend() {
  if (!tfjsBackendPromise) {
    tfjsBackendPromise = import('@tensorflow/tfjs')
  }
  return tfjsBackendPromise
}

function getCocoModel() {
  if (!cocoModelPromise) {
    cocoModelPromise = ensureTfjsBackend()
      .then(() => import('@tensorflow-models/coco-ssd'))
      .then((module) => module.load())
  }
  return cocoModelPromise
}

function getMobilenetModel() {
  if (!mobilenetModelPromise) {
    mobilenetModelPromise = ensureTfjsBackend()
      .then(() => import('@tensorflow-models/mobilenet'))
      .then((module) => module.load())
  }
  return mobilenetModelPromise
}
```

Replace the top of the file (currently lines 1-4) with:

```js
import { loadImageElement, cropToImageData } from './imageCanvas.js'
import { matchSpeciesClass } from './speciesMatcher.js'
import { matchBreedLabel } from './breedMatcher.js'
import { computeDominantColorBucket, matchColorToOption } from './colorMatcher.js'
import { getCocoModel, getMobilenetModel } from './models.js'
```

The rest of `analyzePhoto.js` (the `analyzePhoto` function body) is unchanged — it already calls `getCocoModel()`/`getMobilenetModel()` by name, which now resolve to the imported versions.

- [ ] **Step 4: Run the test suite again to confirm the refactor is behavior-preserving**

Run: `npx vitest run src/features/posts/photoAnalysis/analyzePhoto.test.js`
Expected: the same 4 tests PASS, unmodified. (`vi.mock('@tensorflow/tfjs', ...)` etc. in the test file mock the underlying npm packages, not `models.js` directly, so no test changes are needed — the mocks intercept regardless of which module does the importing.)

- [ ] **Step 5: Manually verify in a real browser**

Per the existing `CLAUDE.md` gotcha: *"This bug shipped once already: every test mocks coco-ssd/mobilenet entirely, so real TF.js internals (including backend registration) are never exercised by the test suite — this class of bug only surfaces by actually running the feature in a browser."* This task touches exactly that code path, so:

Run: `npm run dev`, open the app, go to "Report a missing or found pet," upload a real photo, click "Analyze Photo."
Expected: no "No backend found in registry" error in the browser console; species/breed/color fields populate or show the "couldn't confidently detect" note as before.

- [ ] **Step 6: Commit**

```bash
git add src/features/posts/photoAnalysis/models.js src/features/posts/photoAnalysis/analyzePhoto.js
git commit -m "Extract shared TF.js model-loading module from analyzePhoto"
```

---

### Task 3: `cosineSimilarity.js`

**Files:**
- Create: `src/features/posts/photoAnalysis/cosineSimilarity.js`
- Test: `src/features/posts/photoAnalysis/cosineSimilarity.test.js`

**Interfaces:**
- Produces: `cosineSimilarity(vectorA: number[], vectorB: number[]): number` — pure function, range roughly `[-1, 1]`. Consumed by Task 5 (`matchPosts.js`).

- [ ] **Step 1: Write the failing tests**

```js
// src/features/posts/photoAnalysis/cosineSimilarity.test.js
import { expect, test } from 'vitest'
import { cosineSimilarity } from './cosineSimilarity.js'

test('returns 1 for identical vectors', () => {
  expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10)
})

test('returns 0 for orthogonal vectors', () => {
  expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10)
})

test('returns -1 for opposite vectors', () => {
  expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10)
})

test('returns 0 when either vector is all zeros, avoiding a division by zero', () => {
  expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/posts/photoAnalysis/cosineSimilarity.test.js`
Expected: FAIL — `Failed to resolve import "./cosineSimilarity.js"`.

- [ ] **Step 3: Implement**

```js
// src/features/posts/photoAnalysis/cosineSimilarity.js
export function cosineSimilarity(vectorA, vectorB) {
  let dotProduct = 0
  let magnitudeA = 0
  let magnitudeB = 0

  for (let i = 0; i < vectorA.length; i += 1) {
    dotProduct += vectorA[i] * vectorB[i]
    magnitudeA += vectorA[i] ** 2
    magnitudeB += vectorB[i] ** 2
  }

  if (magnitudeA === 0 || magnitudeB === 0) return 0

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/posts/photoAnalysis/cosineSimilarity.test.js`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/features/posts/photoAnalysis/cosineSimilarity.js src/features/posts/photoAnalysis/cosineSimilarity.test.js
git commit -m "Add cosineSimilarity pure function for embedding comparison"
```

---

### Task 4: `getPhotoEmbedding.js`

**Files:**
- Create: `src/features/posts/photoAnalysis/getPhotoEmbedding.js`
- Test: `src/features/posts/photoAnalysis/getPhotoEmbedding.test.js`

**Interfaces:**
- Consumes: `getMobilenetModel()` from `./models.js` (Task 2), `loadImageElement(file)` from `./imageCanvas.js` (existing).
- Produces: `getPhotoEmbedding(file: File): Promise<number[] | null>` — never rejects; resolves `null` on any failure. Consumed by Task 8 (`CreatePostForm.jsx`).

- [ ] **Step 1: Write the failing tests**

```js
// src/features/posts/photoAnalysis/getPhotoEmbedding.test.js
import { beforeEach, expect, test, vi } from 'vitest'
import * as mobilenet from '@tensorflow-models/mobilenet'

vi.mock('@tensorflow/tfjs', () => ({}))
vi.mock('@tensorflow-models/mobilenet', () => ({ load: vi.fn() }))
vi.mock('./imageCanvas.js', () => ({
  loadImageElement: vi.fn(() => Promise.resolve({})),
}))

const fakeFile = new File(['fake-image-content'], 'cat.jpg', { type: 'image/jpeg' })

// models.js (via getMobilenetModel) memoizes the loaded model in a module-scoped
// variable, same as analyzePhoto.js — reset the module registry and re-import
// fresh before each test, same pattern as analyzePhoto.test.js.
let getPhotoEmbedding

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  ;({ getPhotoEmbedding } = await import('./getPhotoEmbedding.js'))
})

test('returns a plain array of numbers from the model embedding tensor, and disposes it', async () => {
  const dispose = vi.fn()
  mobilenet.load.mockResolvedValue({
    infer: vi.fn(() => ({
      data: () => Promise.resolve(Float32Array.from([0.5, 0.25, -0.75])),
      dispose,
    })),
  })

  const result = await getPhotoEmbedding(fakeFile)

  expect(result).toEqual([0.5, 0.25, -0.75])
  expect(dispose).toHaveBeenCalled()
})

test('calls infer in embedding mode on the loaded (uncropped) image', async () => {
  const infer = vi.fn(() => ({ data: () => Promise.resolve(Float32Array.from([1])), dispose: vi.fn() }))
  mobilenet.load.mockResolvedValue({ infer })

  await getPhotoEmbedding(fakeFile)

  expect(infer).toHaveBeenCalledWith({}, true)
})

test('resolves null (never rejects) when the model fails to load', async () => {
  mobilenet.load.mockRejectedValue(new Error('network error'))

  const result = await getPhotoEmbedding(fakeFile)

  expect(result).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/posts/photoAnalysis/getPhotoEmbedding.test.js`
Expected: FAIL — `Failed to resolve import "./getPhotoEmbedding.js"`.

- [ ] **Step 3: Implement**

```js
// src/features/posts/photoAnalysis/getPhotoEmbedding.js
import { loadImageElement } from './imageCanvas.js'
import { getMobilenetModel } from './models.js'

export async function getPhotoEmbedding(file) {
  try {
    const imageElement = await loadImageElement(file)
    const model = await getMobilenetModel()
    const embeddingTensor = model.infer(imageElement, true)
    try {
      const values = await embeddingTensor.data()
      return Array.from(values)
    } finally {
      embeddingTensor.dispose()
    }
  } catch {
    return null
  }
}
```

Note: unlike breed detection, this runs on the **full loaded image**, not a COCO-SSD-cropped region — it doesn't need species detection or a bounding box, so it never loads `coco-ssd` at all, only `mobilenet`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/posts/photoAnalysis/getPhotoEmbedding.test.js`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/features/posts/photoAnalysis/getPhotoEmbedding.js src/features/posts/photoAnalysis/getPhotoEmbedding.test.js
git commit -m "Add getPhotoEmbedding for client-side MobileNet feature vectors"
```

---

### Task 5: `matchPosts.js`

**Files:**
- Create: `src/features/posts/matchPosts.js`
- Test: `src/features/posts/matchPosts.test.js`

**Interfaces:**
- Consumes: `haversineDistanceKm(lat1, lng1, lat2, lng2)` from `../../lib/distance.js` (existing), `cosineSimilarity(vectorA, vectorB)` from `./photoAnalysis/cosineSimilarity.js` (Task 3).
- Produces: `findMatches(post, candidatePosts): Array<{post, score}>`, `matchLabelForScore(score): string`, `MATCH_SCORE_THRESHOLD: number`, `MAX_MATCHES: number`. Consumed by Task 9 (`PostDetailPage.jsx`).

- [ ] **Step 1: Write the failing tests**

```js
// src/features/posts/matchPosts.test.js
import { describe, expect, test } from 'vitest'
import { findMatches, matchLabelForScore, MAX_MATCHES } from './matchPosts.js'

const embeddingA = [1, 0, 0]
const embeddingIdentical = [1, 0, 0]
const embeddingOrthogonal = [0, 1, 0]

const basePost = {
  id: 'mine',
  location_lat: 32.08,
  location_lng: 34.78,
  date_lost_or_found: '2026-07-01',
  photo_embedding: embeddingA,
}

function buildCandidate(overrides = {}) {
  return {
    id: 'candidate',
    location_lat: 32.08,
    location_lng: 34.78,
    date_lost_or_found: '2026-07-01',
    photo_embedding: embeddingIdentical,
    ...overrides,
  }
}

describe('findMatches', () => {
  test('scores a candidate with matching location, date, and visual embedding as a strong match', () => {
    const result = findMatches(basePost, [buildCandidate()])
    expect(result).toHaveLength(1)
    expect(result[0].score).toBeCloseTo(1, 5)
    expect(matchLabelForScore(result[0].score)).toBe('Strong match')
  })

  test('drops the visual term and renormalizes when either post has no embedding', () => {
    const post = { ...basePost, photo_embedding: null }
    const candidate = buildCandidate({ photo_embedding: null })
    const result = findMatches(post, [candidate])
    expect(result).toHaveLength(1)
    // same location + date, no visual signal at all -> full renormalized score of 1
    expect(result[0].score).toBeCloseTo(1, 5)
  })

  test('excludes candidates scoring below the match threshold', () => {
    const farAndOldCandidate = buildCandidate({
      location_lat: 60,
      location_lng: 60,
      date_lost_or_found: '2020-01-01',
      photo_embedding: embeddingOrthogonal,
    })
    const result = findMatches(basePost, [farAndOldCandidate])
    expect(result).toEqual([])
  })

  test('sorts by score descending and caps at MAX_MATCHES results', () => {
    const candidates = Array.from({ length: MAX_MATCHES + 3 }, (_, i) =>
      buildCandidate({ id: `candidate-${i}`, location_lng: 34.78 + i * 0.01 })
    )
    const result = findMatches(basePost, candidates)
    expect(result).toHaveLength(MAX_MATCHES)
    for (let i = 1; i < result.length; i += 1) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score)
    }
  })
})

describe('matchLabelForScore', () => {
  test('labels 0.75 and above as a strong match', () => {
    expect(matchLabelForScore(0.75)).toBe('Strong match')
    expect(matchLabelForScore(0.9)).toBe('Strong match')
  })

  test('labels between the threshold and 0.75 as a possible match', () => {
    expect(matchLabelForScore(0.5)).toBe('Possible match')
    expect(matchLabelForScore(0.74)).toBe('Possible match')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/posts/matchPosts.test.js`
Expected: FAIL — `Failed to resolve import "./matchPosts.js"`.

- [ ] **Step 3: Implement**

```js
// src/features/posts/matchPosts.js
import { haversineDistanceKm } from '../../lib/distance.js'
import { cosineSimilarity } from './photoAnalysis/cosineSimilarity.js'

export const MATCH_SCORE_THRESHOLD = 0.5
export const MAX_MATCHES = 5

const RADIUS_CAP_KM = 50
const DATE_DECAY_DAYS = 14
const VISUAL_WEIGHT = 0.5
const LOCATION_WEIGHT = 0.3
const DATE_WEIGHT = 0.2
const LOCATION_WEIGHT_NO_VISUAL = 0.6
const DATE_WEIGHT_NO_VISUAL = 0.4
const MS_PER_DAY = 1000 * 60 * 60 * 24

function locationScore(postA, postB) {
  const distanceKm = haversineDistanceKm(
    postA.location_lat,
    postA.location_lng,
    postB.location_lat,
    postB.location_lng
  )
  return Math.max(0, 1 - distanceKm / RADIUS_CAP_KM)
}

function dateScore(postA, postB) {
  const daysApart =
    Math.abs(new Date(postA.date_lost_or_found) - new Date(postB.date_lost_or_found)) / MS_PER_DAY
  return Math.exp(-daysApart / DATE_DECAY_DAYS)
}

function scorePair(post, candidate) {
  const location = locationScore(post, candidate)
  const date = dateScore(post, candidate)

  if (post.photo_embedding && candidate.photo_embedding) {
    const visual = cosineSimilarity(post.photo_embedding, candidate.photo_embedding)
    return visual * VISUAL_WEIGHT + location * LOCATION_WEIGHT + date * DATE_WEIGHT
  }

  return location * LOCATION_WEIGHT_NO_VISUAL + date * DATE_WEIGHT_NO_VISUAL
}

export function findMatches(post, candidatePosts) {
  return candidatePosts
    .map((candidate) => ({ post: candidate, score: scorePair(post, candidate) }))
    .filter(({ score }) => score >= MATCH_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHES)
}

export function matchLabelForScore(score) {
  return score >= 0.75 ? 'Strong match' : 'Possible match'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/posts/matchPosts.test.js`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/features/posts/matchPosts.js src/features/posts/matchPosts.test.js
git commit -m "Add matchPosts hybrid scoring (visual + location + date)"
```

---

### Task 6: `buildPostPayload.js` — pass through `photo_embedding`

**Files:**
- Modify: `src/features/posts/buildPostPayload.js`
- Modify: `src/features/posts/buildPostPayload.test.js`

**Interfaces:**
- Consumes: `formValues.photoEmbedding` (a `number[]` or `null`/`undefined`), supplied by Task 8 (`CreatePostForm.jsx`).
- Produces: `photo_embedding` key on the returned payload object, consumed by Task 1's migration column via `createPost` (existing, unchanged).

- [ ] **Step 1: Update the failing/changed tests**

In `src/features/posts/buildPostPayload.test.js`, update the first test's input and expected output to include the new field (add `photoEmbedding: [0.1, 0.2, 0.3],` to the input object, and `photo_embedding: [0.1, 0.2, 0.3],` to the expected output object — both alongside the existing `phoneNumber`/`phone_number` lines), and add one new test:

```js
test('defaults photo_embedding to null when no embedding was computed', () => {
  const payload = buildPostPayload(
    {
      type: 'found',
      species: 'dog',
      locationLat: 1,
      locationLng: 2,
      locationText: 'somewhere',
      dateLostOrFound: '2026-07-01',
    },
    'owner-2'
  )

  expect(payload.photo_embedding).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify the updated first test fails**

Run: `npx vitest run src/features/posts/buildPostPayload.test.js`
Expected: FAIL — the first test's `toEqual` mismatch (missing `photo_embedding` key in actual output); the new test also fails (`payload.photo_embedding` is `undefined`, not `null`).

- [ ] **Step 3: Implement**

In `src/features/posts/buildPostPayload.js`, add one line to the returned object, alongside `phone_number`:

```js
    phone_number: formValues.phoneNumber || null,
    photo_embedding: formValues.photoEmbedding || null,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/posts/buildPostPayload.test.js`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/features/posts/buildPostPayload.js src/features/posts/buildPostPayload.test.js
git commit -m "Pass photo_embedding through buildPostPayload"
```

---

### Task 7: `listCandidatePostsForMatching` in `postsApi.js`

**Files:**
- Modify: `src/testUtils/fakeSupabase.js`
- Modify: `src/features/posts/postsApi.js`
- Modify: `src/features/posts/postsApi.test.js`

**Interfaces:**
- Produces: `listCandidatePostsForMatching(supabase, { type, species, excludePostId }): Promise<Post[]>`, consumed by Task 9 (`PostDetailPage.jsx`).

- [ ] **Step 1: Add `neq` to the shared fake Supabase query builder**

`createFakeQuery` in `src/testUtils/fakeSupabase.js` doesn't yet support `.neq()` (only `select`/`order`/`eq`/`insert`/`update`/`delete`/`single`/`then`). Add it alongside `eq`:

```js
    select: () => query,
    order: () => query,
    eq: () => query,
    neq: () => query,
    insert: () => query,
```

- [ ] **Step 2: Write the failing test**

In `src/features/posts/postsApi.test.js`, update the import line to include the new function:

```js
import { listPosts, getPost, createPost, resolvePost, listCandidatePostsForMatching } from './postsApi.js'
```

Add:

```js
test('listCandidatePostsForMatching returns candidate posts for the opposite type/species', async () => {
  const postsQuery = createFakeQuery({ data: [{ id: 'p2' }], error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  const result = await listCandidatePostsForMatching(supabase, {
    type: 'found',
    species: 'cat',
    excludePostId: 'p1',
  })
  expect(result).toEqual([{ id: 'p2' }])
})
```

- [ ] **Step 3: Run tests to verify the new test fails**

Run: `npx vitest run src/features/posts/postsApi.test.js`
Expected: FAIL — `listCandidatePostsForMatching is not a function`.

- [ ] **Step 4: Implement**

Add to `src/features/posts/postsApi.js`:

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

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/posts/postsApi.test.js`
Expected: PASS (5/5).

- [ ] **Step 6: Commit**

```bash
git add src/testUtils/fakeSupabase.js src/features/posts/postsApi.js src/features/posts/postsApi.test.js
git commit -m "Add listCandidatePostsForMatching query"
```

---

### Task 8: Wire background embedding computation into `CreatePostForm`

**Files:**
- Modify: `src/features/posts/CreatePostForm.jsx`
- Modify: `src/features/posts/CreatePostForm.test.jsx`

**Interfaces:**
- Consumes: `getPhotoEmbedding(file)` from `./photoAnalysis/getPhotoEmbedding.js` (Task 4), `buildPostPayload` (Task 6, now accepts `photoEmbedding`).

- [ ] **Step 1: Write the failing tests**

Add to `src/features/posts/CreatePostForm.test.jsx`, near the other imports/mocks at the top:

```js
import { getPhotoEmbedding } from './photoAnalysis/getPhotoEmbedding.js'
```

```js
vi.mock('./photoAnalysis/getPhotoEmbedding.js', () => ({ getPhotoEmbedding: vi.fn(() => Promise.resolve(null)) }))
```

Add two new tests (anywhere after `uploadOnePhoto` is defined, so they can use it):

```js
test('computes a photo embedding in the background and includes it in the created post payload', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  getPhotoEmbedding.mockResolvedValue([0.1, 0.2, 0.3])

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await uploadOnePhoto()
  await userEvent.selectOptions(screen.getByLabelText('Species'), 'cat')
  await userEvent.click(screen.getByText('Pick a location (test stub)'))
  await userEvent.type(screen.getByLabelText('Date lost/found'), '2026-07-01')
  await userEvent.click(screen.getByText('Create post'))

  await waitFor(() =>
    expect(postsApi.createPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ photo_embedding: [0.1, 0.2, 0.3] }),
      expect.any(Array)
    )
  )
})

test('submits with a null photo embedding when no photo was selected', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await userEvent.selectOptions(screen.getByLabelText('Species'), 'cat')
  await userEvent.click(screen.getByText('Pick a location (test stub)'))
  await userEvent.type(screen.getByLabelText('Date lost/found'), '2026-07-01')
  await userEvent.click(screen.getByText('Create post'))

  await waitFor(() =>
    expect(postsApi.createPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ photo_embedding: null }),
      []
    )
  )
  expect(getPhotoEmbedding).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/posts/CreatePostForm.test.jsx`
Expected: FAIL — `photo_embedding` is `undefined` in the received payload (not wired up yet).

- [ ] **Step 3: Implement**

In `src/features/posts/CreatePostForm.jsx`, update the imports at the top:

```js
import { useEffect, useRef, useState } from 'react'
```

```js
import { analyzePhoto } from './photoAnalysis/analyzePhoto.js'
import { getPhotoEmbedding } from './photoAnalysis/getPhotoEmbedding.js'
```

Add a ref and an effect, right after the existing `previewUrls` effect (after line 125's closing `}, [files])`):

```js
  // Runs automatically in the background whenever the cover photo changes —
  // unlike breed/species/color auto-fill, this isn't gated behind the
  // "Analyze Photo" button, since match-suggestions needs an embedding for
  // every post regardless of whether the user opts into auto-fill.
  const photoEmbeddingPromiseRef = useRef(null)

  useEffect(() => {
    photoEmbeddingPromiseRef.current = files.length > 0 ? getPhotoEmbedding(files[0]) : null
  }, [files])
```

Update `handleSubmit` to await the pending embedding and pass it through:

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

(`getPhotoEmbedding` never rejects — see Task 4 — so no extra try/catch is needed around the `await`; a failure surfaces as `null`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/posts/CreatePostForm.test.jsx`
Expected: PASS, all tests including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/features/posts/CreatePostForm.jsx src/features/posts/CreatePostForm.test.jsx
git commit -m "Compute photo embedding in the background on post creation"
```

---

### Task 9: "Possible Matches" section on `PostDetailPage`

**Files:**
- Modify: `src/features/posts/PostDetailPage.jsx`
- Modify: `src/features/posts/PostDetailPage.test.jsx`

**Interfaces:**
- Consumes: `listCandidatePostsForMatching` (Task 7), `findMatches`/`matchLabelForScore` (Task 5), `PostCard` (existing, unmodified).

- [ ] **Step 1: Write the failing tests**

In `src/features/posts/PostDetailPage.test.jsx`, update the `postsApi.js` mock at the top to include the new function (default: no candidates):

```js
vi.mock('./postsApi.js', () => ({
  getPost: vi.fn(() =>
    Promise.resolve({ id: 'p1', owner_id: 'owner-1', type: 'missing', species: 'cat', location_text: 'Tel Aviv', post_photos: [] })
  ),
  resolvePost: vi.fn(() => Promise.resolve()),
  listCandidatePostsForMatching: vi.fn(() => Promise.resolve([])),
}))
```

Add a fixture and new tests near the bottom of the file:

```js
const activeOwnedPost = {
  id: 'p10',
  owner_id: 'owner-1',
  type: 'missing',
  species: 'cat',
  location_text: 'Tel Aviv',
  location_lat: 32.08,
  location_lng: 34.78,
  date_lost_or_found: '2026-07-01',
  status: 'active',
  photo_embedding: null,
  post_photos: [],
}

function buildCandidatePost(overrides = {}) {
  return {
    id: 'candidate-1',
    type: 'found',
    species: 'cat',
    location_lat: 32.08,
    location_lng: 34.78,
    date_lost_or_found: '2026-07-01',
    photo_embedding: null,
    post_photos: [],
    ...overrides,
  }
}

test('owner sees a possible match found for their active post', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  postsApi.getPost.mockResolvedValueOnce(activeOwnedPost)
  postsApi.listCandidatePostsForMatching.mockResolvedValueOnce([buildCandidatePost()])
  renderAtPost('p10')

  expect(await screen.findByText('Possible Matches')).toBeInTheDocument()
  expect(await screen.findByText('Strong match')).toBeInTheDocument()
  expect(postsApi.listCandidatePostsForMatching).toHaveBeenCalledWith(expect.anything(), {
    type: 'found',
    species: 'cat',
    excludePostId: 'p10',
  })
})

test('non-owner never sees the Possible Matches section', async () => {
  useAuth.mockReturnValue({ user: { id: 'someone-else' } })
  postsApi.getPost.mockResolvedValueOnce(activeOwnedPost)
  renderAtPost('p10')

  await waitFor(() => screen.getByText(/Missing: cat/))
  expect(screen.queryByText('Possible Matches')).not.toBeInTheDocument()
  expect(postsApi.listCandidatePostsForMatching).not.toHaveBeenCalled()
})

test('resolved post never shows the Possible Matches section, even for the owner', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  postsApi.getPost.mockResolvedValueOnce({ ...activeOwnedPost, status: 'resolved' })
  renderAtPost('p10')

  await waitFor(() => screen.getByText(/Missing: cat/))
  expect(screen.queryByText('Possible Matches')).not.toBeInTheDocument()
  expect(postsApi.listCandidatePostsForMatching).not.toHaveBeenCalled()
})

test('shows an empty state when no candidates score high enough to be a match', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  postsApi.getPost.mockResolvedValueOnce(activeOwnedPost)
  postsApi.listCandidatePostsForMatching.mockResolvedValueOnce([
    buildCandidatePost({ location_lat: 60, location_lng: 60, date_lost_or_found: '2020-01-01' }),
  ])
  renderAtPost('p10')

  expect(await screen.findByText('No possible matches found yet.')).toBeInTheDocument()
})

test('the Check for new matches button re-runs the match query', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  postsApi.getPost.mockResolvedValueOnce(activeOwnedPost)
  postsApi.listCandidatePostsForMatching.mockResolvedValue([])
  renderAtPost('p10')

  await screen.findByText('No possible matches found yet.')
  await userEvent.click(screen.getByRole('button', { name: 'Check for new matches' }))

  await waitFor(() => expect(postsApi.listCandidatePostsForMatching).toHaveBeenCalledTimes(2))
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/features/posts/PostDetailPage.test.jsx`
Expected: FAIL — `screen.findByText('Possible Matches')` never resolves (section doesn't exist yet).

- [ ] **Step 3: Implement**

Replace the full contents of `src/features/posts/PostDetailPage.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient.js'
import { getPost, resolvePost, listCandidatePostsForMatching } from './postsApi.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { buildPhotoUrl } from '../../lib/photoUrl.js'
import PawPrintIcon from '../layout/PawPrintIcon.jsx'
import PostCard from './PostCard.jsx'
import { findMatches, matchLabelForScore } from './matchPosts.js'

export default function PostDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const [error, setError] = useState(null)
  const [matches, setMatches] = useState([])
  const [matchesChecked, setMatchesChecked] = useState(false)
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [matchesError, setMatchesError] = useState(null)

  useEffect(() => {
    getPost(supabase, id)
      .then(setPost)
      .catch((err) => setError(err.message))
  }, [id])

  async function checkForMatches(currentPost) {
    setMatchesLoading(true)
    setMatchesError(null)
    try {
      const oppositeType = currentPost.type === 'missing' ? 'found' : 'missing'
      const candidates = await listCandidatePostsForMatching(supabase, {
        type: oppositeType,
        species: currentPost.species,
        excludePostId: currentPost.id,
      })
      setMatches(findMatches(currentPost, candidates))
    } catch {
      setMatchesError("Couldn't check for matches right now.")
    } finally {
      setMatchesLoading(false)
      setMatchesChecked(true)
    }
  }

  // Runs once, automatically, the first time the owner views their own active
  // post — this is the "automatic" half of match-checking (pull-based, on
  // view, not a push notification). Computed from `user`/`post` directly
  // (not the render-scoped `isOwner` below, which is defined after the early
  // returns) so this hook can be called unconditionally, before those returns.
  useEffect(() => {
    if (post && user && user.id === post.owner_id && post.status === 'active' && !matchesChecked) {
      checkForMatches(post)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post, user])

  if (error) return <p role="alert">{error}</p>
  if (!post) return <p>Loading...</p>

  const isOwner = user && user.id === post.owner_id
  const canContact = user && !isOwner

  async function handleResolve() {
    await resolvePost(supabase, post.id)
    setPost((prev) => ({ ...prev, status: 'resolved' }))
  }

  function handleContact() {
    navigate('/messages', {
      state: {
        openPostId: post.id,
        otherUser: { id: post.owner_id, displayName: post.profiles?.display_name ?? null },
        postSummary: {
          type: post.type,
          species: post.species,
          petName: post.pet_name || null,
          photoUrl: post.post_photos?.[0] ? buildPhotoUrl(post.post_photos[0].storage_path) : null,
        },
      },
    })
  }

  const isMissing = post.type === 'missing'
  const posterName = post.profiles?.display_name

  return (
    <div>
      <h2>
        {isMissing ? 'Missing' : 'Found'}: {post.species}
        {isMissing && post.pet_name ? ` — ${post.pet_name}` : ''}
      </h2>
      {posterName && <p className="post-posted-by">Posted by {posterName}</p>}

      {post.status === 'resolved' && (
        <div className="resolved-banner">
          <PawPrintIcon size={22} />
          <span>
            {isMissing && post.pet_name ? post.pet_name : 'This pet'} has been reunited with their
            family.
          </span>
        </div>
      )}

      {post.post_photos && post.post_photos.length > 0 && (
        <div className="post-detail-photos">
          {post.post_photos.map((photo) => (
            <img
              key={photo.id || photo.storage_path}
              className="post-detail-photo"
              src={buildPhotoUrl(photo.storage_path)}
              alt={`${isMissing ? 'Missing' : 'Found'} ${post.species}`}
            />
          ))}
        </div>
      )}

      <dl className="post-detail-fields">
        <div className="post-detail-field field-location">
          <dt>Location</dt>
          <dd>{post.location_text}</dd>
        </div>
        <div className="post-detail-field field-date">
          <dt>Date {isMissing ? 'lost' : 'found'}</dt>
          <dd>{post.date_lost_or_found}</dd>
        </div>
        <div className="post-detail-field field-breed">
          <dt>Breed</dt>
          <dd>{post.breed || '—'}</dd>
        </div>
        <div className="post-detail-field field-color">
          <dt>Color</dt>
          <dd>{post.color || '—'}</dd>
        </div>
        <div className="post-detail-field field-size">
          <dt>Size</dt>
          <dd>{post.size || '—'}</dd>
        </div>
        <div className="post-detail-field field-microchipped">
          <dt>Microchipped</dt>
          <dd>{post.microchipped}</dd>
        </div>
        <div className="post-detail-field field-collar">
          <dt>Collar</dt>
          <dd>{post.collar ? post.collar_description || 'Yes' : 'No'}</dd>
        </div>
        <div className="post-detail-field field-markings">
          <dt>Distinctive markings</dt>
          <dd>{post.distinctive_markings || '—'}</dd>
        </div>
        <div className="post-detail-field field-phone">
          <dt>Phone</dt>
          <dd>{post.phone_number ? <a href={`tel:${post.phone_number}`}>{post.phone_number}</a> : '—'}</dd>
        </div>
      </dl>

      {isMissing && post.reward_amount && (
        <p className="post-detail-reward">Reward: ₪{Number(post.reward_amount).toLocaleString()}</p>
      )}

      {canContact && (
        <button type="button" className="contact-publisher-button" onClick={handleContact}>
          Contact publisher
        </button>
      )}

      {isOwner && post.status !== 'resolved' && (
        <button onClick={handleResolve}>Mark as resolved</button>
      )}

      {isOwner && post.status === 'active' && (
        <div className="possible-matches">
          <h3 className="possible-matches-title">Possible Matches</h3>
          {matchesError && <p className="possible-matches-error">{matchesError}</p>}
          {matchesChecked && !matchesLoading && matches.length === 0 && !matchesError && (
            <p className="possible-matches-empty">No possible matches found yet.</p>
          )}
          {matches.length > 0 && (
            <div className="possible-matches-list">
              {matches.map(({ post: candidate, score }) => (
                <div key={candidate.id} className="match-card">
                  <span className="match-score-badge">{matchLabelForScore(score)}</span>
                  <PostCard post={candidate} />
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="possible-matches-recheck-button"
            onClick={() => checkForMatches(post)}
            disabled={matchesLoading}
          >
            {matchesLoading ? 'Checking…' : 'Check for new matches'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/posts/PostDetailPage.test.jsx`
Expected: PASS, all tests including the 5 new ones. (Pre-existing tests are unaffected: their `getPost` fixtures have no `status: 'active'`, so the new auto-check effect never fires for them.)

- [ ] **Step 5: Commit**

```bash
git add src/features/posts/PostDetailPage.jsx src/features/posts/PostDetailPage.test.jsx
git commit -m "Show Possible Matches section to post owners"
```

---

### Task 10: Styling for the Possible Matches section

**Files:**
- Modify: `src/features/layout/theme.css`

No automated test — this is a hand-authored CSS design system (per `CLAUDE.md`, no framework, no visual regression tooling). Verified manually in Step 2.

- [ ] **Step 1: Add the CSS**

Append after the existing `.contact-publisher-button` rule (around line 655 in `src/features/layout/theme.css`, right before the `/* ---------- Forms ---------- */` comment):

```css
.possible-matches {
  margin-top: var(--space-lg);
}

.possible-matches-title {
  font-family: var(--font-family-display);
  font-weight: 400;
  font-size: 1.15rem;
  margin: 0 0 var(--space-sm);
}

.possible-matches-list {
  display: flex;
  gap: var(--space-md);
  overflow-x: auto;
  padding-bottom: var(--space-xs);
}

.match-card {
  position: relative;
  flex: 0 0 220px;
}

.match-card .post-card {
  margin-bottom: 0;
  height: 100%;
}

.match-score-badge {
  position: absolute;
  top: var(--space-xs);
  left: var(--space-xs);
  z-index: 1;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px var(--space-sm);
  border-radius: var(--radius-pill);
}

.possible-matches-empty,
.possible-matches-error {
  color: var(--color-muted);
}

.possible-matches-recheck-button {
  display: inline-block;
  font-family: var(--font-family-body);
  font-weight: 700;
  color: var(--color-primary);
  background: var(--color-surface);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-button);
  padding: var(--space-xs) var(--space-md);
  cursor: pointer;
  margin-top: var(--space-sm);
}

.possible-matches-recheck-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

- [ ] **Step 2: Manually verify in a real browser**

Run: `npm run dev`
As a logged-in user, open one of your own active posts (`/post/:id`). Confirm: the "Possible Matches" section renders below "Mark as resolved," the score badge sits over the top-left corner of each candidate card without overlapping its content, the list scrolls horizontally if there are more candidates than fit, and "Check for new matches" looks consistent with the app's other secondary buttons. Check both a post with matches and one without (empty state).

- [ ] **Step 3: Commit**

```bash
git add src/features/layout/theme.css
git commit -m "Style the Possible Matches section"
```

---

### Task 11: Docs, full verification, and final commit

**Files:**
- Modify: `docs/features/post-matching.md`
- Modify: `docs/features/photo-autofill.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `post-matching.md` status**

Change the header from:

```markdown
**Status:** design approved, not yet implemented.
**Last updated:** 2026-07-15
```

to:

```markdown
**Status:** implemented.
**Last updated:** 2026-07-15
```

- [ ] **Step 2: Note the `models.js` extraction in `photo-autofill.md`**

In the "Architecture" section of `docs/features/photo-autofill.md`, after the paragraph describing the coco-ssd → crop → mobilenet pipeline, add:

```markdown
Model loading (`ensureTfjsBackend`/`getCocoModel`/`getMobilenetModel`) lives in its own shared module, `photoAnalysis/models.js`, extracted so `post-matching.md`'s embedding computation (`getPhotoEmbedding.js`) can reuse the same memoized MobileNet model instance instead of loading it a second time. `analyzePhoto.js` imports from there rather than defining these itself.
```

- [ ] **Step 3: Update `CLAUDE.md`'s architecture tree and schema section**

In the `Architecture` code block, update the `photoAnalysis/` line and add the new files/modules. Change:

```
      postsApi.js             # listPosts/getPost/createPost/resolvePost (supabase queries)
```

to:

```
      postsApi.js             # listPosts/getPost/createPost/resolvePost/listCandidatePostsForMatching
      matchPosts.js           # pure hybrid scoring (visual + location + date) for match suggestions
```

Change:

```
      photoAnalysis/          # client-side species/breed/color detection (TF.js), see Gotchas
```

to:

```
      photoAnalysis/          # client-side species/breed/color detection (TF.js), see Gotchas
        models.js              # shared memoized TF.js model loaders (coco-ssd, mobilenet) — analyzePhoto.js
                                # and getPhotoEmbedding.js both import from here, not their own copies
        getPhotoEmbedding.js    # MobileNet embedding vector for cross-post match suggestions
        cosineSimilarity.js     # pure vector-similarity helper used by matchPosts.js
```

In the "Database schema" section, update the posts field list to mention the new column, and add a line about the migration:

```markdown
`photo_embedding` (nullable `jsonb`, ~1024-number MobileNet feature vector, computed client-side at post-creation time — see `docs/features/post-matching.md`) ·
```
(insert this clause into the existing posts field list, after `phone_number`).

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass, no regressions in unrelated features.

- [ ] **Step 5: Full manual verification in a real browser**

Run: `npm run dev` (ensure `supabase start` is running and demo data is seeded per Task 1's reminder).

1. Create a new "found" post for a cat, with a photo, at roughly the same location/date as an existing seeded "missing" cat post (or create both fresh).
2. Open the missing post's detail page as its owner — confirm "Possible Matches" appears automatically and shows the found post you just created.
3. Click "Check for new matches" — confirm it re-runs without error.
4. View the same post as a different (non-owner) user — confirm the section doesn't appear.
5. Mark the post resolved — confirm the section disappears.

- [ ] **Step 6: Commit**

```bash
git add docs/features/post-matching.md docs/features/photo-autofill.md CLAUDE.md
git commit -m "Document post-matching feature and models.js extraction"
```
