import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import MessagesPage from './MessagesPage.jsx'

function renderAt(entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <MessagesPage />
    </MemoryRouter>
  )
}

test('renders the fixture conversations in the list', () => {
  renderAt('/messages')
  expect(screen.getByText('Dana')).toBeInTheDocument()
  expect(screen.getByText('Alex')).toBeInTheDocument()
})

test('shows a hint in the thread pane until a conversation is selected', () => {
  renderAt('/messages')
  expect(screen.getByText('Select a conversation to start chatting.')).toBeInTheDocument()
})

test('selecting a conversation opens its thread', async () => {
  renderAt('/messages')
  await userEvent.click(screen.getByRole('button', { name: /^Dana/ }))
  expect(screen.getByText('Hi, I think I saw her near the park')).toBeInTheDocument()
})

test('sending a message appends it to the active thread', async () => {
  renderAt('/messages')
  await userEvent.click(screen.getByRole('button', { name: /^Dana/ }))
  await userEvent.type(screen.getByPlaceholderText('Type a message...'), 'The one near Dizengoff')
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))

  expect(screen.getByText('The one near Dizengoff')).toBeInTheDocument()
})

test('arriving with location state for an existing conversation opens it directly', () => {
  renderAt({
    pathname: '/messages',
    state: { openPostId: 'post-milo', otherUser: { id: 'user-dana', displayName: 'Dana' } },
  })

  expect(screen.getByText('Hi, I think I saw her near the park')).toBeInTheDocument()
})

test('arriving with location state for a new post+user creates and opens an empty thread', () => {
  renderAt({
    pathname: '/messages',
    state: {
      openPostId: 'post-new',
      otherUser: { id: 'user-sam', displayName: 'Sam' },
      postSummary: { type: 'missing', species: 'cat', petName: 'Milo', photoUrl: null },
    },
  })

  expect(screen.queryByText('Select a conversation to start chatting.')).not.toBeInTheDocument()
  expect(screen.getAllByText('Sam').length).toBeGreaterThan(0)
})

test('deleting a conversation (after confirming) removes it from the list', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderAt('/messages')

  await userEvent.click(screen.getByRole('button', { name: 'Delete conversation with Dana' }))

  expect(screen.queryByText('Dana')).not.toBeInTheDocument()
  expect(screen.getByText('Alex')).toBeInTheDocument()
  window.confirm.mockRestore()
})

test('does not delete a conversation when the confirmation is cancelled', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  renderAt('/messages')

  await userEvent.click(screen.getByRole('button', { name: 'Delete conversation with Dana' }))

  expect(screen.getByText('Dana')).toBeInTheDocument()
  window.confirm.mockRestore()
})

test('deleting the currently active conversation clears the thread pane', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderAt('/messages')

  await userEvent.click(screen.getByRole('button', { name: /^Dana/ }))
  expect(screen.getByText('Hi, I think I saw her near the park')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Delete conversation with Dana' }))

  expect(screen.getByText('Select a conversation to start chatting.')).toBeInTheDocument()
  window.confirm.mockRestore()
})
