import { Link } from 'react-router-dom'

export default function PostCard({ post }) {
  return (
    <article>
      <h3>
        {post.type === 'missing' ? 'Missing' : 'Found'}: {post.species}
      </h3>
      {post.breed && <p>Breed: {post.breed}</p>}
      <p>Location: {post.location_text}</p>
      {post.distanceKm != null && <p>{post.distanceKm.toFixed(1)} km away</p>}
      {post.reward_amount && <p>Reward: {post.reward_amount}</p>}
      <Link to={`/post/${post.id}`}>View details</Link>
    </article>
  )
}
