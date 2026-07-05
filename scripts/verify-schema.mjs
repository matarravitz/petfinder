import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => line.split('=', 2))
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
  email: 'schema-check@example.com',
  password: 'schema-check-password',
  email_confirm: true,
})
if (authError) throw authError

const { error: profileError } = await supabase
  .from('profiles')
  .insert({ id: authUser.user.id, display_name: 'Schema Check' })
if (profileError) throw profileError

const { data: post, error: postError } = await supabase
  .from('posts')
  .insert({
    owner_id: authUser.user.id,
    type: 'missing',
    species: 'cat',
    location_lat: 32.08,
    location_lng: 34.78,
    location_text: 'Tel Aviv',
    date_lost_or_found: '2026-07-01',
  })
  .select()
  .single()
if (postError) throw postError

console.log('Schema check passed. Cleaning up...')
await supabase.from('posts').delete().eq('id', post.id)
await supabase.auth.admin.deleteUser(authUser.user.id)
console.log('OK')
