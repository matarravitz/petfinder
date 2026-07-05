import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { listPosts } from './postsApi.js'
import { filterAndSortPosts } from './filterPosts.js'
import { getUserLocation } from '../../lib/geolocation.js'
import PostCard from './PostCard.jsx'

export default function BrowseFeedPage() {
  const [posts, setPosts] = useState([])
  const [userLocation, setUserLocation] = useState(null)
  const [filters, setFilters] = useState({ radiusKm: 50 })
  const [error, setError] = useState(null)

  useEffect(() => {
    listPosts(supabase)
      .then(setPosts)
      .catch((err) => setError(err.message))
    getUserLocation()
      .then(setUserLocation)
      .catch(() => setUserLocation(null))
  }, [])

  const visiblePosts = filterAndSortPosts(posts, { ...filters, userLocation })

  return (
    <div>
      <h2>Missing &amp; found pets near you</h2>
      {error && <p role="alert">{error}</p>}
      <label htmlFor="species-filter">Species</label>
      <input
        id="species-filter"
        value={filters.species || ''}
        onChange={(e) => setFilters((prev) => ({ ...prev, species: e.target.value || undefined }))}
      />
      <label htmlFor="radius-filter">Radius (km)</label>
      <input
        id="radius-filter"
        type="number"
        value={filters.radiusKm}
        onChange={(e) => setFilters((prev) => ({ ...prev, radiusKm: Number(e.target.value) || 0 }))}
      />
      {visiblePosts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}
