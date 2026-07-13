import { buildPhotoUrl } from './photoUrl.js'

test('builds the public storage URL for a photo path', () => {
  expect(buildPhotoUrl('post-1/cat.jpg')).toBe(
    `${window.location.origin}/storage/v1/object/public/post-photos/post-1/cat.jpg`
  )
})
