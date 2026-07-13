import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ThreadPane from './ThreadPane.jsx'

const conversation = {
  id: 'conv-1',
  postId: 'post-milo',
  postSummary: { type: 'missing', species: 'cat', petName: 'Milo', photoUrl: null },
  otherUser: { id: 'user-dana', displayName: 'Dana' },
  unread: false,
  messages: [
    { id: 'm1', fromMe: false, text: 'Hi, I think I saw her near the park', sentAt: '2026-07-12T14:10:00Z' },
    { id: 'm2', fromMe: true, text: 'Really?! Which park?', sentAt: '2026-07-12T14:14:00Z' },
  ],
}

test('shows a hint when no conversation is selected', () => {
  render(<ThreadPane conversation={null} onSend={vi.fn()} onBack={vi.fn()} />)
  expect(screen.getByText('Select a conversation to start chatting.')).toBeInTheDocument()
})

test('renders the header and all messages for the active conversation', () => {
  render(<ThreadPane conversation={conversation} onSend={vi.fn()} onBack={vi.fn()} />)

  expect(screen.getByText('Dana')).toBeInTheDocument()
  expect(screen.getByText('Re: Missing cat — Milo')).toBeInTheDocument()
  expect(screen.getByText('Hi, I think I saw her near the park')).toBeInTheDocument()
  expect(screen.getByText('Really?! Which park?')).toBeInTheDocument()
})

test('typing and sending calls onSend with the trimmed text and clears the input', async () => {
  const onSend = vi.fn()
  render(<ThreadPane conversation={conversation} onSend={onSend} onBack={vi.fn()} />)

  const input = screen.getByPlaceholderText('Type a message...')
  await userEvent.type(input, '  Sure, near the fountain  ')
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))

  expect(onSend).toHaveBeenCalledWith('Sure, near the fountain')
  expect(input).toHaveValue('')
})

test('does not call onSend for empty or whitespace-only text', async () => {
  const onSend = vi.fn()
  render(<ThreadPane conversation={conversation} onSend={onSend} onBack={vi.fn()} />)

  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  const input = screen.getByPlaceholderText('Type a message...')
  await userEvent.type(input, '   ')
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))

  expect(onSend).not.toHaveBeenCalled()
})

test('the back control calls onBack when clicked', async () => {
  const onBack = vi.fn()
  render(<ThreadPane conversation={conversation} onSend={vi.fn()} onBack={onBack} />)

  await userEvent.click(screen.getByRole('button', { name: 'Back to messages' }))
  expect(onBack).toHaveBeenCalled()
})
