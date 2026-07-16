import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, Link } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useScrollRestoration } from './useScrollRestoration.js'

function ListPage() {
  useScrollRestoration()
  return (
    <div>
      <p>list page</p>
      <Link to="/detail">Go to detail</Link>
    </div>
  )
}

function DetailPage() {
  useScrollRestoration()
  return <p>detail page</p>
}

function buildRouter() {
  return createMemoryRouter(
    [
      { path: '/list', element: <ListPage /> },
      { path: '/detail', element: <DetailPage /> },
    ],
    { initialEntries: ['/list'] }
  )
}

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('restores scroll position when navigating back to a page the user had scrolled on', async () => {
  // jsdom has no real layout engine, so document.documentElement.scrollHeight
  // and window.innerHeight are always 0 by default — stub them so the hook's
  // "is the page tall enough to reach the saved position yet" check can pass.
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
  const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

  const router = buildRouter()
  render(<RouterProvider router={router} />)
  expect(screen.getByText('list page')).toBeInTheDocument()

  // Simulate the user having scrolled down on the list page, then navigate
  // away via a real click on a real <Link> — the hook captures scroll
  // position at click time (capture phase), not on unmount, so this must go
  // through an actual click rather than router.navigate() directly.
  Object.defineProperty(window, 'scrollY', { value: 450, configurable: true })
  await userEvent.click(screen.getByRole('link', { name: 'Go to detail' }))
  expect(await screen.findByText('detail page')).toBeInTheDocument()

  await act(async () => {
    router.navigate(-1)
  })

  expect(await screen.findByText('list page')).toBeInTheDocument()
  expect(scrollToSpy).toHaveBeenCalledWith(0, 450)
})

test('does not force a scroll on a fresh forward navigation', async () => {
  const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

  const router = buildRouter()
  render(<RouterProvider router={router} />)

  Object.defineProperty(window, 'scrollY', { value: 450, configurable: true })
  await userEvent.click(screen.getByRole('link', { name: 'Go to detail' }))

  expect(await screen.findByText('detail page')).toBeInTheDocument()
  expect(scrollToSpy).not.toHaveBeenCalled()
})

test('only saves scroll position for actual link clicks, not arbitrary clicks', async () => {
  const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })

  const router = buildRouter()
  render(<RouterProvider router={router} />)

  Object.defineProperty(window, 'scrollY', { value: 450, configurable: true })
  await userEvent.click(screen.getByText('list page'))
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })

  await act(async () => {
    await router.navigate('/detail')
  })
  await act(async () => {
    router.navigate(-1)
  })

  expect(await screen.findByText('list page')).toBeInTheDocument()
  // No saved position for this entry (the click wasn't on a link), so the
  // restore effect should have nothing to apply.
  expect(scrollToSpy).not.toHaveBeenCalled()
})
