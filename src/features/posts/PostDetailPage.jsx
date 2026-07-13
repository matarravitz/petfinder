import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient.js'
import { getPost, resolvePost } from './postsApi.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { buildPhotoUrl } from '../../lib/photoUrl.js'
import PawPrintIcon from '../layout/PawPrintIcon.jsx'

export default function PostDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
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
  const canContact = user && !isOwner

  async function handleResolve() {
    await resolvePost(supabase, post.id)
    setPost((prev) => ({ ...prev, status: 'resolved' }))
  }

  function handleContact() {
    navigate('/messages', {
      state: {
        openPostId: post.id,
        otherUser: { id: post.owner_id, displayName: post.profiles?.display_name },
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
    </div>
  )
}
