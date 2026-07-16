import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient.js'
import { listPostsByOwner, deletePost, deletePosts, renewPost, bumpPost } from './postsApi.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { isExpired, isExpiringSoon, daysUntilExpiry } from './postExpiry.js'
import { canBump, hoursUntilNextBump } from './postBump.js'
import PostCard from './PostCard.jsx'
import BellIcon from './BellIcon.jsx'

function postLabel(post) {
  return post.pet_name || (post.type === 'missing' ? 'This missing pet' : 'This found pet')
}

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
      .then(async (fetchedPosts) => {
        // Lazy expiry sweep: this app has no backend scheduler (see
        // postExpiry.js), so expired active posts only actually get deleted
        // the next time the owner's own dashboard loads. Browse already hides
        // expired posts immediately regardless (see filterPosts.js) — this is
        // what makes that eventually consistent. The sweep itself is a single
        // batched delete (not one call per post) so a transient failure here
        // can't take down the whole page — it's caught locally and only
        // affects whether the sweep's own cleanup happened, not the posts
        // list that's about to render.
        const now = new Date()
        const expired = fetchedPosts.filter((post) => post.status === 'active' && isExpired(post, now))
        const expiredIds = new Set(expired.map((post) => post.id))
        if (expired.length > 0) {
          try {
            await deletePosts(supabase, expired.map((post) => post.id))
          } catch {
            // Non-fatal: the posts are still hidden from view below (and
            // already hidden from Browse via filterPosts.js) even if the
            // actual delete failed — the next dashboard load will retry.
          }
        }
        setPosts(fetchedPosts.filter((post) => !expiredIds.has(post.id)))
      })
      .catch((err) => setError(err.message))
  }, [user, authLoading, navigate])

  async function handleRenew(postId) {
    await renewPost(supabase, postId)
    setPosts((prev) =>
      prev.map((post) => (post.id === postId ? { ...post, renewed_at: new Date().toISOString() } : post))
    )
  }

  async function handleRemove(postId) {
    const confirmed = window.confirm('Remove this post? This cannot be undone.')
    if (!confirmed) return
    await deletePost(supabase, postId)
    setPosts((prev) => prev.filter((post) => post.id !== postId))
  }

  async function handleBump(postId) {
    await bumpPost(supabase, postId)
    setPosts((prev) =>
      prev.map((post) => (post.id === postId ? { ...post, bumped_at: new Date().toISOString() } : post))
    )
  }

  if (authLoading || !user) return <p>Loading...</p>
  if (error) return <p role="alert">{error}</p>
  if (!posts) return <p>Loading...</p>

  const now = new Date()
  const activePosts = posts.filter((post) => post.status === 'active')
  const resolvedPosts = posts.filter((post) => post.status === 'resolved')
  const expiringSoonPosts = activePosts.filter((post) => isExpiringSoon(post, now))

  return (
    <div>
      <h2>My Posts</h2>

      {posts.length === 0 && (
        <p className="browse-empty">
          You haven&apos;t posted anything yet. <Link to="/post/new">Report a missing or found pet</Link> to get
          started.
        </p>
      )}

      {expiringSoonPosts.length > 0 && (
        <div className="expiry-notifications">
          <h3 className="expiry-notifications-title">Posts expiring soon</h3>
          {expiringSoonPosts.map((post) => {
            const days = daysUntilExpiry(post, now)
            return (
              <div key={post.id} className="expiry-notification">
                <p className="expiry-notification-text">
                  {postLabel(post)} will be automatically removed in {days} day{days === 1 ? '' : 's'} unless you
                  let us know it&apos;s still needed.
                </p>
                <div className="status-update-actions">
                  <button type="button" className="status-update-confirm-button" onClick={() => handleRenew(post.id)}>
                    Still looking — keep it up
                  </button>
                  <button
                    type="button"
                    className="status-update-remove-button"
                    onClick={() => handleRemove(post.id)}
                  >
                    Remove post
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activePosts.length > 0 && (
        <div className="my-posts-section">
          <h3 className="my-posts-section-title">Active</h3>
          <div className="post-grid">
            {activePosts.map((post) => {
              const bumpAllowed = canBump(post, now)
              return (
                <div key={post.id} className="my-post-card">
                  <button
                    type="button"
                    className="my-post-bump-button"
                    onClick={() => handleBump(post.id)}
                    disabled={!bumpAllowed}
                    aria-label={
                      bumpAllowed
                        ? 'Bump this post to the top of search results'
                        : `You can bump this post again in ${hoursUntilNextBump(post, now)} hours`
                    }
                    title={
                      bumpAllowed
                        ? 'Bump this post to the top of search results'
                        : `You can bump this post again in ${hoursUntilNextBump(post, now)} hours`
                    }
                  >
                    <BellIcon />
                  </button>
                  <PostCard post={post} />
                  <button type="button" className="my-post-remove-button" onClick={() => handleRemove(post.id)}>
                    Remove
                  </button>
                </div>
              )
            })}
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
