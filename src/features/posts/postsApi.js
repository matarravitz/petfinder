// Ordered by bumped_at (not created_at) so a "bump to top" (see postBump.js)
// actually moves a post to the front — bumped_at defaults to created_at at
// insert time, so this is equivalent to created_at ordering until a post is
// ever bumped.
//
// Explicit column list (excluding photo_embedding) rather than select('*')
// — photo_embedding is a ~1024-number jsonb vector only needed by
// listCandidatePostsForMatching (see below), never read by Browse/PostCard,
// so including it here ships an unused, sizeable payload on every post row.
export const POST_LIST_COLUMNS =
  'id, owner_id, type, species, breed, color, size, collar, collar_description, microchipped, ' +
  'distinctive_markings, pet_name, reward_amount, phone_number, location_lat, location_lng, ' +
  'location_text, date_lost_or_found, status, created_at, renewed_at, bumped_at, ' +
  'post_photos(*), profiles(display_name)'

export async function listPosts(supabase) {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_LIST_COLUMNS)
    .order('bumped_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getPost(supabase, postId) {
  const { data, error } = await supabase
    .from('posts')
    .select('*, post_photos(*), profiles(display_name)')
    .eq('id', postId)
    .single()
  if (error) throw error
  return data
}

export async function createPost(supabase, payload, files) {
  const { data: post, error: postError } = await supabase
    .from('posts')
    .insert(payload)
    .select()
    .single()
  if (postError) throw postError

  for (const file of files) {
    const storagePath = `${post.id}/${file.name}`
    const { error: uploadError } = await supabase.storage.from('post-photos').upload(storagePath, file)
    if (uploadError) throw uploadError

    const { error: photoRowError } = await supabase
      .from('post_photos')
      .insert({ post_id: post.id, storage_path: storagePath })
    if (photoRowError) throw photoRowError
  }

  return post
}

export async function resolvePost(supabase, postId) {
  const { error } = await supabase.from('posts').update({ status: 'resolved' }).eq('id', postId)
  if (error) throw error
}

// Reads the post's photo storage paths before deleting the post (post_photos
// rows cascade-delete with the post — see supabase/migrations/0001_init.sql's
// `references posts(id) on delete cascade` — so they must be read first),
// then removes both the storage files and the post row. If the storage
// bucket has never had a photo for this post, storagePaths is empty and
// storage.remove([]) below is a harmless no-op call.
export async function deletePost(supabase, postId) {
  const { data: photos, error: photosError } = await supabase
    .from('post_photos')
    .select('storage_path')
    .eq('post_id', postId)
  if (photosError) throw photosError

  const storagePaths = (photos || []).map((photo) => photo.storage_path)
  if (storagePaths.length > 0) {
    const { error: removeError } = await supabase.storage.from('post-photos').remove(storagePaths)
    if (removeError) throw removeError
  }

  const { error } = await supabase.from('posts').delete().eq('id', postId)
  if (error) throw error
}

// Batched sibling of deletePost, used by MyPostsDashboard's lazy expiry
// sweep (see postExpiry.js) — deletes every id in one request instead of
// one deletePost call per expired post, both for efficiency and so a sweep
// with multiple expired posts either succeeds or fails as a single unit
// rather than partially succeeding across N parallel calls. Mirrors
// deletePost's storage-cleanup behavior (see its comment above), batched
// across all ids via .in() instead of one post at a time.
export async function deletePosts(supabase, postIds) {
  if (postIds.length === 0) return

  const { data: photos, error: photosError } = await supabase
    .from('post_photos')
    .select('storage_path')
    .in('post_id', postIds)
  if (photosError) throw photosError

  const storagePaths = (photos || []).map((photo) => photo.storage_path)
  if (storagePaths.length > 0) {
    const { error: removeError } = await supabase.storage.from('post-photos').remove(storagePaths)
    if (removeError) throw removeError
  }

  const { error } = await supabase.from('posts').delete().in('id', postIds)
  if (error) throw error
}

export async function listPostsByOwner(supabase, ownerId) {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_LIST_COLUMNS)
    .eq('owner_id', ownerId)
    .order('bumped_at', { ascending: false })
  if (error) throw error
  return data
}

// Resets the 2-month expiry window (see postExpiry.js) to start fresh from
// now — the response to an expiring-soon notification on MyPostsDashboard.
export async function renewPost(supabase, postId) {
  const { error } = await supabase.from('posts').update({ renewed_at: new Date().toISOString() }).eq('id', postId)
  if (error) throw error
}

// Moves a post to the top of Browse's default sort (see listPosts) by
// resetting bumped_at to now. Calls the bump_post() Postgres function
// (see supabase/migrations/0009_bump_cooldown_function.sql) rather than a
// plain update — the function enforces both ownership and the
// BUMP_COOLDOWN_HOURS cooldown (see postBump.js) server-side, so this can't
// be bypassed by calling the API directly. The client-side canBump() check
// still runs first (in MyPostsDashboard.jsx) purely for instant UI feedback
// (disabling the button) — this server-side check is the actual guarantee.
export async function bumpPost(supabase, postId) {
  const { error } = await supabase.rpc('bump_post', { post_id: postId })
  if (error) throw error
}

export async function listCandidatePostsForMatching(supabase, { type, species, excludePostId }) {
  const { data, error } = await supabase
    .from('posts')
    .select('*, post_photos(*), profiles(display_name)')
    .eq('type', type)
    .eq('species', species)
    .eq('status', 'active')
    .neq('id', excludePostId)
  if (error) throw error
  return data
}
