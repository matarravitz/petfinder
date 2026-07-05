import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import PostDetailPage from './PostDetailPage.jsx'
import * as postsApi from './postsApi.js'
import { useAuth } from '../auth/AuthContext.jsx'

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

test('shows an error message when the post fails to load', async () => {
  useAuth.mockReturnValue({ user: null })
  postsApi.getPost.mockRejectedValueOnce(new Error('Post not found'))
  renderAtPost('missing-post')

  expect(await screen.findByRole('alert')).toHaveTextContent('Post not found')
})
