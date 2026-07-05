insert into storage.buckets (id, name, public)
values ('post-photos', 'post-photos', true)
on conflict (id) do nothing;

create policy "anyone can view post photos" on storage.objects
  for select using (bucket_id = 'post-photos');

create policy "authenticated users can upload post photos" on storage.objects
  for insert with check (bucket_id = 'post-photos' and auth.role() = 'authenticated');
