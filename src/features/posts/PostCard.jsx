import { Link } from 'react-router-dom'
import { buildPhotoUrl } from '../../lib/photoUrl.js'

export default function PostCard({ post }) {
  const [firstPhoto] = post.post_photos || []
  const posterName = post.profiles?.display_name

  return (
    <Link to={`/post/${post.id}`} className="post-card">
      {firstPhoto && (
        <img
          className="post-card-photo"
          src={buildPhotoUrl(firstPhoto.storage_path)}
          alt={`${post.type === 'missing' ? 'Missing' : 'Found'} ${post.species}${post.pet_name ? ` named ${post.pet_name}` : ''}`}
        />
      )}
      <div className="post-card-body">
        <h3>
          {post.type === 'missing' ? 'Missing' : 'Found'}
          {post.type === 'missing' && post.pet_name ? `: ${post.pet_name}` : `: ${post.species}`}
        </h3>
        {post.breed && <p>Breed: {post.breed}</p>}
        <p>Location: {post.location_text}</p>
        {post.distanceKm != null && <p>{post.distanceKm.toFixed(1)} km away</p>}
        {post.reward_amount && (
          <p className="post-card-reward">Reward: ₪{Number(post.reward_amount).toLocaleString()}</p>
        )}
        <div className="post-card-footer">
          {posterName && <span className="post-posted-by">Posted by {posterName}</span>}
          <span className="post-card-view-link">View details</span>
        </div>
      </div>
    </Link>
  )
}
