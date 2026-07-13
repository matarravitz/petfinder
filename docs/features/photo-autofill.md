# Feature: Photo auto-fill on post creation

**Status:** planned (not yet implemented).
**Last updated:** 2026-07-13

## Goal

When someone uploads a photo while creating a missing/found post, let them click "Analyze Photo" to auto-fill the species, breed, and color fields — saving typing and giving a starting guess they can correct. Runs entirely client-side.

## Non-goals (this pass)

- No cross-post photo matching or notifications (a separate, larger feature — needs a notification system that doesn't exist yet; tracked as a future track, not this one).
- No backend/server-side inference — no Supabase Edge Function, no LLM vision API call. This was an explicit choice: the feature must use client-side ML (TensorFlow.js + pre-trained models), not an AI/LLM vision API.
- No auto-fill for `size` — no available model gives a reliable size signal from a single 2D photo (no reference scale), so `size` stays manual, same as today.
- No species auto-fill for `rabbit` or `other` — the object-detection model's classes don't include them (see Species detection below).
- No breed auto-fill for `bird` — the classification model's bird classes don't map cleanly onto the app's parrot/budgie/cockatiel breed list (see Breed detection below).
- No per-photo picker when multiple photos are uploaded — analysis always runs on the first (cover) photo.

## Architecture

Client-side only, two pre-trained TensorFlow.js models chained together, plus a plain-JS color heuristic:

1. **`@tensorflow-models/coco-ssd`** (object detection, COCO's 80 classes) runs on the full photo. Its `cat`/`dog`/`bird` predictions are the only ones relevant here; take the highest-confidence match among those three, with its bounding box.
2. The photo is drawn to an offscreen `<canvas>` and **cropped to that bounding box**.
3. **`@tensorflow-models/mobilenet`** (image classification, ImageNet's 1000 classes) runs on the **cropped** image to guess breed — cropping first keeps it from being distracted by background content and keeps the color read (next step) from being skewed by anything outside the animal.
4. A plain pixel-based **dominant-color heuristic** (no model) runs on the same cropped `ImageData`.

Models are loaded lazily — only on the first "Analyze Photo" click, not on page load — since this is an opt-in feature and shouldn't slow down the form for users who don't use it. Once loaded, the browser's normal HTTP cache keeps the weight files (~40MB combined) from being re-downloaded on subsequent visits.

New dependencies: `@tensorflow/tfjs`, `@tensorflow-models/coco-ssd`, `@tensorflow-models/mobilenet`.

## Species detection

COCO-SSD's relevant classes are `cat`, `dog`, `bird` — those are the only species this feature can auto-fill; `rabbit` and `other` have no matching class and always stay manual (same "low confidence" UX as any other undetected field, see below).

## Breed detection (cat/dog only)

Runs only when species resolved to `cat` or `dog` — MobileNet's ImageNet classes have solid dog-breed and workable cat-breed coverage, but its bird classes don't correspond to the app's `BREEDS_BY_SPECIES.bird` list (budgie, cockatiel, lovebird, etc.), so bird breed is always left manual.

MobileNet's raw label (e.g. `"golden retriever"`) is matched against `BREEDS_BY_SPECIES[species]` (`src/features/posts/CreatePostForm.jsx`) by a plain keyword match — not another model call. On a confident match, set `breed` to the matched option. On no match, set `breed: "other"` and `breedOther` to the raw label (capitalized), so nothing is silently dropped. This mapping logic lives in its own pure, unit-testable module (see Testing).

## Color detection

Each `COLOR_OPTIONS` entry (`Black`, `White`, `Brown`, `Gray`, `Orange/Ginger`, `Cream`, `Golden`, `Black and white`, `Multi-color`) gets a representative RGB value. The dominant color of the cropped `ImageData` is computed and matched to the nearest option by RGB distance. If the crop's pixels are highly varied — no single color dominates — it maps to `Multi-color` rather than forcing a bad single-color guess. This mapping logic is also a pure, unit-testable function alongside the breed matcher.

## Low-confidence handling

Applies independently per field (species, breed, color): below the confidence threshold for that model's prediction (or no relevant class detected at all), the field is left **blank**, and a small note appears near the "Analyze Photo" button (e.g. "Couldn't confidently detect breed — please fill it in"). Never guesses just to fill a field. This is consistent across all three fields and across the "nothing detected at all" case (COCO-SSD finds no cat/dog/bird above threshold) — same UX, just all three fields blank at once.

Default thresholds (tunable during implementation, not exposed to the user):

- **Species** (COCO-SSD `cat`/`dog`/`bird` score): **0.6**
- **Breed** (MobileNet top-1 class probability): **0.4** — lower than species because fine-grained breed classification is inherently harder than coarse species detection
- **Color "highly varied"** (no single dominant color): the crop's dominant color bucket accounts for less than **40%** of sampled pixels → maps to `Multi-color` instead of the nearest single-color option

## UX & component changes

- **Trigger:** an "Analyze Photo" button appears in the Photos section of `CreatePostForm.jsx` once at least one photo is selected — not automatic on file select.
- **Which photo:** always the first photo in the `files` array (the cover photo).
- **Loading state:** button shows "Analyzing photo…" while models load (first click only) and while inference runs.
- **Auto-filled indicator:** fields that got a value from analysis show a small visual marker (e.g. a subtle "✨ auto-filled" tag) next to the label, distinguishing them from manually-typed values. The marker disappears the moment the user edits that field — it's now a manual value.
- **Re-running:** clicking "Analyze Photo" again (e.g. after changing the photo) re-runs the whole pipeline and overwrites any field that gets a confident result this time. Fields that come back low-confidence this run are left as-is (not wiped) — so a second run never blanks something already filled in.
- Selecting species via `updateSpecies()` already clears `breed`/`breedOther`/`size` (existing behavior in `CreatePostForm.jsx`) — the auto-fill flow reuses that same update path (set species first, then breed) rather than writing directly to form state, so this existing invariant isn't bypassed.

## Error handling

This is a progressive enhancement — nothing here ever blocks posting the form manually.

| Case | Behavior |
|---|---|
| Model weights fail to download (network error) | Inline error message near the button; button stays clickable to retry |
| No cat/dog/bird detected in the photo | Same "low confidence" note as any other undetected field; species/breed/color all stay blank |
| TF.js unsupported in this browser (rare) | Caught and shown as "Photo analysis isn't available in this browser"; rest of the form works normally |

## Testing

Following this repo's existing conventions (see `LocationPicker` stub pattern in `CreatePostForm.test.jsx`, and pure-function extraction like `filterPosts.js`/`buildPostPayload.js`):

- **Breed matcher** and **color matcher**: pulled into their own pure functions (plain inputs → outputs, no TF.js) and unit-tested directly with `vitest`.
- **Model loading/inference module** (`coco-ssd`/`mobilenet` orchestration): mocked in `CreatePostForm.test.jsx` the same way `LocationPicker` is already stubbed — a fake "Analyze Photo" flow that resolves with a stubbed prediction, rather than exercising real TF.js inference in jsdom (which can't do real image decoding or GPU inference anyway).
