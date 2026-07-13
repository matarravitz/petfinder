import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { buildPostPayload } from './buildPostPayload.js'
import { createPost } from './postsApi.js'
import LocationPicker from './LocationPicker.jsx'

const SPECIES_OPTIONS = [
  { value: 'cat', label: 'Cat' },
  { value: 'dog', label: 'Dog' },
  { value: 'rabbit', label: 'Rabbit' },
  { value: 'bird', label: 'Bird' },
  { value: 'other', label: 'Other' },
]

const BREEDS_BY_SPECIES = {
  cat: [
    'Domestic Shorthair',
    'Domestic Longhair',
    'Siamese',
    'Persian',
    'Maine Coon',
    'British Shorthair',
    'Ragdoll',
    'Bengal',
    'Sphynx',
  ],
  dog: [
    'Labrador Retriever',
    'German Shepherd',
    'Golden Retriever',
    'Poodle',
    'Bulldog',
    'Beagle',
    'Terrier Mix',
    'Chihuahua',
    'Dachshund',
    'Husky',
  ],
  rabbit: [
    'Holland Lop',
    'Netherland Dwarf',
    'Mini Rex',
    'Lionhead',
    'Dutch',
    'Flemish Giant',
    'English Angora',
    'Himalayan',
    'Californian',
  ],
  bird: [
    'Budgerigar (Budgie)',
    'Cockatiel',
    'Lovebird',
    'Parakeet',
    'African Grey Parrot',
    'Cockatoo',
    'Canary',
    'Finch',
    'Macaw',
    'Conure',
  ],
}

const SIZE_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
]

const COLOR_OPTIONS = [
  'Black',
  'White',
  'Brown',
  'Gray',
  'Orange/Ginger',
  'Cream',
  'Golden',
  'Black and white',
  'Multi-color',
]

const initialForm = {
  type: 'missing',
  species: '',
  breed: '',
  breedOther: '',
  color: '',
  colorOther: '',
  size: '',
  collar: false,
  collarDescription: '',
  microchipped: 'unknown',
  distinctiveMarkings: '',
  petName: '',
  rewardAmount: '',
  phoneNumber: '',
  dateLostOrFound: '',
}

export default function CreatePostForm() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [location, setLocation] = useState(null)
  const [files, setFiles] = useState([])
  const [previewUrls, setPreviewUrls] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file))
    setPreviewUrls(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [files])

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function updateSpecies(value) {
    setForm((prev) => ({ ...prev, species: value, breed: '', breedOther: '', size: '' }))
  }

  const breedOptions = BREEDS_BY_SPECIES[form.species]

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    if (!location) {
      setError('Please choose a location on the map before posting.')
      return
    }
    try {
      const effectiveBreed = form.breed === 'other' ? form.breedOther : form.breed
      const effectiveColor = form.color === 'other' ? form.colorOther : form.color
      const payload = buildPostPayload(
        {
          ...form,
          breed: effectiveBreed,
          color: effectiveColor,
          locationText: location.text,
          locationLat: location.lat,
          locationLng: location.lng,
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
    <form onSubmit={handleSubmit} className="form-page">
      <h2>Report a missing or found pet</h2>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-section">
        <h3 className="form-section-title">What are you reporting?</h3>
        <div className="segmented" role="radiogroup" aria-label="Post type">
          <button
            type="button"
            role="radio"
            aria-checked={form.type === 'missing'}
            className="segmented-option"
            onClick={() => update('type', 'missing')}
          >
            Missing pet
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={form.type === 'found'}
            className="segmented-option"
            onClick={() => update('type', 'found')}
          >
            Found pet
          </button>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">About the pet</h3>
        <div className="field-grid">
          <div className="field">
            <label className="field-label" htmlFor="species">
              Species
            </label>
            <select
              id="species"
              className="field-select"
              value={form.species}
              onChange={(e) => updateSpecies(e.target.value)}
              required
            >
              <option value="" disabled>
                Select species
              </option>
              {SPECIES_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="breed">
              Breed
            </label>
            {breedOptions ? (
              <select
                id="breed"
                className="field-select"
                value={form.breed}
                onChange={(e) => update('breed', e.target.value)}
              >
                <option value="">Select breed</option>
                {breedOptions.map((breed) => (
                  <option key={breed} value={breed}>
                    {breed}
                  </option>
                ))}
                <option value="other">Other</option>
              </select>
            ) : (
              <input
                id="breed"
                className="field-input"
                value={form.breed}
                onChange={(e) => update('breed', e.target.value)}
              />
            )}
          </div>

          {form.breed === 'other' && (
            <div className="field">
              <label className="field-label" htmlFor="breedOther">
                Breed (please specify)
              </label>
              <input
                id="breedOther"
                className="field-input"
                value={form.breedOther}
                onChange={(e) => update('breedOther', e.target.value)}
              />
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="color">
              Color
            </label>
            <select
              id="color"
              className="field-select"
              value={form.color}
              onChange={(e) => update('color', e.target.value)}
            >
              <option value="">Select color</option>
              {COLOR_OPTIONS.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
              <option value="other">Other</option>
            </select>
          </div>

          {form.color === 'other' && (
            <div className="field">
              <label className="field-label" htmlFor="colorOther">
                Color (please specify)
              </label>
              <input
                id="colorOther"
                className="field-input"
                value={form.colorOther}
                onChange={(e) => update('colorOther', e.target.value)}
              />
            </div>
          )}

          {form.species === 'dog' && (
            <div className="field">
              <label className="field-label" htmlFor="size">
                Size
              </label>
              <select
                id="size"
                className="field-select"
                value={form.size}
                onChange={(e) => update('size', e.target.value)}
              >
                <option value="">Select size</option>
                {SIZE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="microchipped">
              Microchipped
            </label>
            <select
              id="microchipped"
              className="field-select"
              value={form.microchipped}
              onChange={(e) => update('microchipped', e.target.value)}
            >
              <option value="unknown">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="distinctiveMarkings">
              Distinctive markings
            </label>
            <input
              id="distinctiveMarkings"
              className="field-input"
              value={form.distinctiveMarkings}
              onChange={(e) => update('distinctiveMarkings', e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="phoneNumber">
              Phone number (optional)
            </label>
            <input
              id="phoneNumber"
              className="field-input"
              type="tel"
              value={form.phoneNumber}
              onChange={(e) => update('phoneNumber', e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-checkbox" htmlFor="collar">
              <input
                id="collar"
                type="checkbox"
                checked={form.collar}
                onChange={(e) => update('collar', e.target.checked)}
              />
              Has a collar
            </label>
          </div>

          {form.collar && (
            <div className="field">
              <label className="field-label" htmlFor="collarDescription">
                Collar description
              </label>
              <input
                id="collarDescription"
                className="field-input"
                value={form.collarDescription}
                onChange={(e) => update('collarDescription', e.target.value)}
              />
            </div>
          )}

          {form.type === 'missing' && (
            <>
              <div className="field">
                <label className="field-label" htmlFor="petName">
                  Pet name
                </label>
                <input
                  id="petName"
                  className="field-input"
                  value={form.petName}
                  onChange={(e) => update('petName', e.target.value)}
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="rewardAmount">
                  Reward amount (optional)
                </label>
                <div className="currency-input">
                  <span className="currency-input-badge" aria-hidden="true">
                    ₪
                  </span>
                  <input
                    id="rewardAmount"
                    className="field-input currency-input-field"
                    type="number"
                    min="0"
                    value={form.rewardAmount}
                    onChange={(e) => update('rewardAmount', e.target.value)}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Photos</h3>
        <label className="photo-dropzone" htmlFor="photos">
          {files.length > 0
            ? `${files.length} photo${files.length > 1 ? 's' : ''} selected — click to change`
            : 'Click to choose photos'}
          <input
            id="photos"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files))}
          />
        </label>
        {previewUrls.length > 0 && (
          <div className="photo-preview-grid">
            {previewUrls.map((url, index) => (
              <img key={url} className="photo-preview-thumb" src={url} alt={`Selected photo ${index + 1}`} />
            ))}
          </div>
        )}
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Where &amp; when</h3>

        <div className="field">
          <span className="field-label">Location</span>
          <LocationPicker value={location} onChange={setLocation} />
        </div>

        <div className="field-grid">
          <div className="field">
            <label className="field-label" htmlFor="dateLostOrFound">
              Date lost/found
            </label>
            <input
              id="dateLostOrFound"
              className="field-input"
              type="date"
              value={form.dateLostOrFound}
              onChange={(e) => update('dateLostOrFound', e.target.value)}
              required
            />
          </div>
        </div>
      </div>

      <button type="submit" className="form-submit">
        Create post
      </button>
    </form>
  )
}
