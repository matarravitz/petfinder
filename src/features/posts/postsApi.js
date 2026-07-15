export async function listPosts(supabase) {
  const { data, error } = await supabase
    .from('posts')
    .select('*, post_photos(*), profiles(display_name)')
    .order('created_at', { ascending: false })
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
