import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => line.split('=', 2))
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function getOrCreateDemoUser(email, displayName) {
  const { data: existing } = await supabase.from('profiles').select('id').eq('display_name', displayName).maybeSingle()
  if (existing) return existing.id

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: 'demo-password-123',
    email_confirm: true,
  })
  if (authError) throw authError

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: authUser.user.id, display_name: displayName })
  if (profileError) throw profileError

  return authUser.user.id
}

function photoUrlForSpecies(species) {
  switch (species) {
    case 'dog':
      return 'https://placedog.net/600/450?random'
    case 'cat':
      return 'https://cataas.com/cat?width=600&height=450'
    default:
      return `https://loremflickr.com/600/450/${encodeURIComponent(species)},pet`
  }
}

async function fetchPhoto(species) {
  const response = await fetch(photoUrlForSpecies(species))
  if (!response.ok) throw new Error(`Failed to fetch a photo for species "${species}": ${response.status}`)
  const arrayBuffer = await response.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') || 'image/jpeg',
  }
}

const ownerId = await getOrCreateDemoUser('demo-owner@example.com', 'Demo Owner')
const finderId = await getOrCreateDemoUser('demo-finder@example.com', 'Demo Finder')

// Idempotent: clear out any posts from a previous run of this script before reseeding.
await supabase.from('posts').delete().eq('owner_id', ownerId)
await supabase.from('posts').delete().eq('owner_id', finderId)

const posts = [
  {
    owner_id: ownerId,
    type: 'missing',
    species: 'cat',
    breed: 'Tabby',
    color: 'orange and white',
    size: 'small',
    collar: true,
    collar_description: 'blue collar with a bell',
    microchipped: 'yes',
    distinctive_markings: 'white paw on front left foot',
    pet_name: 'Milo',
    reward_amount: 100,
    location_lat: 32.0853,
    location_lng: 34.7818,
    location_text: 'Tel Aviv, near Rothschild Blvd',
    date_lost_or_found: '2026-07-02',
    status: 'active',
  },
  {
    owner_id: ownerId,
    type: 'missing',
    species: 'dog',
    breed: 'Labrador mix',
    color: 'brown',
    size: 'large',
    collar: false,
    microchipped: 'unknown',
    distinctive_markings: 'floppy left ear, scar near tail',
    pet_name: 'Rex',
    reward_amount: null,
    location_lat: 32.0668,
    location_lng: 34.7647,
    location_text: 'Tel Aviv, Florentin',
    date_lost_or_found: '2026-06-28',
    status: 'active',
  },
  {
    owner_id: ownerId,
    type: 'missing',
    species: 'rabbit',
    breed: null,
    color: 'gray',
    size: 'small',
    collar: false,
    microchipped: 'no',
    distinctive_markings: 'one floppy ear',
    pet_name: 'Nibbles',
    reward_amount: 50,
    location_lat: 32.109,
    location_lng: 34.855,
    location_text: 'Ramat HaSharon',
    date_lost_or_found: '2026-07-03',
    status: 'active',
  },
  {
    owner_id: finderId,
    type: 'found',
    species: 'cat',
    breed: null,
    color: 'black',
    size: 'medium',
    collar: false,
    microchipped: 'unknown',
    distinctive_markings: 'green eyes, very friendly',
    location_lat: 32.0784,
    location_lng: 34.7735,
    location_text: 'Tel Aviv, Neve Tzedek',
    date_lost_or_found: '2026-07-04',
    status: 'active',
  },
  {
    owner_id: finderId,
    type: 'found',
    species: 'dog',
    breed: 'Terrier mix',
    color: 'white and brown',
    size: 'small',
    collar: true,
    collar_description: 'red collar, no tag',
    microchipped: 'unknown',
    distinctive_markings: null,
    location_lat: 32.062,
    location_lng: 34.775,
    location_text: 'Tel Aviv, Jaffa',
    date_lost_or_found: '2026-07-01',
    status: 'active',
  },
  {
    owner_id: ownerId,
    type: 'missing',
    species: 'cat',
    breed: 'Siamese',
    color: 'cream and brown',
    size: 'small',
    collar: true,
    collar_description: 'pink collar',
    microchipped: 'yes',
    distinctive_markings: null,
    pet_name: 'Luna',
    reward_amount: 200,
    location_lat: 32.0853,
    location_lng: 34.7818,
    location_text: 'Tel Aviv, near Rothschild Blvd',
    date_lost_or_found: '2026-05-20',
    status: 'resolved',
  },
]

for (const post of posts) {
  const { data: created, error } = await supabase.from('posts').insert(post).select().single()
  if (error) throw error

  const { buffer, contentType } = await fetchPhoto(post.species)
  const extension = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : 'jpg'
  const storagePath = `${created.id}/photo.${extension}`
  const { error: uploadError } = await supabase.storage
    .from('post-photos')
    .upload(storagePath, buffer, { contentType })
  if (uploadError) throw uploadError

  const { error: photoRowError } = await supabase
    .from('post_photos')
    .insert({ post_id: created.id, storage_path: storagePath })
  if (photoRowError) throw photoRowError

  console.log(`  photo for ${post.species} (${post.type}) — ${storagePath}`)
}

console.log(
  `Seeded ${posts.length} test posts with real photos (${posts.filter((p) => p.status === 'active').length} active, ${posts.filter((p) => p.status === 'resolved').length} resolved).`
)
