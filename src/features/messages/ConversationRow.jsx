import { formatPostReference } from './mockConversations.js'
import TrashIcon from './TrashIcon.jsx'

export default function ConversationRow({ conversation, active, onClick, onDelete }) {
  const lastMessage = conversation.messages[conversation.messages.length - 1]
  const preview = lastMessage ? `${lastMessage.fromMe ? 'You: ' : ''}${lastMessage.text}` : ''

  function handleDeleteClick() {
    const confirmed = window.confirm('Delete this conversation? This cannot be undone.')
    if (confirmed) onDelete(conversation.id)
  }

  return (
    <div className={`conversation-row${active ? ' conversation-row-active' : ''}`}>
      <button
        type="button"
        className="conversation-row-select"
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
      <button
        type="button"
        className="conversation-row-delete"
        onClick={handleDeleteClick}
        aria-label={`Delete conversation with ${conversation.otherUser.displayName}`}
      >
        <TrashIcon />
      </button>
    </div>
  )
}
