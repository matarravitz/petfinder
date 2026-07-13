import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ConversationList from './ConversationList.jsx'
import { createInitialConversations } from './mockConversations.js'

test('renders one row per conversation', () => {
  render(
    <ConversationList conversations={createInitialConversations()} activeId={null} onSelect={vi.fn()} onDelete={vi.fn()} />
  )

  expect(screen.getByText('Dana')).toBeInTheDocument()
  expect(screen.getByText('Alex')).toBeInTheDocument()
})

test('marks the active conversation', () => {
  const conversations = createInitialConversations()
  render(<ConversationList conversations={conversations} activeId="conv-2" onSelect={vi.fn()} onDelete={vi.fn()} />)

  expect(screen.getByRole('button', { name: /^Alex/ })).toHaveAttribute('aria-current', 'true')
  expect(screen.getByRole('button', { name: /^Dana/ })).toHaveAttribute('aria-current', 'false')
})

test('calls onSelect when a row is clicked', async () => {
  const onSelect = vi.fn()
  render(
    <ConversationList conversations={createInitialConversations()} activeId={null} onSelect={onSelect} onDelete={vi.fn()} />
  )

  await userEvent.click(screen.getByRole('button', { name: /^Dana/ }))
  expect(onSelect).toHaveBeenCalledWith('conv-1')
})

test('calls onDelete when a row is deleted and confirmed', async () => {
  const onDelete = vi.fn()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(
    <ConversationList conversations={createInitialConversations()} activeId={null} onSelect={vi.fn()} onDelete={onDelete} />
  )

  await userEvent.click(screen.getByRole('button', { name: 'Delete conversation with Dana' }))
  expect(onDelete).toHaveBeenCalledWith('conv-1')
  window.confirm.mockRestore()
})

test('shows an empty state when there are no conversations', () => {
  render(<ConversationList conversations={[]} activeId={null} onSelect={vi.fn()} onDelete={vi.fn()} />)
  expect(screen.getByText('No conversations yet.')).toBeInTheDocument()
})
