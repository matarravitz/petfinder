import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import CreatePostForm from './CreatePostForm.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import * as postsApi from './postsApi.js'

vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: vi.fn() }))
vi.mock('./postsApi.js', () => ({ createPost: vi.fn(() => Promise.resolve({ id: 'p1' })) }))
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
