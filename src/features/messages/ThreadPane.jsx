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
