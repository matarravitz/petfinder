import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { useScrollRestoration } from '../../lib/useScrollRestoration.js'
import './theme.css'

export default function Layout({ children }) {
  const { user, signOut } = useAuth()
  const { pathname } = useLocation()
  useScrollRestoration()

  function navLinkClass(path) {
    return `app-nav-link${pathname === path ? ' active' : ''}`
  }

  return (
    <div>
      <header role="banner" className="app-header">
        <div className="app-header-inner">
          <h1 className="app-title">
            <Link className="app-title-link" to="/">
              PetFinder
            </Link>
          </h1>
          <nav className="app-nav" aria-label="Main">
            <div className="app-nav-primary">
              <Link className={navLinkClass('/browse')} to="/browse">
                Browse
              </Link>
              <Link className={navLinkClass('/post/new')} to="/post/new">
                Report a pet
              </Link>
              {user ? (
                <Link className={navLinkClass('/messages')} to="/messages">
                  Messages
                </Link>
              ) : (
                <Link className={navLinkClass('/messages')} to="/login" state={{ from: '/messages' }}>
                  Messages
                </Link>
              )}
            </div>
            <div className="app-nav-auth">
              {user ? (
                <button type="button" className="app-nav-link" onClick={signOut}>
                  Log out
                </button>
              ) : (
                <>
                  <Link className={navLinkClass('/login')} to="/login">
                    Log in
                  </Link>
                  <Link className="app-nav-cta" to="/signup">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  )
}
