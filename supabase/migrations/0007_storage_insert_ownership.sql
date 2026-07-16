-- Replaces the "authenticated users can upload post photos" policy from
-- 0002_storage.sql, which only checked auth.role() = 'authenticated' with
-- no ownership check — any signed-up user could write to any post's photo
-- folder. This scopes uploads to the caller actually owning the post whose
-- id is the object path's first segment (paths are always written as
-- `${post.id}/${file.name}`, see postsApi.js's createPost).
drop policy "authenticated users can upload post photos" on storage.objects;

create policy "owners can upload photos to their own posts" on storage.objects
  for insert with check (
    bucket_id = 'post-photos'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from posts
      where posts.id::text = (storage.foldername(name))[1]
        and posts.owner_id = auth.uid()
    )
  );
