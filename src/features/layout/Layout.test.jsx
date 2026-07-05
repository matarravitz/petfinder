import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import Layout from './Layout.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: vi.fn() }))

test('renders the app header and its children', () => {
  useAuth.mockReturnValue({ user: null, signOut: vi.fn() })

  render(
    <MemoryRouter>
      <Layout>
        <p>page content</p>
      </Layout>
    </MemoryRouter>
  )
  expect(screen.getByRole('banner')).toHaveTextContent('PetFinder')
  expect(screen.getByText('page content')).toBeInTheDocument()
})

test('shows log in and sign up links when logged out', () => {
  useAuth.mockReturnValue({ user: null, signOut: vi.fn() })

  render(
    <MemoryRouter>
      <Layout>
        <p>page content</p>
      </Layout>
    </MemoryRouter>
  )

  expect(screen.getByRole('link', { name: 'Browse' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('link', { name: 'Report a pet' })).toHaveAttribute('href', '/post/new')
  expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup')
  expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
})

test('shows a log out control instead of log in/sign up when a user is present', async () => {
  const signOut = vi.fn()
  useAuth.mockReturnValue({ user: { id: 'user-1' }, signOut })

  render(
    <MemoryRouter>
      <Layout>
        <p>page content</p>
      </Layout>
    </MemoryRouter>
  )

  expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument()

  const logoutButton = screen.getByRole('button', { name: 'Log out' })
  await userEvent.click(logoutButton)
  expect(signOut).toHaveBeenCalled()
})
