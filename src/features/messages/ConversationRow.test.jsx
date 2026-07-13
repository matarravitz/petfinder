import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ConversationRow from './ConversationRow.jsx'

const conversation = {
  id: 'conv-1',
  postId: 'post-milo',
  postSummary: { type: 'missing', species: 'cat', petName: 'Milo', photoUrl: null },
  otherUser: { id: 'user-dana', displayName: 'Dana' },
  unread: true,
  messages: [{ id: 'm2', fromMe: true, text: 'Really?! Which park?', sentAt: '2026-07-12T14:14:00Z' }],
}

test('renders the other person, post reference, and last message', () => {
  render(<ConversationRow conversation={conversation} active={false} onClick={vi.fn()} />)

  expect(screen.getByText('Dana')).toBeInTheDocument()
  expect(screen.getByText('Re: Missing cat — Milo')).toBeInTheDocument()
  expect(screen.getByText('You: Really?! Which park?')).toBeInTheDocument()
})

test('shows an unread indicator when the conversation is unread', () => {
  render(<ConversationRow conversation={conversation} active={false} onClick={vi.fn()} />)
  expect(screen.getByLabelText('Unread')).toBeInTheDocument()
})

test('does not show an unread indicator when read', () => {
  render(<ConversationRow conversation={{ ...conversation, unread: false }} active={false} onClick={vi.fn()} />)
  expect(screen.queryByLabelText('Unread')).not.toBeInTheDocument()
})

test('calls onClick with the conversation id when clicked', async () => {
  const onClick = vi.fn()
  render(<ConversationRow conversation={conversation} active={false} onClick={onClick} />)

  await userEvent.click(screen.getByRole('button'))
  expect(onClick).toHaveBeenCalledWith('conv-1')
})
