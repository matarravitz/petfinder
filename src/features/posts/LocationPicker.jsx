import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import markerIconUrl from 'leaflet/dist/images/marker-icon.png'
import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png'
import 'leaflet/dist/leaflet.css'
import { getUserLocation } from '../../lib/geolocation.js'

L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
})

const DEFAULT_CENTER = { lat: 31.5, lng: 34.75 }

function RecenterOnChange({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    map.setView([center.lat, center.lng], zoom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng])
  return null
}

function ClickHandler({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

export default function LocationPicker({ value, onChange }) {
  const [center, setCenter] = useState(value ? { lat: value.lat, lng: value.lng } : DEFAULT_CENTER)
  const [zoom, setZoom] = useState(value ? 15 : 8)
  const [query, setQuery] = useState(value?.text || '')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const skipNextAutoSearch = useRef(false)

  useEffect(() => {
    if (!value) {
      getUserLocation()
        .then((location) => setCenter(location))
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function searchFor(text) {
    if (!text.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    setSearchError(null)
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=5`
      )
      if (!response.ok) throw new Error('Search failed')
      const data = await response.json()
      setResults(data)
      if (data.length === 0) setSearchError('No matching places found — try a different search.')
    } catch {
      setSearchError('Could not search right now — try again, or click the map to drop a pin.')
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    if (skipNextAutoSearch.current) {
      skipNextAutoSearch.current = false
      return
    }
    if (!query.trim() || query.trim().length < 3) {
      setResults([])
      return
    }
    const timeoutId = setTimeout(() => {
      searchFor(query)
    }, 450)
    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  function handleSearchClick(event) {
    event.preventDefault()
    searchFor(query)
  }

  function selectResult(result) {
    const lat = Number(result.lat)
    const lng = Number(result.lon)
    setCenter({ lat, lng })
    setZoom(15)
    setResults([])
    skipNextAutoSearch.current = true
    setQuery(result.display_name)
    onChange({ lat, lng, text: result.display_name })
  }

  async function handleMapSelect(lat, lng) {
    setCenter({ lat, lng })
    setZoom(15)
    let text = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
      const data = await response.json()
      if (data?.display_name) text = data.display_name
    } catch {
      // keep the coordinate fallback
    }
    setResults([])
    skipNextAutoSearch.current = true
    setQuery(text)
    onChange({ lat, lng, text })
  }

  return (
    <div className="location-picker">
      <div className="location-picker-search">
        <input
          type="text"
          className="field-input"
          placeholder="Search an address or place"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              searchFor(query)
            }
          }}
          aria-label="Search for a location"
        />
        <button
          type="button"
          className="location-picker-search-btn"
          disabled={searching}
          onClick={handleSearchClick}
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {searchError && (
        <p className="form-error" role="alert">
          {searchError}
        </p>
      )}

      {results.length > 0 && (
        <ul className="location-picker-results">
          {results.map((result) => (
            <li key={result.place_id}>
              <button type="button" onClick={() => selectResult(result)}>
                {result.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="location-picker-map">
        <MapContainer center={[center.lat, center.lng]} zoom={zoom} style={{ height: '280px', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {value && <Marker position={[value.lat, value.lng]} />}
          <RecenterOnChange center={center} zoom={zoom} />
          <ClickHandler onSelect={handleMapSelect} />
        </MapContainer>
      </div>

      {value ? (
        <p className="location-picker-selected">Selected: {value.text}</p>
      ) : (
        <p className="location-picker-hint">Search an address above, or click the map to drop a pin.</p>
      )}
    </div>
  )
}
