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

  test('clamps bucketed value to 255 for pure white', () => {
    const pixelData = buildSolidColorPixelData(255, 255, 255, 10)
    const result = computeDominantColorBucket(pixelData)
    expect(result.rgb).toEqual([255, 255, 255])
    expect(result.ratio).toBe(1)
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
