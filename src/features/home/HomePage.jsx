import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient.js'
import { listPosts } from '../posts/postsApi.js'
import PostCard from '../posts/PostCard.jsx'
import PawPrintIcon from '../layout/PawPrintIcon.jsx'

const STEPS = [
  {
    title: 'Post',
    body: 'Report a missing pet with a photo and details, or post one you found nearby.',
  },
  {
    title: 'Search',
    body: 'Browse missing and found posts near you, filtered by distance and species.',
  },
  {
    title: 'Reunite',
    body: 'Message the poster directly, and mark the post resolved once you’re reunited.',
  },
]

export default function HomePage() {
  const [recentPosts, setRecentPosts] = useState([])
  const [reunitedCount, setReunitedCount] = useState(0)

  useEffect(() => {
    listPosts(supabase)
      .then((posts) => {
        setRecentPosts(posts.filter((post) => post.status === 'active').slice(0, 3))
        setReunitedCount(posts.filter((post) => post.status === 'resolved').length)
      })
      .catch(() => setRecentPosts([]))
  }, [])

  return (
    <div>
      <div className="home-hero">
        <h2 className="home-heading">Reunite lost pets with the people looking for them</h2>
        <p className="home-lede">
          Lost a pet? Post their photo and details so people nearby can help look. Found one?
          Browse missing pet posts, or let your community know what you found.
        </p>
        {reunitedCount > 0 && (
          <p className="home-stat">
            <PawPrintIcon size={16} />
            {reunitedCount} {reunitedCount === 1 ? 'pet has' : 'pets have'} been reunited with their
            family through PetFinder
          </p>
        )}
        <div className="home-actions">
          <Link className="home-action home-action-primary" to="/browse">
            Browse missing &amp; found pets
          </Link>
          <Link className="home-action home-action-secondary" to="/post/new">
            Report a pet
          </Link>
        </div>
      </div>

      <section>
        <h3 className="home-section-title">How it works</h3>
        <div className="how-it-works">
          {STEPS.map((step, index) => (
            <div className="how-it-works-step" key={step.title}>
              <span className="step-number">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="home-preview-header">
          <h3 className="home-section-title">Recently posted</h3>
          <Link to="/browse">See all →</Link>
        </div>
        {recentPosts.length > 0 ? (
          <div className="post-grid">
            {recentPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <p className="home-preview-empty">
            No pets posted yet — when someone needs help nearby, you'll see them here first.
          </p>
        )}
      </section>
    </div>
  )
}
