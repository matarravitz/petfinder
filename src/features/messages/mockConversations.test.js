import { createInitialConversations, formatPostReference } from './mockConversations.js'

test('returns a fresh array of conversations on every call (no shared mutable state)', () => {
  const first = createInitialConversations()
  first[0].unread = false
  first[0].messages.push({ id: 'extra', fromMe: true, text: 'mutated', sentAt: '2026-01-01T00:00:00Z' })

  const second = createInitialConversations()

  expect(second[0].unread).toBe(true)
  expect(second[0].messages).not.toContainEqual(
    expect.objectContaining({ text: 'mutated' })
  )
})

test('formatPostReference labels a missing pet with its name', () => {
  expect(formatPostReference({ type: 'missing', species: 'cat', petName: 'Milo' })).toBe(
    'Re: Missing cat — Milo'
  )
})

test('formatPostReference falls back to species when there is no pet name', () => {
  expect(formatPostReference({ type: 'found', species: 'dog', petName: null })).toBe('Re: Found dog')
})
