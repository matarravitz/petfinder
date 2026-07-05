import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext.jsx'

vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signUp: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } }, error: null })),
    },
    from: vi.fn(() => ({
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}))

function Probe() {
  const { loading, signUp } = useAuth()
  return (
    <div>
      <span>{loading ? 'loading' : 'ready'}</span>
      <button onClick={() => signUp('a@example.com', 'password123', 'Ada')}>sign up</button>
    </div>
  )
}

test('signUp creates the auth user and a matching profile row', async () => {
  const { supabase } = await import('../../lib/supabaseClient.js')
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  )

  await waitFor(() => screen.getByText('ready'))
  await userEvent.click(screen.getByText('sign up'))

  expect(supabase.auth.signUp).toHaveBeenCalledWith({ email: 'a@example.com', password: 'password123' })
  expect(supabase.from).toHaveBeenCalledWith('profiles')
})
