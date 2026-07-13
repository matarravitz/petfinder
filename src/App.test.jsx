import { render, screen } from '@testing-library/react'
import App from './App.jsx'

vi.mock('./lib/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}))
vi.mock('./features/posts/postsApi.js', () => ({ listPosts: vi.fn(() => Promise.resolve([])) }))
vi.mock('./lib/geolocation.js', () => ({ getUserLocation: vi.fn(() => Promise.reject(new Error('no geo'))) }))

test('renders the home page at the root route', async () => {
  render(<App />)
  expect(
    await screen.findByText('Reunite lost pets with the people looking for them')
  ).toBeInTheDocument()
})
