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
