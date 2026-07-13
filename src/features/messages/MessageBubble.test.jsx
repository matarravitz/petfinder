import { render, screen } from '@testing-library/react'
import MessageBubble from './MessageBubble.jsx'

test('renders the message text', () => {
  render(<MessageBubble message={{ id: 'm1', fromMe: false, text: 'Hello there', sentAt: '2026-07-12T14:10:00Z' }} />)
  expect(screen.getByText('Hello there')).toBeInTheDocument()
})

test('applies the "mine" style class when fromMe is true', () => {
  render(<MessageBubble message={{ id: 'm1', fromMe: true, text: 'Hi', sentAt: '2026-07-12T14:10:00Z' }} />)
  expect(screen.getByText('Hi')).toHaveClass('message-bubble-mine')
})

test('applies the "theirs" style class when fromMe is false', () => {
  render(<MessageBubble message={{ id: 'm1', fromMe: false, text: 'Hi', sentAt: '2026-07-12T14:10:00Z' }} />)
  expect(screen.getByText('Hi')).toHaveClass('message-bubble-theirs')
})
