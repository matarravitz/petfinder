import { filterAndSortPosts } from './filterPosts.js'

const posts = [
  { id: 'near', type: 'missing', species: 'cat', collar: true, reward_amount: 50, status: 'active', date_lost_or_found: '2026-07-01', location_lat: 32.08, location_lng: 34.78 },
  { id: 'far', type: 'missing', species: 'cat', collar: false, reward_amount: null, status: 'active', date_lost_or_found: '2026-06-01', location_lat: 40, location_lng: 40 },
  { id: 'resolved', type: 'missing', species: 'cat', collar: true, reward_amount: null, status: 'resolved', date_lost_or_found: '2026-07-01', location_lat: 32.08, location_lng: 34.78 },
  { id: 'dog', type: 'found', species: 'dog', collar: true, reward_amount: null, status: 'active', date_lost_or_found: '2026-07-01', location_lat: 32.08, location_lng: 34.78 },
]

test('filters by type (missing/found)', () => {
  const result = filterAndSortPosts(posts, { type: 'found' })
  expect(result.map((p) => p.id)).toEqual(['dog'])
})

test('"all" type shows both missing and found', () => {
  const result = filterAndSortPosts(posts, { type: 'all' })
  expect(result.map((p) => p.id).sort()).toEqual(['dog', 'far', 'near'])
})

test('excludes resolved posts by default', () => {
  const result = filterAndSortPosts(posts, {})
  expect(result.map((p) => p.id)).not.toContain('resolved')
})

test('filters by species', () => {
  const result = filterAndSortPosts(posts, { species: 'dog' })
  expect(result.map((p) => p.id)).toEqual(['dog'])
})

test('filters by collar presence', () => {
  const result = filterAndSortPosts(posts, { collarOnly: true })
  expect(result.map((p) => p.id).sort()).toEqual(['dog', 'near'])
})

test('filters by reward present', () => {
  const result = filterAndSortPosts(posts, { rewardOnly: true })
  expect(result.map((p) => p.id)).toEqual(['near'])
})

test('filters by radius from the user location and sorts by distance ascending', () => {
  const result = filterAndSortPosts(posts, {
    userLocation: { lat: 32.08, lng: 34.78 },
    radiusKm: 10,
  })
  expect(result.map((p) => p.id)).toEqual(['near', 'dog'])
  expect(result[0].distanceKm).toBeCloseTo(0, 3)
})
