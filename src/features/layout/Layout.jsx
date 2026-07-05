import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import './theme.css'

export default function Layout({ children }) {
  const { user, signOut } = useAuth()

  return (
    <div>
      <header role="banner" className="app-header">
        <h1 className="app-title">PetFinder</h1>
        <p className="app-tagline">Every lost pet has someone looking for them.</p>
        <nav className="app-nav" aria-label="Main">
          <Link className="app-nav-link" to="/">
            Browse
          </Link>
          <Link className="app-nav-link" to="/post/new">
            Report a pet
          </Link>
          {user ? (
            <button type="button" className="app-nav-button" onClick={signOut}>
              Log out
            </button>
          ) : (
            <>
              <Link className="app-nav-link" to="/login">
                Log in
              </Link>
              <Link className="app-nav-link" to="/signup">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </header>
      <main className="app-main">{children}</main>
    </div>
  )
}
