import { haversineDistanceKm } from '../../lib/distance.js'
import { isExpired } from './postExpiry.js'

// `now` defaults to a fresh Date() on every call (not a shared module-level
// value), so it can't go stale across a long browsing session — pass an
// explicit value in tests for deterministic assertions.
export function filterAndSortPosts(posts, filters, now = new Date()) {
  const {
    userLocation,
    radiusKm,
    type,
    species,
    breed,
    color,
    size,
    collarOnly,
    dateFrom,
    dateTo,
    rewardOnly,
    status = 'active',
  } = filters

  return posts
    .filter((post) => (status ? post.status === status : true))
    // Active posts past their expiry are hidden from Browse immediately,
    // even before the owner's own dashboard has actually deleted the row
    // (see MyPostsDashboard.jsx / postExpiry.js) — never surfaced as a
    // stale listing while that lazy cleanup hasn't run yet.
    .filter((post) => !(post.status === 'active' && isExpired(post, now)))
    .filter((post) => (type && type !== 'all' ? post.type === type : true))
    .filter((post) => (species ? post.species === species : true))
    .filter((post) => (breed ? post.breed?.toLowerCase().includes(breed.toLowerCase()) : true))
    .filter((post) => (color ? post.color === color : true))
    .filter((post) => (size ? post.size === size : true))
    .filter((post) => (collarOnly ? post.collar === true : true))
    .filter((post) => (rewardOnly ? Number(post.reward_amount) > 0 : true))
    .filter((post) => (dateFrom ? post.date_lost_or_found >= dateFrom : true))
    .filter((post) => (dateTo ? post.date_lost_or_found <= dateTo : true))
    .map((post) => ({
      ...post,
      distanceKm: userLocation
        ? haversineDistanceKm(userLocation.lat, userLocation.lng, post.location_lat, post.location_lng)
        : null,
    }))
    .filter((post) => (userLocation && radiusKm ? post.distanceKm <= radiusKm : true))
    .sort((a, b) => {
      if (a.distanceKm == null || b.distanceKm == null) return 0
      return a.distanceKm - b.distanceKm
    })
}
