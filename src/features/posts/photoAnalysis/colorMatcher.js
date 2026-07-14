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
