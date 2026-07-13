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
