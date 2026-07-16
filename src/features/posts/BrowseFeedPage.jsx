import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  // Filters live in the URL (not just component state) so they survive
  // navigating away to a post and back — React Router unmounts this page
  // when you visit /post/:id and mounts a fresh instance on return, which
  // would otherwise reset every filter to its default.
  const [searchParams, setSearchParams] = useSearchParams()
  const [posts, setPosts] = useState([])
  const [userLocation, setUserLocation] = useState(null)
  const [type, setType] = useState(searchParams.get('type') || 'all')
  const [species, setSpecies] = useState(searchParams.get('species') || '')
  const [radiusKm, setRadiusKm] = useState(Number(searchParams.get('radius')) || 50)
  const [showAll, setShowAll] = useState(searchParams.get('showAll') === 'true')
  const [error, setError] = useState(null)

  useEffect(() => {
    listPosts(supabase)
      .then(setPosts)
      .catch((err) => setError(err.message))
    getUserLocation()
      .then(setUserLocation)
      .catch(() => setUserLocation(null))
  }, [])

  // Keep the URL in sync with the filters (via `replace` so every slider
  // tick/click doesn't grow browser history) — this is what lets the browser
  // back button restore the exact filters that were active before navigating
  // away. Only non-default values are written, keeping the URL clean.
  useEffect(() => {
    const params = new URLSearchParams()
    if (type !== 'all') params.set('type', type)
    if (species) params.set('species', species)
    if (radiusKm !== 50) params.set('radius', String(radiusKm))
    if (showAll) params.set('showAll', 'true')
    // Skip the replace entirely when nothing actually changed (e.g. right on
    // mount, when this state was itself just read from these same params) —
    // react-router mints a brand new location.key on every replace() call
    // regardless of whether the URL content changed, and an unnecessary key
    // churn here breaks scroll-restoration's ability to look up this page's
    // saved scroll position by key (see useScrollRestoration.js).
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, species, radiusKm, showAll])

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
