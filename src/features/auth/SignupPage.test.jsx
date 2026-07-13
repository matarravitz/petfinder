import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import SignupPage from './SignupPage.jsx'
import { useAuth } from './AuthContext.jsx'

vi.mock('./AuthContext.jsx', () => ({ useAuth: vi.fn() }))

function renderPage() {
  return render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>
  )
}

test('submits display name, email, and password to signUp', async () => {
  const signUp = vi.fn(() => Promise.resolve())
  useAuth.mockReturnValue({ signUp })
  renderPage()

  await userEvent.type(screen.getByLabelText('Display name'), 'Dana')
  await userEvent.type(screen.getByLabelText('Email'), 'dana@example.com')
  await userEvent.type(screen.getByLabelText('Password'), 'hunter2222')
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

  await waitFor(() =>
    expect(signUp).toHaveBeenCalledWith('dana@example.com', 'hunter2222', 'Dana')
  )
})

test('shows an error message when sign up fails', async () => {
  const signUp = vi.fn(() => Promise.reject(new Error('Email already registered')))
  useAuth.mockReturnValue({ signUp })
  renderPage()

  await userEvent.type(screen.getByLabelText('Display name'), 'Dana')
  await userEvent.type(screen.getByLabelText('Email'), 'dana@example.com')
  await userEvent.type(screen.getByLabelText('Password'), 'hunter2222')
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Email already registered')
})

test('disables the submit button and shows a loading label while submitting', async () => {
  let resolveSignUp
  const signUp = vi.fn(() => new Promise((resolve) => { resolveSignUp = resolve }))
  useAuth.mockReturnValue({ signUp })
  renderPage()

  await userEvent.type(screen.getByLabelText('Display name'), 'Dana')
  await userEvent.type(screen.getByLabelText('Email'), 'dana@example.com')
  await userEvent.type(screen.getByLabelText('Password'), 'hunter2222')
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

  const submitButton = screen.getByRole('button', { name: 'Creating account…' })
  expect(submitButton).toBeDisabled()

  resolveSignUp()
  await waitFor(() => expect(signUp).toHaveBeenCalled())
})

test('password is hidden by default and can be toggled visible', async () => {
  useAuth.mockReturnValue({ signUp: vi.fn() })
  renderPage()

  const passwordInput = screen.getByLabelText('Password')
  expect(passwordInput).toHaveAttribute('type', 'password')

  await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
  expect(passwordInput).toHaveAttribute('type', 'text')
})

test('password field still enforces an 8 character minimum', () => {
  useAuth.mockReturnValue({ signUp: vi.fn() })
  renderPage()

  expect(screen.getByLabelText('Password')).toHaveAttribute('minLength', '8')
})

test('links to the login page', () => {
  useAuth.mockReturnValue({ signUp: vi.fn() })
  renderPage()

  expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
})
