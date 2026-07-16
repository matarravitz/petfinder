import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  deletePost: vi.fn(() => Promise.resolve()),
  deletePosts: vi.fn(() => Promise.resolve()),
  renewPost: vi.fn(() => Promise.resolve()),
  bumpPost: vi.fn(() => Promise.resolve()),
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

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_HOUR = 60 * 60 * 1000

function daysAgo(days) {
  return new Date(Date.now() - days * MS_PER_DAY).toISOString()
}

function hoursAgo(hours) {
  return new Date(Date.now() - hours * MS_PER_HOUR).toISOString()
}

test('splits the owner\'s posts into Active and Resolved sections', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    { id: 'p1', type: 'missing', species: 'cat', status: 'active', post_photos: [], renewed_at: daysAgo(1), bumped_at: daysAgo(1) },
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
    { id: 'p1', type: 'missing', species: 'cat', status: 'active', post_photos: [], renewed_at: daysAgo(1), bumped_at: daysAgo(1) },
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

test('auto-deletes and hides an active post that has already passed its expiry date', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    {
      id: 'expired',
      type: 'missing',
      species: 'cat',
      status: 'active',
      post_photos: [],
      renewed_at: daysAgo(61),
      bumped_at: daysAgo(61),
    },
  ])
  renderDashboard()

  await waitFor(() => expect(postsApi.deletePosts).toHaveBeenCalledWith(expect.anything(), ['expired']))
  expect(postsApi.deletePost).not.toHaveBeenCalled()
  expect(screen.queryByText(/Missing: cat/)).not.toBeInTheDocument()
})

test('sweeps multiple expired active posts in a single batched delete call', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    { id: 'expired-1', type: 'missing', species: 'cat', status: 'active', post_photos: [], renewed_at: daysAgo(61), bumped_at: daysAgo(61) },
    { id: 'expired-2', type: 'found', species: 'dog', status: 'active', post_photos: [], renewed_at: daysAgo(90), bumped_at: daysAgo(90) },
    { id: 'still-active', type: 'missing', species: 'bird', status: 'active', post_photos: [], renewed_at: daysAgo(1), bumped_at: daysAgo(1) },
  ])
  renderDashboard()

  await waitFor(() =>
    expect(postsApi.deletePosts).toHaveBeenCalledWith(expect.anything(), ['expired-1', 'expired-2'])
  )
  expect(postsApi.deletePost).not.toHaveBeenCalled()
  expect(await screen.findByText(/Missing: bird/)).toBeInTheDocument()
})

test('does not fail the whole page when the sweep delete fails', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    {
      id: 'expired',
      type: 'missing',
      species: 'cat',
      status: 'active',
      post_photos: [],
      renewed_at: daysAgo(61),
      bumped_at: daysAgo(61),
    },
  ])
  postsApi.deletePosts.mockRejectedValueOnce(new Error('network error'))
  renderDashboard()

  await waitFor(() => expect(postsApi.deletePosts).toHaveBeenCalled())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByText(/Missing: cat/)).not.toBeInTheDocument()
})

test('does not auto-delete a resolved post even if it was renewed long ago', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    {
      id: 'old-resolved',
      type: 'missing',
      species: 'cat',
      status: 'resolved',
      post_photos: [],
      renewed_at: daysAgo(200),
      bumped_at: daysAgo(200),
    },
  ])
  renderDashboard()

  expect(await screen.findByText(/Missing: cat/)).toBeInTheDocument()
  expect(postsApi.deletePost).not.toHaveBeenCalled()
})

test('shows an expiring-soon notification, and renewing it clears the notification', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    {
      id: 'soon',
      type: 'missing',
      species: 'cat',
      pet_name: 'Milo',
      status: 'active',
      post_photos: [],
      renewed_at: daysAgo(56),
      bumped_at: daysAgo(56),
    },
  ])
  renderDashboard()

  expect(await screen.findByText('Posts expiring soon')).toBeInTheDocument()
  expect(screen.getByText(/Milo will be automatically removed in 4 days/)).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Still looking — keep it up' }))

  expect(postsApi.renewPost).toHaveBeenCalledWith(expect.anything(), 'soon')
  await waitFor(() => expect(screen.queryByText('Posts expiring soon')).not.toBeInTheDocument())
})

test('removing a post from the expiring-soon notification deletes it, after confirming', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    {
      id: 'soon',
      type: 'missing',
      species: 'cat',
      pet_name: 'Milo',
      status: 'active',
      post_photos: [],
      renewed_at: daysAgo(56),
      bumped_at: daysAgo(56),
    },
  ])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderDashboard()

  await screen.findByText('Posts expiring soon')
  await userEvent.click(screen.getByRole('button', { name: 'Remove post' }))

  expect(window.confirm).toHaveBeenCalledWith('Remove this post? This cannot be undone.')
  expect(postsApi.deletePost).toHaveBeenCalledWith(expect.anything(), 'soon')
  window.confirm.mockRestore()
})

test('a post well within its window shows no expiring-soon notification', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    {
      id: 'fresh',
      type: 'missing',
      species: 'cat',
      status: 'active',
      post_photos: [],
      renewed_at: daysAgo(1),
      bumped_at: daysAgo(1),
    },
  ])
  renderDashboard()

  await screen.findByText(/Missing: cat/)
  expect(screen.queryByText('Posts expiring soon')).not.toBeInTheDocument()
})

test('each active post has its own Remove option on the dashboard card', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    {
      id: 'p1',
      type: 'missing',
      species: 'cat',
      status: 'active',
      post_photos: [],
      renewed_at: daysAgo(1),
      bumped_at: daysAgo(1),
    },
  ])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderDashboard()

  await screen.findByText(/Missing: cat/)
  await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

  expect(window.confirm).toHaveBeenCalledWith('Remove this post? This cannot be undone.')
  expect(postsApi.deletePost).toHaveBeenCalledWith(expect.anything(), 'p1')
  await waitFor(() => expect(screen.queryByText(/Missing: cat/)).not.toBeInTheDocument())
  window.confirm.mockRestore()
})

test('declining the remove confirmation on a dashboard card leaves the post in place', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    {
      id: 'p1',
      type: 'missing',
      species: 'cat',
      status: 'active',
      post_photos: [],
      renewed_at: daysAgo(1),
      bumped_at: daysAgo(1),
    },
  ])
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  renderDashboard()

  await screen.findByText(/Missing: cat/)
  await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

  expect(postsApi.deletePost).not.toHaveBeenCalled()
  expect(screen.getByText(/Missing: cat/)).toBeInTheDocument()
  window.confirm.mockRestore()
})

test('bumping an eligible post calls bumpPost and then disables further bumping until the cooldown passes', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    {
      id: 'p1',
      type: 'missing',
      species: 'cat',
      status: 'active',
      post_photos: [],
      renewed_at: daysAgo(1),
      bumped_at: daysAgo(2),
    },
  ])
  renderDashboard()

  await screen.findByText(/Missing: cat/)
  const bumpButton = screen.getByRole('button', { name: /bump this post to the top/i })
  expect(bumpButton).not.toBeDisabled()

  await userEvent.click(bumpButton)

  expect(postsApi.bumpPost).toHaveBeenCalledWith(expect.anything(), 'p1')
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /you can bump this post again/i })).toBeDisabled()
  )
})

test('bump button starts disabled when the post was already bumped within the last 24h', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    {
      id: 'p1',
      type: 'missing',
      species: 'cat',
      status: 'active',
      post_photos: [],
      renewed_at: daysAgo(1),
      bumped_at: hoursAgo(1),
    },
  ])
  renderDashboard()

  await screen.findByText(/Missing: cat/)
  expect(screen.getByRole('button', { name: /you can bump this post again/i })).toBeDisabled()
  expect(postsApi.bumpPost).not.toHaveBeenCalled()
})

test('shows an inline error and does not update the post in state when renew fails', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    {
      id: 'soon',
      type: 'missing',
      species: 'cat',
      pet_name: 'Milo',
      status: 'active',
      post_photos: [],
      renewed_at: daysAgo(56),
      bumped_at: daysAgo(56),
    },
  ])
  postsApi.renewPost.mockRejectedValueOnce(new Error('network error'))
  renderDashboard()

  await screen.findByText('Posts expiring soon')
  await userEvent.click(screen.getByRole('button', { name: 'Still looking — keep it up' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('network error')
  expect(screen.getByText('Posts expiring soon')).toBeInTheDocument()
})

test('shows an inline error when remove fails, after confirming', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    {
      id: 'p1',
      type: 'missing',
      species: 'cat',
      status: 'active',
      post_photos: [],
      renewed_at: daysAgo(1),
      bumped_at: daysAgo(1),
    },
  ])
  postsApi.deletePost.mockRejectedValueOnce(new Error('network error'))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderDashboard()

  await screen.findByText(/Missing: cat/)
  await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('network error')
  expect(screen.getByText(/Missing: cat/)).toBeInTheDocument()
  window.confirm.mockRestore()
})

test('shows an inline error when bump fails', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' }, loading: false })
  postsApi.listPostsByOwner.mockResolvedValueOnce([
    {
      id: 'p1',
      type: 'missing',
      species: 'cat',
      status: 'active',
      post_photos: [],
      renewed_at: daysAgo(1),
      bumped_at: daysAgo(2),
    },
  ])
  postsApi.bumpPost.mockRejectedValueOnce(new Error('network error'))
  renderDashboard()

  await screen.findByText(/Missing: cat/)
  const bumpButton = screen.getByRole('button', { name: /bump this post to the top/i })
  await userEvent.click(bumpButton)

  expect(await screen.findByRole('alert')).toHaveTextContent('network error')
  expect(screen.getByRole('button', { name: /bump this post to the top/i })).not.toBeDisabled()
})
