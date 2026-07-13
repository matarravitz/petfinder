# In-Site Messaging (Visual-Only Prototype) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a real, persisted `phone_number` field on posts, and a visual-only (mock-data, no backend) in-site chat inbox with a "Contact publisher" button, per `docs/features/messaging.md`.

**Architecture:** The phone number field follows the existing `reward_amount` pattern exactly (migration → `buildPostPayload` → form → detail page). The chat inbox is a new `src/features/messages/` feature: presentational components (`ConversationRow`, `ConversationList`, `MessageBubble`, `ThreadPane`) composed by a stateful `MessagesPage` that holds an in-memory (not persisted) list of conversations seeded from `mockConversations.js`. The "Contact publisher" button on `PostDetailPage` navigates to `/messages` with React Router location state; `MessagesPage` reads that state to open or create the right thread.

**Tech Stack:** React 18.3.1, plain JS, React Router v6, Vitest + `@testing-library/react` + `@testing-library/user-event`. No new dependencies.

## Global Constraints

- No new database tables/RLS/realtime for chat this pass — mock data only, in-memory, resets on reload. (spec: Non-goals)
- `phone_number` is nullable `text` on `posts`, same pattern as `reward_amount` in `supabase/migrations/0001_init.sql`.
- Phone field: shown as a `tel:` link when present, `—` when absent — matches the existing `.post-detail-fields` convention (breed/color/size already do this).
- Chat layout is split-pane (WhatsApp Web style) on wide screens; below the existing `640px` breakpoint (see `theme.css`), show one pane at a time with a back control. This is a responsive fallback for the web page, not a native-app design (that's tracked separately in `docs/future-app-ideas.md`, not built here).
- Message bubbles: theirs left/neutral, mine right/accent-colored (`var(--color-accent)`).
- "Contact publisher" button: visible only when logged in and viewing someone else's post (mirrors the existing owner-only "Mark as resolved" visibility logic, inverted).
- Selecting a conversation clears its unread flag (local state only). Sending an empty/whitespace-only message is a no-op.
- New mock conversation/message ids: use `crypto.randomUUID()` (available in the project's Node >=22 / browser targets — no new dependency).
- Fixture data (`mockConversations.js`) must be produced by a **function**, not a shared mutable exported array/object — otherwise state mutations in one test (or one page visit) leak into the next. This bit an earlier version of this plan during self-review; call it out in code review too.
- Follow existing test patterns: `vi.mock()` per module, `MemoryRouter` for routing, no real Supabase calls needed for anything chat-related.

---

### Task 1: Phone number field (migration, payload, form, detail page)

**Files:**
- Create: `supabase/migrations/0004_posts_phone_number.sql`
- Modify: `src/features/posts/buildPostPayload.js`
- Modify: `src/features/posts/buildPostPayload.test.js`
- Modify: `src/features/posts/CreatePostForm.jsx`
- Modify: `src/features/posts/CreatePostForm.test.jsx`
- Modify: `src/features/posts/PostDetailPage.jsx`
- Modify: `src/features/posts/PostDetailPage.test.jsx`
- Modify: `src/features/layout/theme.css`

**Interfaces:**
- Produces: `posts.phone_number` (nullable text column). `buildPostPayload(formValues, ownerId)` includes `phone_number: formValues.phoneNumber || null` in its returned object. `CreatePostForm` form state gains a `phoneNumber` field. `PostDetailPage` renders a `field-phone` grid cell.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0004_posts_phone_number.sql
alter table posts add column phone_number text;
```

- [ ] **Step 2: Apply the migration locally**

Run: `cd /home/ubuntu/Projects/petfinder && supabase db reset`
Expected: migration runs with no errors (it replays all migrations against a fresh local DB).

- [ ] **Step 3: Write the failing test for `buildPostPayload`**

Update `src/features/posts/buildPostPayload.test.js` — add `phoneNumber` to both test fixtures and assert `phone_number` in the expected output:

```js
import { buildPostPayload } from './buildPostPayload.js'

test('maps a missing-pet form to a full post row, including reward and name', () => {
  const payload = buildPostPayload(
    {
      type: 'missing',
      species: 'cat',
      breed: 'Tabby',
      color: 'orange',
      size: 'small',
      collar: true,
      collarDescription: 'blue collar',
      microchipped: 'yes',
      distinctiveMarkings: 'white paw',
      petName: 'Milo',
      rewardAmount: '50',
      phoneNumber: '050-1234567',
      locationLat: 32.08,
      locationLng: 34.78,
      locationText: 'Tel Aviv',
      dateLostOrFound: '2026-07-01',
    },
    'owner-1'
  )

  expect(payload).toEqual({
    owner_id: 'owner-1',
    type: 'missing',
    species: 'cat',
    breed: 'Tabby',
    color: 'orange',
    size: 'small',
    collar: true,
    collar_description: 'blue collar',
    microchipped: 'yes',
    distinctive_markings: 'white paw',
    pet_name: 'Milo',
    reward_amount: 50,
    phone_number: '050-1234567',
    location_lat: 32.08,
    location_lng: 34.78,
    location_text: 'Tel Aviv',
    date_lost_or_found: '2026-07-01',
    status: 'active',
  })
})

test('forces pet_name and reward_amount to null for a found-pet post', () => {
  const payload = buildPostPayload(
    {
      type: 'found',
      species: 'dog',
      petName: 'should be ignored',
      rewardAmount: '100',
      locationLat: 1,
      locationLng: 2,
      locationText: 'somewhere',
      dateLostOrFound: '2026-07-01',
    },
    'owner-2'
  )

  expect(payload.pet_name).toBeNull()
  expect(payload.reward_amount).toBeNull()
})

test('defaults phone_number to null when not provided', () => {
  const payload = buildPostPayload(
    {
      type: 'found',
      species: 'dog',
      locationLat: 1,
      locationLng: 2,
      locationText: 'somewhere',
      dateLostOrFound: '2026-07-01',
    },
    'owner-2'
  )

  expect(payload.phone_number).toBeNull()
})
```

- [ ] **Step 4: Run the tests to verify the new/changed assertions fail**

Run: `npm test -- --run buildPostPayload`
Expected: FAIL — `payload.phone_number` is `undefined`, not in the object / not `null` as asserted.

- [ ] **Step 5: Add `phone_number` to `buildPostPayload`**

```js
// src/features/posts/buildPostPayload.js
export function buildPostPayload(formValues, ownerId) {
  const isMissing = formValues.type === 'missing'
  return {
    owner_id: ownerId,
    type: formValues.type,
    species: formValues.species,
    breed: formValues.breed || null,
    color: formValues.color || null,
    size: formValues.size || null,
    collar: Boolean(formValues.collar),
    collar_description: formValues.collar ? formValues.collarDescription || null : null,
    microchipped: formValues.microchipped || 'unknown',
    distinctive_markings: formValues.distinctiveMarkings || null,
    pet_name: isMissing ? formValues.petName || null : null,
    reward_amount: isMissing && formValues.rewardAmount ? Number(formValues.rewardAmount) : null,
    phone_number: formValues.phoneNumber || null,
    location_lat: formValues.locationLat,
    location_lng: formValues.locationLng,
    location_text: formValues.locationText,
    date_lost_or_found: formValues.dateLostOrFound,
    status: 'active',
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- --run buildPostPayload`
Expected: PASS (3 tests)

- [ ] **Step 7: Write the failing test for the new form field**

Add to `src/features/posts/CreatePostForm.test.jsx`:

```js
test('phone number is optional and gets submitted when filled in', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })

  render(
    <MemoryRouter>
      <CreatePostForm />
    </MemoryRouter>
  )

  await userEvent.selectOptions(screen.getByLabelText('Species'), 'cat')
  await userEvent.click(screen.getByText('Pick a location (test stub)'))
  await userEvent.type(screen.getByLabelText('Date lost/found'), '2026-07-01')
  await userEvent.type(screen.getByLabelText('Phone number (optional)'), '050-1234567')
  await userEvent.click(screen.getByText('Create post'))

  await waitFor(() => expect(postsApi.createPost).toHaveBeenCalled())
  expect(postsApi.createPost).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ phone_number: '050-1234567' }),
    []
  )
})
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npm test -- --run CreatePostForm`
Expected: FAIL — `getByLabelText('Phone number (optional)')` not found (the field doesn't exist yet).

- [ ] **Step 9: Add the field to `CreatePostForm`**

In `src/features/posts/CreatePostForm.jsx`, add `phoneNumber: ''` to `initialForm`:

```js
const initialForm = {
  type: 'missing',
  species: '',
  breed: '',
  breedOther: '',
  color: '',
  colorOther: '',
  size: '',
  collar: false,
  collarDescription: '',
  microchipped: 'unknown',
  distinctiveMarkings: '',
  petName: '',
  rewardAmount: '',
  phoneNumber: '',
  dateLostOrFound: '',
}
```

Add a phone field to the "About the pet" `field-grid`, right after the `distinctiveMarkings` field and before the collar checkbox:

```jsx
          <div className="field">
            <label className="field-label" htmlFor="distinctiveMarkings">
              Distinctive markings
            </label>
            <input
              id="distinctiveMarkings"
              className="field-input"
              value={form.distinctiveMarkings}
              onChange={(e) => update('distinctiveMarkings', e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="phoneNumber">
              Phone number (optional)
            </label>
            <input
              id="phoneNumber"
              className="field-input"
              type="tel"
              value={form.phoneNumber}
              onChange={(e) => update('phoneNumber', e.target.value)}
            />
          </div>
```

- [ ] **Step 10: Run the full `CreatePostForm` suite to verify everything passes**

Run: `npm test -- --run CreatePostForm`
Expected: PASS (all tests, including the new one)

- [ ] **Step 11: Write the failing tests for `PostDetailPage`**

`PostDetailPage.test.jsx`'s `'shows a placeholder for optional fields the poster left blank, in a fixed order'` test currently expects 4 `—` placeholders (breed, color, size, markings). Adding the phone field makes it 5 — update the assertion:

```js
test('shows a placeholder for optional fields the poster left blank, in a fixed order', async () => {
  useAuth.mockReturnValue({ user: null })
  postsApi.getPost.mockResolvedValueOnce({
    id: 'p5',
    owner_id: 'owner-1',
    type: 'found',
    species: 'dog',
    microchipped: 'unknown',
    collar: false,
    location_text: 'Tel Aviv',
    date_lost_or_found: '2026-07-01',
    status: 'active',
    post_photos: [],
  })
  renderAtPost('p5')

  await waitFor(() => screen.getByText(/Found: dog/))
  expect(screen.getByText('Breed')).toBeInTheDocument()
  expect(screen.getByText('Color')).toBeInTheDocument()
  expect(screen.getByText('Size')).toBeInTheDocument()
  expect(screen.getByText('Distinctive markings')).toBeInTheDocument()
  expect(screen.getByText('Phone')).toBeInTheDocument()
  expect(screen.getAllByText('—')).toHaveLength(5)
})
```

Also add a new test for the populated case:

```js
test('shows the phone number as a tel: link when present', async () => {
  useAuth.mockReturnValue({ user: null })
  postsApi.getPost.mockResolvedValueOnce({
    id: 'p6',
    owner_id: 'owner-1',
    type: 'found',
    species: 'dog',
    location_text: 'Tel Aviv',
    post_photos: [],
    phone_number: '050-1234567',
  })
  renderAtPost('p6')

  const link = await screen.findByRole('link', { name: '050-1234567' })
  expect(link).toHaveAttribute('href', 'tel:050-1234567')
})
```

- [ ] **Step 12: Run the tests to verify they fail**

Run: `npm test -- --run PostDetailPage`
Expected: FAIL — the placeholder count is still 4 (no phone field rendered yet), and the tel: link test finds nothing.

- [ ] **Step 13: Show the phone number on `PostDetailPage`**

In `src/features/posts/PostDetailPage.jsx`, add a new field to the `.post-detail-fields` grid, using the empty grid cell already reserved in `theme.css` (`'collar markings .'` → `'collar markings phone'`):

```jsx
        <div className="post-detail-field field-collar">
          <dt>Collar</dt>
          <dd>{post.collar ? post.collar_description || 'Yes' : 'No'}</dd>
        </div>
        <div className="post-detail-field field-markings">
          <dt>Distinctive markings</dt>
          <dd>{post.distinctive_markings || '—'}</dd>
        </div>
        <div className="post-detail-field field-phone">
          <dt>Phone</dt>
          <dd>{post.phone_number ? <a href={`tel:${post.phone_number}`}>{post.phone_number}</a> : '—'}</dd>
        </div>
```

- [ ] **Step 14: Update `theme.css` for the new grid cell**

```css
.post-detail-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(160px, 1fr));
  grid-template-areas:
    'location date breed'
    'color size microchipped'
    'collar markings phone';
  gap: var(--space-md) var(--space-lg);
  margin: var(--space-md) 0;
}
```

Add the new area rule next to the other `.field-*` rules:

```css
.field-phone {
  grid-area: phone;
}
```

- [ ] **Step 15: Run the full `PostDetailPage` suite to verify everything passes**

Run: `npm test -- --run PostDetailPage`
Expected: PASS (all tests, including the two above)

- [ ] **Step 16: Run the full test suite**

Run: `npm test`
Expected: PASS, all files

- [ ] **Step 17: Commit**

```bash
git add supabase/migrations/0004_posts_phone_number.sql src/features/posts/buildPostPayload.js src/features/posts/buildPostPayload.test.js src/features/posts/CreatePostForm.jsx src/features/posts/CreatePostForm.test.jsx src/features/posts/PostDetailPage.jsx src/features/posts/PostDetailPage.test.jsx src/features/layout/theme.css
git commit -m "Add optional phone number field to posts"
```

---

### Task 2: Mock conversation data + conversation list

**Files:**
- Create: `src/features/messages/mockConversations.js`
- Create: `src/features/messages/mockConversations.test.js`
- Create: `src/features/messages/ConversationRow.jsx`
- Create: `src/features/messages/ConversationRow.test.jsx`
- Create: `src/features/messages/ConversationList.jsx`
- Create: `src/features/messages/ConversationList.test.jsx`
- Modify: `src/features/layout/theme.css`

**Interfaces:**
- Produces:
  - `createInitialConversations(): Conversation[]` — factory (not a shared array) returning fresh fixture data every call.
  - `formatPostReference(postSummary: { type: 'missing'|'found', species: string, petName: string|null }): string` — e.g. `"Re: Missing cat — Milo"` or `"Re: Found dog"`.
  - `Conversation` shape: `{ id, postId, postSummary: { type, species, petName, photoUrl }, otherUser: { id, displayName }, unread, messages: [{ id, fromMe, text, sentAt }] }`.
  - `<ConversationRow conversation active onClick />` — `onClick` is called with `conversation.id`.
  - `<ConversationList conversations activeId onSelect />` — `onSelect` is called with a conversation id; renders `ConversationRow` per conversation; renders `"No conversations yet."` when the array is empty.

- [ ] **Step 1: Write the fixture data module and its test**

```js
// src/features/messages/mockConversations.test.js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run mockConversations`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write the fixture data module**

```js
// src/features/messages/mockConversations.js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run mockConversations`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for `ConversationRow`**

```jsx
// src/features/messages/ConversationRow.test.jsx
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
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- --run ConversationRow`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 7: Write `ConversationRow`**

```jsx
// src/features/messages/ConversationRow.jsx
import { formatPostReference } from './mockConversations.js'

export default function ConversationRow({ conversation, active, onClick }) {
  const lastMessage = conversation.messages[conversation.messages.length - 1]
  const preview = lastMessage ? `${lastMessage.fromMe ? 'You: ' : ''}${lastMessage.text}` : ''

  return (
    <button
      type="button"
      className={`conversation-row${active ? ' conversation-row-active' : ''}`}
      onClick={() => onClick(conversation.id)}
      aria-current={active}
    >
      {conversation.postSummary.photoUrl ? (
        <img
          className="conversation-row-avatar"
          src={conversation.postSummary.photoUrl}
          alt=""
        />
      ) : (
        <div className="conversation-row-avatar-fallback" aria-hidden="true" />
      )}
      <div className="conversation-row-body">
        <div className="conversation-row-top">
          <span className="conversation-row-name">{conversation.otherUser.displayName}</span>
          {lastMessage && (
            <span className="conversation-row-time">
              {new Date(lastMessage.sentAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="conversation-row-post">{formatPostReference(conversation.postSummary)}</div>
        <div className="conversation-row-preview">{preview}</div>
      </div>
      {conversation.unread && (
        <span className="conversation-row-unread-dot" aria-label="Unread" role="img" />
      )}
    </button>
  )
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- --run ConversationRow`
Expected: PASS (4 tests)

- [ ] **Step 9: Write the failing test for `ConversationList`**

```jsx
// src/features/messages/ConversationList.test.jsx
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
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `npm test -- --run ConversationList`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 11: Write `ConversationList`**

```jsx
// src/features/messages/ConversationList.jsx
import ConversationRow from './ConversationRow.jsx'

export default function ConversationList({ conversations, activeId, onSelect }) {
  if (conversations.length === 0) {
    return <p className="conversation-list-empty">No conversations yet.</p>
  }

  return (
    <div className="conversation-list">
      {conversations.map((conversation) => (
        <ConversationRow
          key={conversation.id}
          conversation={conversation}
          active={conversation.id === activeId}
          onClick={onSelect}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `npm test -- --run ConversationList`
Expected: PASS (4 tests)

- [ ] **Step 13: Add conversation list styles to `theme.css`**

```css
/* ---------- Messages: conversation list ---------- */

.conversation-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.conversation-list-empty {
  padding: var(--space-md);
  color: var(--color-muted);
}

.conversation-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
  text-align: left;
  padding: var(--space-sm) var(--space-md);
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: none;
  cursor: pointer;
  font-family: var(--font-family-body);
}

.conversation-row:hover,
.conversation-row-active {
  background: var(--color-bg);
}

.conversation-row-avatar,
.conversation-row-avatar-fallback {
  width: 44px;
  height: 44px;
  border-radius: calc(var(--radius-button) / 1.6);
  object-fit: cover;
  flex-shrink: 0;
  background: var(--color-border);
}

.conversation-row-body {
  min-width: 0;
  flex: 1;
}

.conversation-row-top {
  display: flex;
  justify-content: space-between;
  gap: var(--space-sm);
}

.conversation-row-name {
  font-weight: 700;
  font-size: 0.9rem;
}

.conversation-row-time {
  font-size: 0.75rem;
  color: var(--color-muted);
  white-space: nowrap;
}

.conversation-row-post {
  font-size: 0.75rem;
  color: var(--color-muted);
}

.conversation-row-preview {
  font-size: 0.85rem;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-row-unread-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--color-accent);
  flex-shrink: 0;
}
```

- [ ] **Step 14: Run the full test suite**

Run: `npm test`
Expected: PASS, all files

- [ ] **Step 15: Commit**

```bash
git add src/features/messages/mockConversations.js src/features/messages/mockConversations.test.js src/features/messages/ConversationRow.jsx src/features/messages/ConversationRow.test.jsx src/features/messages/ConversationList.jsx src/features/messages/ConversationList.test.jsx src/features/layout/theme.css
git commit -m "Add mock conversation data and conversation list components"
```

---

### Task 3: Message bubble + thread pane

**Files:**
- Create: `src/features/messages/MessageBubble.jsx`
- Create: `src/features/messages/MessageBubble.test.jsx`
- Create: `src/features/messages/ThreadPane.jsx`
- Create: `src/features/messages/ThreadPane.test.jsx`
- Modify: `src/features/layout/theme.css`

**Interfaces:**
- Consumes: `formatPostReference` from `mockConversations.js` (Task 2).
- Produces:
  - `<MessageBubble message={{ id, fromMe, text, sentAt }} />`.
  - `<ThreadPane conversation={Conversation|null} onSend={(text) => void} onBack={() => void} />` — renders a hint when `conversation` is `null`; otherwise a header, scrollable messages, and an input that calls `onSend(trimmedText)` on submit and is a no-op for empty/whitespace-only text. The back control is always in the DOM (visually hidden at wide viewports via CSS — see Task 4's responsive rule) and calls `onBack` when clicked.

- [ ] **Step 1: Write the failing test for `MessageBubble`**

```jsx
// src/features/messages/MessageBubble.test.jsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run MessageBubble`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write `MessageBubble`**

```jsx
// src/features/messages/MessageBubble.jsx
export default function MessageBubble({ message }) {
  return (
    <p className={`message-bubble ${message.fromMe ? 'message-bubble-mine' : 'message-bubble-theirs'}`}>
      {message.text}
    </p>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run MessageBubble`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for `ThreadPane`**

```jsx
// src/features/messages/ThreadPane.test.jsx
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
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- --run ThreadPane`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 7: Write `ThreadPane`**

```jsx
// src/features/messages/ThreadPane.jsx
import { useState } from 'react'
import MessageBubble from './MessageBubble.jsx'
import { formatPostReference } from './mockConversations.js'

export default function ThreadPane({ conversation, onSend, onBack }) {
  const [draft, setDraft] = useState('')

  if (!conversation) {
    return (
      <div className="thread-pane thread-pane-empty">
        <p>Select a conversation to start chatting.</p>
      </div>
    )
  }

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) return
    onSend(trimmed)
    setDraft('')
  }

  return (
    <div className="thread-pane">
      <div className="thread-header">
        <button type="button" className="thread-back-button" onClick={onBack}>
          Back to messages
        </button>
        {conversation.postSummary.photoUrl ? (
          <img className="thread-header-avatar" src={conversation.postSummary.photoUrl} alt="" />
        ) : (
          <div className="thread-header-avatar-fallback" aria-hidden="true" />
        )}
        <div>
          <div className="thread-header-name">{conversation.otherUser.displayName}</div>
          <div className="thread-header-post">{formatPostReference(conversation.postSummary)}</div>
        </div>
      </div>

      <div className="thread-messages">
        {conversation.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>

      <form className="thread-input-row" onSubmit={handleSubmit}>
        <input
          className="field-input"
          placeholder="Type a message..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="thread-send-button">
          Send
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- --run ThreadPane`
Expected: PASS (5 tests)

- [ ] **Step 9: Add thread pane styles to `theme.css`**

```css
/* ---------- Messages: thread pane ---------- */

.thread-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.thread-pane-empty {
  align-items: center;
  justify-content: center;
  color: var(--color-muted);
}

.thread-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--color-border);
}

.thread-back-button {
  display: none;
  border: none;
  background: none;
  color: var(--color-primary);
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  font-family: var(--font-family-body);
}

.thread-header-avatar,
.thread-header-avatar-fallback {
  width: 32px;
  height: 32px;
  border-radius: calc(var(--radius-button) / 1.6);
  object-fit: cover;
  background: var(--color-border);
  flex-shrink: 0;
}

.thread-header-name {
  font-weight: 700;
  font-size: 0.9rem;
}

.thread-header-post {
  font-size: 0.75rem;
  color: var(--color-muted);
}

.thread-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.message-bubble {
  max-width: 75%;
  padding: 6px 12px;
  border-radius: 12px;
  margin: 0;
  font-size: 0.9rem;
}

.message-bubble-theirs {
  align-self: flex-start;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-bottom-left-radius: 2px;
}

.message-bubble-mine {
  align-self: flex-end;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  border-bottom-right-radius: 2px;
}

.thread-input-row {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-top: 1px solid var(--color-border);
}

.thread-input-row .field-input {
  flex: 1;
}

.thread-send-button {
  font-family: var(--font-family-body);
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--color-accent-contrast);
  background: var(--color-accent);
  border: none;
  border-radius: calc(var(--radius-button) / 1.6);
  padding: 0 var(--space-md);
  cursor: pointer;
}
```

- [ ] **Step 10: Run the full test suite**

Run: `npm test`
Expected: PASS, all files

- [ ] **Step 11: Commit**

```bash
git add src/features/messages/MessageBubble.jsx src/features/messages/MessageBubble.test.jsx src/features/messages/ThreadPane.jsx src/features/messages/ThreadPane.test.jsx src/features/layout/theme.css
git commit -m "Add message bubble and thread pane components"
```

---

### Task 4: Messages page (split-pane layout, route, nav link)

**Files:**
- Create: `src/features/messages/MessagesPage.jsx`
- Create: `src/features/messages/MessagesPage.test.jsx`
- Modify: `src/App.jsx`
- Modify: `src/features/layout/Layout.jsx`
- Modify: `src/features/layout/Layout.test.jsx`
- Modify: `src/features/layout/theme.css`

**Interfaces:**
- Consumes: `createInitialConversations` (Task 2), `ConversationList` (Task 2), `ThreadPane` (Task 3).
- Produces: route `/messages` rendering `MessagesPage`; nav link "Messages" in `Layout.jsx`, visible only when logged in. `MessagesPage` reads `location.state` shaped `{ openPostId, otherUser: { id, displayName }, postSummary: { type, species, petName, photoUrl } }` (this is the contract Task 5's "Contact publisher" button must produce) — if a conversation with matching `postId` and `otherUser.id` exists, it's opened; otherwise a new empty one is created and opened.

- [ ] **Step 1: Write the failing test for `MessagesPage`**

```jsx
// src/features/messages/MessagesPage.test.jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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
  await userEvent.click(screen.getByRole('button', { name: /Dana/ }))
  expect(screen.getByText('Hi, I think I saw her near the park')).toBeInTheDocument()
})

test('sending a message appends it to the active thread', async () => {
  renderAt('/messages')
  await userEvent.click(screen.getByRole('button', { name: /Dana/ }))
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

  expect(screen.getByText('Select a conversation to start chatting.')).not.toBeInTheDocument()
  expect(screen.getAllByText('Sam').length).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run MessagesPage`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write `MessagesPage`**

```jsx
// src/features/messages/MessagesPage.jsx
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import ConversationList from './ConversationList.jsx'
import ThreadPane from './ThreadPane.jsx'
import { createInitialConversations } from './mockConversations.js'

export default function MessagesPage() {
  const location = useLocation()
  const [conversations, setConversations] = useState(createInitialConversations)
  const [activeId, setActiveId] = useState(null)

  useEffect(() => {
    const openPostId = location.state?.openPostId
    const otherUser = location.state?.otherUser
    if (!openPostId || !otherUser) return

    setConversations((prev) => {
      const existing = prev.find((c) => c.postId === openPostId && c.otherUser.id === otherUser.id)
      if (existing) {
        setActiveId(existing.id)
        return prev
      }
      const created = {
        id: crypto.randomUUID(),
        postId: openPostId,
        postSummary: location.state?.postSummary ?? { type: 'missing', species: '', petName: null, photoUrl: null },
        otherUser,
        unread: false,
        messages: [],
      }
      setActiveId(created.id)
      return [created, ...prev]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.openPostId, location.state?.otherUser?.id])

  function handleSelect(id) {
    setActiveId(id)
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: false } : c)))
  }

  function handleSend(text) {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId
          ? {
              ...c,
              messages: [
                ...c.messages,
                { id: crypto.randomUUID(), fromMe: true, text, sentAt: new Date().toISOString() },
              ],
            }
          : c
      )
    )
  }

  function handleBack() {
    setActiveId(null)
  }

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null

  return (
    <div className={`messages-page${activeId ? ' has-active-thread' : ''}`}>
      <div className="messages-list-pane">
        <ConversationList conversations={conversations} activeId={activeId} onSelect={handleSelect} />
      </div>
      <div className="messages-thread-pane">
        <ThreadPane conversation={activeConversation} onSend={handleSend} onBack={handleBack} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run MessagesPage`
Expected: PASS (7 tests)

- [ ] **Step 5: Add the route**

In `src/App.jsx`:

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthContext.jsx'
import Layout from './features/layout/Layout.jsx'
import HomePage from './features/home/HomePage.jsx'
import LoginPage from './features/auth/LoginPage.jsx'
import SignupPage from './features/auth/SignupPage.jsx'
import BrowseFeedPage from './features/posts/BrowseFeedPage.jsx'
import CreatePostForm from './features/posts/CreatePostForm.jsx'
import PostDetailPage from './features/posts/PostDetailPage.jsx'
import MessagesPage from './features/messages/MessagesPage.jsx'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/browse" element={<BrowseFeedPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/post/new" element={<CreatePostForm />} />
            <Route path="/post/:id" element={<PostDetailPage />} />
            <Route path="/messages" element={<MessagesPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  )
}
```

- [ ] **Step 6: Write the failing test for the nav link**

Add to `src/features/layout/Layout.test.jsx`:

```js
test('shows a Messages nav link only when logged in', () => {
  useAuth.mockReturnValue({ user: null, signOut: vi.fn() })
  render(
    <MemoryRouter>
      <Layout>
        <p>page content</p>
      </Layout>
    </MemoryRouter>
  )
  expect(screen.queryByRole('link', { name: 'Messages' })).not.toBeInTheDocument()
})

test('shows a Messages nav link when logged in', () => {
  useAuth.mockReturnValue({ user: { id: 'user-1' }, signOut: vi.fn() })
  render(
    <MemoryRouter>
      <Layout>
        <p>page content</p>
      </Layout>
    </MemoryRouter>
  )
  expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute('href', '/messages')
})
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm test -- --run Layout`
Expected: FAIL — no "Messages" link exists yet.

- [ ] **Step 8: Add the nav link**

In `src/features/layout/Layout.jsx`:

```jsx
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import './theme.css'

export default function Layout({ children }) {
  const { user, signOut } = useAuth()
  const { pathname } = useLocation()

  function navLinkClass(path) {
    return `app-nav-link${pathname === path ? ' active' : ''}`
  }

  return (
    <div>
      <header role="banner" className="app-header">
        <div className="app-header-inner">
          <h1 className="app-title">
            <Link className="app-title-link" to="/">
              PetFinder
            </Link>
          </h1>
          <nav className="app-nav" aria-label="Main">
            <div className="app-nav-primary">
              <Link className={navLinkClass('/browse')} to="/browse">
                Browse
              </Link>
              <Link className={navLinkClass('/post/new')} to="/post/new">
                Report a pet
              </Link>
              {user && (
                <Link className={navLinkClass('/messages')} to="/messages">
                  Messages
                </Link>
              )}
            </div>
            <div className="app-nav-auth">
              {user ? (
                <button type="button" className="app-nav-link" onClick={signOut}>
                  Log out
                </button>
              ) : (
                <>
                  <Link className={navLinkClass('/login')} to="/login">
                    Log in
                  </Link>
                  <Link className="app-nav-cta" to="/signup">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  )
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test -- --run Layout`
Expected: PASS (all tests, including the two above)

- [ ] **Step 10: Add split-pane layout + responsive fallback styles to `theme.css`**

```css
/* ---------- Messages page layout ---------- */

.messages-page {
  display: grid;
  grid-template-columns: minmax(260px, 340px) 1fr;
  height: calc(100vh - 64px - var(--space-lg) - var(--space-xl));
  min-height: 420px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--color-surface);
}

.messages-list-pane {
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
}

.messages-thread-pane {
  min-width: 0;
}

@media (max-width: 640px) {
  .messages-page {
    grid-template-columns: 1fr;
  }

  .messages-list-pane {
    border-right: none;
  }

  .messages-thread-pane,
  .messages-list-pane {
    display: block;
  }

  .messages-page.has-active-thread .messages-list-pane {
    display: none;
  }

  .messages-page:not(.has-active-thread) .messages-thread-pane {
    display: none;
  }

  .thread-back-button {
    display: inline-block;
  }
}
```

- [ ] **Step 11: Run the full test suite**

Run: `npm test`
Expected: PASS, all files

- [ ] **Step 12: Commit**

```bash
git add src/features/messages/MessagesPage.jsx src/features/messages/MessagesPage.test.jsx src/App.jsx src/features/layout/Layout.jsx src/features/layout/Layout.test.jsx src/features/layout/theme.css
git commit -m "Add messages page with split-pane layout, route, and nav link"
```

---

### Task 5: "Contact publisher" button

**Files:**
- Modify: `src/features/posts/PostDetailPage.jsx`
- Modify: `src/features/posts/PostDetailPage.test.jsx`
- Modify: `src/features/layout/theme.css`

**Interfaces:**
- Consumes: the `/messages` route and its `location.state` contract from Task 4 (`{ openPostId, otherUser: { id, displayName }, postSummary: { type, species, petName, photoUrl } }`).
- Produces: a "Contact publisher" button on `PostDetailPage`, visible only when `user && user.id !== post.owner_id`.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/posts/PostDetailPage.test.jsx` (needs `useNavigate` mocked — add the mock at the top of the file alongside the existing `postsApi`/`AuthContext` mocks):

```js
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import PostDetailPage from './PostDetailPage.jsx'
import * as postsApi from './postsApi.js'
import { useAuth } from '../auth/AuthContext.jsx'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('./postsApi.js', () => ({
  getPost: vi.fn(() =>
    Promise.resolve({ id: 'p1', owner_id: 'owner-1', type: 'missing', species: 'cat', location_text: 'Tel Aviv', post_photos: [] })
  ),
  resolvePost: vi.fn(() => Promise.resolve()),
}))
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: vi.fn() }))
```

(This replaces the top of the file — keep `renderAtPost` and all existing tests below unchanged.)

Then add these new tests at the end of the file:

```js
test('shows a Contact publisher button for a logged-in non-owner and navigates to /messages', async () => {
  useAuth.mockReturnValue({ user: { id: 'someone-else' } })
  postsApi.getPost.mockResolvedValueOnce({
    id: 'p7',
    owner_id: 'owner-1',
    type: 'missing',
    species: 'cat',
    pet_name: 'Milo',
    location_text: 'Tel Aviv',
    post_photos: [],
    profiles: { display_name: 'Dana' },
  })
  renderAtPost('p7')

  const button = await screen.findByRole('button', { name: 'Contact publisher' })
  await userEvent.click(button)

  expect(mockNavigate).toHaveBeenCalledWith('/messages', {
    state: {
      openPostId: 'p7',
      otherUser: { id: 'owner-1', displayName: 'Dana' },
      postSummary: { type: 'missing', species: 'cat', petName: 'Milo', photoUrl: null },
    },
  })
})

test('does not show a Contact publisher button for the post owner', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  renderAtPost('p1')

  await waitFor(() => screen.getByText(/Missing: cat/))
  expect(screen.queryByRole('button', { name: 'Contact publisher' })).not.toBeInTheDocument()
})

test('does not show a Contact publisher button when logged out', async () => {
  useAuth.mockReturnValue({ user: null })
  renderAtPost('p1')

  await waitFor(() => screen.getByText(/Missing: cat/))
  expect(screen.queryByRole('button', { name: 'Contact publisher' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run PostDetailPage`
Expected: FAIL — no "Contact publisher" button exists yet.

- [ ] **Step 3: Add the button**

In `src/features/posts/PostDetailPage.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient.js'
import { getPost, resolvePost } from './postsApi.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { buildPhotoUrl } from '../../lib/photoUrl.js'
import PawPrintIcon from '../layout/PawPrintIcon.jsx'

export default function PostDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getPost(supabase, id)
      .then(setPost)
      .catch((err) => setError(err.message))
  }, [id])

  if (error) return <p role="alert">{error}</p>
  if (!post) return <p>Loading...</p>

  const isOwner = user && user.id === post.owner_id
  const canContact = user && !isOwner

  async function handleResolve() {
    await resolvePost(supabase, post.id)
    setPost((prev) => ({ ...prev, status: 'resolved' }))
  }

  function handleContact() {
    navigate('/messages', {
      state: {
        openPostId: post.id,
        otherUser: { id: post.owner_id, displayName: post.profiles?.display_name },
        postSummary: {
          type: post.type,
          species: post.species,
          petName: post.pet_name || null,
          photoUrl: post.post_photos?.[0] ? buildPhotoUrl(post.post_photos[0].storage_path) : null,
        },
      },
    })
  }

  const isMissing = post.type === 'missing'
  const posterName = post.profiles?.display_name

  return (
    <div>
      <h2>
        {isMissing ? 'Missing' : 'Found'}: {post.species}
        {isMissing && post.pet_name ? ` — ${post.pet_name}` : ''}
      </h2>
      {posterName && <p className="post-posted-by">Posted by {posterName}</p>}

      {post.status === 'resolved' && (
        <div className="resolved-banner">
          <PawPrintIcon size={22} />
          <span>
            {isMissing && post.pet_name ? post.pet_name : 'This pet'} has been reunited with their
            family.
          </span>
        </div>
      )}

      {post.post_photos && post.post_photos.length > 0 && (
        <div className="post-detail-photos">
          {post.post_photos.map((photo) => (
            <img
              key={photo.id || photo.storage_path}
              className="post-detail-photo"
              src={buildPhotoUrl(photo.storage_path)}
              alt={`${isMissing ? 'Missing' : 'Found'} ${post.species}`}
            />
          ))}
        </div>
      )}

      <dl className="post-detail-fields">
        <div className="post-detail-field field-location">
          <dt>Location</dt>
          <dd>{post.location_text}</dd>
        </div>
        <div className="post-detail-field field-date">
          <dt>Date {isMissing ? 'lost' : 'found'}</dt>
          <dd>{post.date_lost_or_found}</dd>
        </div>
        <div className="post-detail-field field-breed">
          <dt>Breed</dt>
          <dd>{post.breed || '—'}</dd>
        </div>
        <div className="post-detail-field field-color">
          <dt>Color</dt>
          <dd>{post.color || '—'}</dd>
        </div>
        <div className="post-detail-field field-size">
          <dt>Size</dt>
          <dd>{post.size || '—'}</dd>
        </div>
        <div className="post-detail-field field-microchipped">
          <dt>Microchipped</dt>
          <dd>{post.microchipped}</dd>
        </div>
        <div className="post-detail-field field-collar">
          <dt>Collar</dt>
          <dd>{post.collar ? post.collar_description || 'Yes' : 'No'}</dd>
        </div>
        <div className="post-detail-field field-markings">
          <dt>Distinctive markings</dt>
          <dd>{post.distinctive_markings || '—'}</dd>
        </div>
        <div className="post-detail-field field-phone">
          <dt>Phone</dt>
          <dd>{post.phone_number ? <a href={`tel:${post.phone_number}`}>{post.phone_number}</a> : '—'}</dd>
        </div>
      </dl>

      {isMissing && post.reward_amount && (
        <p className="post-detail-reward">Reward: ₪{Number(post.reward_amount).toLocaleString()}</p>
      )}

      {canContact && (
        <button type="button" className="contact-publisher-button" onClick={handleContact}>
          Contact publisher
        </button>
      )}

      {isOwner && post.status !== 'resolved' && (
        <button onClick={handleResolve}>Mark as resolved</button>
      )}
    </div>
  )
}
```

(Note: this step's snippet already includes the `field-phone` grid cell from Task 1 — if Task 1 already landed, only the `useNavigate` import, `canContact`, `handleContact`, and the new button JSX are new.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --run PostDetailPage`
Expected: PASS (all tests, including the three new ones)

- [ ] **Step 5: Add the button style to `theme.css`**

```css
.contact-publisher-button {
  display: inline-block;
  font-family: var(--font-family-body);
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--color-accent-contrast);
  background: var(--color-accent);
  border: none;
  border-radius: var(--radius-button);
  padding: var(--space-sm) var(--space-lg);
  cursor: pointer;
  margin-right: var(--space-sm);
}
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS, all files

- [ ] **Step 7: Run the production build to catch anything the test suite wouldn't**

Run: `npm run build`
Expected: build succeeds with no errors

- [ ] **Step 8: Commit**

```bash
git add src/features/posts/PostDetailPage.jsx src/features/posts/PostDetailPage.test.jsx src/features/layout/theme.css
git commit -m "Add Contact publisher button linking to the messages inbox"
```
