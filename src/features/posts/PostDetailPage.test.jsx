import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import PostDetailPage from './PostDetailPage.jsx'
import * as postsApi from './postsApi.js'
import { useAuth } from '../auth/AuthContext.jsx'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('./postsApi.js', () => ({
  getPost: vi.fn(() =>
    Promise.resolve({ id: 'p1', owner_id: 'owner-1', type: 'missing', species: 'cat', location_text: 'Tel Aviv', post_photos: [] })
  ),
  resolvePost: vi.fn(() => Promise.resolve()),
}))
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: vi.fn() }))

function renderAtPost(id) {
  return render(
    <MemoryRouter initialEntries={[`/post/${id}`]}>
      <Routes>
        <Route path="/post/:id" element={<PostDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

test('owner sees a resolve button and it marks the post resolved', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  renderAtPost('p1')

  await waitFor(() => screen.getByText(/Missing: cat/))
  await userEvent.click(screen.getByText('Mark as resolved'))

  expect(postsApi.resolvePost).toHaveBeenCalledWith(expect.anything(), 'p1')
})

test('non-owner does not see a resolve button', async () => {
  useAuth.mockReturnValue({ user: { id: 'someone-else' } })
  renderAtPost('p1')

  await waitFor(() => screen.getByText(/Missing: cat/))
  expect(screen.queryByText('Mark as resolved')).not.toBeInTheDocument()
})

test('shows full post fields and photos when present', async () => {
  useAuth.mockReturnValue({ user: null })
  postsApi.getPost.mockResolvedValueOnce({
    id: 'p2',
    owner_id: 'owner-1',
    type: 'missing',
    species: 'cat',
    breed: 'Tabby',
    color: 'orange',
    size: 'small',
    collar: true,
    collar_description: 'blue collar',
    microchipped: 'yes',
    distinctive_markings: 'white paw',
    pet_name: 'Milo',
    reward_amount: 100,
    location_text: 'Tel Aviv',
    date_lost_or_found: '2026-07-01',
    status: 'active',
    post_photos: [{ id: 'photo-1', storage_path: 'p2/photo.svg' }],
  })
  renderAtPost('p2')

  await waitFor(() => screen.getByText(/Missing: cat — Milo/))
  expect(screen.getByText('Tabby')).toBeInTheDocument()
  expect(screen.getByText('orange')).toBeInTheDocument()
  expect(screen.getByText('blue collar')).toBeInTheDocument()
  expect(screen.getByText('Reward: ₪100')).toBeInTheDocument()
  const photo = screen.getByRole('img')
  expect(photo).toHaveAttribute('src', expect.stringContaining('p2/photo.svg'))
})

test('shows a placeholder for optional fields the poster left blank, in a fixed order', async () => {
  useAuth.mockReturnValue({ user: null })
  postsApi.getPost.mockResolvedValueOnce({
    id: 'p5',
    owner_id: 'owner-1',
    type: 'found',
    species: 'dog',
    microchipped: 'unknown',
    collar: false,
    location_text: 'Tel Aviv',
    date_lost_or_found: '2026-07-01',
    status: 'active',
    post_photos: [],
  })
  renderAtPost('p5')

  await waitFor(() => screen.getByText(/Found: dog/))
  expect(screen.getByText('Breed')).toBeInTheDocument()
  expect(screen.getByText('Color')).toBeInTheDocument()
  expect(screen.getByText('Size')).toBeInTheDocument()
  expect(screen.getByText('Distinctive markings')).toBeInTheDocument()
  expect(screen.getByText('Phone')).toBeInTheDocument()
  expect(screen.getAllByText('—')).toHaveLength(5)
})

test('shows the phone number as a tel: link when present', async () => {
  useAuth.mockReturnValue({ user: null })
  postsApi.getPost.mockResolvedValueOnce({
    id: 'p6',
    owner_id: 'owner-1',
    type: 'found',
    species: 'dog',
    location_text: 'Tel Aviv',
    post_photos: [],
    phone_number: '050-1234567',
  })
  renderAtPost('p6')

  const link = await screen.findByRole('link', { name: '050-1234567' })
  expect(link).toHaveAttribute('href', 'tel:050-1234567')
})

test('shows who posted it, when known', async () => {
  useAuth.mockReturnValue({ user: null })
  postsApi.getPost.mockResolvedValueOnce({
    id: 'p3',
    owner_id: 'owner-1',
    type: 'found',
    species: 'dog',
    location_text: 'Tel Aviv',
    post_photos: [],
    profiles: { display_name: 'Dana' },
  })
  renderAtPost('p3')

  expect(await screen.findByText('Posted by Dana')).toBeInTheDocument()
})

test('shows a reunited celebration banner for a resolved post', async () => {
  useAuth.mockReturnValue({ user: null })
  postsApi.getPost.mockResolvedValueOnce({
    id: 'p4',
    owner_id: 'owner-1',
    type: 'missing',
    species: 'cat',
    pet_name: 'Milo',
    location_text: 'Tel Aviv',
    post_photos: [],
    status: 'resolved',
  })
  renderAtPost('p4')

  expect(await screen.findByText(/Milo has been reunited with their family/)).toBeInTheDocument()
})

test('shows an error message when the post fails to load', async () => {
  useAuth.mockReturnValue({ user: null })
  postsApi.getPost.mockRejectedValueOnce(new Error('Post not found'))
  renderAtPost('missing-post')

  expect(await screen.findByRole('alert')).toHaveTextContent('Post not found')
})

test('shows a Contact publisher button for a logged-in non-owner and navigates to /messages', async () => {
  useAuth.mockReturnValue({ user: { id: 'someone-else' } })
  postsApi.getPost.mockResolvedValueOnce({
    id: 'p7',
    owner_id: 'owner-1',
    type: 'missing',
    species: 'cat',
    pet_name: 'Milo',
    location_text: 'Tel Aviv',
    post_photos: [],
    profiles: { display_name: 'Dana' },
  })
  renderAtPost('p7')

  const button = await screen.findByRole('button', { name: 'Contact publisher' })
  await userEvent.click(button)

  expect(mockNavigate).toHaveBeenCalledWith('/messages', {
    state: {
      openPostId: 'p7',
      otherUser: { id: 'owner-1', displayName: 'Dana' },
      postSummary: { type: 'missing', species: 'cat', petName: 'Milo', photoUrl: null },
    },
  })
})

test('does not show a Contact publisher button for the post owner', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  renderAtPost('p1')

  await waitFor(() => screen.getByText(/Missing: cat/))
  expect(screen.queryByRole('button', { name: 'Contact publisher' })).not.toBeInTheDocument()
})

test('does not show a Contact publisher button when logged out', async () => {
  useAuth.mockReturnValue({ user: null })
  renderAtPost('p1')

  await waitFor(() => screen.getByText(/Missing: cat/))
  expect(screen.queryByRole('button', { name: 'Contact publisher' })).not.toBeInTheDocument()
})
