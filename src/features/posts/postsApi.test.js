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

test('deletePost removes the post\'s storage files before deleting the post row', async () => {
  const postsQuery = createFakeQuery({ data: null, error: null })
  const photosQuery = createFakeQuery({ data: [{ storage_path: 'p1/dog.jpg' }], error: null })
  const removeFn = vi.fn(() => Promise.resolve({ error: null }))
  const supabase = createFakeSupabase({
    posts: postsQuery,
    post_photos: photosQuery,
    storage: { 'post-photos': { upload: vi.fn(), remove: removeFn } },
  })

  await expect(deletePost(supabase, 'p1')).resolves.toBeUndefined()
  expect(removeFn).toHaveBeenCalledWith(['p1/dog.jpg'])
})

test('deletePost skips the storage remove call when the post has no photos', async () => {
  const postsQuery = createFakeQuery({ data: null, error: null })
  const photosQuery = createFakeQuery({ data: [], error: null })
  const removeFn = vi.fn(() => Promise.resolve({ error: null }))
  const supabase = createFakeSupabase({
    posts: postsQuery,
    post_photos: photosQuery,
    storage: { 'post-photos': { upload: vi.fn(), remove: removeFn } },
  })

  await expect(deletePost(supabase, 'p1')).resolves.toBeUndefined()
  expect(removeFn).not.toHaveBeenCalled()
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

test('bumpPost calls the bump_post RPC with the post id', async () => {
  const rpcFn = vi.fn(() => Promise.resolve({ error: null }))
  const supabase = createFakeSupabase({ rpc: rpcFn })
  await expect(bumpPost(supabase, 'p1')).resolves.toBeUndefined()
  expect(rpcFn).toHaveBeenCalledWith('bump_post', { post_id: 'p1' })
})

test('bumpPost throws when the RPC returns an error', async () => {
  const rpcFn = vi.fn(() => Promise.resolve({ error: new Error('cooldown active') }))
  const supabase = createFakeSupabase({ rpc: rpcFn })
  await expect(bumpPost(supabase, 'p1')).rejects.toThrow('cooldown active')
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
