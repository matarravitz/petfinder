import { render, screen, waitFor } from '@testing-library/react'
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
