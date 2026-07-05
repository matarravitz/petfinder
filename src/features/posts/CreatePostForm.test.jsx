import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import CreatePostForm from './CreatePostForm.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import * as postsApi from './postsApi.js'

vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: vi.fn() }))
vi.mock('./postsApi.js', () => ({ createPost: vi.fn(() => Promise.resolve({ id: 'p1' })) }))

test('submits a missing-pet post with the entered fields', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await userEvent.selectOptions(screen.getByLabelText('Post type'), 'missing')
  await userEvent.type(screen.getByLabelText('Species'), 'cat')
  await userEvent.type(screen.getByLabelText('Location'), 'Tel Aviv')
  await userEvent.type(screen.getByLabelText('Latitude'), '32.08')
  await userEvent.type(screen.getByLabelText('Longitude'), '34.78')
  await userEvent.type(screen.getByLabelText('Date lost/found'), '2026-07-01')
  await userEvent.click(screen.getByText('Create post'))

  expect(postsApi.createPost).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ owner_id: 'owner-1', type: 'missing', species: 'cat' }),
    []
  )
})
