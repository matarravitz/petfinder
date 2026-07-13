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
