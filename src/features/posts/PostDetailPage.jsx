import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient.js'
import { getPost, resolvePost, listCandidatePostsForMatching } from './postsApi.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { buildPhotoUrl } from '../../lib/photoUrl.js'
import PawPrintIcon from '../layout/PawPrintIcon.jsx'
import PostCard from './PostCard.jsx'
import { findMatches, matchLabelForScore } from './matchPosts.js'

export default function PostDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const [error, setError] = useState(null)
  const [matches, setMatches] = useState([])
  const [matchesChecked, setMatchesChecked] = useState(false)
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [matchesError, setMatchesError] = useState(null)

  useEffect(() => {
    // Reset all post- and match-derived state before fetching the new post.
    // React Router reuses this component instance across in-app navigation
    // between /post/:id routes (no remount), so without this reset a new
    // post's data would render under the previous post's stale `matches`
    // (and `matchesChecked` would still be `true`, skipping the auto-check
    // effect below for the new post entirely).
    setPost(null)
    setError(null)
    setMatches([])
    setMatchesChecked(false)
    setMatchesLoading(false)
    setMatchesError(null)

    getPost(supabase, id)
      .then(setPost)
      .catch((err) => setError(err.message))
  }, [id])

  async function checkForMatches(currentPost) {
    setMatchesLoading(true)
    setMatchesError(null)
    try {
      const oppositeType = currentPost.type === 'missing' ? 'found' : 'missing'
      const candidates = await listCandidatePostsForMatching(supabase, {
        type: oppositeType,
        species: currentPost.species,
        excludePostId: currentPost.id,
      })
      setMatches(findMatches(currentPost, candidates))
    } catch {
      setMatchesError("Couldn't check for matches right now.")
    } finally {
      setMatchesLoading(false)
      setMatchesChecked(true)
    }
  }

  // Runs once, automatically, the first time the owner views their own active
  // post — this is the "automatic" half of match-checking (pull-based, on
  // view, not a push notification). Computed from `user`/`post` directly
  // (not the render-scoped `isOwner` below, which is defined after the early
  // returns) so this hook can be called unconditionally, before those returns.
  useEffect(() => {
    if (post && user && user.id === post.owner_id && post.status === 'active' && !matchesChecked) {
      checkForMatches(post)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post, user])

  if (error) return <p role="alert">{error}</p>
  if (!post) return <p>Loading...</p>

  const isOwner = user && user.id === post.owner_id
  const canContact = user && !isOwner

  async function handleResolve() {
    await resolvePost(supabase, post.id)
    setPost((prev) => ({ ...prev, status: 'resolved' }))
  }

  function handleContact() {
    navigate('/messages', {
      state: {
        openPostId: post.id,
        otherUser: { id: post.owner_id, displayName: post.profiles?.display_name ?? null },
        postSummary: {
          type: post.type,
          species: post.species,
          petName: post.pet_name || null,
          photoUrl: post.post_photos?.[0] ? buildPhotoUrl(post.post_photos[0].storage_path) : null,
        },
      },
    })
  }

  const isMissing = post.type === 'missing'
  const posterName = post.profiles?.display_name

  return (
    <div>
      <h2>
        {isMissing ? 'Missing' : 'Found'}: {post.species}
        {isMissing && post.pet_name ? ` — ${post.pet_name}` : ''}
      </h2>
      {posterName && <p className="post-posted-by">Posted by {posterName}</p>}

      {post.status === 'resolved' && (
        <div className="resolved-banner">
          <PawPrintIcon size={22} />
          <span>
            {isMissing && post.pet_name ? post.pet_name : 'This pet'} has been reunited with their
            family.
          </span>
        </div>
      )}

      {post.post_photos && post.post_photos.length > 0 && (
        <div className="post-detail-photos">
          {post.post_photos.map((photo) => (
            <img
              key={photo.id || photo.storage_path}
              className="post-detail-photo"
              src={buildPhotoUrl(photo.storage_path)}
              alt={`${isMissing ? 'Missing' : 'Found'} ${post.species}`}
            />
          ))}
        </div>
      )}

      <dl className="post-detail-fields">
        <div className="post-detail-field field-location">
          <dt>Location</dt>
          <dd>{post.location_text}</dd>
        </div>
        <div className="post-detail-field field-date">
          <dt>Date {isMissing ? 'lost' : 'found'}</dt>
          <dd>{post.date_lost_or_found}</dd>
        </div>
        <div className="post-detail-field field-breed">
          <dt>Breed</dt>
          <dd>{post.breed || '—'}</dd>
        </div>
        <div className="post-detail-field field-color">
          <dt>Color</dt>
          <dd>{post.color || '—'}</dd>
        </div>
        <div className="post-detail-field field-size">
          <dt>Size</dt>
          <dd>{post.size || '—'}</dd>
        </div>
        <div className="post-detail-field field-microchipped">
          <dt>Microchipped</dt>
          <dd>{post.microchipped}</dd>
        </div>
        <div className="post-detail-field field-collar">
          <dt>Collar</dt>
          <dd>{post.collar ? post.collar_description || 'Yes' : 'No'}</dd>
        </div>
        <div className="post-detail-field field-markings">
          <dt>Distinctive markings</dt>
          <dd>{post.distinctive_markings || '—'}</dd>
        </div>
        <div className="post-detail-field field-phone">
          <dt>Phone</dt>
          <dd>{post.phone_number ? <a href={`tel:${post.phone_number}`}>{post.phone_number}</a> : '—'}</dd>
        </div>
      </dl>

      {isMissing && post.reward_amount && (
        <p className="post-detail-reward">Reward: ₪{Number(post.reward_amount).toLocaleString()}</p>
      )}

      {canContact && (
        <button type="button" className="contact-publisher-button" onClick={handleContact}>
          Contact publisher
        </button>
      )}

      {isOwner && post.status !== 'resolved' && (
        <button onClick={handleResolve}>Mark as resolved</button>
      )}

      {isOwner && post.status === 'active' && (
        <div className="possible-matches">
          <h3 className="possible-matches-title">Possible Matches</h3>
          {matchesError && <p className="possible-matches-error">{matchesError}</p>}
          {matchesChecked && !matchesLoading && matches.length === 0 && !matchesError && (
            <p className="possible-matches-empty">No possible matches found yet.</p>
          )}
          {matches.length > 0 && (
            <div className="possible-matches-list">
              {matches.map(({ post: candidate, score }) => (
                <div key={candidate.id} className="match-card">
                  <span className="match-score-badge">{matchLabelForScore(score)}</span>
                  <PostCard post={candidate} />
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="possible-matches-recheck-button"
            onClick={() => checkForMatches(post)}
            disabled={matchesLoading}
          >
            {matchesLoading ? 'Checking…' : 'Check for new matches'}
          </button>
        </div>
      )}
    </div>
  )
}
