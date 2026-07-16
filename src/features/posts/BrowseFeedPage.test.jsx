import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'
import BrowseFeedPage from './BrowseFeedPage.jsx'
import * as postsApi from './postsApi.js'
import * as geolocation from '../../lib/geolocation.js'

vi.mock('./postsApi.js', () => ({
  listPosts: vi.fn(() =>
    Promise.resolve([
      { id: 'p1', type: 'missing', species: 'cat', status: 'active', location_lat: 32.08, location_lng: 34.78, date_lost_or_found: '2026-07-01' },
    ])
  ),
}))
vi.mock('../../lib/geolocation.js', () => ({
  getUserLocation: vi.fn(() => Promise.resolve({ lat: 32.08, lng: 34.78 })),
}))

test('loads posts and renders them in the feed', async () => {
  render(
    <MemoryRouter>
      <BrowseFeedPage />
    </MemoryRouter>
  )

  await waitFor(() => expect(postsApi.listPosts).toHaveBeenCalled())
  expect(await screen.findByText(/Missing: cat/)).toBeInTheDocument()
})

test('renders a radius filter input defaulted to 50km', async () => {
  render(
    <MemoryRouter>
      <BrowseFeedPage />
    </MemoryRouter>
  )

  await waitFor(() => expect(postsApi.listPosts).toHaveBeenCalled())
  expect(screen.getByLabelText('Radius')).toHaveValue('50')
})

test('the "show all" checkbox bypasses the radius filter and disables the radius input', async () => {
  postsApi.listPosts.mockResolvedValueOnce([
    {
      id: 'far',
      type: 'missing',
      species: 'cat',
      status: 'active',
      location_lat: 40,
      location_lng: 40,
      date_lost_or_found: '2026-07-01',
    },
  ])

  render(
    <MemoryRouter>
      <BrowseFeedPage />
    </MemoryRouter>
  )

  await waitFor(() => expect(postsApi.listPosts).toHaveBeenCalled())
  expect(screen.queryByText(/Missing: cat/)).not.toBeInTheDocument()
  expect(await screen.findByText(/No pets match these filters/)).toBeInTheDocument()

  await userEvent.click(screen.getByLabelText('Show all pets, regardless of distance'))

  expect(await screen.findByText(/Missing: cat/)).toBeInTheDocument()
  expect(screen.getByLabelText('Radius')).toBeDisabled()
})

test('the type segmented control filters between missing and found posts', async () => {
  postsApi.listPosts.mockResolvedValueOnce([
    { id: 'm1', type: 'missing', species: 'cat', status: 'active', location_lat: 32.08, location_lng: 34.78, date_lost_or_found: '2026-07-01' },
    { id: 'f1', type: 'found', species: 'dog', status: 'active', location_lat: 32.08, location_lng: 34.78, date_lost_or_found: '2026-07-01' },
  ])

  render(
    <MemoryRouter>
      <BrowseFeedPage />
    </MemoryRouter>
  )

  await waitFor(() => expect(postsApi.listPosts).toHaveBeenCalled())
  expect(await screen.findByText(/Missing: cat/)).toBeInTheDocument()
  expect(screen.getByText(/Found: dog/)).toBeInTheDocument()

  await userEvent.click(screen.getByRole('radio', { name: 'Found' }))

  expect(screen.queryByText(/Missing: cat/)).not.toBeInTheDocument()
  expect(screen.getByText(/Found: dog/)).toBeInTheDocument()
})

// BrowseFeedPage unmounts when navigating to a post's detail page and mounts
// fresh again on return (different route = different element) — a plain
// two-call render() setup would trivially reset filter state and wouldn't
// reproduce the bug. This uses createMemoryRouter/RouterProvider so
// router.navigate() drives real in-app navigation away and back, exactly
// like a user clicking a post card and then the browser back button.
test('filters set before navigating to a post are still applied after navigating back', async () => {
  // This file has no global mock-clearing configured (see CLAUDE.md's testing
  // notes on this), so listPosts' call count otherwise leaks in from earlier
  // tests in this file — clear it so the call-count assertions below measure
  // only this test's renders.
  postsApi.listPosts.mockClear()
  postsApi.listPosts.mockResolvedValue([
    { id: 'm1', type: 'missing', species: 'cat', status: 'active', location_lat: 32.08, location_lng: 34.78, date_lost_or_found: '2026-07-01' },
    { id: 'f1', type: 'found', species: 'dog', status: 'active', location_lat: 32.08, location_lng: 34.78, date_lost_or_found: '2026-07-01' },
  ])

  const router = createMemoryRouter(
    [
      { path: '/browse', element: <BrowseFeedPage /> },
      { path: '/post/:id', element: <p>Post detail placeholder</p> },
    ],
    { initialEntries: ['/browse'] }
  )
  render(<RouterProvider router={router} />)

  await waitFor(() => expect(postsApi.listPosts).toHaveBeenCalledTimes(1))
  await userEvent.click(screen.getByRole('radio', { name: 'Found' }))
  expect(screen.queryByText(/Missing: cat/)).not.toBeInTheDocument()
  expect(screen.getByText(/Found: dog/)).toBeInTheDocument()

  await act(async () => {
    await router.navigate('/post/f1')
  })
  expect(await screen.findByText('Post detail placeholder')).toBeInTheDocument()

  await act(async () => {
    router.navigate(-1)
  })

  await waitFor(() => expect(postsApi.listPosts).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('radio', { name: 'Found' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.queryByText(/Missing: cat/)).not.toBeInTheDocument()
  expect(screen.getByText(/Found: dog/)).toBeInTheDocument()
})

test('shows an error message when posts fail to load', async () => {
  postsApi.listPosts.mockRejectedValueOnce(new Error('Network error'))

  render(
    <MemoryRouter>
      <BrowseFeedPage />
    </MemoryRouter>
  )

  expect(await screen.findByRole('alert')).toHaveTextContent('Network error')
})
