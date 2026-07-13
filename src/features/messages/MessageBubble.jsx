export default function MessageBubble({ message }) {
  return (
    <p className={`message-bubble ${message.fromMe ? 'message-bubble-mine' : 'message-bubble-theirs'}`}>
      {message.text}
    </p>
  )
}
