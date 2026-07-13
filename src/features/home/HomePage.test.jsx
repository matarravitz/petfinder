import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import HomePage from './HomePage.jsx'
import * as postsApi from '../posts/postsApi.js'

vi.mock('../../lib/supabaseClient.js', () => ({ supabase: {} }))
vi.mock('../posts/postsApi.js', () => ({ listPosts: vi.fn(() => Promise.resolve([])) }))

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  )
}

test('explains the product, links to browse and report-a-pet, and shows how it works', async () => {
  renderHome()

  expect(
    screen.getByRole('heading', { name: 'Reunite lost pets with the people looking for them' })
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /browse missing & found pets/i })).toHaveAttribute(
    'href',
    '/browse'
  )
  expect(screen.getAllByRole('link', { name: 'Report a pet' })[0]).toHaveAttribute(
    'href',
    '/post/new'
  )
  expect(screen.getByText('Post')).toBeInTheDocument()
  expect(screen.getByText('Search')).toBeInTheDocument()
  expect(screen.getByText('Reunite')).toBeInTheDocument()

  await screen.findByText(/No pets posted yet/)
})

test('shows a preview of recently posted pets when there are any', async () => {
  postsApi.listPosts.mockResolvedValueOnce([
    {
      id: 'p1',
      type: 'missing',
      species: 'cat',
      status: 'active',
      location_text: 'Tel Aviv',
      post_photos: [],
    },
  ])

  renderHome()

  expect(await screen.findByText(/Missing: cat/)).toBeInTheDocument()
})

test('shows an empty state when there are no active posts yet', async () => {
  renderHome()

  expect(await screen.findByText(/No pets posted yet/)).toBeInTheDocument()
})

test('shows a reunited-count stat when there are resolved posts', async () => {
  postsApi.listPosts.mockResolvedValueOnce([
    { id: 'p1', type: 'missing', species: 'cat', status: 'active', location_text: 'Tel Aviv', post_photos: [] },
    { id: 'p2', type: 'missing', species: 'dog', status: 'resolved', location_text: 'Tel Aviv', post_photos: [] },
    { id: 'p3', type: 'found', species: 'rabbit', status: 'resolved', location_text: 'Tel Aviv', post_photos: [] },
  ])

  renderHome()

  expect(await screen.findByText(/2 pets have been reunited/)).toBeInTheDocument()
})

test('does not show the reunited-count stat when nothing has been resolved yet', async () => {
  renderHome()

  await screen.findByText(/No pets posted yet/)
  expect(screen.queryByText(/pets? have been reunited|pet has been reunited/)).not.toBeInTheDocument()
})
