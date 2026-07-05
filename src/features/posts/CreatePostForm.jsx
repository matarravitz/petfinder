import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { buildPostPayload } from './buildPostPayload.js'
import { createPost } from './postsApi.js'

const initialForm = {
  type: 'missing',
  species: '',
  breed: '',
  color: '',
  size: '',
  collar: false,
  collarDescription: '',
  microchipped: 'unknown',
  distinctiveMarkings: '',
  petName: '',
  rewardAmount: '',
  locationLat: '',
  locationLng: '',
  locationText: '',
  dateLostOrFound: '',
}

export default function CreatePostForm() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [files, setFiles] = useState([])
  const [error, setError] = useState(null)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    try {
      const payload = buildPostPayload(
        {
          ...form,
          locationLat: Number(form.locationLat),
          locationLng: Number(form.locationLng),
        },
        user.id
      )
      const post = await createPost(supabase, payload, files)
      navigate(`/post/${post.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Report a missing or found pet</h2>
      {error && <p role="alert">{error}</p>}

      <label htmlFor="type">Post type</label>
      <select id="type" value={form.type} onChange={(e) => update('type', e.target.value)}>
        <option value="missing">Missing</option>
        <option value="found">Found</option>
      </select>

      <label htmlFor="species">Species</label>
      <input id="species" value={form.species} onChange={(e) => update('species', e.target.value)} required />

      <label htmlFor="breed">Breed</label>
      <input id="breed" value={form.breed} onChange={(e) => update('breed', e.target.value)} />

      <label htmlFor="color">Color</label>
      <input id="color" value={form.color} onChange={(e) => update('color', e.target.value)} />

      <label htmlFor="size">Size</label>
      <input id="size" value={form.size} onChange={(e) => update('size', e.target.value)} />

      <label htmlFor="collar">
        <input
          id="collar"
          type="checkbox"
          checked={form.collar}
          onChange={(e) => update('collar', e.target.checked)}
        />
        Has a collar
      </label>

      {form.collar && (
        <>
          <label htmlFor="collarDescription">Collar description</label>
          <input
            id="collarDescription"
            value={form.collarDescription}
            onChange={(e) => update('collarDescription', e.target.value)}
          />
        </>
      )}

      <label htmlFor="microchipped">Microchipped</label>
      <select id="microchipped" value={form.microchipped} onChange={(e) => update('microchipped', e.target.value)}>
        <option value="unknown">Unknown</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>

      <label htmlFor="distinctiveMarkings">Distinctive markings</label>
      <input
        id="distinctiveMarkings"
        value={form.distinctiveMarkings}
        onChange={(e) => update('distinctiveMarkings', e.target.value)}
      />

      {form.type === 'missing' && (
        <>
          <label htmlFor="petName">Pet name</label>
          <input id="petName" value={form.petName} onChange={(e) => update('petName', e.target.value)} />

          <label htmlFor="rewardAmount">Reward amount (optional)</label>
          <input
            id="rewardAmount"
            type="number"
            value={form.rewardAmount}
            onChange={(e) => update('rewardAmount', e.target.value)}
          />
        </>
      )}

      <label htmlFor="locationText">Location</label>
      <input id="locationText" value={form.locationText} onChange={(e) => update('locationText', e.target.value)} required />

      <label htmlFor="locationLat">Latitude</label>
      <input id="locationLat" value={form.locationLat} onChange={(e) => update('locationLat', e.target.value)} required />

      <label htmlFor="locationLng">Longitude</label>
      <input id="locationLng" value={form.locationLng} onChange={(e) => update('locationLng', e.target.value)} required />

      <label htmlFor="dateLostOrFound">Date lost/found</label>
      <input
        id="dateLostOrFound"
        type="date"
        value={form.dateLostOrFound}
        onChange={(e) => update('dateLostOrFound', e.target.value)}
        required
      />

      <label htmlFor="photos">Photos</label>
      <input id="photos" type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files))} />

      <button type="submit">Create post</button>
    </form>
  )
}
