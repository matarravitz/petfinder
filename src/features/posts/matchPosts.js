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
