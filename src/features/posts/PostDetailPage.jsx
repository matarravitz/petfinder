import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient.js'
import { getPost, resolvePost } from './postsApi.js'
import { useAuth } from '../auth/AuthContext.jsx'

export default function PostDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
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

  async function handleResolve() {
    await resolvePost(supabase, post.id)
    setPost((prev) => ({ ...prev, status: 'resolved' }))
  }

  return (
    <div>
      <h2>
        {post.type === 'missing' ? 'Missing' : 'Found'}: {post.species}
      </h2>
      <p>Location: {post.location_text}</p>
      {isOwner && post.status !== 'resolved' && (
        <button onClick={handleResolve}>Mark as resolved</button>
      )}
    </div>
  )
}
