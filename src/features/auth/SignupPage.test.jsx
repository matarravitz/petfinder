import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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

async function fillForm({ displayName = 'Dana', email = 'dana@example.com', password = 'hunter2222', confirmPassword = password } = {}) {
  await userEvent.type(screen.getByLabelText('Display name'), displayName)
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.type(screen.getByLabelText('Confirm password'), confirmPassword)
}

test('submits display name, email, and password to signUp when both password fields match', async () => {
  const signUp = vi.fn(() => Promise.resolve())
  useAuth.mockReturnValue({ signUp })
  renderPage()

  await fillForm()
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

  await waitFor(() =>
    expect(signUp).toHaveBeenCalledWith('dana@example.com', 'hunter2222', 'Dana')
  )
})

test('shows an error and does not call signUp when passwords do not match', async () => {
  const signUp = vi.fn(() => Promise.resolve())
  useAuth.mockReturnValue({ signUp })
  renderPage()

  await fillForm({ confirmPassword: 'somethingElse1' })
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match.')
  expect(signUp).not.toHaveBeenCalled()
})

test('shows an error message when sign up fails', async () => {
  const signUp = vi.fn(() => Promise.reject(new Error('Email already registered')))
  useAuth.mockReturnValue({ signUp })
  renderPage()

  await fillForm()
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Email already registered')
})

test('disables the submit button and shows a loading label while submitting', async () => {
  let resolveSignUp
  const signUp = vi.fn(() => new Promise((resolve) => { resolveSignUp = resolve }))
  useAuth.mockReturnValue({ signUp })
  renderPage()

  await fillForm()
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

  const submitButton = screen.getByRole('button', { name: 'Creating account…' })
  expect(submitButton).toBeDisabled()

  resolveSignUp()
  await waitFor(() => expect(signUp).toHaveBeenCalled())
})

test('both password fields are hidden by default and toggle together', async () => {
  useAuth.mockReturnValue({ signUp: vi.fn() })
  renderPage()

  const passwordInput = screen.getByLabelText('Password')
  const confirmInput = screen.getByLabelText('Confirm password')
  expect(passwordInput).toHaveAttribute('type', 'password')
  expect(confirmInput).toHaveAttribute('type', 'password')

  const [showToggle] = screen.getAllByRole('button', { name: 'Show password' })
  await userEvent.click(showToggle)

  expect(passwordInput).toHaveAttribute('type', 'text')
  expect(confirmInput).toHaveAttribute('type', 'text')
})

test('password fields still enforce an 8 character minimum', () => {
  useAuth.mockReturnValue({ signUp: vi.fn() })
  renderPage()

  expect(screen.getByLabelText('Password')).toHaveAttribute('minLength', '8')
  expect(screen.getByLabelText('Confirm password')).toHaveAttribute('minLength', '8')
})

test('links to the login page', () => {
  useAuth.mockReturnValue({ signUp: vi.fn() })
  renderPage()

  expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
})

test('redirects back to the page that required login after signing up', async () => {
  const signUp = vi.fn(() => Promise.resolve())
  useAuth.mockReturnValue({ signUp })

  render(
    <MemoryRouter initialEntries={[{ pathname: '/signup', state: { from: '/messages' } }]}>
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/messages" element={<p>Messages page</p>} />
      </Routes>
    </MemoryRouter>
  )

  await fillForm()
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

  expect(await screen.findByText('Messages page')).toBeInTheDocument()
})
