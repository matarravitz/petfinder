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

  test('drops the visual term and renormalizes when only one post has an embedding', () => {
    // basePost keeps its real embedding; the candidate has none.
    const candidateNoEmbedding = buildCandidate({ photo_embedding: null })
    const resultCandidateSide = findMatches(basePost, [candidateNoEmbedding])
    expect(resultCandidateSide).toHaveLength(1)
    // same location + date, one-sided visual signal -> still renormalized to 1,
    // not a 0-visual-score full-signal path (which would score lower).
    expect(resultCandidateSide[0].score).toBeCloseTo(1, 5)

    // and the reverse: post has none, candidate keeps its real embedding.
    const postNoEmbedding = { ...basePost, photo_embedding: null }
    const resultPostSide = findMatches(postNoEmbedding, [buildCandidate()])
    expect(resultPostSide).toHaveLength(1)
    expect(resultPostSide[0].score).toBeCloseTo(1, 5)
  })

  test('includes a candidate whose score lands exactly at the match threshold', () => {
    // Use the renormalized (no-embedding) path: score = location*0.6 + date*0.4.
    // Keep the date identical (dateScore = 1, contributing 1 * 0.4 = 0.4).
    // Solve for the location term: location * 0.6 = 0.1 => location = 1/6.
    // location = 1 - distanceKm/50 => distanceKm = 50 * (5/6) = 250/6 km.
    // Nudge the distance a hair under the exact solution: floating-point
    // rounding through the trig chain otherwise lands the score a hair
    // *below* 0.5 (e.g. 0.4999999999999961) and gets wrongly excluded by an
    // unrelated fp-precision issue rather than by the >= boundary itself.
    const targetDistanceKm = 250 / 6 - 1e-7
    const earthRadiusKm = 6371
    // Offsetting only latitude (same longitude) keeps haversine's central
    // angle equal to the radian delta directly: distance = earthRadiusKm * dLatRad.
    const dLatDeg = (targetDistanceKm / earthRadiusKm) * (180 / Math.PI)

    const post = { ...basePost, photo_embedding: null }
    const candidate = buildCandidate({
      photo_embedding: null,
      location_lat: basePost.location_lat + dLatDeg,
    })

    const result = findMatches(post, [candidate])
    expect(result).toHaveLength(1)
    expect(result[0].score).toBeCloseTo(0.5, 5)
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
