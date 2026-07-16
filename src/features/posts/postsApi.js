// Ordered by bumped_at (not created_at) so a "bump to top" (see postBump.js)
// actually moves a post to the front — bumped_at defaults to created_at at
// insert time, so this is equivalent to created_at ordering until a post is
// ever bumped.
export async function listPosts(supabase) {
  const { data, error } = await supabase
    .from('posts')
    .select('*, post_photos(*), profiles(display_name)')
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

// post_photos rows cascade-delete with the post (see supabase/migrations/0001_init.sql's
// `references posts(id) on delete cascade`); this does not remove the underlying files
// from the post-photos storage bucket.
export async function deletePost(supabase, postId) {
  const { error } = await supabase.from('posts').delete().eq('id', postId)
  if (error) throw error
}

export async function listPostsByOwner(supabase, ownerId) {
  const { data, error } = await supabase
    .from('posts')
    .select('*, post_photos(*), profiles(display_name)')
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
// resetting bumped_at to now — rate-limited client-side to once per
// BUMP_COOLDOWN_HOURS (see postBump.js).
export async function bumpPost(supabase, postId) {
  const { error } = await supabase.from('posts').update({ bumped_at: new Date().toISOString() }).eq('id', postId)
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
