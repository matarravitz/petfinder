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
// When neither post has a photo_embedding (true for every post created outside
// the live CreatePostForm flow, e.g. all seeded demo data), breed/color/size
// are the only identifying signal available at all — weighted higher than
// location/date here specifically because two unrelated pets posted nearby in
// time and space should NOT outscore two pets that actually match on the
// details a person would actually check.
const FIELDS_WEIGHT_NO_VISUAL = 0.5
const LOCATION_WEIGHT_NO_VISUAL_WITH_FIELDS = 0.3
const DATE_WEIGHT_NO_VISUAL_WITH_FIELDS = 0.2
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

// Compares breed/color/size, averaging only the fields BOTH posts actually
// have set (e.g. a "found" post with no known breed doesn't count as a
// mismatch) — returns null (not 0) when there's nothing comparable at all,
// so the caller can fall back rather than treating "unknown" as "different".
function fieldsScore(postA, postB) {
  const comparisons = []
  for (const field of ['breed', 'color', 'size']) {
    if (postA[field] && postB[field]) {
      comparisons.push(postA[field].toLowerCase() === postB[field].toLowerCase() ? 1 : 0)
    }
  }
  if (comparisons.length === 0) return null
  return comparisons.reduce((sum, value) => sum + value, 0) / comparisons.length
}

function scorePair(post, candidate) {
  const location = locationScore(post, candidate)
  const date = dateScore(post, candidate)

  if (post.photo_embedding && candidate.photo_embedding) {
    const visual = cosineSimilarity(post.photo_embedding, candidate.photo_embedding)
    return visual * VISUAL_WEIGHT + location * LOCATION_WEIGHT + date * DATE_WEIGHT
  }

  const fields = fieldsScore(post, candidate)
  if (fields != null) {
    return (
      fields * FIELDS_WEIGHT_NO_VISUAL +
      location * LOCATION_WEIGHT_NO_VISUAL_WITH_FIELDS +
      date * DATE_WEIGHT_NO_VISUAL_WITH_FIELDS
    )
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
