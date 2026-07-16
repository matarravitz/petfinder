import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import CreatePostForm from './CreatePostForm.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import * as postsApi from './postsApi.js'
import { analyzePhoto } from './photoAnalysis/analyzePhoto.js'
import { getPhotoEmbedding } from './photoAnalysis/getPhotoEmbedding.js'

vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: vi.fn() }))
vi.mock('./postsApi.js', () => ({ createPost: vi.fn(() => Promise.resolve({ id: 'p1' })) }))
vi.mock('./photoAnalysis/analyzePhoto.js', () => ({ analyzePhoto: vi.fn() }))
vi.mock('./photoAnalysis/getPhotoEmbedding.js', () => ({ getPhotoEmbedding: vi.fn(() => Promise.resolve(null)) }))
vi.mock('./LocationPicker.jsx', () => ({
  default: ({ value, onChange }) => (
    <button
      type="button"
      onClick={() => onChange({ lat: 32.08, lng: 34.78, text: 'Tel Aviv, Israel' })}
    >
      {value ? value.text : 'Pick a location (test stub)'}
    </button>
  ),
}))

test('submits a missing-pet post with the entered fields and the chosen map location', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await userEvent.click(screen.getByRole('radio', { name: 'Missing pet' }))
  await userEvent.selectOptions(screen.getByLabelText('Species'), 'cat')
  await userEvent.click(screen.getByText('Pick a location (test stub)'))
  await userEvent.type(screen.getByLabelText('Date lost/found'), '2026-07-01')
  await userEvent.click(screen.getByText('Create post'))

  await waitFor(() => expect(postsApi.createPost).toHaveBeenCalled())
  expect(postsApi.createPost).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      owner_id: 'owner-1',
      type: 'missing',
      species: 'cat',
      location_text: 'Tel Aviv, Israel',
      location_lat: 32.08,
      location_lng: 34.78,
    }),
    []
  )
})

test('disables the submit button and prevents a second submission while creating a post', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  postsApi.createPost.mockClear()
  let resolveCreatePost
  postsApi.createPost.mockReturnValue(
    new Promise((resolve) => {
      resolveCreatePost = resolve
    })
  )

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await userEvent.click(screen.getByRole('radio', { name: 'Missing pet' }))
  await userEvent.selectOptions(screen.getByLabelText('Species'), 'cat')
  await userEvent.click(screen.getByText('Pick a location (test stub)'))
  await userEvent.type(screen.getByLabelText('Date lost/found'), '2026-07-01')
  await userEvent.click(screen.getByText('Create post'))

  expect(await screen.findByRole('button', { name: 'Creating post…' })).toBeDisabled()
  expect(postsApi.createPost).toHaveBeenCalledTimes(1)

  // A second click while still pending must not trigger a second call —
  // the button is disabled, so this simulates the guard, not just the UI.
  await userEvent.click(screen.getByRole('button', { name: 'Creating post…' }))
  expect(postsApi.createPost).toHaveBeenCalledTimes(1)

  resolveCreatePost({ id: 'p1' })
  await waitFor(() => expect(postsApi.createPost).toHaveBeenCalledTimes(1))
  // mockReturnValue overrides the module's default implementation until
  // reset — restore it so later tests get a fresh auto-resolving promise
  // per call, matching the vi.mock() factory's default behavior.
  postsApi.createPost.mockImplementation(() => Promise.resolve({ id: 'p1' }))
})

test('shows an error and does not submit when no location has been chosen on the map', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  postsApi.createPost.mockClear()

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await userEvent.selectOptions(screen.getByLabelText('Species'), 'cat')
  await userEvent.type(screen.getByLabelText('Date lost/found'), '2026-07-01')
  await userEvent.click(screen.getByText('Create post'))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Please choose a location on the map before posting.'
  )
  expect(postsApi.createPost).not.toHaveBeenCalled()
})

test('choosing cat shows a breed dropdown of common cat breeds, with an Other free-text fallback', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await userEvent.selectOptions(screen.getByLabelText('Species'), 'cat')

  const breedSelect = screen.getByLabelText('Breed')
  expect(breedSelect.tagName).toBe('SELECT')
  expect(screen.getByRole('option', { name: 'Siamese' })).toBeInTheDocument()

  await userEvent.selectOptions(breedSelect, 'other')

  expect(screen.getByLabelText('Breed (please specify)')).toBeInTheDocument()
})

test('rabbit and bird also get a breed dropdown of common breeds', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await userEvent.selectOptions(screen.getByLabelText('Species'), 'rabbit')
  expect(screen.getByLabelText('Breed').tagName).toBe('SELECT')
  expect(screen.getByRole('option', { name: 'Holland Lop' })).toBeInTheDocument()

  await userEvent.selectOptions(screen.getByLabelText('Species'), 'bird')
  expect(screen.getByLabelText('Breed').tagName).toBe('SELECT')
  expect(screen.getByRole('option', { name: 'Cockatiel' })).toBeInTheDocument()
})

test('size only appears for dogs, as a Small/Medium/Large dropdown with no free-text option', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await userEvent.selectOptions(screen.getByLabelText('Species'), 'rabbit')
  expect(screen.queryByLabelText('Size')).not.toBeInTheDocument()

  await userEvent.selectOptions(screen.getByLabelText('Species'), 'dog')
  const sizeSelect = screen.getByLabelText('Size')
  expect(sizeSelect.tagName).toBe('SELECT')
  const sizeOptions = within(sizeSelect)
  expect(sizeOptions.getByRole('option', { name: 'Small' })).toBeInTheDocument()
  expect(sizeOptions.getByRole('option', { name: 'Medium' })).toBeInTheDocument()
  expect(sizeOptions.getByRole('option', { name: 'Large' })).toBeInTheDocument()
  expect(sizeOptions.queryByRole('option', { name: 'Other' })).not.toBeInTheDocument()
})

test('color is a dropdown of common colors, with an Other free-text fallback', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  const colorSelect = screen.getByLabelText('Color')
  expect(colorSelect.tagName).toBe('SELECT')
  expect(screen.getByRole('option', { name: 'Black' })).toBeInTheDocument()

  await userEvent.selectOptions(colorSelect, 'other')

  expect(screen.getByLabelText('Color (please specify)')).toBeInTheDocument()
})

test('pet name and reward fields only show for missing pets, not found', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  expect(screen.getByLabelText('Pet name')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('radio', { name: 'Found pet' }))

  expect(screen.queryByLabelText('Pet name')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Reward amount (optional)')).not.toBeInTheDocument()
})

test('shows a photo preview thumbnail for each selected file', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  const createObjectURL = vi.fn(() => 'blob:preview-url')
  vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  const file = new File(['fake-image-content'], 'cat.jpg', { type: 'image/jpeg' })
  await userEvent.upload(screen.getByLabelText(/choose photos/i), file)

  expect(await screen.findByAltText('Selected photo 1')).toHaveAttribute('src', 'blob:preview-url')
  expect(screen.getByText('1 photo selected — click to change')).toBeInTheDocument()
})

test('phone number is optional and gets submitted when filled in', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await userEvent.selectOptions(screen.getByLabelText('Species'), 'cat')
  await userEvent.click(screen.getByText('Pick a location (test stub)'))
  await userEvent.type(screen.getByLabelText('Date lost/found'), '2026-07-01')
  await userEvent.type(screen.getByLabelText('Phone number (optional)'), '050-1234567')
  await userEvent.click(screen.getByText('Create post'))

  await waitFor(() => expect(postsApi.createPost).toHaveBeenCalled())
  expect(postsApi.createPost).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ phone_number: '050-1234567' }),
    []
  )
})

async function uploadOnePhoto() {
  const createObjectURL = vi.fn(() => 'blob:preview-url')
  vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() })
  const file = new File(['fake-image-content'], 'dog.jpg', { type: 'image/jpeg' })
  await userEvent.upload(screen.getByLabelText(/choose photos/i), file)
}

test('computes a photo embedding in the background and includes it in the created post payload', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  getPhotoEmbedding.mockResolvedValue([0.1, 0.2, 0.3])

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await uploadOnePhoto()
  await userEvent.selectOptions(screen.getByLabelText('Species'), 'cat')
  await userEvent.click(screen.getByText('Pick a location (test stub)'))
  await userEvent.type(screen.getByLabelText('Date lost/found'), '2026-07-01')
  await userEvent.click(screen.getByText('Create post'))

  await waitFor(() =>
    expect(postsApi.createPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ photo_embedding: [0.1, 0.2, 0.3] }),
      expect.any(Array)
    )
  )
})

test('submits with a null photo embedding when no photo was selected', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  getPhotoEmbedding.mockClear()

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await userEvent.selectOptions(screen.getByLabelText('Species'), 'cat')
  await userEvent.click(screen.getByText('Pick a location (test stub)'))
  await userEvent.type(screen.getByLabelText('Date lost/found'), '2026-07-01')
  await userEvent.click(screen.getByText('Create post'))

  await waitFor(() =>
    expect(postsApi.createPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ photo_embedding: null }),
      []
    )
  )
  expect(getPhotoEmbedding).not.toHaveBeenCalled()
})

test('shows a hint about photo auto-fill before a photo is uploaded, and hides it after', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  expect(
    screen.getByText('Add a photo first — we can suggest species, breed, and color for you to review below.')
  ).toBeInTheDocument()

  await uploadOnePhoto()

  expect(
    screen.queryByText('Add a photo first — we can suggest species, breed, and color for you to review below.')
  ).not.toBeInTheDocument()
})

test('Analyze Photo button only appears once a photo is selected', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  expect(screen.queryByRole('button', { name: 'Analyze Photo' })).not.toBeInTheDocument()

  await uploadOnePhoto()

  expect(screen.getByRole('button', { name: 'Analyze Photo' })).toBeInTheDocument()
})

test('analyzing a photo fills species, breed, and color and marks them as auto-filled', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  analyzePhoto.mockResolvedValue({
    species: 'dog',
    breed: 'Golden Retriever',
    breedOther: '',
    color: 'Golden',
    undetected: [],
  })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await uploadOnePhoto()
  await userEvent.click(screen.getByRole('button', { name: 'Analyze Photo' }))

  await waitFor(() => expect(screen.getByLabelText('Species')).toHaveValue('dog'))
  expect(screen.getByLabelText('Breed')).toHaveValue('Golden Retriever')
  expect(screen.getByLabelText('Color')).toHaveValue('Golden')
  expect(screen.getAllByText('✨ auto-filled')).toHaveLength(3)
})

test('shows a note and leaves fields blank for anything the model could not confidently detect', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  analyzePhoto.mockResolvedValue({
    species: null,
    breed: null,
    breedOther: null,
    color: null,
    undetected: ['species', 'breed', 'color'],
  })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await uploadOnePhoto()
  await userEvent.click(screen.getByRole('button', { name: 'Analyze Photo' }))

  expect(
    await screen.findByText("Couldn't confidently detect species, breed, color — please fill them in manually.")
  ).toBeInTheDocument()
  expect(screen.getByLabelText('Species')).toHaveValue('')
})

test('editing an auto-filled field clears its auto-filled marker', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  analyzePhoto.mockResolvedValue({
    species: 'dog',
    breed: 'Golden Retriever',
    breedOther: '',
    color: 'Golden',
    undetected: [],
  })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await uploadOnePhoto()
  await userEvent.click(screen.getByRole('button', { name: 'Analyze Photo' }))
  await waitFor(() => expect(screen.getAllByText('✨ auto-filled')).toHaveLength(3))

  await userEvent.selectOptions(screen.getByLabelText('Color'), 'Black')

  expect(screen.getAllByText('✨ auto-filled')).toHaveLength(2)
})

test('re-analyzing with the same species but a low-confidence breed/color does not wipe the previously auto-filled breed/color', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  analyzePhoto.mockResolvedValueOnce({
    species: 'dog',
    breed: 'Golden Retriever',
    breedOther: '',
    color: 'Golden',
    undetected: [],
  })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await uploadOnePhoto()
  await userEvent.click(screen.getByRole('button', { name: 'Analyze Photo' }))

  await waitFor(() => expect(screen.getByLabelText('Species')).toHaveValue('dog'))
  expect(screen.getByLabelText('Breed')).toHaveValue('Golden Retriever')
  expect(screen.getByLabelText('Color')).toHaveValue('Golden')

  analyzePhoto.mockResolvedValueOnce({
    species: 'dog',
    breed: null,
    breedOther: null,
    color: null,
    undetected: ['breed', 'color'],
  })

  await userEvent.click(screen.getByRole('button', { name: 'Analyze Photo' }))

  await waitFor(() =>
    expect(
      screen.getByText("Couldn't confidently detect breed, color — please fill them in manually.")
    ).toBeInTheDocument()
  )
  expect(screen.getByLabelText('Species')).toHaveValue('dog')
  expect(screen.getByLabelText('Breed')).toHaveValue('Golden Retriever')
  expect(screen.getByLabelText('Color')).toHaveValue('Golden')
})

test('asks for confirmation before overwriting a manually-entered breed, and leaves it untouched if declined', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  analyzePhoto.mockResolvedValue({
    species: 'dog',
    breed: 'Golden Retriever',
    breedOther: '',
    color: null,
    undetected: ['color'],
  })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await userEvent.selectOptions(screen.getByLabelText('Species'), 'dog')
  await userEvent.selectOptions(screen.getByLabelText('Breed'), 'Labrador Retriever')
  await uploadOnePhoto()
  await userEvent.click(screen.getByRole('button', { name: 'Analyze Photo' }))

  await waitFor(() => expect(window.confirm).toHaveBeenCalled())
  expect(window.confirm.mock.calls[0][0]).toContain('breed')
  expect(screen.getByLabelText('Breed')).toHaveValue('Labrador Retriever')
  expect(screen.queryByText('✨ auto-filled')).not.toBeInTheDocument()
  window.confirm.mockRestore()
})

test('applies the auto-fill result once the user confirms overwriting a manually-entered breed', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  analyzePhoto.mockResolvedValue({
    species: 'dog',
    breed: 'Golden Retriever',
    breedOther: '',
    color: null,
    undetected: ['color'],
  })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await userEvent.selectOptions(screen.getByLabelText('Species'), 'dog')
  await userEvent.selectOptions(screen.getByLabelText('Breed'), 'Labrador Retriever')
  await uploadOnePhoto()
  await userEvent.click(screen.getByRole('button', { name: 'Analyze Photo' }))

  await waitFor(() => expect(screen.getByLabelText('Breed')).toHaveValue('Golden Retriever'))
  window.confirm.mockRestore()
})

test('does not ask for confirmation when the analyzed fields were already blank', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  vi.spyOn(window, 'confirm')
  analyzePhoto.mockResolvedValue({
    species: 'dog',
    breed: 'Golden Retriever',
    breedOther: '',
    color: 'Golden',
    undetected: [],
  })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await uploadOnePhoto()
  await userEvent.click(screen.getByRole('button', { name: 'Analyze Photo' }))

  await waitFor(() => expect(screen.getByLabelText('Breed')).toHaveValue('Golden Retriever'))
  expect(window.confirm).not.toHaveBeenCalled()
  window.confirm.mockRestore()
})

test('shows a retryable inline error when analysis fails', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  analyzePhoto.mockRejectedValue(new Error('model load failed'))

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await uploadOnePhoto()
  await userEvent.click(screen.getByRole('button', { name: 'Analyze Photo' }))

  expect(
    await screen.findByText('Photo analysis failed. You can still fill in the fields manually.')
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Analyze Photo' })).toBeEnabled()
})
