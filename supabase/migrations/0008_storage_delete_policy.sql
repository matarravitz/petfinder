-- No delete policy existed on storage.objects at all for the post-photos
-- bucket — not even the post's own owner could remove a photo file, even
-- though post_photos (the metadata table) already has an owner-scoped
-- delete policy. This adds the storage-level equivalent so deletePost() can
-- actually clean up files (see postsApi.js).
create policy "owners can delete photos on their own posts" on storage.objects
  for delete using (
    bucket_id = 'post-photos'
    and exists (
      select 1 from posts
      where posts.id::text = (storage.foldername(name))[1]
        and posts.owner_id = auth.uid()
    )
  );
