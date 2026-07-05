import { haversineDistanceKm } from '../../lib/distance.js'

export function filterAndSortPosts(posts, filters) {
  const {
    userLocation,
    radiusKm,
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
