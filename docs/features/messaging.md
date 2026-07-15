# Feature: In-site messaging

**Status:** implemented (visual-only prototype — see Non-goals).
**Last updated:** 2026-07-15

## Goal

Let a post's viewer contact its owner without leaving the site, and let logged-in users see and reply to their conversations from a dedicated inbox. This pass ships the phone number field for real, and the chat/messaging UI as a **visual-only prototype** — no real backend for chat yet (see Non-goals).

## Non-goals (this pass)

- No `messages`/`conversations` database tables, migrations, RLS policies, or realtime subscriptions.
- No persistence: mock conversation state lives in memory for the session and resets on page reload.
- No native-app UX — that's a separate, later effort. Platform-specific ideas (e.g. the app version using a different navigation pattern) are tracked in `docs/future-app-ideas.md`, not built here.

## Data model changes (real, not mocked)

Add `phone_number` (nullable `text`) to `posts`, via a new migration following the same pattern as `reward_amount` (`supabase/migrations/0001_init.sql`) — optional, no format validation beyond basic client-side sanity (digits/+/spaces/dashes).

- `CreatePostForm.jsx`: new optional "Phone number" field in the "About the pet" section, alongside the other optional fields.
- `buildPostPayload.js`: pass `phone_number` through (`null` when empty), same as `breed`/`color`.
- `PostDetailPage.jsx`: show it in the existing `.post-detail-fields` grid as a new field, rendered as a `tel:` link when present, `—` when absent (matches the existing convention for optional fields like breed/color/size).

## Routes & navigation

- New route: `/messages`.
- New nav link "Messages" in `Layout.jsx`, visible only when logged in — same conditional used for the existing "Log out" button (`user` truthy from `useAuth()`).

## Layout: split-pane (WhatsApp Web style)

One page, two panes, shown together:
- **Left (list):** all conversations. Each row: pet thumbnail, other person's name, which post it's about, last message preview, timestamp, unread dot.
- **Right (thread):** the active conversation. Header: pet photo + other person's name + post reference (no back button — both panes are always visible, unlike a mobile flow). Message bubbles: theirs left/neutral, mine right/accent-colored. Input box pinned to the bottom of the pane.
- Selecting a row in the list sets the active thread; the thread pane is empty (with a hint like "Select a conversation") until one is chosen. Selecting a row also clears that conversation's `unread` flag in local state.
- The thread pane's send input is disabled/no-ops on empty or whitespace-only text, same pattern as the rest of the app's forms.
- **Deleting a conversation:** each row has a second, icon-only delete button (`TrashIcon.jsx`) as a sibling of the select button, not nested inside it — same "two sibling buttons, not nested" pattern as the row itself (a `<button>` can't contain another `<button>`). Confirms via native `window.confirm('Delete this conversation? This cannot be undone.')` before removing it from state (`MessagesPage.handleDelete`); if the deleted conversation was active, `activeId` is cleared back to `null`. No undo — matches this app's other native-confirm destructive actions.

**Responsive fallback (narrow browser windows, not the native app):** below a breakpoint (reuse the existing `640px` breakpoint pattern from `theme.css`), show only one pane at a time — the list by default, switching to the thread pane (with a back control) once a conversation is selected. This is a responsive fallback for the web page on a phone browser, not the native-app design — that's a separate future effort per `docs/future-app-ideas.md`.

## Components (`src/features/messages/`, new folder)

- `MessagesPage.jsx` — owns which conversation is active (`useState`), renders the split pane (or the responsive single-pane fallback), and reads `location.state` (see Contact button below) to open/create a thread on arrival.
- `ConversationList.jsx` — maps conversations to `ConversationRow`, forwards `onSelect`/`onDelete`.
- `ConversationRow.jsx` — a wrapper `div` with two sibling `<button>`s: `.conversation-row-select` (pet thumbnail, other person's name, post reference, last message preview, timestamp, unread dot) and `.conversation-row-delete` (icon-only, `TrashIcon.jsx`, `aria-label="Delete conversation with <name>"`) — see Deleting a conversation above.
- `TrashIcon.jsx` — inline SVG, same hand-drawn-icon pattern as `PawPrintIcon`.
- `ThreadPane.jsx` — header + scrollable message list + input box.
- `MessageBubble.jsx` — one message bubble, styled left/right by a `fromMe` boolean.
- `mockConversations.js` — fixture data module (see below). Not a Supabase call.

## Mock data shape

```js
// mockConversations.js
export function createInitialConversations() {
  return [
    {
      id: 'conv-1',
      postId: 'post-milo',
      postSummary: { type: 'missing', species: 'cat', petName: 'Milo', photoUrl: null },
      otherUser: { id: 'user-dana', displayName: 'Dana' },
      unread: true,
      messages: [
        { id: 'm1', fromMe: false, text: 'Hi, I think I saw her near the park', sentAt: '2026-07-12T14:10:00Z' },
        { id: 'm2', fromMe: true, text: 'Really?! Which park?', sentAt: '2026-07-12T14:14:00Z' },
      ],
    },
    // 2-3 fixture conversations total, tied to existing seeded demo posts
  ]
}
```

Exported as a function (not a plain array constant) so every call returns a fresh array — `MessagesPage` calls it as the `useState` initializer, and a shared mutable export would let mutations from one test/session leak into another.

`fromMe: boolean` (not a real user id) keeps bubble styling simple since nothing here is tied to real auth state — this is fixture data, not persisted per-user data.

`MessagesPage` holds `conversations` in `useState(createInitialConversations)`; sending a message or opening a new thread from "Contact publisher" only updates this in-memory state. A page reload reverts to the fixture list — documented, expected behavior for this pass, not a bug.

## "Contact publisher" button

- Shown on `PostDetailPage.jsx` only when logged in **and** viewing someone else's post — same visibility logic as the existing owner-only "Mark as resolved" button, inverted (`user && user.id !== post.owner_id`).
- On click: `navigate('/messages', { state: { openPostId: post.id, otherUser: { id: post.owner_id, displayName: post.profiles?.display_name }, postSummary: {...} } })`.
- `MessagesPage` reads `location.state` on mount: if a conversation for that `postId` + `otherUser.id` already exists in fixture/session state, open it; otherwise create a new empty one (no messages yet) and select it.

## Testing

Vitest + RTL, same patterns as the rest of the app, exercised against fixture data — no Supabase mocking needed for chat this pass:
- `ConversationList.test.jsx` / `ConversationRow.test.jsx` — renders rows with the right content, click selects a conversation, delete button confirms via mocked `window.confirm` before calling `onDelete`.
- `ThreadPane.test.jsx` — renders messages with correct left/right bubble styling, typing + sending appends a message.
- `MessagesPage.test.jsx` — arriving via router state with `openPostId` opens/creates the right thread.
- `PostDetailPage.test.jsx` — update for the new phone number field (tel: link / `—` fallback) and the Contact button's visibility logic.
- `CreatePostForm.test.jsx` — update for the new phone number field.

## Follow-up (explicitly out of scope here)

Wiring this to a real backend (tables, RLS, realtime, persistence across reload/devices) is a later, separate pass — not scheduled yet.
