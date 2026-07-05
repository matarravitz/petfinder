import { createFakeQuery, createFakeSupabase } from './fakeSupabase.js'

test('createFakeQuery resolves chained calls to the given result', async () => {
  const query = createFakeQuery({ data: [{ id: 1 }], error: null })
  const result = await query.select('*').order('created_at')
  expect(result).toEqual({ data: [{ id: 1 }], error: null })
})

test('createFakeQuery.single resolves directly to the given result', async () => {
  const query = createFakeQuery({ data: { id: 1 }, error: null })
  const result = await query.select('*').eq('id', 1).single()
  expect(result).toEqual({ data: { id: 1 }, error: null })
})

test('createFakeSupabase routes table names to the right fake query', async () => {
  const postsQuery = createFakeQuery({ data: [{ id: 'p1' }], error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  const result = await supabase.from('posts').select('*')
  expect(result).toEqual({ data: [{ id: 'p1' }], error: null })
})
