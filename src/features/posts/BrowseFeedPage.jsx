import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { listPosts } from './postsApi.js'
import { filterAndSortPosts } from './filterPosts.js'
import { getUserLocation } from '../../lib/geolocation.js'
import PostCard from './PostCard.jsx'

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'missing', label: 'Missing' },
  { value: 'found', label: 'Found' },
]

const SPECIES_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'cat', label: 'Cat' },
  { value: 'dog', label: 'Dog' },
  { value: 'rabbit', label: 'Rabbit' },
  { value: 'bird', label: 'Bird' },
  { value: 'other', label: 'Other' },
]

export default function BrowseFeedPage() {
  const [posts, setPosts] = useState([])
  const [userLocation, setUserLocation] = useState(null)
  const [type, setType] = useState('all')
  const [species, setSpecies] = useState('')
  const [radiusKm, setRadiusKm] = useState(50)
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    listPosts(supabase)
      .then(setPosts)
      .catch((err) => setError(err.message))
    getUserLocation()
      .then(setUserLocation)
      .catch(() => setUserLocation(null))
  }, [])

  const visiblePosts = filterAndSortPosts(posts, {
    type,
    species: species || undefined,
    radiusKm: showAll ? undefined : radiusKm,
    userLocation,
  })

  return (
    <div>
      <h2>Missing &amp; found pets near you</h2>
      {error && <p role="alert">{error}</p>}

      <div className="browse-toolbar">
        <div className="browse-toolbar-group">
          <span className="browse-toolbar-label" id="type-filter-label">
            Type
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="type-filter-label">
            {TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={type === option.value}
                className="segmented-option"
                onClick={() => setType(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="browse-toolbar-group">
          <span className="browse-toolbar-label" id="species-filter-label">
            Species
          </span>
          <div className="chip-group" role="radiogroup" aria-labelledby="species-filter-label">
            {SPECIES_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={species === option.value}
                className="chip"
                onClick={() => setSpecies(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="browse-toolbar-group">
          <label className="browse-toolbar-label" htmlFor="radius-filter">
            Radius
          </label>
          <div className="slider-field">
            <input
              id="radius-filter"
              type="range"
              min="1"
              max="200"
              disabled={showAll}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
            />
            <span className="slider-field-value">{showAll ? 'Any distance' : `${radiusKm} km`}</span>
          </div>
        </div>

        <label className="chip-checkbox show-all-toggle" htmlFor="show-all-filter">
          <input
            id="show-all-filter"
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Show all pets, regardless of distance
        </label>
      </div>

      {visiblePosts.length > 0 ? (
        <div className="post-grid">
          {visiblePosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        !error && (
          <p className="browse-empty">
            No pets match these filters right now — try widening the radius or clearing a filter.
          </p>
        )
      )}
    </div>
  )
}
