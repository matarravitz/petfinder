import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import LoginPage from './LoginPage.jsx'
import { useAuth } from './AuthContext.jsx'

vi.mock('./AuthContext.jsx', () => ({ useAuth: vi.fn() }))

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  )
}

test('submits email and password to signIn', async () => {
  const signIn = vi.fn(() => Promise.resolve())
  useAuth.mockReturnValue({ signIn })
  renderPage()

  await userEvent.type(screen.getByLabelText('Email'), 'dana@example.com')
  await userEvent.type(screen.getByLabelText('Password'), 'hunter22')
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

  await waitFor(() => expect(signIn).toHaveBeenCalledWith('dana@example.com', 'hunter22'))
})

test('shows an error message when sign in fails', async () => {
  const signIn = vi.fn(() => Promise.reject(new Error('Invalid credentials')))
  useAuth.mockReturnValue({ signIn })
  renderPage()

  await userEvent.type(screen.getByLabelText('Email'), 'dana@example.com')
  await userEvent.type(screen.getByLabelText('Password'), 'wrong')
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials')
})

test('disables the submit button and shows a loading label while submitting', async () => {
  let resolveSignIn
  const signIn = vi.fn(() => new Promise((resolve) => { resolveSignIn = resolve }))
  useAuth.mockReturnValue({ signIn })
  renderPage()

  await userEvent.type(screen.getByLabelText('Email'), 'dana@example.com')
  await userEvent.type(screen.getByLabelText('Password'), 'hunter22')
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

  const submitButton = screen.getByRole('button', { name: 'Logging in…' })
  expect(submitButton).toBeDisabled()

  resolveSignIn()
  await waitFor(() => expect(signIn).toHaveBeenCalled())
})

test('password is hidden by default and can be toggled visible', async () => {
  useAuth.mockReturnValue({ signIn: vi.fn() })
  renderPage()

  const passwordInput = screen.getByLabelText('Password')
  expect(passwordInput).toHaveAttribute('type', 'password')

  await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
  expect(passwordInput).toHaveAttribute('type', 'text')

  await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
  expect(passwordInput).toHaveAttribute('type', 'password')
})

test('links to the signup page', () => {
  useAuth.mockReturnValue({ signIn: vi.fn() })
  renderPage()

  expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup')
})
