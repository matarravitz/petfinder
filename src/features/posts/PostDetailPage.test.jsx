import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, createMemoryRouter, RouterProvider } from 'react-router-dom'
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
  listCandidatePostsForMatching: vi.fn(() => Promise.resolve([])),
}))
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: vi.fn() }))

beforeEach(() => {
  // Mock call history (e.g. postsApi.listCandidatePostsForMatching.mock.calls)
  // otherwise leaks across tests in this file — vitest doesn't clear it
  // automatically, and several tests below assert on call counts
  // (toHaveBeenCalledTimes, not.toHaveBeenCalled). This clears recorded
  // calls/results only, not the default mock implementations set above.
  vi.clearAllMocks()
})

function renderAtPost(id) {
  return render(
    <MemoryRouter initialEntries={[`/post/${id}`]}>
      <Routes>
        <Route path="/post/:id" element={<PostDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

test('owner sees a neutral status-update prompt for a missing pet and marking it found resolves it', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  renderAtPost('p1')

  await waitFor(() => screen.getByText(/Missing: cat/))
  expect(screen.getByText('Is this post still active?')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Mark as found' }))

  expect(postsApi.resolvePost).toHaveBeenCalledWith(expect.anything(), 'p1')
})

test('shows an inline error and keeps the post active when resolve fails', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  postsApi.resolvePost.mockRejectedValueOnce(new Error('network error'))
  renderAtPost('p1')

  await waitFor(() => screen.getByText(/Missing: cat/))
  await userEvent.click(screen.getByRole('button', { name: 'Mark as found' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('network error')
  expect(screen.getByText('Is this post still active?')).toBeInTheDocument()
})

test('status-update prompt uses "reunited" wording for a found-pet post', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  postsApi.getPost.mockResolvedValueOnce({
    id: 'p9',
    owner_id: 'owner-1',
    type: 'found',
    species: 'dog',
    location_text: 'Tel Aviv',
    post_photos: [],
  })
  renderAtPost('p9')

  expect(await screen.findByText('Is this post still active?')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Mark as reunited' })).toBeInTheDocument()
})

test('non-owner does not see a status-update prompt', async () => {
  useAuth.mockReturnValue({ user: { id: 'someone-else' } })
  renderAtPost('p1')

  await waitFor(() => screen.getByText(/Missing: cat/))
  expect(screen.queryByText('Is this post still active?')).not.toBeInTheDocument()
})

test('there is no remove/delete option on the post detail page (moved to My Posts dashboard)', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  renderAtPost('p1')

  await waitFor(() => screen.getByText(/Missing: cat/))
  expect(screen.queryByRole('button', { name: 'Remove post' })).not.toBeInTheDocument()
})

test('the status-update prompt is not shown once a post is already resolved', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  postsApi.getPost.mockResolvedValueOnce({
    id: 'p10',
    owner_id: 'owner-1',
    type: 'missing',
    species: 'cat',
    location_text: 'Tel Aviv',
    post_photos: [],
    status: 'resolved',
  })
  renderAtPost('p10')

  await waitFor(() => screen.getByText(/Missing: cat/))
  expect(screen.queryByText('Is this post still active?')).not.toBeInTheDocument()
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

const activeOwnedPost = {
  id: 'p10',
  owner_id: 'owner-1',
  type: 'missing',
  species: 'cat',
  location_text: 'Tel Aviv',
  location_lat: 32.08,
  location_lng: 34.78,
  date_lost_or_found: '2026-07-01',
  status: 'active',
  photo_embedding: null,
  post_photos: [],
}

function buildCandidatePost(overrides = {}) {
  return {
    id: 'candidate-1',
    type: 'found',
    species: 'cat',
    location_lat: 32.08,
    location_lng: 34.78,
    date_lost_or_found: '2026-07-01',
    photo_embedding: null,
    post_photos: [],
    ...overrides,
  }
}

test('owner sees a possible match found for their active post', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  postsApi.getPost.mockResolvedValueOnce(activeOwnedPost)
  postsApi.listCandidatePostsForMatching.mockResolvedValueOnce([buildCandidatePost()])
  renderAtPost('p10')

  expect(await screen.findByText('Possible Matches')).toBeInTheDocument()
  expect(await screen.findByText('Strong match')).toBeInTheDocument()
  expect(postsApi.listCandidatePostsForMatching).toHaveBeenCalledWith(expect.anything(), {
    type: 'found',
    species: 'cat',
    excludePostId: 'p10',
  })
})

test('non-owner never sees the Possible Matches section', async () => {
  useAuth.mockReturnValue({ user: { id: 'someone-else' } })
  postsApi.getPost.mockResolvedValueOnce(activeOwnedPost)
  renderAtPost('p10')

  await waitFor(() => screen.getByText(/Missing: cat/))
  expect(screen.queryByText('Possible Matches')).not.toBeInTheDocument()
  expect(postsApi.listCandidatePostsForMatching).not.toHaveBeenCalled()
})

test('resolved post never shows the Possible Matches section, even for the owner', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  postsApi.getPost.mockResolvedValueOnce({ ...activeOwnedPost, status: 'resolved' })
  renderAtPost('p10')

  await waitFor(() => screen.getByText(/Missing: cat/))
  expect(screen.queryByText('Possible Matches')).not.toBeInTheDocument()
  expect(postsApi.listCandidatePostsForMatching).not.toHaveBeenCalled()
})

test('shows an empty state when no candidates score high enough to be a match', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  postsApi.getPost.mockResolvedValueOnce(activeOwnedPost)
  postsApi.listCandidatePostsForMatching.mockResolvedValueOnce([
    buildCandidatePost({ location_lat: 60, location_lng: 60, date_lost_or_found: '2020-01-01' }),
  ])
  renderAtPost('p10')

  expect(await screen.findByText('No possible matches found yet.')).toBeInTheDocument()
})

test('the Check for new matches button re-runs the match query', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  postsApi.getPost.mockResolvedValueOnce(activeOwnedPost)
  postsApi.listCandidatePostsForMatching.mockResolvedValue([])
  renderAtPost('p10')

  await screen.findByText('No possible matches found yet.')
  await userEvent.click(screen.getByRole('button', { name: 'Check for new matches' }))

  await waitFor(() => expect(postsApi.listCandidatePostsForMatching).toHaveBeenCalledTimes(2))
})

// Regression test for: App.jsx routes /post/:id to a single <PostDetailPage />
// element, so React Router reuses the SAME component instance across in-app
// navigation between two posts (no remount) — a plain two-call render() setup
// would trivially reset React state and wouldn't reproduce the bug. This uses
// createMemoryRouter/RouterProvider (both real, unmocked react-router-dom
// exports — only useNavigate is mocked above) so router.navigate() drives the
// same mounted <PostDetailPage /> from /post/pA to /post/pB, exactly like a
// user clicking a <Link> to a different post would.
test('resets stale match state when navigating in-app to a different owned post', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })

  const postA = { ...activeOwnedPost, id: 'pA' }
  const postB = { ...activeOwnedPost, id: 'pB' }
  postsApi.getPost.mockResolvedValueOnce(postA).mockResolvedValueOnce(postB)
  postsApi.listCandidatePostsForMatching
    .mockResolvedValueOnce([buildCandidatePost({ id: 'match-a', location_text: 'Candidate A spot' })])
    .mockResolvedValueOnce([buildCandidatePost({ id: 'match-b', location_text: 'Candidate B spot' })])

  const router = createMemoryRouter([{ path: '/post/:id', element: <PostDetailPage /> }], {
    initialEntries: ['/post/pA'],
  })
  render(<RouterProvider router={router} />)

  expect(await screen.findByText('Candidate A spot', { exact: false })).toBeInTheDocument()
  expect(postsApi.listCandidatePostsForMatching).toHaveBeenCalledTimes(1)
  expect(postsApi.listCandidatePostsForMatching).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ excludePostId: 'pA' })
  )

  // Wrapped in act() so React fully flushes the reset (post/matches state set
  // back to their initial values) before the getPost(pB) promise resolves —
  // without this, the reset's setState calls and the getPost(pB).then(setPost)
  // callback can land in separate, out-of-order commits and flakily leave
  // matchesChecked stuck at its post-A value for a render or two.
  await act(async () => {
    await router.navigate('/post/pB')
  })

  // Post B's data must replace post A's, not render alongside/under it — the
  // stale match card from post A must be gone, and post B's own match (from
  // a fresh listCandidatePostsForMatching call keyed on post B) must appear.
  await waitFor(() => expect(screen.queryByText('Candidate A spot', { exact: false })).not.toBeInTheDocument())
  expect(await screen.findByText('Candidate B spot', { exact: false })).toBeInTheDocument()
  expect(postsApi.listCandidatePostsForMatching).toHaveBeenCalledTimes(2)
  expect(postsApi.listCandidatePostsForMatching).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ excludePostId: 'pB' })
  )
})
