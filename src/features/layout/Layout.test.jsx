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

test('the PetFinder title always links back to home', () => {
  useAuth.mockReturnValue({ user: null, signOut: vi.fn() })

  render(
    <MemoryRouter>
      <Layout>
        <p>page content</p>
      </Layout>
    </MemoryRouter>
  )

  expect(screen.getByRole('link', { name: 'PetFinder' })).toHaveAttribute('href', '/')
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

  expect(screen.getByRole('link', { name: 'Browse' })).toHaveAttribute('href', '/browse')
  expect(screen.getByRole('link', { name: 'Report a pet' })).toHaveAttribute('href', '/post/new')
  expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup')
  expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
})

test('has no tagline, and keeps auth links visually separate from primary nav', () => {
  useAuth.mockReturnValue({ user: null, signOut: vi.fn() })

  render(
    <MemoryRouter>
      <Layout>
        <p>page content</p>
      </Layout>
    </MemoryRouter>
  )

  expect(screen.queryByText('Every lost pet has someone looking for them.')).not.toBeInTheDocument()

  const browseLink = screen.getByRole('link', { name: 'Browse' })
  const loginLink = screen.getByRole('link', { name: 'Log in' })
  expect(browseLink.closest('.app-nav-primary')).not.toBeNull()
  expect(loginLink.closest('.app-nav-auth')).not.toBeNull()
})

test('marks the current page active in the nav', () => {
  useAuth.mockReturnValue({ user: null, signOut: vi.fn() })

  render(
    <MemoryRouter initialEntries={['/browse']}>
      <Layout>
        <p>page content</p>
      </Layout>
    </MemoryRouter>
  )

  expect(screen.getByRole('link', { name: 'Browse' })).toHaveClass('active')
  expect(screen.getByRole('link', { name: 'Report a pet' })).not.toHaveClass('active')
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

test('shows a Messages nav link only when logged in', () => {
  useAuth.mockReturnValue({ user: null, signOut: vi.fn() })
  render(
    <MemoryRouter>
      <Layout>
        <p>page content</p>
      </Layout>
    </MemoryRouter>
  )
  expect(screen.queryByRole('link', { name: 'Messages' })).not.toBeInTheDocument()
})

test('shows a Messages nav link when logged in', () => {
  useAuth.mockReturnValue({ user: { id: 'user-1' }, signOut: vi.fn() })
  render(
    <MemoryRouter>
      <Layout>
        <p>page content</p>
      </Layout>
    </MemoryRouter>
  )
  expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute('href', '/messages')
})
