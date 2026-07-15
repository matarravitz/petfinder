# Feature: Photo auto-fill on post creation

**Status:** implemented.
**Last updated:** 2026-07-15

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

**Known limitation:** ImageNet's ~1000 classes don't cover every real breed (e.g. no "Scottish Fold" class at all). On an unrecognized breed, MobileNet doesn't say "unsure" — it returns whichever known class looks closest, sometimes with real confidence (observed: a Scottish Fold photo classified as "Persian"). The breed threshold was raised from 0.4 to 0.6 (matching species) specifically to cut down on these plausible-but-wrong guesses, trading away some correct guesses — mainly dogs, where MobileNet's coverage is better — for fewer confidently-wrong ones. `BREEDS_BY_SPECIES.cat` was also expanded (Scottish Fold, Abyssinian, Russian Blue, American Shorthair, Norwegian Forest Cat) so at least manual selection covers more real breeds, even though auto-detection still can't produce them.

**Investigated and rejected (2026-07-15): swapping MobileNet/ImageNet for a cat-breed-specific model.** Researched whether a better client-side (TF.js, no backend/LLM) breed model exists. Findings: no maintained, pre-converted TF.js cat-breed model exists anywhere — every public "TF.js cat breed classifier" repo is an unmaintained student project that either wraps stock MobileNet unchanged or covers dogs only (Stanford Dogs). The standard academic dataset (Oxford-IIIT Pet, 12 cat breeds) still excludes Scottish Fold. The only dataset/model found with real Scottish Fold coverage (a 60-class HuggingFace model, ~89% claimed accuracy) is a 343MB PyTorch Vision Transformer — ~8x the current ~40MB model budget, a brittle ViT→TF.js conversion path (attention/LayerNorm ops are conversion-risk-prone), and unclear licensing on its underlying scraped training data. Training a custom small CNN on scraped Kaggle cat-breed data is technically feasible (clean Keras→TF.js path) but real effort — data licensing diligence, training, eval — for an accuracy ceiling that tops out around 66-70% on this fine-grained problem even in the research repos. Given a 2-second manual dropdown already covers the same breeds, this wasn't judged worth pursuing. Not re-litigating this without a genuinely new option (e.g. a maintained TF.js cat-breed package appearing) — check this note before re-researching the same ground.

## Color detection

Each `COLOR_OPTIONS` entry (`Black`, `White`, `Brown`, `Gray`, `Orange/Ginger`, `Cream`, `Golden`, `Black and white`, `Multi-color`) gets a representative RGB value. The dominant color of the cropped `ImageData` is computed and matched to the nearest option by RGB distance. If the crop's pixels are highly varied — no single color dominates — it maps to `Multi-color` rather than forcing a bad single-color guess. This mapping logic is also a pure, unit-testable function alongside the breed matcher.

## Low-confidence handling

Applies independently per field (species, breed, color): below the confidence threshold for that model's prediction (or no relevant class detected at all), the field is left **blank**, and a small note appears near the "Analyze Photo" button (e.g. "Couldn't confidently detect breed — please fill it in"). Never guesses just to fill a field. This is consistent across all three fields and across the "nothing detected at all" case (COCO-SSD finds no cat/dog/bird above threshold) — same UX, just all three fields blank at once.

Default thresholds (tunable during implementation, not exposed to the user):

- **Species** (COCO-SSD `cat`/`dog`/`bird` score): **0.6**
- **Breed** (MobileNet top-1 class probability): **0.6**, same as species (raised from an original 0.4 — see Breed detection below for why)
- **Color "highly varied"** (no single dominant color): the crop's dominant color bucket accounts for less than **40%** of sampled pixels → maps to `Multi-color` instead of the nearest single-color option

## UX & component changes

- **Photos section comes first:** `CreatePostForm.jsx` renders "Photos" before "About the pet" (not after) — so a user reading top-to-bottom uploads a photo before manually typing species/breed/color, instead of doing that work and then finding the auto-fill option below it. (Originally shipped with Photos last; reordered after user feedback that this created a natural "fill it in, then find out you didn't have to" trap.)
- **Pre-upload hint:** before any photo is selected, the Photos section shows a one-line hint — "Add a photo first — we can suggest species, breed, and color for you to review below." — so the feature is discoverable before the user starts typing, not just via a button they might not notice once fields are already open below.
- **Trigger:** an "Analyze Photo" button appears once at least one photo is selected — not automatic on file select. The hint disappears once a photo is chosen.
- **Which photo:** always the first photo in the `files` array (the cover photo).
- **Loading state:** button shows "Analyzing photo…" while models load (first click only) and while inference runs.
- **Confirm before overwriting manual entries:** if the user already typed a value into species, breed, or color themselves (not a value left over from a prior auto-fill) and this analysis run would confidently overwrite it, a native `window.confirm()` asks first — e.g. "This will replace the breed you already entered. Continue?" (matches this app's existing native-confirm pattern for other overwrite/destructive actions, e.g. `ConversationRow`'s delete). Declining leaves that run's result entirely un-applied; nothing is partially applied. A field's value only counts as "already entered" if it's non-empty and **not** currently marked auto-filled — so normal re-analyze runs (where the existing value came from a prior auto-fill) never trigger this prompt.
- **Auto-filled indicator:** fields that got a value from analysis show a small visual marker (e.g. a subtle "✨ auto-filled" tag) next to the label, distinguishing them from manually-typed values. The marker disappears the moment the user edits that field — it's now a manual value.
- **Re-running:** clicking "Analyze Photo" again (e.g. after changing the photo) re-runs the whole pipeline and overwrites any field that gets a confident result this time (subject to the confirm step above if that field was manually edited since the last auto-fill). Fields that come back low-confidence this run are left as-is (not wiped) — so a second run never blanks something already filled in.
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
