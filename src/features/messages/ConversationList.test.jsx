import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ConversationList from './ConversationList.jsx'
import { createInitialConversations } from './mockConversations.js'

test('renders one row per conversation', () => {
  render(<ConversationList conversations={createInitialConversations()} activeId={null} onSelect={vi.fn()} />)

  expect(screen.getByText('Dana')).toBeInTheDocument()
  expect(screen.getByText('Alex')).toBeInTheDocument()
})

test('marks the active conversation', () => {
  const conversations = createInitialConversations()
  render(<ConversationList conversations={conversations} activeId="conv-2" onSelect={vi.fn()} />)

  expect(screen.getByRole('button', { name: /Alex/ })).toHaveAttribute('aria-current', 'true')
  expect(screen.getByRole('button', { name: /Dana/ })).toHaveAttribute('aria-current', 'false')
})

test('calls onSelect when a row is clicked', async () => {
  const onSelect = vi.fn()
  render(<ConversationList conversations={createInitialConversations()} activeId={null} onSelect={onSelect} />)

  await userEvent.click(screen.getByRole('button', { name: /Dana/ }))
  expect(onSelect).toHaveBeenCalledWith('conv-1')
})

test('shows an empty state when there are no conversations', () => {
  render(<ConversationList conversations={[]} activeId={null} onSelect={vi.fn()} />)
  expect(screen.getByText('No conversations yet.')).toBeInTheDocument()
})
