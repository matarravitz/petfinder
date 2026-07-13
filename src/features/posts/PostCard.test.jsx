import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PostCard from './PostCard.jsx'

function renderCard(post) {
  return render(
    <MemoryRouter>
      <PostCard post={post} />
    </MemoryRouter>
  )
}

test('renders a photo thumbnail when the post has one', () => {
  renderCard({
    id: 'p1',
    type: 'missing',
    species: 'cat',
    pet_name: 'Milo',
    location_text: 'Tel Aviv',
    post_photos: [{ storage_path: 'p1/photo.svg' }],
  })

  const photo = screen.getByRole('img')
  expect(photo).toHaveAttribute('src', expect.stringContaining('p1/photo.svg'))
  expect(photo).toHaveAttribute('alt', 'Missing cat named Milo')
})

test('renders no image when the post has no photos', () => {
  renderCard({
    id: 'p2',
    type: 'found',
    species: 'dog',
    location_text: 'Tel Aviv',
    post_photos: [],
  })

  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('uses the pet name in the heading for a missing post when known, species otherwise', () => {
  const { unmount } = renderCard({
    id: 'p3',
    type: 'missing',
    species: 'cat',
    pet_name: 'Milo',
    location_text: 'Tel Aviv',
    post_photos: [],
  })
  expect(screen.getByText('Missing: Milo')).toBeInTheDocument()
  unmount()

  renderCard({
    id: 'p4',
    type: 'missing',
    species: 'cat',
    location_text: 'Tel Aviv',
    post_photos: [],
  })
  expect(screen.getByText('Missing: cat')).toBeInTheDocument()
})

test('shows the reward in Shekels', () => {
  renderCard({
    id: 'p6',
    type: 'missing',
    species: 'cat',
    location_text: 'Tel Aviv',
    post_photos: [],
    reward_amount: 1500,
  })

  expect(screen.getByText('Reward: ₪1,500')).toBeInTheDocument()
})

test('shows who posted it, when known', () => {
  renderCard({
    id: 'p5',
    type: 'found',
    species: 'dog',
    location_text: 'Tel Aviv',
    post_photos: [],
    profiles: { display_name: 'Dana' },
  })

  expect(screen.getByText('Posted by Dana')).toBeInTheDocument()
})
