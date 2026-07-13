import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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

test('shows an error message when posts fail to load', async () => {
  postsApi.listPosts.mockRejectedValueOnce(new Error('Network error'))

  render(
    <MemoryRouter>
      <BrowseFeedPage />
    </MemoryRouter>
  )

  expect(await screen.findByRole('alert')).toHaveTextContent('Network error')
})
