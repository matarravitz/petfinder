import { createFakeQuery, createFakeSupabase } from '../../testUtils/fakeSupabase.js'
import {
  listPosts,
  getPost,
  createPost,
  resolvePost,
  listCandidatePostsForMatching,
  deletePost,
  listPostsByOwner,
  renewPost,
  bumpPost,
} from './postsApi.js'

test('listPosts returns the query result data', async () => {
  const postsQuery = createFakeQuery({ data: [{ id: 'p1' }], error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  const result = await listPosts(supabase)
  expect(result).toEqual([{ id: 'p1' }])
})

test('getPost returns a single post by id', async () => {
  const postsQuery = createFakeQuery({ data: { id: 'p1' }, error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  const result = await getPost(supabase, 'p1')
  expect(result).toEqual({ id: 'p1' })
})

test('createPost inserts the post, uploads photos, and inserts photo rows', async () => {
  const postsQuery = createFakeQuery({ data: { id: 'p1' }, error: null })
  const photosQuery = createFakeQuery({ data: null, error: null })
  const uploadFn = vi.fn(() => Promise.resolve({ error: null }))
  const supabase = createFakeSupabase({
    posts: postsQuery,
    post_photos: photosQuery,
    storage: { 'post-photos': { upload: uploadFn } },
  })

  const file = { name: 'cat.jpg' }
  const post = await createPost(supabase, { species: 'cat' }, [file])

  expect(post).toEqual({ id: 'p1' })
  expect(uploadFn).toHaveBeenCalledWith('p1/cat.jpg', file)
})

test('resolvePost updates the post status to resolved', async () => {
  const postsQuery = createFakeQuery({ data: null, error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  await expect(resolvePost(supabase, 'p1')).resolves.toBeUndefined()
})

test('deletePost deletes the post by id', async () => {
  const postsQuery = createFakeQuery({ data: null, error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  await expect(deletePost(supabase, 'p1')).resolves.toBeUndefined()
})

test('listPostsByOwner returns posts belonging to the given owner', async () => {
  const postsQuery = createFakeQuery({ data: [{ id: 'p3' }], error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  const result = await listPostsByOwner(supabase, 'owner-1')
  expect(result).toEqual([{ id: 'p3' }])
})

test('renewPost updates renewed_at to reset the expiry window', async () => {
  const postsQuery = createFakeQuery({ data: null, error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  await expect(renewPost(supabase, 'p1')).resolves.toBeUndefined()
})

test('bumpPost updates bumped_at to move the post to the top', async () => {
  const postsQuery = createFakeQuery({ data: null, error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  await expect(bumpPost(supabase, 'p1')).resolves.toBeUndefined()
})

test('listCandidatePostsForMatching returns candidate posts for the opposite type/species', async () => {
  const postsQuery = createFakeQuery({ data: [{ id: 'p2' }], error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  const result = await listCandidatePostsForMatching(supabase, {
    type: 'found',
    species: 'cat',
    excludePostId: 'p1',
  })
  expect(result).toEqual([{ id: 'p2' }])
})
