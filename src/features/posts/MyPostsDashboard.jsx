import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient.js'
import { listPostsByOwner } from './postsApi.js'
import { useAuth } from '../auth/AuthContext.jsx'
import PostCard from './PostCard.jsx'

export default function MyPostsDashboard() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [posts, setPosts] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Wait for the initial session check (AuthContext's `loading`) before
    // deciding to redirect — otherwise a genuinely logged-in user briefly
    // bounces to /login on every load, before their session has resolved.
    if (authLoading) return
    if (!user) {
      navigate('/login', { state: { from: '/my-posts' } })
      return
    }
    listPostsByOwner(supabase, user.id)
      .then(setPosts)
      .catch((err) => setError(err.message))
  }, [user, authLoading, navigate])

  if (authLoading || !user) return <p>Loading...</p>
  if (error) return <p role="alert">{error}</p>
  if (!posts) return <p>Loading...</p>

  const activePosts = posts.filter((post) => post.status === 'active')
  const resolvedPosts = posts.filter((post) => post.status === 'resolved')

  return (
    <div>
      <h2>My Posts</h2>

      {posts.length === 0 && (
        <p className="browse-empty">
          You haven&apos;t posted anything yet. <Link to="/post/new">Report a missing or found pet</Link> to get
          started.
        </p>
      )}

      {activePosts.length > 0 && (
        <div className="my-posts-section">
          <h3 className="my-posts-section-title">Active</h3>
          <div className="post-grid">
            {activePosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </div>
      )}

      {resolvedPosts.length > 0 && (
        <div className="my-posts-section my-posts-section-resolved">
          <h3 className="my-posts-section-title">Resolved</h3>
          <div className="post-grid">
            {resolvedPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
