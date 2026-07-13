export function formatPostReference(postSummary) {
  const typeLabel = postSummary.type === 'missing' ? 'Missing' : 'Found'
  const petLabel = postSummary.petName ? ` — ${postSummary.petName}` : ''
  return `Re: ${typeLabel} ${postSummary.species}${petLabel}`
}

export function createInitialConversations() {
  return [
    {
      id: 'conv-1',
      postId: 'post-milo',
      postSummary: { type: 'missing', species: 'cat', petName: 'Milo', photoUrl: null },
      otherUser: { id: 'user-dana', displayName: 'Dana' },
      unread: true,
      messages: [
        {
          id: 'm1',
          fromMe: false,
          text: 'Hi, I think I saw her near the park',
          sentAt: '2026-07-12T14:10:00Z',
        },
        { id: 'm2', fromMe: true, text: 'Really?! Which park?', sentAt: '2026-07-12T14:14:00Z' },
      ],
    },
    {
      id: 'conv-2',
      postId: 'post-jaffa-dog',
      postSummary: { type: 'found', species: 'dog', petName: null, photoUrl: null },
      otherUser: { id: 'user-alex', displayName: 'Alex' },
      unread: false,
      messages: [
        { id: 'm3', fromMe: true, text: 'Thank you so much!', sentAt: '2026-07-11T09:00:00Z' },
      ],
    },
  ]
}
