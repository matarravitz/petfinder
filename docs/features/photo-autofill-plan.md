# Photo Auto-Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Analyze Photo" button to `CreatePostForm` that auto-fills species/breed/color from the first selected photo, using client-side TensorFlow.js models — per `docs/features/photo-autofill.md`.

**Architecture:** Three small pure functions (species class matcher, breed keyword matcher, dominant-color matcher) are unit-tested in isolation. An orchestration module (`analyzePhoto.js`) chains `@tensorflow-models/coco-ssd` (species + bounding box) → canvas crop → `@tensorflow-models/mobilenet` (breed) + a pixel-based color heuristic, calling the three pure matchers to produce the final result. `CreatePostForm.jsx` wires a button to this module, the same way it already stubs `LocationPicker` for tests — the model module gets fully mocked in the component test, since jsdom can't do real image decoding or GPU inference.

**Tech Stack:** React 18.3.1, plain JS, Vitest + `@testing-library/react` + `@testing-library/user-event`. New dependencies: `@tensorflow/tfjs`, `@tensorflow-models/coco-ssd`, `@tensorflow-models/mobilenet`.

## Global Constraints

- Client-side only — no Supabase Edge Function, no LLM/AI vision API call of any kind. (spec: Non-goals)
- `size` is never auto-filled — stays manual. (spec: Non-goals)
- Species auto-fill only produces `cat` / `dog` / `bird` (COCO-SSD's relevant classes) — `rabbit` and `other` always stay manual. (spec: Species detection)
- Breed auto-fill only runs when species resolved to `cat` or `dog` — always manual for `bird`. (spec: Breed detection)
- Confidence thresholds: species ≥ `0.6`, breed ≥ `0.4`, color "dominant enough" ratio ≥ `0.4` (else `Multi-color`). (spec: Low-confidence handling)
- Below threshold (or nothing detected at all) → leave that field blank, never guess. (spec: Low-confidence handling)
- Analysis always runs on `files[0]` (the first/cover photo) — no per-photo picker. (spec: Non-goals)
- Models load lazily on first "Analyze Photo" click, not on page mount. (spec: Architecture)
- Auto-filled fields show a small marker that clears the moment the user edits that field. (spec: UX & component changes)
- Re-running analysis overwrites only fields that get a confident result this run; low-confidence fields are left as-is, never wiped. (spec: UX & component changes)
- Nothing here ever blocks manual submission — model load failure, no detection, and unsupported browser are all non-blocking. (spec: Error handling)

---

### Task 1: Species matcher

**Files:**
- Create: `src/features/posts/photoAnalysis/speciesMatcher.js`
- Test: `src/features/posts/photoAnalysis/speciesMatcher.test.js`

**Interfaces:**
- Produces: `matchSpeciesClass(className: string) => 'cat' | 'dog' | 'bird' | null`

- [ ] **Step 1: Write the failing test**

```js
// src/features/posts/photoAnalysis/speciesMatcher.test.js
import { describe, expect, test } from 'vitest'
import { matchSpeciesClass } from './speciesMatcher.js'

describe('matchSpeciesClass', () => {
  test('passes through the three supported COCO-SSD classes', () => {
    expect(matchSpeciesClass('cat')).toBe('cat')
    expect(matchSpeciesClass('dog')).toBe('dog')
    expect(matchSpeciesClass('bird')).toBe('bird')
  })

  test('returns null for any other COCO-SSD class', () => {
    expect(matchSpeciesClass('horse')).toBeNull()
    expect(matchSpeciesClass('person')).toBeNull()
  })

  test('returns null for undefined input', () => {
    expect(matchSpeciesClass(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- speciesMatcher`
Expected: FAIL — `Failed to resolve import "./speciesMatcher.js"` (file doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

```js
// src/features/posts/photoAnalysis/speciesMatcher.js
const SUPPORTED_SPECIES_CLASSES = new Set(['cat', 'dog', 'bird'])

export function matchSpeciesClass(className) {
  return SUPPORTED_SPECIES_CLASSES.has(className) ? className : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- speciesMatcher`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/posts/photoAnalysis/speciesMatcher.js src/features/posts/photoAnalysis/speciesMatcher.test.js
git commit -m "feat: add species class matcher for photo auto-fill"
```

---

### Task 2: Breed matcher

**Files:**
- Create: `src/features/posts/photoAnalysis/breedMatcher.js`
- Test: `src/features/posts/photoAnalysis/breedMatcher.test.js`

**Interfaces:**
- Produces: `matchBreedLabel(predictionLabel: string, breedOptions: string[]) => { breed: string, breedOther: string }`
  - Confident match: `{ breed: '<matched option>', breedOther: '' }`
  - No match: `{ breed: 'other', breedOther: '<capitalized raw label>' }`

- [ ] **Step 1: Write the failing test**

```js
// src/features/posts/photoAnalysis/breedMatcher.test.js
import { describe, expect, test } from 'vitest'
import { matchBreedLabel } from './breedMatcher.js'

const DOG_BREEDS = [
  'Labrador Retriever',
  'German Shepherd',
  'Golden Retriever',
  'Poodle',
  'Bulldog',
  'Beagle',
  'Terrier Mix',
  'Chihuahua',
  'Dachshund',
  'Husky',
]

const CAT_BREEDS = [
  'Domestic Shorthair',
  'Domestic Longhair',
  'Siamese',
  'Persian',
  'Maine Coon',
  'British Shorthair',
  'Ragdoll',
  'Bengal',
  'Sphynx',
]

describe('matchBreedLabel', () => {
  test('matches a single-word ImageNet label to its breed option', () => {
    expect(matchBreedLabel('Siamese cat', CAT_BREEDS)).toEqual({
      breed: 'Siamese',
      breedOther: '',
    })
  })

  test('matches a multi-word ImageNet label to its breed option', () => {
    expect(matchBreedLabel('golden retriever', DOG_BREEDS)).toEqual({
      breed: 'Golden Retriever',
      breedOther: '',
    })
  })

  test('matches a compound ImageNet label (comma-separated aliases)', () => {
    expect(matchBreedLabel('German shepherd, German shepherd dog', DOG_BREEDS)).toEqual({
      breed: 'German Shepherd',
      breedOther: '',
    })
  })

  test('falls back to "other" with a capitalized raw label when nothing matches', () => {
    expect(matchBreedLabel('tabby, tabby cat', CAT_BREEDS)).toEqual({
      breed: 'other',
      breedOther: 'Tabby, Tabby Cat',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- breedMatcher`
Expected: FAIL — `Failed to resolve import "./breedMatcher.js"` (file doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

```js
// src/features/posts/photoAnalysis/breedMatcher.js
function capitalizeWords(label) {
  return label
    .split(' ')
    .map((word) => (word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

export function matchBreedLabel(predictionLabel, breedOptions) {
  const normalizedLabel = predictionLabel.toLowerCase()

  const matchedOption = breedOptions.find((option) => {
    const optionWords = option.toLowerCase().split(/\s+/)
    return optionWords.every((word) => normalizedLabel.includes(word))
  })

  if (matchedOption) {
    return { breed: matchedOption, breedOther: '' }
  }

  return { breed: 'other', breedOther: capitalizeWords(predictionLabel) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- breedMatcher`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/posts/photoAnalysis/breedMatcher.js src/features/posts/photoAnalysis/breedMatcher.test.js
git commit -m "feat: add breed keyword matcher for photo auto-fill"
```

---

### Task 3: Color matcher

**Files:**
- Create: `src/features/posts/photoAnalysis/colorMatcher.js`
- Test: `src/features/posts/photoAnalysis/colorMatcher.test.js`

**Interfaces:**
- Produces: `computeDominantColorBucket(pixelData: number[] | Uint8ClampedArray) => { rgb: [number, number, number], ratio: number }`
- Produces: `matchColorToOption(rgb: [number, number, number], ratio: number) => string` (one of `COLOR_OPTIONS` from `CreatePostForm.jsx`, or `'Multi-color'`)

Note: `matchColorToOption` deliberately does not cover `'Black and white'` — that's a two-color pattern, not representable as a single dominant RGB bucket. A roughly half-black-half-white photo will naturally fall under the 40% dominance threshold and resolve to `'Multi-color'` instead, which is an acceptable approximation per the spec (color is always user-correctable).

- [ ] **Step 1: Write the failing test**

```js
// src/features/posts/photoAnalysis/colorMatcher.test.js
import { describe, expect, test } from 'vitest'
import { computeDominantColorBucket, matchColorToOption } from './colorMatcher.js'

function buildSolidColorPixelData(r, g, b, pixelCount) {
  const data = []
  for (let i = 0; i < pixelCount; i += 1) {
    data.push(r, g, b, 255)
  }
  return data
}

describe('computeDominantColorBucket', () => {
  test('returns the solid color and a ratio of 1 for a uniform image', () => {
    const pixelData = buildSolidColorPixelData(10, 10, 10, 20)
    const result = computeDominantColorBucket(pixelData)
    expect(result.rgb).toEqual([0, 0, 0])
    expect(result.ratio).toBe(1)
  })

  test('returns the majority bucket and a ratio below 1 for a mixed image', () => {
    const majority = buildSolidColorPixelData(250, 245, 200, 8) // buckets near white/cream
    const minority = buildSolidColorPixelData(0, 0, 0, 2) // buckets near black
    const pixelData = [...majority, ...minority]
    const result = computeDominantColorBucket(pixelData)
    expect(result.ratio).toBe(0.8)
  })
})

describe('matchColorToOption', () => {
  test('matches a near-black dominant color to Black', () => {
    expect(matchColorToOption([5, 5, 5], 0.9)).toBe('Black')
  })

  test('matches a near-white dominant color to White', () => {
    expect(matchColorToOption([250, 250, 250], 0.9)).toBe('White')
  })

  test('matches a golden-brown dominant color to Golden', () => {
    expect(matchColorToOption([218, 165, 32], 0.9)).toBe('Golden')
  })

  test('returns Multi-color when no single bucket dominates', () => {
    expect(matchColorToOption([120, 90, 60], 0.25)).toBe('Multi-color')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- colorMatcher`
Expected: FAIL — `Failed to resolve import "./colorMatcher.js"` (file doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

```js
// src/features/posts/photoAnalysis/colorMatcher.js
const BUCKET_SIZE = 32
const MULTI_COLOR_RATIO_THRESHOLD = 0.4

// Representative RGB for each single-color CreatePostForm.jsx COLOR_OPTIONS entry.
// 'Black and white' and 'Multi-color' are intentionally excluded — see file header note.
const COLOR_RGB_MAP = {
  Black: [0, 0, 0],
  White: [255, 255, 255],
  Brown: [101, 67, 33],
  Gray: [128, 128, 128],
  'Orange/Ginger': [255, 140, 0],
  Cream: [255, 253, 208],
  Golden: [218, 165, 32],
}

export function computeDominantColorBucket(pixelData) {
  const bucketCounts = new Map()
  let totalPixels = 0

  for (let i = 0; i < pixelData.length; i += 4) {
    const r = Math.round(pixelData[i] / BUCKET_SIZE) * BUCKET_SIZE
    const g = Math.round(pixelData[i + 1] / BUCKET_SIZE) * BUCKET_SIZE
    const b = Math.round(pixelData[i + 2] / BUCKET_SIZE) * BUCKET_SIZE
    const key = `${r},${g},${b}`
    bucketCounts.set(key, (bucketCounts.get(key) || 0) + 1)
    totalPixels += 1
  }

  let bestKey = null
  let bestCount = 0
  for (const [key, count] of bucketCounts) {
    if (count > bestCount) {
      bestKey = key
      bestCount = count
    }
  }

  const [r, g, b] = bestKey.split(',').map(Number)
  return { rgb: [r, g, b], ratio: bestCount / totalPixels }
}

function distance([r1, g1, b1], [r2, g2, b2]) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
}

export function matchColorToOption(rgb, ratio) {
  if (ratio < MULTI_COLOR_RATIO_THRESHOLD) {
    return 'Multi-color'
  }

  let bestOption = null
  let bestDistance = Infinity
  for (const [option, optionRgb] of Object.entries(COLOR_RGB_MAP)) {
    const d = distance(rgb, optionRgb)
    if (d < bestDistance) {
      bestDistance = d
      bestOption = option
    }
  }

  return bestOption
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- colorMatcher`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/posts/photoAnalysis/colorMatcher.js src/features/posts/photoAnalysis/colorMatcher.test.js
git commit -m "feat: add dominant-color matcher for photo auto-fill"
```

---

### Task 4: Image canvas helpers and analyzePhoto orchestration

**Files:**
- Create: `src/features/posts/photoAnalysis/imageCanvas.js`
- Create: `src/features/posts/photoAnalysis/analyzePhoto.js`
- Test: `src/features/posts/photoAnalysis/analyzePhoto.test.js`
- Modify: `package.json` (add TF.js dependencies)

**Interfaces:**
- Consumes: `matchSpeciesClass` from Task 1, `matchBreedLabel` from Task 2, `computeDominantColorBucket`/`matchColorToOption` from Task 3
- Produces (from `imageCanvas.js`): `loadImageElement(file: File) => Promise<HTMLImageElement>`, `cropToImageData(imageElement: HTMLImageElement, bbox: [number, number, number, number]) => ImageData`
- Produces (from `analyzePhoto.js`): `analyzePhoto(file: File, breedOptionsBySpecies: Record<string, string[]>) => Promise<{ species: string|null, breed: string|null, breedOther: string|null, color: string|null, undetected: string[] }>`

`imageCanvas.js` is DOM-dependent (real `Image`/`canvas` decoding) and is not unit-tested directly — it's mocked wherever it's used, the same way this repo already stubs `LocationPicker`'s real Leaflet interaction instead of testing it (see `CLAUDE.md` gotchas).

- [ ] **Step 1: Install the TensorFlow.js dependencies**

Run: `npm install @tensorflow/tfjs @tensorflow-models/coco-ssd @tensorflow-models/mobilenet`
Expected: `package.json` `dependencies` gains the three new packages; `package-lock.json` updates.

- [ ] **Step 2: Write `imageCanvas.js` (no test — DOM-dependent, mocked by consumers)**

```js
// src/features/posts/photoAnalysis/imageCanvas.js
export async function loadImageElement(file) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = objectUrl
    })
    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function cropToImageData(imageElement, bbox) {
  const [x, y, width, height] = bbox
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.drawImage(imageElement, x, y, width, height, 0, 0, width, height)
  return context.getImageData(0, 0, width, height)
}
```

- [ ] **Step 3: Write the failing test for `analyzePhoto.js`**

```js
// src/features/posts/photoAnalysis/analyzePhoto.test.js
import { beforeEach, describe, expect, test, vi } from 'vitest'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import * as mobilenet from '@tensorflow-models/mobilenet'
import { cropToImageData, loadImageElement } from './imageCanvas.js'
import { analyzePhoto } from './analyzePhoto.js'

vi.mock('@tensorflow-models/coco-ssd', () => ({ load: vi.fn() }))
vi.mock('@tensorflow-models/mobilenet', () => ({ load: vi.fn() }))
vi.mock('./imageCanvas.js', () => ({
  loadImageElement: vi.fn(() => Promise.resolve({})),
  cropToImageData: vi.fn(),
}))

const DOG_BREEDS = ['Golden Retriever', 'Labrador Retriever']
const BREED_OPTIONS_BY_SPECIES = { dog: DOG_BREEDS, cat: [], bird: [] }

function buildSolidBlackImageData(pixelCount) {
  const data = []
  for (let i = 0; i < pixelCount; i += 1) data.push(0, 0, 0, 255)
  return { data, width: pixelCount, height: 1 }
}

const fakeFile = new File(['fake-image-content'], 'dog.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('analyzePhoto', () => {
  test('fills species, breed, and color for a confidently detected dog', async () => {
    cocoSsd.load.mockResolvedValue({
      detect: vi.fn().mockResolvedValue([{ bbox: [0, 0, 10, 10], class: 'dog', score: 0.95 }]),
    })
    mobilenet.load.mockResolvedValue({
      classify: vi.fn().mockResolvedValue([{ className: 'golden retriever', probability: 0.7 }]),
    })
    cropToImageData.mockReturnValue(buildSolidBlackImageData(20))

    const result = await analyzePhoto(fakeFile, BREED_OPTIONS_BY_SPECIES)

    expect(result).toEqual({
      species: 'dog',
      breed: 'Golden Retriever',
      breedOther: '',
      color: 'Black',
      undetected: [],
    })
  })

  test('leaves breed undetected for bird species, which has no breed support', async () => {
    cocoSsd.load.mockResolvedValue({
      detect: vi.fn().mockResolvedValue([{ bbox: [0, 0, 10, 10], class: 'bird', score: 0.9 }]),
    })
    mobilenet.load.mockResolvedValue({ classify: vi.fn() })
    cropToImageData.mockReturnValue(buildSolidBlackImageData(20))

    const result = await analyzePhoto(fakeFile, BREED_OPTIONS_BY_SPECIES)

    expect(result.species).toBe('bird')
    expect(result.breed).toBeNull()
    expect(result.undetected).toEqual(['breed'])
    expect(mobilenet.load).not.toHaveBeenCalled()
  })

  test('leaves everything undetected when nothing is found above the species threshold', async () => {
    cocoSsd.load.mockResolvedValue({
      detect: vi.fn().mockResolvedValue([{ bbox: [0, 0, 10, 10], class: 'dog', score: 0.4 }]),
    })
    mobilenet.load.mockResolvedValue({ classify: vi.fn() })

    const result = await analyzePhoto(fakeFile, BREED_OPTIONS_BY_SPECIES)

    expect(result).toEqual({
      species: null,
      breed: null,
      breedOther: null,
      color: null,
      undetected: ['species', 'breed', 'color'],
    })
    expect(cropToImageData).not.toHaveBeenCalled()
    expect(mobilenet.load).not.toHaveBeenCalled()
  })

  test('leaves breed undetected when the breed classification confidence is below threshold', async () => {
    cocoSsd.load.mockResolvedValue({
      detect: vi.fn().mockResolvedValue([{ bbox: [0, 0, 10, 10], class: 'dog', score: 0.95 }]),
    })
    mobilenet.load.mockResolvedValue({
      classify: vi.fn().mockResolvedValue([{ className: 'golden retriever', probability: 0.2 }]),
    })
    cropToImageData.mockReturnValue(buildSolidBlackImageData(20))

    const result = await analyzePhoto(fakeFile, BREED_OPTIONS_BY_SPECIES)

    expect(result.species).toBe('dog')
    expect(result.color).toBe('Black')
    expect(result.breed).toBeNull()
    expect(result.undetected).toEqual(['breed'])
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- analyzePhoto`
Expected: FAIL — `Failed to resolve import "./analyzePhoto.js"` (file doesn't exist yet)

- [ ] **Step 5: Write minimal implementation**

```js
// src/features/posts/photoAnalysis/analyzePhoto.js
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import * as mobilenet from '@tensorflow-models/mobilenet'
import { loadImageElement, cropToImageData } from './imageCanvas.js'
import { matchSpeciesClass } from './speciesMatcher.js'
import { matchBreedLabel } from './breedMatcher.js'
import { computeDominantColorBucket, matchColorToOption } from './colorMatcher.js'

const SPECIES_CONFIDENCE_THRESHOLD = 0.6
const BREED_CONFIDENCE_THRESHOLD = 0.4
const SPECIES_WITH_BREED_SUPPORT = new Set(['cat', 'dog'])

let cocoModelPromise = null
let mobilenetModelPromise = null

function getCocoModel() {
  if (!cocoModelPromise) {
    cocoModelPromise = cocoSsd.load()
  }
  return cocoModelPromise
}

function getMobilenetModel() {
  if (!mobilenetModelPromise) {
    mobilenetModelPromise = mobilenet.load()
  }
  return mobilenetModelPromise
}

export async function analyzePhoto(file, breedOptionsBySpecies) {
  const result = { species: null, breed: null, breedOther: null, color: null, undetected: [] }

  const [cocoModel, imageElement] = await Promise.all([getCocoModel(), loadImageElement(file)])
  const predictions = await cocoModel.detect(imageElement)

  const speciesPrediction = predictions
    .filter((prediction) => matchSpeciesClass(prediction.class) !== null)
    .filter((prediction) => prediction.score >= SPECIES_CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.score - a.score)[0]

  if (!speciesPrediction) {
    result.undetected.push('species', 'breed', 'color')
    return result
  }

  result.species = matchSpeciesClass(speciesPrediction.class)

  const croppedImageData = cropToImageData(imageElement, speciesPrediction.bbox)
  const colorBucket = computeDominantColorBucket(croppedImageData.data)
  result.color = matchColorToOption(colorBucket.rgb, colorBucket.ratio)

  if (!SPECIES_WITH_BREED_SUPPORT.has(result.species)) {
    result.undetected.push('breed')
    return result
  }

  const mobilenetModel = await getMobilenetModel()
  const croppedCanvas = document.createElement('canvas')
  croppedCanvas.width = croppedImageData.width
  croppedCanvas.height = croppedImageData.height
  croppedCanvas.getContext('2d').putImageData(croppedImageData, 0, 0)

  const breedPredictions = await mobilenetModel.classify(croppedCanvas)
  const topBreedPrediction = breedPredictions[0]

  if (topBreedPrediction && topBreedPrediction.probability >= BREED_CONFIDENCE_THRESHOLD) {
    const breedOptions = breedOptionsBySpecies[result.species]
    const { breed, breedOther } = matchBreedLabel(topBreedPrediction.className, breedOptions)
    result.breed = breed
    result.breedOther = breedOther
  } else {
    result.undetected.push('breed')
  }

  return result
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- analyzePhoto`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/features/posts/photoAnalysis/imageCanvas.js src/features/posts/photoAnalysis/analyzePhoto.js src/features/posts/photoAnalysis/analyzePhoto.test.js
git commit -m "feat: add TensorFlow.js photo analysis orchestration"
```

---

### Task 5: CreatePostForm integration

**Files:**
- Modify: `src/features/posts/CreatePostForm.jsx`
- Modify: `src/features/posts/CreatePostForm.test.jsx`
- Modify: `src/features/layout/theme.css`

**Interfaces:**
- Consumes: `analyzePhoto(file, breedOptionsBySpecies)` from Task 4, returning `{ species, breed, breedOther, color, undetected }`

- [ ] **Step 1: Write the failing tests**

Add to `src/features/posts/CreatePostForm.test.jsx`, alongside the existing `vi.mock` calls at the top of the file:

```js
vi.mock('./photoAnalysis/analyzePhoto.js', () => ({ analyzePhoto: vi.fn() }))
```

Add the import at the top of the file:

```js
import { analyzePhoto } from './photoAnalysis/analyzePhoto.js'
```

Add these tests at the end of the file:

```js
async function uploadOnePhoto() {
  const createObjectURL = vi.fn(() => 'blob:preview-url')
  vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() })
  const file = new File(['fake-image-content'], 'dog.jpg', { type: 'image/jpeg' })
  await userEvent.upload(screen.getByLabelText(/choose photos/i), file)
}

test('Analyze Photo button only appears once a photo is selected', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  expect(screen.queryByRole('button', { name: 'Analyze Photo' })).not.toBeInTheDocument()

  await uploadOnePhoto()

  expect(screen.getByRole('button', { name: 'Analyze Photo' })).toBeInTheDocument()
})

test('analyzing a photo fills species, breed, and color and marks them as auto-filled', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  analyzePhoto.mockResolvedValue({
    species: 'dog',
    breed: 'Golden Retriever',
    breedOther: '',
    color: 'Golden',
    undetected: [],
  })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await uploadOnePhoto()
  await userEvent.click(screen.getByRole('button', { name: 'Analyze Photo' }))

  await waitFor(() => expect(screen.getByLabelText('Species')).toHaveValue('dog'))
  expect(screen.getByLabelText('Breed')).toHaveValue('Golden Retriever')
  expect(screen.getByLabelText('Color')).toHaveValue('Golden')
  expect(screen.getAllByText('✨ auto-filled')).toHaveLength(3)
})

test('shows a note and leaves fields blank for anything the model could not confidently detect', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  analyzePhoto.mockResolvedValue({
    species: null,
    breed: null,
    breedOther: null,
    color: null,
    undetected: ['species', 'breed', 'color'],
  })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await uploadOnePhoto()
  await userEvent.click(screen.getByRole('button', { name: 'Analyze Photo' }))

  expect(
    await screen.findByText("Couldn't confidently detect species, breed, color — please fill them in manually.")
  ).toBeInTheDocument()
  expect(screen.getByLabelText('Species')).toHaveValue('')
})

test('editing an auto-filled field clears its auto-filled marker', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  analyzePhoto.mockResolvedValue({
    species: 'dog',
    breed: 'Golden Retriever',
    breedOther: '',
    color: 'Golden',
    undetected: [],
  })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await uploadOnePhoto()
  await userEvent.click(screen.getByRole('button', { name: 'Analyze Photo' }))
  await waitFor(() => expect(screen.getAllByText('✨ auto-filled')).toHaveLength(3))

  await userEvent.selectOptions(screen.getByLabelText('Color'), 'Black')

  expect(screen.getAllByText('✨ auto-filled')).toHaveLength(2)
})

test('shows a retryable inline error when analysis fails', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  analyzePhoto.mockRejectedValue(new Error('model load failed'))

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await uploadOnePhoto()
  await userEvent.click(screen.getByRole('button', { name: 'Analyze Photo' }))

  expect(
    await screen.findByText('Photo analysis failed. You can still fill in the fields manually.')
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Analyze Photo' })).toBeEnabled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- CreatePostForm`
Expected: FAIL — no "Analyze Photo" button exists yet (`Unable to find role="button" with name "Analyze Photo"`), plus the `analyzePhoto.js` import resolves to the not-yet-existing mock target correctly (mock itself won't fail — the missing UI will).

- [ ] **Step 3: Add the import and state to `CreatePostForm.jsx`**

Add to the imports at the top of the file (after the `LocationPicker` import on line 7):

```js
import { analyzePhoto } from './photoAnalysis/analyzePhoto.js'
```

Add state after the existing `const [error, setError] = useState(null)` (line 109):

```js
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)
  const [undetectedFields, setUndetectedFields] = useState([])
  const [autoFilledFields, setAutoFilledFields] = useState(new Set())
```

- [ ] **Step 4: Add the handler functions**

Add after the existing `updateSpecies` function (after line 123):

```js
  function clearAutoFilled(fields) {
    setAutoFilledFields((prev) => {
      const next = new Set(prev)
      fields.forEach((field) => next.delete(field))
      return next
    })
  }

  async function handleAnalyzePhoto() {
    setAnalyzing(true)
    setAnalysisError(null)
    setUndetectedFields([])
    try {
      const result = await analyzePhoto(files[0], BREEDS_BY_SPECIES)
      const filled = new Set()
      if (result.species) {
        updateSpecies(result.species)
        filled.add('species')
      }
      if (result.breed) {
        setForm((prev) => ({ ...prev, breed: result.breed, breedOther: result.breedOther || '' }))
        filled.add('breed')
      }
      if (result.color) {
        update('color', result.color)
        filled.add('color')
      }
      // Merge, don't replace: a field that came back low-confidence this run
      // keeps whatever value (and auto-filled badge) it already had, per spec.
      setAutoFilledFields((prev) => new Set([...prev, ...filled]))
      setUndetectedFields(result.undetected)
    } catch {
      setAnalysisError('Photo analysis failed. You can still fill in the fields manually.')
    } finally {
      setAnalyzing(false)
    }
  }

  const FIELD_LABELS = { species: 'species', breed: 'breed', color: 'color' }

  function formatUndetectedFields(fields) {
    return fields.map((field) => FIELD_LABELS[field]).join(', ')
  }
```

- [ ] **Step 5: Add the auto-filled badge to the Species, Breed, and Color labels**

Replace the Species label (lines 192-194):

```jsx
            <label className="field-label" htmlFor="species">
              Species
              {autoFilledFields.has('species') && (
                <span className="auto-filled-badge">✨ auto-filled</span>
              )}
            </label>
```

Replace the Species `onChange` (line 199):

```jsx
              onChange={(e) => {
                updateSpecies(e.target.value)
                clearAutoFilled(['species', 'breed'])
              }}
```

Replace the Breed label (lines 214-216):

```jsx
            <label className="field-label" htmlFor="breed">
              Breed
              {autoFilledFields.has('breed') && (
                <span className="auto-filled-badge">✨ auto-filled</span>
              )}
            </label>
```

Replace both Breed `onChange` handlers (line 222 in the `<select>` branch, line 237 in the `<input>` branch) — both become:

```jsx
                onChange={(e) => {
                  update('breed', e.target.value)
                  clearAutoFilled(['breed'])
                }}
```

Replace the "Breed (please specify)" input's `onChange` (line 251):

```jsx
                onChange={(e) => {
                  update('breedOther', e.target.value)
                  clearAutoFilled(['breed'])
                }}
```

Replace the Color label (lines 257-259):

```jsx
            <label className="field-label" htmlFor="color">
              Color
              {autoFilledFields.has('color') && (
                <span className="auto-filled-badge">✨ auto-filled</span>
              )}
            </label>
```

Replace the Color `onChange` (line 264):

```jsx
              onChange={(e) => {
                update('color', e.target.value)
                clearAutoFilled(['color'])
              }}
```

Replace the "Color (please specify)" input's `onChange` (line 285):

```jsx
                onChange={(e) => {
                  update('colorOther', e.target.value)
                  clearAutoFilled(['color'])
                }}
```

- [ ] **Step 6: Add the Analyze Photo button, loading state, error, and note to the Photos section**

Replace the Photos section's closing (lines 429-435, the `{previewUrls.length > 0 && (...)}` block) with:

```jsx
        {previewUrls.length > 0 && (
          <div className="photo-preview-grid">
            {previewUrls.map((url, index) => (
              <img key={url} className="photo-preview-thumb" src={url} alt={`Selected photo ${index + 1}`} />
            ))}
          </div>
        )}
        {files.length > 0 && (
          <div className="photo-analyze">
            <button
              type="button"
              className="photo-analyze-button"
              onClick={handleAnalyzePhoto}
              disabled={analyzing}
            >
              {analyzing ? 'Analyzing photo…' : 'Analyze Photo'}
            </button>
            {analysisError && (
              <p className="photo-analyze-error" role="alert">
                {analysisError}
              </p>
            )}
            {undetectedFields.length > 0 && (
              <p className="photo-analyze-note">
                Couldn&apos;t confidently detect {formatUndetectedFields(undetectedFields)} — please fill{' '}
                {undetectedFields.length > 1 ? 'them' : 'it'} in manually.
              </p>
            )}
          </div>
        )}
```

- [ ] **Step 7: Add the CSS**

Add to `src/features/layout/theme.css`, after the existing `.photo-preview-thumb` rule:

```css
.photo-analyze {
  margin-top: var(--space-sm);
}

.photo-analyze-button {
  font-family: var(--font-family-body);
  font-weight: 700;
  color: var(--color-accent);
  background: var(--color-accent-tint);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-button);
  padding: var(--space-xs) var(--space-md);
  cursor: pointer;
}

.photo-analyze-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.photo-analyze-error {
  color: #b91c1c;
  font-weight: 600;
  margin-top: var(--space-xs);
}

.photo-analyze-note {
  color: var(--color-muted);
  margin-top: var(--space-xs);
}

.auto-filled-badge {
  margin-left: var(--space-xs);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-accent);
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- CreatePostForm`
Expected: PASS (all tests, including the 5 new ones)

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: PASS (all test files, no regressions)

- [ ] **Step 10: Commit**

```bash
git add src/features/posts/CreatePostForm.jsx src/features/posts/CreatePostForm.test.jsx src/features/layout/theme.css
git commit -m "feat: wire Analyze Photo button into CreatePostForm"
```

---

### Task 6: Update the feature doc status

**Files:**
- Modify: `docs/features/photo-autofill.md`

- [ ] **Step 1: Flip the status line**

Change:

```markdown
**Status:** planned (not yet implemented).
**Last updated:** 2026-07-13
```

to:

```markdown
**Status:** implemented.
**Last updated:** 2026-07-13
```

- [ ] **Step 2: Commit**

```bash
git add docs/features/photo-autofill.md
git commit -m "docs: mark photo auto-fill as implemented"
```
