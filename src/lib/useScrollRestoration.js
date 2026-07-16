import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

const STORAGE_KEY = 'scroll-positions'
const RESTORE_TIMEOUT_MS = 2000

function readPositions() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
}

function savePosition(key, y) {
  try {
    const positions = readPositions()
    positions[key] = y
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
  } catch {
    // sessionStorage unavailable (private browsing, quota) — restoration just
    // won't happen this session, not worth surfacing an error for.
  }
}

// Restores scroll position when navigating back/forward to a page the user
// already scrolled on (e.g. clicking a post from the browse feed, then going
// back). The browser's own automatic scroll restoration doesn't reliably
// handle this on its own: pages like BrowseFeedPage load their content
// asynchronously after mount, so the page isn't tall enough to reach the old
// scroll position yet at the moment the browser would normally restore it.
export function useScrollRestoration() {
  const location = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    history.scrollRestoration = 'manual'
  }, [])

  // Save this page's scroll position the instant the user clicks a link —
  // in the capture phase, so this runs before React Router's own click
  // handling (and thus before any DOM mutation for the new route). Capturing
  // it any later — even in a useLayoutEffect cleanup on unmount — is
  // unreliable: once the new route's DOM is committed, the browser may have
  // already clamped window.scrollY to fit the new (possibly much shorter,
  // still-loading) page. That clamp happens synchronously as part of the DOM
  // mutation itself, before ANY React effect cleanup gets a chance to run,
  // so by the time a cleanup reads window.scrollY it may already be wrong.
  useEffect(() => {
    function handleClick(event) {
      if (event.target.closest('a')) {
        savePosition(location.key, window.scrollY)
      }
    }
    document.addEventListener('click', handleClick, { capture: true })
    return () => document.removeEventListener('click', handleClick, { capture: true })
  }, [location.key])

  // On arriving via browser back/forward (react-router's "POP" navigation
  // type — not a fresh link click, which should start at the top like a
  // normal page load), restore this entry's saved scroll position once the
  // page has rendered enough content to actually reach it.
  useEffect(() => {
    if (navigationType !== 'POP') return
    const target = readPositions()[location.key]
    if (target == null) return

    let done = false
    let timeoutId

    function attemptScroll() {
      if (done) return
      const maxScrollY = document.documentElement.scrollHeight - window.innerHeight
      if (maxScrollY >= target) {
        window.scrollTo(0, target)
        done = true
        observer.disconnect()
        clearTimeout(timeoutId)
      }
    }

    const observer = new MutationObserver(attemptScroll)
    observer.observe(document.body, { childList: true, subtree: true })

    timeoutId = setTimeout(() => {
      if (!done) window.scrollTo(0, target)
      observer.disconnect()
    }, RESTORE_TIMEOUT_MS)

    attemptScroll()

    return () => {
      observer.disconnect()
      clearTimeout(timeoutId)
    }
  }, [location.key, navigationType])
}
