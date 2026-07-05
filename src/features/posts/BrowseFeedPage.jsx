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

  useEffect(() => {
    listPosts(supabase).then(setPosts)
    getUserLocation()
      .then(setUserLocation)
      .catch(() => setUserLocation(null))
  }, [])

  const visiblePosts = filterAndSortPosts(posts, { ...filters, userLocation })

  return (
    <div>
      <h2>Missing &amp; found pets near you</h2>
      <label htmlFor="species-filter">Species</label>
      <input
        id="species-filter"
        value={filters.species || ''}
        onChange={(e) => setFilters((prev) => ({ ...prev, species: e.target.value || undefined }))}
      />
      {visiblePosts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}
