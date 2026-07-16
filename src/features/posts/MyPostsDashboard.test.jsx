import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import MyPostsDashboard from './MyPostsDashboard.jsx'
import * as postsApi from './postsApi.js'
import { useAuth } from '../auth/AuthContext.jsx'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('./postsApi.js', () => ({
  listPostsByOwner: vi.fn(() => Promise.resolve([])),
}))
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
})

function renderDashboard() {
  return render(
    <MemoryRouter>
      <MyPostsDashboard />
    </MemoryRouter>
  )
}

test('splits the owner\'s posts into Active and Resolved sections', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    { id: 'p1', type: 'missing', species: 'cat', status: 'active', post_photos: [] },
    { id: 'p2', type: 'found', species: 'dog', status: 'resolved', post_photos: [] },
  ])
  renderDashboard()

  expect(await screen.findByText('Active')).toBeInTheDocument()
  expect(screen.getByText('Resolved')).toBeInTheDocument()
  expect(screen.getByText(/Missing: cat/)).toBeInTheDocument()
  expect(screen.getByText(/Found: dog/)).toBeInTheDocument()
  expect(postsApi.listPostsByOwner).toHaveBeenCalledWith(expect.anything(), 'owner-1')
})

test('omits a section entirely when the owner has no posts in that status', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    { id: 'p1', type: 'missing', species: 'cat', status: 'active', post_photos: [] },
  ])
  renderDashboard()

  expect(await screen.findByText('Active')).toBeInTheDocument()
  expect(screen.queryByText('Resolved')).not.toBeInTheDocument()
})

test('shows a friendly empty state pointing to Report a pet when the owner has no posts at all', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([])
  renderDashboard()

  expect(await screen.findByText(/haven.t posted anything yet/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Report a missing or found pet' })).toHaveAttribute('href', '/post/new')
})

test('redirects to login (with a redirect-back state) once auth has resolved and there is no user', async () => {
  useAuth.mockReturnValue({ user: null, loading: false })
  renderDashboard()

  await waitFor(() =>
    expect(mockNavigate).toHaveBeenCalledWith('/login', { state: { from: '/my-posts' } })
  )
  expect(postsApi.listPostsByOwner).not.toHaveBeenCalled()
})

test('does not redirect while the initial auth session check is still in flight', async () => {
  useAuth.mockReturnValue({ user: null, loading: true })
  renderDashboard()

  expect(mockNavigate).not.toHaveBeenCalled()
  expect(postsApi.listPostsByOwner).not.toHaveBeenCalled()
})

test('shows an error message when the posts fail to load', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockRejectedValueOnce(new Error('Network error'))
  renderDashboard()

  expect(await screen.findByRole('alert')).toHaveTextContent('Network error')
})
