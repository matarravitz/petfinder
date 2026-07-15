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
